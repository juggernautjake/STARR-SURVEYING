// lib/dnd/customizations.ts — a categorized summary of everything on a character that deviates
// from a clean vanilla build.
//
// The owner's ask: a character should carry a description of its customizations, broken down by
// CATEGORY. Open it and every category is listed. A category the character HAS customized shows
// green, sorts to the top, and carries a count — "Weapons (1)", "Feats (3)". A category with no
// customizations shows grey, empty, and sorts below. That is the whole shape of this file: turn a
// character into an ordered list of `CategorySummary`.
//
// WHAT COUNTS AS A CUSTOMIZATION — the owner chose "everything non-vanilla", which is four
// distinct signals, and they are genuinely different things a reader wants told apart:
//
//   · homebrew   — content that exists in NO official catalog (a feat you invented). From
//                  `classifyElement`, which is the same call the provenance/vanilla-gate uses.
//   · off-rules  — official content this character may not legally take at its class/level (the ⚑
//                  marker). A per-element `offRules` string on the sheet.
//   · edited     — a catalogued element whose text was hand-tuned (the ✎ marker). A per-element
//                  `customized` boolean.
//   · granted    — handed to the character directly by the DM. Legitimately unbound, but still not
//                  a vanilla pick, so it belongs in the count.
//
// An element can carry MORE than one — a homebrew feat you then edited is both. So each item keeps
// a `types` set rather than a single label, and the category count is the number of customized
// ELEMENTS, not the number of flags (an item that is both edited and off-rules counts once).
//
// HOW HOMEBREW IS DETECTED, and why it is not one uniform check. The 5e sheet's arrays are
// heterogeneous — `attacks` holds weapons AND cantrip attacks AND natural weapons, `inventory`
// holds everything from plate armour to a coil of rope — so checking a name against a weapon or
// armour catalog produces false positives (a "Sacred Flame" attack is not a homebrew weapon just
// because it is absent from the weapon list). So homebrew is inferred only where it can be inferred
// WITHOUT false positives:
//   · Spells — `char.spells` is homogeneous and the SRD spell catalog is complete, so a spell not
//     in `spellsForSystem` is reliably homebrew.
//   · Provenance-tracked kinds — species, class, subclass, skills, and ALL Intuitive Games content
//     go through `classifyElement`, which has real vanilla lists for exactly those.
//   · An explicit `homebrew` flag on an element, if the authoring path sets one (forward-compat).
// Everywhere else, an element counts as a customization only through the sheet's OWN explicit
// markers — `offRules` (⚑) and `customized` (✎) — which is what the player already sees on the
// sheet, and which has no false positives by construction.
//
// The one honest gap this leaves, recorded rather than hidden: a from-scratch homebrew WEAPON or
// item authored on a custom character, which the sheet currently stores with no per-element flag,
// is not counted until the authoring path marks it. That is a one-field follow-up, not a redesign.
//
// CROSS-SYSTEM. A 5e character gets every signal. A PF2 or IG character — whose bespoke data lives
// in `data.pf2` / `data.ig` rather than these shared fields — gets homebrew (via classify + the IG
// build block) and granted today; its off-rules/edited signals arrive when those sheets surface
// them in the shared shape. The function never crashes on a shape it does not fully understand.
import type { CharacterSystem } from './systems';
import { classifyElement } from './provenance';
import { spellsForSystem } from './spells/index';

/** The distinct ways an element can be a customization. */
export type CustomizationType = 'homebrew' | 'off-rules' | 'edited' | 'granted';

/** One customized element, with every reason it qualifies. */
export interface CustomizationItem {
  name: string;
  types: CustomizationType[];
  /** The off-rules reason or the element's own note, shown in the expanded view. */
  detail?: string;
}

/** A player-facing category and the customizations it holds. */
export interface CategorySummary {
  /** Display label, e.g. "Weapons". */
  category: string;
  /** Number of customized ELEMENTS (not flags). 0 for an untouched category. */
  count: number;
  items: CustomizationItem[];
}

export interface CustomizationReport {
  /** Every category, ordered: customized (count > 0) first by count desc then name, then the
   *  untouched ones alphabetically. This IS the display order the owner described — green ones on
   *  top, grey ones below — computed once here so the UI never has to re-sort. */
  categories: CategorySummary[];
  /** Total customized elements across all categories. */
  total: number;
}

/**
 * The full set of categories, in a stable canonical order used as the tie-breaker and as the list
 * of "empty" categories to show greyed. Kept as data so a new content kind is one line, and so the
 * grey list is never a hand-maintained copy that drifts from the real one.
 *
 * `kinds` are the `ElementKind`s that map to this player-facing bucket; a homebrew element of any
 * of them counts here. `sheetField` is where the shared `Character` stores elements of this kind,
 * so the off-rules/edited scan knows which array to read.
 */
interface CategoryDef {
  category: string;
  kinds: string[];
  sheetField?: 'attacks' | 'features' | 'spells' | 'inventory';
}

const CATEGORY_DEFS: CategoryDef[] = [
  { category: 'Weapons', kinds: ['weapon', 'weapon-type'], sheetField: 'attacks' },
  { category: 'Armor & Gear', kinds: ['armor', 'item', 'magic-item'], sheetField: 'inventory' },
  { category: 'Spells', kinds: ['spell', 'power', 'defensive-power'], sheetField: 'spells' },
  { category: 'Feats & Features', kinds: ['feat', 'feature'], sheetField: 'features' },
  { category: 'Species', kinds: ['ancestry', 'trait'] },
  { category: 'Class', kinds: ['class', 'subclass'] },
  { category: 'Background', kinds: ['background'] },
  { category: 'Stances', kinds: ['stance'] },
  { category: 'Skills', kinds: ['skill'] },
]

/** Shape of the shared-sheet element arrays we scan for the off-rules/edited flags. */
interface SheetElement {
  name?: string
  offRules?: string
  customized?: boolean
  /** Set by an authoring path that creates content from scratch. Absent today on most homebrew;
   *  read here so the report already counts it the moment authoring starts setting it. */
  homebrew?: boolean
}

/** A minimal, defensive view of the fields this report reads. Kept loose on purpose — the report
 *  runs on the shared 5e `Character` and on the PF2/IG shapes, and must not throw on a field one
 *  of them lacks. */
interface CharLike {
  meta?: { className?: string; species?: string; subclass?: string }
  attacks?: SheetElement[]
  features?: SheetElement[]
  spells?: SheetElement[]
  inventory?: SheetElement[]
  customSkills?: { name?: string }[]
  igBuild?: {
    className?: string; ancestry?: string; subclass?: string; defensivePower?: string
    stances?: string[]; powers?: string[]; feats?: string[]; weapons?: string[]; weaponTypes?: string[]
  }
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Merge a customization into a bucket, coalescing by name so an element that is both edited AND
 *  off-rules is ONE item carrying both types rather than two rows. */
function addItem(bucket: Map<string, CustomizationItem>, name: string, type: CustomizationType, detail?: string) {
  const key = norm(name)
  if (!key) return
  const existing = bucket.get(key)
  if (existing) {
    if (!existing.types.includes(type)) existing.types.push(type)
    if (!existing.detail && detail) existing.detail = detail
  } else {
    bucket.set(key, { name, types: [type], detail })
  }
}

/**
 * Build the categorized customization report for a character.
 *
 * @param char       the character (shared 5e shape, or a PF2/IG shape — read defensively)
 * @param system     the character's game system, for the homebrew classification
 * @param grantedNames  names the DM granted directly (from `dm_granted`), so they read as granted
 *                      rather than homebrew — a DM gift is not the player inventing content.
 */
export function customizationReport(
  char: CharLike,
  system: CharacterSystem,
  grantedNames: string[] = [],
): CustomizationReport {
  const granted = new Set(grantedNames.map(norm))
  // One bucket of coalesced items per category.
  const buckets = new Map<string, Map<string, CustomizationItem>>(
    CATEGORY_DEFS.map((d) => [d.category, new Map<string, CustomizationItem>()]),
  )
  const bucketFor = (category: string) => buckets.get(category)!

  // Spell names the system actually publishes — the one complete, homogeneous catalog, so a spell
  // outside it is reliably homebrew. Lower-cased for a case-insensitive membership test.
  const cataloguedSpells = new Set(spellsForSystem(system).map((s) => norm(s.name)))

  // 1) The explicit-marker signals — off-rules (⚑), edited (✎), and the forward-compat homebrew
  //    flag — read from the shared sheet arrays. These are what the player already sees marked, and
  //    they have no false positives. Plus the spell-catalog homebrew inference, which is safe only
  //    for the Spells field.
  for (const def of CATEGORY_DEFS) {
    if (!def.sheetField) continue
    const list = (char[def.sheetField] as SheetElement[] | undefined) ?? []
    for (const el of list) {
      if (!el?.name) continue
      const isGranted = granted.has(norm(el.name))
      if (el.offRules) addItem(bucketFor(def.category), el.name, isGranted ? 'granted' : 'off-rules', el.offRules)
      if (el.customized) addItem(bucketFor(def.category), el.name, 'edited')
      if (el.homebrew && !isGranted) addItem(bucketFor(def.category), el.name, 'homebrew')
      // A spell not in the SRD-complete catalog is homebrew. Safe ONLY here — `spells` is
      // homogeneous, unlike `attacks`/`inventory`, so a membership miss cannot be a mis-classified
      // cantrip or coil of rope.
      if (def.sheetField === 'spells' && !isGranted && !cataloguedSpells.has(norm(el.name))) {
        addItem(bucketFor(def.category), el.name, 'homebrew')
      }
    }
  }

  // 2) The homebrew signal, via classifyElement, for every element the character holds. A weapon
  //    or feat whose NAME is in no official catalog is homebrew even without an offRules flag —
  //    which is how brand-new authored content reads. Granted names are attributed as granted, not
  //    homebrew.
  const classify = (kind: string, name: string): CustomizationType | null => {
    if (granted.has(norm(name))) return 'granted'
    return classifyElement(system, kind as never, name) === 'custom' ? 'homebrew' : null
  }
  const categoryForKind = (kind: string) => CATEGORY_DEFS.find((d) => d.kinds.includes(kind))?.category

  const consider = (kind: string, name: unknown) => {
    const s = String(name ?? '').trim()
    if (!s) return
    const cat = categoryForKind(kind)
    if (!cat) return
    const type = classify(kind, s)
    if (type) addItem(bucketFor(cat), s, type)
  }

  const build = char.igBuild
  if (build) {
    // Intuitive Games: read the kinded build block so a homebrew stance/power/feat lands in its
    // real category rather than being misread as a 5e feature.
    consider('class', build.className ?? char.meta?.className)
    consider('ancestry', build.ancestry ?? char.meta?.species)
    consider('subclass', build.subclass ?? char.meta?.subclass)
    for (const x of build.stances ?? []) consider('stance', x)
    for (const x of build.powers ?? []) consider('power', x)
    for (const x of build.feats ?? []) consider('feat', x)
    for (const x of build.weapons ?? []) consider('weapon', x)
    for (const x of build.weaponTypes ?? []) consider('weapon-type', x)
    if (build.defensivePower) consider('defensive-power', build.defensivePower)
  } else {
    consider('class', char.meta?.className)
    consider('ancestry', char.meta?.species)
    consider('subclass', char.meta?.subclass)
    for (const a of char.attacks ?? []) consider('weapon', a?.name)
    for (const f of char.features ?? []) consider('feat', f?.name)
  }
  for (const s of char.spells ?? []) consider('spell', s?.name)
  for (const s of char.customSkills ?? []) consider('skill', s?.name)

  // 3) Materialize every category — including the empty ones, because the owner wants them SHOWN
  //    (grey), not omitted. Sort: customized first by count desc, then the canonical order as a
  //    stable tie-break; empty categories keep the canonical order beneath them.
  const canonicalIndex = new Map(CATEGORY_DEFS.map((d, i) => [d.category, i]))
  const categories: CategorySummary[] = CATEGORY_DEFS.map((d) => {
    const items = [...bucketFor(d.category).values()]
    return { category: d.category, count: items.length, items }
  }).sort((a, b) => {
    if ((a.count > 0) !== (b.count > 0)) return a.count > 0 ? -1 : 1 // green above grey
    if (a.count !== b.count) return b.count - a.count // more customizations first
    return (canonicalIndex.get(a.category)! - canonicalIndex.get(b.category)!)
  })

  return { categories, total: categories.reduce((n, c) => n + c.count, 0) }
}

/** A short human label for a customization type, for the badges in the expanded view. */
export function customizationTypeLabel(t: CustomizationType): string {
  switch (t) {
    case 'homebrew': return 'homebrew'
    case 'off-rules': return 'outside the rules'
    case 'edited': return 'edited'
    case 'granted': return 'DM granted'
  }
}
