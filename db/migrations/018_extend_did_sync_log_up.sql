/* Extend did_sync_log with additional tracking columns */
ALTER TABLE did_sync_log ADD COLUMN IF NOT EXISTS record_count INT DEFAULT 0;
ALTER TABLE did_sync_log ADD COLUMN IF NOT EXISTS error_details TEXT;
ALTER TABLE did_sync_log ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'webhook';
ALTER TABLE did_sync_log ADD COLUMN IF NOT EXISTS cursor_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_did_sync_log_source ON did_sync_log(source);
CREATE INDEX IF NOT EXISTS idx_did_sync_log_cursor ON did_sync_log(cursor_updated_at);
