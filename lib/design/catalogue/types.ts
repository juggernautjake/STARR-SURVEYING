// lib/design/catalogue/types.ts — what a catalogue entry is.
//
// Slice C3 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────────────────────────
//
// The Design Studio's palette holds one entry per element the app can render. An entry has to serve
// four masters at once, and the schema is shaped by all four:
//
//   the palette      needs a label, a preview, keywords and a category
//   the canvas       needs markup, a default size, resize behaviour and snap anchors
//   the inspector    needs to know which properties may be edited, and to what
//   the EXPORT       needs the real class names, so "build this" means "use .job-detail__action
//                    --ghost", not "make a grey button"
//
// The fourth is the one that makes the whole tool worth building. A mockup that cannot name the
// thing it is a mockup OF leaves every ambiguity to be resolved in a round trip.
//
// ── PROVENANCE IS NOT OPTIONAL ──────────────────────────────────────────────────────────────────
//
// Every entry cites the file and line it was derived from (`source`) and carries a hash of that
// source (`sourceHash`). An entry that cannot say where it came from is a guess, and a catalogue of
// guesses is worse than no catalogue because it is trusted. The drift ratchet (slice C10) recomputes
// the hashes and fails the suite when the code moves underneath an entry.

/** The sixteen palette tabs. Fifteen hold components that exist in the app; `shape` holds free
 *  primitives that answer to nothing (§4.6 of the plan). */
export type CategoryId =
  | 'button'
  | 'text'
  | 'input'
  | 'select'
  | 'toggle'
  | 'tag'
  | 'card'
  | 'table'
  | 'nav'
  | 'overlay'
  | 'feedback'
  | 'media'
  | 'layout'
  | 'icon'
  | 'emoji'
  | 'shape';

/**
 * Which surface an entry belongs to.
 *
 * Not cosmetic: the marketing site and the employee portal have deliberately different vocabularies
 * — `tokens.css` says so out loud about the customer-facing document surfaces ("a proposal reads as
 * a document rather than as a screen from somebody's internal tool"). The palette filters on this so
 * it cannot offer a marketing hero button for an admin toolbar.
 */
export type AreaId =
  | 'admin'
  | 'marketing'
  | 'customer'
  | 'auth'
  | 'shared'
  | 'cad'
  | 'research'
  | 'dnd'
  | 'andrew-ash'
  | 'harness';

/** The surfaces the palette offers by default. The rest are catalogued but filtered out. */
export const DEFAULT_AREAS: AreaId[] = ['admin', 'marketing', 'customer', 'auth', 'shared'];

/** States an element can be shown in. Most of this app's inconsistency hides in the ones nobody
 *  draws, which is why a mockup has to be able to say "and this is the disabled one". */
export type StateName = 'default' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading' | 'error' | 'empty' | 'selected';

/** Where an element snaps from. Nine box points plus the text baseline, because aligning two labels
 *  by their boxes is not the same as aligning them by their baselines and the difference shows. */
export type AnchorName =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'baseline';

export interface AnchorSet {
  /** Which anchors this element offers. Most offer all nine; a line offers its two ends. */
  available: AnchorName[];
  /** The one a drag uses when the element is grabbed by its body rather than a handle. */
  preferred: AnchorName;
}

/** An editable hole in an entry's markup: `{{label}}`, `{{icon}}`, `{{count}}`. */
export interface Slot {
  name: string;
  kind: 'text' | 'icon' | 'emoji' | 'number' | 'image' | 'rich';
  label: string;
  /** What it says before anybody types anything. Realistic by policy — see §9 of the plan: a slot
   *  that defaults to "Lorem ipsum" teaches you nothing about whether the layout survives real
   *  data. */
  default: string;
  /** The longest realistic value, for the artboard's stress toggle. A 190px overflow on a phone was
   *  caused by exactly this going unconsidered (2026-08-22, the New Job form's project select). */
  stress?: string;
  optional?: boolean;
}

/** Something the inspector may change about an element. */
export interface PropDef {
  name: string;
  label: string;
  kind: 'color' | 'length' | 'number' | 'percent' | 'select' | 'toggle' | 'font' | 'shadow' | 'corners';
  /** The CSS property (or properties) it writes. Absent for props that swap a variant class. */
  css?: string | string[];
  /** For `select`. */
  options?: { value: string; label: string }[];
  /** Token names offered before any free value, so a mockup stays inside the design system unless
   *  somebody deliberately steps outside it. */
  tokens?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  group?: 'content' | 'layout' | 'type' | 'colour' | 'border' | 'effects' | 'shape';
}

/** A modifier form of an entry — `--primary`, `--sm`, `is-on`. */
export interface Variant {
  id: string;
  label: string;
  /** Classes added on top of the base. */
  classes: string[];
  /** Overrides to the entry's defaults when this variant is chosen. */
  defaults?: Record<string, string | number | boolean>;
  /** Marks the phone-shaped form of an entry, which the palette offers first while the mobile view
   *  is active — a suggestion, never a restriction. */
  forView?: 'desktop' | 'mobile';
}

/** Where an entry came from. `kind` matters: a CSS rule and an inline style are different kinds of
 *  evidence, and an entry derived from inline styles is telling you something about the codebase. */
export interface SourceRef {
  file: string;
  line: number;
  kind: 'css' | 'styled-jsx' | 'inline' | 'tsx';
  note?: string;
}

/** How often, and where, the real app uses this. Drives palette ranking: the button the app uses
 *  274 times should be the first button you see. */
export interface UsageRef {
  route: string;
  count: number;
}

export interface CatalogueEntry {
  /** Stable, human-readable: `button.secondary`, `input.date`, `shape.rectangle`. */
  id: string;
  category: CategoryId;
  areas: AreaId[];
  label: string;
  description: string;

  // ── Search (§4.7). Three hand-written vocabularies plus one generated. ────────────────────────
  /** Words a person might type that mean this thing. */
  keywords: string[];
  /** Other words for the same thing — `datepicker`, `day picker`, `when`. */
  synonyms: string[];
  /** Concept-graph nodes this belongs to. Typing `date` finds everything in `time`. */
  concepts: string[];

  /** Markup with `{{slot}}` holes. Real tags, real classes — the artboard renders this as-is. */
  html: string;
  /** The real class names, which is what the export tells the builder to use. */
  classes: string[];
  slots: Slot[];
  props: PropDef[];
  defaults: Record<string, string | number | boolean>;
  variants: Variant[];
  states: StateName[];

  size: {
    default: { w: number; h: number };
    resize: 'both' | 'width' | 'height' | 'none';
    min?: { w?: number; h?: number };
    /** True when height is dictated by content (a text block), so the inspector says so rather than
     *  offering a height that will not hold. */
    contentHeight?: boolean;
  };
  anchors: AnchorSet;

  source: SourceRef[];
  usage: UsageRef[];
  usageCount: number;

  /** Rules the in-canvas checker applies to this entry (§10). A 40px floor on a control is not a
   *  style preference; a mis-tap on Delete is not cosmetic. */
  contract?: {
    minTapTarget?: number;
    minFontPx?: number;
    tokenColorsOnly?: boolean;
  };

  /** Hash of the cited source, for the drift ratchet. */
  sourceHash: string;
}

/** A raw scan candidate that was deliberately NOT promoted, and why. Nothing is dropped in
 *  silence — an unexplained omission is indistinguishable from an oversight. */
export interface CurationExclusion {
  className: string;
  reason: 'duplicate-of' | 'one-off' | 'dead' | 'deprecated' | 'utility' | 'out-of-scope' | 'internal';
  /** For `duplicate-of`, the entry id that covers it. */
  coveredBy?: string;
  note?: string;
}
