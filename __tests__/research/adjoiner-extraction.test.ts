// __tests__/research/adjoiner-extraction.test.ts
//
// §10.2 (deed-call half) of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure NLP tests on representative Texas deed prose. Conservative
// by design — false negatives (missed adjoiners) are tolerated;
// false positives (pulling in unrelated owners) are bugs because
// they'd poison the boundary.

import { describe, it, expect } from 'vitest';
import { extractDeedCallAdjoiners } from '@/lib/research/adjoiner-extraction';

describe('extractDeedCallAdjoiners — named tracts', () => {
  it('captures "the [OWNER] tract"', () => {
    const out = extractDeedCallAdjoiners(
      'BEGINNING at a point on the South line of the John Smith tract, '
      + 'thence along the East line of the Mary Jones property to a corner.',
    );
    const owners = out.map((a) => a.owner).filter(Boolean);
    expect(owners).toContain('John Smith');
    expect(owners).toContain('Mary Jones');
    expect(out.every((a) => a.source === 'deed_call')).toBe(true);
  });

  it('captures "land owned by [OWNER]"', () => {
    const out = extractDeedCallAdjoiners(
      'thence along land owned by Robert Anderson to the place of beginning',
    );
    expect(out.map((a) => a.owner)).toContain('Robert Anderson');
  });

  it('does NOT capture common nouns dressed up as tracts', () => {
    // "the South boundary tract" — "South" + "boundary" are nouns,
    // not an owner name.
    const out = extractDeedCallAdjoiners('thence along the South boundary tract');
    expect(out.length).toBe(0);
  });

  it('dedupes the same owner mentioned multiple times', () => {
    const out = extractDeedCallAdjoiners(
      'thence along the South line of the John Smith tract; '
      + 'thence with the John Smith tract to a corner.',
    );
    const johnSmiths = out.filter((a) => a.owner === 'John Smith');
    expect(johnSmiths.length).toBe(1);
    // The evidence field should reflect both mentions.
    expect(johnSmiths[0]!.evidence).toMatch(/.*;.*/);
  });
});

describe('extractDeedCallAdjoiners — Lot/Block references', () => {
  it('captures "Lot N Block X"', () => {
    const out = extractDeedCallAdjoiners(
      'along the West line of Lot 7 Block A, OAK SUBDIVISION',
    );
    const refs = out.map((a) => a.legal_reference);
    expect(refs).toContain('LOT 7 BLOCK A');
  });

  it('captures "Lot N, Block X" (comma-separated)', () => {
    const out = extractDeedCallAdjoiners('adjacent to Lot 12, Block C');
    expect(out.map((a) => a.legal_reference)).toContain('LOT 12 BLOCK C');
  });

  it('captures "Lots 4-6 Block C" (range)', () => {
    const out = extractDeedCallAdjoiners('adjoining Lots 4-6 Block C');
    expect(out.map((a) => a.legal_reference)).toContain('LOT 4-6 BLOCK C');
  });
});

describe('extractDeedCallAdjoiners — abstract / survey references', () => {
  it('captures "A-NNNN" abstract numbers', () => {
    const out = extractDeedCallAdjoiners(
      'being a portion of the J. Smith Survey, A-1234',
    );
    expect(out.map((a) => a.legal_reference)).toContain('ABSTRACT 1234');
  });

  it('captures "Abstract NNNN" written out', () => {
    const out = extractDeedCallAdjoiners('Abstract 5678 of the C.B. Stewart Survey');
    expect(out.map((a) => a.legal_reference)).toContain('ABSTRACT 5678');
  });

  it('captures named survey references', () => {
    const out = extractDeedCallAdjoiners(
      'thence along the East line of the J. Smith Survey to a corner',
    );
    const owners = out.map((a) => a.owner);
    expect(owners.some((o) => o?.includes('Smith'))).toBe(true);
  });
});

describe('extractDeedCallAdjoiners — deed citations', () => {
  it('captures Vol. / Pg. citations', () => {
    const out = extractDeedCallAdjoiners(
      'as described in Vol. 1234, Pg. 567 of the Deed Records of Bell County',
    );
    expect(out.map((a) => a.legal_reference)).toContain('VOL 1234 PG 567');
  });

  it('captures "Volume NNN Page NNN" written out', () => {
    const out = extractDeedCallAdjoiners('Volume 999 Page 12 conveys the adjoining tract');
    expect(out.map((a) => a.legal_reference)).toContain('VOL 999 PG 12');
  });

  it('captures modern document numbers', () => {
    const out = extractDeedCallAdjoiners(
      'Doc. 2024-12345 records the conveyance from the adjoining owner',
    );
    expect(out.map((a) => a.legal_reference)).toContain('DOC 2024-12345');
  });
});

describe('extractDeedCallAdjoiners — robustness', () => {
  it('returns an empty array on empty input', () => {
    expect(extractDeedCallAdjoiners('')).toEqual([]);
    expect(extractDeedCallAdjoiners('   ')).toEqual([]);
  });

  it('never throws on freeform / unstructured prose', () => {
    expect(() =>
      extractDeedCallAdjoiners(
        'BEING A TRACT OF LAND containing 5.0 acres more or less.',
      ),
    ).not.toThrow();
  });

  it('produces an entry shape compatible with RelevanceContext.adjoiners', () => {
    const out = extractDeedCallAdjoiners('along the John Smith tract, Lot 4 Block A');
    expect(out.length).toBeGreaterThan(0);
    for (const a of out) {
      expect(a.source).toBe('deed_call');
      // exactly one of owner / legal_reference is set for each hit
      // (we don't fabricate parcel_ids from text alone)
      expect(a.parcel_id).toBeUndefined();
      expect(typeof a.evidence).toBe('string');
    }
  });

  it('captures a realistic Texas legal description end-to-end', () => {
    const legal = [
      'BEING a tract of 5.0 acres of land in the J. Smith Survey, A-1234,',
      'Bell County, Texas, beginning at a point on the South line of',
      'the Mary Jones tract; thence S 45° E along the West line of',
      'Lot 7, Block A, OAK SUBDIVISION; thence with land owned by',
      'Robert Anderson as recorded in Vol. 1234, Pg. 567.',
    ].join(' ');
    const out = extractDeedCallAdjoiners(legal);
    const owners = out.map((a) => a.owner).filter(Boolean);
    const refs = out.map((a) => a.legal_reference).filter(Boolean);

    expect(owners).toContain('Mary Jones');
    expect(owners).toContain('Robert Anderson');
    expect(refs).toContain('LOT 7 BLOCK A');
    expect(refs).toContain('ABSTRACT 1234');
    expect(refs).toContain('VOL 1234 PG 567');
  });
});
