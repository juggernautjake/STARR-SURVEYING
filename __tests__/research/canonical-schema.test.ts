// __tests__/research/canonical-schema.test.ts
//
// Source-lock for the canonical research schema (§7.5 of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md).
// Locks the runtime helpers + the contract surface (key type
// exports + the field-map shape) so future slices that touch the
// schema have to update this file deliberately.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  unwrap,
  hasAttribution,
  tagRelevance,
  type CanonicalProperty,
  type CanonicalValue,
  type CanonicalAttribution,
  type RelevanceClassification,
} from '@/lib/research/canonical-schema';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'research', 'canonical-schema.ts'),
  'utf8',
);

const ATTR: CanonicalAttribution = { source: 'bell_cad_arcgis', captured_at: '2026-06-21T00:00:00Z' };

describe('unwrap()', () => {
  it('returns the inner value for a CanonicalValue<T>', () => {
    const wrapped: CanonicalValue<number> = { value: 42, attribution: ATTR };
    expect(unwrap(wrapped)).toBe(42);
  });

  it('returns the bare value when the field is not wrapped', () => {
    expect(unwrap<number>(42)).toBe(42);
    expect(unwrap<string>('abc')).toBe('abc');
  });

  it('returns undefined when the field is missing', () => {
    expect(unwrap<number>(undefined)).toBeUndefined();
  });

  it('does not get fooled by an object that happens to have a value key but no attribution', () => {
    // Plain shapes like CanonicalOwner have a `display_name` but no
    // `attribution`. unwrap() must NOT treat them as wrapped.
    const owner = { display_name: 'SMITH JOHN' };
    expect(unwrap(owner)).toBe(owner);
  });
});

describe('hasAttribution()', () => {
  it('is true for CanonicalValue<T>', () => {
    expect(hasAttribution({ value: 5, attribution: ATTR })).toBe(true);
  });

  it('is false for bare values + objects without attribution', () => {
    expect(hasAttribution(5)).toBe(false);
    expect(hasAttribution({ display_name: 'X' })).toBe(false);
    expect(hasAttribution(undefined)).toBe(false);
  });
});

describe('tagRelevance()', () => {
  const baseRecord: CanonicalProperty = {
    parcel_id: '12345',
    attribution: ATTR,
    owner: { display_name: 'SMITH JOHN' },
    acreage: { value: 5.2, attribution: ATTR },
  };

  const classification: RelevanceClassification = {
    tag: 'subject',
    matched_parcel_ref: '12345',
    confidence: 0.95,
    rationale: 'parcel_id matched the subject anchor exactly',
  };

  it('stamps the relevance tag onto the record as a whole', () => {
    const tagged = tagRelevance(baseRecord, classification);
    expect(tagged.relevance).toBe('subject');
  });

  it('stamps the tag + parcel_ref onto every field that carries its own attribution', () => {
    const tagged = tagRelevance(baseRecord, classification);
    const acreage = tagged.acreage as CanonicalValue<number>;
    expect(acreage.relevance).toBe('subject');
    expect(acreage.parcel_ref).toBe('12345');
    expect(acreage.value).toBe(5.2);
  });

  it('leaves bare-value fields untouched (their attribution belongs to the record)', () => {
    const tagged = tagRelevance(baseRecord, classification);
    expect(tagged.owner).toEqual({ display_name: 'SMITH JOHN' });
  });

  it('is pure — does not mutate the input record', () => {
    const before = JSON.parse(JSON.stringify(baseRecord)) as CanonicalProperty;
    tagRelevance(baseRecord, classification);
    expect(baseRecord).toEqual(before);
  });
});

describe('canonical-schema.ts — source-lock', () => {
  it('exports the contract surface every other slice will depend on', () => {
    // Top-level interfaces — locking these so a future slice that
    // renames one has to update this test deliberately.
    for (const sym of [
      'CanonicalSource',
      'RelevanceTag',
      'CanonicalAttribution',
      'CanonicalValue',
      'CanonicalOwner',
      'CanonicalAddress',
      'CanonicalLegal',
      'CanonicalDeedReference',
      'CanonicalPlatReference',
      'CanonicalParcelGeometry',
      'CanonicalValuation',
      'CanonicalProperty',
      'CanonicalFieldMap',
      'CanonicalFieldMapping',
      'RelevanceContext',
      'RelevanceClassification',
    ]) {
      // Each appears as `export interface <Name>` or `export type
      // <Name>` somewhere in the file.
      const re = new RegExp(`export\\s+(?:interface|type)\\s+${sym}\\b`);
      expect(SRC).toMatch(re);
    }
  });

  it('lists every existing working vendor as a CanonicalSource', () => {
    // Without these, an existing adapter couldn't produce a
    // canonical record — the schema would silently drop them.
    for (const s of [
      "'bell_cad_arcgis'",
      "'trueautomation_propaccess'",
      "'esearch_cad'",
      "'publicsearch_clerk'",
    ]) {
      expect(SRC).toContain(s);
    }
  });

  it('field-map transforms include the minimal set every adapter needs', () => {
    for (const t of ['split_full_name', 'arcgis_rings_to_geojson_polygon', 'iso_date', 'usd_cents_to_dollars']) {
      expect(SRC).toContain(`'${t}'`);
    }
  });

  it("relevance tags are exactly {subject, adjoiner, unrelated, unknown}", () => {
    // §10.3 contract — the extractor stamps one of these four onto
    // every datum. If a future slice adds a fifth, this assertion
    // forces a deliberate review.
    expect(SRC).toMatch(/RelevanceTag\s*=\s*'subject'\s*\|\s*'adjoiner'\s*\|\s*'unrelated'\s*\|\s*'unknown'/);
  });
});
