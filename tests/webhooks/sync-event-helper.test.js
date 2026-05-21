import { jest } from '@jest/globals';

const mockDb = { query: jest.fn() };
let insertSyncEvent;

beforeAll(async () => {
  const mod = await import('../../src/webhooks/helpers/sync-event.helper.js');
  insertSyncEvent = mod.insertSyncEvent;
});

beforeEach(() => {
  mockDb.query.mockReset();
});

describe('SyncEventHelper', () => {
  it('insertSyncEvent resolves external ID to UUID and inserts event', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ book_id: 'uuid-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await insertSyncEvent({
      eventId: 'evt-1', bookId: 'ext-1', eventType: 'video.done',
      payload: { status: 'completed' }, idempotencyKey: 'evt-1:video.done', db: mockDb,
    });

    expect(result.status).toBe('ok');
    expect(result.bookId).toBe('uuid-1');

    const refSql = mockDb.query.mock.calls[0][0];
    expect(refSql).toContain('book_external_refs');
    expect(refSql).toContain("source_system = 'smart_did'");

    const insertSql = mockDb.query.mock.calls[1][0];
    expect(insertSql).toContain('INSERT INTO smart_did_sync_events');
    expect(insertSql).toContain('ON CONFLICT (idempotency_key)');
  });

  it('insertSyncEvent skips unknown books', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });

    const result = await insertSyncEvent({
      eventId: 'evt-1', bookId: 'unknown-ext', eventType: 'video.done',
      payload: {}, idempotencyKey: 'evt-1:video.done', db: mockDb,
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('unknown_book');
  });

  it('insertSyncEvent logs error on DB failure', async () => {
    mockDb.query.mockRejectedValue(new Error('Connection lost'));

    const result = await insertSyncEvent({
      eventId: 'evt-1', bookId: 'ext-1', eventType: 'video.done',
      payload: {}, idempotencyKey: 'evt-1:video.done', db: mockDb,
    });

    expect(result.status).toBe('error_logged');
  });
});
