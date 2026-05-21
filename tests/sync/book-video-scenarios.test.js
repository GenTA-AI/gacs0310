import { jest } from '@jest/globals';
import crypto from 'crypto';

jest.unstable_mockModule('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

jest.unstable_mockModule('../../src/queue/redis.client.js', () => ({
  default: { on: jest.fn(), quit: jest.fn() },
}));

const { SmartDIDPullClient } = await import('../../src/integrations/smart-did-pull.client.js');
const { BookVideoScenariosService } = await import('../../src/sync/did/book-video-scenarios.service.js');
const { handle: videoDoneHandler } = await import('../../src/webhooks/events/video.done.js');
const { buildBookVideoScenariosWorker } = await import('../../src/sync/did/book-video-scenarios.worker.js');

describe('Phase B: Book Video Scenarios', () => {
  describe('SECTION 1: SmartDIDPullClient', () => {
    it('1.1 throws if baseUrl is missing', () => {
      expect(() => new SmartDIDPullClient({ baseUrl: null })).toThrow('SMART_DID_API_BASE_URL');
    });

    it('1.2 throws if fetch is missing', () => {
      expect(() => new SmartDIDPullClient({ baseUrl: 'http://example.com', fetchImpl: null })).toThrow('fetch');
    });

    it('1.3 fetchBookScenarios returns empty for no scenarios', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ scenarios: [] }),
      });
      const client = new SmartDIDPullClient({ baseUrl: 'http://example.com', fetchImpl: mockFetch });
      const result = await client.fetchBookScenarios({ bookId: 'book-1' });
      expect(result.scenarios).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('1.4 fetchBookScenarios returns scenarios with pages', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          scenarios: [{ id: 's1', type: 'mood', priority: 5 }],
          nextPageToken: 'token-2',
          hasMore: true,
        }),
      });
      const client = new SmartDIDPullClient({ baseUrl: 'http://example.com', fetchImpl: mockFetch });
      const result = await client.fetchBookScenarios({ limit: 10 });
      expect(result.scenarios).toHaveLength(1);
      expect(result.nextPageToken).toBe('token-2');
      expect(result.hasMore).toBe(true);
    });

    it('1.5 fetchBookScenarios handles API error', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
      const client = new SmartDIDPullClient({ baseUrl: 'http://example.com', fetchImpl: mockFetch });
      await expect(client.fetchBookScenarios()).rejects.toThrow('Smart DID API failed with status 500');
    });

    it('1.6 fetchBookScenarios builds URL correctly', async () => {
      let calledUrl;
      const mockFetch = jest.fn().mockImplementation((url) => {
        calledUrl = url;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ scenarios: [] }) });
      });
      const client = new SmartDIDPullClient({ baseUrl: 'http://example.com/', fetchImpl: mockFetch });
      await client.fetchBookScenarios({ bookId: 'ext-1', after: '2026-01-01T00:00:00.000Z', limit: 25 });
      expect(calledUrl.searchParams.get('bookId')).toBe('ext-1');
      expect(calledUrl.searchParams.get('after')).toBe('2026-01-01T00:00:00.000Z');
      expect(calledUrl.searchParams.get('limit')).toBe('25');
    });

    it('1.7 fetchBookScenarios includes auth header when token set', async () => {
      let calledHeaders;
      const mockFetch = jest.fn().mockImplementation((url, opts) => {
        calledHeaders = opts.headers;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ scenarios: [] }) });
      });
      const client = new SmartDIDPullClient({ baseUrl: 'http://example.com', apiToken: 'tok-1', fetchImpl: mockFetch });
      await client.fetchBookScenarios();
      expect(calledHeaders.Authorization).toBe('Bearer tok-1');
    });
  });

  describe('SECTION 2: BookVideoScenariosService', () => {
    let mockDb;
    let mockClient;
    let service;

    beforeEach(() => {
      mockDb = { query: jest.fn() };
      mockClient = { fetchBookScenarios: jest.fn() };
      service = new BookVideoScenariosService({ client: mockClient, db: mockDb });
    });

    it('2.1 upsertScenario inserts new scenario', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: 1, scenario_type: 'mood', state: 'pending', priority: 5, external_id: 'ext-1', created_at: new Date(), updated_at: new Date() }] });
      const result = await service.upsertScenario({ bookId: 'book-1', scenario: { scenarioType: 'mood', priority: 5 } });
      expect(result.id).toBe(1);
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO book_video_scenarios'), expect.any(Array));
    });

    it('2.2 upsertScenario updates existing on conflict', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: 1, scenario_type: 'mood', state: 'completed', priority: 10, external_id: 'ext-1', created_at: new Date(), updated_at: new Date() }] });
      const result = await service.upsertScenario({ bookId: 'book-1', scenario: { scenarioType: 'mood', priority: 10, state: 'completed' } });
      expect(result.state).toBe('completed');
    });

    it('2.3 upsertScenario defaults missing fields', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: 1, scenario_type: 'default', state: 'pending', priority: 0, external_id: expect.any(String), created_at: new Date(), updated_at: new Date() }] });
      const result = await service.upsertScenario({ bookId: 'book-1', scenario: {} });
      expect(result.scenario_type).toBe('default');
      expect(result.priority).toBe(0);
    });

    it('2.4 updateScenarioState updates state to completed', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: 1, scenario_type: 'mood', state: 'completed', external_id: 'ext-1', completed_at: new Date() }] });
      const result = await service.updateScenarioState({ bookId: 'book-1', scenarioType: 'mood', state: 'completed' });
      expect(result.status).toBe('ok');
      expect(result.scenario.state).toBe('completed');
    });

    it('2.5 updateScenarioState returns skipped for missing scenario', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      const result = await service.updateScenarioState({ bookId: 'book-1', scenarioType: 'nonexistent', state: 'completed' });
      expect(result.status).toBe('skipped');
    });

    it('2.6 getPendingScenarios returns pending scenarios ordered by priority', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: 1, book_id: 'book-1', scenario_type: 'mood', state: 'pending', priority: 10, external_id: 'ext-1', request_payload: null, created_at: new Date() }] });
      const results = await service.getPendingScenarios({ limit: 10 });
      expect(results).toHaveLength(1);
      expect(results[0].priority).toBe(10);
    });

    it('2.7 getPendingScenarios returns empty array on error', async () => {
      mockDb.query.mockRejectedValue(new Error('DB down'));
      const results = await service.getPendingScenarios();
      expect(results).toEqual([]);
    });

    it('2.8 pullAndStoreScenarios returns skipped for empty response', async () => {
      const client = { fetchBookScenarios: jest.fn().mockResolvedValue({ scenarios: [], hasMore: false }) };
      const svc = new BookVideoScenariosService({ client, db: mockDb });
      const result = await svc.pullAndStoreScenarios({ bookId: 'book-1' });
      expect(result.status).toBe('skipped');
    });

    it('2.9 pullAndStoreScenarios stores each scenario', async () => {
      const scenarios = [{ scenarioType: 'mood', priority: 5 }, { scenarioType: 'educational', priority: 3 }];
      const client = { fetchBookScenarios: jest.fn().mockResolvedValue({ scenarios, hasMore: false }) };
      mockDb.query.mockResolvedValue({ rows: [{ id: 1, scenario_type: 'mood', state: 'pending', priority: 5, external_id: 'ext-1', created_at: new Date(), updated_at: new Date() }] });
      const svc = new BookVideoScenariosService({ client, db: mockDb });
      const result = await svc.pullAndStoreScenarios({ bookId: 'book-1' });
      expect(result.status).toBe('ok');
      expect(result.count).toBe(2);
    });
  });

  describe('SECTION 3: video.done Handler', () => {
    let mockDb;
    let mockQueue;

    beforeEach(() => {
      mockDb = { query: jest.fn() };
      mockQueue = { add: jest.fn().mockResolvedValue({}) };
    });

    it('3.1 returns skipped for missing bookId', async () => {
      const result = await videoDoneHandler({ data: {} }, mockDb, mockQueue);
      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('missing_book_id');
    });

    it('3.2 skips unknown book gracefully', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      const result = await videoDoneHandler({ eventId: 'evt-1', data: { bookId: 'unknown-book' } }, mockDb, mockQueue);
      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('unknown_book');
    });

    it('3.3 inserts sync event on completion', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ book_id: 'gacs-book-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const payload = { eventId: 'evt-1', data: { bookId: 'ext-1', scenarioType: 'mood', status: 'completed', videoUrl: 'https://cdn.example.com/video.mp4' } };
      const result = await videoDoneHandler(payload, mockDb, mockQueue);
      expect(result.status).toBe('ok');
      expect(result.queuedForSync).toBe(true);
    });

    it('3.4 inserts sync event on failure', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ book_id: 'gacs-book-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const payload = { eventId: 'evt-1', data: { bookId: 'ext-1', scenarioType: 'mood', status: 'failed', errorMessage: 'Generation timeout', videoUrl: null } };
      const result = await videoDoneHandler(payload, mockDb, mockQueue);
      expect(result.status).toBe('ok');
      expect(result.queuedForSync).toBe(true);
    });

    it('3.5 inserts sync event without scenarioType', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ book_id: 'gacs-book-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const payload = { eventId: 'evt-1', data: { bookId: 'ext-1', videoUrl: 'https://cdn.example.com/video.mp4' } };
      const result = await videoDoneHandler(payload, mockDb, mockQueue);
      expect(result.status).toBe('ok');
      expect(result.queuedForSync).toBe(true);
    });

    it('3.6 returns error_logged on exception', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection lost'));
      const payload = { eventId: 'evt-1', data: { bookId: 'ext-1' } };
      const result = await videoDoneHandler(payload, mockDb, mockQueue);
      expect(result.status).toBe('error_logged');
    });
  });

  describe('SECTION 4: BookVideoScenarios Worker', () => {
    it('4.1 buildBookVideoScenariosWorker creates a Worker', () => {
      const worker = buildBookVideoScenariosWorker();
      expect(worker).toBeDefined();
      expect(typeof worker.on).toBe('function');
    });
  });
});
