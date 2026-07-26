// lib/dnd/systems/pathfinder2e/rules.ts — the pure Pathfinder 2e math (Remaster). Every derived number
// on the PF2 sheet comes from here: proficiency = rank bonus + level (when trained+), the four degrees
// of success, HP, AC, saves, class/spell DCs, and Strike bonuses. No services, fully testable.
import {
  PF2_SAVE_ATTRIBUTE,
  type PF2Rank, type PF2Character, type PF2AttributeKey, type PF2SaveKey, type PF2Skill,
  type PF2Attack,
} from './model';
import { pf2ProficiencyTerm, pf2AdjustLevelDc, type PF2RulesVariants } from './variants';

/** Clamp a level to the PF2 1–20 range. */
export function pf2Level(level: number): number {
  return Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
}

/** Proficiency total: 0 when untrained, else the rank bonus PLUS your level (the PF2 hallmark).
 *
 *  `variants` is the OPTIONAL rules-variant set (GM Core). It is the last parameter and defaults to
 *  undefined = vanilla, so every existing caller keeps its exact vanilla numbers; only a caller that
 *  deliberately threads the character's variants can change them. Under Proficiency Without Level this
 *  drops the level term and gives untrained a −2 — see `variants.ts`. */
export function pf2Proficiency(rank: PF2Rank, level: number, variants?: PF2RulesVariants): number {
  return pf2ProficiencyTerm(rank, level, variants);
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

/** A skill's total modifier: its attribute modifier + proficiency + item bonus, minus the armor check
 *  penalty for the four armor-affected skills (Acrobatics/Athletics/Stealth/Thievery) when one applies.
 *  `armorCheckPenalty` is ≤ 0; it only bites skills flagged `armorPenalty`. */
export function pf2SkillTotal(skill: PF2Skill, level: number, attributes: Record<PF2AttributeKey, number>, armorCheckPenalty = 0, variants?: PF2RulesVariants): number {
  const penalty = skill.armorPenalty ? (armorCheckPenalty || 0) : 0;
  return (attributes[skill.attribute] ?? 0) + pf2Proficiency(skill.rank, level, variants) + (skill.itemBonus || 0) + penalty;
}

/** A saving throw's total: governing attribute modifier + proficiency + item bonus. */
export function pf2SaveTotal(save: PF2SaveKey, char: PF2Character, variants?: PF2RulesVariants): number {
  const s = char.saves[save];
  const attr = char.attributes[PF2_SAVE_ATTRIBUTE[save]] ?? 0;
  return attr + pf2Proficiency(s.rank, char.identity.level, variants) + (s.itemBonus || 0);
}

/** Perception total: Wisdom + proficiency (+ item bonus is folded into the rank's bonus here). */
export function pf2PerceptionTotal(char: PF2Character, variants?: PF2RulesVariants): number {
  return (char.attributes.WIS ?? 0) + pf2Proficiency(char.perception.rank, char.identity.level, variants);
}

/** Max Hit Points: ancestry HP (flat) + (class HP/level + Constitution modifier) × level. */
export function pf2MaxHp(char: PF2Character): number {
  const level = pf2Level(char.identity.level);
  const con = char.attributes.CON ?? 0;
  return Math.max(1, char.combat.ancestryHp + (char.combat.classHpPerLevel + con) * level);
}

/** Armor Class: 10 + capped Dex + armor proficiency + item bonus. Unarmored (dexCap = null) uncapped. */
export function pf2ArmorClass(char: PF2Character, variants?: PF2RulesVariants): number {
  const dex = char.attributes.DEX ?? 0;
  const cappedDex = char.combat.dexCap == null ? dex : Math.min(dex, char.combat.dexCap);
  return 10 + cappedDex + pf2Proficiency(char.combat.armorRank, char.identity.level, variants) + (char.combat.acItemBonus || 0);
}

/** Class DC: 10 + key attribute modifier + class-DC proficiency. */
export function pf2ClassDc(char: PF2Character, variants?: PF2RulesVariants): number {
  return 10 + (char.attributes[char.combat.classDcAttribute] ?? 0) + pf2Proficiency(char.combat.classDcRank, char.identity.level, variants);
}

/** Spell DC (10 + key attribute + proficiency) and spell attack (attribute + proficiency). */
export function pf2SpellDc(char: PF2Character, variants?: PF2RulesVariants): number | null {
  if (char.spellcasting.kind === 'none') return null;
  return 10 + (char.attributes[char.spellcasting.attribute] ?? 0) + pf2Proficiency(char.spellcasting.rank, char.identity.level, variants);
}
export function pf2SpellAttack(char: PF2Character, variants?: PF2RulesVariants): number | null {
  if (char.spellcasting.kind === 'none') return null;
  return (char.attributes[char.spellcasting.attribute] ?? 0) + pf2Proficiency(char.spellcasting.rank, char.identity.level, variants);
}

/** A Strike's attack bonus: attribute + proficiency + weapon item bonus. The Multiple Attack Penalty
 *  is applied on the 2nd/3rd Strike of a turn (agile weapons take −4/−8 instead of −5/−10). */
export function pf2AttackBonus(atk: PF2Attack, level: number, attributes: Record<PF2AttributeKey, number>, variants?: PF2RulesVariants): number {
  return (attributes[atk.attribute] ?? 0) + pf2Proficiency(atk.rank, level, variants) + (atk.weaponBonus || 0);
}
export function pf2MultipleAttackPenalty(strikeIndex: number, agile: boolean): number {
  if (strikeIndex <= 0) return 0;
  const base = agile ? 4 : 5;
  return -Math.min(2, strikeIndex) * base; // −5/−10 (or −4/−8 agile); caps at the 3rd Strike
}

/** A full spellcaster's spell slots by character level (Player Core table). Returns an 11-element array
 *  where index 0 = cantrips (always 5) and index r (1–10) = slots of spell rank r. Every PF2 caster class
 *  (Bard, Cleric, Druid, Oracle, Sorcerer, Witch, Wizard) is a full caster on this progression; class
 *  features (Wizard school, cleric Font, etc.) add EXTRA slots on top and are tracked separately.
 *  Pattern: a new rank opens at level 2r−1 with 2 slots and rises to 3 at level 2r; rank 10 is a single
 *  slot gained at level 19. */
export function pf2SpellSlots(level: number): number[] {
  const L = pf2Level(level);
  const slots = new Array(11).fill(0);
  slots[0] = 5; // cantrips
  for (let r = 1; r <= 10; r++) {
    const opens = 2 * r - 1;
    if (L < opens) continue;
    slots[r] = r === 10 ? 1 : L === opens ? 2 : 3;
  }
  return slots;
}

/** A standard "level-based DC" — the baseline DC for a task of a given level (PF2 GM Core table). */
const LEVEL_DC = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40];
export function pf2LevelBasedDc(level: number, variants?: PF2RulesVariants): number {
  const clamped = Math.max(0, Math.min(20, Math.round(level)));
  // Under Proficiency Without Level the DC scale has to flatten in step with the character numbers that
  // lost their level term, or every level-based task becomes unreachable.
  return pf2AdjustLevelDc(LEVEL_DC[clamped], clamped, variants);
}

/** A derived summary of every headline number, for the sheet header. */
export function pf2Derived(char: PF2Character, variants?: PF2RulesVariants) {
  return {
    // Max HP is untouched by the variants modelled here — Proficiency Without Level changes proficiency
    // terms, not hit points. (The Stamina variant WOULD change this, which is one reason it is not
    // modelled; see variants.ts.)
    maxHp: pf2MaxHp(char),
    ac: pf2ArmorClass(char, variants),
    perception: pf2PerceptionTotal(char, variants),
    classDc: pf2ClassDc(char, variants),
    spellDc: pf2SpellDc(char, variants),
    spellAttack: pf2SpellAttack(char, variants),
    saves: {
      Fortitude: pf2SaveTotal('Fortitude', char, variants),
      Reflex: pf2SaveTotal('Reflex', char, variants),
      Will: pf2SaveTotal('Will', char, variants),
    } as Record<PF2SaveKey, number>,
  };
}
