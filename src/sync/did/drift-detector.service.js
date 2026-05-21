import crypto from 'crypto';

export class DriftDetectorService {
  constructor({ db } = {}) {
    if (!db) throw new Error('db is required');
    this.db = db;
  }

  computeHash(payload) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  async hasDrifted(bookId, externalBookId, newHash) {
    const result = await this.db.query(
      `SELECT content_hash FROM book_sync_fingerprints WHERE external_book_id = $1`,
      [externalBookId],
    );

    const oldHash = result.rows[0]?.content_hash || null;
    return { drifted: oldHash !== newHash, oldHash };
  }

  async recordFingerprint(bookId, externalBookId, newHash) {
    const now = new Date();

    const result = await this.db.query(
      `INSERT INTO book_sync_fingerprints (book_id, content_hash, external_book_id, last_synced_at, hash_changed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, $4, $4)
       ON CONFLICT (external_book_id) DO UPDATE SET
         content_hash = EXCLUDED.content_hash,
         last_synced_at = EXCLUDED.last_synced_at,
         hash_changed_at = CASE
           WHEN book_sync_fingerprints.content_hash IS DISTINCT FROM EXCLUDED.content_hash
           THEN EXCLUDED.hash_changed_at
           ELSE book_sync_fingerprints.hash_changed_at
         END,
         updated_at = EXCLUDED.updated_at
       RETURNING fingerprint_id, content_hash, hash_changed_at`,
      [bookId, newHash, externalBookId, now],
    );

    return result.rows[0];
  }
}
