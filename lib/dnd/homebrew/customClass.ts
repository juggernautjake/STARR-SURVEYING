// lib/dnd/homebrew/customClass.ts — the deterministic model for a HOMEBREW class (Slice 5 foundation).
//
// A player/DM can define a class from scratch — its hit die, key ability, save proficiencies, skill
// count, caster type, and level-by-level features. This is the pure, validated shape they build; the AI
// builder, the (future) build/class UI, and the sheet projection all consume it, so a homebrew class is
// well-formed rather than a loose pile of features. Custom by definition — it's flagged custom by the
// existing provenance classifier, never passed off as official. Pure + data-only, so it's unit-tested.

/** The six 5e-style ability keys a homebrew class can key off / be proficient in. */
export const CLASS_ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type ClassAbilityKey = typeof CLASS_ABILITY_KEYS[number];

/** Valid hit dice (a class's per-level HP die). */
export const HIT_DICE = [6, 8, 10, 12] as const;

export type CasterKind = 'none' | 'prepared' | 'spontaneous' | 'known';

export interface CustomClassFeature {
  level: number;   // 1–20
  name: string;
  text: string;
}

export interface CustomClassDef {
  name: string;
  hitDie: number;                 // one of HIT_DICE
  keyAbility: ClassAbilityKey;
  /** Ability keys the class is proficient in saves for. */
  saveProficiencies: ClassAbilityKey[];
  /** How many skills the class is trained in at level 1. */
  skillCount: number;
  caster: CasterKind;
  /** The class's key ability(ies) for display; defaults to [keyAbility]. */
  primaryAbilities: ClassAbilityKey[];
  features: CustomClassFeature[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const nearestHitDie = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 8;
  // Seed with the smallest die so exact ties (e.g. 7 → 6 vs 8) resolve to the lower value.
  return HIT_DICE.reduce((best, d) => (Math.abs(d - n) < Math.abs(best - n) ? d : best), HIT_DICE[0] as number);
};
const asAbility = (v: unknown): ClassAbilityKey | null => {
  const k = str(v).toLowerCase();
  return (CLASS_ABILITY_KEYS as readonly string[]).includes(k) ? (k as ClassAbilityKey) : null;
};
const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];
const clampLevel = (v: unknown): number => Math.max(1, Math.min(20, Math.round(Number(v) || 1)));

/** Coerce an arbitrary object (an LLM tool call, or hand-entered JSON) into a valid CustomClassDef.
 *  Defensive: clamps the hit die to the nearest legal value, keeps only real ability keys, sorts and
 *  clamps features, and fills sane defaults — so a partial or messy input still yields a usable class. */
export function normalizeCustomClass(raw: unknown): CustomClassDef {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const keyAbility = asAbility(o.keyAbility) ?? 'str';
  const saveProficiencies = uniq((Array.isArray(o.saveProficiencies) ? o.saveProficiencies : [])
    .map(asAbility).filter((a): a is ClassAbilityKey => a !== null));
  const primaryAbilities = uniq((Array.isArray(o.primaryAbilities) ? o.primaryAbilities : [])
    .map(asAbility).filter((a): a is ClassAbilityKey => a !== null));
  const casterRaw = str(o.caster).toLowerCase();
  const caster: CasterKind = (['none', 'prepared', 'spontaneous', 'known'] as string[]).includes(casterRaw) ? (casterRaw as CasterKind) : 'none';
  const features: CustomClassFeature[] = (Array.isArray(o.features) ? o.features : [])
    .map((f) => (f && typeof f === 'object' ? f as Record<string, unknown> : {}))
    .filter((f) => str(f.name))
    .map((f) => ({ level: clampLevel(f.level), name: str(f.name), text: str(f.text) }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return {
    name: str(o.name) || 'Homebrew Class',
    hitDie: nearestHitDie(o.hitDie),
    keyAbility,
    // A class should have at least one save proficiency; default to its key ability's if none given.
    saveProficiencies: saveProficiencies.length ? saveProficiencies : [keyAbility],
    skillCount: Math.max(0, Math.min(10, Math.round(Number(o.skillCount) || 2))),
    caster,
    primaryAbilities: primaryAbilities.length ? primaryAbilities : [keyAbility],
    features,
  };
}

/** A one-line human summary of a homebrew class, for chips/headers. */
export function customClassSummary(def: CustomClassDef): string {
  const caster = def.caster === 'none' ? 'non-caster' : `${def.caster} caster`;
  const saves = def.saveProficiencies.map((s) => s.toUpperCase()).join('/') || '—';
  return `${def.name} — d${def.hitDie} hit die; key ${def.keyAbility.toUpperCase()}; saves ${saves}; ${def.skillCount} skills; ${caster}.`;
}

/** Project a homebrew class into displayable feature blocks (name + body[]), so it renders on the sheet
 *  exactly like official class features — the "a custom class appears like an official one" requirement.
 *  Returns `{ id, name, source, body }` shapes compatible with the sheet's FeatureBlock. */
export function customClassFeatureBlocks(def: CustomClassDef): { id: string; name: string; source: string; body: string[] }[] {
  return def.features.map((f) => ({
    id: `hbclass-${def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${f.level}-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: f.name,
    source: `${def.name} ${f.level}`,
    body: [f.text || 'A class feature.'],
  }));
}
