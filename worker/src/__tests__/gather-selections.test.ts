import { describe, it, expect } from 'vitest';
import {
  normaliseGatherSelections,
  resolveGatherSelections,
  DEFAULT_GATHER_SELECTIONS,
  GATHER_SELECTION_KEYS,
  normaliseRunSettings,
} from '../research/run-settings.js';

// Plan GATHER_AND_REVIEW_SPLIT S1 — the "what to find" selection schema. The checklist the operator
// sets drives what the gather run fetches, so a dropped or mis-parsed key means the run gathers the
// wrong things. Pin parsing, defaults, and the adjoiner section.

describe('normaliseGatherSelections', () => {
  it('keeps only valid keys, de-duplicated, order preserved', () => {
    const s = normaliseGatherSelections({ items: ['recent_plat', 'bogus', 'recent_plat', 'all_deeds'] });
    expect(s?.items).toEqual(['recent_plat', 'all_deeds']);
  });

  it('reads the adjoiner section', () => {
    const s = normaliseGatherSelections({
      items: ['recent_deed'],
      adjoiners: { enabled: true, items: ['recent_plat', 'nope'] },
    });
    expect(s?.adjoiners).toEqual({ enabled: true, items: ['recent_plat'] });
  });

  it('returns undefined when nothing usable was sent (so the default applies)', () => {
    expect(normaliseGatherSelections(undefined)).toBeUndefined();
    expect(normaliseGatherSelections({})).toBeUndefined();
    expect(normaliseGatherSelections({ items: ['garbage'], adjoiners: { enabled: false, items: [] } })).toBeUndefined();
  });

  it('every advertised key is accepted', () => {
    const s = normaliseGatherSelections({ items: [...GATHER_SELECTION_KEYS] });
    expect(s?.items).toEqual([...GATHER_SELECTION_KEYS]);
  });
});

describe('resolveGatherSelections — the default', () => {
  it('defaults to all files, no adjoiners', () => {
    expect(DEFAULT_GATHER_SELECTIONS).toEqual({ items: ['all_files'], adjoiners: { enabled: false, items: [] } });
    expect(resolveGatherSelections({})).toEqual(DEFAULT_GATHER_SELECTIONS);
  });

  it('uses what the run was told when present', () => {
    const settings = normaliseRunSettings({ gatherSelections: { items: ['recent_plat'] } });
    expect(resolveGatherSelections(settings).items).toEqual(['recent_plat']);
  });
});

describe('normaliseRunSettings threads selections through', () => {
  it('parses gatherSelections off the request body', () => {
    const s = normaliseRunSettings({ gatherSelections: { items: ['all_plats'], adjoiners: { enabled: true, items: ['recent_deed'] } } });
    expect(s.gatherSelections?.items).toEqual(['all_plats']);
    expect(s.gatherSelections?.adjoiners.enabled).toBe(true);
  });
});
