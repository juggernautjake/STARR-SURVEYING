// __tests__/dnd/map-fog.test.ts — what a player can see (M7-2).
//
// The failure this guards is the one that matters on a battle map: fog that DARKENS a token instead of
// HIDING it. A piece drawn under a translucent overlay is a piece anybody can find by turning up their
// screen brightness — the same class of mistake as filtering a secret in React instead of in the query.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SIGHT_FT, fogHoles, isVisible, readFog, visionFt } from '@/lib/dnd/maps/fog';

describe('vision comes off the sheet', () => {
  it('reads a stated sense', () => {
    expect(visionFt(['Darkvision 60 ft'])).toBe(60);
    expect(visionFt(['Darkvision 120 feet'])).toBe(120);
  });

  it('takes the LARGEST, not the first', () => {
    // Taking the first would make the answer depend on the order a species file happened to be written
    // in — a character with tremorsense listed above darkvision would see half as far for no reason.
    expect(visionFt(['Tremorsense 30 ft', 'Darkvision 60 ft'])).toBe(60);
    expect(visionFt(['Darkvision 60 ft', 'Tremorsense 30 ft'])).toBe(60);
  });

  it('falls back to a STATED default rather than to blindness', () => {
    // With fog on, a token that revealed nothing at all would make a party of humans blind, and a DM
    // would have to hand out darkvision to run a dark corridor.
    expect(visionFt([])).toBe(DEFAULT_SIGHT_FT);
    expect(visionFt(undefined)).toBe(DEFAULT_SIGHT_FT);
    expect(visionFt(['Keen hearing'])).toBe(DEFAULT_SIGHT_FT);
  });

  it('never returns LESS than the default, even for a stated tiny sense', () => {
    expect(visionFt(['Blindsight 5 ft'])).toBe(DEFAULT_SIGHT_FT);
  });
});

describe('the holes', () => {
  it('a revealed rectangle is centred on its own point', () => {
    const [h] = fogHoles([{ x: 50, y: 50, w: 10, h: 20 }], []);
    expect(h).toEqual({ x: 50, y: 50, w: 10, h: 20 });
    expect(isVisible([h], 50, 50)).toBe(true);
    expect(isVisible([h], 44, 50)).toBe(false);   // outside half-width 5
    expect(isVisible([h], 50, 59)).toBe(true);    // inside half-height 10
  });

  it('a square patch with no height uses its width', () => {
    const [h] = fogHoles([{ x: 10, y: 10, w: 6, h: null }], []);
    expect(isVisible([h], 10, 12)).toBe(true);
    expect(isVisible([h], 10, 14)).toBe(false);
  });

  it('a token sees a circle', () => {
    const holes = fogHoles([], [{ x: 20, y: 20, radiusWorld: 10 }]);
    expect(isVisible(holes, 20, 29)).toBe(true);
    expect(isVisible(holes, 20, 31)).toBe(false);
  });

  it('a token with no vision punches no hole', () => {
    // Better a token that reveals nothing than a zero-radius circle the mask has to render.
    expect(fogHoles([], [{ x: 1, y: 1, radiusWorld: 0 }])).toEqual([]);
  });

  it('nothing is visible when there are no holes at all', () => {
    // A freshly-fogged map with nothing revealed is entirely dark, which is the state a DM wants before
    // the party opens the door — and the state an "infer fog from the patches" design could not express.
    expect(isVisible([], 50, 50)).toBe(false);
  });
});

describe('the marker', () => {
  it('only `revealed` counts', () => {
    expect(readFog({ fog: 'revealed' })).toBe('revealed');
    expect(readFog({ fog: 'hidden' })).toBeNull();
    expect(readFog({ fog: true })).toBeNull();
    expect(readFog({})).toBeNull();
    expect(readFog(null)).toBeNull();
  });
});

describe('fog HIDES rather than darkens', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/dnd/campaigns/[id]/world/page.tsx'), 'utf8');

  it('the page filters tokens, scenery, pins and reveals through the fog', () => {
    // Four separate render lists, and a fog that covered three of them would leak the fourth. Asserted
    // structurally because the leak is invisible in a screenshot: the token is there, under the dark.
    const filters = PAGE.match(/throughFog\(/g) ?? [];
    expect(filters.length, 'every world-space list must be filtered through the fog').toBeGreaterThanOrEqual(5);
  });

  it('the DM is exempt, so their fog is a wash over a map they can still read', () => {
    expect(PAGE).toMatch(/!fogOn \|\| isDm \|\| visibleThroughFog/);
  });

  it('a fog patch is not itself drawn as scenery', () => {
    // It is the HOLE. Drawing it would put a visible box around every revealed room.
    expect(PAGE).toMatch(/\.filter\(\(o\) => !readFog\(o\.data\)\)/);
  });
});
