#!/usr/bin/env node

import 'dotenv/config';
import pool from '../db/client.js';

export class FeedbackTrackerService {
  async updateActualScores() {
    const { rows } = await pool.query(
      `UPDATE ml_prediction_log pl
          SET actual_priority_score = vj.priority_score
         FROM video_jobs vj
        WHERE vj.book_id = pl.book_id
          AND vj.status IN ('completed', 'failed')
          AND vj.priority_score IS NOT NULL
          AND pl.actual_priority_score IS NULL
      RETURNING
          pl.id,
          pl.book_id,
          pl.prediction_score,
          pl.actual_priority_score`,
    );

    return {
      status: 'ok',
      updated: rows.length,
      rows,
    };
  }

  async computeDriftMetrics() {
    const { rows } = await pool.query(
      `SELECT
          COUNT(*) AS total,
          AVG(ABS(pl.prediction_score - pl.actual_priority_score)) AS mae,
          SQRT(AVG(POWER(pl.prediction_score - pl.actual_priority_score, 2))) AS rmse,
          CORR(pl.prediction_score, pl.actual_priority_score) AS pearson_r
         FROM ml_prediction_log pl
        WHERE pl.actual_priority_score IS NOT NULL`,
    );

    return rows[0];
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new FeedbackTrackerService();

  const [feedback, drift] = await Promise.all([
    service.updateActualScores(),
    service.computeDriftMetrics(),
  ]);

  console.log('Feedback:', JSON.stringify(feedback, null, 2));
  console.log('Drift:', JSON.stringify(drift, null, 2));
}