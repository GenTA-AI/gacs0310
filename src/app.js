import 'dotenv/config';
import express from 'express';
import redis from './queue/redis.client.js';
import pool from './db/client.js';
import webhookRouter from './webhooks/index.js';
import { validateEnv } from './webhooks/did.handler.js';
import { buildSyncEventWorker } from './sync/did/sync-event.worker.js';

try {
  validateEnv();
  console.log('[Startup] Environment validation passed');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();
const port = process.env.WEBHOOK_PORT || 3000;

app.use(express.raw({ type: 'application/json' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/webhooks', webhookRouter);

let server;
const activeWorkers = [];

async function shutdown(signal) {
  console.log(`[Shutdown] ${signal} received — draining resources...`);
  const start = Date.now();

  if (server) {
    server.close();
  }

  await Promise.allSettled(activeWorkers.map(w => w.close()));
  await redis.quit();
  await pool.end();

  const elapsed = Date.now() - start;
  console.log(`[Shutdown] Completed in ${elapsed}ms`);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    console.log(`[Server] Webhook receiver listening on port ${port}`);
  });

  if (process.env.SYNC_WORKER_ENABLED === 'true') {
    const worker = buildSyncEventWorker();
    activeWorkers.push(worker);
    console.log('[Startup] Sync event worker started');
  }
}

export default app;
