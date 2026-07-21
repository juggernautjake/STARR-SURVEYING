// __tests__/dnd/spells-2014.test.ts — integrity of the 2014 spell catalog, and its wiring.
//
// Sibling of spells-2024.test.ts, and deliberately NOT a parameterised version of it. The two
// catalogs are different systems (Ground Rule 1), and a shared test would quietly encourage a
// shared implementation — which is exactly the merge this repo exists to prevent.
//
// These tests do not verify the rules against the book; they pin the structural invariants that
// catch typos and bulk-authoring slips, plus the EDITION invariants that catch the specific bug
// this catalog exists to prevent: a 2024 fact reaching a 2014 sheet.
import { describe, it, expect } from 'vitest';
import {
  SPELLS_2014, SPELLS_2014_STATUS,
  findSpell2014, findSpellByName2014, spellsAtLevel2014, spellsForClass2014,
} from '@/lib/dnd/spells/dnd5e-2014';
import { SPELL_SCHOOLS, SPELLS_2024, findSpell2024 } from '@/lib/dnd/spells/dnd5e-2024';
import { spellCatalog, spellsForSystem, findSpellForSystem } from '@/lib/dnd/spells';
import { parseDiceExpr } from '@/lib/dnd/roll';

describe('the 2014 spell catalog is structurally sound', () => {
  it('has a stable unique key for every spell', () => {
    const keys = SPELLS_2014.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/); // kebab-case
  });

  it('has no duplicate names', () => {
    const names = SPELLS_2014.map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses only real schools and legal levels', () => {
    for (const s of SPELLS_2014) {
      expect(SPELL_SCHOOLS).toContain(s.school);
      expect(s.level).toBeGreaterThanOrEqual(0);
      expect(s.level).toBeLessThanOrEqual(9);
      expect(Number.isInteger(s.level)).toBe(true);
    }
  });

  it('fills in every required mechanical field', () => {
    for (const s of SPELLS_2014) {
      expect(s.name.length, s.key).toBeGreaterThan(0);
      expect(s.castTime.length, s.key).toBeGreaterThan(0);
      expect(s.range.length, s.key).toBeGreaterThan(0);
      expect(s.components.length, s.key).toBeGreaterThan(0);
      expect(s.duration.length, s.key).toBeGreaterThan(0);
      expect(s.summary.length, s.key).toBeGreaterThan(0);
      expect(s.classes.length, s.key).toBeGreaterThan(0);
    }
  });

  it('writes components as component letters only', () => {
    for (const s of SPELLS_2014) {
      expect(s.components, s.key).toMatch(/^[VSM](, [VSM])*$/);
    }
  });

  it('declares a material component exactly when it lists M', () => {
    for (const s of SPELLS_2014) {
      const listsM = s.components.split(', ').includes('M');
      expect(!!s.material, `${s.key} components="${s.components}" material=${JSON.stringify(s.material)}`).toBe(listsM);
    }
  });

  it('never marks an instantaneous spell as concentration', () => {
    for (const s of SPELLS_2014) {
      if (s.concentration) expect(s.duration, s.key).not.toBe('Instantaneous');
    }
  });

  it('attributes every record to a clean 2014 source', () => {
    // The licensing boundary, asserted rather than merely documented in a header comment.
    // Anything sourced to a 2024 book, D&D Beyond, Roll20 or 5e.tools is a bug in the authoring
    // process, not a stylistic slip.
    for (const s of SPELLS_2014) {
      expect(['SRD 5.1', 'Basic Rules 2014'], s.key).toContain(s.source);
    }
  });

  it('keeps summaries short — paraphrase, never rulebook prose', () => {
    // A guard on the house style AND on copyright: a creeping word count is the signal that
    // someone has started transcribing the book instead of paraphrasing mechanics.
    //
    // THE GUARD IS ON `summary` AND ONLY ON `summary` (14-S8). It is asserted here over EVERY
    // entry including the ones that now carry a `detail`, because the whole design depends on
    // the summary staying short once a longer field exists next to it — the temptation after
    // adding `detail` is to let the summary drift too.
    for (const s of SPELLS_2014) {
      expect(s.summary.length, `${s.key} summary is too long — paraphrase it`).toBeLessThan(320);
    }
  });

  it('exempts `detail` from the summary cap without weakening it', () => {
    // `detail` exists precisely because some spells' rules do not fit 320 characters. If this
    // cap leaked onto it the field would be pointless, so the exemption is a test rather than an
    // intention — and at least one populated `detail` must actually exceed the cap, or the
    // exemption is untested in practice and could be reintroduced without anything failing.
    const detailed = SPELLS_2014.filter((s) => s.detail !== undefined);
    expect(detailed.length, 'no spell carries a detail — 14-S8 populated several').toBeGreaterThan(0);
    expect(detailed.some((s) => (s.detail as string).length >= 320)).toBe(true);
    for (const s of detailed) {
      expect(s.detail!.trim().length, `${s.key} has an empty detail — omit the field instead`).toBeGreaterThan(0);
    }
  });

  it('restores the mechanics that summary compression dropped', () => {
    // 14-S8's actual deliverable, asserted as CONTENT rather than as "the field is non-empty".
    // Each probe is a rule the compression pass reported losing by name; a `detail` that reads
    // well but omits the thing it was written to carry would pass a length check and fail here.
    const detail = (key: string) => {
      const s = SPELLS_2014.find((x) => x.key === key);
      expect(s, `${key} is missing from the catalog`).toBeDefined();
      expect(s!.detail, `${key} should carry a detail`).toBeDefined();
      return s!.detail!.toLowerCase();
    };

    // Every layer's destruction condition, and indigo's three-failures structure.
    const prismatic = detail('prismatic-wall');
    for (const probe of ['25 cold', 'strong wind', '60 force', 'passwall', '25 fire', 'daylight', 'dispel magic']) {
      expect(prismatic, `prismatic-wall detail should name "${probe}"`).toContain(probe);
    }
    expect(prismatic).toContain('petrif');

    // Symbol's per-glyph save ability — the detail that varies and is played wrong.
    const symbol = detail('symbol');
    for (const probe of ['constitution', 'wisdom', 'charisma', 'intelligence', 'discord', 'hopelessness', 'insanity']) {
      expect(symbol, `symbol detail should name "${probe}"`).toContain(probe);
    }

    // Wall of Stone's >20-foot-span support rule and its breach-collapse rule.
    const wallOfStone = detail('wall-of-stone');
    expect(wallOfStone).toContain('20 feet');
    expect(wallOfStone).toContain('collapse');

    // The cast-daily-for-a-year (or 30 days) permanence clauses.
    expect(detail('guards-and-wards')).toContain('year');
    expect(detail('teleportation-circle')).toContain('year');
    expect(detail('forbiddance')).toContain('30 days');

    // Guards and Wards' per-effect counts, which the summary flattened.
    const guards = detail('guards-and-wards');
    for (const probe of ['four corridors', 'ten doors']) {
      expect(guards, `guards-and-wards detail should name "${probe}"`).toContain(probe);
    }

    // Magic Jar's 24-hour immunity and its container-destruction outcomes.
    const magicJar = detail('magic-jar');
    expect(magicJar).toContain('24 hours');
    expect(magicJar).toContain('container is destroyed');

    // The smaller named losses.
    expect(detail('incendiary-cloud')).toContain('10 miles per hour');
    expect(detail('antimagic-field')).toContain('artifact');
    expect(detail('mirage-arcane')).toContain('creatures');
    expect(detail('project-image')).toContain('investigation');
    expect(detail('meteor-swarm')).toContain('ignites');
    expect(detail('earthquake')).toContain('buried');
    expect(detail('simulacrum')).toContain('100 gp');
  });

  it('only claims an edition note where it says something', () => {
    for (const s of SPELLS_2014) {
      if (s.editionNote !== undefined) expect(s.editionNote.length, s.key).toBeGreaterThan(0);
    }
  });

  it('only forces a save on an ability that exists', () => {
    for (const s of SPELLS_2014) {
      if (s.save) {
        expect(['str', 'dex', 'con', 'int', 'wis', 'cha'], s.key).toContain(s.save.ability);
        expect(s.save.effect.length, s.key).toBeGreaterThan(0);
      }
    }
  });

  it('writes damage and healing the ROLLER can actually parse', () => {
    // Asserted against the real parser rather than a regex of my own. A hand-written pattern
    // tests my idea of the format; `parseDiceExpr` is what the sheet actually runs, and the
    // only question that matters is whether the table gets a number.
    //
    // This caught the regex being wrong rather than the data: Magic Missile is '3d4 + 3' (three
    // darts of 1d4+1, which is 2014's correct total and more precise than 2024's bare '3d4'),
    // and Mass Heal is a flat '700' that is not a roll at all. Both parse; both are right.
    for (const s of SPELLS_2014) {
      for (const d of s.damage ?? []) {
        expect(parseDiceExpr(d.dice), `${s.key} damage "${d.dice}" is unrollable`).not.toBeNull();
        expect(d.type.length, `${s.key} damage type`).toBeGreaterThan(0);
      }
      if (s.heal) expect(parseDiceExpr(s.heal), `${s.key} heal "${s.heal}" is unrollable`).not.toBeNull();
    }
  });
});

describe('catalog lookups', () => {
  it('finds a spell by key and by name, case-insensitively', () => {
    expect(findSpell2014('fire-bolt')?.name).toBe('Fire Bolt');
    expect(findSpellByName2014('fire bolt')?.key).toBe('fire-bolt');
    expect(findSpellByName2014('FIRE BOLT')?.key).toBe('fire-bolt');
  });

  it('returns undefined for an unknown spell rather than guessing', () => {
    expect(findSpell2014('wish-but-better')).toBeUndefined();
    expect(findSpellByName2014('Wish But Better')).toBeUndefined();
    expect(findSpellByName2014(null)).toBeUndefined();
  });

  it('filters by level and by class list', () => {
    expect(spellsAtLevel2014(0).every((s) => s.level === 0)).toBe(true);
    expect(spellsAtLevel2014(0).length).toBeGreaterThan(0);
    expect(spellsForClass2014('Warlock').some((s) => s.key === 'eldritch-blast')).toBe(true);
    expect(spellsForClass2014('Cleric').some((s) => s.key === 'eldritch-blast')).toBe(false);
  });
});

describe('the system dispatcher serves 2014 its OWN content (Ground Rule 1)', () => {
  it('serves the 2014 catalog for dnd5e-2014', () => {
    // The bug this replaces: the catalog was fully authored but exported nothing, so the
    // dispatcher fell through to EMPTY and every 2014 picker showed an empty list. Authored
    // and reachable are different things.
    expect(spellsForSystem('dnd5e-2014').length).toBe(SPELLS_2014.length);
    expect(spellsForSystem('dnd5e-2014').length).toBeGreaterThan(0);
    expect(findSpellForSystem('dnd5e-2014', 'Magic Missile')?.level).toBe(1);
  });

  it('keeps the two catalogs as separate objects', () => {
    const a = spellsForSystem('dnd5e-2014');
    const b = spellsForSystem('dnd5e-2024');
    expect(a).not.toBe(b);
    expect(a.length).not.toBe(0);
    expect(b.length).not.toBe(0);
  });

  it('gives other systems an empty catalog rather than another system’s content', () => {
    for (const sys of ['pathfinder2e', 'intuitive-games', 'nonsense', null, undefined]) {
      expect(spellsForSystem(sys)).toEqual([]);
    }
  });

  it('reports its own coverage honestly', () => {
    const cat = spellCatalog('dnd5e-2014');
    expect(cat.note.length).toBeGreaterThan(0);
    expect(cat.spells.length).toBe(SPELLS_2014.length);
    expect(SPELLS_2014_STATUS.note).toMatch(/not yet catalogued|SRD/i);
  });

  it('has entries at every level it claims to cover', () => {
    for (const lvl of SPELLS_2014_STATUS.levelsCovered) {
      expect(spellsAtLevel2014(lvl).length, `level ${lvl} claimed covered but empty`).toBeGreaterThan(0);
    }
  });

  it('declares exactly the levels it actually has, and no more', () => {
    // The catalog stalled at 4th level with no exports at all, so the risk worth guarding is
    // a status object that CLAIMS more coverage than the data backs. Derived both ways: every
    // declared level has entries, and every level with entries is declared.
    const declared = new Set(SPELLS_2014_STATUS.levelsCovered);
    const actual = new Set(SPELLS_2014.map((s) => s.level));
    for (const lvl of declared) {
      expect(spellsAtLevel2014(lvl).length, `level ${lvl} is declared covered but is empty`).toBeGreaterThan(0);
    }
    for (const lvl of actual) {
      expect(declared.has(lvl), `level ${lvl} has spells but is not declared in levelsCovered`).toBe(true);
    }
  });

  it('does not claim to be complete while levels are missing', () => {
    // `complete` must stay false until the catalog genuinely covers 0–9. This is the assertion
    // that stops the status object drifting into a comfortable lie as content is added.
    const hasAllLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every((l) => spellsAtLevel2014(l as 0).length > 0);
    if (!hasAllLevels) expect(SPELLS_2014_STATUS.complete).toBe(false);
    expect(SPELLS_2014_STATUS.note).toMatch(/not yet catalogued/i);
  });
});

describe('2014 content carries 2014 numbers, not 2024 ones', () => {
  // Each of these is a spell Wizards materially changed in the 2024 rewrite. If any of them
  // ever reports its 2024 form here, a 2024 fact has leaked into the 2014 catalog — the exact
  // failure the per-system split exists to prevent.

  it('keeps True Strike as a 2014 Divination cantrip, not the 2024 weapon-attack rewrite', () => {
    const ts = findSpell2014('true-strike');
    expect(ts?.level).toBe(0);
    expect(ts?.school).toBe('Divination');
    expect(ts?.range).toBe('30 feet');
    // 2024 made it Self-range and a weapon attack. That form must not appear here.
    expect(findSpell2024('true-strike')?.range).toBe('Self');
  });

  it('keeps Chill Touch as a 120-foot ranged attack for 1d8', () => {
    const ct = findSpell2014('chill-touch');
    expect(ct?.range).toBe('120 feet');
    expect(ct?.attack).toBe(true);
    expect(ct?.damage?.[0]?.dice).toBe('1d8'); // 2024 raised it to 1d10 at melee range
  });

  it('keeps Acid Splash as Conjuration hitting one or two creatures', () => {
    expect(findSpell2014('acid-splash')?.school).toBe('Conjuration'); // 2024 moved it to Evocation
  });

  it('keeps Cure Wounds and Healing Word at their 2014 dice', () => {
    // 2024 bumped these to 2d8 / 2d4 and moved both to Abjuration.
    expect(findSpell2014('cure-wounds')?.heal).toBe('1d8');
    expect(findSpell2014('cure-wounds')?.school).toBe('Evocation');
    expect(findSpell2014('healing-word')?.heal).toBe('1d4');
    expect(findSpell2014('healing-word')?.school).toBe('Evocation');
  });

  it('has no spell the 2024 PHB introduced', () => {
    // Cantrips and spells that did not exist before the 2024 printing.
    for (const k of ['elementalism', 'sorcerous-burst', 'starry-wisp', 'befuddlement']) {
      expect(findSpell2014(k), `${k} is 2024-only and must not appear in the 2014 catalog`).toBeUndefined();
    }
  });

  it('does not carry the 2024 Summon line, which is not SRD 5.1 content', () => {
    for (const k of ['summon-beast', 'summon-fey', 'summon-dragon']) {
      expect(findSpell2014(k), k).toBeUndefined();
    }
  });

  it('never labels a 2014 record with a 2024 source', () => {
    const twentyFourSources = new Set(SPELLS_2024.map((s) => s.source));
    for (const s of SPELLS_2014) {
      expect(twentyFourSources.has(s.source), `${s.key} is sourced to a 2024 book`).toBe(false);
    }
  });
});
