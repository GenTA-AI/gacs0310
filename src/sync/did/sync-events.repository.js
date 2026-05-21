export class SyncEventsRepository {
  constructor({ db } = {}) {
    if (!db) throw new Error('db is required');
    this.db = db;
  }

  async insertEvent({ eventId, bookId, eventType, payload, idempotencyKey }) {
    try {
      const result = await this.db.query(
        `INSERT INTO smart_did_sync_events (event_id, book_id, event_type, idempotency_key, payload_json, status)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING event_id, status`,
        [eventId, bookId, eventType, idempotencyKey, JSON.stringify(payload)],
      );

      if (result.rows.length === 0) {
        return { inserted: false, reason: 'duplicate' };
      }

      return { inserted: true, eventId: result.rows[0].event_id };
    } catch (err) {
      if (err.code === '23505') {
        return { inserted: false, reason: 'duplicate' };
      }
      throw err;
    }
  }

  async getNextPending() {
    const result = await this.db.query(
      `SELECT event_id, book_id, event_type, idempotency_key, payload_json, retry_count, received_at
       FROM smart_did_sync_events
       WHERE status IN ('pending', 'retry')
       ORDER BY received_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );

    return result.rows[0] || null;
  }

  async setProcessing(eventId) {
    await this.db.query(
      `UPDATE smart_did_sync_events SET status = 'processing', updated_at = NOW() WHERE event_id = $1`,
      [eventId],
    );
  }

  async setProcessed(eventId) {
    await this.db.query(
      `UPDATE smart_did_sync_events SET status = 'processed', processed_at = NOW(), updated_at = NOW() WHERE event_id = $1`,
      [eventId],
    );
  }

  async scheduleRetry(eventId, errorMessage) {
    const result = await this.db.query(
      `UPDATE smart_did_sync_events SET
         retry_count = retry_count + 1,
         last_error = $2,
         status = CASE
           WHEN retry_count + 1 >= 5 THEN 'failed'
           ELSE 'retry'
         END,
         updated_at = NOW()
       WHERE event_id = $1
       RETURNING retry_count, status`,
      [eventId, errorMessage],
    );

    if (result.rows.length === 0) return null;
    return { retryCount: result.rows[0].retry_count, status: result.rows[0].status };
  }
}
