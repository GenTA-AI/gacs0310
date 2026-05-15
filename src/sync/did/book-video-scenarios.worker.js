import { Worker } from 'bullmq';
import crypto from 'crypto';
import redis from '../../queue/redis.client.js';
import { BookVideoScenariosService } from './book-video-scenarios.service.js';
import pool from '../../db/client.js';

export const QUEUE_NAME = 'book-video-scenarios';

export function buildBookVideoScenariosWorker() {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      const { bookId, externalBookId, scenarioType, action } = job.data;

      const service = new BookVideoScenariosService({ db: pool });

      if (action === 'pull') {
        return service.pullAndStoreScenarios({ bookId, externalBookId });
      }

      if (action === 'process' && bookId && scenarioType) {
        await service.updateScenarioState({
          bookId,
          scenarioType,
          state: 'processing',
        });
        return { status: 'processing', bookId, scenarioType };
      }

      return { status: 'skipped', reason: 'unknown_action' };
    },
    {
      connection: redis,
      concurrency: Number(process.env.DID_SYNC_WORKER_CONCURRENCY || 1),
      lockDuration: 60000,
    },
  );
}

function isRunDirectly() {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
}

if (isRunDirectly()) {
  const worker = buildBookVideoScenariosWorker();

  worker.on('completed', (_job, result) => {
    console.log('[book-video-scenarios] completed', JSON.stringify(result));
  });

  worker.on('failed', (job, error) => {
    console.error('[book-video-scenarios] failed', {
      jobId: job?.id,
      error: error.message,
    });
  });
}
