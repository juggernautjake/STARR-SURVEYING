// __tests__/dnd/map-discovery.test.ts — finding the hidden thing, without leaking it. M6-1.
//
// G3 is the ground rule this slice is really about: *"a hidden item the client receives is a hidden item
// the client can reveal — view-source is not a boundary."* So the tests come in two halves — the rules of
// a search, and the guarantees about what crosses the wire.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateHidden, readHiddenSpec, readReveals, sameSkill, search, type HiddenObject,
} from '@/lib/dnd/maps/discovery';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const obj = (over: Partial<HiddenObject> & { dc?: number | null; skill?: string | null; reveals?: unknown } = {}): HiddenObject => ({
  id: over.id ?? 'obj-1',
  label: over.label ?? 'A loose flagstone',
  description: over.description ?? 'A flagstone sits proud of the floor.',
  data: over.data ?? { skill: over.skill ?? 'perception', dc: over.dc === undefined ? 15 : over.dc, reveals: over.reveals },
});

const none = new Set<string>();

describe('the comparison', () => {
  it('finds it when the roll BEATS the DC', () => {
    expect(evaluateHidden(obj(), { skill: 'perception', total: 18, alreadyFound: false }).found).toBe(true);
  });

  it('finds it when the roll EQUALS the DC', () => {
    // The single most common off-by-one in tabletop software, and it is silent — the puzzle just seems a
    // little harder than the DM set it.
    expect(evaluateHidden(obj({ dc: 15 }), { skill: 'perception', total: 15, alreadyFound: false }).found).toBe(true);
  });

  it('misses by one, and says why', () => {
    const r = evaluateHidden(obj({ dc: 15 }), { skill: 'perception', total: 14, alreadyFound: false });
    expect(r.found).toBe(false);
    expect(r.reason).toBe('failed');
  });

  it('does not find the thing that wanted a different skill', () => {
    const r = evaluateHidden(obj({ skill: 'investigation' }), { skill: 'perception', total: 30, alreadyFound: false });
    expect(r).toMatchObject({ found: false, reason: 'wrong-skill' });
  });

  it('matches skills case- and space-insensitively', () => {
    expect(sameSkill('Perception', ' perception ')).toBe(true);
    expect(sameSkill('perception', 'investigation')).toBe(false);
    expect(sameSkill(null, 'perception')).toBe(false);
  });

  it('a hidden object with NO skill named is found by any check', () => {
    // A DM who set a DC but no skill meant "notice this somehow". Refusing every roll would make it
    // unfindable, which is not what an unset field means.
    //
    // Blob written out for the same reason as the no-DC case below: `obj()` defaults an absent skill to
    // 'perception', so the helper cannot express "no skill".
    const anySkill = { id: 'x', label: null, description: null, data: { dc: 15 } };
    expect(evaluateHidden(anySkill, { skill: 'survival', total: 20, alreadyFound: false }).found).toBe(true);
    expect(evaluateHidden(anySkill, { skill: 'investigation', total: 20, alreadyFound: false }).found).toBe(true);
  });
});

describe('an unfinished secret is not a findable one', () => {
  it('refuses an object with no DC — null, or the field left off entirely', () => {
    // A half-written secret revealing itself to the first searcher is worse than one that never reveals,
    // because the DM never learns it was unfinished.
    //
    // The blobs are written out rather than routed through the `obj()` helper: that helper defaults an
    // absent `dc` to 15, so `obj({ dc: undefined })` tests the DEFAULT, not the absence. The first cut of
    // this test did exactly that and passed a findable object into a test about unfindable ones.
    for (const data of [
      { skill: 'perception', dc: null },
      { skill: 'perception' },
      {},
    ]) {
      const r = evaluateHidden({ id: 'x', label: null, description: null, data }, { skill: 'perception', total: 99, alreadyFound: false });
      expect(r, JSON.stringify(data)).toMatchObject({ found: false, reason: 'no-dc' });
    }
  });

  it('survives a blob that is not an object at all', () => {
    for (const data of [null, undefined, 'nonsense', 42, []]) {
      expect(() => evaluateHidden({ id: 'x', label: null, description: null, data }, { skill: 'p', total: 10, alreadyFound: false })).not.toThrow();
      expect(evaluateHidden({ id: 'x', label: null, description: null, data }, { skill: 'p', total: 10, alreadyFound: false }).found).toBe(false);
    }
  });

  it('reads a spec without trusting its types', () => {
    expect(readHiddenSpec({ dc: 'fifteen', skill: 12 })).toEqual({ skill: null, dc: null, description: null, reveals: undefined });
    expect(readHiddenSpec({ dc: 15, skill: ' Perception ' })).toMatchObject({ dc: 15, skill: 'Perception' });
  });
});

describe('already found is not a failure, and not a second write', () => {
  it('reports it separately from a miss', () => {
    const r = evaluateHidden(obj(), { skill: 'perception', total: 30, alreadyFound: true });
    expect(r).toMatchObject({ found: false, reason: 'already-found' });
  });

  it('a repeat search records nothing new', () => {
    const r = search([obj()], { skill: 'perception', total: 20, alreadyFound: new Set(['obj-1']) });
    expect(r.toRecord).toEqual([]);
    expect(r.found).toEqual([]);
  });
});

describe('reveals', () => {
  it('accepts one id, a list, or nothing', () => {
    expect(readReveals('a')).toEqual(['a']);
    expect(readReveals(['a', 'b'])).toEqual(['a', 'b']);
    expect(readReveals(undefined)).toEqual([]);
    expect(readReveals(null)).toEqual([]);
    expect(readReveals(['a', 3, '', '  b  '])).toEqual(['a', 'b']);
  });

  it('records what a find reveals as well as the find itself', () => {
    const r = search([obj({ reveals: ['secret-door', 'lever'] })], { skill: 'perception', total: 20, alreadyFound: none });
    expect(r.toRecord.sort()).toEqual(['lever', 'obj-1', 'secret-door']);
  });

  it('never records the same id twice', () => {
    const r = search(
      [obj({ id: 'a', reveals: ['shared'] }), obj({ id: 'b', reveals: ['shared'] })],
      { skill: 'perception', total: 20, alreadyFound: none },
    );
    expect(r.toRecord.filter((x) => x === 'shared')).toHaveLength(1);
  });
});

describe('a search over a whole room', () => {
  const room = [
    obj({ id: 'easy', dc: 10 }),
    obj({ id: 'hard', dc: 25 }),
    obj({ id: 'other-skill', skill: 'investigation', dc: 5 }),
    obj({ id: 'unfinished', dc: null }),
  ];

  it('finds only what the roll actually beat', () => {
    const r = search(room, { skill: 'perception', total: 15, alreadyFound: none });
    expect(r.found.map((f) => f.objectId)).toEqual(['easy']);
  });

  it('counts every miss by reason, for the DM’s log', () => {
    const r = search(room, { skill: 'perception', total: 15, alreadyFound: none });
    expect(r.misses).toEqual({ 'no-dc': 1, 'wrong-skill': 1, 'already-found': 0, failed: 1 });
  });

  it('finds nothing on an empty room without throwing', () => {
    const r = search([], { skill: 'perception', total: 30, alreadyFound: none });
    expect(r).toMatchObject({ found: [], toRecord: [] });
  });
});

// ── G3: what crosses the wire ──────────────────────────────────────────────────────────────────────
describe('the secret never reaches a client that has not earned it', () => {
  const ROUTE = read('app/api/dnd/maps/search/route.ts');
  const QUERY = read('lib/dnd/maps/query.ts');

  it('the route returns ONLY the finds', () => {
    // Telling a player "3 things here you failed to find" is the map pointing at the secrets it just
    // refused to show them.
    expect(ROUTE).toMatch(/return NextResponse\.json\(\{ found: result\.found \}\)/);
    const code = ROUTE.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code, 'the miss counts must not be returned to a player').not.toMatch(/misses/);
  });

  it('never sends a DC to the client', () => {
    const code = ROUTE.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\bdc\b\s*[,:}]/);
  });

  it('the player query still matches players-only — discovery ADDS by id, it does not loosen the filter', () => {
    // The property the module header argues for: a refactor must not be able to widen this by moving a
    // conditional. Found objects arrive because a discovery row names them, never because the WHERE got
    // more generous.
    expect(QUERY).toMatch(/if \(!opts\.isDm\) q = q\.eq\('visibility', 'players'\)/);
    expect(QUERY).toMatch(/\.from\('dnd_map_discoveries'\)/);
  });

  it('a revealed object still does NOT carry the DM’s notes', () => {
    // Finding a secret reveals the secret, not the DM's private commentary about it.
    const revealed = QUERY.slice(QUERY.indexOf('revealed objects query failed') - 900);
    expect(revealed).toMatch(/\.select\(OBJECT_COLS\)/);
    expect(revealed).not.toMatch(/OBJECT_DM_COLS/);
  });

  it('a failed discovery lookup throws rather than reading as "found nothing"', () => {
    // A secret staying hidden for the wrong reason, with nobody told, is the failure mode this codebase
    // keeps rediscovering.
    expect(QUERY).toMatch(/map discoveries query failed/);
  });
});

describe('the route guards who may search with which character', () => {
  const ROUTE = read('app/api/dnd/maps/search/route.ts');

  it('requires campaign membership', () => {
    expect(ROUTE).toMatch(/getCampaignRole\(campaignId\)/);
  });

  it('refuses a character from another campaign', () => {
    // Without this a member could search using someone else's character id and write discoveries onto it.
    expect(ROUTE).toMatch(/That character is not in this campaign/);
  });

  it('bounds the client-supplied roll', () => {
    expect(ROUTE).toMatch(/MIN_TOTAL/);
    expect(ROUTE).toMatch(/MAX_TOTAL/);
  });

  it('records the roll for the DM’s audit trail', () => {
    expect(ROUTE).toMatch(/found_by_roll/);
  });

  it('upserts so a repeat find is a no-op rather than a 500', () => {
    expect(ROUTE).toMatch(/onConflict: 'map_object_id,character_id'/);
  });
});
