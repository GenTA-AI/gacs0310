ALTER TABLE video_jobs
    DROP COLUMN IF EXISTS priority_score_at_creation,
    DROP COLUMN IF EXISTS triggered_by;