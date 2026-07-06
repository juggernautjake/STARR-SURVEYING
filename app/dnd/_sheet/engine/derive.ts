// app/dnd/_sheet/engine/derive.ts — the base→derived pipeline (Phase C12, §6.18).
//
// A small set of BASE inputs (ability scores, level, proficiencies, spellcasting)
// drives EVERY ability/level-derived number. `derive()` is a pure function, so
// "recompute on change" is inherent: feed a new base, get new derived numbers
// (in the UI, wrap it in useMemo keyed on the base). This is the layer the effects
// system (C13) and equipment/AC (C14–C15) plug into — they contribute additional
// inputs (bonuses, set-values) that ride on top of this pipeline.
import {
  type AbilityKey,
  type ProfLevel,
  SKILLS,
  abilityMod,
  profBonusForLevel,
  profContribution,
} from '../rules/dnd';

export type Abilities = Record<AbilityKey, number>;

export interface DeriveBase {
  abilities: Abilities;
  level: number;
  /** Proficient saving throws (e.g. Barbarian → STR, CON). */
  saveProficiencies?: AbilityKey[];
  /** Skill key → proficiency level (a missing key means 'none'). */
  skillProficiencies?: Record<string, ProfLevel>;
  /** The spellcasting ability, if the character casts. */
  spellcastingAbility?: AbilityKey;
}

export interface SaveDerived {
  mod: number;
  proficient: boolean;
}
export interface SkillDerived {
  mod: number;
  prof: ProfLevel;
  ability: AbilityKey;
}
export interface Derived {
  mods: Record<AbilityKey, number>;
  proficiencyBonus: number;
  saves: Record<AbilityKey, SaveDerived>;
  skills: Record<string, SkillDerived>;
  passives: { perception: number; investigation: number; insight: number };
  initiative: number;
  spell: { ability: AbilityKey; saveDC: number; attack: number } | null;
}

export const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Compute all ability/level/proficiency-derived stats from base inputs. Pure. */
export function derive(base: DeriveBase): Derived {
  const pb = profBonusForLevel(base.level);

  const mods = {} as Record<AbilityKey, number>;
  for (const k of ABILITY_KEYS) mods[k] = abilityMod(base.abilities[k] ?? 10);

  const saveProf = new Set(base.saveProficiencies ?? []);
  const saves = {} as Record<AbilityKey, SaveDerived>;
  for (const k of ABILITY_KEYS) {
    const proficient = saveProf.has(k);
    saves[k] = { mod: mods[k] + (proficient ? pb : 0), proficient };
  }

  const skills: Record<string, SkillDerived> = {};
  for (const s of SKILLS) {
    const prof = base.skillProficiencies?.[s.key] ?? 'none';
    skills[s.key] = { mod: mods[s.ability] + profContribution(prof, pb), prof, ability: s.ability };
  }

  const passives = {
    perception: 10 + (skills.perception?.mod ?? mods.wis),
    investigation: 10 + (skills.investigation?.mod ?? mods.int),
    insight: 10 + (skills.insight?.mod ?? mods.wis),
  };

  const spell = base.spellcastingAbility
    ? {
        ability: base.spellcastingAbility,
        saveDC: 8 + pb + mods[base.spellcastingAbility],
        attack: pb + mods[base.spellcastingAbility],
      }
    : null;

  return { mods, proficiencyBonus: pb, saves, skills, passives, initiative: mods.dex, spell };
}
