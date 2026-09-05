import { describe, it, expect } from 'vitest';
import { selectionsToWants, paidWants, captureWants } from '../research/selection-wants.js';
import { DEFAULT_GATHER_SELECTIONS, GATHER_SELECTION_KEYS } from '../research/run-settings.js';

// Plan GATHER_AND_REVIEW_SPLIT S2 — the checklist maps onto concrete gather wants. Whether a want is
// PAID (draws the TexasFile budget) or a FREE capture drives the two-budget accounting, so pin the
// mapping, the all_files expansion, the adjoiner duplication, and the paid/free split.

describe('selectionsToWants — key mapping', () => {
  it('maps a document selection to a paid want at the right scope', () => {
    const w = selectionsToWants({ items: ['recent_plat'], adjoiners: { enabled: false, items: [] } });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ documentType: 'plat', scope: 'recent', paid: true, target: 'subject' });
  });

  it('maps a map/GIS selection to a FREE capture want', () => {
    const w = selectionsToWants({ items: ['gis_satellite'], adjoiners: { enabled: false, items: [] } });
    expect(w[0]).toMatchObject({ documentType: 'map', paid: false, captureKind: 'gis_satellite' });
  });

  it('all_deeds is all-scope, recent_deed is recent-scope', () => {
    const all = selectionsToWants({ items: ['all_deeds'], adjoiners: { enabled: false, items: [] } });
    const recent = selectionsToWants({ items: ['recent_deed'], adjoiners: { enabled: false, items: [] } });
    expect(all[0].scope).toBe('all');
    expect(recent[0].scope).toBe('recent');
  });
});

describe('all_files expansion', () => {
  it('expands to every document type at full scope plus every capture', () => {
    const w = selectionsToWants(DEFAULT_GATHER_SELECTIONS); // items: ['all_files']
    const keys = w.map((x) => x.key).sort();
    expect(keys).toEqual(['all_deeds', 'all_plats', 'gis_parcel', 'gis_satellite', 'google_map', 'recent_easement'].sort());
    // plats/visuals come before deeds (owner's priority order)
    expect(w.findIndex((x) => x.key === 'all_plats')).toBeLessThan(w.findIndex((x) => x.key === 'all_deeds'));
  });

  it('de-dups when all_files is combined with an explicit key', () => {
    const w = selectionsToWants({ items: ['all_files', 'all_deeds'], adjoiners: { enabled: false, items: [] } });
    expect(w.filter((x) => x.key === 'all_deeds')).toHaveLength(1);
  });
});

describe('adjoiners', () => {
  it('adds adjoiner wants only when the toggle is on', () => {
    const off = selectionsToWants({ items: ['recent_plat'], adjoiners: { enabled: false, items: ['recent_deed'] } });
    expect(off.every((w) => w.target === 'subject')).toBe(true);

    const on = selectionsToWants({ items: ['recent_plat'], adjoiners: { enabled: true, items: ['recent_deed'] } });
    expect(on.some((w) => w.target === 'adjoiner' && w.key === 'recent_deed')).toBe(true);
    expect(on.find((w) => w.target === 'adjoiner')!.label).toMatch(/^Adjoiner/);
  });
});

describe('paid / free split (the two-budget inputs)', () => {
  it('separates TexasFile candidates from free captures', () => {
    const w = selectionsToWants({ items: [...GATHER_SELECTION_KEYS], adjoiners: { enabled: false, items: [] } });
    expect(paidWants(w).every((x) => x.paid)).toBe(true);
    expect(captureWants(w).every((x) => !x.paid)).toBe(true);
    // maps are free; deeds/plats/easements are paid candidates
    expect(captureWants(w).map((x) => x.documentType).every((t) => t === 'map')).toBe(true);
  });
});
