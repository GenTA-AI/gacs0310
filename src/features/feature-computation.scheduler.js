import { Queue } from 'bullmq';
import redis from '../queue/redis.client.js';

export const QUEUE_NAME = process.env.FEATURE_COMPUTATION_QUEUE_NAME || 'feature-computation';
export const REPEATABLE_JOB_NAME = 'feature.computation.daily';

const queue = new Queue(QUEUE_NAME, { connection: redis });

export async function scheduleFeatureComputation({
  enabled = String(process.env.FEATURE_WORKER_ENABLED || 'false') === 'true',
  intervalMs = Number(process.env.FEATURE_COMPUTE_INTERVAL_MS || 86400000),
} = {}) {
  if (!enabled) {
    return { status: 'disabled', queueName: QUEUE_NAME };
  }

  await queue.add(
    REPEATABLE_JOB_NAME,
    {},
    {
      jobId: REPEATABLE_JOB_NAME,
      repeat: { every: intervalMs },
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: 25,
      removeOnFail: 100,
    },
  );

  return { status: 'scheduled', queueName: QUEUE_NAME, every: intervalMs };
}
