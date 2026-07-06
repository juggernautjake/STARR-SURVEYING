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
