// lib/dnd/systems/intuitive-games/model.ts — the typed Intuitive Games character model (full-sheet Slice 2).
// Captures every tab of the Character Sheet Template: identity/intro, ability scores, skills (ranks), the
// three saves, combat (attacks, HP, DR, stances, conditions, defensive power), feats/powers, weapon groups,
// equipment slots, and the companion creature. Stored as a sidecar on `character.data.ig`; the pure math
// lives in rules.ts. This is data only (no services) so it works everywhere and is fully testable.

export const IG_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type IGAbilityKey = typeof IG_ABILITIES[number];

export const IG_SAVES = ['Fortitude', 'Reflex', 'Will'] as const;
export type IGSaveKey = typeof IG_SAVES[number];
/** Which ability governs each save (Fort/Con, Reflex/Dex, Will/Wis). */
export const IG_SAVE_ABILITY: Record<IGSaveKey, IGAbilityKey> = { Fortitude: 'CON', Reflex: 'DEX', Will: 'WIS' };

// ── Sheet 1: Character Introduction ──────────────────────────────────────────────────────────────────
export interface IGIdentity {
  name: string;
  level: number;
  className: string;
  subclass: string;
  specialization: string;
  background: string;
  ancestry: string;
  alignment: string;
  culture: string;
  religion: string;
  values: string;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  age: string;
  ageCategory: string;
  games: string;
  commonLanguages: string[];
  uncommonLanguages: string[];
  tools: string[];
  vehicles: string[];
  photoUrl: string;
  bio: string;
}

// ── Sheet 4: Skills — a rank per skill; total is derived in rules.ts. ─────────────────────────────────
export interface IGSkill {
  name: string;
  ability: IGAbilityKey;
  ranks: number;
  proficient: boolean;
  misc: number;
  /** Combat skills (Dirty Trick, Grapple, …) are tracked separately from general skills. */
  combat?: boolean;
}

// ── Sheet 3: Combat ──────────────────────────────────────────────────────────────────────────────────
export interface IGAttack {
  id: string;
  name: string;
  weaponType: string;
  properties: string;
  proficient: boolean;
  weaponFocus: boolean;
  weaponSpecialization: boolean;
  /** Ability used for the attack roll + (STR) melee damage. */
  ability: IGAbilityKey;
  bonusToHit: number;
  bonusDamage: number;
  /** Base weapon damage die, e.g. "1d6". */
  damage: string;
}

export interface IGSave { rank: number; misc: number; }

export interface IGCombat {
  attacks: IGAttack[];
  hitPoints: { classBackgroundHp: number; nonlethal: number; lethal: number };
  damageReduction: number;
  saves: Record<IGSaveKey, IGSave>;
  stances: string[];
  situationalBonuses: string[];
  defensivePower: string;
  conditions: string[];
  miscBonuses: string;
}

// ── Sheet 6: Equipment ───────────────────────────────────────────────────────────────────────────────
export interface IGEquipment {
  arms: string;
  head: string;
  torso: string;
  legs: string;
  hands: string;
  other: string[];
}

// ── Sheet 7: Companion Creature ──────────────────────────────────────────────────────────────────────
export interface IGCompanion {
  name: string;
  creatureType: string;
  abilities: Record<IGAbilityKey, number>;
  skills: IGSkill[];
  attacks: IGAttack[];
  powers: string[];
  conditions: string[];
  hitPoints: number;
  saves: Record<IGSaveKey, IGSave>;
  damageReduction: number;
  movement: string;
  resistances: string;
  vulnerabilities: string;
  situationalBonuses: string[];
  notes: string;
}

// ── The whole character ──────────────────────────────────────────────────────────────────────────────
export interface IGCharacter {
  identity: IGIdentity;
  abilities: Record<IGAbilityKey, number>;
  skills: IGSkill[];
  /** Sheet 4 rank budget. */
  skillRanksAvailable: number;
  feats: { general: string[]; combat: string[] };
  powers: string[];
  /** Why a held element is outside what this character's class and level grant, keyed by its
   *  name (Area MV, IG S3). Present only on custom characters and DM grants — a vanilla one is
   *  refused outright, so it never accumulates entries.
   *
   *  Chosen over widening `powers` to `{ name, offRules? }[]`: this is purely ADDITIVE, so every
   *  IG character already in the database stays valid and no migration is needed, where the array
   *  change would touch the builder, the sheet, the digest and provenance in one go. The cost is
   *  that the marker lives beside the list rather than on the element; for an optional annotation
   *  that is the right trade.
   *
   *  NOT the same axis as `igIsVanilla`/provenance, which ask whether content exists in the book.
   *  This asks whether it was legal for THIS character. */
  offRules?: Record<string, string>;
  stances: string[];
  weaponGroups: string[];
  combat: IGCombat;
  equipment: IGEquipment;
  companion: IGCompanion | null;
  notes: string;
}

const zeroSaves = (): Record<IGSaveKey, IGSave> => ({ Fortitude: { rank: 0, misc: 0 }, Reflex: { rank: 0, misc: 0 }, Will: { rank: 0, misc: 0 } });
const baseAbilities = (): Record<IGAbilityKey, number> => ({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 });

/** A valid, empty Intuitive Games character (level 1, base-10 abilities, no picks). */
export function blankIGCharacter(name: string): IGCharacter {
  return {
    identity: {
      name, level: 1, className: '', subclass: '', specialization: '', background: '', ancestry: '',
      alignment: '', culture: '', religion: '', values: '', height: '', weight: '', eyes: '', hair: '',
      age: '', ageCategory: '', games: '', commonLanguages: [], uncommonLanguages: [], tools: [], vehicles: [],
      photoUrl: '', bio: '',
    },
    abilities: baseAbilities(),
    skills: [],
    skillRanksAvailable: 2,
    feats: { general: [], combat: [] },
    powers: [],
    stances: [],
    weaponGroups: [],
    combat: {
      attacks: [], hitPoints: { classBackgroundHp: 0, nonlethal: 0, lethal: 0 }, damageReduction: 0,
      saves: zeroSaves(), stances: [], situationalBonuses: [], defensivePower: '', conditions: [], miscBonuses: '',
    },
    equipment: { arms: '', head: '', torso: '', legs: '', hands: '', other: [] },
    companion: null,
    notes: '',
  };
}

/** A valid, empty companion creature (Sheet 7). Companions default to INT 6 (−2), like the template. */
export function blankIGCompanion(name: string, creatureType = ''): IGCompanion {
  return {
    name, creatureType,
    abilities: { STR: 10, DEX: 10, CON: 10, INT: 6, WIS: 10, CHA: 10 },
    skills: [], attacks: [], powers: [], conditions: [], hitPoints: 10, saves: zeroSaves(),
    damageReduction: 0, movement: '', resistances: '', vulnerabilities: '', situationalBonuses: [], notes: '',
  };
}

/** Narrowing guard: is this data a plausible IGCharacter sidecar? */
export function isIGCharacter(v: unknown): v is IGCharacter {
  return !!v && typeof v === 'object' && 'identity' in v && 'abilities' in v && 'combat' in v;
}
