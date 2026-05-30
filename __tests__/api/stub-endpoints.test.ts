// __tests__/api/stub-endpoints.test.ts
//
// Slice 191 — confirms the 4 stub endpoints return the shape the
// widgets expect (or 204 No Content when no payload would be honest).
// We mock @/lib/auth to bypass the session check; the route handlers
// are exercised as plain async functions.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { email: 'test@example.com', name: 'Test', roles: ['admin'] } })),
}));

// Re-import after the mock is registered.
const { GET: sunGet } = await import('@/app/api/admin/sun/route');
// NOTE: /api/admin/research/pipeline is no longer a stub — hub-widget-
// excellence-12 wired it to real research_projects data (mapped via the
// pure lib/research/pipeline-runs helpers, tested separately). It's no
// longer asserted here.
// NOTE: /api/admin/team/status is no longer a stub either — hub-widget-
// excellence-14 wired it to real "active today" data (today's
// daily_time_logs joined to registered_users, mapped via the pure
// lib/team/status.buildTeamStatus helper, tested separately).
// NOTE: /api/admin/weather is no longer a stub either — hub-widget-
// excellence-15 wired it to real keyless Open-Meteo data (mapped via the
// pure lib/weather helpers, tested separately). It degrades to 204 only
// when the upstream is unreachable, so its status isn't asserted here.

describe('Slice 191 — stub endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/api/admin/sun returns 204 No Content', async () => {
    const res = await sunGet(new Request('http://localhost/api/admin/sun') as never);
    expect(res.status).toBe(204);
  });
});

describe('Slice 191 — stub endpoints reject unauthenticated callers', () => {
  it('returns 401 when there is no session', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(null);

    const res = await sunGet(new Request('http://localhost/api/admin/sun') as never);
    expect(res.status).toBe(401);
  });
});
