import { Worker } from 'bullmq';
import * as ort from 'onnxruntime-node';
import fs from 'fs';
import path from 'path';
import redis from '../queue/redis.client.js';
import pool from '../db/client.js';

export const QUEUE_NAME = process.env.INFERENCE_QUEUE_NAME || 'ml-inference';

const MODEL_PATH = process.env.MODEL_PATH || 'data/models/ml';
const MODEL_FILE = 'model.onnx';

function resolveModelPath() {
  const full = path.resolve(MODEL_PATH, MODEL_FILE);
  if (!fs.existsSync(full)) return null;
  return full;
}

async function loadModel() {
  const modelPath = resolveModelPath();
  if (!modelPath) return null;
  return ort.InferenceSession.create(modelPath);
}

function extractFeatureVector(row) {
  const f = row.features;
  return [
    f.request_count ?? 0,
    f.ranking_score ?? 0,
    f.request_count_decayed ?? 0,
    f.generation_priority_score ?? 0,
    f.score_freshness_hours ?? 0,
    f.snapshot_request_count_7d ?? 0,
    f.snapshot_request_count_30d ?? 0,
    f.snapshot_ranking_avg_30d ?? 0,
    f.snapshot_count_90d ?? 0,
    f.last_snapshot_hours_ago ?? 0,
    f.video_retry_count ?? 0,
    f.video_has_error ? 1 : 0,
    f.video_expires_hours ?? 0,
    f.scenario_priority ?? 0,
    f.scenario_has_error ? 1 : 0,
    f.scenario_count ?? 0,
    f.video_job_priority_score ?? 0,
    f.job_did_request_retries ?? 0,
    f.job_expires_hours ?? 0,
    f.job_retry_count ?? 0,
    f.job_starvation_days ?? 0,
    f.agreement_score ?? 0,
    f.validator_count ?? 0,
    f.sync_success_rate_7d ?? 0,
    f.sync_record_count_30d ?? 0,
    f.sync_total_errors_7d ?? 0,
    f.sync_source_webhook_ratio ?? 0,
    f.hours_since_last_sync ?? 0,
    f.payload_hash_changed ? 1 : 0,
    f.engagement_type_count ?? 0,
    f.distinct_engagement_users ?? 0,
  ];
}

async function runInference() {
  const modelPath = resolveModelPath();
  if (!modelPath) {
    return { status: 'skipped', reason: 'model_not_found', path: MODEL_PATH };
  }

  const session = await loadModel();
  if (!session) {
    return { status: 'skipped', reason: 'model_load_failed' };
  }

  const { rows } = await pool.query(
    `SELECT mf.id AS feature_id, mf.book_id, mf.features
       FROM ml_book_features mf
       JOIN video_jobs vj ON vj.book_id = mf.book_id
       LEFT JOIN LATERAL (
         SELECT id FROM ml_prediction_log
          WHERE book_id = mf.book_id
            AND model_version = $1
          ORDER BY inference_timestamp DESC
          LIMIT 1
       ) pl ON TRUE
      WHERE vj.status IN ('pending', 'active')
        AND pl.id IS NULL
      ORDER BY mf.book_id`,
    [process.env.MODEL_VERSION || '0.1.0'],
  );

  if (rows.length === 0) {
    return { status: 'ok', reason: 'no_unscheduled_books' };
  }

  const modelVersion = process.env.MODEL_VERSION || '0.1.0';
  const client = await pool.connect();
  let predicted = 0;

  try {
    for (const row of rows) {
      const inputTensor = new ort.Tensor('float32', new Float32Array(extractFeatureVector(row)), [1, 31]);
      const results = await session.run({ input: inputTensor });
      const score = results.score.data[0];

      await client.query(
        `INSERT INTO ml_prediction_log
           (book_id, model_version, predicted_priority_score, feature_vector_id, inference_timestamp)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [row.book_id, modelVersion, score, row.feature_id],
      );
      predicted++;
    }

    return { status: 'ok', predicted, modelVersion };
  } finally {
    client.release();
  }
}

export function buildInferenceWorker() {
  return new Worker(
    QUEUE_NAME,
    async () => runInference(),
    {
      connection: redis,
      concurrency: 1,
      lockDuration: 300000,
    },
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = buildInferenceWorker();

  worker.on('completed', (job, result) => {
    console.log('[inference] completed', { jobId: job?.id, result });
  });

  worker.on('failed', (job, error) => {
    console.error('[inference] failed', { jobId: job?.id, error: error.message });
  });
}
