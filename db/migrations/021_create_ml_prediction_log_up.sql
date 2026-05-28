/*
Create ML prediction audit log.

Each row records one model prediction, the model version, the feature snapshot used
for inference, and the eventual actual priority score once feedback is available.
*/

CREATE TABLE ml_prediction_log (
  id BIGSERIAL PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  model_version VARCHAR(32) NOT NULL,
  prediction_score NUMERIC(12,5) NOT NULL,
  confidence NUMERIC(6,4) NOT NULL DEFAULT 1.0000,
  features_snapshot JSONB NOT NULL,
  actual_priority_score NUMERIC(12,5),
  inferred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_ml_prediction_log_features_object CHECK (jsonb_typeof(features_snapshot) = 'object'),
  CONSTRAINT chk_ml_prediction_log_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_ml_prediction_log_book_inferred
  ON ml_prediction_log(book_id, inferred_at DESC);

CREATE INDEX idx_ml_prediction_log_model_version
  ON ml_prediction_log(model_version);

CREATE INDEX idx_ml_prediction_log_actual_null
  ON ml_prediction_log(book_id)
  WHERE actual_priority_score IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON ml_prediction_log TO gacs_user;
GRANT USAGE ON SEQUENCE ml_prediction_log_id_seq TO gacs_user;