import { Worker } from 'bullmq';
import redis from '../queue/redis.client.js';
import { FeatureComputationService } from './feature-computation.service.js';

export const QUEUE_NAME = process.env.FEATURE_COMPUTATION_QUEUE_NAME || 'feature-computation';

export function buildFeatureComputationWorker() {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      const service = new FeatureComputationService();
      const { bookId, batch } = job.data;
      if (batch && Array.isArray(batch)) {
        return service.computeBatch(batch);
      }
      if (bookId) {
        return service.computeForBook(bookId);
      }
      return service.computeAll();
    },
    {
      connection: redis,
      concurrency: 2,
      lockDuration: 120000,
    },
  );
}

if (process.env.FEATURE_WORKER_ENABLED === 'true' && import.meta.url === `file://${process.argv[1]}`) {
  const worker = buildFeatureComputationWorker();

  worker.on('completed', (job, result) => {
    console.log('[features] completed', { jobId: job?.id, result });
  });

  worker.on('failed', (job, error) => {
    console.error('[features] failed', { jobId: job?.id, error: error.message });
  });
}
