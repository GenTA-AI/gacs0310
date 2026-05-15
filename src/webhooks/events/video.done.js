export async function handle(payload, db, queue) {
  const {
    bookId: externalBookId,
    jobId: externalJobId,
    scenarioType = null,
    status: videoStatus = 'completed',
    videoUrl = null,
    errorMessage = null,
  } = payload.data || {};

  const eventId = payload.eventId;

  try {
    if (!externalBookId) {
      return { status: 'skipped', reason: 'missing_book_id' };
    }

    const refResult = await db.query(
      `SELECT book_id
       FROM book_external_refs
       WHERE source_system = 'smart_did'
         AND external_book_id = $1
       ORDER BY first_seen_at ASC
       LIMIT 1`,
      [externalBookId],
    );

    if (refResult.rows.length === 0) {
      await queue.add('reconciliation', {
        bookId: externalBookId,
        eventId,
        occurredAt: payload.occurredAt,
      });
      return {
        status: 'skipped',
        reason: 'unknown_book_id_sent_to_reconciliation',
        enqueued: ['reconciliation'],
      };
    }

    const gacsBookId = refResult.rows[0].book_id;

    if (scenarioType) {
      const newState = videoStatus === 'completed' ? 'completed' : 'failed';
      await db.query(
        `UPDATE book_video_scenarios
         SET state = $1,
             response_payload = jsonb_set(
               COALESCE(response_payload, '{}'::jsonb),
               '{video_done_event}',
               $2::jsonb
             ),
             completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
             error_message = $3,
             updated_at = NOW()
         WHERE book_id = $4
           AND scenario_type = $5`,
        [newState, JSON.stringify({ videoUrl, eventId, jobId: externalJobId }), errorMessage, gacsBookId, scenarioType],
      );
    }

    const vjStatus = videoStatus === 'completed' ? 'completed' : 'failed';
    await db.query(
      `UPDATE video_jobs
       SET status = $1,
           video_url = COALESCE($2, video_url),
           error_message = $3,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE book_id = $4
         AND status NOT IN ('completed', 'cancelled')`,
      [vjStatus, videoUrl, errorMessage, gacsBookId],
    );

    return {
      status: 'ok',
      bookId: gacsBookId,
      videoStatus: vjStatus,
    };
  } catch (err) {
    console.error(`[video.done] error: ${err.message}`);
    return { status: 'error_logged' };
  }
}
