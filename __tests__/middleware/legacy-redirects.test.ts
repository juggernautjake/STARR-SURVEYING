// __tests__/middleware/legacy-redirects.test.ts
//
// consolidation Slice 2 (2026-05-30) — lock the `LEGACY_REDIRECTS`
// table exported by the middleware so a future PR can't add or
// rename an entry without ticking the spec.
//
// The redirects are the safety net for external bookmarks + saved
// notification deep-links to deleted pages. Every entry MUST land on
// the Hub — five of them on a specific tab, and `/admin/dashboard` on
// the Hub itself (platform audit Phase 1 item 6, 2026-08-01: it was
// the SECOND page claiming to be the home, not a tab of the first).

import { describe, it, expect } from 'vitest';
import { LEGACY_REDIRECTS } from '@/lib/admin/legacy-redirects';

describe('LEGACY_REDIRECTS', () => {
  it('ships the four `my-*` paths plus the retired dashboard — and NOT /admin/profile', () => {
    expect(Object.keys(LEGACY_REDIRECTS).sort()).toEqual([
      '/admin/dashboard',
      '/admin/my-hours',
      '/admin/my-jobs',
      '/admin/my-notes',
      '/admin/my-pay',
    ]);

    // `/admin/profile` left this table on 2026-08-04. Owner report: the top bar's "Profile +
    // settings" and "Theme + density" entries "just take me to the hub" — this entry was the
    // mechanism, and `?tab=profile` had meant nothing since Slice 189 retired the Hub's tab bar.
    // The panel it redirected away from still existed in full; it had simply lost its route.
    expect(
      LEGACY_REDIRECTS['/admin/profile'],
      'appearance settings CONFIGURE the widget canvas, so they must not redirect into it',
    ).toBeUndefined();
  });

  it('every redirect lands on the Hub', () => {
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(to.startsWith('/admin/me')).toBe(true);
      // Guard against a loop — the source path must NOT match the
      // target path stripped of its query.
      expect(to.split('?')[0]).not.toBe(from);
    }
  });

  it('the retired dashboard lands on the Hub itself, not a tab of it', () => {
    // It was never a view of "you" — it was a competing home. Sending it to a tab would preserve the
    // ambiguity the deletion existed to remove.
    expect(LEGACY_REDIRECTS['/admin/dashboard']).toBe('/admin/me');
  });

  it('no page file survives at the redirected paths', async () => {
    // The redirect only wins if the route is gone: a `page.tsx` at /admin/dashboard would be matched
    // by Next before middleware ever mattered on a client-side navigation.
    const fs = await import('node:fs');
    for (const from of Object.keys(LEGACY_REDIRECTS)) {
      const dir = `app${from}`;
      expect(fs.existsSync(`${dir}/page.tsx`), `${dir}/page.tsx still exists`).toBe(false);
    }
  });

  it('the canonical tab anchor matches the legacy URL\'s final segment', () => {
    const mapping = {
      '/admin/my-jobs': 'jobs',
      '/admin/my-hours': 'hours',
      '/admin/my-pay': 'pay',
      '/admin/my-notes': 'notes',
      // No `/admin/profile` entry: it is a real page again, not a tab anchor.
    };
    for (const [from, anchor] of Object.entries(mapping)) {
      expect(LEGACY_REDIRECTS[from]).toBe(`/admin/me?tab=${anchor}`);
    }
  });
});
