// lib/dnd/systems/pathfinder2e/rules.ts — the pure Pathfinder 2e math (Remaster). Every derived number
// on the PF2 sheet comes from here: proficiency = rank bonus + level (when trained+), the four degrees
// of success, HP, AC, saves, class/spell DCs, and Strike bonuses. No services, fully testable.
import {
  PF2_RANK_BONUS, PF2_SAVE_ATTRIBUTE,
  type PF2Rank, type PF2Character, type PF2AttributeKey, type PF2SaveKey, type PF2Skill,
  type PF2Attack,
} from './model';

/** Clamp a level to the PF2 1–20 range. */
export function pf2Level(level: number): number {
  return Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
}

/** Proficiency total: 0 when untrained, else the rank bonus PLUS your level (the PF2 hallmark). */
export function pf2Proficiency(rank: PF2Rank, level: number): number {
  if (rank === 'untrained') return 0;
  return PF2_RANK_BONUS[rank] + pf2Level(level);
}

/** The four degrees of success: beat the DC by 10 = crit success; meet = success; miss by 10 = crit
 *  fail; else fail. A natural 20 steps up one degree, a natural 1 steps down one. */
export type PF2Degree = 'critical-failure' | 'failure' | 'success' | 'critical-success';
export function pf2Degree(total: number, dc: number, natural?: number): PF2Degree {
  let step = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (natural === 20) step = Math.min(3, step + 1);
  else if (natural === 1) step = Math.max(0, step - 1);
  return (['critical-failure', 'failure', 'success', 'critical-success'] as const)[step];
}

/** A skill's total modifier: its attribute modifier + proficiency + item bonus. */
export function pf2SkillTotal(skill: PF2Skill, level: number, attributes: Record<PF2AttributeKey, number>): number {
  return (attributes[skill.attribute] ?? 0) + pf2Proficiency(skill.rank, level) + (skill.itemBonus || 0);
}

/** A saving throw's total: governing attribute modifier + proficiency + item bonus. */
export function pf2SaveTotal(save: PF2SaveKey, char: PF2Character): number {
  const s = char.saves[save];
  const attr = char.attributes[PF2_SAVE_ATTRIBUTE[save]] ?? 0;
  return attr + pf2Proficiency(s.rank, char.identity.level) + (s.itemBonus || 0);
}

/** Perception total: Wisdom + proficiency (+ item bonus is folded into the rank's bonus here). */
export function pf2PerceptionTotal(char: PF2Character): number {
  return (char.attributes.WIS ?? 0) + pf2Proficiency(char.perception.rank, char.identity.level);
}

/** Max Hit Points: ancestry HP (flat) + (class HP/level + Constitution modifier) × level. */
export function pf2MaxHp(char: PF2Character): number {
  const level = pf2Level(char.identity.level);
  const con = char.attributes.CON ?? 0;
  return Math.max(1, char.combat.ancestryHp + (char.combat.classHpPerLevel + con) * level);
}

/** Armor Class: 10 + capped Dex + armor proficiency + item bonus. Unarmored (dexCap = null) uncapped. */
export function pf2ArmorClass(char: PF2Character): number {
  const dex = char.attributes.DEX ?? 0;
  const cappedDex = char.combat.dexCap == null ? dex : Math.min(dex, char.combat.dexCap);
  return 10 + cappedDex + pf2Proficiency(char.combat.armorRank, char.identity.level) + (char.combat.acItemBonus || 0);
}

/** Class DC: 10 + key attribute modifier + class-DC proficiency. */
export function pf2ClassDc(char: PF2Character): number {
  return 10 + (char.attributes[char.combat.classDcAttribute] ?? 0) + pf2Proficiency(char.combat.classDcRank, char.identity.level);
}

/** Spell DC (10 + key attribute + proficiency) and spell attack (attribute + proficiency). */
export function pf2SpellDc(char: PF2Character): number | null {
  if (char.spellcasting.kind === 'none') return null;
  return 10 + (char.attributes[char.spellcasting.attribute] ?? 0) + pf2Proficiency(char.spellcasting.rank, char.identity.level);
}
export function pf2SpellAttack(char: PF2Character): number | null {
  if (char.spellcasting.kind === 'none') return null;
  return (char.attributes[char.spellcasting.attribute] ?? 0) + pf2Proficiency(char.spellcasting.rank, char.identity.level);
}

/** A Strike's attack bonus: attribute + proficiency + weapon item bonus. The Multiple Attack Penalty
 *  is applied on the 2nd/3rd Strike of a turn (agile weapons take −4/−8 instead of −5/−10). */
export function pf2AttackBonus(atk: PF2Attack, level: number, attributes: Record<PF2AttributeKey, number>): number {
  return (attributes[atk.attribute] ?? 0) + pf2Proficiency(atk.rank, level) + (atk.weaponBonus || 0);
}
export function pf2MultipleAttackPenalty(strikeIndex: number, agile: boolean): number {
  if (strikeIndex <= 0) return 0;
  const base = agile ? 4 : 5;
  return -Math.min(2, strikeIndex) * base; // −5/−10 (or −4/−8 agile); caps at the 3rd Strike
}

/** A standard "level-based DC" — the baseline DC for a task of a given level (PF2 GM Core table). */
const LEVEL_DC = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40];
export function pf2LevelBasedDc(level: number): number {
  return LEVEL_DC[Math.max(0, Math.min(20, Math.round(level)))];
}

/** A derived summary of every headline number, for the sheet header. */
export function pf2Derived(char: PF2Character) {
  return {
    maxHp: pf2MaxHp(char),
    ac: pf2ArmorClass(char),
    perception: pf2PerceptionTotal(char),
    classDc: pf2ClassDc(char),
    spellDc: pf2SpellDc(char),
    spellAttack: pf2SpellAttack(char),
    saves: {
      Fortitude: pf2SaveTotal('Fortitude', char),
      Reflex: pf2SaveTotal('Reflex', char),
      Will: pf2SaveTotal('Will', char),
    } as Record<PF2SaveKey, number>,
  };
}
