// __tests__/cad/io/trv-layer-prefs-bridge.test.ts
//
// cad-trv-import-polish Slice 4 — TRV-imported POINT features
// now carry the standard Starr property names (pointName +
// description) IN ADDITION to the TRV-specific ones
// (trvPointId + label). The layer-preference panel's "Show
// point names" + "Show point descriptions" toggles read the
// standard fields via lib/cad/labels/generate-labels.ts; this
// spec locks the bridge.

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

const FIXTURE = [
  '999,begin',
  '#,POINTS',
  '95,2',
  '0,20fnd',
  '1,309 inside 315 1in',
  '3,0',
  '4,5,0,0',
  '2,4994.142075,4999.0675795,700',
  '0,21fnd',
  '3,0',
  '4,5,0,0',
  '2,4999.857,4982.031,700.662',
  '999,end',
].join('\r\n');

describe('TRV POINT features bridge into the standard Starr label fields', () => {
  it('stamps properties.pointName (= TRV id) so "Show point names" works', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const p1 = features.find((f) => f.properties.trvPointId === '20fnd')!;
    expect(p1.properties.pointName).toBe('20fnd');
    const p2 = features.find((f) => f.properties.trvPointId === '21fnd')!;
    expect(p2.properties.pointName).toBe('21fnd');
  });

  it('mirrors the native 1,<description> line into properties.description', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const p1 = features.find((f) => f.properties.trvPointId === '20fnd')!;
    expect(p1.properties.description).toBe('309 inside 315 1in');
    expect(p1.properties.label).toBe('309 inside 315 1in');
  });

  it('a point with no description has neither description nor label set', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const p2 = features.find((f) => f.properties.trvPointId === '21fnd')!;
    expect(p2.properties.description).toBeUndefined();
    expect(p2.properties.label).toBeUndefined();
  });

  it('a subtype-12 drawing-element label also mirrors into properties.description', () => {
    const text = [
      '999,begin',
      '#,POINTS',
      '95,1',
      '0,20fnd',
      '3,0',
      '4,5,0,0',
      '2,100,200,0',
      '#,TRAVERSE',
      '30,decor',
      '31,0,0,0,0',
      `28,12,20fnd`,
      `29,5,0.03,-0.07,0,1,6.00,0,0,309 inside 315 1in¶`,
      '999,end',
    ].join('\r\n');
    const { features } = trvToDrawing(parseTrv(text));
    const p = features.find((f) => f.properties.trvPointId === '20fnd')!;
    expect(p.properties.label).toBe('309 inside 315 1in');
    expect(p.properties.description).toBe('309 inside 315 1in');
  });
});
