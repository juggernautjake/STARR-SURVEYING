import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// __tests__/dnd/map-passive.test.ts — noticing without rolling. M6-2.
//
// The failure this guards against is not "passive does not work" — it is passive working TOO WELL and
// quietly deleting the difference between looking around and searching, which for a lot of dungeons is
// the whole puzzle.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NOTICE_FT, PASSIVE_SKILLS, isPassivelyFindable, passiveNotices,
  type PassiveHidden, type PassiveToken,
} from '@/lib/dnd/maps/passive';
import type { MapGrid } from '@/lib/dnd/maps/grid';

const grid = (over: Partial<MapGrid> = {}): MapGrid => ({
  kind: 'square', size: 5, unitFt: 5, offsetX: 0, offsetY: 0, opacity: 0.3, colour: '#fff', snap: true,
  ...over,
} as MapGrid);

const token = (characterId: string, x: number, y: number): PassiveToken => ({ characterId, x, y });
const hidden = (over: Partial<PassiveHidden> & { dc?: number | null; skill?: string | null; rangeFt?: number } = {}): PassiveHidden => ({
  id: over.id ?? 'h1',
  x: over.x ?? 2.5,
  y: over.y ?? 2.5,
  label: over.label ?? 'A scratched rune',
  description: over.description ?? 'Someone carved here.',
  data: over.data ?? {
    skill: over.skill === undefined ? 'perception' : over.skill,
    dc: over.dc === undefined ? 12 : over.dc,
    ...(over.rangeFt ? { noticeRangeFt: over.rangeFt } : {}),
  },
});

const run = (over: Partial<Parameters<typeof passiveNotices>[0]> = {}) => passiveNotices({
  tokens: [token('c1', 2.5, 2.5)],
  hidden: [hidden()],
  grid: grid(),
  passiveByCharacter: new Map([['c1', 14]]),
  alreadyFound: new Set<string>(),
  ...over,
});

describe('the comparison', () => {
  it('notices when the passive score beats the DC', () => {
    expect(run().map((n) => n.objectId)).toEqual(['h1']);
  });

  it('notices when the score EQUALS the DC — same rule as an active check', () => {
    // The two must not disagree about the same DC, or a character finds a thing by rolling exactly what
    // their passive already was.
    expect(run({ passiveByCharacter: new Map([['c1', 12]]) })).toHaveLength(1);
  });

  it('misses by one', () => {
    expect(run({ passiveByCharacter: new Map([['c1', 11]]) })).toEqual([]);
  });

  it('ignores a character with no passive score at all', () => {
    // An IG character has no passive Perception; inventing one would be the rule-invention Ground Rule 3
    // exists to prevent.
    expect(run({ passiveByCharacter: new Map() })).toEqual([]);
  });
});

describe('only SOME secrets yield to standing near them', () => {
  it('does NOT notice an Investigation secret, however high the score', () => {
    // Investigating is an action you take. Passive Investigation would mean a character searching every
    // bookcase they walk past, which deletes the difference between looking and searching.
    expect(run({
      hidden: [hidden({ skill: 'investigation' })],
      passiveByCharacter: new Map([['c1', 99]]),
    })).toEqual([]);
  });

  it('does NOT notice an object with no skill named, even though an active check would find it', () => {
    // "Any check finds it" is an ACTIVE statement. Passive Perception is what a character has; the DM has
    // to have said Perception for it to apply.
    expect(run({ hidden: [hidden({ skill: null })], passiveByCharacter: new Map([['c1', 99]]) })).toEqual([]);
  });

  it('does not notice an unfinished secret', () => {
    expect(run({ hidden: [hidden({ dc: null })], passiveByCharacter: new Map([['c1', 99]]) })).toEqual([]);
  });

  it('says which objects are passively findable at all, for the authoring UI', () => {
    expect(isPassivelyFindable({ skill: 'Perception', dc: 12 })).toBe(true);
    expect(isPassivelyFindable({ skill: 'investigation', dc: 12 })).toBe(false);
    expect(isPassivelyFindable({ skill: 'perception' })).toBe(false);
    expect(isPassivelyFindable(null)).toBe(false);
  });

  it('the eligible set is Perception, and that is deliberate', () => {
    expect([...PASSIVE_SKILLS]).toEqual(['perception']);
  });
});

describe('range is required, not optional', () => {
  it('notices a thing you are standing on', () => {
    expect(run()).toHaveLength(1);
  });

  it('does NOT notice one across the map', () => {
    // Without a range rule, walking onto a map reveals every passively-findable secret on it at once.
    expect(run({ hidden: [hidden({ x: 300, y: 300 })] })).toEqual([]);
  });

  it('uses the default when the object does not say', () => {
    expect(DEFAULT_NOTICE_FT).toBe(30);
    // 5 world units per 5ft cell: 6 cells away is 30ft, exactly at the edge.
    expect(run({ hidden: [hidden({ x: 32.5, y: 2.5 })] })).toHaveLength(1);
    expect(run({ hidden: [hidden({ x: 37.5, y: 2.5 })] })).toEqual([]);
  });

  it('honours a longer range the DM set on the object', () => {
    expect(run({ hidden: [hidden({ x: 52.5, y: 2.5, rangeFt: 60 })] })).toHaveLength(1);
  });

  it('reports the distance, so a DM log can say how close they were', () => {
    expect(run({ hidden: [hidden({ x: 12.5, y: 2.5 })] })[0].distanceFt).toBe(10);
  });

  it('notices nothing at all on a node with no grid', () => {
    // No grid means no distance, and without distance the range rule cannot apply — so nothing is
    // noticed rather than everything.
    expect(run({ grid: null })).toEqual([]);
  });
});

describe('per character, not per party', () => {
  it('reports the SAME object for two characters who both notice it', () => {
    // `dnd_map_discoveries` is keyed per character; two people noticing a thing is two people who noticed
    // it, and privileging the closest would leave the other one's sheet not knowing.
    const out = passiveNotices({
      tokens: [token('c1', 2.5, 2.5), token('c2', 7.5, 2.5)],
      hidden: [hidden()],
      grid: grid(),
      passiveByCharacter: new Map([['c1', 14], ['c2', 20]]),
      alreadyFound: new Set(),
    });
    expect(out.map((n) => n.characterId).sort()).toEqual(['c1', 'c2']);
  });

  it('skips only the character who already found it', () => {
    const out = passiveNotices({
      tokens: [token('c1', 2.5, 2.5), token('c2', 7.5, 2.5)],
      hidden: [hidden()],
      grid: grid(),
      passiveByCharacter: new Map([['c1', 14], ['c2', 20]]),
      alreadyFound: new Set(['h1:c1']),
    });
    expect(out.map((n) => n.characterId)).toEqual(['c2']);
  });
});

describe('hex maps', () => {
  it('measures in hexes and still applies the range', () => {
    const hexGrid = grid({ kind: 'hex' });
    const near = passiveNotices({
      tokens: [token('c1', 2.5, 2.5)],
      hidden: [hidden({ x: 2.5, y: 2.5 })],
      grid: hexGrid,
      passiveByCharacter: new Map([['c1', 20]]),
      alreadyFound: new Set(),
    });
    expect(near).toHaveLength(1);
    const far = passiveNotices({
      tokens: [token('c1', 2.5, 2.5)],
      hidden: [hidden({ x: 400, y: 400 })],
      grid: hexGrid,
      passiveByCharacter: new Map([['c1', 20]]),
      alreadyFound: new Set(),
    });
    expect(far).toEqual([]);
  });
});

describe('the score is not recomputed here', () => {
  it('takes it as an input rather than deriving it', () => {
    // `summarizeMember` already derives it per system. A second implementation would drift, and the first
    // symptom would be the map noticing things the party sheet says it should not.
    const src = readFileSync(join(process.cwd(), 'lib/dnd/maps/passive.ts'), 'utf8');
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toMatch(/abilityMod|profBonus|10 \+/);
    expect(code).toMatch(/passiveByCharacter/);
  });
});


describe('a notice says WHERE, because its caller cannot find out', () => {
  // A discovery written during a render is not in the object payload that render already fetched — the
  // object was `visibility: 'dm'` at fetch time. So the page has nothing to look a position up in, and
  // whatever it falls back to is where the marker lands. Falling back to the origin puts a rune the party
  // noticed beside them in the corner of the map, correct again on the next reload: wrong exactly once.
  it('carries the object position', () => {
    const [n] = passiveNotices({
      tokens: [token('c1', 12.5, 17.5)],
      hidden: [hidden({ x: 12.5, y: 22.5 })],
      grid: grid(),
      passiveByCharacter: new Map([['c1', 14]]),
      alreadyFound: new Set(),
    });
    expect(n).toMatchObject({ x: 12.5, y: 22.5 });
  });

  it('reports the position of the OBJECT, not of the token that noticed it', () => {
    const [n] = passiveNotices({
      tokens: [token('c1', 0, 0)],
      hidden: [hidden({ x: 7.5, y: 7.5 })],
      grid: grid(),
      passiveByCharacter: new Map([['c1', 20]]),
      alreadyFound: new Set(),
    });
    expect([n.x, n.y]).toEqual([7.5, 7.5]);
  });
});
