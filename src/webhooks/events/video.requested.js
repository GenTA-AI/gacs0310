/**
 * Handle video.requested event
 * Optimized for < 100ms critical path.
 *
 * Smart DID owns engagement signals.
 * GACS canonical metadata must not be overwritten here.
 */
export async function handle(payload, db, queue) {
  const {
    bookId: externalBookId,
    requestCount = 0,
    lastRequestedAt = null,
    rankingScore = 0,
    ageGroup = null,
    sortOrder = null,
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
      await enqueue(queue, 'reconciliation', {
        bookId: externalBookId,
        eventId,
        occurredAt: payload.occurredAt,
        reason: 'unknown_book_id',
      });

      return {
        status: 'skipped',
        reason: 'unknown_book_id_sent_to_reconciliation',
        enqueued: ['reconciliation'],
      };
    }

    const gacsBookId = refResult.rows[0].book_id;

    await db.query(
      `INSERT INTO book_engagement (
         book_id,
         source_system,
         request_count,
         ranking_score,
         last_requested_at,
         synced_at,
         created_at,
         updated_at
       )
       VALUES ($1, 'smart_did', $2, $3, $4, NOW(), NOW(), NOW())
       ON CONFLICT (book_id, source_system)
       DO UPDATE SET
         request_count = EXCLUDED.request_count,
         ranking_score = EXCLUDED.ranking_score,
         last_requested_at = EXCLUDED.last_requested_at,
         synced_at = NOW(),
         updated_at = NOW()
       WHERE book_engagement.request_count IS DISTINCT FROM EXCLUDED.request_count
          OR book_engagement.ranking_score IS DISTINCT FROM EXCLUDED.ranking_score
          OR book_engagement.last_requested_at IS DISTINCT FROM EXCLUDED.last_requested_at`,
      [gacsBookId, requestCount, rankingScore, lastRequestedAt],
    );

    await db.query(
      `UPDATE video_jobs
          SET priority_score = $1,
              requested_at = NOW()
        WHERE book_id = $2
          AND status NOT IN ('completed', 'cancelled')`,
      [rankingScore, gacsBookId],
    );

    enqueue(queue, 'async-engagement', {
      type: 'snapshot',
      data: {
        bookId: gacsBookId,
        sourceSystem: 'smart_did',
        requestCount,
        rankingScore,
        lastRequestedAt,
        eventId,
      },
    }).catch((err) => {
      console.error('[video.requested] Snapshot enqueue failed:', err.message);
    });

    if (ageGroup) {
      enqueue(queue, 'async-engagement', {
        type: 'recommendation',
        data: {
          bookId: gacsBookId,
          sourceSystem: 'smart_did',
          ageGroup,
          sortOrder,
          eventId,
        },
      }).catch((err) => {
        console.error('[video.requested] Recommendation enqueue failed:', err.message);
      });
    }

    return {
      status: 'ok',
      bookId: gacsBookId,
      enqueued: ageGroup ? ['async-engagement'] : ['async-engagement'],
    };
  } catch (err) {
    console.error(`[video.requested] error: ${err.message}`);
    return { status: 'error_logged' };
  }
}

async function enqueue(queue, jobName, data) {
  const target = resolveQueue(queue, jobName);
  if (!target || typeof target.add !== 'function') return false;

  await target.add(jobName, data);
  return true;
}

function resolveQueue(queue, jobName) {
  if (!queue) return null;
  if (typeof queue.add === 'function') return queue;

  const queueByJob = {
    reconciliation: 'reconciliationQueue',
    'async-engagement': 'asyncEngagementQueue',
    'video-regeneration': 'videoRegenerationQueue',
    'video-refresh': 'videoRefreshQueue',
    'sync-alert': 'syncAlertQueue',
    'dead-letter': 'deadLetterQueue',
  };

  return queue[queueByJob[jobName]];
}
