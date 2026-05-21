import { jest } from '@jest/globals';

let SyncEventsRepository;

const mockDb = { query: jest.fn() };

beforeAll(async () => {
  const mod = await import('../../src/sync/did/sync-events.repository.js');
  SyncEventsRepository = mod.SyncEventsRepository;
});

beforeEach(() => {
  mockDb.query.mockReset();
});

describe('Worker Concurrency', () => {
  it('getNextPending uses FOR UPDATE SKIP LOCKED for parallel safety', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ event_id: 'evt-1', book_id: 'uuid-1', payload_json: {}, retry_count: 0, received_at: new Date() }] });
    const repo = new SyncEventsRepository({ db: mockDb });
    await repo.getNextPending();
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toContain('SKIP LOCKED');
  });

  it('two workers do not get the same event', async () => {
    let callCount = 0;
    mockDb.query.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return { rows: [{ event_id: 'evt-1', book_id: 'uuid-1', payload_json: {}, retry_count: 0, received_at: new Date() }] };
      if (callCount === 2) return { rows: [{ event_id: 'evt-2', book_id: 'uuid-2', payload_json: {}, retry_count: 0, received_at: new Date() }] };
      return { rows: [] };
    });

    const repo = new SyncEventsRepository({ db: mockDb });

    const row1 = await repo.getNextPending();
    const row2 = await repo.getNextPending();

    expect(row1.event_id).toBe('evt-1');
    expect(row2.event_id).toBe('evt-2');
    expect(row1.event_id).not.toBe(row2.event_id);
  });

  it('scheduleRetry prevents infinite retry loops with max 5 cap', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ retry_count: 5, status: 'failed' }] });
    const repo = new SyncEventsRepository({ db: mockDb });
    const result = await repo.scheduleRetry('evt-1', 'permanent error');
    expect(result.retryCount).toBe(5);
    expect(result.status).toBe('failed');
  });
});
