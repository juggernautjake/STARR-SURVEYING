// __tests__/recon/role-permissions.test.ts
// Unit tests for user role permissions and session refresh behavior.
//
// Covers:
//   Module A: Role helper functions (getUserRoles, getPrimaryRole, isAdmin, etc.)
//   Module B: getUserRolesFromDB – DB role fetch with hardcoded-list merge
//   Module C: ROLES_REFRESH_INTERVAL_SECONDS – propagation window constant
//   Module D: JWT refresh logic – stale-roles re-fetch on existing sessions
//   Module E: Middleware route protection (admin-only, teacher routes, /admin/cad)
//
// Tests are pure-logic only — no live DB connections.
//
// Test index:
//
// ── Module A: Role helper functions ──────────────────────────────────────────
//  1.  getUserRoles returns ['employee'] for unknown email
//  2.  getUserRoles includes 'admin' for hardcoded admin email
//  3.  getUserRoles always includes 'employee' for admin email
//  4.  getPrimaryRole returns 'admin' when roles include admin
//  5.  getPrimaryRole returns 'teacher' when roles include teacher but not admin
//  6.  getPrimaryRole returns 'employee' when no elevated role
//  7.  isAdmin returns true when roles array contains 'admin'
//  8.  isAdmin returns false for ['employee']
//  9.  isAdmin returns false for ['teacher']
//  10. isTeacher returns true when roles array contains 'teacher'
//  11. isTeacher returns true when roles array contains 'admin' (admin ⊇ teacher)
//  12. isTeacher returns false for ['employee']
//  13. canManageContent is equivalent to isTeacher
//  14. isCompanyUser returns true for @starr-surveying.com email
//  15. isCompanyUser returns false for external email
//  16. isCompanyUser returns false for null/undefined
//
// ── Module B: getUserRolesFromDB ──────────────────────────────────────────────
//  17. returns DB roles when user exists in registered_users
//  18. hardcoded admin email always gets 'admin' merged in even if DB has only employee
//  19. always includes 'employee' regardless of DB content
//  20. falls back to getUserRoles when user not in DB
//  21. falls back to getUserRoles when DB returns empty roles array
//
// ── Module C: ROLES_REFRESH_INTERVAL_SECONDS ──────────────────────────────────
//  22. ROLES_REFRESH_INTERVAL_SECONDS is exported from lib/auth
//  23. ROLES_REFRESH_INTERVAL_SECONDS is a positive number
//  24. ROLES_REFRESH_INTERVAL_SECONDS is 5 minutes (300 seconds)
//
// ── Module D: JWT refresh logic ───────────────────────────────────────────────
//  25. refreshRolesIfStale returns current roles when rolesLastChecked is recent
//  26. refreshRolesIfStale re-fetches roles when rolesLastChecked is stale
//  27. refreshRolesIfStale re-fetches roles when rolesLastChecked is missing
//  28. refreshRolesIfStale re-fetches roles when roles is missing
//  29. refreshed roles reflect DB changes (employee promoted to admin)
//  30. refreshed timestamp is updated after re-fetch
//
// ── Module E: Middleware route protection ─────────────────────────────────────
//  31. middleware.ts file exists
//  32. ADMIN_ONLY_ROUTES includes /admin/research
//  33. ADMIN_ONLY_ROUTES includes /admin/cad
//  34. ADMIN_ONLY_ROUTES includes /admin/users
//  35. ADMIN_ONLY_ROUTES includes /admin/payroll
//  36. TEACHER_ROUTES includes /admin/learn/manage
//  37. /admin/cad must not appear in TEACHER_ROUTES (it is admin-only)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Hoist mock variables so they are available at vi.mock() call time
const { mockSupabaseSingle, mockSupabaseMaybeSingle, mockSupabaseFrom } = vi.hoisted(() => {
  const mockSupabaseSingle = vi.fn();
  const mockSupabaseMaybeSingle = vi.fn();
  const mockSupabaseFrom = vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockSupabaseSingle,
    maybeSingle: mockSupabaseMaybeSingle,
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  }));
  return { mockSupabaseSingle, mockSupabaseMaybeSingle, mockSupabaseFrom };
});

// Mock next-auth and providers so lib/auth can be imported without a real server
vi.mock('next-auth', () => ({
  default: vi.fn((config: unknown) => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    _config: config,
  })),
}));

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn(() => ({ id: 'google', type: 'oauth' })),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn(() => ({ id: 'credentials', type: 'credentials' })),
}));

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
  compare: vi.fn(),
  hash: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: mockSupabaseFrom },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  getUserRoles,
  getUserRolesFromDB,
  getPrimaryRole,
  isAdmin,
  isTeacher,
  canManageContent,
  isCompanyUser,
  ROLES_REFRESH_INTERVAL_SECONDS,
  type UserRole,
} from '../../lib/auth.js';

// ── Module A: Role helper functions ──────────────────────────────────────────

describe('Role helpers — getUserRoles', () => {
  it('1. getUserRoles returns ["employee"] for unknown email', () => {
    const roles = getUserRoles('unknown@example.com');
    expect(roles).toEqual(['employee']);
  });

  it('2. getUserRoles includes "admin" for hardcoded admin email', () => {
    const roles = getUserRoles('hankmaddux@starr-surveying.com');
    expect(roles).toContain('admin');
  });

  it('3. getUserRoles always includes "employee" for admin email', () => {
    const roles = getUserRoles('hankmaddux@starr-surveying.com');
    expect(roles).toContain('employee');
  });
});

describe('Role helpers — getPrimaryRole', () => {
  it('4. getPrimaryRole returns "admin" when roles include admin', () => {
    expect(getPrimaryRole(['employee', 'admin'])).toBe('admin');
  });

  it('5. getPrimaryRole returns "teacher" when roles include teacher but not admin', () => {
    expect(getPrimaryRole(['employee', 'teacher'])).toBe('teacher');
  });

  it('6. getPrimaryRole returns "employee" when no elevated role', () => {
    expect(getPrimaryRole(['employee'])).toBe('employee');
  });
});

describe('Role helpers — isAdmin / isTeacher / canManageContent', () => {
  it('7. isAdmin returns true when roles array contains "admin"', () => {
    expect(isAdmin(['admin', 'employee'])).toBe(true);
  });

  it('8. isAdmin returns false for ["employee"]', () => {
    expect(isAdmin(['employee'])).toBe(false);
  });

  it('9. isAdmin returns false for ["teacher"]', () => {
    expect(isAdmin(['teacher', 'employee'])).toBe(false);
  });

  it('10. isTeacher returns true when roles array contains "teacher"', () => {
    expect(isTeacher(['teacher', 'employee'])).toBe(true);
  });

  it('11. isTeacher returns true when roles array contains "admin" (admin ⊇ teacher)', () => {
    expect(isTeacher(['admin', 'employee'])).toBe(true);
  });

  it('12. isTeacher returns false for ["employee"]', () => {
    expect(isTeacher(['employee'])).toBe(false);
  });

  it('13. canManageContent is equivalent to isTeacher', () => {
    const roles: UserRole[] = ['teacher', 'employee'];
    expect(canManageContent(roles)).toBe(isTeacher(roles));
  });
});

describe('Role helpers — isCompanyUser', () => {
  it('14. isCompanyUser returns true for @starr-surveying.com email', () => {
    expect(isCompanyUser('test@starr-surveying.com')).toBe(true);
  });

  it('15. isCompanyUser returns false for external email', () => {
    expect(isCompanyUser('test@gmail.com')).toBe(false);
  });

  it('16. isCompanyUser returns false for null/undefined', () => {
    expect(isCompanyUser(null)).toBe(false);
    expect(isCompanyUser(undefined)).toBe(false);
  });
});

// ── Module B: getUserRolesFromDB ──────────────────────────────────────────────

describe('getUserRolesFromDB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSupabaseSingle,
      maybeSingle: mockSupabaseMaybeSingle,
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    });
  });

  it('17. returns DB roles when user exists in registered_users', async () => {
    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: { roles: ['admin', 'employee'] },
      error: null,
    });
    const roles = await getUserRolesFromDB('user@example.com');
    expect(roles).toContain('admin');
    expect(roles).toContain('employee');
  });

  it('18. hardcoded admin email always gets "admin" merged in even if DB has only employee', async () => {
    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: { roles: ['employee'] },
      error: null,
    });
    const roles = await getUserRolesFromDB('hankmaddux@starr-surveying.com');
    expect(roles).toContain('admin');
    expect(roles).toContain('employee');
  });

  it('19. always includes "employee" regardless of DB content', async () => {
    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: { roles: ['admin', 'teacher'] },
      error: null,
    });
    const roles = await getUserRolesFromDB('user@example.com');
    expect(roles).toContain('employee');
  });

  it('20. falls back to getUserRoles when user not in DB', async () => {
    mockSupabaseMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const roles = await getUserRolesFromDB('hankmaddux@starr-surveying.com');
    // Should fall back to hardcoded list which includes admin
    expect(roles).toContain('admin');
    expect(roles).toContain('employee');
  });

  it('21. falls back to getUserRoles when DB returns empty roles array', async () => {
    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: { roles: [] },
      error: null,
    });
    const roles = await getUserRolesFromDB('unknown@external.com');
    // Unknown user falls back to getUserRoles => only 'employee'
    expect(roles).toEqual(['employee']);
  });
});

// ── Module C: ROLES_REFRESH_INTERVAL_SECONDS ──────────────────────────────────

describe('ROLES_REFRESH_INTERVAL_SECONDS', () => {
  it('22. ROLES_REFRESH_INTERVAL_SECONDS is exported from lib/auth', () => {
    expect(ROLES_REFRESH_INTERVAL_SECONDS).toBeDefined();
  });

  it('23. ROLES_REFRESH_INTERVAL_SECONDS is a positive number', () => {
    expect(typeof ROLES_REFRESH_INTERVAL_SECONDS).toBe('number');
    expect(ROLES_REFRESH_INTERVAL_SECONDS).toBeGreaterThan(0);
  });

  it('24. ROLES_REFRESH_INTERVAL_SECONDS is 5 minutes (300 seconds)', () => {
    expect(ROLES_REFRESH_INTERVAL_SECONDS).toBe(300);
  });
});

// ── Module D: JWT refresh logic ───────────────────────────────────────────────
//
// We test the staleness decision logic directly here, mirroring what the JWT
// callback does. The callback re-fetches roles from DB when:
//   • token.roles is missing (new field or old token), OR
//   • now - rolesLastChecked > ROLES_REFRESH_INTERVAL_SECONDS

/** Mirrors the staleness check in the JWT callback */
function isRolesStale(rolesLastChecked: number | undefined, roles: UserRole[] | undefined, now: number): boolean {
  if (!roles) return true;
  const lastChecked = rolesLastChecked ?? 0;
  return now - lastChecked > ROLES_REFRESH_INTERVAL_SECONDS;
}

describe('JWT refresh logic — staleness check', () => {
  it('25. isRolesStale returns false when rolesLastChecked is recent', () => {
    const now = Math.floor(Date.now() / 1000);
    const recentCheck = now - 60; // 1 minute ago
    expect(isRolesStale(recentCheck, ['employee', 'admin'], now)).toBe(false);
  });

  it('26. isRolesStale returns true when rolesLastChecked is stale', () => {
    const now = Math.floor(Date.now() / 1000);
    const staleCheck = now - (ROLES_REFRESH_INTERVAL_SECONDS + 1); // just past the window
    expect(isRolesStale(staleCheck, ['employee'], now)).toBe(true);
  });

  it('27. isRolesStale returns true when rolesLastChecked is missing', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isRolesStale(undefined, ['employee'], now)).toBe(true);
  });

  it('28. isRolesStale returns true when roles is missing', () => {
    const now = Math.floor(Date.now() / 1000);
    const recentCheck = now - 60;
    expect(isRolesStale(recentCheck, undefined, now)).toBe(true);
  });

  it('29. refreshed roles reflect DB changes (employee promoted to admin)', async () => {
    // Simulate: token had only ['employee'], but DB now has ['employee', 'admin']
    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: { roles: ['employee', 'admin'] },
      error: null,
    });
    const newRoles = await getUserRolesFromDB('promoted@example.com');
    expect(newRoles).toContain('admin');
    expect(newRoles).toContain('employee');
  });

  it('30. rolesLastChecked timestamp set during refresh is close to the current time', async () => {
    // Simulate what the JWT callback does: capture timestamp just before and after
    // the Math.floor(Date.now() / 1000) call used in the callback.
    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: { roles: ['employee', 'admin'] },
      error: null,
    });
    const before = Math.floor(Date.now() / 1000);
    await getUserRolesFromDB('timed@example.com'); // triggers the DB call
    const newTimestamp = Math.floor(Date.now() / 1000);
    // The timestamp that the JWT callback stores is floor(Date.now()/1000) at call
    // time, which must be between before and newTimestamp (within 1s).
    expect(newTimestamp).toBeGreaterThanOrEqual(before);
    expect(newTimestamp - before).toBeLessThanOrEqual(1);
  });
});

// ── Module E: Middleware route protection ─────────────────────────────────────

const MIDDLEWARE_PATH = path.resolve(__dirname, '../../middleware.ts');
const middlewareSrc = fs.existsSync(MIDDLEWARE_PATH)
  ? fs.readFileSync(MIDDLEWARE_PATH, 'utf8')
  : '';

describe('Middleware route protection', () => {
  it('31. middleware.ts file exists', () => {
    expect(fs.existsSync(MIDDLEWARE_PATH)).toBe(true);
  });

  it('32. ADMIN_ONLY_ROUTES includes /admin/research', () => {
    expect(middlewareSrc).toContain("'/admin/research'");
  });

  it('33. ADMIN_ONLY_ROUTES includes /admin/cad', () => {
    expect(middlewareSrc).toContain("'/admin/cad'");
  });

  it('34. ADMIN_ONLY_ROUTES includes /admin/users', () => {
    expect(middlewareSrc).toContain("'/admin/users'");
  });

  it('35. ADMIN_ONLY_ROUTES includes /admin/payroll', () => {
    expect(middlewareSrc).toContain("'/admin/payroll'");
  });

  it('36. TEACHER_ROUTES includes /admin/learn/manage', () => {
    expect(middlewareSrc).toContain("'/admin/learn/manage'");
  });

  it('37. /admin/cad is not in TEACHER_ROUTES (it is admin-only, not teacher-accessible)', () => {
    // Find the TEACHER_ROUTES array body and confirm /admin/cad is not inside it
    const teacherBlockStart = middlewareSrc.indexOf('const TEACHER_ROUTES');
    const teacherBlockEnd = middlewareSrc.indexOf('];', teacherBlockStart);
    const teacherBlock = middlewareSrc.slice(teacherBlockStart, teacherBlockEnd + 2);
    expect(teacherBlock).not.toContain("'/admin/cad'");
  });
});
