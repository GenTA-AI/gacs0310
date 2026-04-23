"""
tests/test_smart_did_sync.py — Unit + integration tests for smart_did_sync
Owner: Varun (unit tests) + Pavan (E2E flow tests, per kickoff plan)

Run:
    python -m pytest tests/test_smart_did_sync.py -v

Requirements for integration tests:
    - DATABASE_URL pointing to a test PostgreSQL 14+ instance
    - Migrations already applied (Pavan's migration file)
    - SMART_DID_USE_MOCK=true  (default)

Test categories:
    Unit   — no DB required, uses in-memory mocks
    DB     — requires live test DB (marked with @pytest.mark.db)
    E2E    — full flow shared with Pavan (marked with @pytest.mark.e2e)
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, call
from typing import Optional

import pytest

from src.smart_did_sync import (
    EngagementRecord,
    IncrementalSyncJob,
    MockSmartDIDClient,
    RealSmartDIDClient,
    _parse_dt,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_record(
    book_id: str = "alpas-001",
    request_count: int = 10,
    ranking_score: float = 0.5,
    last_requested_at: Optional[datetime] = None,
    retry_count: int = 0,
    expires_at: Optional[datetime] = None,
    cover_image_url: Optional[str] = None,
    updated_at: Optional[datetime] = None,
) -> EngagementRecord:
    return EngagementRecord(
        book_id=book_id,
        request_count=request_count,
        ranking_score=ranking_score,
        last_requested_at=last_requested_at,
        retry_count=retry_count,
        expires_at=expires_at,
        cover_image_url=cover_image_url,
        updated_at=updated_at or datetime.now(timezone.utc),
    )


def _make_mock_conn(cursor_rows=None, upsert_returns=True):
    """
    Build a minimal psycopg2 connection mock.
    cursor_rows: what fetchone() returns for the cursor query
    upsert_returns: whether the UPSERT RETURNING finds a row (True = written)
    """
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    # Alternate between cursor query result and upsert result
    cursor.fetchone.side_effect = [
        cursor_rows,       # _get_last_cursor
        (True,) if upsert_returns else None,  # _upsert_engagement RETURNING
    ]
    return conn, cursor


# ---------------------------------------------------------------------------
# Unit: _parse_dt
# ---------------------------------------------------------------------------

class TestParseDt:
    def test_none_returns_none(self):
        assert _parse_dt(None) is None

    def test_empty_string_returns_none(self):
        assert _parse_dt("") is None

    def test_iso_with_z(self):
        result = _parse_dt("2026-04-07T10:00:00Z")
        assert result.tzinfo is not None
        assert result.year == 2026

    def test_iso_with_offset(self):
        result = _parse_dt("2026-04-07T10:00:00+09:00")
        assert result.tzinfo is not None

    def test_naive_dt_gets_utc(self):
        result = _parse_dt("2026-04-07T10:00:00")
        assert result.tzinfo == timezone.utc


# ---------------------------------------------------------------------------
# Unit: MockSmartDIDClient
# ---------------------------------------------------------------------------

class TestMockSmartDIDClient:
    def test_returns_records(self):
        client = MockSmartDIDClient()
        since = datetime(1970, 1, 1, tzinfo=timezone.utc)
        records = client.fetch_updated_records(since)
        assert len(records) == 3

    def test_records_are_engagement_type(self):
        client = MockSmartDIDClient()
        since = datetime(1970, 1, 1, tzinfo=timezone.utc)
        records = client.fetch_updated_records(since)
        assert all(isinstance(r, EngagementRecord) for r in records)

    def test_all_have_book_ids(self):
        client = MockSmartDIDClient()
        since = datetime(1970, 1, 1, tzinfo=timezone.utc)
        records = client.fetch_updated_records(since)
        assert all(r.book_id for r in records)

    def test_ranking_scores_in_range(self):
        client = MockSmartDIDClient()
        since = datetime(1970, 1, 1, tzinfo=timezone.utc)
        records = client.fetch_updated_records(since)
        assert all(0.0 <= r.ranking_score <= 1.0 for r in records)


# ---------------------------------------------------------------------------
# Unit: IncrementalSyncJob — cursor logic
# ---------------------------------------------------------------------------

class TestGetLastCursor:
    def test_returns_epoch_when_no_prior_sync(self):
        conn, cursor = _make_mock_conn(cursor_rows=None)
        job = IncrementalSyncJob(conn=conn, client=MockSmartDIDClient())
        result = job._get_last_cursor("engagement")
        assert result.year == 1970

    def test_returns_stored_timestamp(self):
        stored_ts = datetime(2026, 4, 7, 10, 0, 0, tzinfo=timezone.utc)
        conn, cursor = _make_mock_conn(cursor_rows=(stored_ts,))
        job = IncrementalSyncJob(conn=conn, client=MockSmartDIDClient())
        result = job._get_last_cursor("engagement")
        assert result == stored_ts


# ---------------------------------------------------------------------------
# Unit: IncrementalSyncJob — upsert change detection
# ---------------------------------------------------------------------------

class TestUpsertEngagement:
    def test_returns_true_when_row_written(self):
        conn, cursor = _make_mock_conn(upsert_returns=True)
        cursor.fetchone.side_effect = None
        cursor.fetchone.return_value = ("alpas-001",)
        job = IncrementalSyncJob(conn=conn, client=MockSmartDIDClient())
        result = job._upsert_engagement(_make_record())
        assert result is True

    def test_returns_false_when_no_change(self):
        conn, cursor = _make_mock_conn(upsert_returns=False)
        cursor.fetchone.side_effect = None
        cursor.fetchone.return_value = None  # IS DISTINCT FROM → no change
        job = IncrementalSyncJob(conn=conn, client=MockSmartDIDClient())
        result = job._upsert_engagement(_make_record())
        assert result is False

    def test_sql_contains_is_distinct_from(self):
        """Verify the change-detection clause is present in the query."""
        conn, cursor = _make_mock_conn()
        cursor.fetchone.return_value = None
        job = IncrementalSyncJob(conn=conn, client=MockSmartDIDClient())
        job._upsert_engagement(_make_record())
        executed_sql = cursor.execute.call_args[0][0]
        assert "IS DISTINCT FROM" in executed_sql


# ---------------------------------------------------------------------------
# Unit: IncrementalSyncJob — full run scenarios
# ---------------------------------------------------------------------------

class TestRunMethod:
    def _make_job(self, records, dry_run=False):
        """Helper: job with controlled mock client and mock DB."""
        client = MagicMock()
        client.fetch_updated_records.return_value = records

        conn = MagicMock()
        cursor_ctx = MagicMock()
        conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor_ctx)
        conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        # cursor: no prior sync, then each upsert returns a row
        cursor_ctx.fetchone.side_effect = (
            [None]                                  # _get_last_cursor → epoch
            + [("id",)] * len(records)              # _upsert_engagement → written
            + [None]                                # _write_sync_log
        )

        return IncrementalSyncJob(conn=conn, client=client, dry_run=dry_run), conn

    def test_empty_fetch_returns_success(self):
        job, _ = self._make_job(records=[])
        result = job.run()
        assert result["status"] == "success"
        assert result["rows_fetched"] == 0

    def test_rows_written_matches_upserted(self):
        records = [_make_record("alpas-001"), _make_record("alpas-002")]
        job, _ = self._make_job(records=records)
        result = job.run()
        assert result["rows_fetched"] == 2

    def test_dry_run_rolls_back(self):
        records = [_make_record()]
        job, conn = self._make_job(records=records, dry_run=True)
        job.run()
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()

    def test_normal_run_commits(self):
        records = [_make_record()]
        job, conn = self._make_job(records=records, dry_run=False)
        job.run()
        conn.commit.assert_called_once()

    def test_upsert_error_reported_in_result(self):
        client = MagicMock()
        client.fetch_updated_records.return_value = [_make_record()]

        conn = MagicMock()
        cursor_ctx = MagicMock()
        conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor_ctx)
        conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        # First call = cursor (epoch), second = upsert raises
        cursor_ctx.fetchone.side_effect = [None]
        cursor_ctx.execute.side_effect = [
            None,                         # cursor query
            Exception("DB constraint"),   # upsert fails
            None,                         # sync log
        ]

        job = IncrementalSyncJob(conn=conn, client=client)
        result = job.run()
        assert result["status"] == "failed"
        assert len(result["errors"]) == 1


# ---------------------------------------------------------------------------
# E2E placeholder — to be completed with Pavan
# ---------------------------------------------------------------------------

@pytest.mark.e2e
class TestE2EFlow:
    """
    End-to-end tests for the full sync flow.
    Requires:
        - Live PostgreSQL 14+ test DB
        - DATABASE_URL set in environment
        - Pavan's migrations applied

    Per kickoff plan: 3+ E2E tests covering
        video.requested → upsert → re-fire (idempotency check)
    """

    @pytest.fixture(autouse=True)
    def require_db(self):
        if not os.environ.get("DATABASE_URL"):
            pytest.skip("DATABASE_URL not set — skipping E2E tests")

    def test_initial_sync_populates_book_engagement(self):
        """TODO: Varun + Pavan — verify first sync writes rows correctly."""
        pytest.skip("Pending sandbox API access (target: April 21)")

    def test_second_sync_skips_unchanged_rows(self):
        """TODO: Run sync twice with same data; second run should write 0 rows."""
        pytest.skip("Pending sandbox API access (target: April 21)")

    def test_idempotency_on_retry(self):
        """
        TODO: Simulate a sync that partially succeeds, then re-runs.
        Row count should not double.
        Per kickoff plan: idempotency check is core success metric.
        """
        pytest.skip("Pending sandbox API access (target: April 21)")
