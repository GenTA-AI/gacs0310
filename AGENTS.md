# Coding Standards for Challenge 1 Migrations

## SQL Migration Standards

1. **File Naming:**
   - Format: `NNN_description_up.sql` and `NNN_description_down.sql`
   - Example: `001_create_book_engagement_up.sql`
   - Increment NNN sequentially (001, 002, 003, etc.)

2. **UP Migration Requirements:**
   - CREATE TABLE or ALTER TABLE statements
   - Explicit column types: BIGSERIAL, UUID, INT, DECIMAL, VARCHAR, TIMESTAMP, BOOLEAN, TEXT
   - PRIMARY KEY: id BIGSERIAL PRIMARY KEY (for new tables)
   - FOREIGN KEY: References with ON DELETE CASCADE where appropriate
   - Timestamps: Every table has created_at and updated_at with CURRENT_TIMESTAMP defaults
   - Indexes: On foreign keys, timestamps, and other frequently queried columns
   - Constraints: NOT NULL, UNIQUE, CHECK constraints as needed
   - Permissions: GRANT SELECT, INSERT, UPDATE, DELETE to gacs_user
   - Comments: /* Table description */ above CREATE statements

3. **DOWN Migration Requirements:**
   - DROP TABLE IF EXISTS ... CASCADE for tables
   - ALTER TABLE DROP COLUMN IF EXISTS for column additions
   - Reverse order of creation
   - Handle dependent objects

4. **Special Rules:**
   - No transactions in DDL (PostgreSQL handles atomicity)
   - For ALTER TABLE: one logical change per statement
   - Column additions should include DEFAULT for existing data
   - UNIQUE constraints need explicit names: CONSTRAINT constraint_name UNIQUE(...)
   - Indexes should have descriptive names: CREATE INDEX idx_table_column ON table(column)

5. **Testing After Each Migration:**
   - Verify with \dt (list tables)
   - Verify columns with \d table_name
   - For ALTERs, check with SELECT * FROM table LIMIT 1
   - Run DOWN migration and verify with \dt

## Database Context
- Database: gacs_staging
- Host: staging.gacs.internal
- User: gacs_user
- Port: 5432
- Existing tables: books, video_jobs, video_queue

---

## Webhook Standards (Task 1.2)

### Core Principle
**Canonical metadata (book titles, authors, descriptions) lives in GACS and is NEVER overwritten by Smart DID signals.**
Smart DID contributions are time-series signals (engagement, popularity, recommendations), not metadata corrections.

### Stack
- Runtime: Node.js (Express or Fastify, match existing project)
- Queue: BullMQ (async job processing, installed early in Prompt A)
- Cache: Redis (ioredis client, fail-open policy)
- DB: PostgreSQL (pg or existing ORM)

### File Naming
- src/webhooks/did.handler.js        — main route + HMAC validation
- src/webhooks/idempotency.js        — Redis idempotency middleware
- src/webhooks/fallback.js           — error handling + timeout guard
- src/queue/bullmq.client.js         — queue instances (dead-letter, reconciliation, etc.)
- src/webhooks/events/               — one file per event type
  - video.requested.js
  - video.updated.js
  - video.deleted.js
  - video.expired.js
  - sync.completed.js
- tests/webhooks/                    — comprehensive test suite
  - master.test.js                   — 40 tests: happy path + concurrency + chaos

### HMAC Validation
- Header: X-DID-Signature
- Algorithm: HMAC-SHA256
- Secret: process.env.DID_WEBHOOK_SECRET (validated at startup, non-empty required)
- Timing-safe comparison: crypto.timingSafeEqual()
- Reject with 401 if invalid signature or missing secret env var

### Idempotency Strategy
- Key format: webhook:did:{eventId}
- TTL: 86400 seconds (24 hours)
- On duplicate: return 200 { status: 'duplicate' } (silent dedup)
- On Redis down: return isDuplicate: false, allow through (fail-open)
- Use Redis SET NX (atomic check-and-set)

### Event Handler Contract
Each handler must export:
  async function handle(payload, db, queue) { ... }
  Returns: { status: 'ok' | 'skipped', reason?: string, enqueued?: array }
  Never throws — all errors caught and logged

### Critical Latency Rules
- Total webhook response time: < 200ms (hard limit)
- Critical path (HMAC + idempotency + handler dispatch): < 100ms
- Non-critical writes (engagement snapshots, did_sync_log): defer to async BullMQ after response
- Never chain sequential DB queries in handler — use SELECT + batch or defer to queue job
- Measure: start timer before HMAC, stop timer after response.json()

### Data Ownership
- GACS: canonical book metadata, generation workflows, AI analysis
- Smart DID: engagement signals, recommendation context, playback state, URLs
- Intersection: DO NOT OVERWRITE canonical fields. Append engagement signals to time-series tables only.

### Fallback Policy
- Handler timeout (> 180ms): return 200 { status: 'timeout_logged' }, send to dead-letter queue
- Handler crash: catch, return 200 { status: 'error_logged' }, send to dead-letter queue
- Dead-letter queue down: log to console only, still return 200
- Never return 5xx to Smart DID — always 2xx (except 401 for auth, 400 for malformed payload)
- Idempotency takes precedence: always check Redis before handler execution
