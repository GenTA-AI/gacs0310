export class CanonicalBookUpsertService {
  constructor({ db } = {}) {
    if (!db) throw new Error('db is required');
    this.db = db;
  }

  async upsertBook(bookData) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const bookId = await this._upsertBooks(client, bookData);
      await this._upsertExternalRefs(client, bookId, bookData.externalBookId);
      await this._upsertEngagement(client, bookId, bookData);
      await this._upsertVideoState(client, bookId, bookData);
      await this._upsertVideoJobs(client, bookId, bookData);

      await client.query('COMMIT');
      return { success: true, bookId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async _upsertBooks(client, data) {
    const result = await client.query(
      `INSERT INTO books (book_id)
       VALUES (gen_random_uuid())
       ON CONFLICT (book_id) DO NOTHING
       RETURNING book_id`,
    );
    return result.rows[0]?.book_id || data.bookId;
  }

  async _upsertExternalRefs(client, bookId, externalBookId) {
    await client.query(
      `INSERT INTO book_external_refs (book_id, source_system, external_book_id, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES ($1, 'smart_did', $2, NOW(), NOW(), NOW(), NOW())
       ON CONFLICT ON CONSTRAINT uq_book_external_refs_source_external
       DO UPDATE SET
         last_seen_at = NOW(),
         updated_at = NOW()`,
      [bookId, externalBookId],
    );
  }

  async _upsertEngagement(client, bookId, data) {
    await client.query(
      `INSERT INTO book_did_engagement (book_id, source_system, request_count, ranking_score, last_requested_at, synced_at, created_at, updated_at)
       VALUES ($1, 'smart_did', $2, $3, $4, NOW(), NOW(), NOW())
       ON CONFLICT ON CONSTRAINT uq_book_did_engagement_book
       DO UPDATE SET
         request_count = EXCLUDED.request_count,
         ranking_score = EXCLUDED.ranking_score,
         last_requested_at = EXCLUDED.last_requested_at,
         synced_at = NOW(),
         updated_at = NOW()
       WHERE book_did_engagement.request_count IS DISTINCT FROM EXCLUDED.request_count
          OR book_did_engagement.ranking_score IS DISTINCT FROM EXCLUDED.ranking_score
          OR book_did_engagement.last_requested_at IS DISTINCT FROM EXCLUDED.last_requested_at`,
      [bookId, data.requestCount || 0, data.rankingScore || 0, data.lastRequestedAt || null],
    );
  }

  async _upsertVideoState(client, bookId, data) {
    await client.query(
      `INSERT INTO smart_did_video_state (book_id, status, video_url, subtitle_url, expires_at, retry_count, error_message, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT ON CONSTRAINT uq_smart_did_video_state_book
       DO UPDATE SET
         status = COALESCE(EXCLUDED.status, smart_did_video_state.status),
         video_url = COALESCE(EXCLUDED.video_url, smart_did_video_state.video_url),
         subtitle_url = COALESCE(EXCLUDED.subtitle_url, smart_did_video_state.subtitle_url),
         expires_at = COALESCE(EXCLUDED.expires_at, smart_did_video_state.expires_at),
         retry_count = EXCLUDED.retry_count,
         error_message = COALESCE(EXCLUDED.error_message, smart_did_video_state.error_message),
         updated_at = NOW()
       WHERE smart_did_video_state.status IS DISTINCT FROM EXCLUDED.status
          OR smart_did_video_state.video_url IS DISTINCT FROM EXCLUDED.video_url
          OR smart_did_video_state.subtitle_url IS DISTINCT FROM EXCLUDED.subtitle_url
          OR smart_did_video_state.expires_at IS DISTINCT FROM EXCLUDED.expires_at
          OR smart_did_video_state.retry_count IS DISTINCT FROM EXCLUDED.retry_count`,
      [bookId, data.status || null, data.videoUrl || null, data.subtitleUrl || null, data.expiresAt || null, data.retryCount || 0, data.errorMessage || null],
    );
  }

  async _upsertVideoJobs(client, bookId, data) {
    await client.query(
      `INSERT INTO video_jobs (book_id, status, did_reported_status, did_request_retries, expires_at, did_status_synced_at, created_at, updated_at)
       VALUES ($1, 'pending', $2, $3, $4, NOW(), NOW(), NOW())
       ON CONFLICT (job_id) DO UPDATE SET
         did_reported_status = COALESCE(EXCLUDED.did_reported_status, video_jobs.did_reported_status),
         did_request_retries = EXCLUDED.did_request_retries,
         expires_at = COALESCE(EXCLUDED.expires_at, video_jobs.expires_at),
         did_status_synced_at = NOW(),
         updated_at = NOW()`,
      [bookId, data.status || null, data.retryCount || 0, data.expiresAt || null],
    );
  }
}
