// __tests__/cad/io/trv-line-curve-fidelity.test.ts
//
// cad-trv-line-curve-fidelity Slices 1 + 3 — line/area label
// extraction (28,15 / 28,14) + TPC fill-pattern → Starr mapping.

import { describe, it, expect } from 'vitest';
import {
  extractLineLabels,
  extractAreaLabels,
} from '@/lib/cad/io/trv-drawing-elements';
import {
  tpcFillNameToStarr,
  tpcFillIndexToStarr,
  TPC_FILL_NAMES,
} from '@/lib/cad/io/trv-fill-patterns';
import type { TrvDrawingElement } from '@/lib/cad/io/trv-parser';

const PILCROW = '¶';
const DC4 = '\x14';

function de(header: string[], properties: string[][] = [], sourceLine = 0): TrvDrawingElement {
  return { header, properties, sourceLine };
}

describe('extractLineLabels — 28,15 segment labels', () => {
  it('extracts the from/to/text from a real Garland 28,15 block', () => {
    const elements = [
      de(['15', '20fnd', '21fnd'], [
        ['5', '-0.18', '-0.51', '0', '1', '8.00', '3435', '14', `N 73°34'00" W 299.62'${PILCROW}`],
        ['2', '17694724', '4', '0'],
      ], 7000),
      de(['15', '23fnd', '20fnd'], [
        ['5', '0.45', '-0.18', '0', '1', '8.00', '733', '14', `S 16°39'01" W 144.72'${PILCROW}`],
      ], 7003),
    ];
    const labels = extractLineLabels(elements);
    expect(labels).toEqual([
      { fromId: '20fnd', toId: '21fnd', text: 'N 73°34\'00" W 299.62\'', sourceLine: 7000 },
      { fromId: '23fnd', toId: '20fnd', text: 'S 16°39\'01" W 144.72\'', sourceLine: 7003 },
    ]);
  });

  it('skips non-15 drawing elements', () => {
    expect(extractLineLabels([de(['12', '20fnd']), de(['14', '6'])])).toEqual([]);
  });

  it('skips a 28,15 with no text-run 29 record', () => {
    expect(extractLineLabels([de(['15', 'a', 'b'], [['2', '1']])])).toEqual([]);
  });

  it('skips a 28,15 missing the from or to point id', () => {
    expect(extractLineLabels([de(['15', 'a'], [['5', '0', '0', '0', '0', '8', '0', '14', `x${PILCROW}`]])])).toEqual([]);
  });
});

describe('extractAreaLabels — 28,14 area annotations', () => {
  it('extracts the area text from a real Garland 28,14 block', () => {
    const elements = [
      de(['14', '6'], [
        ['5', '-1.09', '0.36', '0', '0', '10.00', '0', '6', `43362 SqFt${DC4}0.995 Acres${PILCROW}`],
      ], 7100),
    ];
    const labels = extractAreaLabels(elements);
    expect(labels).toHaveLength(1);
    // The DC4 between "SqFt" and "0.995" is collapsed to a space
    // by cleanLabelText.
    expect(labels[0].text).toBe('43362 SqFt 0.995 Acres');
    expect(labels[0].sourceLine).toBe(7100);
  });

  it('skips non-14 elements', () => {
    expect(extractAreaLabels([de(['15', 'a', 'b']), de(['12', 'p'])])).toEqual([]);
  });
});

describe('tpcFillNameToStarr — diagonal hatch families', () => {
  it('Diagonal / → LINES @ 45°', () => {
    expect(tpcFillNameToStarr('Diagonal /')).toMatchObject({ pattern: 'LINES', rotation: 45 });
  });
  it('Light Diagonal \\ → LINES @ 135° at light density', () => {
    const s = tpcFillNameToStarr('Light Diagonal \\')!;
    expect(s.pattern).toBe('LINES');
    expect(s.rotation).toBe(135);
    expect(s.density).toBe(0.5);
  });
  it('strips the trailing * export marker', () => {
    expect(tpcFillNameToStarr('Diagonal /*')).toMatchObject({ pattern: 'LINES', rotation: 45 });
  });
});

describe('tpcFillNameToStarr — cross + brick + lines + dots + wave', () => {
  it('Cross → CROSSHATCH @ 0°', () => {
    expect(tpcFillNameToStarr('Cross')).toMatchObject({ pattern: 'CROSSHATCH', rotation: 0 });
  });
  it('Diagonal Cross → CROSSHATCH @ 45°', () => {
    expect(tpcFillNameToStarr('Diagonal Cross')).toMatchObject({ pattern: 'CROSSHATCH', rotation: 45 });
  });
  it('Brick / Brick Filled → BRICK', () => {
    expect(tpcFillNameToStarr('Brick')).toMatchObject({ pattern: 'BRICK' });
    expect(tpcFillNameToStarr('Brick Filled')).toMatchObject({ pattern: 'BRICK' });
  });
  it('Narrow Vertical → LINES @ 90° dense', () => {
    expect(tpcFillNameToStarr('Narrow Vertical')).toMatchObject({ pattern: 'LINES', rotation: 90, density: 2 });
  });
  it('Dark Horizontal → LINES @ 0°', () => {
    expect(tpcFillNameToStarr('Dark Horizontal')).toMatchObject({ pattern: 'LINES', rotation: 0 });
  });
  it('Gravel / Sand / Earth → DOT_GRAVEL', () => {
    expect(tpcFillNameToStarr('Gravel')).toMatchObject({ pattern: 'DOT_GRAVEL' });
    expect(tpcFillNameToStarr('Sand')).toMatchObject({ pattern: 'DOT_GRAVEL', density: 2 });
    expect(tpcFillNameToStarr('Earth')).toMatchObject({ pattern: 'DOT_GRAVEL' });
  });
  it('Water / Swamp → WAVE', () => {
    expect(tpcFillNameToStarr('Water')).toMatchObject({ pattern: 'WAVE' });
    expect(tpcFillNameToStarr('Swamp (filled)')).toMatchObject({ pattern: 'WAVE' });
  });
  it('Forest / Grass → the dedicated GRASS tuft pattern', () => {
    // cad-trv-fidelity Slice 6 — was DOT_GRAVEL density 2; now mapped
    // to the dedicated GRASS pattern for a closer plat match.
    expect(tpcFillNameToStarr('Forest')).toMatchObject({ pattern: 'GRASS' });
    expect(tpcFillNameToStarr('Grass')).toMatchObject({ pattern: 'GRASS' });
  });
});

describe('tpcFillNameToStarr — percent screens', () => {
  it('5 Percent → DOT_UNIFORM sparse', () => {
    const s = tpcFillNameToStarr('5 Percent')!;
    expect(s.pattern).toBe('DOT_UNIFORM');
    expect(s.density).toBeLessThan(1);
  });
  it('90 Percent → DOT_UNIFORM dense', () => {
    const s = tpcFillNameToStarr('90 Percent')!;
    expect(s.pattern).toBe('DOT_UNIFORM');
    expect(s.density).toBeGreaterThan(2);
  });
  it('50 Percent → DOT_UNIFORM mid density', () => {
    expect(tpcFillNameToStarr('50 Percent')).toMatchObject({ pattern: 'DOT_UNIFORM', density: 2 });
  });
});

describe('tpcFillNameToStarr — unknown', () => {
  it('an unrecognized name returns null (round-trip preserved)', () => {
    expect(tpcFillNameToStarr('Nonexistent Pattern')).toBeNull();
  });
});

describe('tpcFillIndexToStarr + TPC_FILL_NAMES', () => {
  it('the dropdown list has all 47 named patterns', () => {
    expect(TPC_FILL_NAMES).toHaveLength(47);
    expect(TPC_FILL_NAMES[0]).toBe('Diagonal /');
    expect(TPC_FILL_NAMES[3]).toBe('Brick');
    expect(TPC_FILL_NAMES[11]).toBe('Gravel');
    expect(TPC_FILL_NAMES[46]).toBe('Large Confetti');
  });
  it('index 3 (Brick) → BRICK', () => {
    expect(tpcFillIndexToStarr(3)).toMatchObject({ pattern: 'BRICK' });
  });
  it('out-of-range index → null', () => {
    expect(tpcFillIndexToStarr(-1)).toBeNull();
    expect(tpcFillIndexToStarr(99)).toBeNull();
  });
  it('every name in the list maps to a non-null Starr spec (full coverage)', () => {
    for (const name of TPC_FILL_NAMES) {
      expect(tpcFillNameToStarr(name), `name="${name}"`).not.toBeNull();
    }
  });
});
