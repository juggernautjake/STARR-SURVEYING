// __tests__/dnd/bestiary-aura.test.ts — the derived creature atmosphere (B2-1).
//
// `auraFor` is what makes a nine-hundred-creature bestiary look cared-for without anyone authoring nine hundred
// effects, so the properties worth pinning are the ones that would decay silently: that PRECEDENCE is
// name > tag > type (a hand-tuned signature monster must survive a change to how its whole type looks), that the
// intensity curve keeps the low end VISIBLE (most of any bestiary is under CR 5, and a linear curve renders all of
// it as "switched off"), and that the derivation is DETERMINISTIC (an atmosphere that shifts between renders is one
// nobody can screenshot or review).
//
// The owner named two creatures specifically — "little bunnies" pleasant green, "a zombie" green stench — so those
// two are asserted by name. They are the acceptance criteria in the brief's own words, and a refactor that quietly
// drops the name rules would otherwise still pass every structural test here.
import { describe, it, expect } from 'vitest';
import { auraFor, sigilFor } from '@/lib/dnd/bestiary/aura';
import { CREATURE_TAGS } from '@/lib/dnd/bestiary/taxonomy';

describe('auraFor — precedence', () => {
  it('falls back to the type when nothing more specific applies', () => {
    const a = auraFor({ name: 'Stone Golem', type: 'construct', tags: [], cr: '10' });
    expect(a.id).toBe('construct');
    expect(a.motion).toBe('gears');
  });

  it('a tag beats the type, because the tag is the more specific claim about the FEEL', () => {
    // A shark is a `beast` by type, but the sea is the mood — a drifting woodland green would be wrong.
    const a = auraFor({ name: 'Giant Shark', type: 'beast', tags: ['sea'], cr: '5' });
    expect(a.motion).toBe('wash');
    expect(a.feel).toMatch(/current|silt/i);
  });

  it('a name beats a tag, so a signature monster survives a change to its whole type', () => {
    const a = auraFor({ name: 'Vampire', type: 'undead', tags: ['undead', 'boss'], cr: '13' });
    expect(a.id).toMatch(/named$/);
    expect(a.feel).toMatch(/blood/i);
  });

  it('only the FIRST matching name rule applies — two rules must not blend into a third look', () => {
    // "Ancient Red Dragon" matches the red-dragon/fire rule; nothing later may overwrite it.
    const a = auraFor({ name: 'Ancient Red Dragon', type: 'dragon', tags: ['dragon', 'boss'], cr: '24' });
    expect(a.motion).toBe('ember');
    expect(a.feel).toMatch(/furnace/i);
  });

  it('an unknown type gets the neutral fallback rather than an invented atmosphere', () => {
    const a = auraFor({ name: 'Thing', type: 'wibble', tags: [], cr: null });
    expect(a.id).toBe('unknown');
    expect(a.motion).toBe('still');
  });

  it('a missing type is handled, not crashed', () => {
    expect(() => auraFor({ name: 'Nameless', cr: null })).not.toThrow();
    expect(auraFor({ name: 'Nameless' }).id).toBe('unknown');
  });

  it('reads a compound type like "humanoid (goblinoid)" as its head word', () => {
    const a = auraFor({ name: 'Hobgoblin', type: 'humanoid (goblinoid)', tags: [], cr: '1/2' });
    expect(a.id).toBe('humanoid');
  });
});

describe("auraFor — the owner's two named examples", () => {
  it('a rabbit gets a pleasant green drift', () => {
    const a = auraFor({ name: 'Rabbit', type: 'beast', tags: ['woodland', 'companion'], cr: '0' });
    expect(a.motion).toBe('drift');
    const [r, g, b] = a.rgb.split(',').map((n) => Number(n.trim()));
    expect(g, 'green must dominate a woodland aura').toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('a zombie gets a rising green stench, and a heavier one than the rabbit', () => {
    const z = auraFor({ name: 'Zombie', type: 'undead', tags: ['undead'], cr: '1/4' });
    const rabbit = auraFor({ name: 'Rabbit', type: 'beast', tags: ['woodland'], cr: '0' });
    expect(z.motion).toBe('plume');
    expect(z.feel).toMatch(/stench/i);
    expect(z.density, 'a stench is thicker than a drift').toBeGreaterThan(rabbit.density);
  });
});

describe('auraFor — intensity', () => {
  it('scales with challenge', () => {
    const weak = auraFor({ name: 'Rat', type: 'beast', tags: [], cr: '0' });
    const mid = auraFor({ name: 'Ogre', type: 'giant', tags: [], cr: '5' });
    const deadly = auraFor({ name: 'Pit Fiend', type: 'fiend', tags: [], cr: '20' });
    expect(mid.intensity).toBeGreaterThan(weak.intensity);
    expect(deadly.intensity).toBeGreaterThan(mid.intensity);
  });

  it('keeps the low end VISIBLE — most of a bestiary is low-CR and must not render as nothing', () => {
    const weakest = auraFor({ name: 'Rat', type: 'beast', tags: [], cr: '0' });
    expect(weakest.intensity).toBeGreaterThanOrEqual(0.4);
  });

  it('never exceeds 1, however absurd the rating', () => {
    expect(auraFor({ name: 'Tarrasque', type: 'monstrosity', tags: ['boss'], cr: '30' }).intensity).toBeLessThanOrEqual(1);
    expect(auraFor({ name: 'Overkill', type: 'fiend', tags: [], cr: '999' }).intensity).toBeLessThanOrEqual(1);
  });

  it('an unrated creature sits mid-scale — absent is not the same as trivial', () => {
    const unrated = auraFor({ name: 'Mystery', type: 'aberration', tags: [], cr: null });
    const trivial = auraFor({ name: 'Rat', type: 'beast', tags: [], cr: '0' });
    expect(unrated.intensity).toBeGreaterThan(trivial.intensity);
    expect(unrated.intensity).toBeLessThan(1);
  });

  it('handles a fractional CR without treating it as zero', () => {
    const quarter = auraFor({ name: 'Goblin', type: 'humanoid', tags: [], cr: '1/4' });
    expect(quarter.intensity).toBeGreaterThan(0);
    expect(Number.isFinite(quarter.intensity)).toBe(true);
  });

  it('flags the boss tier so a final boss reads as one at a glance', () => {
    expect(auraFor({ name: 'Lich', type: 'undead', tags: ['undead', 'boss'], cr: '21' }).boss).toBe(true);
    expect(auraFor({ name: 'Goblin', type: 'humanoid', tags: [], cr: '1/4' }).boss).toBe(false);
  });
});

describe('auraFor — determinism', () => {
  it('the same creature derives the same aura every time', () => {
    const of = () => auraFor({ name: 'Owlbear', type: 'monstrosity', tags: ['woodland'], cr: '3' });
    expect(of()).toEqual(of());
  });

  it('tag order in the row does not change the result', () => {
    const a = auraFor({ name: 'Sea Hag', type: 'fey', tags: ['sea', 'folklore'], cr: '2' });
    const b = auraFor({ name: 'Sea Hag', type: 'fey', tags: ['folklore', 'sea'], cr: '2' });
    // `folklore` has no override, so only `sea` applies either way — the look must not depend on array order.
    expect(a.motion).toBe(b.motion);
    expect(a.rgb).toBe(b.rgb);
  });

  it('every aura carries a readable feel, so the atmosphere is legible and not just decorative', () => {
    for (const type of ['beast', 'undead', 'fiend', 'celestial', 'fey', 'dragon', 'construct', 'ooze', 'elemental', 'aberration', 'plant', 'giant', 'monstrosity', 'humanoid', 'swarm']) {
      const a = auraFor({ name: 'X', type, tags: [], cr: '1' });
      expect(a.feel.length, `${type} has no feel text`).toBeGreaterThan(8);
      expect(a.rgb, `${type} has a malformed rgb triple`).toMatch(/^\d+,\s*\d+,\s*\d+$/);
      expect(a.rgb2, `${type} has a malformed rgb2 triple`).toMatch(/^\d+,\s*\d+,\s*\d+$/);
    }
  });
});

describe('sigilFor — the no-picture fallback', () => {
  it('is stable for a slug: same creature, same emblem, forever', () => {
    expect(sigilFor('srd51:goblin')).toEqual(sigilFor('srd51:goblin'));
  });

  it('differs between creatures, so the fallback does not make them all look identical', () => {
    const a = sigilFor('srd51:goblin');
    const b = sigilFor('srd51:zombie');
    expect(`${a.rotation}/${a.points}/${a.ring}`).not.toBe(`${b.rotation}/${b.points}/${b.ring}`);
  });

  it('stays inside the ranges the renderer draws', () => {
    for (const slug of ['a', 'srd51:wolf', 'pf2:dragon-ancient-red', '', 'x'.repeat(200)]) {
      const s = sigilFor(slug);
      expect(s.rotation).toBeGreaterThanOrEqual(0);
      expect(s.rotation).toBeLessThan(360);
      // 3…9 points reads as a device rather than as a circle or a triangle.
      expect(s.points).toBeGreaterThanOrEqual(3);
      expect(s.points).toBeLessThanOrEqual(9);
      expect(s.ring).toBeGreaterThan(0.5);
      expect(s.ring).toBeLessThan(0.8);
    }
  });
});

describe('auraFor — two applicable tags resolve the same way every time', () => {
  // FOUND IN THE BROWSER, on the third creature in the catalogue. A wolf is tagged `woodland` AND `companion`, and
  // the derivation iterated the ROW's array letting the last tag win — so the wolf came out warm domestic ochre
  // instead of woodland green. The comment directly above that loop already claimed taxonomy order; the code did
  // not do it, and nothing could catch the difference until two tags actually collided on a real row.
  //
  // `CREATURE_TAGS` is ordered most- to least-characterful, so the FIRST match wins.
  it('the row order does not change the result', () => {
    const a = auraFor({ name: 'Wolf', type: 'beast', tags: ['woodland', 'companion'] });
    const b = auraFor({ name: 'Wolf', type: 'beast', tags: ['companion', 'woodland'] });
    expect(a.rgb).toBe(b.rgb);
    expect(a.motion).toBe(b.motion);
    expect(a.feel).toBe(b.feel);
  });

  it('and the more characterful tag is the one that wins', () => {
    // A wolf should look like a wolf, not like a farm animal.
    expect(auraFor({ name: 'Wolf', type: 'beast', tags: ['companion', 'woodland'] }).feel).toMatch(/woodland/i);
  });

  it('and the winner is chosen from the taxonomy, so a new tag cannot silently outrank an old one', () => {
    // Every tag in BY_TAG must be a real taxonomy tag, or its precedence is undefined — it would simply never win.
    for (const tag of ['abyssal', 'demonic', 'sea', 'bird', 'woodland', 'companion'] as const) {
      expect(CREATURE_TAGS, `${tag} is not in the taxonomy`).toContain(tag);
    }
  });
});
