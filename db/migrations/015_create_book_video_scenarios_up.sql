/*
Create book_video_scenarios table.

This table stores Smart DID video scenario generation data per book.
Unlike scene_results (which stores per-job deterministic outputs),
this stores Smart DID's recommendations for what video scenarios
to generate for each book (e.g., mood-based, educational, storytelling).

Smart DID contributes engagement signals and scenario recommendations
here. Canonical book metadata stays in the books table and is NEVER
overwritten by Smart DID data.
*/

CREATE TABLE IF NOT EXISTS book_video_scenarios (
    id BIGSERIAL PRIMARY KEY,
    book_id UUID NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    scenario_type VARCHAR(50) NOT NULL,
    state VARCHAR(30) NOT NULL DEFAULT 'pending',
    priority INT NOT NULL DEFAULT 0,
    request_payload JSONB,
    response_payload JSONB,
    error_message TEXT,
    external_id VARCHAR(200),
    requested_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_book_scenario_type UNIQUE (book_id, scenario_type),
    CONSTRAINT ck_book_video_scenarios_state CHECK (
        state IN ('pending', 'processing', 'completed', 'failed', 'skipped')
    )
);

CREATE INDEX idx_book_video_scenarios_book_id
    ON book_video_scenarios(book_id);
CREATE INDEX idx_book_video_scenarios_state
    ON book_video_scenarios(state);
CREATE INDEX idx_book_video_scenarios_priority
    ON book_video_scenarios(priority DESC);
CREATE INDEX idx_book_video_scenarios_external_id
    ON book_video_scenarios(external_id);
CREATE INDEX idx_book_video_scenarios_created_at
    ON book_video_scenarios(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON book_video_scenarios TO gacs_user;
GRANT USAGE, SELECT ON SEQUENCE book_video_scenarios_id_seq TO gacs_user;
