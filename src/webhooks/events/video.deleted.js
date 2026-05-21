import { insertSyncEvent } from '../helpers/sync-event.helper.js';

export async function handle(payload, db) {
  const { bookId } = payload.data || {};
  if (!bookId) return { status: 'skipped', reason: 'missing_book_id' };

  return insertSyncEvent({
    eventId: payload.eventId,
    bookId,
    eventType: 'video.deleted',
    payload: payload.data,
    idempotencyKey: `${payload.eventId}:video.deleted`,
    db,
  });
}
