#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs';
import pool from '../src/db/client.js';

const OUTPUT = process.env.TRAINING_DATA_PATH || 'data/training_data.csv';

async function main() {
  const { rows } = await pool.query(
    `SELECT
       mf.book_id,
       mf.features,
       mf.computed_at,
       vj.priority_score AS actual_priority_score,
       pl.predicted_priority_score,
       pl.model_version
     FROM ml_book_features mf
     LEFT JOIN video_jobs vj ON vj.book_id = mf.book_id
     LEFT JOIN ml_prediction_log pl ON pl.feature_vector_id = mf.id
    WHERE vj.status IN ('completed', 'failed')
      AND vj.priority_score IS NOT NULL
    ORDER BY mf.computed_at DESC`,
  );

  if (rows.length === 0) {
    console.log('No training data found. Run feature computation + inference first.');
    return;
  }

  const featureNames = new Set();
  rows.forEach(r => {
    if (r.features) Object.keys(r.features).forEach(k => featureNames.add(k));
  });
  const sortedFeatures = Array.from(featureNames).sort();

  const header = ['book_id', ...sortedFeatures, 'actual_priority_score', 'predicted_priority_score', 'model_version'];
  const lines = [header.join(',')];

  for (const row of rows) {
    const vals = [row.book_id];
    for (const f of sortedFeatures) {
      const v = row.features?.[f];
      vals.push(v == null ? '' : String(v));
    }
    vals.push(row.actual_priority_score ?? '');
    vals.push(row.predicted_priority_score ?? '');
    vals.push(row.model_version ?? '');
    lines.push(vals.join(','));
  }

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf-8');
  console.log(`Exported ${rows.length} training rows to ${OUTPUT}`);
}

main().catch((error) => {
  console.error('[ml-export] failed');
  console.error(error);
  process.exitCode = 1;
});
