// __tests__/dnd/pf2-progression-ranks.test.ts — proficiency ranks must ADVANCE with level.
//
// THE BUG THIS LOCKS DOWN. The builder assembled every proficiency rank from content.ts's `initial`
// field, which is the LEVEL-1 snapshot only. The full level 1–20 rank schedule already lived in
// data/classes.ts (and `pf2RankAtLevel` already walked it) but was never wired into the builder — the
// exact "the data exists but was never connected to the stat" class of bug found in the IG background
// HP. So a level-9 Wizard saved and cast as though freshly made: its Reflex (expert at 5), Fortitude
// (expert at 9) and spell proficiency (expert at 7) each read TWO points low on the card and the roll.
//
// These assertions carry the resolved NUMBERS, not just the ranks, so a regression that quietly reverts
// the wiring fails here with a concrete wrong total rather than a vague shrug.
import { describe, it, expect } from 'vitest';
import { assemblePF2VanillaCharacter, pf2ReprojectRanks } from '@/lib/dnd/systems/pathfinder2e/builder';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pf2Derived } from '@/lib/dnd/systems/pathfinder2e/rules';
import { pf2ClassProgression, pf2EffectiveTracks, PF2_CLASS_PROGRESSIONS } from '@/lib/dnd/systems/pathfinder2e/data';
// The gaps list is not re-exported through the data barrel — it is read straight from the module that
// owns it, which is also the module a reader would go looking in.
import { PF2_CLASS_PROGRESSION_GAPS } from '@/lib/dnd/systems/pathfinder2e/data/classes';

describe('PF2 proficiency ranks advance with character level', () => {
  it('a level-9 Wizard has its level-appropriate saves and spell proficiency, not level-1 ranks', () => {
    // Elf Wizard, INT 5 / DEX 2 / CON 1 / WIS 1 — Jacob's Orin Sallowmere shape.
    const c = assemblePF2VanillaCharacter({
      name: 'Orin', className: 'Wizard', ancestry: 'Elf', background: 'Scholar', level: 9,
      keyAttribute: 'INT', attributes: { STR: 0, DEX: 2, CON: 1, INT: 5, WIS: 1, CHA: 0 },
    });
    const p = c.pf2e;
    // Fortitude: Magical Fortitude at 9 → expert. CON 1 + (4 + 9) = 14, not trained's 12.
    expect(p.saves.Fortitude.rank).toBe('expert');
    // Reflex: Reflex Expertise at 5 → expert. DEX 2 + (4 + 9) = 15, not trained's 13.
    expect(p.saves.Reflex.rank).toBe('expert');
    // Will: initial expert, Prodigious Will not until 17 → still expert at 9.
    expect(p.saves.Will.rank).toBe('expert');
    // Spell DC/attack proficiency: Expert Spellcaster at 7 → expert.
    expect(p.spellcasting.rank).toBe('expert');
    // Ranks that legitimately have NOT advanced by 9 stay put (no over-advancement):
    expect(p.perception.rank).toBe('trained');        // Perception Expertise not until 11
    expect(p.combat.armorRank).toBe('trained');       // Defensive Robes not until 13
    expect(p.combat.attackRank).toBe('trained');      // Wizard Weapon Expertise not until 11

    const d = pf2Derived(p);
    expect(d.saves.Fortitude).toBe(14);
    expect(d.saves.Reflex).toBe(15);
    expect(d.saves.Will).toBe(14);
    expect(d.spellDc).toBe(28);      // 10 + INT 5 + expert(4+9)
    expect(d.spellAttack).toBe(18);  //      INT 5 + expert(4+9)
  });

  it('a martial class advances its ATTACK rank at the class-defined level', () => {
    // Barbarian: Brutality grants expert attacks at level 5 (an unscoped, whole-track step).
    const lvl5 = assemblePF2VanillaCharacter({ name: 'B', className: 'Barbarian', level: 5 });
    expect(lvl5.pf2e.combat.attackRank).toBe('expert');
    // At level 4 it is still the level-1 trained.
    const lvl4 = assemblePF2VanillaCharacter({ name: 'B', className: 'Barbarian', level: 4 });
    expect(lvl4.pf2e.combat.attackRank).toBe('trained');
  });

  it('a defensive step advances the armor rank (Champion Armor Expertise at 7)', () => {
    const c = assemblePF2VanillaCharacter({ name: 'C', className: 'Champion', level: 7 });
    expect(c.pf2e.combat.armorRank).toBe('expert');
  });

  it('a full caster spell DC climbs to master at 15 and legendary at 19', () => {
    const master = assemblePF2VanillaCharacter({ name: 'D', className: 'Druid', level: 15 });
    expect(master.pf2e.spellcasting.rank).toBe('master');
    const legend = assemblePF2VanillaCharacter({ name: 'D', className: 'Druid', level: 19 });
    expect(legend.pf2e.spellcasting.rank).toBe('legendary');
  });

  it('at level 1 every rank equals the content.ts initial (no regression)', () => {
    const c = assemblePF2VanillaCharacter({ name: 'W', className: 'Wizard', level: 1 });
    const p = c.pf2e;
    expect(p.saves.Fortitude.rank).toBe('trained');
    expect(p.saves.Reflex.rank).toBe('trained');
    expect(p.saves.Will.rank).toBe('expert');
    expect(p.spellcasting.rank).toBe('trained');
    expect(p.combat.attackRank).toBe('trained');
  });

  it('the Fighter attack rank stays expert past 13 — conservative, by design', () => {
    // The Fighter's level-5/13/19 attack steps are per-step NOTED (they advance a subset of weapons
    // or a chosen weapon group), so the builder deliberately does NOT advance the whole attack track
    // through them. That UNDER-counts a high-level Fighter's general attacks rather than over-counts
    // — the safe direction. Recorded in PF2_CLASS_PROGRESSION_GAPS. This test pins the choice so it is
    // not "fixed" into a silent over-count.
    const c = assemblePF2VanillaCharacter({ name: 'F', className: 'Fighter', level: 13 });
    expect(c.pf2e.combat.attackRank).toBe('expert');
  });

  it('an unmodelled (custom) class falls back to level-1 defaults without throwing', () => {
    const c = assemblePF2VanillaCharacter({ name: 'X', className: 'Homebrew Warlock', level: 9 });
    expect(c.pf2e.saves.Fortitude.rank).toBe('trained');
    expect(c.pf2e.combat.attackRank).toBe('trained');
  });
});

// ── The Cleric's doctrine (P5-10) ─────────────────────────────────────────────────────────────
//
// The SAME bug as above, one level down. The wiring fix taught the builder to walk each class's rank
// schedule — but the Cleric's Fortitude, attack and spellcasting tracks all carry `increases: []`,
// because the two doctrines disagree about every one of them and writing either answer onto the base
// class would assert a choice the character has not made. So a Cleric walked a schedule with nothing on
// it and came out frozen at level 1 anyway. The doctrine was collected by the builder, stored on the
// character and printed on the sheet the whole time; no code ever read it.
describe('Cleric ranks follow the DOCTRINE, not the base class', () => {
  const cleric = (subclass: string | undefined, level: number) =>
    assemblePF2VanillaCharacter({
      name: 'V', className: 'Cleric', ancestry: 'Human', level, keyAttribute: 'WIS',
      attributes: { STR: 1, DEX: 1, CON: 2, INT: 0, WIS: 4, CHA: 1 },
      ...(subclass ? { subclass } : {}),
    }).pf2e;

  it('a warpriest is EXPERT in Fortitude from level 1', () => {
    // Not "trained, then expert at 3" like their cloistered sibling — they start there. This is why a
    // subclass track REPLACES the base rather than merging into it: a merge keeps `initial: trained`
    // and reads a rank low for the character's whole career.
    expect(cleric('Warpriest', 1).saves.Fortitude.rank).toBe('expert');
    expect(cleric('Cloistered Cleric', 1).saves.Fortitude.rank).toBe('trained');
  });

  it('and MASTER at 15, where a cloistered cleric is still expert', () => {
    expect(cleric('Warpriest', 15).saves.Fortitude.rank).toBe('master');
    expect(cleric('Cloistered Cleric', 15).saves.Fortitude.rank).toBe('expert');
  });

  it('the cloistered cleric reaches Fortitude expert at 3, not before', () => {
    expect(cleric('Cloistered Cleric', 2).saves.Fortitude.rank).toBe('trained');
    expect(cleric('Cloistered Cleric', 3).saves.Fortitude.rank).toBe('expert');
  });

  it('SPELL DC DIVERGES BY FOUR LEVELS AND ONE CEILING', () => {
    // Cloistered: expert 7, master 15, legendary 19 — the standard full-caster track.
    // Warpriest:  expert 11, master 19, and never legendary at all.
    expect(cleric('Cloistered Cleric', 7).spellcasting.rank).toBe('expert');
    expect(cleric('Warpriest', 7).spellcasting.rank).toBe('trained');
    expect(cleric('Warpriest', 11).spellcasting.rank).toBe('expert');
    expect(cleric('Cloistered Cleric', 20).spellcasting.rank).toBe('legendary');
    expect(cleric('Warpriest', 20).spellcasting.rank).toBe('master');
  });

  it('a doctrineless cleric keeps the base tracks and is not guessed at', () => {
    // A character mid-build, or one imported without a doctrine, must not be silently assigned one.
    // Level-1 ranks are the honest answer, and they are also what the sheet showed before this slice.
    const p = cleric(undefined, 20);
    expect(p.saves.Fortitude.rank).toBe('trained');
    expect(p.spellcasting.rank).toBe('trained');
    // …and an unrecognised doctrine name falls through the same way rather than throwing.
    expect(cleric('Warprist', 20).saves.Fortitude.rank).toBe('trained');
  });

  it('attacks advance per doctrine, and the warpriest favored-weapon-only step does NOT', () => {
    // Cloistered: expert at 11 across the cleric's whole weapon set — unscoped, so it applies.
    expect(cleric('Cloistered Cleric', 10).combat.attackRank).toBe('trained');
    expect(cleric('Cloistered Cleric', 11).combat.attackRank).toBe('expert');
    // Warpriest: expert at 7 (everything), then master at 19 with the FAVORED WEAPON ONLY. That step
    // carries a per-step note, so the builder leaves the general attack rank at expert — the same
    // under-count-rather-than-over-count rule the Fighter test above pins.
    expect(cleric('Warpriest', 7).combat.attackRank).toBe('expert');
    expect(cleric('Warpriest', 20).combat.attackRank).toBe('expert');
  });

  it('and the tracks the doctrine does NOT touch still come from the class', () => {
    // Will is master at 9 (Resolute Faith) and Reflex expert at 11 for both doctrines — a subclass that
    // replaces three tracks must not quietly blank the other five.
    for (const d of ['Cloistered Cleric', 'Warpriest']) {
      expect(cleric(d, 11).saves.Will.rank, d).toBe('master');
      expect(cleric(d, 11).saves.Reflex.rank, d).toBe('expert');
      expect(cleric(d, 13).combat.armorRank, d).toBe('expert');   // Divine Defense
      expect(cleric(d, 5).perception.rank, d).toBe('expert');     // Perception Expertise
    }
  });
});

describe('pf2EffectiveTracks is the door, and every other class walks through unchanged', () => {
  it('returns the base tracks for a class with no rank-moving subclass', () => {
    // Twenty of the twenty-one classes. A Barbarian instinct changes what it rages into, not a rank.
    const bare = pf2EffectiveTracks('Barbarian');
    const withInstinct = pf2EffectiveTracks('Barbarian', 'Animal');
    expect(withInstinct.fortitude).toBe(bare.fortitude);
    expect(withInstinct.attacks).toBe(bare.attacks);
  });

  it('and survives an unknown class without throwing', () => {
    const t = pf2EffectiveTracks('Homebrew Warlock', 'Whatever');
    expect(t.fortitude).toBeUndefined();
    expect(t.spellProficiency).toBeUndefined();
  });

  it('THE CLERIC IS THE REASON IT EXISTS — its base tracks are empty', () => {
    // If someone ever "tidies" these into the base class, the doctrine that disagrees becomes wrong and
    // this whole mechanism becomes dead code. Pin the emptiness, not just the override.
    const prog = pf2ClassProgression('Cleric')!;
    expect(prog.saves.fortitude.increases).toHaveLength(0);
    expect(prog.attacks.increases).toHaveLength(0);
    expect(prog.spellcasting!.proficiency!.increases).toHaveLength(0);
    // …and each one is explained on the track itself, where a reader of the data will find it.
    expect(prog.saves.fortitude.note).toMatch(/DOCTRINE/i);
    expect(prog.spellcasting!.proficiency!.note).toMatch(/DOCTRINE/i);
  });

  it('every subclass tracks override is structurally sane', () => {
    // A guard against a hand-written override with a descending or duplicated step, which would make
    // `pf2RankAtLevel` return a rank that goes DOWN with level.
    const order = ['untrained', 'trained', 'expert', 'master', 'legendary'];
    for (const cls of PF2_CLASS_PROGRESSIONS) {
      for (const sub of cls.subclasses ?? []) {
        for (const [name, track] of Object.entries(sub.tracks ?? {})) {
          const where = `${cls.className} / ${sub.name} / ${name}`;
          let level = 0, rank = order.indexOf(track.initial);
          expect(rank, `${where}: initial is a real rank`).toBeGreaterThanOrEqual(0);
          for (const step of track.increases) {
            expect(step.level, `${where}: levels ascend`).toBeGreaterThan(level);
            expect(step.level).toBeLessThanOrEqual(20);
            expect(order.indexOf(step.rank), `${where}: ranks only go up`).toBeGreaterThan(rank);
            expect(step.via, `${where}: every step says what grants it`).toBeTruthy();
            level = step.level; rank = order.indexOf(step.rank);
          }
        }
      }
    }
  });
});

describe('the Monk gap is still open, and says so', () => {
  it('a level-20 Monk keeps expert in all three saves', () => {
    // Path to Perfection (7/11/15) makes one save master, a second master, then one of those legendary
    // — but WHICH is the player's choice, it is collected nowhere, and it cannot be guessed. Unlike the
    // Cleric, whose doctrine was already recorded and merely never read, this one needs the choice
    // captured first. Split out as P5-10b rather than approximated.
    const p = assemblePF2VanillaCharacter({ name: 'M', className: 'Monk', level: 20 }).pf2e;
    expect(p.saves.Fortitude.rank).toBe('expert');
    expect(p.saves.Reflex.rank).toBe('expert');
    expect(p.saves.Will.rank).toBe('expert');
  });

  it('and the gap is recorded next to the data, not only in a planning doc', () => {
    expect(PF2_CLASS_PROGRESSION_GAPS.join('\n')).toMatch(/Path to Perfection/);
    // The Cleric half of that entry is now DONE — if this still claims a cleric keeps its level-1 ranks,
    // the gaps list is lying about shipped work, which is worse than not having one.
    expect(PF2_CLASS_PROGRESSION_GAPS.join('\n')).not.toMatch(/assembled Cleric or Monk keeps/);
  });
});

// ── The level WALKER has to re-derive the same ranks (P5-10) ──────────────────────────────────
//
// Found while wiring the doctrine, and worse than the thing it was found under. Every rank on a PF2 sheet
// was written exactly once, at build time. `/api/dnd/characters/[id]/pf2-levels` moves `identity.level`
// and projects the feats earned — and left every proficiency where it was. So a Wizard walked from 1 to 9
// kept level-1 saves and a level-1 spell DC: precisely the numbers the rank wiring exists to fix, correct
// if you built the character AT level 9 and stale if you walked it there. The same character reading
// differently depending on how it arrived is worse than both paths being wrong, because only one of them
// looks broken.
describe('pf2ReprojectRanks — the walker path lands on the same numbers as the builder path', () => {
  it('a Wizard walked to 9 matches a Wizard BUILT at 9, rank for rank', () => {
    const born = assemblePF2VanillaCharacter({
      name: 'Orin', className: 'Wizard', ancestry: 'Elf', background: 'Scholar', level: 9,
      keyAttribute: 'INT', attributes: { STR: 0, DEX: 2, CON: 1, INT: 5, WIS: 1, CHA: 0 },
    }).pf2e;
    const walked = pf2ReprojectRanks(
      assemblePF2VanillaCharacter({
        name: 'Orin', className: 'Wizard', ancestry: 'Elf', background: 'Scholar', level: 1,
        keyAttribute: 'INT', attributes: { STR: 0, DEX: 2, CON: 1, INT: 5, WIS: 1, CHA: 0 },
      }).pf2e,
      9,
    );
    expect(walked.saves.Fortitude.rank).toBe(born.saves.Fortitude.rank);
    expect(walked.saves.Reflex.rank).toBe(born.saves.Reflex.rank);
    expect(walked.saves.Will.rank).toBe(born.saves.Will.rank);
    expect(walked.spellcasting.rank).toBe(born.spellcasting.rank);
    expect(walked.perception.rank).toBe(born.perception.rank);
    expect(walked.combat.attackRank).toBe(born.combat.attackRank);
    expect(walked.combat.armorRank).toBe(born.combat.armorRank);
    // …and it genuinely moved, so this is not two identical wrong answers agreeing with each other.
    expect(walked.saves.Reflex.rank).toBe('expert');
  });

  it('carries the doctrine, because the ranks are a function of it', () => {
    const l1 = assemblePF2VanillaCharacter({ name: 'V', className: 'Cleric', level: 1, subclass: 'Warpriest' }).pf2e;
    expect(pf2ReprojectRanks(l1, 15).saves.Fortitude.rank).toBe('master');
  });

  it('and touches NOTHING that is not a function of level', () => {
    // Spent HP, hero points, items and chosen skills all live on the sidecar too. A reprojection that
    // healed the party on level-up would be a memorable bug.
    const p = assemblePF2VanillaCharacter({ name: 'V', className: 'Cleric', level: 1, subclass: 'Warpriest' }).pf2e;
    const hurt = { ...p, combat: { ...p.combat, currentHp: 3, heroPoints: 0, dyingValue: 2 } };
    const out = pf2ReprojectRanks(hurt, 15);
    expect(out.combat.currentHp).toBe(3);
    expect(out.combat.heroPoints).toBe(0);
    expect(out.combat.dyingValue).toBe(2);
    expect(out.skills).toBe(hurt.skills);
    expect(out.identity.name).toBe('V');
  });
});

describe('the pf2-levels route wires all of it', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/pf2-levels/route.ts'), 'utf8');

  it('re-derives ranks when it commits a level', () => {
    expect(route).toContain('pf2ReprojectRanks(levelled, newLevel)');
  });

  it('and PROJECTS THE SUBCLASS, which it recorded and then dropped', () => {
    // The walker accepted a `subclass` choice, wrote it to the ledger, and never touched
    // `identity.subclass` — so a doctrine chosen at level 1 through this route never appeared on the
    // sheet, and after this slice could not have driven the Cleric's ranks either. The fix that needed it
    // is what surfaced it.
    expect(route).toMatch(/c\.kind === 'subclass'/);
    expect(route).toContain('subclass: chosenSubclass || sidecar.identity.subclass');
  });
});
