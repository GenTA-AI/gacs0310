import 'dotenv/config';
import express from 'express';
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

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[Server] Webhook receiver listening on port ${port}`);
  });

  if (process.env.SYNC_WORKER_ENABLED === 'true') {
    buildSyncEventWorker();
    console.log('[Startup] Sync event worker started');
  }
}

export default app;
