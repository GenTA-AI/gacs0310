CREATE TABLE IF NOT EXISTS audience_validation (
    validation_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id                 UUID NOT NULL REFERENCES books(book_id),
    fact_id                 UUID NOT NULL REFERENCES book_facts(fact_id),
    ai_predicted_audience   VARCHAR(200),
    did_age_group           VARCHAR(50),
    agreement_score         NUMERIC(4,3),
    reviewed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audience_validation_book_id ON audience_validation(book_id);