// lib/dnd/systems/intuitive-games/rules.ts — the pure Intuitive Games rules math (full-sheet Slice 2).
// This is the anti-wrong-mechanics core: every derived number on the sheet comes from here, grounded in the
// system's own rules (from system-rules.ts): PROFICIENCY = LEVEL, three saves (rank + level + governing
// attribute), skill totals (ranks + proficiency-if-trained + misc + attribute), attack + damage, sneak
// attack, and PF2-style DEGREES OF SUCCESS (±10). No services, no randomness — fully deterministic + testable.
import type { IGCharacter, IGSkill, IGSaveKey, IGAbilityKey, IGSave, IGAttack } from './model';
import { IG_SAVE_ABILITY } from './model';

/** Ability modifier — floor((score − 10) / 2), the same curve as the template's score→mod columns. */
export function igAbilityMod(score: number): number {
  return Math.floor(((Number(score) || 10) - 10) / 2);
}

/** Proficiency in Intuitive Games IS your level (there is no separate proficiency-bonus table). */
export function igProficiency(level: number): number {
  return Math.max(1, Math.round(Number(level) || 1));
}

/** A save's total = proficiency rank + level + the governing ability modifier + misc. At level 1 with base
 *  abilities and rank 0 this is 1, matching the template's default Fortitude/Reflex/Will of 1. */
export function igSaveTotal(save: IGSave, level: number, abilityMod: number): number {
  return (Number(save?.rank) || 0) + igProficiency(level) + abilityMod + (Number(save?.misc) || 0);
}

/** All three saves resolved for a character (Fort/Con, Reflex/Dex, Will/Wis). */
export function igSaves(char: IGCharacter): Record<IGSaveKey, number> {
  const out = {} as Record<IGSaveKey, number>;
  for (const k of Object.keys(char.combat.saves) as IGSaveKey[]) {
    const mod = igAbilityMod(char.abilities[IG_SAVE_ABILITY[k]]);
    out[k] = igSaveTotal(char.combat.saves[k], char.identity.level, mod);
  }
  return out;
}

/** A skill's total = ranks + (trained ? proficiency : 0) + misc + governing ability modifier. */
export function igSkillTotal(skill: IGSkill, level: number, abilityMod: number): number {
  const prof = skill.proficient ? igProficiency(level) : 0;
  return (Number(skill.ranks) || 0) + prof + (Number(skill.misc) || 0) + abilityMod;
}

/** Resolve every skill on the character to its total. */
export function igSkillTotals(char: IGCharacter): { name: string; total: number; combat: boolean }[] {
  return char.skills.map((s) => ({
    name: s.name,
    combat: !!s.combat,
    total: igSkillTotal(s, char.identity.level, igAbilityMod(char.abilities[s.ability])),
  }));
}

/** Ranks spent so far (Sheet 4 budget check). */
export function igRanksSpent(char: IGCharacter): number {
  return char.skills.reduce((n, s) => n + (Number(s.ranks) || 0), 0);
}

/** An attack's to-hit bonus = ability modifier + (proficient ? proficiency : 0) + Weapon Focus (+1) + misc. */
export function igAttackBonus(atk: IGAttack, level: number, abilityMod: number): number {
  return abilityMod + (atk.proficient ? igProficiency(level) : 0) + (atk.weaponFocus ? 1 : 0) + (Number(atk.bonusToHit) || 0);
}

/** An attack's flat damage bonus = ability modifier (melee) + Weapon Specialization (+2) + bonus damage.
 *  Returns the flat bonus added to the weapon's damage die (`atk.damage`). */
export function igDamageBonus(atk: IGAttack, abilityMod: number): number {
  const strMelee = atk.ability === 'STR';
  return (strMelee ? abilityMod : 0) + (atk.weaponSpecialization ? 2 : 0) + (Number(atk.bonusDamage) || 0);
}

/** Resolve an attack for display: "1d6+4" style damage string + the to-hit bonus. */
export function igResolveAttack(char: IGCharacter, atk: IGAttack): { toHit: number; damage: string } {
  const mod = igAbilityMod(char.abilities[atk.ability]);
  const toHit = igAttackBonus(atk, char.identity.level, mod);
  const dmgBonus = igDamageBonus(atk, mod);
  const die = atk.damage || '1d6';
  const damage = dmgBonus === 0 ? die : `${die}${dmgBonus > 0 ? '+' : ''}${dmgBonus}`;
  return { toHit, damage };
}

export type IGDegree = 'critical-success' | 'success' | 'failure' | 'critical-failure';

/**
 * Degrees of success (Intuitive Games / PF2-style): a total that beats the DC by 10+ is a critical success,
 * meeting/beating it is a success, missing is a failure, and missing by 10+ is a critical failure. A natural
 * 20 shifts the degree one step up, a natural 1 one step down (pass the d20 face as `natural`).
 */
export function igDegreeOfSuccess(total: number, dc: number, natural?: number): IGDegree {
  let step = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1; // 3=crit succ … 0=crit fail
  if (natural === 20) step = Math.min(3, step + 1);
  else if (natural === 1) step = Math.max(0, step - 1);
  return (['critical-failure', 'failure', 'success', 'critical-success'] as const)[step];
}

/** Max HP from the template's model: Class+Background HP + Constitution modifier × level. */
export function igMaxHp(char: IGCharacter): number {
  return Math.max(0, (Number(char.combat.hitPoints.classBackgroundHp) || 0) + igAbilityMod(char.abilities.CON) * char.identity.level);
}

/** Current HP = max − lethal damage taken. */
export function igCurrentHp(char: IGCharacter): number {
  return igMaxHp(char) - (Number(char.combat.hitPoints.lethal) || 0);
}

/** A tidy derived summary the sheet/Summary tab reads (all pure). */
export function igDerived(char: IGCharacter) {
  const mods = {} as Record<IGAbilityKey, number>;
  for (const k of Object.keys(char.abilities) as IGAbilityKey[]) mods[k] = igAbilityMod(char.abilities[k]);
  return {
    level: char.identity.level,
    proficiency: igProficiency(char.identity.level),
    abilityMods: mods,
    saves: igSaves(char),
    maxHp: igMaxHp(char),
    currentHp: igCurrentHp(char),
    ranksSpent: igRanksSpent(char),
    skills: igSkillTotals(char),
  };
}
