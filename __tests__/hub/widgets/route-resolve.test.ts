// __tests__/hub/widgets/route-resolve.test.ts
//
// hub-widget-excellence-15 — shared route resolver behind the R2
// "never render a dead link" guardrail for the nav-fed widgets
// (pinned-pages + recent-activity).

import { describe, it, expect } from 'vitest';
import { resolveRouteHrefs, deepestPrefix, type RouteLike } from '@/lib/hub/widgets/_shared/route-resolve';

const routes: RouteLike[] = [
  { href: '/admin/dashboard', label: 'Dashboard', iconName: 'LayoutDashboard' },
  { href: '/admin/jobs', label: 'All Jobs', iconName: 'ListChecks' },
  { href: '/admin/jobs/new', label: 'New Job', iconName: 'FilePlus' },
];

describe('resolveRouteHrefs', () => {
  it('keeps exact matches with their label + icon', () => {
    expect(resolveRouteHrefs(['/admin/dashboard'], routes)).toEqual([
      { href: '/admin/dashboard', label: 'Dashboard', iconName: 'LayoutDashboard' },
    ]);
  });

  it('resolves a deep visited page to its deepest-prefix route, keeping the deep href', () => {
    expect(resolveRouteHrefs(['/admin/jobs/abc123'], routes)).toEqual([
      { href: '/admin/jobs/abc123', label: 'All Jobs', iconName: 'ListChecks' },
    ]);
  });

  it('drops a stale href to a retired route + preserves order otherwise', () => {
    expect(resolveRouteHrefs(['/admin/retired', '/admin/jobs/new', '/admin/dashboard'], routes).map((r) => r.href))
      .toEqual(['/admin/jobs/new', '/admin/dashboard']);
  });
});

describe('deepestPrefix', () => {
  it('returns the longest strict-ancestor route', () => {
    expect(deepestPrefix('/admin/jobs/new/edit', routes)?.href).toBe('/admin/jobs/new');
  });
  it('is undefined when nothing is a strict ancestor (exact is not)', () => {
    expect(deepestPrefix('/admin/jobs', routes)).toBeUndefined();
    expect(deepestPrefix('/admin/unknown', routes)).toBeUndefined();
  });
});
