# Smart DID Full Sync — Phase B

## Overview

Phase B adds the ability for GACS to pull Smart DID book video scenario
recommendations and process video generation completion events. It extends
the existing webhook/sync stack with a new table and service layer.

## Components

### 1. Migration 015 — `book_video_scenarios`
- Per-book Smart DID scenario recommendations (mood, educational, etc.)
- Time-series signals from Smart DID (engagement, popularity, playback state)
- Canonical book metadata stays in `books` and is NEVER overwritten
- Separate from `scene_results` (which is per-job deterministic outputs)

### 2. `SmartDIDPullClient` (`src/integrations/smart-did-pull.client.js`)
- HTTP client for pulling video scenario data from Smart DID API
- Configurable: `SMART_DID_API_BASE_URL`, `SMART_DID_API_TOKEN`, timeout
- Supports pagination via `nextPageToken`

### 3. `BookVideoScenariosService` (`src/sync/did/book-video-scenarios.service.js`)
- `upsertScenario()` — insert or update a scenario (conflict on book_id + scenario_type)
- `updateScenarioState()` — mark scenarios as processing/completed/failed
- `getPendingScenarios()` — fetch pending scenarios ordered by priority
- `pullAndStoreScenarios()` — pull from Smart DID + store all received scenarios

### 4. `video.done` Handler (`src/webhooks/events/video.done.js`)
- Webhook event handler for video generation completion
- Resolves external book ID → GACS book UUID
- Updates `book_video_scenarios` state (completed/failed)
- Updates `video_jobs` status and video URL
- Falls back to reconciliation queue for unknown books

### 5. BullMQ Worker (`src/sync/did/book-video-scenarios.worker.js`)
- Queue: `book-video-scenarios`
- Actions: `pull` (fetch from Smart DID), `process` (mark as processing)
- Run directly: `node src/sync/did/book-video-scenarios.worker.js`

## Data Ownership

| Data | Owner | Notes |
|---|---|---|
| Book title, author, description | GACS `books` table | NEVER overwritten by Smart DID |
| Scenario recommendations | Smart DID → `book_video_scenarios` | Time-series, append-only |
| Video generation state | GACS `video_jobs` | Updated by webhook events |
| Video output (scenes) | GACS `scene_results` | Per-job deterministic outputs |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SMART_DID_API_BASE_URL` | — | Smart DID API base URL (required) |
| `SMART_DID_API_TOKEN` | — | Bearer token for API auth |
| `DID_SYNC_REQUEST_TIMEOUT_MS` | 10000 | HTTP request timeout |
| `DID_SYNC_WORKER_CONCURRENCY` | 1 | Worker concurrency |

## Testing

```bash
npm test              # All 119+ tests
npm run test:e2e      # E2E tests (11 tests)
```
