#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import pool from '../src/db/client.js';

function parseArgs(argv) {
  const args = {
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
    output: 'data/training_data.csv',
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--start-date') args.startDate = argv[++i];
    if (argv[i] === '--end-date') args.endDate = argv[++i];
    if (argv[i] === '--output') args.output = argv[++i];
  }

  return args;
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function encodeFeatureVector(featureVector) {
  return Buffer.from(JSON.stringify(featureVector || {}), 'utf8').toString('base64');
}

async function exportTrainingData({ startDate, endDate, output }) {
  const { rows } = await pool.query(
    `WITH latest_features AS (
       SELECT DISTINCT ON (book_id, feature_version)
              id,
              book_id,
              feature_vector,
              feature_version,
              computed_at
         FROM ml_book_features
        WHERE computed_at >= $1::timestamptz
          AND computed_at <= $2::timestamptz
        ORDER BY book_id, feature_version, computed_at DESC
     )
     SELECT
       lf.book_id,
       lf.feature_version,
       lf.computed_at,
       lf.feature_vector,
       COALESCE(feedback.actual_priority_score, bde.generation_priority_score) AS label,
       CASE
         WHEN feedback.actual_priority_score IS NOT NULL THEN 'actual_priority_score'
         WHEN bde.generation_priority_score IS NOT NULL THEN 'generation_priority_score'
         ELSE NULL
       END AS label_source
     FROM latest_features lf
     LEFT JOIN book_did_engagement bde
       ON bde.book_id = lf.book_id
     LEFT JOIN LATERAL (
       SELECT actual_priority_score
         FROM ml_prediction_log pl
        WHERE pl.book_id = lf.book_id
          AND pl.actual_priority_score IS NOT NULL
        ORDER BY pl.inferred_at DESC
        LIMIT 1
     ) feedback ON TRUE
     WHERE COALESCE(feedback.actual_priority_score, bde.generation_priority_score) IS NOT NULL
     ORDER BY lf.computed_at DESC`,
    [startDate, endDate],
  );

  const header = [
    'book_id',
    'feature_version',
    'computed_at',
    'feature_vector_base64',
    'label',
    'label_source',
  ];

  const csvRows = [
    header.join(','),
    ...rows.map((row) => [
      row.book_id,
      row.feature_version,
      row.computed_at?.toISOString?.() || row.computed_at,
      encodeFeatureVector(row.feature_vector),
      row.label,
      row.label_source,
    ].map(csvValue).join(',')),
  ];

  const outputPath = path.resolve(output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${csvRows.join('\n')}\n`, 'utf8');

  return {
    status: 'ok',
    rows: rows.length,
    output: outputPath,
    startDate,
    endDate,
  };
}

const args = parseArgs(process.argv.slice(2));

try {
  const result = await exportTrainingData(args);
  console.log('[ml:export]', JSON.stringify(result, null, 2));
} catch (err) {
  console.error('[ml:export] failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}