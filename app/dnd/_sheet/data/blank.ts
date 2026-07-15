// app/dnd/_sheet/data/blank.ts — a valid EMPTY character (Phase G1). New characters
// (PCs and NPCs) are seeded with this so the sheet renders a real blank sheet on the
// shared engine instead of falling back to the bundled Lazzuh data (a C3 limitation).
// Pure data — safe to import server-side (the character-create API seeds it).
import type { Character } from '../types';
import { ABILITIES, SKILLS, type AbilityKey } from '../rules/dnd';

const ABILITY_KEYS = ABILITIES.map((a) => a.key) as AbilityKey[];

export function blankCharacter(name: string): Character {
  const abilities = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10])) as Record<AbilityKey, number>;
  const saves = Object.fromEntries(ABILITY_KEYS.map((k) => [k, { proficient: false, misc: 0 }])) as Character['saves'];
  const skills = Object.fromEntries(SKILLS.map((s) => [s.key, { prof: 'none', misc: 0 }])) as Character['skills'];

  return {
    meta: { name, kicker: '', role: '', species: '', className: '', subclass: '', level: 1, chips: [] },
    inspiration: false,
    profBonusOverride: null,
    tempOverrides: {},
    abilities,
    primaryAbilities: [],
    saves,
    skills,
    customSkills: [],
    combat: {
      ac: 10,
      acNote: '',
      speed: 30,
      speedNote: '',
      initiativeMisc: 0,
      maxHp: 1,
      currentHp: 1,
      tempHp: 0,
      hitDiceSize: 8,
      hitDiceTotal: 1,
      hitDiceRemaining: 1,
      deathSuccess: 0,
      deathFail: 0,
      deathSaveBonus: 0,
      rageDamageBonus: 0,
      saveDCOverride: null,
      transformActive: false,
      transformTurnsLeft: 0,
      transformsThisRest: 0,
      exhaustion: 0,
      abilityUses: {},
    },
    resources: [],
    forms: [],
    activeFormId: 'base',
    attacks: [],
    features: [],
    progression: [],
    inventory: [],
    currency: { credits: 0, harmonyte: 0, scrip: 0 },
    bio: { intro: [], appearance: [], personality: [], background: '', playTips: [] },
    balance: { synergies: [], weaknesses: [] },
    dmNote: '',
  };
}

// Merge a stored/AI-built (possibly partial) character over a complete blank so EVERY field the
// sheet tabs read exists. AI/generic/partial characters often omit arrays (attacks, forms,
// inventory, progression, resources, customSkills, meta.chips, balance…), which made tabs crash
// with "Cannot read properties of undefined (reading 'map')". Normalizing on load prevents that.
export function normalizeCharacter(d: unknown): Character {
  const src = (d && typeof d === 'object' ? d : {}) as Partial<Character> & Record<string, unknown>;
  const base = blankCharacter((src.meta?.name as string) || (src as { name?: string }).name || 'Character');
  const arr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  const meta = { ...base.meta, ...(src.meta ?? {}) };
  meta.chips = arr(src.meta?.chips, base.meta.chips);
  const combat = { ...base.combat, ...(src.combat ?? {}) };
  if (!combat.abilityUses || typeof combat.abilityUses !== 'object') combat.abilityUses = {};
  const balance = {
    synergies: arr(src.balance?.synergies, base.balance.synergies),
    weaknesses: arr(src.balance?.weaknesses, base.balance.weaknesses),
  };
  return {
    ...base,
    ...src,
    meta,
    combat,
    balance,
    bio: { ...base.bio, ...(src.bio ?? {}) },
    currency: { ...base.currency, ...(src.currency ?? {}) },
    abilities: { ...base.abilities, ...(src.abilities ?? {}) },
    saves: { ...base.saves, ...(src.saves ?? {}) },
    skills: { ...base.skills, ...(src.skills ?? {}) },
    tempOverrides: (src.tempOverrides ?? base.tempOverrides) as Character['tempOverrides'],
    primaryAbilities: arr(src.primaryAbilities, base.primaryAbilities),
    customSkills: arr(src.customSkills, base.customSkills),
    resources: arr(src.resources, base.resources),
    forms: arr(src.forms, base.forms),
    attacks: arr(src.attacks, base.attacks),
    features: arr(src.features, base.features),
    progression: arr(src.progression, base.progression),
    inventory: arr(src.inventory, base.inventory),
  };
}
