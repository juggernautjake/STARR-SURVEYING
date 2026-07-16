// lib/dnd/classes/custom.ts — homebrew classes and feats, as data.
//
// The design commitment: a custom class is a `ClassDefinition`, exactly like an official one. It
// levels through the same `snapshotAtLevel`, is checked by the same `validateClassDefinition`, and
// prints on the sheet through the same code. There is no "homebrew mode" — which is what stops
// custom content from being a second-class citizen that silently breaks at level 12.
//
// Custom content rides the provenance + DM-approval workflow that already exists (seed 443):
// anything authored here is flagged `custom`, appears in the DM's review list, and is blocked in a
// vanilla-only campaign unless the DM granted it.
import type { ClassDefinition, SubclassDefinition, ClassFeature } from './types';
import { validateClassDefinition, type ClassValidation } from './engine';
import { FULL_CASTER_SLOTS, HALF_CASTER_SLOTS, THIRD_CASTER_SLOTS, PACT_SLOTS, PACT_RANK } from './slots';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

/** A homebrew feat. Mirrors the 2024 feat categories so it slots into the same choice points. */
export interface CustomFeat {
  key: string;
  name: string;
  system: string;
  category: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  /** e.g. "Level 4+", "Strength 13+". Shown and checked at the choice point. */
  prerequisite?: string;
  /** Which ability this feat's +1 goes to, if any (most 2024 General feats grant one). */
  abilityIncrease?: AbilityKey[];
  /** Full rules text, markdown-lite. */
  body: string;
  repeatable?: boolean;
  custom: { authorName?: string };
}

/** What the builder collects from a player defining a class from scratch. */
export interface CustomClassDraft {
  name: string;
  system: string;
  description: string;
  hitDie: number;
  primaryAbility: AbilityKey[];
  savingThrows: AbilityKey[];
  skillChoices: { count: number; from: string[] };
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies?: string[];
  subclassLevel: number;
  subclassLabel: string;
  /** ASI levels; defaults to the 5e-standard 4/8/12/16 when omitted. */
  asiLevels?: number[];
  caster?: { kind: 'full' | 'half' | 'third' | 'pact'; ability: AbilityKey; preparedRule?: string };
  resources?: { id: string; name: string; perLevel: number[]; resetOn: 'short' | 'long'; note?: string }[];
  features: { level: number; name: string; body: string; choice?: ClassFeature['choice'] }[];
  startingEquipment?: string[];
  authorName?: string;
  /** An existing class this was derived from — recorded for the DM's review, not enforced. */
  basedOn?: string;
}

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom-class';

/** The 5e default ASI ladder — used when a draft doesn't specify one. */
export const DEFAULT_ASI_LEVELS = [4, 8, 12, 16];

/**
 * Turn a draft into a real ClassDefinition.
 *
 * Two things are added automatically so a homebrew class can't be born broken:
 *  · the ASI/Epic Boon choice features, if the author didn't write them
 *  · the subclass choice feature at `subclassLevel`, which validate requires
 */
export function buildCustomClass(draft: CustomClassDraft): ClassDefinition {
  const asiLevels = draft.asiLevels?.length ? [...draft.asiLevels].sort((a, b) => a - b) : [...DEFAULT_ASI_LEVELS];
  const features: ClassFeature[] = draft.features.map((f) => ({ ...f }));

  // Ensure the subclass choice exists at the declared level.
  if (!features.some((f) => f.choice === 'subclass')) {
    features.push({
      level: draft.subclassLevel,
      name: draft.subclassLabel,
      body: `At level ${draft.subclassLevel} you choose a **${draft.subclassLabel}**, which grants features now and again at later levels.`,
      choice: 'subclass',
    });
  }
  // Ensure each ASI level has a choice point.
  for (const lv of asiLevels) {
    if (!features.some((f) => f.level === lv && f.choice === 'asi')) {
      features.push({
        level: lv,
        name: 'Ability Score Improvement',
        body: 'Increase one ability score by **2**, or two ability scores by **1** each, to a maximum of **20** — or take a **feat** you qualify for instead.',
        choice: 'asi',
      });
    }
  }
  // Epic Boon at 19, the 2024 standard.
  if (!features.some((f) => f.choice === 'epic-boon')) {
    features.push({
      level: 19,
      name: 'Epic Boon',
      body: 'Choose an **Epic Boon** feat. Epic Boons can raise an ability score above 20, to a maximum of **30**.',
      choice: 'epic-boon',
    });
  }

  features.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const def: ClassDefinition = {
    key: `custom-${slug(draft.name)}`,
    name: draft.name.trim(),
    system: draft.system,
    custom: { authorName: draft.authorName, basedOn: draft.basedOn },
    hitDie: draft.hitDie,
    primaryAbility: draft.primaryAbility,
    savingThrows: draft.savingThrows,
    skillChoices: draft.skillChoices,
    armorProficiencies: draft.armorProficiencies,
    weaponProficiencies: draft.weaponProficiencies,
    toolProficiencies: draft.toolProficiencies,
    asiLevels,
    subclassLevel: draft.subclassLevel,
    subclassLabel: draft.subclassLabel,
    features,
    startingEquipment: draft.startingEquipment,
    description: draft.description,
  };

  if (draft.caster) {
    const { kind, ability, preparedRule } = draft.caster;
    def.spellcasting =
      kind === 'pact'
        ? { kind, ability, preparedRule, pactSlots: [...PACT_SLOTS], pactRank: [...PACT_RANK] }
        : {
            kind,
            ability,
            preparedRule,
            slots: kind === 'full' ? FULL_CASTER_SLOTS : kind === 'half' ? HALF_CASTER_SLOTS : THIRD_CASTER_SLOTS,
          };
  }

  if (draft.resources?.length) {
    def.resources = draft.resources.map((r) => ({
      id: r.id || slug(r.name),
      name: r.name,
      // Normalise to a length-21 array so the engine can index it by level safely.
      perLevel: normalisePerLevel(r.perLevel),
      resetOn: r.resetOn,
      note: r.note,
    }));
  }

  return def;
}

/** Pad/trim a per-level array to exactly 21 entries (index 0 unused, 1..20 meaningful). */
export function normalisePerLevel(input: number[]): number[] {
  const out = new Array(21).fill(0);
  for (let i = 1; i <= 20; i++) out[i] = Number.isFinite(input[i]) ? input[i] : (input[i - 1] ?? 0);
  return out;
}

export interface CustomClassReview extends ClassValidation {
  severity: 'error' | 'warning';
}

/**
 * Validate a homebrew class: the same structural checks as an official one, PLUS balance warnings
 * a DM would want flagged at review time. Errors block; warnings are advisory — a DM can approve a
 * deliberately spicy class, but should do it knowingly rather than by accident.
 */
export function reviewCustomClass(def: ClassDefinition): CustomClassReview[] {
  const out: CustomClassReview[] = validateClassDefinition(def).map((v) => ({ ...v, severity: 'error' as const }));
  const warn = (field: string, message: string) => out.push({ field, message, severity: 'warning' });

  if (def.hitDie > 12) warn('hitDie', 'No official 5e class exceeds d12.');
  if (def.asiLevels.length > 7) warn('asiLevels', `${def.asiLevels.length} ASIs is more than any official class (Fighter has the most, at 7 including the Epic Boon).`);

  const byLevel = new Map<number, number>();
  for (const f of def.features) byLevel.set(f.level, (byLevel.get(f.level) ?? 0) + 1);
  for (const [lv, n] of byLevel) if (n > 5) warn('features', `Level ${lv} grants ${n} features — official classes rarely exceed 3.`);

  // A class with no REAL features above level 10 is almost always an unfinished draft.
  // Measured on non-choice features only: buildCustomClass auto-adds ASI/Epic Boon choice points
  // (the Epic Boon at 19), so counting those would make this warning impossible to trigger.
  const authored = def.features.filter((f) => !f.choice);
  const top = Math.max(0, ...authored.map((f) => f.level));
  if (top < 11) warn('features', `The class stops gaining real features at level ${top} — it is not playable to 20 yet.`);

  for (const r of def.resources ?? []) {
    const max = Math.max(...r.perLevel.slice(1));
    if (max > 20) warn('resources', `"${r.name}" reaches ${max} uses — that is far above any official class resource.`);
  }

  if (def.spellcasting && def.hitDie >= 12) warn('spellcasting', 'A d12 full caster is well beyond the official power curve.');
  if (!def.description?.trim()) warn('description', 'Give the class a description so the DM knows what it is meant to be.');

  return out;
}

/** Homebrew subclass for any class — official or custom. */
export function buildCustomSubclass(input: {
  name: string;
  classKey: string;
  system: string;
  description: string;
  features: { level: number; name: string; body: string; choice?: ClassFeature['choice'] }[];
  alwaysPrepared?: Record<number, string[]>;
  authorName?: string;
}): SubclassDefinition {
  return {
    key: `custom-${slug(input.name)}`,
    name: input.name.trim(),
    classKey: input.classKey,
    system: input.system,
    description: input.description,
    features: input.features.map((f) => ({ ...f, subclass: true })).sort((a, b) => a.level - b.level),
    alwaysPrepared: input.alwaysPrepared,
    custom: { authorName: input.authorName },
  };
}

/** Build a homebrew feat, normalising the key. */
export function buildCustomFeat(input: Omit<CustomFeat, 'key'> & { key?: string }): CustomFeat {
  return { ...input, key: input.key || `custom-${slug(input.name)}` };
}

export interface FeatReview extends ClassValidation {
  severity: 'error' | 'warning';
}

export function reviewCustomFeat(feat: CustomFeat): FeatReview[] {
  const out: FeatReview[] = [];
  const err = (field: string, message: string) => out.push({ field, message, severity: 'error' });
  const warn = (field: string, message: string) => out.push({ field, message, severity: 'warning' });

  if (!feat.name?.trim()) err('name', 'A feat needs a name.');
  if (!feat.body?.trim()) err('body', 'A feat needs rules text.');
  if (!feat.system?.trim()) err('system', 'A feat must belong to a system.');
  if ((feat.abilityIncrease?.length ?? 0) > 1) warn('abilityIncrease', 'Official feats grant at most one +1 ability increase.');
  if (feat.category === 'origin' && feat.abilityIncrease?.length) {
    warn('abilityIncrease', 'Origin feats do not normally grant an ability increase — the background already does.');
  }
  if (feat.category === 'general' && !feat.prerequisite) {
    warn('prerequisite', 'General feats normally require level 4+.');
  }
  return out;
}
