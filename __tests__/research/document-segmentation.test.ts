// __tests__/research/document-segmentation.test.ts
//
// §10.4 first-pass tests for slice 13.

import { describe, it, expect } from 'vitest';
import { segmentMultiParcelDocument } from '@/lib/research/document-segmentation';
import type { RelevanceContext } from '@/lib/research/canonical-schema';

const ctx = (
  subject: Partial<RelevanceContext['subject']>,
  adjoiners: RelevanceContext['adjoiners'] = [],
): RelevanceContext => ({ subject, adjoiners });

const MULTI_PARCEL_PLAT = `
SUBDIVISION PLAT — OAK SUBDIVISION.

BEGINNING at Lot 1 Block A of OAK SUBDIVISION, being the property of Robert Anderson,
described in Vol. 100 Pg. 1.

BEGINNING at Lot 4 Block A of OAK SUBDIVISION, being the property of John Smith,
described in Vol. 100 Pg. 4. SUBJECT property.

BEGINNING at Lot 5 Block A of OAK SUBDIVISION, being the property of Mary Jones,
adjacent to the John Smith tract on the East.

BEGINNING at Lot 7 Block A of OAK SUBDIVISION, being the property of Bill Brown,
located further down the street.

BEGINNING at Lot 12 Block A of OAK SUBDIVISION, being the property of Sarah Wilson.

BEGINNING at Lot 30 Block A of OAK SUBDIVISION, being the property of unrelated owner.
`;

describe('segmentMultiParcelDocument — basic segmentation', () => {
  it('splits a multi-parcel plat on BEGINNING markers', () => {
    const segments = segmentMultiParcelDocument(
      MULTI_PARCEL_PLAT,
      ctx({ legal_description: 'LOT 4 BLOCK A OAK SUBDIVISION', owner: 'John Smith' }, [
        { legal_reference: 'LOT 5 BLOCK A', source: 'gis_adjacency' },
      ]),
      { scoreFloor: 0 },
    );
    expect(segments.length).toBeGreaterThanOrEqual(5);
  });

  it('ranks the subject segment first', () => {
    const segments = segmentMultiParcelDocument(
      MULTI_PARCEL_PLAT,
      ctx({ legal_description: 'LOT 4 BLOCK A OAK SUBDIVISION', owner: 'John Smith' }, [
        { legal_reference: 'LOT 5 BLOCK A', source: 'gis_adjacency' },
      ]),
    );
    expect(segments[0]!.text).toMatch(/Lot 4 Block A/);
    expect(segments[0]!.rationale).toMatch(/subject/);
  });

  it('promotes adjoiner segments above unrelated ones', () => {
    const segments = segmentMultiParcelDocument(
      MULTI_PARCEL_PLAT,
      ctx({ legal_description: 'LOT 4 BLOCK A', owner: 'John Smith' }, [
        { legal_reference: 'LOT 5 BLOCK A', source: 'gis_adjacency' },
      ]),
    );
    // top-3 should include subject (Lot 4) AND adjoiner (Lot 5)
    const top3 = segments.slice(0, 3).map((s) => s.text);
    expect(top3.some((t) => t.includes('Lot 4 Block A'))).toBe(true);
    expect(top3.some((t) => t.includes('Lot 5 Block A'))).toBe(true);
  });

  it('drops segments below the score floor', () => {
    const segments = segmentMultiParcelDocument(
      MULTI_PARCEL_PLAT,
      ctx({ legal_description: 'LOT 4 BLOCK A', owner: 'John Smith' }),
      { scoreFloor: 0.05 },
    );
    // The "unrelated owner" Lot-30 segment should be filtered out.
    expect(segments.every((s) => !s.text.includes('Lot 30 Block A'))).toBe(true);
  });

  it('honors the limit option', () => {
    const segments = segmentMultiParcelDocument(
      MULTI_PARCEL_PLAT,
      ctx({ legal_description: 'LOT 4 BLOCK A', owner: 'John Smith' }, [
        { legal_reference: 'LOT 5 BLOCK A', source: 'gis_adjacency' },
        { legal_reference: 'LOT 7 BLOCK A', source: 'gis_adjacency' },
      ]),
      { limit: 2, scoreFloor: 0 },
    );
    expect(segments.length).toBeLessThanOrEqual(2);
  });

  it('attaches the slice-4 references extracted from each segment', () => {
    const segments = segmentMultiParcelDocument(
      MULTI_PARCEL_PLAT,
      ctx({ legal_description: 'LOT 4 BLOCK A', owner: 'John Smith' }),
    );
    const subjectSeg = segments[0]!;
    const refStrings = subjectSeg.references.map(
      (r) => `${r.owner ?? ''} ${r.legal_reference ?? ''}`,
    );
    expect(refStrings.some((s) => /John Smith/.test(s) || /LOT 4 BLOCK A/.test(s))).toBe(true);
  });

  it('records byte-offset spans pointing into the original document', () => {
    const segments = segmentMultiParcelDocument(
      MULTI_PARCEL_PLAT,
      ctx({ legal_description: 'LOT 4 BLOCK A' }),
      { scoreFloor: 0 },
    );
    for (const s of segments) {
      const [start, end] = s.span;
      expect(MULTI_PARCEL_PLAT.slice(start, end)).toBe(s.text);
    }
  });
});

describe('segmentMultiParcelDocument — fallbacks', () => {
  it('returns empty on empty input', () => {
    expect(segmentMultiParcelDocument('', ctx({ parcel_id: '1' }))).toEqual([]);
    expect(segmentMultiParcelDocument('   ', ctx({ parcel_id: '1' }))).toEqual([]);
  });

  it('treats a markerless document as one segment', () => {
    // Genuinely markerless — no LOT/BLOCK/TRACT/ABSTRACT/Vol-Pg/
    // BEGINNING keywords. The segmenter has to fall through to
    // the singleton path and rank that one segment.
    const text = 'A short blurb describing some property with no parcel markers at all.';
    const segments = segmentMultiParcelDocument(
      text,
      ctx({ parcel_id: '12345' }),
      { scoreFloor: 0 },
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]!.text).toBe(text);
  });

  it('returns empty when nothing matches even the singleton fallback', () => {
    const text = 'random prose with no parcel markers at all.';
    expect(segmentMultiParcelDocument(text, ctx({ parcel_id: '12345' }))).toEqual([]);
  });
});
