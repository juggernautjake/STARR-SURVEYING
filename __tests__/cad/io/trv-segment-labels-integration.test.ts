// __tests__/cad/io/trv-segment-labels-integration.test.ts
//
// cad-trv-line-curve-fidelity Slice 2 — the mapper attaches TPC's
// verbatim 28,15 segment labels + 28,14 area label onto the
// matching traverse polyline / polygon.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

const PILCROW = '¶';
const DC4 = '\x14';

const FIXTURE = [
  '999,begin',
  '#,POINTS',
  '95,4',
  '0,20fnd', '1,309 inside 315 1in', '3,0', '4,5,0,0', '2,10385166.492,3245972.976,661.84',
  '0,21fnd', '1,309 w/ angle iron',   '3,0', '4,5,0,0', '2,10385251.253,3245685.600,652.92',
  '0,22fnd', '1,U shaped w/wings',    '3,0', '4,5,0,0', '2,10385389.919,3245727.070,658.15',
  '0,23fnd', '1,314 inside 315',      '3,0', '4,5,0,0', '2,10385305.140,3246014.441,664.50',
  '#,TRAVERSE',
  '30,BOUNDARY',
  '31,0,4,0,0',
  '10,20fnd', '11,1,0,0,3,0',
  '10,21fnd', '11,1,1,0,3,0',
  '10,22fnd', '11,1,2,0,3,0',
  '10,23fnd', '11,1,3,0,3,0',
  '10,20fnd', '11,1,4,0,3,0',
  // Drawing elements: 2 segment labels + 1 area label.
  `28,15,20fnd,21fnd`,
  `29,5,-0.18,-0.51,0,1,8.00,3435,14,N 73°34'00" W 299.62'${PILCROW}`,
  `28,15,23fnd,20fnd`,
  `29,5,0.45,-0.18,0,1,8.00,733,14,S 16°39'01" W 144.72'${PILCROW}`,
  `28,14,6`,
  `29,5,-1.09,0.36,0,0,10.00,0,6,43362 SqFt${DC4}0.995 Acres${PILCROW}`,
  '999,end',
].join('\r\n');

describe('trvToDrawing — Slice 2 segment + area label attachment', () => {
  it('attaches the 28,15 segment labels onto the BOUNDARY polygon', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const boundary = features.find((f) => f.type === 'POLYGON');
    expect(boundary).toBeDefined();
    const raw = boundary!.properties.trvSegmentLabels as string;
    expect(raw).toBeDefined();
    const segs = JSON.parse(raw);
    expect(segs).toHaveLength(2);
    expect(segs).toContainEqual({ fromId: '20fnd', toId: '21fnd', text: 'N 73°34\'00" W 299.62\'' });
    expect(segs).toContainEqual({ fromId: '23fnd', toId: '20fnd', text: 'S 16°39\'01" W 144.72\'' });
  });

  it('attaches the 28,14 area label onto the boundary polygon', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const boundary = features.find((f) => f.type === 'POLYGON')!;
    expect(boundary.properties.trvAreaLabel).toBe('43362 SqFt 0.995 Acres');
  });

  it('records a mapper note for the attached labels', () => {
    const { notes } = trvToDrawing(parseTrv(FIXTURE));
    expect(notes.some((n) => n.includes('segment label') && n.includes('area label'))).toBe(true);
  });

  it('a TRV with no drawing-element labels attaches nothing (no crash)', () => {
    const noLabels = FIXTURE.split('\r\n').filter((l) => !l.startsWith('28,') && !l.startsWith('29,')).join('\r\n');
    const { features } = trvToDrawing(parseTrv(noLabels));
    const boundary = features.find((f) => f.type === 'POLYGON')!;
    expect(boundary.properties.trvSegmentLabels).toBeUndefined();
    expect(boundary.properties.trvAreaLabel).toBeUndefined();
  });
});

describe('trvToDrawing — Slice 2 against the live Garland file', () => {
  const file = '/root/.claude/uploads/3aabb6e2-d4ed-4464-a0ee-cc91d947899e/dd403c19-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_2.TRV';
  it.skipIf(!fs.existsSync(file))('the boundary polygon carries the area + segment labels', () => {
    const { features } = trvToDrawing(parseTrv(fs.readFileSync(file, 'latin1')));
    const withArea = features.find((f) => typeof f.properties.trvAreaLabel === 'string');
    expect(withArea).toBeDefined();
    expect(String(withArea!.properties.trvAreaLabel)).toContain('43362 SqFt');
    const withSegs = features.find((f) => typeof f.properties.trvSegmentLabels === 'string');
    expect(withSegs).toBeDefined();
  });
});
