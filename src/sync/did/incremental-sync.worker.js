import { createWorker, onWorkerEvents } from '../../queue/base-worker.js';
import { DidIncrementalSyncService } from './incremental-sync.service.js';

export const QUEUE_NAME = process.env.DID_SYNC_QUEUE_NAME || 'did-incremental-sync';

export function buildDidIncrementalSyncWorker() {
  return createWorker({
    queueName: QUEUE_NAME,
    lockDuration: process.env.DID_SYNC_LOCK_TTL_MS || 840000,
    processor: async () => {
      const service = new DidIncrementalSyncService();
      return service.runOnce();
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  onWorkerEvents(buildDidIncrementalSyncWorker(), 'did-sync');
}
