/* Reserve migration slot and document ML-relevant columns on existing tables */
/* This migration does not create new tables — it annotates existing ones for ML feature discovery */

COMMENT ON TABLE book_did_engagement IS
  'Core engagement signals: request_count (demand volume), ranking_score (relevance 0-1), '
  'request_count_decayed (exponential decay with 30-day half-life), '
  'generation_priority_score (composite: 40% decayed_request + 30% ranking + 15% retry + 10% expiry + 5% starvation)';

COMMENT ON TABLE book_engagement_snapshots IS
  'Time-series engagement snapshots captured async per webhook event. '
  'Supports rolling window aggregations (7d/30d/90d) over request_count and ranking_score';

COMMENT ON TABLE smart_did_video_state IS
  'Current video state from Smart DID: status, urls, retry_count, error_message. '
  'Feature source for video status encoding and retry signal';

COMMENT ON TABLE book_recommendation_segments IS
  'Recommendation context: age_group and sort_order per book. '
  'Feature source for categorical recommendation features';

COMMENT ON TABLE book_video_scenarios IS
  'Video scenario configuration: scenario_type, state, priority. '
  'Feature source for scenario type encoding and state machine features';

COMMENT ON TABLE did_sync_log IS
  'Sync audit trail: status, record_count, error_details. '
  'Feature source for sync quality signals (freshness, error rate, consistency)';

COMMENT ON TABLE video_jobs IS
  'Video generation jobs: priority_score, did_request_retries, expires_at, status. '
  'Feature source for job priority, retry urgency, and expiry signals';

COMMENT ON TABLE audience_validation IS
  'Audience validation: agreement_score, validator_count per label. '
  'Feature source for quality and consensus signals';

COMMENT ON TABLE book_sync_fingerprints IS
  'Drift detection: payload_hash for change tracking. '
  'Feature source for data freshness and drift-rate signals';
