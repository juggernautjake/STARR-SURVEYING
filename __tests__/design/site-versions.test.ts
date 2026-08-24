// __tests__/design/site-versions.test.ts — publishing a whole version of the site, safely.
//
// Phase V of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Publishing changes the design of record for many pages at once. The rule that keeps that from
// being frightening is V3 — *"individual pages still win"* — and this is where it is pinned down,
// because it is a rule about TIME and those are the ones that get re-derived wrongly later.

import { describe, it, expect } from 'vitest';
import { coverageOf, isConflict } from '@/lib/design/site-versions';
import { PAGES } from '@/lib/design/pages';

describe('a deliberate per-page choice beats a version’s claim', () => {
  const member = '2026-08-01T00:00:00.000Z';

  it('is a conflict when something else was activated after the version claimed the route', () => {
    expect(isConflict(member, { id: 'other', activatedAt: '2026-08-20T00:00:00.000Z' }, 'mine')).toBe(true);
  });

  it('is not a conflict when the version is the newer decision', () => {
    // A version assembled today does not lose to an activation from last month — that activation is
    // exactly what the version was assembled to replace.
    expect(isConflict(member, { id: 'other', activatedAt: '2026-07-01T00:00:00.000Z' }, 'mine')).toBe(false);
  });

  it('is not a conflict with itself', () => {
    expect(isConflict(member, { id: 'mine', activatedAt: '2026-08-20T00:00:00.000Z' }, 'mine')).toBe(false);
  });

  it('is not a conflict when nothing is active', () => {
    expect(isConflict(member, null, 'mine')).toBe(false);
  });

  it('is not a conflict when the holder has no activation time', () => {
    // No timestamp means nobody made a dated decision — usually a row from before activation was
    // recorded. Treating unknown as "somebody chose this recently" would block every publish.
    expect(isConflict(member, { id: 'other', activatedAt: null }, 'mine')).toBe(false);
  });
});

describe('coverage is scoped to what the version set out to cover', () => {
  const adminRoutes = PAGES.filter((p) => p.area === 'admin' && !p.dynamic).map((p) => p.route);

  it('is 100% when a version names every page of the areas it touches', () => {
    // Otherwise a version that redesigns the whole employee portal and leaves the D&D side project
    // alone reports as half finished, and the number stops informing the only decision it exists
    // for: is this ready to publish?
    const coverage = coverageOf(adminRoutes);
    expect(coverage.percent).toBe(100);
    expect(coverage.areas.every((a) => a.area === 'admin')).toBe(true);
  });

  it('counts only the areas the version touches', () => {
    const coverage = coverageOf(adminRoutes.slice(0, 5));
    expect(coverage.inScope).toBe(adminRoutes.length);
    expect(coverage.covered).toBe(5);
  });

  it('never counts a dynamic route against a version', () => {
    // `/admin/jobs/[id]` cannot be designed as one page — whichever record you opened would become
    // the specification — so counting it as uncovered would make 100% unreachable.
    const coverage = coverageOf(adminRoutes);
    expect(coverage.inScope).toBe(adminRoutes.length);
    expect(PAGES.some((p) => p.area === 'admin' && p.dynamic)).toBe(true);
  });

  it('is zero, not NaN, for a version with nothing in it', () => {
    expect(coverageOf([])).toMatchObject({ covered: 0, inScope: 0, percent: 0 });
  });
});
