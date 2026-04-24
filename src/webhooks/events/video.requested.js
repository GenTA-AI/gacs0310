/**
 * Handle video.requested event
 * Optimized for < 100ms critical path
 */
export async function handle(payload, db, queue) {
  const { bookId: externalBookId, requestCount, lastRequestedAt, rankingScore, ageGroup, sortOrder } = payload.data;
  const eventId = payload.eventId;

  try {
    // 1. Resolve GACS book_id (CRITICAL PATH)
    // PRESSURE-TEST FIX: Handle external ref collision by using the oldest one
    const refResult = await db.query(
      `SELECT book_id FROM book_external_refs 
       WHERE source_system = 'smart_did' AND external_book_id = $1 
       ORDER BY first_seen_at ASC 
       LIMIT 1`,
      [externalBookId]
    );

    if (refResult.rows.length === 0) {
      // If NOT found: Enqueue to reconciliation
      await queue.add('reconciliation', { 
        bookId: externalBookId, 
        eventId, 
        occurredAt: payload.occurredAt 
      });
      return { 
        status: 'skipped', 
        reason: 'unknown_book_id_sent_to_reconciliation', 
        enqueued: ['reconciliation'] 
      };
    }

    const gacsBookId = refResult.rows[0].book_id;

    // 2. Update video_jobs priority (CRITICAL PATH)
    await db.query(
      `UPDATE video_jobs 
       SET priority_score = $1, requested_at = NOW() 
       WHERE book_id = $2 AND status NOT IN ('completed', 'cancelled')`,
      [rankingScore, gacsBookId]
    );

    // 3. ASYNC WRITES (Deferred to BullMQ)
    // We enqueue these and return immediately to keep latency low
    
    // Job A: Engagement snapshot
    queue.add('async-engagement', {
      type: 'snapshot',
      data: {
        bookId: gacsBookId,
        sourceSystem: 'smart_did',
        requestCount,
        rankingScore,
        lastRequestedAt
      }
    }).catch(err => console.error('[video.requested] Async job A failed:', err.message));

    // Job B: Recommendation segment
    queue.add('async-engagement', {
      type: 'recommendation',
      data: {
        bookId: gacsBookId,
        sourceSystem: 'smart_did',
        ageGroup,
        sortOrder
      }
    }).catch(err => console.error('[video.requested] Async job B failed:', err.message));

    // CRITICAL RULE: NEVER overwrite canonical metadata
    // DO NOT UPDATE books.title or books.author here.

    return { 
      status: 'ok', 
      bookId: gacsBookId, 
      enqueued: ['async-engagement'] 
    };

  } catch (err) {
    console.error(`[video.requested] error: ${err.message}`);
    // If it fails, we return error_logged so the caller can handle it
    return { status: 'error_logged' };
  }
}
