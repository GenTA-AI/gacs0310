/* Drift detection fingerprints for Smart DID sync */
CREATE TABLE book_sync_fingerprints (
  id BIGSERIAL PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  external_book_id VARCHAR(255) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_book_sync_fingerprints_external UNIQUE(external_book_id)
);

CREATE INDEX idx_book_sync_fingerprints_book_id ON book_sync_fingerprints(book_id);
CREATE INDEX idx_book_sync_fingerprints_external ON book_sync_fingerprints(external_book_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON book_sync_fingerprints TO gacs_user;
GRANT USAGE ON SEQUENCE book_sync_fingerprints_id_seq TO gacs_user;
