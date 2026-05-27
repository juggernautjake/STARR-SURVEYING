// __tests__/cad/points/point-naming.test.ts
import { describe, it, expect } from 'vitest';
import {
  parsePointName,
  nextPointName,
  derivedName,
  coincidentName,
  resolveVertexName,
} from '@/lib/cad/points/point-naming';

describe('parsePointName', () => {
  it('splits base:suffix', () => {
    expect(parsePointName('255:1')).toEqual({ base: '255', suffix: 1 });
    expect(parsePointName('255')).toEqual({ base: '255' });
    expect(parsePointName('BC02')).toEqual({ base: 'BC02' });
    // A trailing colon or non-numeric tail is not a suffix.
    expect(parsePointName('255:')).toEqual({ base: '255:' });
    expect(parsePointName('A:B')).toEqual({ base: 'A:B' });
  });
});

describe('nextPointName', () => {
  it('continues a numeric scheme with max+1', () => {
    expect(nextPointName(['255', '256', '100'])).toBe('257');
  });
  it('ignores :N suffixes when computing the max integer', () => {
    expect(nextPointName(['255', '256', '255:1', '256:1'])).toBe('257');
  });
  it('skips a taken candidate', () => {
    // max int is 256 → 257, but 257 already exists → 258
    expect(nextPointName(['255', '256', '257'])).toBe('258');
  });
  it('falls back to P# when no pure numerics', () => {
    expect(nextPointName(['P1', 'P2'])).toBe('P3');
  });
  it('starts at 1 for an empty / unrecognized set', () => {
    expect(nextPointName([])).toBe('1');
    expect(nextPointName(['IPF', 'CP'])).toBe('1');
  });
  it('continues an alpha-prefix + number scheme', () => {
    expect(nextPointName(['EP1', 'EP2', 'EP3'])).toBe('EP4');
    expect(nextPointName(['MON-10', 'MON-11'])).toBe('MON-12');
  });
  it('preserves the zero-pad width of the prefix scheme', () => {
    expect(nextPointName(['MON-001', 'MON-002'])).toBe('MON-003');
    expect(nextPointName(['IP07', 'IP08'])).toBe('IP09');
  });
  it('picks the most-common prefix when schemes are mixed', () => {
    // EP has 3 members, TBM has 1 → continue EP.
    expect(nextPointName(['EP1', 'EP2', 'EP5', 'TBM1'])).toBe('EP6');
  });
  it('keeps pure-numeric priority over a prefix scheme', () => {
    expect(nextPointName(['100', 'EP1', 'EP2'])).toBe('101');
  });
});

describe('derivedName', () => {
  it('produces base:1 then base:2', () => {
    expect(derivedName('255', [])).toBe('255:1');
    expect(derivedName('255', ['255:1'])).toBe('255:2');
    expect(derivedName('255', ['255:1', '255:2'])).toBe('255:3');
  });
  it('strips an existing suffix from the base when deriving', () => {
    // Deriving from "255:2" uses root "255"; with 255:1 taken → 255:2.
    expect(derivedName('255:2', ['255:1'])).toBe('255:2');
  });
});

describe('coincidentName', () => {
  const reg = [
    { name: '1', x: 0, y: 0, layerId: 'L1' },
    { name: '2', x: 100, y: 0, layerId: 'L1' },
  ];
  it('finds a point within tolerance (nearest)', () => {
    expect(coincidentName({ x: 0.01, y: 0 }, reg, 0.1)?.name).toBe('1');
  });
  it('returns null when nothing is within tolerance', () => {
    expect(coincidentName({ x: 50, y: 50 }, reg, 0.1)).toBeNull();
  });
});

describe('resolveVertexName', () => {
  const reg = [{ name: '255', x: 0, y: 0, layerId: 'BOUNDARY' }];
  const all = ['255', '256'];

  it('reuses an existing point on the same layer', () => {
    expect(resolveVertexName({ x: 0, y: 0 }, 'BOUNDARY', reg, all, 0.1)).toEqual({
      name: '255',
      action: 'reuse',
    });
  });
  it('derives base:N for a coincident point on a different layer', () => {
    expect(resolveVertexName({ x: 0, y: 0 }, 'FENCE', reg, all, 0.1)).toEqual({
      name: '255:1',
      action: 'derive',
    });
  });
  it('mints a new name when not coincident', () => {
    expect(resolveVertexName({ x: 999, y: 999 }, 'FENCE', reg, all, 0.1)).toEqual({
      name: '257',
      action: 'mint',
    });
  });
});
