/*
Create materialized ML feature vector table.

One row stores the latest computed feature vector for a book and feature version.
Feature vectors are computed from Smart DID + GACS source tables by FeatureComputationService.
*/

CREATE TABLE ml_book_features (
  id BIGSERIAL PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  feature_vector JSONB NOT NULL,
  feature_version VARCHAR(32) NOT NULL DEFAULT '0.1.0',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_ml_book_features_book_version UNIQUE(book_id, feature_version),
  CONSTRAINT chk_ml_book_features_vector_object CHECK (jsonb_typeof(feature_vector) = 'object')
);

CREATE INDEX idx_ml_book_features_book_id ON ml_book_features(book_id);
CREATE INDEX idx_ml_book_features_computed_at ON ml_book_features(computed_at DESC);
CREATE INDEX idx_ml_book_features_feature_version ON ml_book_features(feature_version);

GRANT SELECT, INSERT, UPDATE, DELETE ON ml_book_features TO gacs_user;
GRANT USAGE ON SEQUENCE ml_book_features_id_seq TO gacs_user;