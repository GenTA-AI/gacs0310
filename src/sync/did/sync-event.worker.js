import { createWorker, onWorkerEvents } from '../../queue/base-worker.js';
import pool from '../../db/client.js';
import { SyncEventsRepository } from './sync-events.repository.js';
import { DriftDetectorService } from './drift-detector.service.js';
import { CanonicalBookUpsertService } from './canonical-book-upsert.service.js';
import { SyncLogRepository } from './sync-log.repository.js';

export const QUEUE_NAME = 'sync-event-processor';

function buildServices() {
  const eventsRepo = new SyncEventsRepository({ db: pool });
  const driftDetector = new DriftDetectorService({ db: pool });
  const canonicalUpsert = new CanonicalBookUpsertService({ db: pool });
  const syncLog = new SyncLogRepository({ db: pool });

  return { eventsRepo, driftDetector, canonicalUpsert, syncLog };
}

export async function processNextEvent() {
  const { eventsRepo, driftDetector, canonicalUpsert, syncLog } = buildServices();

  const event = await eventsRepo.getNextPending();
  if (!event) return { status: 'no_events' };

  await eventsRepo.setProcessing(event.event_id);

  const startTime = Date.now();

  try {
    const payload = event.payload_json;
    const hash = driftDetector.computeHash(payload);

    const { drifted } = await driftDetector.hasDrifted(
      event.book_id,
      event.idempotency_key.split(':')[0],
      hash,
    );

    if (!drifted) {
      await eventsRepo.setProcessed(event.event_id);
      await syncLog.logSync({ status: 'no_drift', message: 'Fingerprint unchanged', durationMs: Date.now() - startTime });
      return { status: 'no_drift', eventId: event.event_id };
    }

    await canonicalUpsert.upsertBook({
      bookId: event.book_id,
      externalBookId: event.idempotency_key.split(':')[0],
      ...payload,
    });

    await driftDetector.recordFingerprint(event.book_id, event.idempotency_key.split(':')[0], hash);
    await eventsRepo.setProcessed(event.event_id);
    await syncLog.logSync({ status: 'success', durationMs: Date.now() - startTime });

    return { status: 'ok', eventId: event.event_id };
  } catch (err) {
    const result = await eventsRepo.scheduleRetry(event.event_id, err.message);
    await syncLog.logSync({
      status: result?.status === 'failed' ? 'failed' : 'retry_scheduled',
      message: err.message,
      durationMs: Date.now() - startTime,
      retryCount: result?.retryCount,
    });
    return { status: result?.status || 'error_logged', eventId: event.event_id };
  }
}

export function buildSyncEventWorker() {
  return createWorker({
    queueName: QUEUE_NAME,
    lockDuration: 30000,
    processor: async () => processNextEvent(),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  onWorkerEvents(buildSyncEventWorker(), 'sync-event');
}
