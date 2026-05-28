// __tests__/cad/feature-fields.test.ts
//
// Coverage for the legacy-key fan-in helpers. Survey points have been
// created by multiple historical code paths (AI assembly, manual draw,
// renumber ops, file-import) that stored the point number under
// different property keys — these helpers are the single source of
// truth used by every exporter (CSV, DXF, LandXML, …). Pinning the
// key-priority order so a refactor can't silently change which name
// "wins" when a feature has multiple of them.

import { describe, it, expect } from 'vitest';
import {
  pointNumberOf,
  pointCodeOf,
  pointDescriptionOf,
} from '@/lib/cad/feature-fields';

describe('pointNumberOf — legacy-key priority pointNo > pointNumber > pointName > name', () => {
  it('prefers pointNo when present', () => {
    expect(pointNumberOf({ properties: { pointNo: '101', pointNumber: '999' } })).toBe('101');
  });

  it('falls back to pointNumber when pointNo is missing', () => {
    expect(pointNumberOf({ properties: { pointNumber: '101', pointName: '999' } })).toBe('101');
  });

  it('falls back to pointName when both pointNo + pointNumber are missing', () => {
    expect(pointNumberOf({ properties: { pointName: '101', name: '999' } })).toBe('101');
  });

  it('falls back to name as the final fallback', () => {
    expect(pointNumberOf({ properties: { name: '101' } })).toBe('101');
  });

  it('returns null when no number-ish field is present', () => {
    expect(pointNumberOf({ properties: { description: 'nothing here' } })).toBeNull();
  });

  it('returns null when properties is null/undefined', () => {
    expect(pointNumberOf({ properties: null })).toBeNull();
    expect(pointNumberOf({})).toBeNull();
  });

  it('coerces numeric values to strings (DB → JS round-trip preserves type)', () => {
    expect(pointNumberOf({ properties: { pointNo: 42 } })).toBe('42');
  });

  it('returns null when the highest-priority key holds whitespace (does NOT fall through)', () => {
    // The fan-in uses `??` (nullish coalescing) — empty/whitespace strings
    // are not nullish, so a `pointNo: '  '` wins over `pointNumber: '7'`,
    // and the trim-and-return-null check at the end of pointNumberOf
    // fires on that whitespace. Net effect: a whitespace-pointNo masks a
    // valid pointNumber. This is mildly surprising — a future contributor
    // may want to treat blank-string as missing — but it's the existing
    // contract and the test pins it.
    expect(pointNumberOf({ properties: { pointNo: '  ', pointNumber: '7' } })).toBeNull();
  });
});

describe('pointCodeOf — code / rawCode / resolvedAlphaCode fan-in', () => {
  it('prefers code', () => {
    expect(pointCodeOf({ properties: { code: 'BC02', rawCode: 'ZZ99' } })).toBe('BC02');
  });

  it('falls back to rawCode', () => {
    expect(pointCodeOf({ properties: { rawCode: 'BC02' } })).toBe('BC02');
  });

  it('falls back to resolvedAlphaCode', () => {
    expect(pointCodeOf({ properties: { resolvedAlphaCode: 'BC02' } })).toBe('BC02');
  });

  it('returns empty string when no code is present', () => {
    expect(pointCodeOf({ properties: {} })).toBe('');
    expect(pointCodeOf({})).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(pointCodeOf({ properties: { code: '  BC02  ' } })).toBe('BC02');
  });
});

describe('pointDescriptionOf — description / desc / name fan-in', () => {
  it('prefers description', () => {
    expect(pointDescriptionOf({ properties: { description: 'IPF', desc: 'other' } })).toBe('IPF');
  });

  it('falls back to desc', () => {
    expect(pointDescriptionOf({ properties: { desc: 'IPF' } })).toBe('IPF');
  });

  it('falls back to name', () => {
    // Note: `name` is the LAST fallback for description — it overlaps
    // with `pointNumberOf`'s fallback chain. A feature with `name` but
    // no `pointNumber`/`pointNo`/`pointName` would have both helpers
    // return the same value. This is intentional historical behaviour.
    expect(pointDescriptionOf({ properties: { name: 'BM-1' } })).toBe('BM-1');
  });

  it('returns empty string when no description-ish field is present', () => {
    expect(pointDescriptionOf({ properties: { pointNo: '101' } })).toBe('');
    expect(pointDescriptionOf({})).toBe('');
  });
});
