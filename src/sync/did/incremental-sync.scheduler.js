'use strict';

const { Queue } = require('bullmq');
const redisModule = require('../../queue/redis.client');
const { QUEUE_NAME } = require('./incremental-sync.worker');

const REPEATABLE_JOB_NAME = 'did.incremental-sync.every-15-minutes';

async function scheduleDidIncrementalSync({
  enabled = String(process.env.DID_SYNC_ENABLED || 'false') === 'true',
  intervalMs = Number(process.env.DID_SYNC_INTERVAL_MS || 900000),
} = {}) {
  if (!enabled) {
    return { status: 'disabled', queueName: QUEUE_NAME };
  }

  const connection = redisModule.connection || redisModule.redis || redisModule.client || redisModule;
  const queue = new Queue(QUEUE_NAME, { connection });

  await queue.add(
    REPEATABLE_JOB_NAME,
    {},
    {
      jobId: REPEATABLE_JOB_NAME,
      repeat: { every: intervalMs },
      attempts: Number(process.env.DID_SYNC_JOB_ATTEMPTS || 3),
      backoff: {
        type: 'exponential',
        delay: Number(process.env.DID_SYNC_JOB_BACKOFF_MS || 30000),
      },
      removeOnComplete: 25,
      removeOnFail: 100,
    },
  );

  return {
    status: 'scheduled',
    queueName: QUEUE_NAME,
    every: intervalMs,
  };
}

module.exports = {
  REPEATABLE_JOB_NAME,
  scheduleDidIncrementalSync,
};
