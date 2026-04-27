'use strict';

const { Worker } = require('bullmq');
const redisModule = require('../../queue/redis.client');
const { DidIncrementalSyncService } = require('./incremental-sync.service');

const QUEUE_NAME = process.env.DID_SYNC_QUEUE_NAME || 'did-incremental-sync';

function buildDidIncrementalSyncWorker() {
  const connection = redisModule.connection || redisModule.redis || redisModule.client || redisModule;

  return new Worker(
    QUEUE_NAME,
    async () => {
      const service = new DidIncrementalSyncService();
      return service.runOnce();
    },
    {
      connection,
      concurrency: 1,
      lockDuration: Number(process.env.DID_SYNC_LOCK_TTL_MS || 840000),
    },
  );
}

if (require.main === module) {
  const worker = buildDidIncrementalSyncWorker();

  worker.on('completed', (_job, result) => {
    console.log('[did-sync] completed', result);
  });

  worker.on('failed', (job, error) => {
    console.error('[did-sync] failed', {
      jobId: job?.id,
      error: error.message,
    });
  });
}

module.exports = {
  QUEUE_NAME,
  buildDidIncrementalSyncWorker,
};
