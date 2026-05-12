import { describe, it, expect } from 'vitest';
import { parseAngle } from '@/lib/cad/units';

describe('parseAngle — decimal degrees', () => {
  it('"45.5" (AUTO) → 45.5°, sourceMode AZIMUTH, components null', () => {
    const r = parseAngle('45.5')!;
    expect(r.azimuth).toBeCloseTo(45.5, 6);
    expect(r.sourceMode).toBe('AZIMUTH');
    expect(r.components).toBeNull();
    expect(r.hadDmsMarkers).toBe(false);
  });

  it('"0" valid', () => {
    expect(parseAngle('0')!.azimuth).toBe(0);
  });

  it('"359.999" valid', () => {
    expect(parseAngle('359.999')!.azimuth).toBeCloseTo(359.999, 4);
  });

  it('"360" rejected (out of range)', () => {
    expect(parseAngle('360')).toBeNull();
  });

  it('"400" rejected', () => {
    expect(parseAngle('400.0')).toBeNull();
  });

  it('"-1" rejected', () => {
    expect(parseAngle('-1')).toBeNull();
  });
});

describe('parseAngle — DMS-packed shortcut', () => {
  it('"45.3000" (AUTO) → azimuth 45.5°, components {45,30,0}', () => {
    const r = parseAngle('45.3000')!;
    expect(r.azimuth).toBeCloseTo(45.5, 6);
    expect(r.sourceMode).toBe('AZIMUTH');
    expect(r.components).toEqual({ deg: 45, min: 30, sec: 0 });
    expect(r.hadDmsMarkers).toBe(false);
  });

  it('"101.4523" → 101° 45\' 23"', () => {
    const r = parseAngle('101.4523')!;
    const expected = 101 + 45 / 60 + 23 / 3600;
    expect(r.azimuth).toBeCloseTo(expected, 6);
    expect(r.components).toEqual({ deg: 101, min: 45, sec: 23 });
  });

  it('"99.6000" falls back to decimal degrees (sec 60 invalid for DMS-packed)', () => {
    // Wait — 99.6000: mm=60 → invalid. Result must be plain decimal 99.6°.
    const r = parseAngle('99.6000')!;
    expect(r.azimuth).toBeCloseTo(99.6, 6);
    expect(r.components).toBeNull();
  });

  it('shortcut disabled → decimal interpretation wins', () => {
    const r = parseAngle('45.3000', 'AUTO', { dmsPackedEnabled: false })!;
    expect(r.azimuth).toBeCloseTo(45.3, 6);
    expect(r.components).toBeNull();
  });

  it('"45.3" (only 1 decimal digit) is not DMS-packed', () => {
    const r = parseAngle('45.3')!;
    expect(r.azimuth).toBeCloseTo(45.3, 6);
    expect(r.components).toBeNull();
  });
});

describe('parseAngle — explicit DMS markers', () => {
  it('"45°30\'00\\"" → 45.5°, hadDmsMarkers true', () => {
    const r = parseAngle('45°30\'00"')!;
    expect(r.azimuth).toBeCloseTo(45.5, 6);
    expect(r.sourceMode).toBe('AZIMUTH');
    expect(r.hadDmsMarkers).toBe(true);
  });

  it('"45-30-00" hyphen-DMS → 45.5°', () => {
    const r = parseAngle('45-30-00')!;
    expect(r.azimuth).toBeCloseTo(45.5, 6);
    expect(r.hadDmsMarkers).toBe(true);
  });
});

describe('parseAngle — quadrant bearings', () => {
  it('"N 45°30\'00\\" E" → 45.5°', () => {
    const r = parseAngle('N 45°30\'00" E')!;
    expect(r.azimuth).toBeCloseTo(45.5, 6);
    expect(r.sourceMode).toBe('BEARING');
  });

  it('"N 45-30 E" → 45.5° (sec defaults to 0)', () => {
    const r = parseAngle('N 45-30 E')!;
    expect(r.azimuth).toBeCloseTo(45.5, 6);
    expect(r.sourceMode).toBe('BEARING');
  });

  it('"S 45°30\' E" → 134.5° (SE quadrant)', () => {
    const r = parseAngle('S 45°30\' E')!;
    expect(r.azimuth).toBeCloseTo(134.5, 6);
    expect(r.sourceMode).toBe('BEARING');
  });

  it('"S 45 W" → 225° (SW quadrant)', () => {
    const r = parseAngle('S 45 W')!;
    expect(r.azimuth).toBeCloseTo(225, 6);
  });

  it('"N 45 E" → 45°', () => {
    const r = parseAngle('N 45 E')!;
    expect(r.azimuth).toBeCloseTo(45, 6);
  });
});

describe('parseAngle — mode locks', () => {
  it('mode AZIMUTH rejects bearings', () => {
    expect(parseAngle('N 45 E', 'AZIMUTH')).toBeNull();
  });

  it('mode BEARING rejects bare decimals', () => {
    expect(parseAngle('45.5', 'BEARING')).toBeNull();
  });

  it('mode BEARING accepts quadrant input', () => {
    expect(parseAngle('N 45 E', 'BEARING')!.azimuth).toBeCloseTo(45, 6);
  });
});

describe('parseAngle — rejects garbage', () => {
  it('empty / whitespace', () => {
    expect(parseAngle('')).toBeNull();
    expect(parseAngle('   ')).toBeNull();
  });

  it('non-numeric', () => {
    expect(parseAngle('abc')).toBeNull();
  });
});
