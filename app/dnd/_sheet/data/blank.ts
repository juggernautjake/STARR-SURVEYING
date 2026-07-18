// app/dnd/_sheet/data/blank.ts — a valid EMPTY character (Phase G1). New characters
// (PCs and NPCs) are seeded with this so the sheet renders a real blank sheet on the
// shared engine instead of falling back to the bundled Lazzuh data (a C3 limitation).
// Pure data — safe to import server-side (the character-create API seeds it).
import type { Character } from '../types';
import { ABILITIES, SKILLS, type AbilityKey } from '../rules/dnd';
import { defaultCurrencies } from '@/lib/dnd/currency';

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
      formDamageBonus: 0,
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
    currencies: defaultCurrencies(),
    bio: { intro: [], appearance: [], personality: [], background: '', playTips: [] },
    balance: { synergies: [], weaknesses: [] },
    dmNote: '',
    customFields: {},
  };
}

// Merge a stored/AI-built (possibly partial) character over a complete blank so EVERY field the
// sheet tabs read exists. AI/generic/partial characters often omit arrays (attacks, forms,
// inventory, progression, resources, customSkills, meta.chips, balance…), which made tabs crash
// with "Cannot read properties of undefined (reading 'map')". Normalizing on load prevents that.
/**
 * Migrate a stored sheet off the old barbarian-specific field names. The engine used to
 * bake Lazzuh's schema into every character; these keys still exist in rows saved before
 * the rename, so map them forward (new value wins if both are somehow present):
 *   combat.rageDamageBonus → combat.formDamageBonus
 *   progression[].rages    → progression[].col3
 *   progression[].rageDmg  → progression[].col4
 *   attacks[].rageable     → attacks[].formBoosted
 */
function migrateLegacyFields(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...src };

  const combat = out.combat as (Record<string, unknown> & { formDamageBonus?: number }) | undefined;
  if (combat && typeof combat === 'object') {
    const legacy = (combat as { rageDamageBonus?: unknown }).rageDamageBonus;
    const next = { ...combat };
    if (next.formDamageBonus == null && typeof legacy === 'number') next.formDamageBonus = legacy;
    delete (next as { rageDamageBonus?: unknown }).rageDamageBonus;
    out.combat = next;
  }

  if (Array.isArray(out.progression)) {
    out.progression = (out.progression as Record<string, unknown>[]).map((r) => {
      if (!r || typeof r !== 'object') return r;
      const next = { ...r };
      if (next.col3 == null && typeof next.rages === 'string') next.col3 = next.rages;
      if (next.col4 == null && typeof next.rageDmg === 'string') next.col4 = next.rageDmg;
      delete next.rages;
      delete next.rageDmg;
      return next;
    });
  }

  if (Array.isArray(out.attacks)) {
    out.attacks = (out.attacks as Record<string, unknown>[]).map((a) => {
      if (!a || typeof a !== 'object') return a;
      const next = { ...a };
      if (next.formBoosted == null && typeof next.rageable === 'boolean') next.formBoosted = next.rageable;
      delete next.rageable;
      return next;
    });
  }

  return out;
}

export function normalizeCharacter(d: unknown): Character {
  const raw = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  const src = migrateLegacyFields(raw) as Partial<Character> & Record<string, unknown>;
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
    // Only NEW sheets (seeded from blankCharacter, so stored WITH `currencies`) use the flexible money
    // model; legacy stored sheets have no `currencies` and keep their fixed `currency` display. So we
    // preserve exactly what was stored rather than letting the base default leak onto old characters.
    currencies: Array.isArray(src.currencies) ? src.currencies : undefined,
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
    // AI-widget values (Slice 11) — always an object so widget binding never crashes.
    customFields: (src.customFields && typeof src.customFields === 'object' ? src.customFields : {}) as Character['customFields'],
  };
}
