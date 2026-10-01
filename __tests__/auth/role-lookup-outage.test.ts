// __tests__/auth/role-lookup-outage.test.ts
//
// Owner, 2026-10-01: "one of our workers is not able to download or preview files on the backend"
// on a job the owner could open.
//
// Production that morning (15:34 UTC): Supabase answered with a Cloudflare "522: Connection timed
// out" page. The role lookup read only `data`, saw null, and treated it as "no registered_users row"
// — falling back to ['employee']. The session refresh wrote that into the worker's token, and
// `employee` is not admitted by the Job Files mount (lib/files/mounts.ts), so the tree and every
// download/preview answered 403 for the worker, while the owner (in ADMIN_EMAILS) stayed admin.
//
// These tests pin the fix: an unreachable database is an error, not an answer, and a refresh that
// cannot reach it keeps the roles the session already has.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { maybeSingle, from, nextAuthMock } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const chain = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    maybeSingle,
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  });
  const from = vi.fn(chain);
  const nextAuthMock = vi.fn((config: unknown) => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), _config: config }));
  return { maybeSingle, from, nextAuthMock };
});

vi.mock('next-auth', () => ({ default: nextAuthMock }));
vi.mock('next-auth/providers/google', () => ({ default: vi.fn(() => ({ id: 'google', type: 'oauth' })) }));
vi.mock('next-auth/providers/credentials', () => ({ default: vi.fn(() => ({ id: 'credentials', type: 'credentials' })) }));
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn(), hash: vi.fn() }, compare: vi.fn(), hash: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from }, supabaseUnscoped: { from } }));

import { getUserRolesFromDB, isUserBlocked, RoleLookupError, ROLES_REFRESH_INTERVAL_SECONDS } from '../../lib/auth.js';

const CLOUDFLARE_522 = {
  message: '<!DOCTYPE html>\n<html><head>\n<title>supabase.co | 522: Connection timed out</title></head><body>…</body></html>',
};

type Jwt = (args: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown>>;
function jwtCallback(): Jwt {
  const config = nextAuthMock.mock.calls[0]?.[0] as { callbacks: { jwt: Jwt } };
  return config.callbacks.jwt;
}

const WORKER = 'crew@example.com';
const stale = () => Math.floor(Date.now() / 1000) - ROLES_REFRESH_INTERVAL_SECONDS - 5;

beforeEach(() => {
  maybeSingle.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getUserRolesFromDB when the database cannot be reached', () => {
  it('throws RoleLookupError instead of answering ["employee"]', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: CLOUDFLARE_522 });
    await expect(getUserRolesFromDB(WORKER)).rejects.toBeInstanceOf(RoleLookupError);
  });

  it('names the failure by the page title, not a wall of HTML', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: CLOUDFLARE_522 });
    await expect(getUserRolesFromDB(WORKER)).rejects.toThrow('supabase.co | 522: Connection timed out');
  });

  it('still falls back to the email lists for a person with no row at all', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getUserRolesFromDB(WORKER)).resolves.toEqual(['employee']);
  });

  it('isUserBlocked throws too, rather than reporting "not blocked" from no data', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: CLOUDFLARE_522 });
    await expect(isUserBlocked(WORKER)).rejects.toBeInstanceOf(RoleLookupError);
  });
});

describe('the session refresh during an outage', () => {
  it('keeps a field crew worker\'s roles when the lookup fails (the 2026-10-01 bug)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: CLOUDFLARE_522 });
    const token = { email: WORKER, roles: ['field_crew', 'employee'], role: 'field_crew', rolesLastChecked: stale(), memberships: [{ orgId: 'o1', bundles: ['office'] }] };
    const out = await jwtCallback()({ token: { ...token } });
    expect(out.roles).toEqual(['field_crew', 'employee']);
    expect(out.role).toBe('field_crew');
    // The SaaS fields are left as they were, not emptied by a failed membership read.
    expect(out.memberships).toEqual([{ orgId: 'o1', bundles: ['office'] }]);
    expect(out.blocked).toBeUndefined();
  });

  it('waits the normal interval before trying again, so an outage is not hammered per request', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: CLOUDFLARE_522 });
    const before = Math.floor(Date.now() / 1000);
    const out = await jwtCallback()({ token: { email: WORKER, roles: ['field_crew', 'employee'], rolesLastChecked: stale() } });
    expect(out.rolesLastChecked as number).toBeGreaterThanOrEqual(before);
  });

  it('a session with no roles yet still gets the defaults, and retries on the next request', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: CLOUDFLARE_522 });
    const out = await jwtCallback()({ token: { email: WORKER } });
    expect(out.roles).toEqual(['employee']);
    expect(out.rolesLastChecked).toBe(0);
  });

  it('a healthy refresh still applies the database\'s roles (promotion and demotion propagate)', async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { is_banned: false, is_approved: true }, error: null }) // isUserBlocked
      .mockResolvedValueOnce({ data: { roles: ['researcher'] }, error: null }) // getUserRolesFromDB
      .mockResolvedValue({ data: null, error: null }); // populateSaasContext reads
    const out = await jwtCallback()({ token: { email: WORKER, roles: ['field_crew', 'employee'], rolesLastChecked: stale() } });
    expect(out.roles).toEqual(expect.arrayContaining(['researcher', 'employee']));
    expect(out.roles).not.toContain('field_crew');
  });

  it('a healthy refresh still blocks a banned user', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { is_banned: true, is_approved: true }, error: null });
    const out = await jwtCallback()({ token: { email: WORKER, roles: ['field_crew', 'employee'], rolesLastChecked: stale() } });
    expect(out.blocked).toBe(true);
    expect(out.roles).toEqual([]);
  });

  it('sign-in with the database unreachable uses the defaults and asks again next request', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: CLOUDFLARE_522 });
    const out = await jwtCallback()({ token: {}, user: { email: WORKER, name: 'Crew', image: null } });
    expect(out.roles).toEqual(['employee']);
    expect(out.rolesLastChecked).toBe(0);
  });
});
