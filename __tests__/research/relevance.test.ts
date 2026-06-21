// __tests__/research/relevance.test.ts
//
// §10.1 (subject anchor) + §10.3 (relevance-gated classification)
// of docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure logic tests — the heart of "the AI weeds through and only
// extracts subject + adjoiner data." Future slices add the GIS-
// adjacency / deed-call adjoiner-resolution inputs (§10.2) and the
// two-pass extraction pipeline that consumes the output (§10.4).

import { describe, it, expect } from 'vitest';
import {
  classifyRelevance,
  filterRelevantRecords,
  hasUsableAnchor,
  haversineMeters,
  legalReferenceMatches,
  normalizeOwnerName,
  normalizeParcelId,
  resolveSubjectAnchors,
  sameOwner,
  sameParcelId,
} from '@/lib/research/relevance';
import type {
  CanonicalProperty,
  RelevanceContext,
} from '@/lib/research/canonical-schema';

const ATTR = { source: 'bell_cad_arcgis' as const };

const subjectContext = (
  overrides: Partial<RelevanceContext['subject']> = {},
  adjoiners: RelevanceContext['adjoiners'] = [],
): RelevanceContext => ({
  subject: { parcel_id: '12345', ...overrides },
  adjoiners,
});

describe('normalizeParcelId / sameParcelId', () => {
  it('strips punctuation, whitespace, and leading zeros', () => {
    expect(normalizeParcelId('  R-00012345 ')).toBe('R12345');
    expect(normalizeParcelId('00012345')).toBe('12345');
    expect(normalizeParcelId('R 12345-A')).toBe('R12345A');
  });

  it('compares two parcel ids ignoring cosmetic vendor variance', () => {
    expect(sameParcelId('12345', '00012345')).toBe(true);
    expect(sameParcelId('R-12345', 'r12345')).toBe(true);
    expect(sameParcelId('12345', '12346')).toBe(false);
  });
});

describe('normalizeOwnerName / sameOwner', () => {
  it('drops noise tokens (ETUX, JR, TRUSTEE, INC, &) and sorts the rest', () => {
    expect(normalizeOwnerName('SMITH JOHN & MARY ETUX')).toBe(normalizeOwnerName('Smith, Mary John'));
    expect(normalizeOwnerName('JONES JR ROBERT TRUSTEE')).toBe('JONES ROBERT');
  });

  it('matches owners across casing + corporate-suffix variants', () => {
    expect(sameOwner('Acme Surveying LLC', 'ACME SURVEYING')).toBe(true);
    expect(sameOwner('SMITH JOHN ETUX', 'JOHN SMITH')).toBe(true);
    expect(sameOwner('Smith John', 'Smith Jane')).toBe(false);
  });
});

describe('legalReferenceMatches', () => {
  it('matches when LOT and BLOCK tokens overlap', () => {
    expect(
      legalReferenceMatches('LOT 4 BLOCK A, OAK SUBDIVISION', 'Lot 4, Block A, Oak Subd'),
    ).toBe(true);
  });

  it('matches on shared ABSTRACT/A-N reference', () => {
    expect(
      legalReferenceMatches('BEING 5 ACRES IN A-1234', 'A-1234 OF THE J SMITH SURVEY'),
    ).toBe(true);
  });

  it('does not match purely prose legals with no structured tokens', () => {
    expect(
      legalReferenceMatches('BEING A TRACT OF LAND', 'PORTION OF A LARGER TRACT'),
    ).toBe(false);
  });

  it('does not match when lot/block differ', () => {
    expect(
      legalReferenceMatches('LOT 4 BLOCK A', 'LOT 7 BLOCK A'),
    ).toBe(false);
  });
});

describe('resolveSubjectAnchors', () => {
  it('ranks anchors strongest-first in the documented order', () => {
    const a = resolveSubjectAnchors({
      parcel_id: '12345',
      centroid_lonlat: [-97.5, 30.5],
      legal_description: 'LOT 1 BLOCK A',
      owner: 'Smith John',
      address: '123 Main St',
    });
    expect(a.map((x) => x.kind)).toEqual([
      'parcel_id',
      'geometry_centroid',
      'legal_description',
      'owner',
      'address',
    ]);
    expect(a[0]?.strength).toBe(1.0);
    expect(a[a.length - 1]?.strength).toBeLessThan(a[0]!.strength);
  });

  it('skips anchors that are absent from the subject', () => {
    const a = resolveSubjectAnchors({ owner: 'Smith John' });
    expect(a.map((x) => x.kind)).toEqual(['owner']);
  });

  it('hasUsableAnchor is false on an empty subject', () => {
    expect(hasUsableAnchor({})).toBe(false);
    expect(hasUsableAnchor({ parcel_id: '1' })).toBe(true);
  });
});

describe('classifyRelevance — subject matches', () => {
  it('marks a candidate with the same parcel_id as the subject', () => {
    const c = classifyRelevance({ parcel_id: '12345' }, subjectContext());
    expect(c.tag).toBe('subject');
    expect(c.confidence).toBe(1);
    expect(c.matched_parcel_ref).toBe('12345');
  });

  it('normalizes cosmetic parcel_id variance before comparing', () => {
    const c = classifyRelevance({ parcel_id: '00012345' }, subjectContext({ parcel_id: '12345' }));
    expect(c.tag).toBe('subject');
  });

  it('uses centroid distance ≤25m when geometry is the anchor', () => {
    const ctx = subjectContext({ parcel_id: undefined, centroid_lonlat: [-97.5, 30.5] });
    const c = classifyRelevance({ centroid_lonlat: [-97.50001, 30.50001] }, ctx);
    expect(c.tag).toBe('subject');
    expect(c.confidence).toBeGreaterThan(0.9);
  });

  it('rejects candidates outside the 25m centroid bucket', () => {
    const ctx = subjectContext({ parcel_id: undefined, centroid_lonlat: [-97.5, 30.5] });
    // ~1.1 km away
    const c = classifyRelevance({ centroid_lonlat: [-97.49, 30.5] }, ctx);
    expect(c.tag).toBe('unrelated');
  });

  it('falls through to legal-description token overlap when stronger anchors are absent', () => {
    const ctx = subjectContext({
      parcel_id: undefined,
      legal_description: 'LOT 4 BLOCK A OAK SUBDIVISION',
    });
    const c = classifyRelevance({ legal_description: 'Lot 4, Block A, Oak Subd' }, ctx);
    expect(c.tag).toBe('subject');
  });
});

describe('classifyRelevance — adjoiner matches', () => {
  const adjoiners: RelevanceContext['adjoiners'] = [
    { parcel_id: '67890', owner: 'JONES MARY', source: 'gis_adjacency' },
    { legal_reference: 'LOT 5 BLOCK A', source: 'deed_call' },
  ];

  it('parcel_id match against an adjoiner tags as adjoiner', () => {
    const c = classifyRelevance({ parcel_id: '67890' }, subjectContext({}, adjoiners));
    expect(c.tag).toBe('adjoiner');
    expect(c.matched_parcel_ref).toBe('67890');
  });

  it('owner match against an adjoiner tags as adjoiner (lower confidence)', () => {
    const c = classifyRelevance(
      { parcel_id: '99999', owner: 'Mary Jones' },
      subjectContext({}, adjoiners),
    );
    expect(c.tag).toBe('adjoiner');
    expect(c.confidence).toBeLessThan(0.9);
  });

  it('legal-reference match against an adjoiner tags as adjoiner', () => {
    const c = classifyRelevance(
      { parcel_id: '99999', legal_description: 'BEING IN LOT 5 BLOCK A' },
      subjectContext({}, adjoiners),
    );
    expect(c.tag).toBe('adjoiner');
  });
});

describe('classifyRelevance — unrelated', () => {
  it('returns unrelated when nothing matches', () => {
    const c = classifyRelevance(
      { parcel_id: '99999', owner: 'TOTALLY DIFFERENT PERSON' },
      subjectContext(),
    );
    expect(c.tag).toBe('unrelated');
    expect(c.confidence).toBeGreaterThan(0.5);
  });

  it('returns unknown when the project has no usable subject anchor', () => {
    const c = classifyRelevance({ parcel_id: '12345' }, { subject: {}, adjoiners: [] });
    expect(c.tag).toBe('unknown');
    expect(c.confidence).toBe(0);
  });
});

describe('filterRelevantRecords', () => {
  const r = (overrides: Partial<CanonicalProperty>): CanonicalProperty => ({
    parcel_id: 'X',
    attribution: ATTR,
    ...overrides,
  });

  it('keeps subject + adjoiner records and drops unrelated', () => {
    const records: CanonicalProperty[] = [
      r({ parcel_id: '12345' }),                                  // subject
      r({ parcel_id: '67890' }),                                  // adjoiner
      r({ parcel_id: '99999', owner: { display_name: 'X Y' } }),  // unrelated
    ];
    const out = filterRelevantRecords(records, subjectContext({}, [
      { parcel_id: '67890', source: 'gis_adjacency' },
    ]));
    expect(out.kept.map((k) => k.parcel_id)).toEqual(['12345', '67890']);
    expect(out.dropped_count).toBe(1);
    expect(out.classifications.map((c) => c.tag)).toEqual(['subject', 'adjoiner', 'unrelated']);
  });

  it('stamps the relevance tag onto every kept record', () => {
    const records: CanonicalProperty[] = [r({ parcel_id: '12345' })];
    const out = filterRelevantRecords(records, subjectContext());
    expect(out.kept[0]!.relevance).toBe('subject');
  });

  it('does not mutate the input array', () => {
    const records: CanonicalProperty[] = [r({ parcel_id: '12345' })];
    const before = JSON.parse(JSON.stringify(records));
    filterRelevantRecords(records, subjectContext());
    expect(records).toEqual(before);
  });
});

describe('haversineMeters — geometry helper', () => {
  it('returns 0 for the same point', () => {
    expect(haversineMeters([-97.5, 30.5], [-97.5, 30.5])).toBe(0);
  });

  it('approximates a 1-degree latitude step as ~111 km', () => {
    const m = haversineMeters([-97.5, 30.5], [-97.5, 31.5]);
    expect(m).toBeGreaterThan(110_000);
    expect(m).toBeLessThan(112_000);
  });

  it('is symmetric', () => {
    const a: [number, number] = [-97.5, 30.5];
    const b: [number, number] = [-97.6, 30.6];
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});
