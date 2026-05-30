// __tests__/middleware/legacy-redirects.test.ts
//
// consolidation Slice 2 (2026-05-30) — lock the `LEGACY_REDIRECTS`
// table exported by the middleware so a future PR can't add or
// rename an entry without ticking the spec.
//
// The redirects are the safety net for external bookmarks + saved
// notification deep-links to the deleted `/admin/my-*` + `/admin/
// profile` pages. Every entry MUST land inside `/admin/me?tab=…`.

import { describe, it, expect } from 'vitest';
import { LEGACY_REDIRECTS } from '@/lib/admin/legacy-redirects';

describe('LEGACY_REDIRECTS', () => {
  it('ships exactly the five `my-*` + profile paths', () => {
    expect(Object.keys(LEGACY_REDIRECTS).sort()).toEqual([
      '/admin/my-hours',
      '/admin/my-jobs',
      '/admin/my-notes',
      '/admin/my-pay',
      '/admin/profile',
    ]);
  });

  it('every redirect lands inside /admin/me?tab=…', () => {
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(to.startsWith('/admin/me?tab=')).toBe(true);
      // Guard against a loop — the source path must NOT match the
      // target path stripped of its query.
      expect(to.split('?')[0]).not.toBe(from);
    }
  });

  it('the canonical tab anchor matches the legacy URL\'s final segment', () => {
    const mapping = {
      '/admin/my-jobs': 'jobs',
      '/admin/my-hours': 'hours',
      '/admin/my-pay': 'pay',
      '/admin/my-notes': 'notes',
      '/admin/profile': 'profile',
    };
    for (const [from, anchor] of Object.entries(mapping)) {
      expect(LEGACY_REDIRECTS[from]).toBe(`/admin/me?tab=${anchor}`);
    }
  });
});
