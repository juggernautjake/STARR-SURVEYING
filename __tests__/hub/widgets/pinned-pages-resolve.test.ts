// __tests__/hub/widgets/pinned-pages-resolve.test.ts
//
// hub-widget-excellence-15 — pinned-pages R2 ("never render a dead
// link"). Locks the pure pin resolver: exact + deep-subtree matches
// keep the route's label/icon; stale pins to retired routes are dropped.

import { describe, it, expect } from 'vitest';
import { resolvePinnedRoutes, deepestPrefix, type RouteLike } from '@/lib/hub/widgets/pinned-pages/resolve';

const routes: RouteLike[] = [
  { href: '/admin/receipts', label: 'Receipts', iconName: 'Receipt' },
  { href: '/admin/jobs', label: 'All Jobs', iconName: 'ListChecks' },
  { href: '/admin/jobs/new', label: 'New Job', iconName: 'FilePlus' },
];

describe('resolvePinnedRoutes', () => {
  it('keeps exact matches with the route label + icon', () => {
    expect(resolvePinnedRoutes(['/admin/receipts'], routes)).toEqual([
      { href: '/admin/receipts', label: 'Receipts', iconName: 'Receipt' },
    ]);
  });

  it('resolves a deep subtree pin to its deepest-prefix route', () => {
    // /admin/jobs/abc → deepest prefix is /admin/jobs (not the bare
    // workspace), inherits its label + icon, keeps the deep href.
    expect(resolvePinnedRoutes(['/admin/jobs/abc'], routes)).toEqual([
      { href: '/admin/jobs/abc', label: 'All Jobs', iconName: 'ListChecks' },
    ]);
  });

  it('drops a stale pin that no longer resolves (dead link guardrail)', () => {
    expect(resolvePinnedRoutes(['/admin/retired-feature'], routes)).toEqual([]);
  });

  it('preserves order + filters a mixed list', () => {
    expect(
      resolvePinnedRoutes(['/admin/retired', '/admin/jobs/new', '/admin/receipts'], routes).map((p) => p.href),
    ).toEqual(['/admin/jobs/new', '/admin/receipts']);
  });
});

describe('deepestPrefix', () => {
  it('returns the longest strict-ancestor route', () => {
    expect(deepestPrefix('/admin/jobs/new/extra', routes)?.href).toBe('/admin/jobs/new');
  });
  it('returns undefined when nothing is an ancestor (exact is not a strict ancestor)', () => {
    expect(deepestPrefix('/admin/jobs', routes)).toBeUndefined();
    expect(deepestPrefix('/admin/unknown', routes)).toBeUndefined();
  });
});
