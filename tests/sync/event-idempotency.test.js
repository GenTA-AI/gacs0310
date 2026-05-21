import { jest } from '@jest/globals';

const mockDb = { query: jest.fn() };
let SyncEventsRepository;

beforeAll(async () => {
  const mod = await import('../../src/sync/did/sync-events.repository.js');
  SyncEventsRepository = mod.SyncEventsRepository;
});

beforeEach(() => {
  mockDb.query.mockReset();
});

describe('SyncEventsRepository', () => {
  it('insertEvent inserts and returns inserted=true', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ event_id: 'evt-1', status: 'pending' }] });
    const repo = new SyncEventsRepository({ db: mockDb });
    const result = await repo.insertEvent({
      eventId: 'evt-1', bookId: 'uuid-1', eventType: 'video.done',
      payload: { status: 'completed' }, idempotencyKey: 'evt-1:video.done',
    });
    expect(result.inserted).toBe(true);
    expect(result.eventId).toBe('evt-1');
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT (idempotency_key)');
  });

  it('insertEvent returns duplicate when ON CONFLICT does nothing', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const repo = new SyncEventsRepository({ db: mockDb });
    const result = await repo.insertEvent({
      eventId: 'evt-1', bookId: 'uuid-1', eventType: 'video.done',
      payload: {}, idempotencyKey: 'evt-1:video.done',
    });
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe('duplicate');
  });

  it('insertEvent catches 23505 duplicate error code', async () => {
    const err = new Error('duplicate key');
    err.code = '23505';
    mockDb.query.mockRejectedValue(err);
    const repo = new SyncEventsRepository({ db: mockDb });
    const result = await repo.insertEvent({
      eventId: 'evt-1', bookId: 'uuid-1', eventType: 'video.done',
      payload: {}, idempotencyKey: 'evt-1:video.done',
    });
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe('duplicate');
  });

  it('getNextPending uses FOR UPDATE SKIP LOCKED', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ event_id: 'evt-1', book_id: 'uuid-1', payload_json: {}, retry_count: 0 }] });
    const repo = new SyncEventsRepository({ db: mockDb });
    const row = await repo.getNextPending();
    expect(row.event_id).toBe('evt-1');
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('getNextPending returns null when no pending events', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const repo = new SyncEventsRepository({ db: mockDb });
    const row = await repo.getNextPending();
    expect(row).toBeNull();
  });

  it('scheduleRetry increments retry_count and sets status to retry', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ retry_count: 1, status: 'retry' }] });
    const repo = new SyncEventsRepository({ db: mockDb });
    const result = await repo.scheduleRetry('evt-1', 'some error');
    expect(result.retryCount).toBe(1);
    expect(result.status).toBe('retry');
  });

  it('scheduleRetry escalates to failed after 5 retries', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ retry_count: 5, status: 'failed' }] });
    const repo = new SyncEventsRepository({ db: mockDb });
    const result = await repo.scheduleRetry('evt-1', 'terminal error');
    expect(result.retryCount).toBe(5);
    expect(result.status).toBe('failed');
  });
});
