// __tests__/cad/io/trv-construction-hidden.test.ts
//
// cad-trv-fidelity Slice 5 — TPC working COPIES / DUPLICATES / parallel
// OFFSET traverses are construction artifacts it doesn't plot. They
// import HIDDEN (parity with TPC, no stray lines) but stay in the doc +
// Layers panel so the surveyor can unhide them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

/** Two points + two segments forming one traverse named `name`. */
function traverseTrv(name: string): string {
  return [
    '999,begin', '#,POINTS', '95,2',
    '0,A', '3,0', '4,5,0,0', '2,100,200,0',
    '0,B', '3,0', '4,5,0,0', '2,150,260,0',
    '#,TRAVERSE',
    `30,${name}`,
    '31,536870914,2,0,0',
    '10,A', '11,1,0,0,0,0',
    '10,B', '11,1,1,0,0,0',
    '999,end',
  ].join('\r\n');
}

function traversePolylineHidden(name: string): boolean {
  const { features } = trvToDrawing(parseTrv(traverseTrv(name)));
  const poly = features.find((f) => f.type === 'POLYLINE' || f.type === 'POLYGON');
  return poly?.hidden === true;
}

describe('construction / duplicate / offset traverses import hidden', () => {
  it('hides Copy- and DUP- traverses', () => {
    expect(traversePolylineHidden('Copy-CONCRETE 1')).toBe(true);
    expect(traversePolylineHidden('DUP-BOUNDARY')).toBe(true);
  });
  it('hides parallel offset traverses (Right/Left N Feet-)', () => {
    expect(traversePolylineHidden('Right 4.00 Feet-ctr grav lane')).toBe(true);
    expect(traversePolylineHidden('Left 0.70 Feet-CHURCH SIGN')).toBe(true);
  });
  it('hides "… offsets" helper traverses', () => {
    expect(traversePolylineHidden('parsonage offsets')).toBe(true);
    expect(traversePolylineHidden('CHURCH OFFSETS')).toBe(true);
  });
  it('does NOT hide a normal drawn traverse', () => {
    expect(traversePolylineHidden('BOUNDARY')).toBe(false);
    expect(traversePolylineHidden('ctr grav lane')).toBe(false);
    expect(traversePolylineHidden('east fence')).toBe(false);
  });
});

describe('Hillsboro integration', () => {
  const sample = path.join(__dirname, '..', '..', 'fixtures', 'trv', 'hillsboro-nazarene.trv');
  it.skipIf(!fs.existsSync(sample))('hides the construction traverses (stray lines) but keeps them in the doc', () => {
    const { features, notes } = trvToDrawing(parseTrv(fs.readFileSync(sample, 'latin1')));
    const trav = features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON');
    const hidden = trav.filter((f) => f.hidden === true);
    expect(hidden.length).toBeGreaterThan(0);
    // They're hidden, not dropped — still present for unhide.
    expect(trav.length).toBeGreaterThan(hidden.length);
    expect(notes.some((n) => /construction\/duplicate\/offset/.test(n))).toBe(true);
  });
});
