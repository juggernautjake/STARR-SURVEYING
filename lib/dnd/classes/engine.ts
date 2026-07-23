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
  ClassLevel,
} from './types';

// ── 5e MULTICLASS foundation (MC-5e-1) ────────────────────────────────────────────────────────────────
// A UNIFIED read path so single-class and multiclass characters resolve the same way: everything else can
// consume `resolveClassLevels(...)` and stop caring whether a character has one class or five. The optional
// `classes[]` (when a character multiclasses) is authoritative; without it we synthesise a one-element list
// from the character's single class, so today's single-class characters are byte-for-byte unchanged.

/** Resolve a character's class list. `multi` (the `data.meta.classes` array) wins when present + non-empty;
 *  otherwise the single class/subclass/level is wrapped as a one-element list. Empty/invalid → []. */
export function resolveClassLevels(
  single: { classKey?: string | null; subclassKey?: string | null; level?: number | null },
  multi?: readonly ClassLevel[] | null,
): ClassLevel[] {
  const clean = (multi ?? [])
    .filter((c) => c && typeof c.classKey === 'string' && c.classKey && Number(c.level) >= 1)
    .map((c) => ({ classKey: c.classKey, subclassKey: c.subclassKey || undefined, level: Math.max(1, Math.floor(Number(c.level))) }));
  if (clean.length) return clean;
  if (single.classKey && Number(single.level) >= 1) {
    return [{ classKey: single.classKey, subclassKey: single.subclassKey || undefined, level: Math.max(1, Math.floor(Number(single.level))) }];
  }
  return [];
}

/** The character's TOTAL level — the sum across all classes. Proficiency bonus, feats, and multiclass
 *  spell-slot math all key off this, not any single class's level. */
export function totalClassLevel(classes: readonly ClassLevel[]): number {
  return classes.reduce((n, c) => n + Math.max(0, Math.floor(c.level || 0)), 0);
}

/** True when a character holds levels in more than one class. */
export function isMulticlass(classes: readonly ClassLevel[]): boolean {
  return classes.length > 1;
}

/** A short display of the class split, e.g. "Fighter 3 / Wizard 2". `nameFor` maps a class key to its
 *  display name (falls back to the key). Single-class → just "Fighter 3". */
export function formatClassLevels(classes: readonly ClassLevel[], nameFor: (key: string) => string): string {
  return classes.map((c) => `${nameFor(c.classKey) || c.classKey} ${c.level}`).join(' / ');
}

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
 * 5e multiclass spell slots: add full-caster levels, HALF the half-caster levels, and a THIRD of
 * third-caster levels, then read the full-caster table at that total. Two rules people get wrong:
 *   1. Pact slots are tracked separately and never merge.
 *   2. Half casters round DOWN (Paladin/Ranger) — EXCEPT the Artificer, which rounds UP. So a part
 *      must say which rounding it uses: pass `roundUp` (from the class's `spellcasting.roundHalfUp`)
 *      for the Artificer. floor(1/2)=0 but ceil(1/2)=1, so an Artificer 1 already contributes a level.
 */
export function multiclassCasterLevel(
  parts: { kind: NonNullable<ClassDefinition['spellcasting']>['kind']; level: number; roundUp?: boolean }[],
): number {
  let total = 0;
  for (const p of parts) {
    if (p.kind === 'full') total += p.level;
    else if (p.kind === 'half') total += p.roundUp ? Math.ceil(p.level / 2) : Math.floor(p.level / 2);
    else if (p.kind === 'third') total += Math.floor(p.level / 3);
  }
  return Math.min(20, total);
}

/** The 5e MULTICLASS spellcaster slot table (PHB), by COMBINED caster level 1..20. `[level] = [_, r1..r9]`
 *  (index 0 unused, matching the class `slots` convention). Used ONLY when a character has 2+ spellcasting
 *  classes; a single spellcasting class keeps its own table. Warlock pact slots are separate. */
const MULTICLASS_SPELL_SLOTS: SpellSlotRow[] = [
  [0], // 0 — unused
  [0, 2], [0, 3], [0, 4, 2], [0, 4, 3], [0, 4, 3, 2], [0, 4, 3, 3], [0, 4, 3, 3, 1], [0, 4, 3, 3, 2],
  [0, 4, 3, 3, 3, 1], [0, 4, 3, 3, 3, 2], [0, 4, 3, 3, 3, 2, 1], [0, 4, 3, 3, 3, 2, 1],
  [0, 4, 3, 3, 3, 2, 1, 1], [0, 4, 3, 3, 3, 2, 1, 1], [0, 4, 3, 3, 3, 2, 1, 1, 1], [0, 4, 3, 3, 3, 2, 1, 1, 1],
  [0, 4, 3, 3, 3, 2, 1, 1, 1, 1], [0, 4, 3, 3, 3, 3, 1, 1, 1, 1], [0, 4, 3, 3, 3, 3, 2, 1, 1, 1],
  [0, 4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** The spell slots a MULTICLASS spellcaster of the given combined caster level has (0 → none). */
export function multiclassSpellSlots(casterLevel: number): SpellSlotRow {
  const n = Math.max(0, Math.min(20, Math.floor(casterLevel || 0)));
  return n === 0 ? [] : [...MULTICLASS_SPELL_SLOTS[n]];
}

/** Everything a MULTICLASS character has, aggregated across its classes (MC-5e-2). Built by resolving each
 *  class's own `snapshotAtLevel` and combining under the 5e rules: proficiency bonus by TOTAL level, HP
 *  additive, every class's features kept (tagged with the class they came from), warlock pact slots summed,
 *  and the combined spellcaster `casterLevel` from `multiclassCasterLevel`. The caller maps `casterLevel` to
 *  the standard multiclass spell-slot table (the same table a full caster of that level uses) — kept out of
 *  here so this stays pure and the table lives with the class data. A single-class list just returns that
 *  one class's numbers, so this is safe to use for every character. */
export interface MulticlassSnapshot {
  totalLevel: number;
  proficiencyBonus: number;
  hitPointsBeforeCon: number;
  features: (ClassFeature & { sourceClass: string })[];
  resources: LevelSnapshot['resources'];
  /** Warlock pact magic, summed across any pact classes. */
  pact?: { slots: number; rank: number };
  /** Combined 5e multiclass spellcaster level — 0 for a non-caster. */
  casterLevel: number;
  /** The character's leveled (non-pact) spell slots, `[_, r1..r9]`. With ONE spellcasting class it's that
   *  class's own table; with TWO+ it's the multiclass table at `casterLevel` (the PHB rule). Undefined when
   *  the character has no leveled spellcasting. */
  spellSlots?: SpellSlotRow;
  /** How many of the character's classes are leveled (full/half/third) spellcasters — drives the slot rule. */
  spellcastingClassCount: number;
  /** Each class's own snapshot, for per-class display (subclass features, resources, class level). */
  perClass: { classKey: string; level: number; name: string; snapshot: LevelSnapshot }[];
}

export function multiclassSnapshot(
  classes: readonly ClassLevel[],
  lookup: (key: string) => { def: ClassDefinition; sub?: SubclassDefinition | null } | null | undefined,
): MulticlassSnapshot {
  const perClass: MulticlassSnapshot['perClass'] = [];
  const features: MulticlassSnapshot['features'] = [];
  const resources: MulticlassSnapshot['resources'] = [];
  const casterParts: { kind: NonNullable<ClassDefinition['spellcasting']>['kind']; level: number; roundUp?: boolean }[] = [];
  let hp = 0;
  let pactSlots = 0;
  let pactRank = 0;
  // Track the LEVELED (full/half/third) spellcasting classes — the PHB slot rule keys off how many there are.
  let leveledCasterCount = 0;
  let soleCasterSlots: SpellSlotRow | undefined;
  for (const cl of classes) {
    const found = lookup(cl.classKey);
    if (!found) continue;
    const snap = snapshotAtLevel(found.def, cl.level, found.sub ?? null);
    perClass.push({ classKey: cl.classKey, level: cl.level, name: found.def.name, snapshot: snap });
    hp += snap.hitPointsBeforeCon;
    for (const f of snap.features) features.push({ ...f, sourceClass: found.def.name });
    for (const r of snap.resources) resources.push(r);
    if (snap.pact) { pactSlots += snap.pact.slots; pactRank = Math.max(pactRank, snap.pact.rank); }
    const sc = found.def.spellcasting;
    if (sc) {
      // Every caster class contributes to the combined caster level; pact/non-slot casters add 0 in the math.
      casterParts.push({ kind: sc.kind, level: cl.level, roundUp: sc.roundHalfUp });
      if (sc.kind === 'full' || sc.kind === 'half' || sc.kind === 'third') {
        leveledCasterCount++;
        soleCasterSlots = snap.spellSlots; // the one caster's own table, used when it's the ONLY one
      }
    }
  }
  const totalLevel = totalClassLevel(classes);
  const casterLevel = multiclassCasterLevel(casterParts);
  // Slot rule (PHB): one leveled caster → its own table; two+ → the multiclass table at the combined level.
  const spellSlots =
    leveledCasterCount === 0 ? undefined
      : leveledCasterCount === 1 ? soleCasterSlots
        : multiclassSpellSlots(casterLevel);
  return {
    totalLevel,
    proficiencyBonus: proficiencyBonusFor(totalLevel),
    hitPointsBeforeCon: hp,
    features,
    resources,
    ...(pactSlots > 0 ? { pact: { slots: pactSlots, rank: pactRank } } : {}),
    casterLevel,
    ...(spellSlots ? { spellSlots } : {}),
    spellcastingClassCount: leveledCasterCount,
    perClass,
  };
}
