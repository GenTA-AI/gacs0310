import crypto from 'crypto';
import { SmartDIDPullClient } from '../../integrations/smart-did-pull.client.js';

export class BookVideoScenariosService {
  constructor({
    client = new SmartDIDPullClient(),
    db,
  } = {}) {
    this.client = client;
    this.db = db;
  }

  async pullAndStoreScenarios({ bookId, externalBookId } = {}) {
    try {
      const result = await this.client.fetchBookScenarios({ bookId: externalBookId || bookId });

      if (!result.scenarios || result.scenarios.length === 0) {
        return { status: 'skipped', reason: 'no_scenarios_returned', enqueued: [] };
      }

      const processed = [];
      for (const scenario of result.scenarios) {
        const stored = await this.upsertScenario({ bookId, scenario });
        processed.push(stored);
      }

      return {
        status: 'ok',
        count: processed.length,
        scenarios: processed,
        hasMore: result.hasMore,
        nextPageToken: result.nextPageToken,
      };
    } catch (err) {
      console.error(`[BookVideoScenariosService] pullAndStoreScenarios error: ${err.message}`);
      return { status: 'error_logged' };
    }
  }

  async upsertScenario({ bookId, scenario }) {
    const scenarioType = scenario.scenarioType || scenario.type || 'default';
    const state = scenario.state || 'pending';
    const priority = scenario.priority != null ? scenario.priority : 0;
    const requestPayload = scenario.requestPayload || scenario.request || null;
    const responsePayload = scenario.responsePayload || scenario.response || null;
    const externalId = scenario.externalId || scenario.id || crypto.randomUUID();
    const requestedAt = scenario.requestedAt || scenario.requested_at || null;

    const result = await this.db.query(
      `INSERT INTO book_video_scenarios
        (book_id, scenario_type, state, priority, request_payload, response_payload, external_id, requested_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (book_id, scenario_type)
       DO UPDATE SET
         state = EXCLUDED.state,
         priority = EXCLUDED.priority,
         request_payload = COALESCE(EXCLUDED.request_payload, book_video_scenarios.request_payload),
         response_payload = COALESCE(EXCLUDED.response_payload, book_video_scenarios.response_payload),
         external_id = COALESCE(EXCLUDED.external_id, book_video_scenarios.external_id),
         requested_at = COALESCE(EXCLUDED.requested_at, book_video_scenarios.requested_at),
         updated_at = NOW()
       WHERE book_video_scenarios.state IS DISTINCT FROM EXCLUDED.state
          OR book_video_scenarios.priority IS DISTINCT FROM EXCLUDED.priority
       RETURNING id, scenario_type, state, priority, external_id, created_at, updated_at`,
      [bookId, scenarioType, state, priority, JSON.stringify(requestPayload), JSON.stringify(responsePayload), externalId, requestedAt],
    );

    return result.rows[0];
  }

  async updateScenarioState({ bookId, scenarioType, state, errorMessage } = {}) {
    try {
      const result = await this.db.query(
        `UPDATE book_video_scenarios
         SET state = $1,
             error_message = $2,
             completed_at = CASE WHEN $1 IN ('completed', 'failed', 'skipped') THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE book_id = $3
           AND scenario_type = $4
         RETURNING id, scenario_type, state, external_id, completed_at`,
        [state, errorMessage || null, bookId, scenarioType],
      );

      if (result.rows.length === 0) {
        return { status: 'skipped', reason: 'scenario_not_found' };
      }

      return { status: 'ok', scenario: result.rows[0] };
    } catch (err) {
      console.error(`[BookVideoScenariosService] updateScenarioState error: ${err.message}`);
      return { status: 'error_logged' };
    }
  }

  async getPendingScenarios({ limit = 50 } = {}) {
    try {
      const result = await this.db.query(
        `SELECT id, book_id, scenario_type, state, priority, external_id, request_payload, created_at
         FROM book_video_scenarios
         WHERE state = 'pending'
         ORDER BY priority DESC, created_at ASC
         LIMIT $1`,
        [limit],
      );
      return result.rows;
    } catch (err) {
      console.error(`[BookVideoScenariosService] getPendingScenarios error: ${err.message}`);
      return [];
    }
  }
}
