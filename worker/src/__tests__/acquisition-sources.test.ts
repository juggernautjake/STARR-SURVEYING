import { describe, it, expect } from 'vitest';
import {
  acquisitionSourcesFor,
  wantedCapabilities,
  capabilityForWant,
} from '../research/acquisition-sources.js';
import { selectionsToWants } from '../research/selection-wants.js';

// Plan A0 — the registry that says WHICH sources the cross-source engine searches for a run: every
// wired source serving the county that covers a checklist capability, free and paid, free-first.

const deedWants = selectionsToWants({ items: ['recent_deed', 'all_deeds'], adjoiners: { enabled: false, items: [] } });
const platWants = selectionsToWants({ items: ['recent_plat'], adjoiners: { enabled: false, items: [] } });
const mapOnly = selectionsToWants({ items: ['google_map', 'gis_parcel'], adjoiners: { enabled: false, items: [] } });

describe('capabilityForWant / wantedCapabilities', () => {
  it('deeds + easements → conveyances, plats → plats, maps → nothing', () => {
    expect(capabilityForWant(deedWants[0])).toBe('conveyances');
    expect(capabilityForWant(platWants[0])).toBe('plats');
    expect(wantedCapabilities(mapOnly)).toEqual([]); // maps are free captures, not clerk sources
  });
});

describe('acquisitionSourcesFor', () => {
  it('returns free AND paid sources for Bell deeds, free-first', () => {
    const srcs = acquisitionSourcesFor('Bell', deedWants);
    const ids = srcs.map((s) => s.source.id);
    // TexasFile (paid, conveyances, statewide) and Kofile (free, conveyances, Bell) both qualify.
    expect(ids).toContain('texasfile');
    expect(ids).toContain('kofile');
    // Free precedes paid so a caller tries free before spending.
    const firstPaid = srcs.findIndex((s) => s.kind === 'paid');
    const lastFree = srcs.map((s) => s.kind).lastIndexOf('free');
    expect(lastFree).toBeLessThan(firstPaid);
  });

  it('excludes paid sources when paid is off (a free-only run)', () => {
    const srcs = acquisitionSourcesFor('Bell', deedWants, { paidEnabled: false });
    expect(srcs.every((s) => s.kind === 'free')).toBe(true);
    expect(srcs.map((s) => s.source.id)).not.toContain('texasfile');
  });

  it('only conveyance sources for a deed run; plats add plat-capable sources', () => {
    const deedIds = acquisitionSourcesFor('Bell', deedWants).map((s) => s.source.id);
    expect(deedIds).not.toContain('cad'); // CAD is appraisal-only, not a conveyance/plat source
    // Kofile + TexasFile both cover plats too, so a plat run still includes them.
    const platIds = acquisitionSourcesFor('Bell', platWants).map((s) => s.source.id);
    expect(platIds).toContain('kofile');
    expect(platIds).toContain('texasfile');
  });

  it('a map-only checklist searches no clerk sources', () => {
    expect(acquisitionSourcesFor('Bell', mapOnly)).toEqual([]);
  });

  it('excludes a source that does not serve the county', () => {
    // eDocTec serves Coryell/Lampasas, not Bell.
    expect(acquisitionSourcesFor('Bell', deedWants).map((s) => s.source.id)).not.toContain('edoctec');
  });
});
