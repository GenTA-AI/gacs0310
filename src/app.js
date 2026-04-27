import 'dotenv/config';
import express from 'express';
import webhookRouter from './webhooks/index.js';
import { validateEnv } from './webhooks/did.handler.js';
import { scheduleDidIncrementalSync } from './sync/did/incremental-sync.scheduler.js';

// 1. Startup validation
try {
  validateEnv();
  console.log('[Startup] Environment validation passed');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();
const port = process.env.WEBHOOK_PORT || 3000;

// 2. Middleware
// IMPORTANT: express.raw() must be before express.json() for HMAC validation
app.use(express.raw({ type: 'application/json' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 3. Routes
app.use('/webhooks', webhookRouter);

// 4. Optional background scheduler
async function startBackgroundJobs() {
  if (process.env.NODE_ENV === 'test') return;

  try {
    const result = await scheduleDidIncrementalSync();
    console.log('[Startup] DID incremental sync scheduler:', result);
  } catch (err) {
    console.error('[Startup] Failed to schedule DID incremental sync:', err.message);
  }
}

// 5. Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, async () => {
    console.log(`[Server] Webhook receiver listening on port ${port}`);
    await startBackgroundJobs();
  });
}

export default app;
