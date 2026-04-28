DROP INDEX IF EXISTS idx_books_alpas_book_id;
ALTER TABLE books
    DROP COLUMN IF EXISTS alpas_book_id,
    DROP COLUMN IF EXISTS target_audience_did,
    DROP COLUMN IF EXISTS did_category;