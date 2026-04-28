CREATE TABLE IF NOT EXISTS did_sync_log (
    log_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type       VARCHAR(20) NOT NULL CHECK (sync_type IN ('webhook','incremental','full','manual')),
    event_type      VARCHAR(50),
    book_id         UUID REFERENCES books(book_id),
    status          VARCHAR(10) NOT NULL CHECK (status IN ('success','failed','skipped')),
    idempotency_key VARCHAR(200) UNIQUE,
    rows_affected   INT DEFAULT 0,
    error_message   TEXT,
    payload_json    JSONB,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_did_sync_log_synced_at ON did_sync_log(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_did_sync_log_book_id   ON did_sync_log(book_id) WHERE book_id IS NOT NULL;