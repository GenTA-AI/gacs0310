import { Worker } from 'bullmq';
import * as ort from 'onnxruntime-node';
import fs from 'fs';
import path from 'path';
import redis from '../queue/redis.client.js';
import pool from '../db/client.js';

export const QUEUE_NAME = process.env.INFERENCE_QUEUE_NAME || 'ml-inference';

const MODEL_PATH = process.env.MODEL_PATH || 'data/models/ml';
const MODEL_FILE = process.env.MODEL_FILE || 'latest.onnx';
const FEATURE_ORDER_FILE = process.env.FEATURE_ORDER_FILE || 'latest.features.json';

function resolveModelPath() {
  const fullPath = path.resolve(MODEL_PATH, MODEL_FILE);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

function resolveFeatureOrderPath() {
  const fullPath = path.resolve(MODEL_PATH, FEATURE_ORDER_FILE);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

function getModelVersion() {
  if (process.env.MODEL_VERSION) return process.env.MODEL_VERSION;

  const metadataPath = path.resolve(MODEL_PATH, 'latest.metadata.json');
  if (!fs.existsSync(metadataPath)) return 'unknown';

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  return metadata.model_version || 'unknown';
}

function loadFeatureOrder() {
  const featureOrderPath = resolveFeatureOrderPath();

  if (!featureOrderPath) {
    throw new Error(`Feature order file not found: ${path.resolve(MODEL_PATH, FEATURE_ORDER_FILE)}`);
  }

  return JSON.parse(fs.readFileSync(featureOrderPath, 'utf8'));
}

async function loadModel() {
  const modelPath = resolveModelPath();
  if (!modelPath) return null;
  return ort.InferenceSession.create(modelPath);
}

function coerceFeatureValue(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function extractFeatureVector(row, featureOrder) {
  const featureVector = row.feature_vector || {};
  return featureOrder.map((featureName) => coerceFeatureValue(featureVector[featureName]));
}

function readPredictionScore(results) {
  if (results.score?.data?.length > 0) {
    return Number(results.score.data[0]);
  }

  const firstOutputName = Object.keys(results)[0];
  if (!firstOutputName || !results[firstOutputName]?.data?.length) {
    throw new Error('ONNX model returned no prediction output');
  }

  return Number(results[firstOutputName].data[0]);
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

  const featureOrder = loadFeatureOrder();
  const modelVersion = getModelVersion();

  const { rows } = await pool.query(
    `SELECT mf.id AS feature_id,
            mf.book_id,
            mf.feature_vector
       FROM ml_book_features mf
       JOIN video_jobs vj ON vj.book_id = mf.book_id
       LEFT JOIN LATERAL (
         SELECT id
           FROM ml_prediction_log
          WHERE book_id = mf.book_id
            AND model_version = $1
          ORDER BY inferred_at DESC
          LIMIT 1
       ) pl ON TRUE
      WHERE vj.status IN ('pending', 'active')
        AND pl.id IS NULL
      ORDER BY mf.book_id`,
    [modelVersion],
  );

  if (rows.length === 0) {
    return { status: 'ok', reason: 'no_unscheduled_books' };
  }

  const client = await pool.connect();
  let predicted = 0;

  try {
    for (const row of rows) {
      const inputValues = extractFeatureVector(row, featureOrder);
      const inputTensor = new ort.Tensor('float32', new Float32Array(inputValues), [1, inputValues.length]);
      const results = await session.run({ input: inputTensor });
      const predictionScore = readPredictionScore(results);

      await client.query(
        `INSERT INTO ml_prediction_log
           (book_id, model_version, prediction_score, confidence, features_snapshot, inferred_at)
         VALUES
           ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)`,
        [
          row.book_id,
          modelVersion,
          predictionScore,
          1.0,
          JSON.stringify(row.feature_vector),
        ],
      );

      predicted++;
    }

    return { status: 'ok', predicted, modelVersion };
  } catch (err) {
    console.error('[inference] run error:', err.message);
    return { status: 'error_logged', error: err.message, predicted };
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