ALTER TABLE video_jobs
    ADD COLUMN IF NOT EXISTS priority_score_at_creation NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(30)
        CHECK (triggered_by IN ('manual','webhook','did_request','scheduler'));