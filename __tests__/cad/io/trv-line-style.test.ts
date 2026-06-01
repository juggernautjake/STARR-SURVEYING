// __tests__/cad/io/trv-line-style.test.ts
//
// cad-trv-straight-line-styling Slice 1 — decode 51/71 styling
// records into Starr line style. Anchored on the EXACT records
// from the live Garland file, paired with the Traverse Drawing
// Settings dialog selections the user screenshotted.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { decodeTrvLineStyle } from '@/lib/cad/io/trv-line-style';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

// Raw records lifted verbatim from the live file.
const DECK = [
  { code: '51', fields: '0,1,0,384,2147483648,6,8.00,0,0,4.00,0,0,0.00,1,0,Arial,Arial,5,37,2,1,4,3,0,10.00,20.00,200.00,0,2,3,3,0,2,0,4'.split(',') },
  { code: '70', fields: '0,5.0,1.000000,170.000000,0'.split(',') },
  { code: '71', fields: ['5', '37'] },
];
const ROAD = [
  { code: '51', fields: '0,1,0,0,2147483648,6,8.00,0,0,8.00,0,0,0.00,1,0,Arial,Arial,22,37,2,1,4,3,0,10.00,20.00,200.00,0,2,3,3,0,2,0,4'.split(',') },
  { code: '71', fields: ['22', '37'] },
];
const FENCE = [
  { code: '51', fields: '0,-43,0,0,2147483776,6,8.00,0,0,8.00,0,0,0.00,1,0,Arial,Arial,0,7,2,1,4,3,0,10.00,20.00,200.00,0,2,3,3,0,2,0,4'.split(',') },
  { code: '71', fields: ['0', '7'] },
];
const BOUNDARY = [
  { code: '51', fields: '8,1,0,2432,2147876992,6,6.00,0,1,8.00,0,1,2.00,1,0,Arial,Arial,0,7,2,1,4,3,0,10.00,20.00,200.00,0,2,3,3,0,2,0,4'.split(',') },
  { code: '71', fields: ['0', '7'] },
];

describe('decodeTrvLineStyle — DECK (Diagonal /)', () => {
  it('decodes DECK fill 71,5 → LINES @ 45° (Diagonal /)', () => {
    const s = decodeTrvLineStyle(DECK);
    expect(s.fillPattern).toBe('LINES');
    expect(s.fillRotation).toBe(45);
    expect(s.tpcFillName).toBe('Diagonal /');
  });
  it('DECK line is solid, not bold', () => {
    const s = decodeTrvLineStyle(DECK);
    expect(s.lineTypeId).toBe('SOLID');
    expect(s.isBold).toBe(false);
  });
});

describe('decodeTrvLineStyle — ROAD (5 Percent)', () => {
  it('decodes ROAD fill 71,22 → DOT_UNIFORM (5 Percent)', () => {
    const s = decodeTrvLineStyle(ROAD);
    expect(s.fillPattern).toBe('DOT_UNIFORM');
    expect(s.tpcFillName).toBe('5 Percent');
  });
});

describe('decodeTrvLineStyle — FENCE (Fence Wire)', () => {
  it('decodes FENCE line-type 51 field1 = -43 → FENCE_BARBED_WIRE', () => {
    const s = decodeTrvLineStyle(FENCE);
    expect(s.lineTypeId).toBe('FENCE_BARBED_WIRE');
  });
  it('FENCE has no fill (71,0)', () => {
    expect(decodeTrvLineStyle(FENCE).fillPattern).toBe('NONE');
  });
});

describe('decodeTrvLineStyle — BOUNDARY (bold solid, no fill)', () => {
  it('BOUNDARY is bold (51 field0 = 8) + solid + no fill', () => {
    const s = decodeTrvLineStyle(BOUNDARY);
    expect(s.isBold).toBe(true);
    expect(s.lineTypeId).toBe('SOLID');
    expect(s.fillPattern).toBe('NONE');
  });
});

describe('decodeTrvLineStyle — defaults', () => {
  it('empty styling records → solid, not bold, no fill', () => {
    expect(decodeTrvLineStyle([])).toMatchObject({
      lineTypeId: 'SOLID', isBold: false, fillPattern: 'NONE',
    });
  });
  it('a 71 field0 < 5 → no fill (sentinel)', () => {
    expect(decodeTrvLineStyle([{ code: '71', fields: ['0', '7'] }]).fillPattern).toBe('NONE');
    expect(decodeTrvLineStyle([{ code: '71', fields: ['4', '0'] }]).fillPattern).toBe('NONE');
  });
});

describe('trvToDrawing — applies decoded style to traverse polylines', () => {
  const file = '/root/.claude/uploads/945f3c7a-22b1-497a-95dd-c0247c40d951/f5ca728d-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_2.TRV';
  const fallback = '/root/.claude/uploads/3aabb6e2-d4ed-4464-a0ee-cc91d947899e/dd403c19-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_2.TRV';
  const path = fs.existsSync(file) ? file : fallback;

  it.skipIf(!fs.existsSync(path))('DECK polyline gets a LINES fill; FENCE gets the fence-wire line type', () => {
    const { features } = trvToDrawing(parseTrv(fs.readFileSync(path, 'latin1')));
    const deck = features.find((f) => f.properties.name === 'DECK');
    const fence = features.find((f) => f.properties.name === 'FENCE');
    if (deck) {
      expect(deck.style.fillPattern).toBe('LINES');
      expect(deck.properties.trvFillName).toBe('Diagonal /');
    }
    if (fence) {
      expect(fence.style.lineTypeId).toBe('FENCE_BARBED_WIRE');
    }
  });

  it.skipIf(!fs.existsSync(path))('BOUNDARY polygon is bold solid with no fill', () => {
    const { features } = trvToDrawing(parseTrv(fs.readFileSync(path, 'latin1')));
    const boundary = features.find((f) => f.properties.name === 'BOUNDARY');
    if (boundary) {
      expect(boundary.style.lineWeight).toBe(0.5);
      expect(boundary.style.lineTypeId).toBe('SOLID');
      expect(boundary.style.fillPattern).toBe('NONE');
    }
  });
});
