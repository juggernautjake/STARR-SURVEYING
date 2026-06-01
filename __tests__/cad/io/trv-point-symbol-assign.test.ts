// __tests__/cad/io/trv-point-symbol-assign.test.ts
//
// cad-trv-fidelity Slice 7 — imported TRV points get a monument /
// utility symbol when their feature code (first token of the `1,…`
// description) EXACTLY matches a symbol's assignedCodes. Free-form
// descriptions never mis-assign; unmatched points keep the crosshair.

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

function pointFor(desc: string) {
  const trv = ['999,begin', '#,POINTS', '95,1', '0,P1', `1,${desc}`, '3,0', '4,5,0,0', '2,100,200,0', '999,end'].join('\r\n');
  const { features } = trvToDrawing(parseTrv(trv));
  return features.find((f) => f.type === 'POINT' && !f.properties.trvPointMirror)!;
}

describe('TRV point → symbol assignment by code', () => {
  it('assigns a symbol when the feature code matches assignedCodes', () => {
    expect(pointFor('309').style.symbolId).toBeTruthy();
  });

  it('matches on the FIRST token of a multi-word description', () => {
    // "309 inside 315" → code 309 still resolves.
    expect(pointFor('309 inside 315 1in').style.symbolId).toBeTruthy();
  });

  it('leaves free-form / unmatched descriptions with no symbol (crosshair)', () => {
    expect(pointFor('edg lane').style.symbolId).toBeNull();
    expect(pointFor('cntr gravel lane').style.symbolId).toBeNull();
  });

  it('a point with no description gets no symbol', () => {
    const trv = ['999,begin', '#,POINTS', '95,1', '0,P1', '3,0', '4,5,0,0', '2,100,200,0', '999,end'].join('\r\n');
    const { features } = trvToDrawing(parseTrv(trv));
    const pt = features.find((f) => f.type === 'POINT' && !f.properties.trvPointMirror)!;
    expect(pt.style.symbolId).toBeNull();
  });
});
