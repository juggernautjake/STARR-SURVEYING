// __tests__/dnd/artificer-2024.test.ts — the 2024 Artificer (Eberron: Forge of the Artificer).
//
// P5-12. The generic 2024 roster test in `dnd5e-2024-classes.test.ts` already checks the structural
// things every class must satisfy (valid, subclass at 3, ASIs 4/8/12/16, Epic Boon at 19, the engine
// walks it to 20). This file pins the things that are SPECIFIC to the Artificer and that a
// well-meaning edit would get wrong by reaching for the 2014 file, which is still in the repo one
// directory over and is wrong for a 2024 character in eight separate ways.
//
// The pins fall into three groups:
//
//  1. **The transcribed table.** Prepared spells, cantrips and the Magic Items column are authored
//     numbers, so the only thing standing between a typo and a shipped wrong class is a golden array.
//  2. **The 2024-vs-2014 deltas.** Each of these is a feature that exists in both editions under a
//     changed name, level, or rule. A copy from the 2014 file passes every structural check and is
//     still wrong, which is exactly why they are named individually here.
//  3. **The half-caster-that-casts-at-1 quirk**, which is the single most-often-broken fact about
//     this class: `roundHalfUp` plus a slot table that starts at level 1.
import { describe, it, expect } from 'vitest';
import { findClass, subclassesFor } from '@/lib/dnd/classes/registry';
import { snapshotAtLevel, validateClassDefinition, multiclassCasterLevel } from '@/lib/dnd/classes/engine';
import { SPELLS_2024 } from '@/lib/dnd/spells/dnd5e-2024';
import { spellEligibility } from '@/lib/dnd/spells/eligibility';

const SYS = 'dnd5e-2024';
const def = findClass(SYS, 'Artificer')!;

describe('the 2024 Artificer is registered as official 2024 content', () => {
  it('exists in dnd5e-2024 and is NOT flagged homebrew', () => {
    expect(def, 'the 2024 Artificer must be registered').toBeTruthy();
    expect(def.system).toBe(SYS);
    // It is not in the PHB, but it is first-party. Flagging it `custom` would make the builder badge
    // published rules as somebody's homebrew and let a DM gate it as if it were.
    expect(def.custom).toBeFalsy();
    expect(validateClassDefinition(def)).toEqual([]);
  });

  it('is a distinct object from the 2014 Artificer, which still exists', () => {
    const old = findClass('dnd5e-2014', 'Artificer')!;
    expect(old).toBeTruthy();
    expect(old.system).toBe('dnd5e-2014');
    expect(old).not.toBe(def);
  });
});

describe('the Artificer Features table, as transcribed', () => {
  it('prepares spells from a fixed table — not 2014\'s INT modifier + half level', () => {
    expect(def.spellcasting?.spellsKnown).toEqual(
      [0, 2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
    );
    // The rule text and the array must agree — the array is what the builder counts with, the text is
    // what the player reads, and they have drifted apart in this repo before.
    expect(def.spellcasting?.preparedRule).toMatch(/2\/3\/4\/5\/6\/6\/7\/7\/9\/9\/10\/10\/11\/11\/12\/12\/14\/14\/15\/15/);
    // It must say the count is a fixed table. (A "does not mention half your level" check would be the
    // obvious pin and is wrong here: the text deliberately names the 2014 formula in order to disown it.)
    expect(def.spellcasting?.preparedRule).toMatch(/fixed count/i);
  });

  it('gains a cantrip at 10 and again at 14 — two, three, four', () => {
    const c = def.spellcasting!.cantripsKnown!;
    expect(c.slice(1, 10).every((n) => n === 2), 'levels 1–9 know two cantrips').toBe(true);
    expect(c.slice(10, 14).every((n) => n === 3), 'levels 10–13 know three').toBe(true);
    expect(c.slice(14, 21).every((n) => n === 4), 'levels 14–20 know four').toBe(true);
  });

  it('tracks replicated magic items as a long-rest resource: 2 / 3 / 4 / 5 / 6', () => {
    const r = def.resources!.find((x) => x.id === 'replicated-items')!;
    expect(r, 'the Magic Items column must be trackable on the sheet').toBeTruthy();
    expect(r.resetOn).toBe('long');
    // None at level 1 — Replicate Magic Item does not exist yet — then the column steps at 6/10/14/18.
    expect(r.perLevel[1]).toBe(0);
    expect([r.perLevel[2], r.perLevel[5]]).toEqual([2, 2]);
    expect([r.perLevel[6], r.perLevel[9]]).toEqual([3, 3]);
    expect([r.perLevel[10], r.perLevel[13]]).toEqual([4, 4]);
    expect([r.perLevel[14], r.perLevel[17]]).toEqual([5, 5]);
    expect([r.perLevel[18], r.perLevel[20]]).toEqual([6, 6]);
  });
});

describe('the half-caster that casts from level 1', () => {
  it('has two first-rank slots at level 1, which no other half-caster does', () => {
    const s1 = snapshotAtLevel(def, 1);
    expect(s1.spellSlots?.[1], 'a level-1 Artificer has 2 rank-1 slots').toBe(2);
    const paladin = findClass(SYS, 'Paladin')!;
    expect(snapshotAtLevel(paladin, 1).spellSlots?.[1] ?? 0, 'a level-1 Paladin has none').toBe(0);
  });

  it('tops out at rank 5, never higher', () => {
    const top = snapshotAtLevel(def, 20).spellSlots ?? [];
    expect(top[5], 'two rank-5 slots at level 20').toBe(2);
    for (let r = 6; r <= 9; r += 1) expect(top[r] ?? 0, `rank ${r}`).toBe(0);
  });

  it('rounds its caster level UP when multiclassing — the only 5e half-caster that does', () => {
    expect(def.spellcasting?.roundHalfUp).toBe(true);
    // Artificer 1 / Wizard 1 = 1 (ceil) + 1 = 2 caster levels. With floor it would be 1, and the
    // character would be short a slot at every level of their career.
    const withArtificer = multiclassCasterLevel([
      { kind: 'half', level: 1, roundUp: def.spellcasting!.roundHalfUp },
      { kind: 'full', level: 1 },
    ]);
    const withPaladin = multiclassCasterLevel([
      { kind: 'half', level: 1, roundUp: findClass(SYS, 'Paladin')!.spellcasting!.roundHalfUp },
      { kind: 'full', level: 1 },
    ]);
    expect(withArtificer).toBe(2);
    expect(withPaladin, 'a Paladin 1 contributes nothing — floor(1/2) = 0').toBe(1);
  });
});

describe('the 2024 features, each of which differs from its 2014 namesake', () => {
  const at = (level: number, name: string) =>
    def.features.find((f) => f.level === level && f.name === name);

  it('replaces Magical Tinkering with Tinker\'s Magic at level 1', () => {
    expect(at(1, 'Tinker\'s Magic'), 'Tinker\'s Magic is the 2024 name').toBeTruthy();
    expect(def.features.some((f) => f.name === 'Magical Tinkering'), '2014\'s name must not survive').toBe(false);
    expect(at(1, 'Tinker\'s Magic')!.body).toMatch(/Mending/);
  });

  it('replaces Infuse Item with Replicate Magic Item at level 2', () => {
    expect(at(2, 'Replicate Magic Item')).toBeTruthy();
    expect(def.features.some((f) => /infus/i.test(f.name)), 'infusions are gone in 2024').toBe(false);
  });

  it('drops Tool Expertise and puts Magic Item Tinker at level 6', () => {
    expect(at(6, 'Magic Item Tinker')).toBeTruthy();
    expect(def.features.some((f) => f.name === 'Tool Expertise')).toBe(false);
    // The three options are the whole feature; a body missing one is a feature missing a third of itself.
    for (const opt of ['Charge Magic Item', 'Drain Magic Item', 'Transmute Magic Item']) {
      expect(at(6, 'Magic Item Tinker')!.body, opt).toContain(opt);
    }
  });

  it('fires Flash of Genius on a FAILED roll — the timing change that matters in play', () => {
    const f = at(7, 'Flash of Genius')!;
    expect(f).toBeTruthy();
    expect(f.body).toMatch(/fails?\b/i);
  });

  it('stores level 1–3 spells in an item, not 1–2', () => {
    const f = at(11, 'Spell-Storing Item')!;
    expect(f.body).toMatch(/level \*\*1, 2 or 3\*\*|1, 2 or 3/);
  });

  it('renames Magic Item Savant to Advanced Artifice, which no longer bypasses attunement rules', () => {
    const f = at(14, 'Advanced Artifice')!;
    expect(f, 'level 14 is Advanced Artifice in 2024').toBeTruthy();
    expect(def.features.some((f2) => f2.name === 'Magic Item Savant')).toBe(false);
    expect(f.body).toMatch(/Short Rest/);
  });

  it('gives 4 / 5 / 6 attunement slots at 10 / 14 / 18', () => {
    expect(at(10, 'Magic Item Adept')!.body).toMatch(/four magic items/);
    expect(at(14, 'Advanced Artifice')!.body).toMatch(/five magic items/);
    expect(at(18, 'Magic Item Master')!.body).toMatch(/six magic items/);
  });

  it('capstones with Soul of Artifice, which now scales with what you sacrifice', () => {
    const f = at(20, 'Soul of Artifice')!;
    expect(f.body).toMatch(/20 × the number/);
    // 2014 gave a flat +1 to every save per attuned item. Carrying that forward is a real power change.
    expect(f.body).not.toMatch(/\+1 bonus to all saving throws/);
  });
});

describe('the six subclasses', () => {
  const subs = subclassesFor(SYS, 'artificer');

  it('offers all six, including the two the 2014 line-up never had', () => {
    expect(subs.map((s) => s.name).sort()).toEqual(
      ['Alchemist', 'Armorer', 'Artillerist', 'Battle Smith', 'Cartographer', 'Reanimator'],
    );
  });

  it('every subclass grants features at 3 and never below the subclass level', () => {
    for (const s of subs) {
      expect(s.classKey).toBe('artificer');
      expect(s.system).toBe(SYS);
      expect(s.features.some((f) => f.level === 3), `${s.name} must start at 3`).toBe(true);
      for (const f of s.features) expect(f.level, `${s.name}: ${f.name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every subclass carries always-prepared spells at 3/5/9/13/17', () => {
    for (const s of subs) {
      expect(Object.keys(s.alwaysPrepared ?? {}).map(Number).sort((a, b) => a - b), s.name)
        .toEqual([3, 5, 9, 13, 17]);
    }
  });

  it('the Armorer has three models — Dreadnaught is new in 2024', () => {
    const armorer = subs.find((s) => s.key === 'armorer')!;
    const model = armorer.features.find((f) => f.name === 'Armor Model')!;
    for (const m of ['Dreadnaught', 'Guardian', 'Infiltrator']) expect(model.body, m).toContain(m);
  });

  it('the companion subclasses carry a real stat block, not a promise of one', () => {
    // A companion described only as "you gain a Steel Defender" is the defect this checks for: the
    // numbers are what a player actually needs at the table, and they are easy to leave for later.
    const smith = subs.find((s) => s.key === 'battle-smith')!;
    const defender = smith.features.find((f) => f.name === 'Steel Defender')!;
    expect(defender.body).toMatch(/\*\*AC\*\*/);
    expect(defender.body).toMatch(/\*\*HP\*\*/);
    expect(defender.body).toMatch(/Force-Empowered Rend/);
    const rean = subs.find((s) => s.key === 'reanimator')!;
    const companion = rean.features.find((f) => f.name === 'Reanimated Companion')!;
    expect(companion.body).toMatch(/Death Burst/);
    expect(companion.body).toMatch(/Dreadful Swipe/);
  });
});

describe('the Artificer can actually pick spells', () => {
  // The failure this exists to prevent: the class ships, the builder offers it, and the spell picker
  // refuses EVERY spell because nothing in the catalog names the Artificer on its list. Authoring the
  // class without tagging the list is one commit that looks complete and is not.
  const artificerSpells = SPELLS_2024.filter((s) => s.classes.includes('Artificer'));

  it('has a spell list in the catalog at every level it can cast', () => {
    expect(artificerSpells.length).toBeGreaterThan(60);
    for (const level of [0, 1, 2, 3, 4, 5]) {
      expect(artificerSpells.some((s) => s.level === level), `level ${level}`).toBe(true);
    }
    // It is a rank-5 caster; a rank-6+ spell on its list would be a tagging mistake.
    expect(artificerSpells.every((s) => s.level <= 5)).toBe(true);
  });

  it('accepts a spell on its own list and refuses one that is not', () => {
    const cure = SPELLS_2024.find((s) => s.key === 'cure-wounds')!;
    const ok = spellEligibility(cure, { system: SYS, className: 'Artificer', level: 3 });
    expect(ok.ok, ok.reason).toBe(true);

    const sacredFlame = SPELLS_2024.find((s) => s.key === 'sacred-flame')!;
    expect(spellEligibility(sacredFlame, { system: SYS, className: 'Artificer', level: 3 }).ok).toBe(false);
  });

  it('carries the two Artificer-only spells its own book adds', () => {
    const homunculus = SPELLS_2024.find((s) => s.key === 'homunculus-servant')!;
    expect(homunculus, 'Homunculus Servant is on the Artificer list and nowhere else').toBeTruthy();
    expect(homunculus.classes).toEqual(['Artificer']);
    expect(SPELLS_2024.find((s) => s.key === 'tortoise-shell')).toBeTruthy();
  });
});
