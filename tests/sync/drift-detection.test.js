import { jest } from '@jest/globals';
import crypto from 'crypto';

const mockDb = { query: jest.fn() };
let DriftDetectorService;

beforeAll(async () => {
  const mod = await import('../../src/sync/did/drift-detector.service.js');
  DriftDetectorService = mod.DriftDetectorService;
});

beforeEach(() => {
  mockDb.query.mockReset();
});

describe('DriftDetectorService', () => {
  it('computeHash returns 64-char hex string', () => {
    const svc = new DriftDetectorService({ db: mockDb });
    const hash = svc.computeHash({ bookId: 'test', count: 5 });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('computeHash is stable for same input', () => {
    const svc = new DriftDetectorService({ db: mockDb });
    const payload = { bookId: 'test', count: 5 };
    expect(svc.computeHash(payload)).toBe(svc.computeHash(payload));
  });

  it('computeHash changes when input changes', () => {
    const svc = new DriftDetectorService({ db: mockDb });
    const h1 = svc.computeHash({ bookId: 'test', count: 5 });
    const h2 = svc.computeHash({ bookId: 'test', count: 6 });
    expect(h1).not.toBe(h2);
  });

  it('hasDrifted returns drifted=true when no existing fingerprint', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const svc = new DriftDetectorService({ db: mockDb });
    const result = await svc.hasDrifted('uuid-1', 'ext-1', 'abc123');
    expect(result.drifted).toBe(true);
    expect(result.oldHash).toBeNull();
  });

  it('hasDrifted returns drifted=false when hash matches', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ content_hash: 'abc123' }] });
    const svc = new DriftDetectorService({ db: mockDb });
    const result = await svc.hasDrifted('uuid-1', 'ext-1', 'abc123');
    expect(result.drifted).toBe(false);
    expect(result.oldHash).toBe('abc123');
  });

  it('hasDrifted returns drifted=true when hash differs', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ content_hash: 'oldhash' }] });
    const svc = new DriftDetectorService({ db: mockDb });
    const result = await svc.hasDrifted('uuid-1', 'ext-1', 'newhash');
    expect(result.drifted).toBe(true);
    expect(result.oldHash).toBe('oldhash');
  });

  it('recordFingerprint inserts new row with ON CONFLICT upsert', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ fingerprint_id: 'fp-1', content_hash: 'abc123', hash_changed_at: new Date() }] });
    const svc = new DriftDetectorService({ db: mockDb });
    const result = await svc.recordFingerprint('uuid-1', 'ext-1', 'abc123');
    expect(result.fingerprint_id).toBe('fp-1');
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT (external_book_id)');
    expect(sql).toContain('hash_changed_at');
  });
});
