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
import fs from 'node:fs';
import { LEGACY_REDIRECTS } from '@/lib/admin/legacy-redirects';

describe('LEGACY_REDIRECTS', () => {
  it('ships only the two paths whose pages are genuinely gone', () => {
    expect(Object.keys(LEGACY_REDIRECTS).sort()).toEqual([
      '/admin/dashboard',
      '/admin/my-jobs',
    ]);

    // ── my-hours, my-pay and my-notes LEFT this table on 2026-08-04 ──────────────────────────────
    //
    // Owner: *"whenever I click 'My Hours' in the nav menu, it takes me to the hub… it seems like
    // routing is broken."* It was not: those three redirected to `/admin/me?tab=…`, and the `tab`
    // parameter has meant nothing since Slice 189 retired the Hub's tab bar.
    //
    // Their panels — `MyHoursPanel`, `MyPayPanel`, `MyNotesPanel` — were never deleted. Only the
    // `page.tsx` files were, in the same consolidation that took `/admin/profile`, leaving three
    // whole components reachable from nothing but the UX harness. They have their routes back, so
    // redirecting these paths now would send a visitor away from a page that renders.
    for (const restored of ['/admin/my-hours', '/admin/my-pay', '/admin/my-notes']) {
      expect(LEGACY_REDIRECTS[restored], `${restored} is a real page again`).toBeUndefined();
    }

    // `/admin/profile` left this table on 2026-08-04. Owner report: the top bar's "Profile +
    // settings" and "Theme + density" entries "just take me to the hub" — this entry was the
    // mechanism, and `?tab=profile` had meant nothing since Slice 189 retired the Hub's tab bar.
    // The panel it redirected away from still existed in full; it had simply lost its route.
    expect(
      LEGACY_REDIRECTS['/admin/profile'],
      'appearance settings CONFIGURE the widget canvas, so they must not redirect into it',
    ).toBeUndefined();
  });

  it('every redirect lands on a page that exists', () => {
    // Was *"lands on the Hub"*. That stopped being the rule when `/admin/my-jobs` was pointed at
    // `/admin/assignments` — the page that actually answers it — rather than at an undifferentiated
    // widget canvas. The property worth keeping is that a redirect never dead-ends.
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      const path = to.split('?')[0];
      expect(
        fs.existsSync(`app${path}/page.tsx`) || fs.existsSync(`app${path}/page.ts`),
        `${from} redirects to ${to}, which has no page`,
      ).toBe(true);
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

  it('no redirect points at a tab that does not exist', () => {
    // ── REPLACED 2026-08-04, and the inversion is the finding ────────────────────────────────────
    //
    // This asserted the opposite: that every legacy path maps to `/admin/me?tab=<x>`. That was the
    // consolidation's design and it was faithfully pinned here — while Slice 189 retired the Hub's
    // tab bar and made `tab` mean nothing at all. **The test kept a dead convention alive for two
    // months**, which is the same shape as a stale reason: an assertion written once, believed
    // afterwards, describing a world that had moved.
    //
    // The owner found it by clicking "My Hours" and landing on the Hub. What replaces it is the
    // property that actually matters — no redirect may promise a view the Hub cannot render.
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(to, `${from} still points at a Hub tab, and the Hub has no tabs`).not.toMatch(/[?&]tab=/);
    }
  });
});
