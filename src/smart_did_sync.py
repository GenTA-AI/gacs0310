"""
smart_did_sync.py — 15-minute incremental sync: Smart DID → GACS
Owner: Varun

Responsibilities (per kickoff plan):
  - Smart DID API client (mock-swappable until sandbox access confirmed)
  - Change detection via IS DISTINCT FROM  (requires PostgreSQL 14+)
  - UPSERT into book_engagement
  - Write success/failure rows to did_sync_log

NOT owned here:
  - did_sync_log migration          → Pavan
  - book_engagement migration       → Pavan
  - Webhook receiver                → Pavan
  - Priority scoring (PG function)  → Pavan
  - Redis idempotency               → Pavan

Run directly:
    python -m src.smart_did_sync          # one-shot sync
    python -m src.smart_did_sync --dry-run

Via pipeline CLI (once run_pipeline.py is wired):
    python run_pipeline.py sync
    python run_pipeline.py sync --dry-run
"""

from __future__ import annotations

import argparse
import logging
import os
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class EngagementRecord:
    """
    One row of engagement data pulled from Smart DID.
    Maps to VideoRecord fields we care about for GACS prioritization.
    """
    book_id: str                        # Smart DID primary key (ALPAS ID space)
    request_count: int
    ranking_score: float
    last_requested_at: Optional[datetime]
    retry_count: int
    expires_at: Optional[datetime]
    cover_image_url: Optional[str]
    updated_at: datetime                # Smart DID's updatedAt — used as cursor


# ---------------------------------------------------------------------------
# API client (swappable interface)
# ---------------------------------------------------------------------------

class SmartDIDClient(ABC):
    """
    Abstract client — swap MockSmartDIDClient for RealSmartDIDClient
    once Pavan secures sandbox access (target: April 21).
    """

    @abstractmethod
    def fetch_updated_records(
        self,
        since: datetime,
    ) -> list[EngagementRecord]:
        """
        Return all VideoRecords updated after `since`.
        Implementations must handle pagination internally.
        """
        ...


class MockSmartDIDClient(SmartDIDClient):
    """
    Deterministic mock for local dev and CI.
    Returns a small fixed set of records regardless of `since`.
    Replace with RealSmartDIDClient once API access is confirmed.
    """

    def fetch_updated_records(self, since: datetime) -> list[EngagementRecord]:
        logger.info("[MOCK] Returning 3 fake engagement records (since=%s)", since)
        now = datetime.now(timezone.utc)
        return [
            EngagementRecord(
                book_id="alpas-001",
                request_count=42,
                ranking_score=0.87,
                last_requested_at=now,
                retry_count=0,
                expires_at=None,
                cover_image_url="https://example.com/cover1.jpg",
                updated_at=now,
            ),
            EngagementRecord(
                book_id="alpas-002",
                request_count=7,
                ranking_score=0.31,
                last_requested_at=None,
                retry_count=2,
                expires_at=None,
                cover_image_url=None,
                updated_at=now,
            ),
            EngagementRecord(
                book_id="alpas-003",
                request_count=120,
                ranking_score=0.95,
                last_requested_at=now,
                retry_count=0,
                expires_at=None,
                cover_image_url="https://example.com/cover3.jpg",
                updated_at=now,
            ),
        ]


class RealSmartDIDClient(SmartDIDClient):
    """
    Production client against Smart DID's REST API.
    Activate once Pavan secures sandbox/prod API access.

    Expected environment variables:
        SMART_DID_API_BASE_URL   e.g. https://api.smart-did.internal
        SMART_DID_API_KEY        Bearer token for authentication

    Expected Smart DID endpoint (to confirm with their team):
        GET /video-records?updatedAfter=<ISO8601>&page=<n>&limit=100

    If Smart DID does NOT support server-side filtering by updatedAt,
    set SMART_DID_FULL_DUMP=true and change detection happens client-side
    via IS DISTINCT FROM in the UPSERT — still correct, just less efficient.
    """

    def __init__(self) -> None:
        self.base_url = os.environ["SMART_DID_API_BASE_URL"].rstrip("/")
        self.api_key = os.environ["SMART_DID_API_KEY"]
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        })

    def fetch_updated_records(self, since: datetime) -> list[EngagementRecord]:
        records: list[EngagementRecord] = []
        page = 1

        while True:
            resp = self.session.get(
                f"{self.base_url}/video-records",
                params={
                    "updatedAfter": since.isoformat(),
                    "page": page,
                    "limit": 100,
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()

            batch = data.get("data", [])
            if not batch:
                break

            for row in batch:
                records.append(EngagementRecord(
                    book_id=row["bookId"],
                    request_count=row.get("requestCount", 0),
                    ranking_score=row.get("rankingScore", 0.0),
                    last_requested_at=_parse_dt(row.get("lastRequestedAt")),
                    retry_count=row.get("retryCount", 0),
                    expires_at=_parse_dt(row.get("expiresAt")),
                    cover_image_url=row.get("coverImageUrl"),
                    updated_at=_parse_dt(row["updatedAt"]),
                ))

            # Stop if this was the last page
            if len(batch) < 100:
                break
            page += 1

        logger.info("Fetched %d updated records from Smart DID (since=%s)", len(records), since)
        return records


# ---------------------------------------------------------------------------
# Sync engine
# ---------------------------------------------------------------------------

class IncrementalSyncJob:
    """
    Orchestrates one full sync cycle:
      1. Read last successful sync cursor from did_sync_log
      2. Fetch records updated since that cursor
      3. UPSERT into book_engagement using IS DISTINCT FROM
      4. Write result to did_sync_log
    """

    def __init__(
        self,
        db_conn: psycopg2.extensions.connection,
        client: SmartDIDClient,
        dry_run: bool = False,
    ) -> None:
        self.conn = db_conn
        self.client = client
        self.dry_run = dry_run

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(self) -> dict:
        """
        Execute one sync cycle. Returns a summary dict for logging/testing.
        """
        sync_type = "engagement"
        cursor = self._get_last_cursor(sync_type)
        logger.info("Starting incremental sync (cursor=%s, dry_run=%s)", cursor, self.dry_run)

        records = self.client.fetch_updated_records(since=cursor)

        if not records:
            logger.info("No new records since %s — nothing to do.", cursor)
            self._write_sync_log(sync_type, status="success", rows_written=0)
            return {"status": "success", "rows_fetched": 0, "rows_written": 0}

        rows_written = 0
        errors = []

        for record in records:
            try:
                written = self._upsert_engagement(record)
                if written:
                    rows_written += 1
            except Exception as exc:
                logger.error("Failed to upsert book_id=%s: %s", record.book_id, exc)
                errors.append(str(exc))

        if errors:
            self._write_sync_log(
                sync_type,
                status="failed",
                rows_written=rows_written,
                error_message=f"{len(errors)} upsert errors: {errors[0]}",
            )
            return {
                "status": "failed",
                "rows_fetched": len(records),
                "rows_written": rows_written,
                "errors": errors,
            }

        if not self.dry_run:
            self._write_sync_log(sync_type, status="success", rows_written=rows_written)
            self.conn.commit()
            logger.info("Sync complete — %d/%d rows written.", rows_written, len(records))
        else:
            self.conn.rollback()
            logger.info("[DRY RUN] Would write %d/%d rows — rolled back.", rows_written, len(records))

        return {
            "status": "success",
            "rows_fetched": len(records),
            "rows_written": rows_written,
        }

    # ------------------------------------------------------------------
    # Cursor management
    # ------------------------------------------------------------------

    def _get_last_cursor(self, sync_type: str) -> datetime:
        """
        Read the most recent successful sync timestamp from did_sync_log.
        Falls back to Unix epoch (full initial load) if no prior sync exists.
        """
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT synced_at
                FROM did_sync_log
                WHERE sync_type = %s
                  AND status = 'success'
                ORDER BY synced_at DESC
                LIMIT 1
                """,
                (sync_type,),
            )
            row = cur.fetchone()

        if row:
            return row[0]

        # First ever run — pull everything
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        logger.info("No prior sync found for type=%s — using epoch cursor %s", sync_type, epoch)
        return epoch

    # ------------------------------------------------------------------
    # UPSERT with IS DISTINCT FROM  (PostgreSQL 14+ required)
    # ------------------------------------------------------------------

    def _upsert_engagement(self, r: EngagementRecord) -> bool:
        """
        Insert or update book_engagement only if data actually changed.
        IS DISTINCT FROM treats NULL correctly (NULL != NULL is false here).
        Returns True if a row was written, False if skipped (no change).
        """
        sql = """
            INSERT INTO book_engagement (
                book_id,
                source_system,
                request_count,
                ranking_score,
                last_requested_at,
                synced_at,
                updated_at
            ) VALUES (
                %s, 'smart_did', %s, %s, %s, now(), now()
            )
            ON CONFLICT (book_id) DO UPDATE
                SET
                    request_count     = EXCLUDED.request_count,
                    ranking_score     = EXCLUDED.ranking_score,
                    last_requested_at = EXCLUDED.last_requested_at,
                    synced_at         = now(),
                    updated_at        = now()
                WHERE
                    (
                        book_engagement.request_count,
                        book_engagement.ranking_score,
                        book_engagement.last_requested_at
                    ) IS DISTINCT FROM (
                        EXCLUDED.request_count,
                        EXCLUDED.ranking_score,
                        EXCLUDED.last_requested_at
                    )
            RETURNING book_id
        """
        with self.conn.cursor() as cur:
            cur.execute(sql, (
                r.book_id,
                r.request_count,
                r.ranking_score,
                r.last_requested_at,
            ))
            return cur.fetchone() is not None  # None → no change, skipped

    # ------------------------------------------------------------------
    # Sync log
    # ------------------------------------------------------------------

    def _write_sync_log(
        self,
        sync_type: str,
        status: str,
        rows_written: int,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Write one row to did_sync_log (migration owned by Pavan).
        """
        if self.dry_run:
            logger.info("[DRY RUN] Skipping sync log write (status=%s)", status)
            return

        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO did_sync_log (
                    log_id,
                    source_system,
                    sync_type,
                    status,
                    rows_written,
                    error_message,
                    synced_at
                ) VALUES (
                    %s, 'smart_did', %s, %s, %s, %s, now()
                )
                """,
                (
                    str(uuid.uuid4()),
                    sync_type,
                    status,
                    rows_written,
                    error_message,
                ),
            )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _get_db_connection() -> psycopg2.extensions.connection:
    """
    Connect using DATABASE_URL env var.
    Expected format: postgresql://user:password@host:5432/dbname
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is not set.")
    conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    return conn


def _get_client(use_mock: bool) -> SmartDIDClient:
    if use_mock:
        logger.info("Using MockSmartDIDClient (sandbox access not yet confirmed)")
        return MockSmartDIDClient()
    return RealSmartDIDClient()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    )

    parser = argparse.ArgumentParser(description="Smart DID → GACS incremental sync")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and compute diffs but do not commit to DB",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        default=os.environ.get("SMART_DID_USE_MOCK", "true").lower() == "true",
        help="Use mock API client (default: true until sandbox access confirmed)",
    )
    args = parser.parse_args()

    conn = _get_db_connection()
    client = _get_client(use_mock=args.mock)

    try:
        job = IncrementalSyncJob(conn=conn, client=client, dry_run=args.dry_run)
        result = job.run()
        logger.info("Result: %s", result)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
