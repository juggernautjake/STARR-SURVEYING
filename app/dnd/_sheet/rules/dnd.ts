// D&D 2024 core math helpers.

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export const ABILITIES: { key: AbilityKey; label: string; full: string }[] = [
  { key: 'str', label: 'STR', full: 'Strength' },
  { key: 'dex', label: 'DEX', full: 'Dexterity' },
  { key: 'con', label: 'CON', full: 'Constitution' },
  { key: 'int', label: 'INT', full: 'Intelligence' },
  { key: 'wis', label: 'WIS', full: 'Wisdom' },
  { key: 'cha', label: 'CHA', full: 'Charisma' },
]

export type ProfLevel = 'none' | 'proficient' | 'expertise'

export interface SkillDef {
  key: string
  label: string
  ability: AbilityKey
}

export const SKILLS: SkillDef[] = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
  { key: 'animal', label: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', label: 'Arcana', ability: 'int' },
  { key: 'athletics', label: 'Athletics', ability: 'str' },
  { key: 'deception', label: 'Deception', ability: 'cha' },
  { key: 'history', label: 'History', ability: 'int' },
  { key: 'insight', label: 'Insight', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { key: 'investigation', label: 'Investigation', ability: 'int' },
  { key: 'medicine', label: 'Medicine', ability: 'wis' },
  { key: 'nature', label: 'Nature', ability: 'int' },
  { key: 'perception', label: 'Perception', ability: 'wis' },
  { key: 'performance', label: 'Performance', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { key: 'religion', label: 'Religion', ability: 'int' },
  { key: 'sleight', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', label: 'Stealth', ability: 'dex' },
  { key: 'survival', label: 'Survival', ability: 'wis' },
]

/** Ability modifier from a raw score (floor((score-10)/2)). */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** Proficiency bonus for a given total character level (2024/5e table). */
export function profBonusForLevel(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4)
}

/** Format a signed modifier, e.g. 3 -> "+3", -1 -> "−1" (true minus sign). */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`
}

/** Proficiency contribution given a prof level and prof bonus. */
export function profContribution(prof: ProfLevel, pb: number): number {
  if (prof === 'proficient') return pb
  if (prof === 'expertise') return pb * 2
  return 0
}

/** Rage uses per long rest by level (docx table for 1-5, 2024 RAW beyond). BARBARIAN-ONLY —
 *  only a character whose build actually grants Rage should call this. */
export function ragesForLevel(level: number): number {
  if (level <= 2) return 2
  if (level === 3) return 3
  if (level <= 11) return 4
  if (level <= 16) return 5
  return 6
}

/** Rage damage bonus by level: +2, then +3 at 9, +4 at 16 (2024). BARBARIAN-ONLY — other
 *  characters express a form/transformation damage bonus via `levelRules.formDamageByLevel`. */
export function rageDamageForLevel(level: number): number {
  if (level >= 16) return 4
  if (level >= 9) return 3
  return 2
}

/**
 * Fixed-average max HP for ANY class: the full hit die at level 1, then the die's fixed
 * average (die/2 + 1) per level after, plus the CON modifier every level, plus any flat
 * per-level bonus (e.g. the Tough feat's +2/level).
 *
 * Generic on purpose — `hitDie` comes from the character's own `combat.hitDiceSize`, so a
 * d8 Warlock and a d10 Pugilist get their own HP, not a d12 barbarian's.
 */
export function maxHpForLevel(level: number, conMod: number, hitDie = 8, bonusPerLevel = 0): number {
  const lv = Math.max(1, level)
  const perLevelAvg = Math.floor(hitDie / 2) + 1
  return hitDie + conMod + (lv - 1) * (perLevelAvg + conMod) + bonusPerLevel * lv
}

/** Resolve a walking speed from a character's own speed ladder (highest entry at or below
 *  `level`). Characters without a ladder keep whatever speed their sheet already has. */
export function speedForLevel(level: number, ladder?: { level: number; speed: number }[], fallback = 30): number {
  if (!ladder?.length) return fallback
  return ladder.reduce((acc, e) => (level >= e.level && e.speed > acc ? e.speed : acc), fallback)
}

export const MAX_BUILT_LEVEL = 20
