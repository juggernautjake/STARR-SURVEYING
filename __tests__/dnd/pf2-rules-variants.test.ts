// __tests__/dnd/pf2-rules-variants.test.ts — the Pathfinder 2e optional rules variants (settings S-4a/S-4b).
//
// The plan doc's warning about this slice was that "proficiency without level" is an ENGINE-WIDE change:
// `pf2Proficiency` is called from ~18 sites across rules.ts/resolve.ts, and a variant that reaches some of
// them and not others produces a sheet whose card and dice disagree. So the tests below are less about the
// arithmetic (which is one line) and more about COVERAGE — that every headline number moves together, and
// that a caller who passes nothing still gets exactly the vanilla numbers.
import { describe, it, expect } from 'vitest';
import {
  PF2_VANILLA_VARIANTS, PF2_RANK_BONUS_NO_LEVEL,
  normalizePf2Variants, isVanillaPf2Variants, pf2ProficiencyTerm, pf2AdjustLevelDc,
  pf2FreeArchetypeLevels, pf2FreeArchetypeFeatCount, pf2VariantsFromPreferences, describePf2Variants,
  type PF2RulesVariants,
} from '@/lib/dnd/systems/pathfinder2e/variants';
import {
  pf2Proficiency, pf2ArmorClass, pf2ClassDc, pf2SaveTotal, pf2PerceptionTotal,
  pf2SpellDc, pf2SpellAttack, pf2LevelBasedDc, pf2Derived, pf2MaxHp,
} from '@/lib/dnd/systems/pathfinder2e/rules';
import { pf2ResolveAll } from '@/lib/dnd/systems/pathfinder2e/resolve';
import { pf2FeatBudget } from '@/lib/dnd/systems/pathfinder2e/eligibility';
import { buildPF2Character } from '@/lib/dnd/systems/pathfinder2e/builder';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { resolvePreferences, DEFAULT_CAMPAIGN_PREFERENCES } from '@/lib/dnd/preferences';
import { prefAppliesToSystem, enumPrefsForSystem, ENUM_ORDER, ENUM_OPTIONS, ENUM_LABEL, ENUM_HELP, PREF_GROUP } from '@/lib/dnd/preference-options';

const PWL: PF2RulesVariants = { ...PF2_VANILLA_VARIANTS, proficiencyWithoutLevel: true };

/** A level-12 character with a spread of ranks, so the level term is large enough that dropping it is
 *  unmistakable (a missed call site would show up as a number that did NOT move). */
function char12() {
  const c = blankPF2Character('Test');
  c.identity.level = 12;
  c.attributes = { STR: 4, DEX: 2, CON: 3, INT: 1, WIS: 2, CHA: 0 };
  c.combat.armorRank = 'expert';
  c.combat.classDcRank = 'master';
  c.combat.classDcAttribute = 'STR';
  c.combat.ancestryHp = 8;
  c.combat.classHpPerLevel = 10;
  c.combat.dexCap = null;
  c.combat.acItemBonus = 0;
  c.perception.rank = 'expert';
  c.saves.Fortitude.rank = 'master';
  c.saves.Reflex.rank = 'trained';
  c.saves.Will.rank = 'expert';
  c.spellcasting.kind = 'prepared';
  c.spellcasting.attribute = 'INT';
  c.spellcasting.rank = 'expert';
  return c;
}

describe('the variant model', () => {
  it('is vanilla by default, and vanilla means RAW: level added, 1 hero point', () => {
    expect(PF2_VANILLA_VARIANTS).toEqual({ proficiencyWithoutLevel: false, freeArchetype: false, startingHeroPoints: 1 });
    expect(isVanillaPf2Variants(PF2_VANILLA_VARIANTS)).toBe(true);
    expect(isVanillaPf2Variants(undefined)).toBe(true);
  });

  it('normalizes junk to vanilla rather than letting a corrupt row change the numbers', () => {
    expect(normalizePf2Variants(null)).toEqual(PF2_VANILLA_VARIANTS);
    expect(normalizePf2Variants({ proficiencyWithoutLevel: 'yes' })).toEqual(PF2_VANILLA_VARIANTS); // only `true` counts
    expect(normalizePf2Variants({ startingHeroPoints: 99 }).startingHeroPoints).toBe(3); // clamped to the PF2 cap
    expect(normalizePf2Variants({ startingHeroPoints: -4 }).startingHeroPoints).toBe(0);
    expect(normalizePf2Variants({ startingHeroPoints: 'abc' }).startingHeroPoints).toBe(1);
  });

  it('treats a changed hero-point count as non-vanilla, so the sheet says so', () => {
    expect(isVanillaPf2Variants({ ...PF2_VANILLA_VARIANTS, startingHeroPoints: 3 })).toBe(false);
    expect(describePf2Variants({ ...PF2_VANILLA_VARIANTS, startingHeroPoints: 3 })).toHaveLength(1);
    expect(describePf2Variants(PF2_VANILLA_VARIANTS)).toEqual([]);
  });
});

describe('proficiency without level', () => {
  it('drops the level term and makes untrained a −2 PENALTY (not 0)', () => {
    expect(pf2ProficiencyTerm('untrained', 12)).toBe(0);       // vanilla: untrained is flat 0
    expect(pf2ProficiencyTerm('untrained', 12, PWL)).toBe(-2); // the variant's signature change
    expect(pf2ProficiencyTerm('legendary', 20)).toBe(8 + 20);
    expect(pf2ProficiencyTerm('legendary', 20, PWL)).toBe(8);
    expect(PF2_RANK_BONUS_NO_LEVEL.trained).toBe(2);
  });

  it('is identical to vanilla at every rank when the variant is off', () => {
    for (const rank of ['untrained', 'trained', 'expert', 'master', 'legendary'] as const) {
      for (const level of [1, 5, 12, 20]) {
        expect(pf2ProficiencyTerm(rank, level, PF2_VANILLA_VARIANTS)).toBe(pf2ProficiencyTerm(rank, level));
      }
    }
  });

  it('reaches EVERY headline number in rules.ts — none is left on the vanilla path', () => {
    const c = char12();
    // Each of these embeds a proficiency term, so each must fall by exactly 12 (the level) when the
    // variant is on. Anything that does NOT move is a call site that forgot to thread the variant.
    expect(pf2ArmorClass(c) - pf2ArmorClass(c, PWL)).toBe(12);
    expect(pf2ClassDc(c) - pf2ClassDc(c, PWL)).toBe(12);
    expect(pf2PerceptionTotal(c) - pf2PerceptionTotal(c, PWL)).toBe(12);
    expect(pf2SpellDc(c)! - pf2SpellDc(c, PWL)!).toBe(12);
    expect(pf2SpellAttack(c)! - pf2SpellAttack(c, PWL)!).toBe(12);
    for (const s of ['Fortitude', 'Reflex', 'Will'] as const) {
      expect(pf2SaveTotal(s, c) - pf2SaveTotal(s, c, PWL)).toBe(12);
    }
  });

  it('does NOT touch hit points — it is a proficiency variant, not a survivability one', () => {
    const c = char12();
    expect(pf2Derived(c, PWL).maxHp).toBe(pf2MaxHp(c));
  });

  it('flattens level-based DCs in step, so tasks stay reachable', () => {
    expect(pf2LevelBasedDc(12)).toBe(30);
    expect(pf2LevelBasedDc(12, PWL)).toBe(30 - 12);
    expect(pf2AdjustLevelDc(30, 12, PF2_VANILLA_VARIANTS)).toBe(30);
  });

  it('carries through pf2Derived AND the conditioned resolve layer together', () => {
    const c = char12();
    const van = pf2Derived(c);
    const pwl = pf2Derived(c, PWL);
    expect(van.ac - pwl.ac).toBe(12);
    expect(van.saves.Will - pwl.saves.Will).toBe(12);

    // resolve.ts is the path the SHEET actually renders; it must agree with rules.ts or the card and the
    // dice disagree — the exact bug the "one resolution" note in usePf2Panels warns about.
    const rVan = pf2ResolveAll(c);
    const rPwl = pf2ResolveAll(c, PWL);
    expect(rVan.ac.total - rPwl.ac.total).toBe(12);
    expect(rVan.perception.total - rPwl.perception.total).toBe(12);
    expect(rVan.classDc.total - rPwl.classDc.total).toBe(12);
    expect(rVan.spellDc!.total - rPwl.spellDc!.total).toBe(12);
    expect(rVan.saves.Fortitude.total - rPwl.saves.Fortitude.total).toBe(12);
    // …and the resolved sheet number matches the pure number, under the variant as well as under RAW.
    expect(rPwl.ac.total).toBe(pf2ArmorClass(c, PWL));
  });

  it('leaves every number untouched when no variants are passed at all (back-compatibility)', () => {
    const c = char12();
    expect(pf2ResolveAll(c).ac.total).toBe(pf2ResolveAll(c, PF2_VANILLA_VARIANTS).ac.total);
    expect(pf2Proficiency('expert', 7)).toBe(4 + 7);
  });
});

describe('free archetype', () => {
  it('grants an extra feat at every even level, and nothing when off', () => {
    expect(pf2FreeArchetypeLevels(PF2_VANILLA_VARIANTS)).toEqual([]);
    const fa = { ...PF2_VANILLA_VARIANTS, freeArchetype: true };
    expect(pf2FreeArchetypeLevels(fa)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(pf2FreeArchetypeFeatCount(1, fa)).toBe(0);
    expect(pf2FreeArchetypeFeatCount(2, fa)).toBe(1);
    expect(pf2FreeArchetypeFeatCount(11, fa)).toBe(5);
    expect(pf2FreeArchetypeFeatCount(20, fa)).toBe(10);
    expect(pf2FreeArchetypeFeatCount(20, PF2_VANILLA_VARIANTS)).toBe(0);
  });

  it('raises the ARCHETYPE budget only — normal class feats are untouched', () => {
    const fa = { ...PF2_VANILLA_VARIANTS, freeArchetype: true };
    const vanilla = pf2FeatBudget(12);
    const free = pf2FeatBudget(12, undefined, fa);
    expect(free.class).toBe(vanilla.class);            // the variant does not cost you a class feat…
    expect(free.archetype).toBe(vanilla.archetype + 6); // …it adds one per even level (6 by level 12)
    expect(free.skill).toBe(vanilla.skill);
    expect(free.general).toBe(vanilla.general);
  });
});

describe('starting hero points', () => {
  // The one variant that lands at BUILD time: hero points are spent down in play, so they cannot be
  // recomputed from preferences the way a derived number can.
  const picks = { className: 'Fighter', ancestry: 'Human', background: 'Warrior', level: 1, name: 'HP Test' };

  it('defaults to the RAW 1 when nothing is passed', () => {
    expect(buildPF2Character(picks as never).combat.heroPoints).toBe(1);
  });

  it('honours the table’s chosen count', () => {
    expect(buildPF2Character(picks as never, { ...PF2_VANILLA_VARIANTS, startingHeroPoints: 3 }).combat.heroPoints).toBe(3);
    expect(buildPF2Character(picks as never, { ...PF2_VANILLA_VARIANTS, startingHeroPoints: 0 }).combat.heroPoints).toBe(0);
  });
});

describe('the preferences bridge', () => {
  it('reads the PF2 fields out of resolved preferences', () => {
    const prefs = resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES, {});
    expect(pf2VariantsFromPreferences(prefs)).toEqual(PF2_VANILLA_VARIANTS);

    const on = resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES, {
      proficiencyWithoutLevel: 'on', freeArchetype: 'on', startingHeroPoints: '3',
    });
    expect(pf2VariantsFromPreferences(on)).toEqual({ proficiencyWithoutLevel: true, freeArchetype: true, startingHeroPoints: 3 });
  });

  it('falls back to vanilla for absent/garbage preferences rather than throwing', () => {
    expect(pf2VariantsFromPreferences(undefined)).toEqual(PF2_VANILLA_VARIANTS);
    expect(pf2VariantsFromPreferences(null)).toEqual(PF2_VANILLA_VARIANTS);
    expect(pf2VariantsFromPreferences({})).toEqual(PF2_VANILLA_VARIANTS);
    // A stored value outside the enum must read as vanilla, not as "on".
    expect(pf2VariantsFromPreferences({ proficiencyWithoutLevel: { value: 'nonsense' } })).toEqual(PF2_VANILLA_VARIANTS);
  });

  it('honours a DM lock — a locked campaign value beats the player’s own choice', () => {
    const locked = resolvePreferences(
      { ...DEFAULT_CAMPAIGN_PREFERENCES, proficiencyWithoutLevel: { value: 'on', playerCanChoose: false } },
      { proficiencyWithoutLevel: 'off' },
    );
    expect(locked.proficiencyWithoutLevel.lockedByDM).toBe(true);
    expect(pf2VariantsFromPreferences(locked).proficiencyWithoutLevel).toBe(true);
  });
});

describe('per-system scoping of the settings catalog', () => {
  // The defect this closes: every character was offered every setting, so a 5e player saw "Damage while
  // dying (PF2)" — a rule their sheet does not implement — with only the help text marking it PF2-only.
  it('offers the PF2-only settings to PF2 characters and nobody else', () => {
    for (const f of ['downedDamageModel', 'proficiencyWithoutLevel', 'freeArchetype', 'startingHeroPoints'] as const) {
      expect(prefAppliesToSystem(f, 'pathfinder2e')).toBe(true);
      expect(prefAppliesToSystem(f, 'dnd5e-2024')).toBe(false);
      expect(prefAppliesToSystem(f, 'intuitive-games')).toBe(false);
    }
  });

  it('keeps the genuinely cross-system setting on every system', () => {
    // `longRestModel`, `diceRollerStyle` and `autoMechanics` were all asserted here as cross-system
    // examples. None of them is: each is read only by the 5e engine (the store, or the full roller nodes
    // that `rollerFor` mounts — the bespoke sheets mount `rollerStageFor`, whose stages read only the roll
    // feed). See PREF_SHARED_ENGINE_ONLY, 2026-07-26. `equipLimits` is the real one: `ai-edit/route.ts`
    // honours it for every system's AI edits.
    for (const sys of ['dnd5e-2024', 'dnd5e-2014', 'pathfinder2e', 'intuitive-games']) {
      expect(prefAppliesToSystem('equipLimits', sys)).toBe(true);
    }
  });

  it('hides system-specific settings when the system is unknown, but keeps the shared ones', () => {
    expect(prefAppliesToSystem('proficiencyWithoutLevel', undefined)).toBe(false);
    expect(prefAppliesToSystem('equipLimits', undefined)).toBe(true);
    // A shared-ENGINE setting also survives an unknown system, because an ambiguous character is driven by
    // that engine (`isSharedEngineSystem` normalizes undefined → 'ambiguous' → true).
    expect(prefAppliesToSystem('longRestModel', undefined)).toBe(true);
    expect(enumPrefsForSystem(undefined)).not.toContain('freeArchetype');
    expect(enumPrefsForSystem(undefined)).toContain('longRestModel');
  });

  it('gives each system its OWN rules, not a superset of 5e\'s', () => {
    // This used to assert PF2 ⊇ 5e, which held only while the 5e-engine settings were mislabelled as
    // cross-system. The two sets now overlap without either containing the other — which is the point of
    // this whole doc: each system has its own rules variants.
    const pf2 = enumPrefsForSystem('pathfinder2e');
    const five = enumPrefsForSystem('dnd5e-2024');
    expect(pf2).toContain('proficiencyWithoutLevel');
    expect(five).not.toContain('proficiencyWithoutLevel');
    expect(five).toContain('longRestModel');
    expect(pf2).not.toContain('longRestModel');
    // …and both still share the one genuinely cross-system setting.
    expect(pf2).toContain('equipLimits');
    expect(five).toContain('equipLimits');
  });
});

describe('the catalog stays complete', () => {
  // Adding a setting means touching the model AND the catalog; this is the guard that catches the half.
  it('every enum field has options, a label, help, a group and a place in the order', () => {
    for (const f of ENUM_ORDER) {
      expect(ENUM_OPTIONS[f]?.length, `${f} options`).toBeGreaterThan(1);
      expect(ENUM_LABEL[f], `${f} label`).toBeTruthy();
      expect(ENUM_HELP[f], `${f} help`).toBeTruthy();
      expect(PREF_GROUP[f], `${f} group`).toBeTruthy();
    }
  });

  it('every option value the catalog offers is one the model will actually accept', () => {
    // A catalog option the normalizer rejects is a control that silently does nothing when clicked.
    for (const f of ENUM_ORDER) {
      for (const opt of ENUM_OPTIONS[f]) {
        const resolved = resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES, { [f]: opt.value } as never);
        expect((resolved[f] as { value: string }).value, `${f}=${opt.value}`).toBe(opt.value);
      }
    }
  });
});
