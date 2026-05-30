// __tests__/api/stub-endpoints.test.ts
//
// Slice 191 originally covered four placeholder endpoints. Over
// hub-widget-excellence docs 12/14/15 every one was wired to real data:
//   - /api/admin/research/pipeline → research_projects (doc 12)
//   - /api/admin/team/status       → today's daily_time_logs (doc 14)
//   - /api/admin/weather           → keyless Open-Meteo (doc 15)
//   - /api/admin/sun               → pure sunrise computation (doc 15)
// Each carries its own pure-helper specs. What remains worth asserting
// here is the shared contract: they still compute a real payload and
// still reject unauthenticated callers. We use /api/admin/sun (fully
// deterministic, no network) as the representative.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { email: 'test@example.com', name: 'Test', roles: ['admin'] } })),
}));

// Re-import after the mock is registered.
const { GET: sunGet } = await import('@/app/api/admin/sun/route');

describe('formerly-stub endpoints — now real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/api/admin/sun computes a real sunrise/sunset payload', async () => {
    const res = await sunGet(new Request('http://localhost/api/admin/sun?lat=30.27&lng=-97.74') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ location_label: expect.any(String) });
    expect(typeof body.daylight_hours).toBe('number');
    expect(body.sunrise).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.sunset).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('formerly-stub endpoints reject unauthenticated callers', () => {
  it('returns 401 when there is no session', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(null);

    const res = await sunGet(new Request('http://localhost/api/admin/sun') as never);
    expect(res.status).toBe(401);
  });
});
