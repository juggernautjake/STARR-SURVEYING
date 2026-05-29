// __tests__/hub/server/fetch-hub-layout.test.ts
//
// Slice 195 — confirms `fetchHubLayoutForUser` never throws + always
// returns a usable layout, even when Supabase fails. The page server-
// component depends on this invariant to stop /admin/me from
// crashing into Next's error boundary.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseAdmin BEFORE importing the helper so the mock applies.
const maybeSingleMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: maybeSingleMock,
        }),
      }),
    }),
  },
}));

const { fetchHubLayoutForUser } = await import('@/lib/hub/server/fetch-hub-layout');

describe('fetchHubLayoutForUser — happy path', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
  });

  it('returns the saved layout when supabase finds a row', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        user_email: 'jacob@example.com',
        layout_version: 1,
        widgets: [{ id: 'w1', type: 'pinned-pages', x: 0, y: 0, w: 6, h: 2 }],
        active_persona: 'admin',
        theme: 'starr-dark',
        custom_theme: null,
        density: 'compact',
        font_scale: '1.25',
        hub_settings: {},
        updated_at: '2026-05-29T12:00:00Z',
      },
      error: null,
    });
    const result = await fetchHubLayoutForUser('jacob@example.com', ['admin']);
    expect(result.isSeeded).toBe(false);
    expect(result.fellBackOnError).toBeUndefined();
    expect(result.layout.theme).toBe('starr-dark');
    expect(result.layout.density).toBe('compact');
    expect(result.layout.fontScale).toBe(1.25);
    expect(result.layout.widgets[0].id).toBe('w1');
  });

  it('returns a persona-default seed when no row exists', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const result = await fetchHubLayoutForUser('newuser@example.com', ['admin']);
    expect(result.isSeeded).toBe(true);
    expect(result.fellBackOnError).toBeUndefined();
    expect(result.layout.widgets.length).toBeGreaterThan(0);
    expect(result.layout.theme).toBe('starr-default');
  });
});

describe('fetchHubLayoutForUser — crash-proof fallback', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('falls back to the seed when supabase returns an error (e.g. table missing)', async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'relation "user_hub_layouts" does not exist' },
    });
    const result = await fetchHubLayoutForUser('jacob@example.com', ['admin']);
    expect(result.isSeeded).toBe(true);
    expect(result.fellBackOnError).toBe(true);
    expect(result.errorMessage).toContain('user_hub_layouts');
    expect(result.layout.widgets.length).toBeGreaterThan(0);
  });

  it('falls back to the seed when the query throws (e.g. network)', async () => {
    maybeSingleMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await fetchHubLayoutForUser('jacob@example.com', ['admin']);
    expect(result.isSeeded).toBe(true);
    expect(result.fellBackOnError).toBe(true);
    expect(result.errorMessage).toBe('ECONNREFUSED');
    expect(result.layout.widgets.length).toBeGreaterThan(0);
  });

  it('never throws — the page server-component depends on this', async () => {
    maybeSingleMock.mockRejectedValue('a non-Error rejection value');
    await expect(fetchHubLayoutForUser('jacob@example.com', ['admin'])).resolves.toBeDefined();
  });

  it('logs the underlying error so observability still catches it', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });
    await fetchHubLayoutForUser('jacob@example.com', ['admin']);
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls[0][0]).toContain('[fetchHubLayoutForUser]');
  });

  it('persona-default seed reflects the role for fellBackOnError users', async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'DB down' },
    });
    const adminResult = await fetchHubLayoutForUser('a@x.com', ['admin']);
    const studentResult = await fetchHubLayoutForUser('s@x.com', ['student']);
    expect(adminResult.layout.widgets).not.toEqual(studentResult.layout.widgets);
  });
});
