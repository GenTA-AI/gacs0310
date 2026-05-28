import { Router } from 'express';
import pool from '../db/client.js';

const router = Router();

router.get('/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;

    const { rows } = await pool.query(
      `SELECT id, book_id, feature_vector, feature_version, computed_at
         FROM ml_book_features
        WHERE book_id = $1
        ORDER BY computed_at DESC
        LIMIT 1`,
      [bookId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'not_found', bookId });
    }

    return res.json({ status: 'ok', feature: rows[0] });
  } catch (err) {
    console.error('[features-api] error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const statusFilter = req.query.status || 'pending';
    const statuses = statusFilter === 'all'
      ? ['pending', 'active', 'completed', 'failed']
      : [statusFilter];

    const placeholders = statuses.map((_, i) => `$${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (mf.book_id)
              mf.id,
              mf.book_id,
              mf.feature_vector,
              mf.feature_version,
              mf.computed_at
         FROM ml_book_features mf
         JOIN video_jobs vj ON vj.book_id = mf.book_id
        WHERE vj.status IN (${placeholders})
        ORDER BY mf.book_id, mf.computed_at DESC`,
      statuses,
    );

    return res.json({ status: 'ok', count: rows.length, features: rows });
  } catch (err) {
    console.error('[features-api] list error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;