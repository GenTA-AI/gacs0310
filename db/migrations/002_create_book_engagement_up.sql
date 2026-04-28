CREATE TABLE IF NOT EXISTS book_engagement (
    engagement_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id                     UUID NOT NULL REFERENCES books(book_id),
    did_request_count           INT          NOT NULL DEFAULT 0,
    did_ranking_score           NUMERIC(6,4) NOT NULL DEFAULT 0.0,
    did_last_requested_at       TIMESTAMPTZ,
    did_retry_count             SMALLINT     NOT NULL DEFAULT 0,
    did_status                  VARCHAR(20)  CHECK (did_status IN ('NONE','REQUESTED','PROCESSING','DONE','ERROR')),
    did_expires_at              TIMESTAMPTZ,
    shelf_code                  VARCHAR(50),
    shelf_map_x                 NUMERIC(9,4),
    shelf_map_y                 NUMERIC(9,4),
    librarian_age_group         VARCHAR(50),
    librarian_sort_order        INT,
    generation_priority_score   NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    did_request_count_decayed   NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    score_last_refreshed_at     TIMESTAMPTZ,
    last_synced_from_did        TIMESTAMPTZ,
    sync_version                INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT book_engagement_book_id_unique UNIQUE (book_id),
    CONSTRAINT chk_request_count_non_negative CHECK (did_request_count >= 0),
    CONSTRAINT chk_retry_count_non_negative   CHECK (did_retry_count >= 0),
    CONSTRAINT chk_ranking_score_range        CHECK (did_ranking_score BETWEEN 0.0 AND 1.0)
);

CREATE INDEX IF NOT EXISTS idx_book_engagement_book_id  ON book_engagement(book_id);
CREATE INDEX IF NOT EXISTS idx_book_engagement_priority ON book_engagement(generation_priority_score DESC) WHERE did_status IS DISTINCT FROM 'DONE';
CREATE INDEX IF NOT EXISTS idx_book_engagement_expires  ON book_engagement(did_expires_at ASC) WHERE did_expires_at IS NOT NULL;