// lib/dnd/classes/engine.ts — resolve "class X at level N" into everything the character has.
//
// One code path for OFFICIAL and HOMEBREW classes: a custom class is a ClassDefinition like any
// other, so it levels, gains features, tracks resources and casts spells through exactly this
// function. That's the property that makes the custom-class builder honest rather than a bolt-on.
import type {
  ClassDefinition,
  SubclassDefinition,
  LevelSnapshot,
  ClassFeature,
  SpellSlotRow,
} from './types';

/** 5e proficiency bonus by character level. Index 1..20. */
export const PROF_BY_LEVEL = [0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

export function proficiencyBonusFor(level: number): number {
  return PROF_BY_LEVEL[clampLevel(level)] ?? 2;
}

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(20, Math.round(level || 1)));
}

/** The fixed-average HP a class contributes by `level`, before the CON modifier is added. */
export function hitPointsBeforeCon(hitDie: number, level: number): number {
  const lv = clampLevel(level);
  const perLevelAvg = Math.floor(hitDie / 2) + 1; // d10 → 6, d12 → 7
  return hitDie + (lv - 1) * perLevelAvg;
}

const CHOICE_LABEL: Record<NonNullable<ClassFeature['choice']>, string> = {
  asi: 'Ability Score Improvement or feat',
  subclass: 'Choose your subclass',
  'fighting-style': 'Choose a Fighting Style',
  expertise: 'Choose Expertise skills',
  cantrip: 'Choose a cantrip',
  'epic-boon': 'Choose an Epic Boon',
  other: 'Make a choice',
};

/**
 * Everything a character of `def` (+ optional `sub`) has at `level`.
 * Features are cumulative — every feature at or below the level, base and subclass merged in
 * level order, which is the order a sheet should print them.
 */
export function snapshotAtLevel(def: ClassDefinition, level: number, sub?: SubclassDefinition | null): LevelSnapshot {
  const lv = clampLevel(level);

  const base = def.features.filter((f) => f.level <= lv);
  const subFeatures = (sub?.features ?? []).filter((f) => f.level <= lv).map((f) => ({ ...f, subclass: true }));
  const features = [...base, ...subFeatures].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const pendingChoices = features
    .filter((f) => f.choice)
    .map((f) => ({ level: f.level, kind: f.choice!, label: `${CHOICE_LABEL[f.choice!]} (level ${f.level})` }));

  const resources = (def.resources ?? [])
    .map((r) => ({ id: r.id, name: r.name, max: r.perLevel[lv] ?? 0, resetOn: r.resetOn }))
    .filter((r) => r.max !== 0); // 0 = the class doesn't have it yet at this level

  const snap: LevelSnapshot = {
    level: lv,
    proficiencyBonus: proficiencyBonusFor(lv),
    hitDie: def.hitDie,
    hitPointsBeforeCon: hitPointsBeforeCon(def.hitDie, lv),
    features,
    pendingChoices,
    resources,
  };

  const sc = def.spellcasting;
  if (sc) {
    if (sc.kind === 'pact') {
      snap.pact = { slots: sc.pactSlots?.[lv] ?? 0, rank: sc.pactRank?.[lv] ?? 0 };
    } else if (sc.slots) {
      snap.spellSlots = sc.slots[lv] ? ([...sc.slots[lv]] as SpellSlotRow) : undefined;
    }
    if (sc.cantripsKnown) snap.cantripsKnown = sc.cantripsKnown[lv] ?? 0;
    if (sc.spellsKnown) snap.spellsKnown = sc.spellsKnown[lv] ?? 0;
  }

  return snap;
}

/** The full 1→20 ladder, for the sheet's progression table. */
export function progressionTable(def: ClassDefinition, sub?: SubclassDefinition | null): LevelSnapshot[] {
  return Array.from({ length: 20 }, (_, i) => snapshotAtLevel(def, i + 1, sub));
}

/** Just the features gained AT `level` (what a level-up should announce). */
export function featuresGainedAt(def: ClassDefinition, level: number, sub?: SubclassDefinition | null): ClassFeature[] {
  const lv = clampLevel(level);
  return [
    ...def.features.filter((f) => f.level === lv),
    ...(sub?.features ?? []).filter((f) => f.level === lv).map((f) => ({ ...f, subclass: true })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ClassValidation {
  field: string;
  message: string;
}

/**
 * Structural checks on a class definition — the same ones for official and homebrew, so a custom
 * class can't quietly be built in a shape the engine can't level. Returns [] when it's sound.
 */
export function validateClassDefinition(def: ClassDefinition): ClassValidation[] {
  const out: ClassValidation[] = [];
  const push = (field: string, message: string) => out.push({ field, message });

  if (!def.key?.trim()) push('key', 'A class needs a stable key.');
  if (!def.name?.trim()) push('name', 'A class needs a name.');
  if (!def.system?.trim()) push('system', 'A class must belong to a system.');
  if (![4, 6, 8, 10, 12].includes(def.hitDie)) push('hitDie', `Hit die must be d4/d6/d8/d10/d12 (got d${def.hitDie}).`);
  if (!def.savingThrows?.length) push('savingThrows', 'A class needs saving throw proficiencies.');
  if (def.savingThrows?.length > 2) push('savingThrows', '5e classes grant exactly two saving throw proficiencies.');
  if (!def.primaryAbility?.length) push('primaryAbility', 'A class needs at least one primary ability.');

  if (!def.features?.length) push('features', 'A class needs at least one feature.');
  for (const f of def.features ?? []) {
    if (f.level < 1 || f.level > 20) push('features', `"${f.name}" is at level ${f.level}; levels run 1–20.`);
    if (!f.body?.trim()) push('features', `"${f.name}" has no rules text.`);
  }

  if (def.subclassLevel < 1 || def.subclassLevel > 20) push('subclassLevel', 'The subclass level must be 1–20.');
  if (!def.features?.some((f) => f.choice === 'subclass')) {
    push('features', `No feature marks level ${def.subclassLevel} as the subclass choice.`);
  }
  for (const l of def.asiLevels ?? []) if (l < 1 || l > 20) push('asiLevels', `ASI level ${l} is outside 1–20.`);

  for (const r of def.resources ?? []) {
    if (r.perLevel.length < 21) push('resources', `"${r.name}" needs a perLevel array indexed 1–20 (length 21).`);
  }

  const sc = def.spellcasting;
  if (sc) {
    if (sc.kind === 'pact' && !sc.pactSlots) push('spellcasting', 'A pact caster needs pactSlots.');
    if (sc.kind !== 'pact' && sc.kind !== 'none' && !sc.slots) push('spellcasting', `A ${sc.kind} caster needs a slots table.`);
    if (sc.slots) {
      for (const lv of Object.keys(sc.slots)) {
        const n = Number(lv);
        if (n < 1 || n > 20) push('spellcasting', `Slot table has a level ${lv} row.`);
      }
    }
  }
  return out;
}

/**
 * 5e multiclass spell slots: add full-caster levels, HALF the half-caster levels (rounded down),
 * and a THIRD of third-caster levels, then read the full-caster table at that total. Pact slots
 * are tracked separately and never merge — that's the rule people get wrong most often.
 */
export function multiclassCasterLevel(parts: { kind: ClassDefinition['spellcasting'] extends undefined ? never : NonNullable<ClassDefinition['spellcasting']>['kind']; level: number }[]): number {
  let total = 0;
  for (const p of parts) {
    if (p.kind === 'full') total += p.level;
    else if (p.kind === 'half') total += Math.floor(p.level / 2);
    else if (p.kind === 'third') total += Math.floor(p.level / 3);
  }
  return Math.min(20, total);
}
