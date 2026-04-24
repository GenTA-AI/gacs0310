import 'dotenv/config';
import express from 'express';
import webhookRouter from './webhooks/index.js';
import { validateEnv } from './webhooks/did.handler.js';

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

// 4. Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[Server] Webhook receiver listening on port ${port}`);
  });
}

export default app;
