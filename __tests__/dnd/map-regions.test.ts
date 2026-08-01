// __tests__/dnd/map-regions.test.ts — which regions a token just walked into (M6-4's events).
//
// The failure this guards is the one that makes a map look broken rather than clever: a pit trap that
// springs on every step across the room it is in, because the code asked "is the token inside" instead of
// "did the token enter".
import { describe, it, expect } from 'vitest';
import { contains, entered, left, type Region } from '@/lib/dnd/maps/regions';

const room: Region = { id: 'room', x: 50, y: 50, w: 20, h: 20 }; // 40..60 on both axes
const hall: Region = { id: 'hall', x: 70, y: 50, w: 20, h: 20 }; // 60..80

describe('contains', () => {
  it('is centred on its own point, like everything else on this map', () => {
    expect(contains(room, 50, 50)).toBe(true);
    expect(contains(room, 41, 41)).toBe(true);
    expect(contains(room, 39, 50)).toBe(false);
  });

  it('is HALF-OPEN on the far edge, so adjacent rooms do not overlap on their shared wall', () => {
    // A closed interval counts both ends of a span, so the boundary at x=60 would be in BOTH rooms and
    // one step would fire two triggers. Same rule the terrain patches and the cube template use.
    expect(contains(room, 60, 50)).toBe(false);
    expect(contains(hall, 60, 50)).toBe(true);
  });

  it('gives a sizeless area one cell rather than zero', () => {
    const dot: Region = { id: 'd', x: 10, y: 10, w: null, h: null };
    expect(contains(dot, 10, 10)).toBe(true);
    expect(contains(dot, 13, 10)).toBe(false);
  });
});

describe('entered', () => {
  it('fires when a token crosses in', () => {
    expect(entered([room], { x: 30, y: 50 }, { x: 50, y: 50 }).map((r) => r.id)).toEqual(['room']);
  });

  it('does NOT fire when a token moves within the room it is already in', () => {
    // The defect this whole module exists to avoid: a pit trap springing on every step across it reads
    // as the map being broken, not as the puzzle being clever.
    expect(entered([room], { x: 45, y: 45 }, { x: 55, y: 55 })).toEqual([]);
  });

  it('does not fire for a token that never goes in', () => {
    expect(entered([room], { x: 10, y: 10 }, { x: 20, y: 20 })).toEqual([]);
  });

  it('does not fire on the way OUT', () => {
    expect(entered([room], { x: 50, y: 50 }, { x: 30, y: 50 })).toEqual([]);
  });

  it('fires once per region for a step that enters two nested ones', () => {
    const inner: Region = { id: 'inner', x: 50, y: 50, w: 6, h: 6 };
    expect(entered([room, inner], { x: 10, y: 10 }, { x: 50, y: 50 }).map((r) => r.id)).toEqual(['room', 'inner']);
  });

  it('preserves the order it was given, so nested rooms fire as the DM authored them', () => {
    const inner: Region = { id: 'inner', x: 50, y: 50, w: 6, h: 6 };
    expect(entered([inner, room], { x: 10, y: 10 }, { x: 50, y: 50 }).map((r) => r.id)).toEqual(['inner', 'room']);
  });
});

describe('left is the mirror', () => {
  it('fires when a token crosses out', () => {
    expect(left([room], { x: 50, y: 50 }, { x: 30, y: 50 }).map((r) => r.id)).toEqual(['room']);
  });

  it('does not fire on the way in', () => {
    expect(left([room], { x: 30, y: 50 }, { x: 50, y: 50 })).toEqual([]);
  });

  it('crossing from one room to the next both leaves and enters', () => {
    const from = { x: 50, y: 50 };
    const to = { x: 70, y: 50 };
    expect(left([room, hall], from, to).map((r) => r.id)).toEqual(['room']);
    expect(entered([room, hall], from, to).map((r) => r.id)).toEqual(['hall']);
  });
});
