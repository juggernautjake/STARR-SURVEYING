// lib/dnd/classes/custom-ai.ts — the AI-assist input path for the homebrew class builder (Slice 5).
//
// "Describe the class in prose → a draft the player edits." This is the pure, testable core: a
// structured-output tool schema the model fills, and a defensive normalizer that turns the model's JSON
// (or any hand-entered object) into a valid CustomClassDraft. The draft then goes through the EXISTING
// engine — buildCustomClass + reviewCustomClass (lib/dnd/classes/custom.ts) — so the AI never bypasses
// the validation/balance checks; it just proposes, the engine adjudicates, and the player edits.
import type { CustomClassDraft, CustomFeat } from './custom';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const HIT_DICE = [6, 8, 10, 12];

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const abilities = (v: unknown): AbilityKey[] => {
  const set = new Set<AbilityKey>();
  if (Array.isArray(v)) for (const x of v) { const k = str(x).toLowerCase(); if ((ABILITY_KEYS as string[]).includes(k)) set.add(k as AbilityKey); }
  return [...set];
};
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};
const nearestHitDie = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 8;
  return HIT_DICE.reduce((best, d) => (Math.abs(d - n) < Math.abs(best - n) ? d : best), HIT_DICE[0]);
};

/**
 * Normalize an arbitrary object (an LLM tool call, or hand-entered JSON) into a valid CustomClassDraft.
 * Defensive: clamps the hit die + levels, keeps only real ability keys, drops nameless features, and
 * fills the fields the engine requires so `buildCustomClass` never throws on a partial input. The result
 * is a DRAFT — the player is expected to review + edit it, and reviewCustomClass flags what's off.
 */
export function parseCustomClassDraft(raw: unknown, system: string): CustomClassDraft {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const primaryAbility = abilities(o.primaryAbility);
  const key = primaryAbility[0] ?? 'str';
  const savingThrows = abilities(o.savingThrows);
  const skills = o.skillChoices && typeof o.skillChoices === 'object' ? o.skillChoices as Record<string, unknown> : {};

  const features = (Array.isArray(o.features) ? o.features : [])
    .map((f) => (f && typeof f === 'object' ? f as Record<string, unknown> : {}))
    .filter((f) => str(f.name))
    .map((f) => ({ level: clampInt(f.level, 1, 20, 1), name: str(f.name), body: str(f.body) }))
    .sort((a, b) => a.level - b.level);

  const casterRaw = o.caster && typeof o.caster === 'object' ? o.caster as Record<string, unknown> : null;
  const casterKind = str(casterRaw?.kind).toLowerCase();
  const caster = casterRaw && ['full', 'half', 'third', 'pact'].includes(casterKind)
    ? { kind: casterKind as 'full' | 'half' | 'third' | 'pact', ability: abilities(casterRaw.ability)[0] ?? key, preparedRule: str(casterRaw.preparedRule) || undefined }
    : undefined;

  const subclassLevel = clampInt(o.subclassLevel, 1, 20, 3);

  return {
    name: str(o.name) || 'Homebrew Class',
    system,
    description: str(o.description),
    hitDie: nearestHitDie(o.hitDie),
    primaryAbility: primaryAbility.length ? primaryAbility : [key],
    savingThrows: savingThrows.length ? savingThrows : [key],
    skillChoices: { count: clampInt(skills.count, 0, 10, 2), from: strArr(skills.from) },
    armorProficiencies: strArr(o.armorProficiencies),
    weaponProficiencies: strArr(o.weaponProficiencies),
    toolProficiencies: strArr(o.toolProficiencies),
    subclassLevel,
    subclassLabel: str(o.subclassLabel) || 'Subclass',
    asiLevels: (Array.isArray(o.asiLevels) ? o.asiLevels.map((x) => clampInt(x, 1, 20, 4)) : undefined),
    caster,
    features,
    startingEquipment: strArr(o.startingEquipment),
    authorName: str(o.authorName) || undefined,
    basedOn: str(o.basedOn) || undefined,
  };
}

/** The structured-output tool the model fills with a homebrew class draft. */
export const CUSTOM_CLASS_TOOL = {
  name: 'homebrew_class',
  description: 'A complete homebrew class DRAFT (the player will review + edit it). Use 5e-style ability ' +
    'keys (str/dex/con/int/wis/cha). Give a d6/d8/d10/d12 hit die, save proficiencies, a subclass level + ' +
    'label, and level-by-level features. Do not add the Ability Score Improvement or subclass-choice ' +
    'features — the engine inserts those automatically.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      hitDie: { type: 'integer', enum: HIT_DICE },
      primaryAbility: { type: 'array', items: { type: 'string', enum: ABILITY_KEYS } },
      savingThrows: { type: 'array', items: { type: 'string', enum: ABILITY_KEYS } },
      skillChoices: { type: 'object', properties: { count: { type: 'integer', minimum: 0, maximum: 10 }, from: { type: 'array', items: { type: 'string' } } } },
      armorProficiencies: { type: 'array', items: { type: 'string' } },
      weaponProficiencies: { type: 'array', items: { type: 'string' } },
      toolProficiencies: { type: 'array', items: { type: 'string' } },
      subclassLevel: { type: 'integer', minimum: 1, maximum: 20 },
      subclassLabel: { type: 'string', description: 'What the subclass is called, e.g. "Sacred Oath", "Roguish Archetype".' },
      caster: { type: 'object', properties: { kind: { type: 'string', enum: ['full', 'half', 'third', 'pact'] }, ability: { type: 'string', enum: ABILITY_KEYS }, preparedRule: { type: 'string' } } },
      features: { type: 'array', items: { type: 'object', properties: { level: { type: 'integer', minimum: 1, maximum: 20 }, name: { type: 'string' }, body: { type: 'string' } }, required: ['level', 'name', 'body'] } },
      startingEquipment: { type: 'array', items: { type: 'string' } },
      basedOn: { type: 'string', description: 'An existing class this is inspired by (recorded for DM review, not enforced).' },
    },
    required: ['name', 'hitDie', 'primaryAbility', 'savingThrows', 'subclassLevel', 'subclassLabel', 'features'],
  },
};

// ── Homebrew subclass ────────────────────────────────────────────────────────────────────────────
/** Normalize an object into the buildCustomSubclass input. `classKey` ties it to an existing class. */
export function parseCustomSubclassInput(raw: unknown, system: string): {
  name: string; classKey: string; system: string; description: string;
  features: { level: number; name: string; body: string }[]; authorName?: string;
} {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const features = (Array.isArray(o.features) ? o.features : [])
    .map((f) => (f && typeof f === 'object' ? f as Record<string, unknown> : {}))
    .filter((f) => str(f.name))
    .map((f) => ({ level: clampInt(f.level, 1, 20, 3), name: str(f.name), body: str(f.body) }))
    .sort((a, b) => a.level - b.level);
  return {
    name: str(o.name) || 'Homebrew Subclass',
    classKey: str(o.classKey).toLowerCase(),
    system,
    description: str(o.description),
    features,
    authorName: str(o.authorName) || undefined,
  };
}

export const CUSTOM_SUBCLASS_TOOL = {
  name: 'homebrew_subclass',
  description: 'A homebrew subclass DRAFT for an existing class. Give the parent class key (e.g. "fighter"), ' +
    'a name, and its level-by-level features. The player reviews + edits it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' },
      classKey: { type: 'string', description: 'The parent class key, lowercase (e.g. "wizard", "rogue").' },
      description: { type: 'string' },
      features: { type: 'array', items: { type: 'object', properties: { level: { type: 'integer', minimum: 1, maximum: 20 }, name: { type: 'string' }, body: { type: 'string' } }, required: ['level', 'name', 'body'] } },
    },
    required: ['name', 'classKey', 'features'],
  },
};

// ── Homebrew feat ────────────────────────────────────────────────────────────────────────────────
const FEAT_CATEGORIES = ['origin', 'general', 'fighting-style', 'epic-boon'] as const;

/** Normalize an object into the buildCustomFeat input (Omit<CustomFeat,'key'>). */
export function parseCustomFeatInput(raw: unknown, system: string): Omit<CustomFeat, 'key'> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cat = str(o.category).toLowerCase();
  const category = (FEAT_CATEGORIES as readonly string[]).includes(cat) ? (cat as CustomFeat['category']) : 'general';
  const abilityIncrease = abilities(o.abilityIncrease);
  return {
    name: str(o.name) || 'Homebrew Feat',
    system,
    category,
    prerequisite: str(o.prerequisite) || undefined,
    abilityIncrease: abilityIncrease.length ? abilityIncrease : undefined,
    body: str(o.body),
    repeatable: o.repeatable === true,
    custom: { authorName: str(o.authorName) || undefined },
  };
}

export const CUSTOM_FEAT_TOOL = {
  name: 'homebrew_feat',
  description: 'A homebrew feat DRAFT. Pick a category (origin/general/fighting-style/epic-boon), a ' +
    'prerequisite if any, an optional single +1 ability increase, and the rules text. The player reviews it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' },
      category: { type: 'string', enum: [...FEAT_CATEGORIES] },
      prerequisite: { type: 'string', description: 'e.g. "Level 4+", "Strength 13+". Optional.' },
      abilityIncrease: { type: 'array', items: { type: 'string', enum: ABILITY_KEYS }, description: 'At most one ability for a +1.' },
      body: { type: 'string', description: 'Full rules text.' },
      repeatable: { type: 'boolean' },
    },
    required: ['name', 'category', 'body'],
  },
};
