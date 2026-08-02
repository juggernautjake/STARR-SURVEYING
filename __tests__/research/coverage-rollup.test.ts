// What we can actually read, not what we meant to (research plan R11).
//
// `/admin/research/coverage` renders the worker's compiled clerk registry — a map of INTENT, which
// shows a county identically whether its adapter has ever successfully read a page or not. Since
// R8/R9 there is a harder fact available: a measured adapter status, and health checks that say when
// it was last proven.
//
// The distinction these tests defend is `verified` vs `unverified`. An adapter marked active that
// has never passed a check is a claim nobody has tested, and showing it like a proven one converts
// an unknown into a promise — on the dashboard a firm reads before telling a customer it can search
// their county.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CORE_SITE_TYPES,
  coverageHeadline,
  coverageTotals,
  rollupCounty,
  rollupCoverage,
  type AdapterRow,
} from '@/lib/research/coverage-rollup';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const row = (over: Partial<AdapterRow> = {}): AdapterRow => ({
  countyName: 'Bell',
  siteType: 'clerk_deeds',
  status: 'active',
  system: 'kofile',
  lastVerifiedAt: '2026-08-02T10:00:00.000Z',
  ...over,
});

describe('proven is not the same as registered', () => {
  it('an active adapter that has never passed a check is UNTESTED, not covered', () => {
    const c = rollupCounty('Bell', [row({ lastVerifiedAt: null })]);
    expect(c.sites[0]!.state).toBe('unverified');
    expect(c.sites[0]!.note).toContain('no health check has ever passed');
    // And it cannot reach `full`, however many adapters are registered.
    expect(c.level).not.toBe('full');
    expect(c.everVerified).toBe(false);
  });

  it('needs every core record type proven before it says full', () => {
    const partial = rollupCounty('Bell', [row()]);
    expect(partial.level).toBe('partial');

    const both = rollupCounty('Bell', [row(), row({ siteType: 'appraisal_cad', system: 'bis' })]);
    expect(both.level).toBe('full');
    expect(both.summary).toContain('both proven working');
  });

  it('counts deeds and the appraisal district as the core, not every site type', () => {
    // Flood and GLO are statewide sources, not per-county coverage.
    expect([...CORE_SITE_TYPES]).toEqual(['clerk_deeds', 'appraisal_cad']);
  });
});

describe('the states a county can be in', () => {
  it('a stub is a placeholder, not coverage', () => {
    const c = rollupCounty('Coryell', [row({ status: 'draft', lastVerifiedAt: null })]);
    expect(c.sites[0]!.state).toBe('planned');
    expect(c.level).toBe('requested');
  });

  it('a broken adapter is failing, and the summary says how many', () => {
    const c = rollupCounty('Bell', [row({ status: 'broken', lastVerifiedAt: null })]);
    expect(c.sites[0]!.state).toBe('failing');
    expect(c.summary).toContain('currently failing');
  });

  it('distinguishes an unreachable portal from a changed page', () => {
    // Different repairs: one needs the county's server back, the other needs a selector fixed.
    const down = rollupCounty('Bell', [row({ status: 'broken', lastCheckStatus: 'error' })]);
    expect(down.sites[0]!.note).toContain('did not respond');
    const changed = rollupCounty('Bell', [row({ status: 'broken', lastCheckStatus: 'broken' })]);
    expect(changed.sites[0]!.note).toContain('page changed');
  });

  it('an unregistered county says what happens to a run there', () => {
    const c = rollupCounty('Milam', []);
    expect(c.level).toBe('none');
    expect(c.summary).toContain('falls back to generic search');
  });
});

describe('the whole-state rollup', () => {
  const rows: AdapterRow[] = [
    row({ countyName: 'Bell' }),
    row({ countyName: 'Bell', siteType: 'appraisal_cad' }),
    row({ countyName: 'Coryell', status: 'draft', lastVerifiedAt: null }),
    row({ countyName: 'Harris', status: 'broken', lastVerifiedAt: null }),
  ];

  it('sorts the best-known counties first', () => {
    expect(rollupCoverage(rows).map((c) => c.county)).toEqual(['Bell', 'Coryell', 'Harris']);
  });

  it('counts what has never been proven — the number an intent map cannot produce', () => {
    const totals = coverageTotals(rollupCoverage(rows));
    expect(totals.full).toBe(1);
    expect(totals.neverVerified).toBe(2);
  });

  it('leads with what is proven, not with what is registered', () => {
    const totals = coverageTotals(rollupCoverage(rows));
    expect(coverageHeadline(totals)).toMatch(/^1 county\(ies\) fully proven/);
  });

  it('says plainly when nothing has been proven at all', () => {
    const untested = coverageTotals(rollupCoverage([row({ lastVerifiedAt: null })]));
    expect(coverageHeadline(untested)).toContain('none has been proven to work yet');
  });

  it('does not call an empty registry a coverage answer', () => {
    expect(coverageHeadline(coverageTotals([]))).toContain('nothing here has been measured');
  });
});

describe('the surface', () => {
  it('reports a failed read as a failure, not as zero coverage', () => {
    // "No counties are covered" and "we could not read the registry" render identically otherwise —
    // the §1.1b defect this repo has shipped five times.
    const route = read('app/api/admin/research/coverage/route.ts');
    expect(route).toContain('adapterRes.error');
    expect(route).toMatch(/status: 500/);
  });

  it('keeps the measured panel separate from the compiled registry table', () => {
    const page = read('app/admin/research/coverage/page.tsx');
    expect(page).toContain('MeasuredCoverage');
    expect(page).toContain('AdapterHealthPanel');
  });

  it('does not colour an untested county like a proven one', () => {
    const css = read('app/admin/research/coverage/MeasuredCoverage.css');
    expect(css).toContain('.measured__cell--unknown');
    // The whole point: `unknown` has its own colour rather than borrowing the healthy one.
    expect(css).not.toMatch(/\.measured__cell--unknown\s*\{\s*color: var\(--color-success-text\)/);
  });

  it('says out loud when no check has ever run', () => {
    const panel = read('app/admin/research/coverage/MeasuredCoverage.tsx');
    expect(panel).toContain('a fact about us, not about the counties');
  });
});
