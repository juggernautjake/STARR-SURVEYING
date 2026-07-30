// __tests__/dnd/map-tokens.test.ts — a creature standing on a map (M5-1).
//
// Owner, 2026-07-30: *"Make sure we can actually run sessions with it."* `dnd_map_objects` has carried a
// `token` kind since M1-3 and nothing had ever written one, so these are the rules that layer needs before
// a DM can put a piece on the board.
//
// The judgement under test is G4 — THE SHEET OWNS THE NUMBERS. A token stores who it is and where it
// stands, and nothing else; a token carrying a copy of a creature's HP is wrong the moment the player takes
// damage, with nothing to tell either surface they now disagree.
import { describe, it, expect } from 'vitest';
import {
  SIZE_SQUARES, TOKEN_SIZES, clampToMap, readToken, snapToGrid, tokenFootprint,
} from '@/lib/dnd/maps/tokens';

describe('what a token is bound to', () => {
  it('reads a character, a catalogue creature, or a variant', () => {
    expect(readToken({ characterId: 'c1', size: 'medium' })?.subject).toEqual({ characterId: 'c1' });
    expect(readToken({ creatureId: 'k1' })?.subject).toEqual({ creatureId: 'k1' });
    expect(readToken({ creatureVariantId: 'v1' })?.subject).toEqual({ creatureVariantId: 'v1' });
  });

  it('prefers the VARIANT over its parent when both are present', () => {
    // A DM who placed "Elite Ogre" means the elite. Silently using the parent would be the wrong numbers
    // for the same reason SendCreatureToFight had to resolve variants first.
    expect(readToken({ creatureId: 'k1', creatureVariantId: 'v1' })?.subject).toEqual({ creatureVariantId: 'v1' });
  });

  it('RETURNS NULL for a token bound to nothing, rather than a default', () => {
    // A marker that points at nothing is worse than a gap: a DM would move it, target it, and find it does
    // nothing. Same rule as normalizeStatblock dropping an unparseable AC instead of clamping it.
    for (const d of [null, undefined, {}, 'x', { size: 'large' }, { characterId: '  ' }]) {
      expect(readToken(d), JSON.stringify(d)).toBeNull();
    }
  });

  it('accepts the subject nested or flat, because both shapes will be written', () => {
    expect(readToken({ subject: { characterId: 'c1' }, size: 'huge' })?.size).toBe('huge');
  });

  it('falls back to medium for an unknown size but keeps the token', () => {
    // Size is presentation; the subject is identity. Losing a whole token over a bad size string would
    // discard the part that matters to keep the part that does not.
    expect(readToken({ characterId: 'c1', size: 'enormous' })?.size).toBe('medium');
  });

  it('carries a DM’s nickname, which is the only free text a token holds', () => {
    expect(readToken({ characterId: 'c1', nickname: ' Goblin B ' })?.nickname).toBe('Goblin B');
    expect(readToken({ characterId: 'c1', nickname: '   ' })?.nickname).toBeUndefined();
  });
});

describe('footprint on the grid', () => {
  it('gives tiny and small ONE square, which is the published rule in every system here', () => {
    // Storing tiny as half a square would draw a token half a square wide. The difference between tiny and
    // small is how many can SHARE a square, not how much room one takes.
    expect(SIZE_SQUARES.tiny).toBe(1);
    expect(SIZE_SQUARES.small).toBe(1);
    expect(SIZE_SQUARES.medium).toBe(1);
    expect(SIZE_SQUARES.large).toBe(2);
    expect(SIZE_SQUARES.gargantuan).toBe(4);
  });

  it('covers every size the type allows', () => {
    for (const s of TOKEN_SIZES) expect(SIZE_SQUARES[s]).toBeGreaterThan(0);
  });

  it('scales with the node’s own grid', () => {
    expect(tokenFootprint('medium', { size: 5 })).toBe(5);
    expect(tokenFootprint('large', { size: 5 })).toBe(10);
  });

  it('still draws something on a map with no grid', () => {
    // A world map has no battle grid, and a token there is a pin — it still needs a size.
    expect(tokenFootprint('medium', null)).toBeGreaterThan(0);
    expect(tokenFootprint('huge', {})).toBeGreaterThan(tokenFootprint('medium', {}));
  });
});

describe('placement', () => {
  it('snaps to a node’s grid', () => {
    expect(snapToGrid(7, 12, { size: 5 })).toEqual({ x: 5, y: 10 });
  });

  it('does NOT snap on a map with no grid', () => {
    // A city pin does not sit on a battle grid, and rounding to an imagined one-unit grid would visibly
    // move every marker the DM had placed.
    expect(snapToGrid(7.3, 12.8, null)).toEqual({ x: 7.3, y: 12.8 });
    expect(snapToGrid(7.3, 12.8, { size: 0 })).toEqual({ x: 7.3, y: 12.8 });
  });

  it('keeps a token inside the map', () => {
    // Past the edge is not merely off-screen: the viewport clamps its pan to the bounds, so nothing could
    // scroll to it and the token would be unreachable.
    expect(clampToMap(-5, 140)).toEqual({ x: 0, y: 100 });
    expect(clampToMap(50, 50)).toEqual({ x: 50, y: 50 });
  });

  it('respects a node’s own bounds when it has them', () => {
    expect(clampToMap(80, 80, { maxX: 60, maxY: 60 })).toEqual({ x: 60, y: 60 });
  });
});

describe('what a token deliberately does NOT store (G4)', () => {
  it('keeps no hit points, speed or conditions', () => {
    // The rule stated as a test rather than only as a comment. A token carrying hp: 42 is wrong the moment
    // the player takes damage on their sheet, and nothing would tell either surface they disagree.
    const t = readToken({ characterId: 'c1', size: 'medium', hp: 42, speed: 30, conditions: ['prone'] })!;
    expect(Object.keys(t).sort()).toEqual(['size', 'subject']);
  });
});
