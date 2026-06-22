// __tests__/research/canary-diff.test.ts
//
// §9.1 (semantic / data-layer) + foundation for §9.3 of
// docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.

import { describe, it, expect } from 'vitest';
import { diffAgainstCanary, type CanaryGoldenRecord } from '@/lib/research/canary-diff';
import type { CanonicalProperty } from '@/lib/research/canonical-schema';

const ATTR = { source: 'bell_cad_arcgis' as const };

const baseExtracted = (overrides: Partial<CanonicalProperty> = {}): CanonicalProperty => ({
  parcel_id: '12345',
  attribution: ATTR,
  owner: { display_name: 'SMITH JOHN' },
  legal: { text: 'LOT 4 BLOCK A OAK SUBDIVISION' },
  situs_address: { formatted: '123 MAIN ST' },
  acreage: 5.2,
  valuation: { market_value: 150000 },
  ...overrides,
});

const baseCanary = (
  overrides: Partial<CanaryGoldenRecord['expected_fields']> = {},
): CanaryGoldenRecord => ({
  expected_fields: {
    parcel_id: '12345',
    owner: { display_name: 'SMITH JOHN' },
    legal: { text: 'LOT 4 BLOCK A OAK SUBDIVISION' },
    situs_address: { formatted: '123 MAIN ST' },
    acreage: 5.2,
    valuation: { market_value: 150000 },
    ...overrides,
  },
  captured_at: '2026-06-21T00:00:00Z',
});

describe('diffAgainstCanary — healthy', () => {
  it('flags an exact match as healthy', () => {
    const d = diffAgainstCanary(baseExtracted(), baseCanary());
    expect(d.severity).toBe('healthy');
    expect(d.produced_record).toBe(true);
    expect(d.missing_fields).toEqual([]);
    expect(d.changed_fields).toEqual([]);
    expect(d.summary).toBe('healthy');
  });

  it('ignores cosmetic parcel_id variance (leading zeros)', () => {
    const d = diffAgainstCanary(
      baseExtracted({ parcel_id: '00012345' }),
      baseCanary({ parcel_id: '12345' }),
    );
    expect(d.severity).toBe('healthy');
  });

  it('ignores cosmetic owner name variance (ETUX/ordering)', () => {
    const d = diffAgainstCanary(
      baseExtracted({ owner: { display_name: 'JOHN SMITH ETUX' } }),
      baseCanary({ owner: { display_name: 'SMITH JOHN' } }),
    );
    expect(d.severity).toBe('healthy');
  });

  it('ignores small numeric rounding (under 0.5%)', () => {
    const d = diffAgainstCanary(
      baseExtracted({ acreage: 5.21 }),       // 5.21 vs 5.2 is ~0.19%
      baseCanary({ acreage: 5.2 }),
    );
    expect(d.severity).toBe('healthy');
  });

  it('counts newly-present fields as healthy but flags them', () => {
    const d = diffAgainstCanary(
      baseExtracted({ county_fips: '48027' }),
      baseCanary(), // no county_fips
    );
    expect(d.severity).toBe('healthy');
    expect(d.new_fields).toContain('county_fips');
    expect(d.summary).toMatch(/new field/);
  });
});

describe('diffAgainstCanary — degraded', () => {
  it('flags non-critical missing fields as degraded', () => {
    const d = diffAgainstCanary(
      baseExtracted({ valuation: undefined }),
      baseCanary(),
    );
    expect(d.severity).toBe('degraded');
    expect(d.missing_fields).toContain('valuation.market_value');
  });

  it('flags a non-critical value change as degraded', () => {
    const d = diffAgainstCanary(
      baseExtracted({ valuation: { market_value: 200000 } }),  // +33%
      baseCanary({ valuation: { market_value: 150000 } }),
    );
    expect(d.severity).toBe('degraded');
    expect(d.changed_fields).toHaveLength(1);
    expect(d.changed_fields[0]!.path).toBe('valuation.market_value');
  });
});

describe('diffAgainstCanary — broken', () => {
  it('flags missing parcel_id as broken (and no record produced)', () => {
    const d = diffAgainstCanary(
      { parcel_id: '', attribution: ATTR } as unknown as CanonicalProperty,
      baseCanary(),
    );
    expect(d.produced_record).toBe(false);
    expect(d.severity).toBe('broken');
    expect(d.summary).toBe('adapter produced no record');
  });

  it('flags missing owner.display_name as broken', () => {
    const d = diffAgainstCanary(
      baseExtracted({ owner: undefined }),
      baseCanary(),
    );
    expect(d.severity).toBe('broken');
    expect(d.missing_fields).toContain('owner.display_name');
  });

  it('flags missing legal.text as broken', () => {
    const d = diffAgainstCanary(
      baseExtracted({ legal: undefined }),
      baseCanary(),
    );
    expect(d.severity).toBe('broken');
    expect(d.missing_fields).toContain('legal.text');
  });

  it('flags a changed parcel_id (after normalization) as broken', () => {
    const d = diffAgainstCanary(
      baseExtracted({ parcel_id: '99999' }),  // genuine different parcel
      baseCanary({ parcel_id: '12345' }),
    );
    expect(d.severity).toBe('broken');
    expect(d.changed_fields[0]!.path).toBe('parcel_id');
  });

  it('returns no-record when the adapter hands back null', () => {
    const d = diffAgainstCanary(null, baseCanary());
    expect(d.produced_record).toBe(false);
    expect(d.severity).toBe('broken');
  });
});

describe('diffAgainstCanary — wrapped vs bare fields', () => {
  it('unwraps CanonicalValue<T> fields before comparing', () => {
    // canary has bare values; extracted now has attribution wrappers.
    const d = diffAgainstCanary(
      baseExtracted({
        owner: { value: { display_name: 'SMITH JOHN' }, attribution: ATTR },
      }),
      baseCanary(),
    );
    expect(d.severity).toBe('healthy');
  });
});

describe('diffAgainstCanary — summary text', () => {
  it('lists up to 3 missing fields then ellipses', () => {
    const d = diffAgainstCanary(
      baseExtracted({ owner: undefined, legal: undefined, situs_address: undefined, acreage: undefined, valuation: undefined }),
      baseCanary(),
    );
    expect(d.severity).toBe('broken');
    expect(d.summary).toMatch(/broken: \d+ missing /);
  });
});
