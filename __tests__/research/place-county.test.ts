// Which county is this place in (research plan R35).
//
// R28 already refuses to infer a county from an address, because getting it wrong sends a 25-minute
// run at the wrong clerk — which fails slowly and expensively rather than immediately. This is the
// same rule applied to place names, and Texas makes it necessary: "Cameron" is the county seat of
// MILAM County and also a county 300 miles south; "Austin" is the capital in TRAVIS County and also
// a county near Houston.
//
// A resolver that picked the more famous reading would be right most of the time and catastrophic
// the rest — and the failure is silent, because the run completes normally against the wrong
// county's records.

import { describe, it, expect } from 'vitest';
import {
  TARGET_COUNTIES,
  placeKey,
  resolveAll,
  resolvePlace,
} from '@/lib/research/place-county';

describe('the owner’s list resolves', () => {
  it('maps the Bell County towns', () => {
    for (const town of ['Killeen', 'Temple', 'Belton']) {
      const r = resolvePlace(town);
      expect(r.kind).toBe('resolved');
      expect(r.counties[0]!.name).toBe('Bell');
    }
  });

  it('maps the Williamson County towns', () => {
    for (const town of ['Round Rock', 'Georgetown', 'Hutto']) {
      expect(resolvePlace(town).counties[0]!.name).toBe('Williamson');
    }
  });

  it('maps Waco and Crawford to McLennan', () => {
    expect(resolvePlace('Waco').counties[0]!.name).toBe('McLennan');
    expect(resolvePlace('Crawford').counties[0]!.name).toBe('McLennan');
  });

  it('maps Milano to Milam, Huntsville to Walker, Conroe to Montgomery', () => {
    expect(resolvePlace('Milano').counties[0]!.name).toBe('Milam');
    expect(resolvePlace('Huntsville').counties[0]!.name).toBe('Walker');
    expect(resolvePlace('Conroe').counties[0]!.name).toBe('Montgomery');
  });

  it('maps Centerville, Madisonville and Bremond', () => {
    expect(resolvePlace('Centerville').counties[0]!.name).toBe('Leon');
    expect(resolvePlace('Madisonville').counties[0]!.name).toBe('Madison');
    expect(resolvePlace('Bremond').counties[0]!.name).toBe('Robertson');
  });

  it('does not care how the place is typed', () => {
    for (const form of ['Round Rock', 'round rock', 'ROUNDROCK', ' Round-Rock ']) {
      expect(resolvePlace(form).counties[0]!.name).toBe('Williamson');
    }
    expect(placeKey('Copperas Cove')).toBe(placeKey('copperas-cove'));
  });
});

describe('the names that must not be guessed', () => {
  it('refuses "Cameron" and names both readings', () => {
    // Cameron is the county seat of Milam; Cameron County is 300 miles south.
    const r = resolvePlace('Cameron');
    expect(r.kind).toBe('ambiguous');
    expect(r.counties).toHaveLength(0);
    expect(r.statement).toContain('300 miles');
    expect(r.statement).toContain('searches the wrong clerk');
    expect(r.nextStep).toContain('Milam County or Cameron County');
  });

  it('refuses "Austin"', () => {
    const r = resolvePlace('Austin');
    expect(r.kind).toBe('ambiguous');
    expect(r.statement).toContain('Austin County (Bellville) is a separate county');
  });

  it('accepts the ambiguity being resolved by the writer', () => {
    // "Cameron County" says which was meant.
    const r = resolvePlace('Cameron County');
    expect(r.kind).toBe('resolved');
    expect(r.counties[0]!.name).toBe('Cameron');
  });

  it('resolves "Travis County" without complaint', () => {
    expect(resolvePlace('Travis County').counties[0]!.fips).toBe('48453');
  });
});

describe('a town in two counties', () => {
  it('returns both for Copperas Cove rather than picking', () => {
    // Answering "Bell" is incomplete, and a survey on the Coryell side would be researched against
    // the wrong clerk's index.
    const r = resolvePlace('Copperas Cove');
    expect(r.kind).toBe('straddles');
    expect(r.counties.map(c => c.name).sort()).toEqual(['Bell', 'Coryell']);
    expect(r.nextStep).toContain('Search both');
  });
});

describe('not knowing is not an error', () => {
  it('says a missing place may still be real', () => {
    // Texas has thousands of place names.
    const r = resolvePlace('Nowheresville');
    expect(r.kind).toBe('unknown');
    expect(r.statement).toContain('does not mean it is not a real place');
    expect(r.nextStep).toContain('Give the county directly');
  });

  it('handles an empty input', () => {
    expect(resolvePlace('   ').kind).toBe('unknown');
  });
});

describe('resolving the whole list', () => {
  const OWNER_LIST = [
    'Bell', 'Travis', 'Williamson', 'Milam', 'Harrison', 'Milano', 'Cameron', 'Waco',
    'Copperas Cove', 'Killeen', 'Temple', 'Austin', 'Hutto', 'Huntsville', 'Centerville',
    'Conroe', 'Trinity', 'Madisonville', 'Round Rock', 'Pflugerville', 'Georgetown',
    'Crawford', 'Bremond',
  ];

  it('keeps the undecidable ones visible instead of dropping them', () => {
    // A list that silently loses the ambiguous entries looks complete and is not.
    const { counties, needsDecision } = resolveAll(OWNER_LIST);
    const undecided = needsDecision.map(n => n.place);
    expect(undecided).toContain('Cameron');
    expect(undecided).toContain('Austin');
    expect(undecided).toContain('Trinity');
    // Copperas Cove resolves to two counties AND is flagged, because which one applies depends on
    // where the parcel sits.
    expect(undecided).toContain('Copperas Cove');
    expect(counties.length).toBeGreaterThan(8);
  });

  it('deduplicates counties named more than once', () => {
    const { counties } = resolveAll(['Killeen', 'Temple', 'Belton', 'Bell']);
    expect(counties).toHaveLength(1);
    expect(counties[0]!.name).toBe('Bell');
  });

  it('covers every county in the owner’s list as a build target', () => {
    const names = TARGET_COUNTIES.map(c => c.name);
    for (const expected of [
      'Bell', 'Travis', 'Williamson', 'Milam', 'Harrison', 'McLennan',
      'Coryell', 'Walker', 'Leon', 'Montgomery', 'Trinity', 'Madison', 'Robertson',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('gives every target county a real FIPS', () => {
    // A wrong FIPS routes to a different county's adapter, silently.
    for (const c of TARGET_COUNTIES) {
      expect(c.fips).toMatch(/^48\d{3}$/);
    }
    expect(new Set(TARGET_COUNTIES.map(c => c.fips)).size).toBe(TARGET_COUNTIES.length);
  });
});
