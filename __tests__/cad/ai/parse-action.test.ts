// __tests__/cad/ai/parse-action.test.ts
// The action parser must NEVER throw on malformed/hallucinated JSON and
// must sanitize EDIT_DRAWING fields (drop non-finite coords, bad shapes).
import { describe, it, expect } from 'vitest';
import { parseAction } from '@/lib/cad/ai-engine/drawing-chat';

describe('parseAction — robustness', () => {
  it('returns null for non-objects and unknown types without throwing', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { type: 'BOGUS' }]) {
      expect(() => parseAction(bad as unknown)).not.toThrow();
    }
    expect(parseAction({ type: 'BOGUS' })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });

  it('parses a valid EDIT_DRAWING and drops malformed sub-fields', () => {
    const a = parseAction({
      type: 'EDIT_DRAWING',
      description: 'mix',
      add: [
        { shape: 'POLYGON', points: [{ northing: 0, easting: 0 }, { northing: 0, easting: 10 }, { northing: 10, easting: 10 }] },
        { shape: 'BOGUS', points: [{ northing: 1, easting: 1 }] },              // bad shape → dropped
        { shape: 'POINT', points: [{ northing: 'x', easting: 1 }] },            // bad coord → no points → dropped
      ],
      deleteIds: ['a', 5, 'b'],
      transform: { ids: 'SELECTION', rotateDeg: 15, scale: -2 },               // negative scale dropped
      fit: [{ shape: 'RECTANGLE', fromIds: ['p1', 'p2'] }],
      createLayers: [{ name: 'FENCE', color: '#fff' }, { name: '' }],          // empty name dropped
    });
    expect(a).not.toBeNull();
    expect(a!.type).toBe('EDIT_DRAWING');
    expect(a!.add).toHaveLength(1);
    expect(a!.add![0].shape).toBe('POLYGON');
    expect(a!.deleteIds).toEqual(['a', 'b']);
    expect(a!.transform!.rotateDeg).toBe(15);
    expect(a!.transform!.scale).toBeUndefined();   // -2 rejected
    expect(a!.fit).toHaveLength(1);
    expect(a!.createLayers).toHaveLength(1);
  });

  it('drops non-finite coordinates', () => {
    const a = parseAction({
      type: 'EDIT_DRAWING', description: 'd',
      add: [{ shape: 'LINE', points: [{ northing: 0, easting: 0 }, { northing: Infinity, easting: 1 }] }],
    });
    // only the one finite coord survives → LINE needs 2 → spec still kept with 1 point,
    // executor will reject; parser just must not include the Infinity coord.
    expect(a!.add![0].points).toHaveLength(1);
  });

  it('keeps simple actions (NO_ACTION / UPDATE_SETTING) intact', () => {
    expect(parseAction({ type: 'NO_ACTION', description: 'q' })!.type).toBe('NO_ACTION');
    const u = parseAction({ type: 'UPDATE_SETTING', description: 's', patch: { drawingScale: 100 } });
    expect(u!.patch!.drawingScale).toBe('100');
  });
});
