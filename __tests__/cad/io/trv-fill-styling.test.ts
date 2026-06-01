// __tests__/cad/io/trv-fill-styling.test.ts
//
// cad-trv-element-coverage Slice 4 — partial decoder for TRV's
// per-traverse fill styling. Without Traverse PC docs we can't
// pick a specific Starr fillPattern, but the binary signal for
// "this traverse has fill" (71 field 0 > 0) is clean across
// the live samples + the decoder surfaces enough metadata for
// the surveyor to manually pick a Starr pattern via the
// existing PropertyPanel infill picker.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { extractTrvFillSummary, hasTrvFillSpec } from '@/lib/cad/io/trv-fill-styling';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

describe('extractTrvFillSummary — pure', () => {
  it('an empty styling list returns hasFill = false + everything null', () => {
    const s = extractTrvFillSummary([]);
    expect(s).toEqual({ hasFill: false, subtypeIndex: null, fillKindCode: null, scale: null, param170: null });
  });

  it('a default `71,0,7` traverse has no fill', () => {
    const s = extractTrvFillSummary([
      { code: '71', fields: ['0', '7'] },
      { code: '70', fields: ['0', '5.0', '1.000000', '170.000000', '0'] },
    ]);
    expect(s.hasFill).toBe(false);
  });

  it('a `71,5,37` traverse (e.g. DECK / WEST BUILDING) reports hasFill + the subtype', () => {
    const s = extractTrvFillSummary([
      { code: '71', fields: ['5', '37'] },
      { code: '70', fields: ['0', '5.0', '1.000000', '170.000000', '0'] },
    ]);
    expect(s.hasFill).toBe(true);
    expect(s.fillKindCode).toBe(5);
    expect(s.subtypeIndex).toBe(37);
  });

  it('lifts scale + param170 from the 70 record', () => {
    const s = extractTrvFillSummary([
      { code: '71', fields: ['5', '37'] },
      { code: '70', fields: ['0', '5.0', '1.0', '170.0', '0'] },
    ]);
    expect(s.scale).toBe(5);
    expect(s.param170).toBe(170);
  });

  it('the FIRST fill-bearing 71 wins when multiple are present', () => {
    const s = extractTrvFillSummary([
      { code: '71', fields: ['0', '7'] },
      { code: '71', fields: ['1', '4'] },
      { code: '71', fields: ['5', '37'] },
    ]);
    expect(s.fillKindCode).toBe(1);
    expect(s.subtypeIndex).toBe(4);
  });

  it('ignores unrelated records (32 / 33 / 51 etc.)', () => {
    const s = extractTrvFillSummary([
      { code: '32', fields: ['1', '0°00\'00"', '0.000000', '-44°43\'55"'] },
      { code: '33', fields: ['12343.499142'] },
      { code: '51', fields: ['8', '1', '0', '2432'] },
    ]);
    expect(s.hasFill).toBe(false);
  });
});

describe('hasTrvFillSpec', () => {
  it('returns the same boolean as extractTrvFillSummary().hasFill', () => {
    expect(hasTrvFillSpec([{ code: '71', fields: ['0', '7'] }])).toBe(false);
    expect(hasTrvFillSpec([{ code: '71', fields: ['5', '37'] }])).toBe(true);
  });
});

describe('trvToDrawing — stamps fill metadata on fill-bearing traverses', () => {
  it('a synthesised DECK-style traverse lands with trvHasFillSpec=true + the raw subtype', () => {
    const text = [
      '999,begin',
      '#,POINTS',
      '95,4',
      '0,a', '3,0', '4,5,0,0', '2,100,100,0',
      '0,b', '3,0', '4,5,0,0', '2,200,100,0',
      '0,c', '3,0', '4,5,0,0', '2,200,200,0',
      '0,d', '3,0', '4,5,0,0', '2,100,200,0',
      '#,TRAVERSE',
      '30,DECK',
      '31,0,4,0,0',
      '51,0,1,0,384,2147483648,6,8.00,0,0,4.00,0,0,0.00,1,0,Arial,Arial,5,37,2,1,4,3,0,10.00,20.00,200.00,0,2,3,3,0,2,0,4',
      '70,0,5.0,1.000000,170.000000,0',
      '71,5,37',
      '10,a', '11,1,0,0,3,0',
      '10,b', '11,1,1,0,3,0',
      '10,c', '11,1,2,0,3,0',
      '10,d', '11,1,3,0,3,0',
      '10,a', '11,1,4,0,3,0',
      '999,end',
    ].join('\r\n');
    const { features } = trvToDrawing(parseTrv(text));
    const polygon = features.find((f) => f.type === 'POLYGON');
    expect(polygon).toBeDefined();
    expect(polygon!.properties.trvHasFillSpec).toBe(true);
    expect(polygon!.properties.trvFillKindCode).toBe(5);
    expect(polygon!.properties.trvFillSubtypeIndex).toBe(37);
    expect(polygon!.properties.trvFillScale).toBe(5);
    expect(polygon!.properties.trvFillParam170).toBe(170);
  });

  it('a default (no-fill) traverse does NOT stamp trvHasFillSpec', () => {
    const text = [
      '999,begin',
      '#,POINTS',
      '95,3',
      '0,a', '3,0', '4,5,0,0', '2,100,100,0',
      '0,b', '3,0', '4,5,0,0', '2,200,100,0',
      '0,c', '3,0', '4,5,0,0', '2,200,200,0',
      '#,TRAVERSE',
      '30,bndry',
      '31,0,3,0,0',
      '70,0,5.0,1.000000,170.000000,0',
      '71,0,7',
      '10,a', '11,1,0,0,3,0',
      '10,b', '11,1,1,0,3,0',
      '10,c', '11,1,2,0,3,0',
      '999,end',
    ].join('\r\n');
    const polyline = trvToDrawing(parseTrv(text)).features.find((f) => f.type === 'POLYLINE');
    expect(polyline!.properties.trvHasFillSpec).toBeUndefined();
  });
});

describe('trvToDrawing — Garland live sample fill metadata', () => {
  const sample = '/root/.claude/uploads/586362d4-da1f-4c40-b1d9-3487a6982d53/07a3cb8a-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV';
  it.skipIf(!fs.existsSync(sample))('detects fill-bearing traverses on the live file', () => {
    const trv = parseTrv(fs.readFileSync(sample, 'latin1'));
    // From the diagnostic: 71 has values { '0': 9, '1': 1, '4': 1, '5': 4, '22': 1, '23': 4 }
    // → 1 + 1 + 4 + 1 + 4 = 11 fill-bearing traverses.
    const { features } = trvToDrawing(trv);
    const fillBearing = features.filter((f) => f.properties.trvHasFillSpec === true);
    expect(fillBearing.length).toBeGreaterThanOrEqual(5);
  });
});
