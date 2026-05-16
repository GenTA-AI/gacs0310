import { Worker } from 'bullmq';
import redis from './redis.client.js';

export function createWorker({ queueName, processor, concurrency, lockDuration }) {
  return new Worker(queueName, processor, {
    connection: redis,
    concurrency: Number(concurrency || process.env.DID_SYNC_WORKER_CONCURRENCY || 1),
    lockDuration: Number(lockDuration || 840000),
  });
}

export function onWorkerEvents(worker, logPrefix) {
  worker.on('completed', (_job, result) => {
    console.log(`[${logPrefix}] completed`, JSON.stringify(result));
  });

  worker.on('failed', (job, error) => {
    console.error(`[${logPrefix}] failed`, {
      jobId: job?.id,
      error: error.message,
    });
  });
}
