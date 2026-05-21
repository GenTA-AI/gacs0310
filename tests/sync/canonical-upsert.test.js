import { jest } from '@jest/globals';

const mockClient = { query: jest.fn(), release: jest.fn() };
const mockDb = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
};

let CanonicalBookUpsertService;

beforeAll(async () => {
  const mod = await import('../../src/sync/did/canonical-book-upsert.service.js');
  CanonicalBookUpsertService = mod.CanonicalBookUpsertService;
});

beforeEach(() => {
  mockDb.query.mockReset();
  mockClient.query.mockReset();
  mockDb.connect.mockClear();
});

describe('CanonicalBookUpsertService', () => {
  const baseData = {
    bookId: 'uuid-1',
    externalBookId: 'ext-1',
    requestCount: 10,
    rankingScore: 0.85,
    lastRequestedAt: '2026-01-15T09:00:00Z',
    status: 'REQUESTED',
    videoUrl: 'https://example.com/video.mp4',
    expiresAt: '2026-02-15T00:00:00Z',
    retryCount: 2,
  };

  it('upsertBook runs all 5 upserts in a transaction', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    const svc = new CanonicalBookUpsertService({ db: mockDb });

    await svc.upsertBook(baseData);

    expect(mockDb.connect).toHaveBeenCalledTimes(1);
    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toContain('INSERT INTO books');
    expect(calls[2]).toContain('INSERT INTO book_external_refs');
    expect(calls[2]).toContain('ON CONFLICT ON CONSTRAINT uq_book_external_refs_source_external');
    expect(calls[3]).toContain('INSERT INTO book_did_engagement');
    expect(calls[3]).toContain('ON CONFLICT ON CONSTRAINT uq_book_did_engagement_book');
    expect(calls[4]).toContain('INSERT INTO smart_did_video_state');
    expect(calls[4]).toContain('ON CONFLICT ON CONSTRAINT uq_smart_did_video_state_book');
    expect(calls[5]).toContain('INSERT INTO video_jobs');
    expect(calls[6]).toBe('COMMIT');
    expect(calls.length).toBe(7);
  });

  it('upsertBook rolls back on error', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('DB error'));
    const svc = new CanonicalBookUpsertService({ db: mockDb });

    await expect(svc.upsertBook(baseData)).rejects.toThrow('DB error');
    expect(mockClient.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('_upsertExternalRefs includes source_system = smart_did', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    const svc = new CanonicalBookUpsertService({ db: mockDb });
    await svc._upsertExternalRefs(mockClient, 'uuid-1', 'ext-1');
    const sql = mockClient.query.mock.calls[0][0];
    expect(sql).toContain("'smart_did'");
  });

  it('_upsertEngagement uses IS DISTINCT FROM for changed-only', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    const svc = new CanonicalBookUpsertService({ db: mockDb });
    await svc._upsertEngagement(mockClient, 'uuid-1', baseData);
    const sql = mockClient.query.mock.calls[0][0];
    expect(sql).toContain('IS DISTINCT FROM');
  });
});
