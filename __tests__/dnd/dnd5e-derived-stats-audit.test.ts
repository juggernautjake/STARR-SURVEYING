// __tests__/dnd/dnd5e-derived-stats-audit.test.ts — the 5e (2014 + 2024) derived-stat audit, pinned.
//
// WHY THIS FILE EXISTS. A bug was found in the Intuitive Games builder where the character's background
// NAME was set but the background's HP contribution was never wired into the model, so IG characters read
// as though they had no base HP ("a stat that should be there defaults to nothing"). The owner asked for a
// systematic sweep of the SHARED 5e engine (both editions) for the same class of bug: a class / subclass /
// race / background contribution that SHOULD be wired into a derived stat but ISN'T (silently missing), or
// SHOULDN'T be but IS (double-counted).
//
// The audit's conclusion is that the 5e sheet is a DELIBERATE hybrid model — the interactive builder walks
// CHOICE points (subclass, ASI, expertise, fighting style, cantrip) and the ledger overlays live effects,
// while base scores / HP / save-proficiencies are player- or AI-entered running totals. So there is no
// 5e auto-builder that silently drops a fixed contribution the way the IG builder did. The two places that
// most resemble the IG shape — the 2014 racial ability increase, and the two fixed class save proficiencies
// — are surfaced-but-not-auto-applied ON PURPOSE (see race2014Effects' doc comment for the double-count
// hazard that makes auto-applying the racial increase actively wrong for existing characters).
//
// This test pins the numbers the audit verified so a future change can't quietly break them:
//   1. The proficiency bonus the SHEET shows (rules/dnd.ts `profBonusForLevel`) agrees with the class
//      engine's table (engine.ts `proficiencyBonusFor` / `PROF_BY_LEVEL`) at every level. These are two
//      INDEPENDENT hardcoded implementations of the same 5e rule, with no prior test tying them together —
//      exactly the kind of drift the owner's #4 ("derived from level, not stored stale") asks us to guard.
//   2. The class HP formula (hit-die max at 1, fixed average per level after) resolves to the right base.
//   3. The 2014 racial ability increase is NEVER folded into a character's effective ability scores by the
//      live ledger path — asserted end-to-end on the audit's own test subject, a level-4 2014 Rogue who is
//      a Lightfoot Halfling — while the same race's size/speed/senses ARE applied. This is the direct
//      analogue of the IG question ("is the contribution wired?") answered as a live number: the racial
//      increase is DISPLAYED (speciesView) for the player to fold in by hand, and applying it in the ledger
//      too would double it.
import { describe, it, expect } from 'vitest';
import { profBonusForLevel } from '@/app/dnd/_sheet/rules/dnd';
import { proficiencyBonusFor, hitPointsBeforeCon, snapshotAtLevel } from '@/lib/dnd/classes/engine';
import { ROGUE_2014 } from '@/lib/dnd/classes/dnd5e-2014/rogue';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { speciesView } from '@/lib/dnd/species/view';
import { abilityMod } from '@/app/dnd/_sheet/rules/dnd';
import type { Character } from '@/app/dnd/_sheet/types';

describe('proficiency bonus (owner #4): the sheet and the class engine agree at every level', () => {
  it('rules/dnd.ts profBonusForLevel === engine proficiencyBonusFor for levels 1..20', () => {
    // The sheet's `pb` is `profBonusForLevel(char.meta.level)` (store.tsx). The level builder + progression
    // table use the engine's `proficiencyBonusFor`. If these two hand-written tables ever disagree, the
    // number the player rolls with would diverge from the number the class table shows — a silent split.
    for (let level = 1; level <= 20; level++) {
      expect(profBonusForLevel(level), `level ${level}`).toBe(proficiencyBonusFor(level));
    }
    // Spot-anchor the canonical breakpoints so a table that drifts UNIFORMLY (both wrong the same way)
    // is still caught: +2 (1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20).
    expect(profBonusForLevel(4)).toBe(2);
    expect(profBonusForLevel(5)).toBe(3);
    expect(profBonusForLevel(9)).toBe(4);
    expect(profBonusForLevel(13)).toBe(5);
    expect(profBonusForLevel(17)).toBe(6);
  });
});

describe('HP base (owner #1): hit-die max at 1, fixed average per level after', () => {
  it('a d8 class is 8 at level 1 and 23 at level 4, before CON', () => {
    // d8 average per level after the first = floor(8/2)+1 = 5. L1 = 8; L4 = 8 + 3×5 = 23.
    expect(hitPointsBeforeCon(8, 1)).toBe(8);
    expect(hitPointsBeforeCon(8, 4)).toBe(23);
    // The snapshot carries the same number, sourced from the class's own hit die (Rogue = d8).
    expect(snapshotAtLevel(ROGUE_2014, 4).hitPointsBeforeCon).toBe(23);
  });

  it('folding CON gives the full max HP (Perrin: level-4 d8 Rogue, CON 14 → 23 + 4×2 = 31)', () => {
    const con = 14;
    const level = 4;
    const full = hitPointsBeforeCon(ROGUE_2014.hitDie, level) + abilityMod(con) * level;
    expect(full).toBe(31);
  });
});

// ── The direct IG-bug analogue, answered on the audit's own test subject ─────────────────────────────
// Perrin Underbough — a level-4 2014 Rogue, Lightfoot Halfling. The question the owner most wants
// answered: is the racial ability score increase wired into the scores, or only the name?
describe('2014 racial ability increase (owner #6): surfaced, but NEVER auto-folded into scores', () => {
  function perrin(): Character {
    const c = blankCharacter('Perrin Underbough');
    c.meta.species = 'Lightfoot Halfling';
    c.meta.className = 'Rogue';
    c.meta.level = 4;
    // A player builds a 2014 sheet by writing the FINAL scores (the racial +2 DEX / +1 CHA already folded
    // in by hand at creation — see race2014Effects' doc comment). Model that: base already includes it.
    c.abilities = { str: 10, dex: 16, con: 14, int: 13, wis: 12, cha: 9 };
    return c;
  }

  it('the ledger applies the race\'s size/speed/senses but adds NOTHING to any ability score', () => {
    const c = perrin();
    const led = buildLedger(c, { system: 'dnd5e-2014' });
    // Every effective ability equals the stored base — the race source contributes no ability effect, so
    // the +2 DEX / +1 CHA is NOT applied a second time on top of the player's already-folded totals. This
    // is the guard against the "fix" that would silently inflate every existing 2014 character.
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      expect(led.value(`ability_${k}`, c.abilities[k]), k).toBe(c.abilities[k]);
    }
    // Meanwhile the race's OTHER contributions ARE live: a Lightfoot Halfling is Small, walks 25 (≠ the
    // default 30, so it folds), and — unlike most 2014 races — has no darkvision.
    expect(led.identity('size')?.value).toBe('Small');
    expect(led.value('speed_walk', c.combat.speed)).toBe(25);
    expect(led.explain('grant_sense').filter((x) => !x.suppressed)).toHaveLength(0);
  });

  it('the reduced racial speed only REPLACES the base — a faster buff still wins over it', () => {
    // The species override must not become a hard ceiling: Boots of Striding (a +10 walk-speed ADD) on a
    // 25-ft Halfling gives 35, and an item that SETS a higher speed (40) wins outright. The species only
    // replaces the base when its own set is the surviving (highest) value.
    const c = perrin();
    c.inventory = [
      { id: 'boots', name: 'Boots of Striding', desc: '', qty: 1, kind: 'wondrous', equipped: true, tags: ['equipped'],
        effects: [{ target: 'speed_walk', operation: 'add', value: 10 }] } as unknown as Character['inventory'][number],
    ];
    expect(buildLedger(c, { system: 'dnd5e-2014' }).value('speed_walk', c.combat.speed)).toBe(35); // 25 + 10

    const c2 = perrin();
    c2.inventory = [
      { id: 'zephyr', name: 'Zephyr Anklets', desc: '', qty: 1, kind: 'wondrous', equipped: true, tags: ['equipped'],
        effects: [{ target: 'speed_walk', operation: 'set', value: 40 }] } as unknown as Character['inventory'][number],
    ];
    expect(buildLedger(c2, { system: 'dnd5e-2014' }).value('speed_walk', c2.combat.speed)).toBe(40); // higher set wins
  });

  it('the increase IS surfaced to the player, so they can fold it in by hand (DEX +2, CHA +1)', () => {
    // The number is not lost — it is presented via speciesView (structured + a readable leading trait
    // line), which is how a manual-totals sheet keeps the racial rule visible without double-applying it.
    const v = speciesView('dnd5e-2014', 'Lightfoot Halfling')!;
    expect(v.abilityIncreases).toEqual({ dex: 2, cha: 1 });
    expect(v.traits[0].name).toBe('Ability Score Increase');
    expect(v.traits[0].text).toContain('DEX +2');
    expect(v.traits[0].text).toContain('CHA +1');
  });

  it('the 2024 side is the mirror: a species adds no ability increase at all (no double-count with the background)', () => {
    // In 2024 the increase moved to the BACKGROUND, so the SPECIES ledger source must add nothing to an
    // ability — otherwise a 2024 character whose background spread was applied would be double-counted.
    const c = blankCharacter('Test 2024');
    c.meta.species = 'Elf';
    const led = buildLedger(c, { system: 'dnd5e-2024' });
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      expect(led.value(`ability_${k}`, c.abilities[k]), k).toBe(c.abilities[k]);
    }
    // The 2024 view carries no ability-increase block (the background does).
    expect(speciesView('dnd5e-2024', 'Elf')!.abilityIncreases).toBeUndefined();
  });
});
