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
const { GET: teamStatusGet } = await import('@/app/api/admin/team/status/route');
const { GET: weatherGet } = await import('@/app/api/admin/weather/route');
const { GET: sunGet } = await import('@/app/api/admin/sun/route');
const { GET: pipelineGet } = await import('@/app/api/admin/research/pipeline/route');

describe('Slice 191 — stub endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/api/admin/team/status returns { members: [] }', async () => {
    const res = await teamStatusGet(new Request('http://localhost/api/admin/team/status') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ members: [] });
  });

  it('/api/admin/weather returns 204 No Content', async () => {
    const res = await weatherGet(new Request('http://localhost/api/admin/weather') as never);
    expect(res.status).toBe(204);
  });

  it('/api/admin/sun returns 204 No Content', async () => {
    const res = await sunGet(new Request('http://localhost/api/admin/sun') as never);
    expect(res.status).toBe(204);
  });

  it('/api/admin/research/pipeline returns { runs: [] }', async () => {
    const res = await pipelineGet(new Request('http://localhost/api/admin/research/pipeline') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ runs: [] });
  });
});

describe('Slice 191 — stub endpoints reject unauthenticated callers', () => {
  it('returns 401 when there is no session', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(null);

    const res = await teamStatusGet(new Request('http://localhost/api/admin/team/status') as never);
    expect(res.status).toBe(401);
  });
});
