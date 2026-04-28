ALTER TABLE books
    ADD COLUMN IF NOT EXISTS alpas_book_id        VARCHAR(100) UNIQUE,
    ADD COLUMN IF NOT EXISTS target_audience_did  VARCHAR(50),
    ADD COLUMN IF NOT EXISTS did_category         VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_books_alpas_book_id ON books(alpas_book_id);