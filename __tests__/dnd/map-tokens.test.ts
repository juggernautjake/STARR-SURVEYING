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
  SIZE_SQUARES, TOKEN_SIZES, clampToMap, parseTokenSize, readToken, snapToGrid, subjectKey,
  tokenAnchor, tokenFootprint,
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

  it('reports an unstated or unreadable size as NULL, but keeps the token', () => {
    // Size is presentation; the subject is identity. Losing a whole token over a bad size string would
    // discard the part that matters to keep the part that does not.
    //
    // CHANGED BY M5-1b: this used to answer 'medium'. That default is why `PlaceToken` wrote
    // `size: 'medium'` for everything and an Ogre stood on one square while its own stat block said
    // Large — a creature knows how big it is, and the parser is the one layer that cannot ask it. So
    // "not stated" now reaches the renderer as null and is resolved against the subject there.
    expect(readToken({ characterId: 'c1', size: 'enormous' })?.size).toBeNull();
    expect(readToken({ characterId: 'c1' })?.size).toBeNull();
    // And an explicit one is still honoured — footprint is genuinely the map's business.
    expect(readToken({ characterId: 'c1', size: 'huge' })?.size).toBe('huge');
  });

  it('keys a subject stably, so a token and the row it stands for match in one lookup', () => {
    expect(subjectKey({ characterId: 'c1' })).toBe('character:c1');
    expect(subjectKey({ creatureId: 'k1' })).toBe('creature:k1');
    expect(subjectKey({ creatureVariantId: 'v1' })).toBe('variant:v1');
    // A variant and its parent must never collide — they are different rows with different stat blocks.
    expect(subjectKey({ creatureVariantId: 'x' })).not.toBe(subjectKey({ creatureId: 'x' }));
  });

  it('reads the size words the other catalogues write, and nothing else', () => {
    // Every system here uses the same six words, which is what lets one TokenSize serve all four.
    expect(parseTokenSize('Medium')).toBe('medium');
    expect(parseTokenSize('  LARGE ')).toBe('large');
    expect(parseTokenSize('Gargantuan')).toBe('gargantuan');
    for (const junk of ['enormous', '', null, undefined, 7, 'Medium-ish']) {
      expect(parseTokenSize(junk), String(junk)).toBeNull();
    }
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
  it('snaps to the CENTRE of a node’s square, not to the corner', () => {
    // CHANGED BY M4-1, and the old expectation was the bug. This asserted `(5, 10)` — a grid INTERSECTION,
    // because the rule rounded to a multiple of the cell size. Tokens draw with `translate(-50%, -50%)`,
    // so every snapped token straddled four squares and the one question a battle grid exists to answer
    // had four answers. It had never misbehaved in the app because no node had a grid until the designer
    // shipped; the geometry now lives in `lib/dnd/maps/grid.ts` beside the drawing and the feet conversion.
    expect(snapToGrid(7, 12, { size: 5 })).toEqual({ x: 7.5, y: 12.5 });
  });

  it('does not snap when the DM has turned snapping off', () => {
    // A rug across a doorway, a body in a corner and a door in a wall all sit BETWEEN squares.
    expect(snapToGrid(7.3, 12.8, { size: 5, snap: false })).toEqual({ x: 7.3, y: 12.8 });
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

describe('anchoring a token to its squares (M5-1b)', () => {
  // Owner, 2026-07-30: *"Make sure that tokens are properly anchored to the center of the grid they are
  // on."* A token renders with translate(-50%,-50%), so the stored point is its CENTRE — and the rule for
  // where that centre may sit turns out to depend on the footprint's parity, not on its size.
  const square = { size: 5, unitFt: 5 };

  it('centres an ODD footprint on the cell centre', () => {
    // Medium 1×1 and Huge 3×3 both have a middle square, so their centre is a cell centre.
    expect(tokenAnchor(32.5, 47.5, 'medium', square)).toEqual({ x: 32.5, y: 47.5 });
    expect(tokenAnchor(32.5, 47.5, 'huge', square)).toEqual({ x: 32.5, y: 47.5 });
  });

  it('centres an EVEN footprint on a grid VERTEX, so it covers whole squares', () => {
    // THE BUG THIS FIXES. A Large 2×2 centred on the cell centre (32.5, 47.5) reaches from 27.5 to 37.5 —
    // half a square past the grid on every side, covering NINE squares partially instead of four
    // completely. Moved to the corner where four squares meet, it covers exactly those four.
    expect(tokenAnchor(32.5, 47.5, 'large', square)).toEqual({ x: 35, y: 50 });
    expect(tokenAnchor(32.5, 47.5, 'gargantuan', square)).toEqual({ x: 35, y: 50 });
  });

  it('moves an even token to the NEAREST corner, not always the same one', () => {
    // `round`, not `floor`: a nudge of a fraction of a square must not slide the token a whole square.
    expect(tokenAnchor(31, 31, 'large', square)).toEqual({ x: 30, y: 30 });
    expect(tokenAnchor(34, 34, 'large', square)).toEqual({ x: 35, y: 35 });
  });

  it('follows the offset nudge, like every other placement rule', () => {
    const nudged = { size: 5, offsetX: 2, offsetY: 2 };
    expect(tokenAnchor(9.5, 9.5, 'large', nudged)).toEqual({ x: 12, y: 12 });
  });

  it('leaves a token alone with no grid, or with snapping off', () => {
    // A world map has no battle grid; snap-off is a DM placing something deliberately between squares.
    expect(tokenAnchor(7.3, 12.8, 'large', null)).toEqual({ x: 7.3, y: 12.8 });
    expect(tokenAnchor(7.3, 12.8, 'large', { size: 5, snap: false })).toEqual({ x: 7.3, y: 12.8 });
  });

  it('centres a hex token on its own hex whatever its size', () => {
    // A hex has no four-way vertex to straddle, so the parity rule has nothing to correct. A big token
    // simply overlaps its neighbours, the way a big miniature does on a real hex mat.
    const hex = { kind: 'hex', size: 5 };
    expect(tokenAnchor(20.2, 30.1, 'large', hex)).toEqual(tokenAnchor(20.2, 30.1, 'medium', hex));
  });

  it('draws an even token exactly as wide as the squares it covers', () => {
    // The anchor and the footprint have to agree, or the token is centred correctly and the wrong size.
    const side = tokenFootprint('large', square);
    expect(side).toBe(10);
    const at = tokenAnchor(32.5, 47.5, 'large', square);
    // Its edges land ON grid lines: 35 ± 5 = 30 and 40, both multiples of the cell size.
    expect((at.x - side / 2) % 5).toBe(0);
    expect((at.y + side / 2) % 5).toBe(0);
  });
});
