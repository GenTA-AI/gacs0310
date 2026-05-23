/* Materialized ML feature vector table — single JSONB column per book_id per computation run */
/* Features are derived from source tables (book_did_engagement, smart_did_video_state, etc.) via FeatureComputationService */

CREATE TABLE ml_book_features (
  id BIGSERIAL PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  features JSONB NOT NULL,
  feature_version VARCHAR(32) NOT NULL DEFAULT '0.1.0',
  computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ml_book_features_book_id ON ml_book_features(book_id);
CREATE INDEX idx_ml_book_features_computed_at ON ml_book_features(computed_at DESC);
CREATE INDEX idx_ml_book_features_feature_version ON ml_book_features(feature_version);

GRANT SELECT, INSERT, UPDATE, DELETE ON ml_book_features TO gacs_user;
GRANT USAGE ON SEQUENCE ml_book_features_id_seq TO gacs_user;
