// __tests__/recon/phase17-report-sharing.test.ts
// Unit tests for STARR RECON Phase 17: Report Sharing & Client Portal.
//
// Phase 17 delivers:
//   Module A: ReportShareService     (worker/src/services/report-share-service.ts)
//   Module B: Token creation         (createShare)
//   Module C: Token validation       (validateToken)
//   Module D: isViewAllowed          (view-guard logic)
//   Module E: recordView             (view counter)
//   Module F: revokeShare            (revocation)
//   Module G: listShares             (per-project listing)
//   Module H: updateShare            (option updates)
//   Module I: SharePermission types  (type checks)
//   Module J: SQL Schema             (seeds/095_phase17_report_shares.sql)
//   Module K: API Route structure    (app/api/admin/research/[projectId]/share/route.ts)
//
// Tests are pure-logic only — no live network calls, no Supabase connections.
//
// Test index:
//
// ── Module A: ReportShareService instantiation ────────────────────────────────
//  1.  ReportShareService can be instantiated
//  2.  Fresh service has an empty internal store
//  3.  Service exposes all required methods
//
// ── Module B: Token creation ─────────────────────────────────────────────────
//  4.  createShare generates a token string
//  5.  token matches UUID v4 format
//  6.  createShare respects permission option
//  7.  createShare with no expiresInDays sets expiresAt to null
//  8.  createShare with expiresInDays=7 sets expiresAt ~7 days out
//  9.  createShare respects maxViews option
//  10. createShare stores label in share record
//  11. createShare hashes password (SHA-256 hex, not plaintext)
//  12. shareUrl contains the token
//
// ── Module C: Token validation ────────────────────────────────────────────────
//  13. valid token returns share record
//  14. unknown token returns null
//  15. expired token returns null
//  16. revoked token returns null
//  17. wrong password returns null
//  18. correct password returns share record
//  19. exceeded maxViews returns null
//  20. token with no password validates without password argument
//
// ── Module D: isViewAllowed ───────────────────────────────────────────────────
//  21. allowed = true for a fresh, unrestricted token
//  22. allowed = false when isRevoked is true
//  23. allowed = false when expiresAt is in the past
//  24. allowed = false when viewCount >= maxViews
//  25. allowed = true when maxViews is null (no limit)
//  26. allowed = true when expiresAt is in the future
//
// ── Module E: recordView increments counter ───────────────────────────────────
//  27. viewCount increments from 0 to 1 after recordView
//  28. lastViewedAt is set after recordView
//  29. multiple recordView calls accumulate correctly
//  30. recordView on unknown token does not throw
//
// ── Module F: revokeShare ─────────────────────────────────────────────────────
//  31. revokeShare sets isRevoked to true
//  32. revoked token fails validateToken (returns null)
//  33. revokeShare on unknown token does not throw
//
// ── Module G: listShares ──────────────────────────────────────────────────────
//  34. listShares returns empty array for unknown project
//  35. listShares returns all shares for a project
//  36. listShares only returns shares for the requested project
//
// ── Module H: updateShare ─────────────────────────────────────────────────────
//  37. updateShare changes permission
//  38. updateShare changes label
//  39. updateShare sets expiresAt when expiresInDays is provided
//
// ── Module I: SharePermission types ──────────────────────────────────────────
//  40. 'full_report' is a valid SharePermission value
//  41. 'summary_only' is a valid SharePermission value
//  42. 'boundary_only' is a valid SharePermission value
//  43. 'documents_excluded' is a valid SharePermission value
//
// ── Module J: SQL Schema ──────────────────────────────────────────────────────
//  44. seeds/095_phase17_report_shares.sql file exists
//  45. SQL file defines report_shares table
//  46. SQL file has UNIQUE constraint on token
//  47. SQL file has RLS enabled
//  48. SQL file defines an updated_at trigger
//  49. SQL file defines get_active_shares function
//  50. SQL file has project_id FK to research_projects
//  51. SQL file has CREATE INDEX statements
//
// ── Module K: API Route structure ────────────────────────────────────────────
//  52. app/api/admin/research/[projectId]/share/route.ts file exists
//  53. Admin route exports GET handler
//  54. Admin route exports POST handler
//  55. Admin route exports DELETE handler

import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock crypto to supply a deterministic UUID in token-creation tests
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    default: {
      ...actual,
      randomUUID: vi.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      // Keep createHash functional (used for password hashing)
      createHash: actual.createHash,
    },
    randomUUID: vi.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
    createHash: actual.createHash,
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  ReportShareService,
  type SharePermission,
  type ReportShareToken,
} from '../../worker/src/services/report-share-service.js';

// ── Module A: ReportShareService instantiation ────────────────────────────────

describe('Phase 17 — ReportShareService instantiation', () => {
  it('1. ReportShareService can be instantiated', () => {
    const svc = new ReportShareService();
    expect(svc).toBeDefined();
    expect(svc).toBeInstanceOf(ReportShareService);
  });

  it('2. Fresh service has an empty internal store (listShares returns [])', async () => {
    const svc = new ReportShareService();
    const shares = await svc.listShares('any-project-id');
    expect(shares).toEqual([]);
  });

  it('3. Service exposes all required methods', () => {
    const svc = new ReportShareService();
    expect(typeof svc.createShare).toBe('function');
    expect(typeof svc.validateToken).toBe('function');
    expect(typeof svc.recordView).toBe('function');
    expect(typeof svc.listShares).toBe('function');
    expect(typeof svc.revokeShare).toBe('function');
    expect(typeof svc.updateShare).toBe('function');
    expect(typeof svc.isViewAllowed).toBe('function');
  });
});

// ── Module B: Token creation ──────────────────────────────────────────────────

describe('Phase 17 — Token creation (createShare)', () => {
  it('4. createShare generates a token string', async () => {
    const svc = new ReportShareService();
    const result = await svc.createShare('proj-1', 'user@example.com');
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
  });

  it('5. token matches UUID v4 format', async () => {
    const svc = new ReportShareService();
    const result = await svc.createShare('proj-1', 'user@example.com');
    expect(result.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('6. createShare respects permission option', async () => {
    const svc = new ReportShareService();
    const result = await svc.createShare('proj-1', 'user@example.com', {
      permission: 'summary_only',
    });
    expect(result.shareRecord.permission).toBe('summary_only');
  });

  it('7. createShare with no expiresInDays sets expiresAt to null', async () => {
    const svc = new ReportShareService();
    const result = await svc.createShare('proj-1', 'user@example.com');
    expect(result.shareRecord.expiresAt).toBeNull();
  });

  it('8. createShare with expiresInDays=7 sets expiresAt ~7 days out', async () => {
    const svc = new ReportShareService();
    const before = Date.now();
    const result = await svc.createShare('proj-1', 'user@example.com', {
      expiresInDays: 7,
    });
    const after = Date.now();
    expect(result.shareRecord.expiresAt).not.toBeNull();
    const expiresMs = new Date(result.shareRecord.expiresAt!).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  it('9. createShare respects maxViews option', async () => {
    const svc = new ReportShareService();
    const result = await svc.createShare('proj-1', 'user@example.com', {
      maxViews: 5,
    });
    expect(result.shareRecord.maxViews).toBe(5);
  });

  it('10. createShare stores label in share record', async () => {
    const svc = new ReportShareService();
    const result = await svc.createShare('proj-1', 'user@example.com', {
      label: 'Shared with Title Co.',
    });
    expect(result.shareRecord.label).toBe('Shared with Title Co.');
  });

  it('11. createShare hashes password (SHA-256 hex, not plaintext)', async () => {
    const svc = new ReportShareService();
    const result = await svc.createShare('proj-1', 'user@example.com', {
      password: 'secret123',
    });
    expect(result.shareRecord.passwordHash).toBeDefined();
    expect(result.shareRecord.passwordHash).not.toBe('secret123');
    // SHA-256 hex is always 64 characters
    expect(result.shareRecord.passwordHash!.length).toBe(64);
  });

  it('12. shareUrl contains the token', async () => {
    const svc = new ReportShareService();
    const result = await svc.createShare('proj-1', 'user@example.com');
    expect(result.shareUrl).toContain(result.token);
    expect(result.shareUrl).toContain('/share/');
  });
});

// ── Module C: Token validation ────────────────────────────────────────────────

describe('Phase 17 — Token validation (validateToken)', () => {
  it('13. valid token returns share record', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-v', 'user@example.com');
    const record = await svc.validateToken(token);
    expect(record).not.toBeNull();
    expect(record?.token).toBe(token);
  });

  it('14. unknown token returns null', async () => {
    const svc = new ReportShareService();
    const record = await svc.validateToken('not-a-real-token');
    expect(record).toBeNull();
  });

  it('15. expired token returns null', async () => {
    const svc = new ReportShareService();
    const { token, shareRecord } = await svc.createShare('proj-e', 'user@example.com');
    // Manually set expiresAt to the past
    shareRecord.expiresAt = new Date(Date.now() - 1000).toISOString();
    const record = await svc.validateToken(token);
    expect(record).toBeNull();
  });

  it('16. revoked token returns null', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-r', 'user@example.com');
    await svc.revokeShare(token, 'admin@example.com');
    const record = await svc.validateToken(token);
    expect(record).toBeNull();
  });

  it('17. wrong password returns null', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-p', 'user@example.com', {
      password: 'correct',
    });
    const record = await svc.validateToken(token, 'wrong');
    expect(record).toBeNull();
  });

  it('18. correct password returns share record', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-p2', 'user@example.com', {
      password: 'mypassword',
    });
    const record = await svc.validateToken(token, 'mypassword');
    expect(record).not.toBeNull();
  });

  it('19. exceeded maxViews returns null', async () => {
    const svc = new ReportShareService();
    const { token, shareRecord } = await svc.createShare('proj-m', 'user@example.com', {
      maxViews: 2,
    });
    // Simulate 2 views already recorded
    shareRecord.viewCount = 2;
    const record = await svc.validateToken(token);
    expect(record).toBeNull();
  });

  it('20. token with no password validates without password argument', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-np', 'user@example.com');
    const record = await svc.validateToken(token);
    expect(record).not.toBeNull();
  });
});

// ── Module D: isViewAllowed ───────────────────────────────────────────────────

describe('Phase 17 — isViewAllowed', () => {
  function makeShare(overrides: Partial<ReportShareToken> = {}): ReportShareToken {
    return {
      token: 'test-token',
      projectId: 'proj-1',
      permission: 'full_report',
      createdBy: 'user@example.com',
      expiresAt: null,
      viewCount: 0,
      maxViews: null,
      createdAt: new Date().toISOString(),
      lastViewedAt: null,
      isRevoked: false,
      ...overrides,
    };
  }

  it('21. allowed = true for a fresh, unrestricted token', () => {
    const svc = new ReportShareService();
    const { allowed } = svc.isViewAllowed(makeShare());
    expect(allowed).toBe(true);
  });

  it('22. allowed = false when isRevoked is true', () => {
    const svc = new ReportShareService();
    const { allowed, reason } = svc.isViewAllowed(makeShare({ isRevoked: true }));
    expect(allowed).toBe(false);
    expect(reason).toBeDefined();
  });

  it('23. allowed = false when expiresAt is in the past', () => {
    const svc = new ReportShareService();
    const { allowed, reason } = svc.isViewAllowed(
      makeShare({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    expect(allowed).toBe(false);
    expect(reason).toBeDefined();
  });

  it('24. allowed = false when viewCount >= maxViews', () => {
    const svc = new ReportShareService();
    const { allowed } = svc.isViewAllowed(makeShare({ viewCount: 3, maxViews: 3 }));
    expect(allowed).toBe(false);
  });

  it('25. allowed = true when maxViews is null (no limit)', () => {
    const svc = new ReportShareService();
    const { allowed } = svc.isViewAllowed(makeShare({ viewCount: 999, maxViews: null }));
    expect(allowed).toBe(true);
  });

  it('26. allowed = true when expiresAt is in the future', () => {
    const svc = new ReportShareService();
    const { allowed } = svc.isViewAllowed(
      makeShare({ expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    );
    expect(allowed).toBe(true);
  });
});

// ── Module E: recordView ──────────────────────────────────────────────────────

describe('Phase 17 — recordView (view counter)', () => {
  it('27. viewCount increments from 0 to 1 after recordView', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-rv', 'user@example.com');
    await svc.recordView(token);
    const shares = await svc.listShares('proj-rv');
    expect(shares[0].viewCount).toBe(1);
  });

  it('28. lastViewedAt is set after recordView', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-rv2', 'user@example.com');
    expect((await svc.listShares('proj-rv2'))[0].lastViewedAt).toBeNull();
    await svc.recordView(token);
    const updated = (await svc.listShares('proj-rv2'))[0];
    expect(updated.lastViewedAt).not.toBeNull();
  });

  it('29. multiple recordView calls accumulate correctly', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-rv3', 'user@example.com');
    await svc.recordView(token);
    await svc.recordView(token);
    await svc.recordView(token);
    const shares = await svc.listShares('proj-rv3');
    expect(shares[0].viewCount).toBe(3);
  });

  it('30. recordView on unknown token does not throw', async () => {
    const svc = new ReportShareService();
    await expect(svc.recordView('no-such-token')).resolves.toBeUndefined();
  });
});

// ── Module F: revokeShare ─────────────────────────────────────────────────────

describe('Phase 17 — revokeShare', () => {
  it('31. revokeShare sets isRevoked to true', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-rev', 'user@example.com');
    await svc.revokeShare(token, 'admin@example.com');
    const shares = await svc.listShares('proj-rev');
    expect(shares[0].isRevoked).toBe(true);
  });

  it('32. revoked token fails validateToken (returns null)', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-rev2', 'user@example.com');
    await svc.revokeShare(token, 'admin@example.com');
    const record = await svc.validateToken(token);
    expect(record).toBeNull();
  });

  it('33. revokeShare on unknown token does not throw', async () => {
    const svc = new ReportShareService();
    await expect(
      svc.revokeShare('no-such-token', 'admin@example.com'),
    ).resolves.toBeUndefined();
  });
});

// ── Module G: listShares ──────────────────────────────────────────────────────

describe('Phase 17 — listShares', () => {
  it('34. listShares returns empty array for unknown project', async () => {
    const svc = new ReportShareService();
    const shares = await svc.listShares('unknown-project-id');
    expect(shares).toEqual([]);
  });

  it('35. listShares returns all shares for a project', async () => {
    const svc = new ReportShareService();
    const projId = 'proj-list-test';
    await svc.createShare(projId, 'a@example.com', { permission: 'full_report' });
    await svc.createShare(projId, 'b@example.com', { permission: 'summary_only' });
    const shares = await svc.listShares(projId);
    expect(shares.length).toBe(2);
  });

  it('36. listShares only returns shares for the requested project', async () => {
    const svc = new ReportShareService();
    await svc.createShare('proj-A', 'u@example.com');
    await svc.createShare('proj-B', 'u@example.com');
    const sharesA = await svc.listShares('proj-A');
    expect(sharesA.every((s) => s.projectId === 'proj-A')).toBe(true);
  });
});

// ── Module H: updateShare ─────────────────────────────────────────────────────

describe('Phase 17 — updateShare', () => {
  it('37. updateShare changes permission', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-upd', 'u@example.com', {
      permission: 'full_report',
    });
    const updated = await svc.updateShare(token, { permission: 'boundary_only' });
    expect(updated.permission).toBe('boundary_only');
  });

  it('38. updateShare changes label', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-upd2', 'u@example.com', {
      label: 'Original',
    });
    const updated = await svc.updateShare(token, { label: 'Updated Label' });
    expect(updated.label).toBe('Updated Label');
  });

  it('39. updateShare sets expiresAt when expiresInDays is provided', async () => {
    const svc = new ReportShareService();
    const { token } = await svc.createShare('proj-upd3', 'u@example.com');
    expect((await svc.listShares('proj-upd3'))[0].expiresAt).toBeNull();
    const updated = await svc.updateShare(token, { expiresInDays: 14 });
    expect(updated.expiresAt).not.toBeNull();
  });
});

// ── Module I: SharePermission types ──────────────────────────────────────────

describe('Phase 17 — SharePermission type values', () => {
  it('40. "full_report" is a valid SharePermission value', async () => {
    const svc = new ReportShareService();
    const { shareRecord } = await svc.createShare('proj-perm', 'u@example.com', {
      permission: 'full_report',
    });
    expect(shareRecord.permission).toBe('full_report');
  });

  it('41. "summary_only" is a valid SharePermission value', async () => {
    const svc = new ReportShareService();
    const { shareRecord } = await svc.createShare('proj-perm', 'u@example.com', {
      permission: 'summary_only',
    });
    expect(shareRecord.permission).toBe('summary_only');
  });

  it('42. "boundary_only" is a valid SharePermission value', async () => {
    const svc = new ReportShareService();
    const { shareRecord } = await svc.createShare('proj-perm', 'u@example.com', {
      permission: 'boundary_only',
    });
    expect(shareRecord.permission).toBe('boundary_only');
  });

  it('43. "documents_excluded" is a valid SharePermission value', async () => {
    const svc = new ReportShareService();
    const { shareRecord } = await svc.createShare('proj-perm', 'u@example.com', {
      permission: 'documents_excluded',
    });
    expect(shareRecord.permission).toBe('documents_excluded');
  });
});

// ── Module J: SQL Schema ──────────────────────────────────────────────────────

describe('Phase 17 — SQL Schema (seeds/095_phase17_report_shares.sql)', () => {
  const SQL_PATH = path.resolve(
    __dirname,
    '../../seeds/095_phase17_report_shares.sql',
  );

  it('44. seeds/095_phase17_report_shares.sql file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(SQL_PATH)).toBe(true);
  });

  it('45. SQL file defines report_shares table', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('report_shares');
    expect(sql).toContain('CREATE TABLE');
  });

  it('46. SQL file has UNIQUE constraint on token', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('UNIQUE');
    expect(sql).toContain('token');
  });

  it('47. SQL file has RLS enabled', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('ROW LEVEL SECURITY');
  });

  it('48. SQL file defines an updated_at trigger', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('TRIGGER');
    expect(sql).toContain('updated_at');
  });

  it('49. SQL file defines get_active_shares function', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('get_active_shares');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION');
  });

  it('50. SQL file has project_id FK to research_projects', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('project_id');
    expect(sql).toContain('research_projects');
    expect(sql).toContain('REFERENCES');
  });

  it('51. SQL file has CREATE INDEX statements', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('CREATE INDEX');
    expect(sql).toContain('idx_report_shares');
  });
});

// ── Module K: API Route structure ─────────────────────────────────────────────

describe('Phase 17 — Admin API Route (app/api/admin/research/[projectId]/share/route.ts)', () => {
  const ROUTE_PATH = path.resolve(
    __dirname,
    '../../app/api/admin/research/[projectId]/share/route.ts',
  );

  it('52. app/api/admin/research/[projectId]/share/route.ts file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  it('53. Admin route exports GET handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const GET');
  });

  it('54. Admin route exports POST handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const POST');
  });

  it('55. Admin route exports DELETE handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const DELETE');
  });
});
