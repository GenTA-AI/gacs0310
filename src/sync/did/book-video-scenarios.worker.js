import { createWorker, onWorkerEvents } from '../../queue/base-worker.js';
import { BookVideoScenariosService } from './book-video-scenarios.service.js';
import pool from '../../db/client.js';

export const QUEUE_NAME = 'book-video-scenarios';

export function buildBookVideoScenariosWorker() {
  return createWorker({
    queueName: QUEUE_NAME,
    concurrency: 1,
    lockDuration: 60000,
    processor: async (job) => {
      const { bookId, externalBookId, scenarioType, action } = job.data;
      const service = new BookVideoScenariosService({ db: pool });

      if (action === 'pull') {
        return service.pullAndStoreScenarios({ bookId, externalBookId });
      }

      if (action === 'process' && bookId && scenarioType) {
        await service.updateScenarioState({ bookId, scenarioType, state: 'processing' });
        return { status: 'processing', bookId, scenarioType };
      }

      return { status: 'skipped', reason: 'unknown_action' };
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  onWorkerEvents(buildBookVideoScenariosWorker(), 'book-video-scenarios');
}
