export async function insertSyncEvent({ eventId, bookId, eventType, payload, idempotencyKey, db }) {
  try {
    const refResult = await db.query(
      `SELECT book_id FROM book_external_refs
       WHERE source_system = 'smart_did' AND external_book_id = $1`,
      [bookId],
    );

    if (refResult.rows.length === 0) {
      return { status: 'skipped', reason: 'unknown_book', bookId };
    }

    const gacsBookId = refResult.rows[0].book_id;

    await db.query(
      `INSERT INTO smart_did_sync_events (book_id, event_type, idempotency_key, payload_json, status)
       VALUES ($1, $2, $3, $4::jsonb, 'pending')
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [gacsBookId, eventType, idempotencyKey, JSON.stringify(payload)],
    );

    return { status: 'ok', bookId: gacsBookId, queuedForSync: true };
  } catch (err) {
    console.error(`[sync-event] insert error: ${err.message}`);
    return { status: 'error_logged' };
  }
}
