import crypto from 'crypto';

/**
 * Startup validation for DID_WEBHOOK_SECRET
 */
export function validateEnv() {
  if (!process.env.DID_WEBHOOK_SECRET || process.env.DID_WEBHOOK_SECRET.length < 16) {
    throw new Error('[FATAL] DID_WEBHOOK_SECRET must be set and >= 16 characters');
  }
}

/**
 * Main webhook handler for POST /webhooks/did
 */
export async function handleWebhook(req, res) {
  const startTime = Date.now();
  const rawBody = req.body; // Expect Buffer from express.raw()
  
  // 1. HMAC Validation
  const signature = req.headers['x-did-signature'];
  if (!signature) {
    console.error(`[${Date.now()}] webhook:auth_error Missing signature`);
    return res.status(401).json({ error: 'Missing signature', eventId: null });
  }

  try {
    const computed = crypto
      .createHmac('sha256', process.env.DID_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))) {
      console.error(`[${Date.now()}] webhook:auth_error Invalid signature`);
      return res.status(401).json({ error: 'Invalid signature', eventId: null });
    }
  } catch (err) {
    console.error(`[${Date.now()}] webhook:auth_error Validation failed: ${err.message}`);
    return res.status(401).json({ error: 'Invalid signature', eventId: null });
  }

  // 2. Payload Parsing
  let payload;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch (err) {
    console.error(`[${Date.now()}] webhook:parse_error Invalid JSON`);
    return res.status(400).json({ error: 'Invalid payload', details: 'JSON parse failed' });
  }

  const { eventId, eventType, occurredAt, data } = payload;

  // 3. Payload Validation
  const requiredFields = ['eventId', 'eventType', 'occurredAt', 'data'];
  const missing = requiredFields.filter(f => !payload[f]);
  if (missing.length > 0) {
    console.error(`[${Date.now()}] webhook:validation_error Missing fields: ${missing.join(', ')}`);
    return res.status(400).json({ error: 'Invalid payload', missing });
  }

  console.log(`[${Date.now()}] webhook:in eventId=${eventId} type=${eventType}`);

  // 4. Event Routing
  try {
    let handler;
    switch (eventType) {
      case 'video.requested':
        handler = (await import('./events/video.requested.js')).handle;
        break;
      case 'video.updated':
        handler = (await import('./events/video.updated.js')).handle;
        break;
      case 'video.deleted':
        handler = (await import('./events/video.deleted.js')).handle;
        break;
      case 'video.expired':
        handler = (await import('./events/video.expired.js')).handle;
        break;
      case 'sync.completed':
        handler = (await import('./events/sync.completed.js')).handle;
        break;
      default:
        console.warn(`[${Date.now()}] webhook:ignored Unknown eventType: ${eventType}`);
        return res.status(200).json({ status: 'ignored', eventId });
    }

    // NOTE: Handlers for Prompt D-F will be implemented later.
    // For now, we wrap the call in a try/catch.
    // In Prompt G, we will add the runWithFallback wrapper.
    
    // Placeholder for db and queue which will be passed in Prompt G
    const db = {}; 
    const queue = {};

    const result = await handler(payload, db, queue);
    
    const durationMs = Date.now() - startTime;
    console.log(`[${Date.now()}] webhook:out eventId=${eventId} status=${result.status} durationMs=${durationMs}`);
    
    if (durationMs > 150) {
      console.warn(`[WARN] SLOW webhook ${eventId} took ${durationMs}ms (approaching 200ms limit)`);
    }

    return res.status(200).json({
      status: result.status || 'ok',
      eventId,
      durationMs
    });

  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error(`[${Date.now()}] webhook:error eventId=${eventId} error=${err.message} durationMs=${durationMs}`);
    return res.status(200).json({ status: 'error_logged', eventId });
  }
}
