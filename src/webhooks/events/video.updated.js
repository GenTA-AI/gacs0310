/**
 * Handle video.updated event
 */
export async function handle(payload, db, queue) {
  const { bookId: externalBookId, status, videoUrl, subtitleUrl, expiresAt, retryCount, errorMessage } = payload.data;
  const eventId = payload.eventId;

  try {
    // 1. Resolve GACS book_id
    const refResult = await db.query(
      `SELECT book_id FROM book_external_refs 
       WHERE source_system = 'smart_did' AND external_book_id = $1 
       LIMIT 1`,
      [externalBookId]
    );

    if (refResult.rows.length === 0) {
      return { status: 'skipped', reason: 'unknown_book_id' };
    }

    const gacsBookId = refResult.rows[0].book_id;

    // 2. Check if smart_did_video_state table exists
    // This table might not be provisioned yet (Phase 2 feature)
    const tableCheck = await db.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema='public' AND table_name='smart_did_video_state'
      )`
    );

    if (!tableCheck.rows[0].exists) {
      console.log(`[video.updated] smart_did_video_state table not yet provisioned, skipping state upsert for book ${gacsBookId}`);
    } else {
      // 3. Upsert video state
      await db.query(
        `INSERT INTO smart_did_video_state 
           (book_id, status, video_url, subtitle_url, expires_at, retry_count, error_message, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
         ON CONFLICT (book_id) 
         DO UPDATE SET 
           status = EXCLUDED.status, 
           video_url = EXCLUDED.video_url, 
           subtitle_url = EXCLUDED.subtitle_url, 
           expires_at = EXCLUDED.expires_at, 
           retry_count = EXCLUDED.retry_count, 
           error_message = EXCLUDED.error_message, 
           updated_at = NOW()`,
        [gacsBookId, status, videoUrl, subtitleUrl, expiresAt, retryCount, errorMessage]
      );
    }

    // 4. Trigger regeneration if failed repeatedly
    if (status === 'failed' && retryCount >= 3) {
      await queue.add('video-regeneration', { 
        bookId: gacsBookId, 
        eventId, 
        errorMessage, 
        retryCount 
      });
      console.log(`[video.updated] Regeneration triggered for book ${gacsBookId} after ${retryCount} failures`);
    }

    return { status: 'ok', bookId: gacsBookId };

  } catch (err) {
    console.error(`[video.updated] error: ${err.message}`);
    return { status: 'error_logged' };
  }
}
