// __tests__/cad/io/trv-bearings-display-prefs.test.ts
//
// cad-trv-bearings-and-distances Slice 2 — TRV mapper now seeds
// `displayPreferences.showBearings` + `showDistances` on the
// synthetic Drawing layer, and `showPointNames` +
// `showPointDescriptions` on the synthetic Points layer, so the
// labels render immediately on import (matching TPC's default
// Traverse View output).

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

const FIXTURE = [
  '999,begin',
  '101,Sample Project',
  '#,SURVEY',
  '86,Boundaries,3,0',
  '#,POINTS',
  '95,4',
  '0,20fnd', '1,309 inside 315 1in', '3,3', '4,5,0,0', '2,10385166.492,3245972.976,661.84',
  '0,21fnd', '1,309 w/ angle iron',   '3,3', '4,5,0,0', '2,10385251.253,3245685.600,652.92',
  '0,22fnd', '1,U shaped w/wings',    '3,3', '4,5,0,0', '2,10385389.919,3245727.070,658.15',
  '0,23fnd', '1,314 inside 315',      '3,3', '4,5,0,0', '2,10385305.140,3246014.441,664.50',
  '#,TRAVERSE',
  '30,BOUNDARY',
  '31,0,4,0,0',
  '10,20fnd', '11,1,0,0,3,0',
  '10,21fnd', '11,1,1,0,3,0',
  '10,22fnd', '11,1,2,0,3,0',
  '10,23fnd', '11,1,3,0,3,0',
  '10,20fnd', '11,1,4,0,3,0',
  '999,end',
].join('\r\n');

// cad-trv-label-prefs-off Slice 1 — imported layers come in with
// ALL display-preference toggles OFF. (Reversed the earlier
// seeding: the user wants anything imported to start with every
// label toggle off; only .starr / saved files carry stored
// prefs. Seeding the pref without generating textLabels also left
// a dead "toggle on, nothing renders" state.)
describe('TRV mapper — imported layers start with ALL label toggles OFF', () => {
  it('the Drawing layer does NOT pre-enable bearings / distances', () => {
    const { layers } = trvToDrawing(parseTrv(FIXTURE));
    const drawing = layers.find((l) => l.id.startsWith('trv-drawing:'));
    expect(drawing).toBeDefined();
    // No seeded displayPreferences → undefined (label generator
    // falls back to the all-off DEFAULT).
    expect(drawing!.displayPreferences?.showBearings ?? false).toBe(false);
    expect(drawing!.displayPreferences?.showDistances ?? false).toBe(false);
  });

  it('the Points layer does NOT pre-enable point names / descriptions', () => {
    const { layers } = trvToDrawing(parseTrv(FIXTURE));
    const pts = layers.find((l) => l.id.startsWith('trv-points:'));
    expect(pts).toBeDefined();
    expect(pts!.displayPreferences?.showPointNames ?? false).toBe(false);
    expect(pts!.displayPreferences?.showPointDescriptions ?? false).toBe(false);
  });
});
