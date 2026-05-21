export class SyncLogRepository {
  constructor({ db } = {}) {
    if (!db) throw new Error('db is required');
    this.db = db;
  }

  async logSync({ bookId, status, message, durationMs, retryCount, nextRetryAt } = {}) {
    await this.db.query(
      `INSERT INTO did_sync_log (sync_timestamp, sync_status, error_message, sync_duration_ms, retry_count, next_retry_at, synced_by)
       VALUES (NOW(), $1, $2, $3, $4, $5, 'sync-worker')`,
      [status || 'success', message || null, durationMs || null, retryCount || 0, nextRetryAt || null],
    );
  }

  async getHistory(bookId, limit = 50) {
    const result = await this.db.query(
      `SELECT sync_timestamp, sync_status, error_message, sync_duration_ms, retry_count, next_retry_at
       FROM did_sync_log
       WHERE external_book_id = $1 OR error_message LIKE $2
       ORDER BY sync_timestamp DESC
       LIMIT $3`,
      [bookId, `%${bookId}%`, limit],
    );

    return result.rows;
  }
}
