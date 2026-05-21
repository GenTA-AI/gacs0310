ALTER TABLE did_sync_log DROP COLUMN IF EXISTS cursor_updated_at;
ALTER TABLE did_sync_log DROP COLUMN IF EXISTS source;
ALTER TABLE did_sync_log DROP COLUMN IF EXISTS error_details;
ALTER TABLE did_sync_log DROP COLUMN IF EXISTS record_count;
