import { jest } from '@jest/globals';

const mockDb = { query: jest.fn(), connect: jest.fn() };
const mockClient = { query: jest.fn(), release: jest.fn() };

jest.unstable_mockModule('../../src/db/client.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../../src/queue/base-worker.js', () => ({
  createWorker: jest.fn(() => ({ on: jest.fn() })),
  onWorkerEvents: jest.fn(),
}));
jest.unstable_mockModule('bullmq', () => ({
  Worker: jest.fn(),
  Queue: jest.fn(),
}));

let processNextEvent;

beforeAll(async () => {
  const mod = await import('../../src/sync/did/sync-event.worker.js');
  processNextEvent = mod.processNextEvent;
});

beforeEach(() => {
  mockDb.query.mockReset();
  mockClient.query.mockReset();
  mockDb.connect.mockReset();
  mockDb.connect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [] });
});

describe('SyncEventWorker processNextEvent', () => {
  it('returns no_events when queue is empty', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const result = await processNextEvent();
    expect(result.status).toBe('no_events');
  });

  it('processes event through full pipeline: drift → upsert → fingerprint → log', async () => {
    mockDb.query
      // getNextPending
      .mockResolvedValueOnce({ rows: [{ event_id: 'evt-1', book_id: 'uuid-1', idempotency_key: 'ext-1:video.done', payload_json: { status: 'completed', requestCount: 5 }, retry_count: 0, received_at: new Date() }] })
      // setProcessing
      .mockResolvedValueOnce({ rows: [] })
      // hasDrifted — no existing fingerprint, so drifted=true
      .mockResolvedValueOnce({ rows: [] })
      // Transaction: BEGIN
      .mockResolvedValueOnce({ rows: [] })
      // connect for CanonicalUpsert
      .mockResolvedValueOnce(mockClient);

    mockClient.query
      // CanonicalUpsert transaction
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ book_id: 'uuid-1' }] }) // upsertBooks
      .mockResolvedValueOnce({ rows: [] }) // upsertExternalRefs
      .mockResolvedValueOnce({ rows: [] }) // upsertEngagement
      .mockResolvedValueOnce({ rows: [] }) // upsertVideoState
      .mockResolvedValueOnce({ rows: [] }) // upsertVideoJobs
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    // After CanonicalUpsert releases client, mocks continue on main db
    mockDb.query
      // recordFingerprint
      .mockResolvedValueOnce({ rows: [{ fingerprint_id: 'fp-1', content_hash: 'abc', hash_changed_at: new Date() }] })
      // setProcessed
      .mockResolvedValueOnce({ rows: [] })
      // logSync
      .mockResolvedValueOnce({ rows: [] });

    const result = await processNextEvent();
    expect(result.status).toBe('ok');
    expect(result.eventId).toBe('evt-1');
  });
});
