/**
 * Handle video.expired event
 */
export async function handle(payload, db, queue) {
  const { bookId: externalBookId, expiresAt } = payload.data;
  
  try {
    // 1. Resolve GACS book_id
    const refResult = await db.query(
      'SELECT book_id FROM book_external_refs WHERE source_system = $1 AND external_book_id = $2',
      ['smart_did', externalBookId]
    );
    if (refResult.rows.length === 0) {
      return { status: 'skipped', reason: 'unknown_book_id' };
    }
    
    const gacsBookId = refResult.rows[0].book_id;
    
    // 2. Log expiration to did_sync_log
    await db.query(
      `INSERT INTO did_sync_log 
       (sync_timestamp, videos_synced, videos_changed, sync_status, synced_by, created_at)
       VALUES (NOW(), 0, 1, 'partial', 'webhook:video.expired', NOW())`
    );
    
    // 3. Check if book has completed video_jobs that need refresh
    const jobResult = await db.query(
      `SELECT COUNT(*) as count FROM video_jobs 
       WHERE book_id = $1 AND status = 'completed'`,
      [gacsBookId]
    );
    
    let refreshQueued = false;
    if (jobResult.rows[0].count > 0) {
      await queue.add('video-refresh', {
        bookId: gacsBookId,
        reason: 'smart_did_expiry',
        expiresAt
      });
      refreshQueued = true;
    }
    
    return { status: 'ok', bookId: gacsBookId, refreshQueued };
  } catch (err) {
    console.error(`[video.expired] error: ${err.message}`);
    return { status: 'error_logged' };
  }
}
