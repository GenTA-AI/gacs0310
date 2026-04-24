import { Queue } from 'bullmq';
import redis from './redis.client.js';

/**
 * BullMQ Queue instances
 * Reuses the singleton Redis connection
 */

export const deadLetterQueue = new Queue('dead-letter', { connection: redis });
export const reconciliationQueue = new Queue('reconciliation', { connection: redis });
export const videoRegenerationQueue = new Queue('video-regeneration', { connection: redis });
export const videoRefreshQueue = new Queue('video-refresh', { connection: redis });
export const syncAlertQueue = new Queue('sync-alert', { connection: redis });
export const asyncEngagementQueue = new Queue('async-engagement', { connection: redis });

// Optional: Basic error logging for queues
deadLetterQueue.on('error', (err) => console.error('[DeadLetter] Queue error:', err.message));

export default {
  deadLetterQueue,
  reconciliationQueue,
  videoRegenerationQueue,
  videoRefreshQueue,
  syncAlertQueue,
  asyncEngagementQueue
};
