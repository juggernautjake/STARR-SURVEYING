// lib/dnd/feats/catalog.ts — the per-system feat catalog dispatcher for PICKERS.
//
// WHY THIS EXISTS SEPARATELY FROM `eligibility.ts`. That module answers "may this character take
// THIS feat?" — one ref at a time, which is what a gate needs. A picker needs the other half: the
// LIST to show, and enough shape to render each row. `featEligibilityForSystem` was built in
// 14-S6b and wired into every write path; the sheet's `FeatPicker` still hard-coded `FEATS_2024`
// and showed a 2014 character "No feat library for this game system yet" while a real 2014 catalog
// and a real 2014 gate both sat one import away.
//
// That is this codebase's most familiar defect — content authored and tracked, with nothing wired
// to consult it — and it is why the fix is a dispatcher rather than an `if (system === '2014')` in
// the picker. Ground Rule 1: a per-system dispatcher, never a widened module.
//
// THE 2024 TYPE IS NOT WIDENED. `Feat` and `Feat2014` stay exactly as they are, including
// `Feat2014`'s deliberate absence of `category` — 2014 feats are one undifferentiated list, and
// origin/general/fighting-style/epic-boon is a 2024 structure that must not appear on them. This
// module NORMALISES for display instead, which is a different thing from unifying: `category` is
// nullable here precisely so a 2014 feat cannot be given one by accident.
import { FEATS_2024, type FeatCategory } from './dnd5e-2024';
import { FEATS_2014 } from './dnd5e-2014';
import type { FeatSlot } from './eligibility';

/** One feat, normalised across systems for rendering in a picker. */
export interface PickerFeat {
  key: string;
  name: string;
  /** Full rules text (markdown-lite), shown when a row is expanded. */
  benefit: string;
  /** A one-line summary where the system publishes one; 2024 has none, so it falls back to null
   *  rather than truncating `benefit` — a machine-cut sentence reads worse than no sentence. */
  summary: string | null;
  /** 2024's track. NULL for 2014, which has no categories at all — see the header note. */
  category: FeatCategory | null;
  /** The track's display name ("General", "Epic Boon"), or null when the system has no tracks.
   *  Carried here rather than mapped at the render site so a UI cannot show the raw key. */
  categoryLabel: string | null;
  /** The `source` line written onto the sheet when this feat is taken. Per-system because "General
   *  feat" is a 2024 phrase; a 2014 sheet should just say "Feat", which is what 2014 calls it. */
  sourceLabel: string;
  /** Human-readable prerequisite, where the system publishes one. Shown verbatim, never parsed. */
  prerequisiteText?: string;
}

const CATEGORY_LABEL: Record<FeatCategory, string> = {
  origin: 'Origin',
  general: 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
};

/** Slot options a system's rules actually offer. */
export interface FeatSlotOption {
  id: FeatSlot;
  label: string;
  hint: string;
}

const SLOTS_2024: FeatSlotOption[] = [
  { id: 'origin', label: 'Origin', hint: 'From your background at level 1. Grants no ability increase.' },
  { id: 'fighting-style', label: 'Fighting Style', hint: 'From a martial class feature. Grants no ability increase.' },
  { id: 'asi', label: 'ASI / Epic Boon', hint: 'At an Ability Score Improvement level. General feats grant +1 to an ability.' },
];

// 2014 has exactly ONE slot, and offering the 2024 three would be the picker asserting a structure
// the edition does not have — the same shape of error as showing 2024 content on a 2014 sheet.
// A feat REPLACES an ASI; it does not occupy a track beside one.
const SLOTS_2014: FeatSlotOption[] = [
  {
    id: 'asi',
    label: 'Instead of an ability increase',
    hint: 'A 2014 feat is an optional rule taken in place of an Ability Score Improvement, at the levels your class grants one.',
  },
];

/** The slot choices a system offers. Empty for a system with no feat model of this shape. */
export function featSlotsForSystem(system: string): FeatSlotOption[] {
  if (system === 'dnd5e-2024') return SLOTS_2024;
  if (system === 'dnd5e-2014') return SLOTS_2014;
  return [];
}

/**
 * Every feat a system publishes, normalised for a picker.
 *
 * An unknown system returns `[]`, and the picker's empty state says so honestly. That is the same
 * answer `resolveFeat` and `featEligibilityForSystem` give: PF2 and IG have their own feat models
 * and their own gates, and serving them a 5e list would be a bleed, not a convenience.
 */
export function featCatalogForSystem(system: string): PickerFeat[] {
  if (system === 'dnd5e-2024') {
    return FEATS_2024.map((f) => ({
      key: f.key,
      name: f.name,
      benefit: f.benefit,
      summary: null,
      category: f.category,
      categoryLabel: CATEGORY_LABEL[f.category],
      sourceLabel: `${CATEGORY_LABEL[f.category]} feat`,
      prerequisiteText: f.prerequisites?.map((p) => p.text).filter(Boolean).join(' · ') || undefined,
    }));
  }
  if (system === 'dnd5e-2014') {
    return FEATS_2014.map((f) => ({
      key: f.key,
      name: f.name,
      benefit: f.benefit,
      summary: f.summary,
      // Explicitly null, not a default category. See the header.
      category: null,
      categoryLabel: null,
      sourceLabel: 'Feat',
      prerequisiteText: f.prerequisites?.map((p) => p.text).filter(Boolean).join(' · ') || undefined,
    }));
  }
  return [];
}

/**
 * Why a system's picker is empty, for the empty state to say something true.
 *
 * The distinction matters to a reader: 2014's catalog is COMPLETE at one feat (SRD 5.1 reproduces
 * only Grappler — see `FEATS_2014_STATUS`), whereas PF2 and IG simply do not use this feat model.
 * "No feat library yet" implies unfinished work in both cases, and is wrong in both.
 */
export function featCatalogNote(system: string): string {
  if (system === 'dnd5e-2014' || system === 'dnd5e-2024') {
    return 'Only the feats our licensed sources publish are listed. You can still add one by hand as a feature.';
  }
  return 'This game system has its own feat rules and its own picker — 5e feats do not apply here.';
}
