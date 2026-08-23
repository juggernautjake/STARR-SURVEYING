// lib/design/catalogue/define.ts — the helper every curated entry is written with.
//
// Slice C3 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// A `CatalogueEntry` has twenty fields and most of them are the same for most entries: nine anchors,
// the default state list, `resize: 'both'`, an empty exclusion set. Writing all of that out by hand
// per entry is how a catalogue of three hundred entries becomes inconsistent — one entry forgets
// `states`, another spells a concept differently, a third omits its source.
//
// So entries are declared with the parts that are actually specific to them, and this fills the rest
// in. Two of the defaults are load-bearing rather than convenient:
//
//   · `sourceHash` is COMPUTED from the cited source, never passed. An entry cannot claim a
//     provenance it does not have, and the drift ratchet (C10) recomputes the same hash from the
//     same files. A hash you can type by hand is a hash that gets typed by hand when a test fails.
//
//   · `usageCount` is summed from `usage`, so palette ranking cannot disagree with the evidence.

import { createHash } from 'node:crypto';
import type {
  AnchorSet, AreaId, CatalogueEntry, CategoryId, PropDef, SourceRef, StateName, Slot, UsageRef,
  Variant,
} from './types';

/** Nine box anchors plus a baseline — what most elements offer. */
export const BOX_ANCHORS: AnchorSet = {
  available: [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ],
  preferred: 'top-left',
};

/** Text sits on a baseline, and aligning two labels by their boxes is not the same as aligning them
 *  by their baselines. Anything whose job is to be read gets this. */
export const TEXT_ANCHORS: AnchorSet = {
  available: [...BOX_ANCHORS.available, 'baseline'],
  preferred: 'baseline',
};

/** What an interactive control can be shown as. `empty` is not in the list because a control is
 *  never empty — a list is. */
export const INTERACTIVE_STATES: StateName[] = ['default', 'hover', 'focus', 'active', 'disabled'];

/** Properties every element may have edited, whatever it is. Category-specific props are added on
 *  top of these in each curated file. */
export const COMMON_PROPS: PropDef[] = [
  { name: 'opacity', label: 'Opacity', kind: 'percent', css: 'opacity', min: 0, max: 100, step: 1, group: 'effects' },
  { name: 'shadow', label: 'Shadow', kind: 'shadow', css: 'box-shadow', group: 'effects',
    tokens: ['--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-xl'] },
  { name: 'radius', label: 'Corner radius', kind: 'corners', css: 'border-radius', min: 0, max: 64, step: 1, unit: 'px', group: 'border' },
];

/** Colour props, offered with the token ramps first so a mockup stays inside the design system
 *  unless somebody deliberately steps outside it. */
export const COLOUR_PROPS: PropDef[] = [
  { name: 'background', label: 'Background', kind: 'color', css: 'background-color', group: 'colour',
    tokens: ['--color-bg-card', '--color-bg-app', '--color-bg-subtle', '--color-brand-navy', '--color-brand-red', '--color-success', '--color-error'] },
  { name: 'color', label: 'Text colour', kind: 'color', css: 'color', group: 'colour',
    tokens: ['--color-text-primary', '--color-text-secondary', '--color-text-tertiary', '--color-text-muted', '--color-text-on-brand'] },
  { name: 'borderColor', label: 'Border colour', kind: 'color', css: 'border-color', group: 'border',
    tokens: ['--color-border', '--color-border-strong', '--color-brand-navy'] },
];

/** Typography props. */
export const TYPE_PROPS: PropDef[] = [
  { name: 'fontFamily', label: 'Font', kind: 'font', css: 'font-family', group: 'type' },
  { name: 'fontSize', label: 'Size', kind: 'length', css: 'font-size', min: 8, max: 96, step: 1, unit: 'px', group: 'type' },
  { name: 'fontWeight', label: 'Weight', kind: 'select', css: 'font-weight', group: 'type',
    options: [
      { value: '400', label: 'Regular' },
      { value: '500', label: 'Medium' },
      { value: '600', label: 'Semibold' },
      { value: '700', label: 'Bold' },
      { value: '800', label: 'Extrabold' },
    ] },
  { name: 'lineHeight', label: 'Line height', kind: 'number', css: 'line-height', min: 0.8, max: 3, step: 0.05, group: 'type' },
  { name: 'letterSpacing', label: 'Letter spacing', kind: 'length', css: 'letter-spacing', min: -2, max: 8, step: 0.1, unit: 'px', group: 'type' },
  { name: 'textAlign', label: 'Align', kind: 'select', css: 'text-align', group: 'type',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Centre' },
      { value: 'right', label: 'Right' },
    ] },
];

/** The contract a tappable control is held to: 40px is the token height and the tap floor, and 12px
 *  is where text stops being readable on a phone at arm's length. Both are the same thresholds
 *  `scripts/ui-fit-sweep.mjs` measures the real app with, so the tool and the audit cannot
 *  disagree. */
export const CONTROL_CONTRACT = { minTapTarget: 40, minFontPx: 12, tokenColorsOnly: true };

export interface EntryInput {
  id: string;
  category: CategoryId;
  areas: AreaId[];
  label: string;
  description: string;
  keywords: string[];
  synonyms?: string[];
  concepts: string[];
  html: string;
  classes: string[];
  slots?: Slot[];
  props?: PropDef[];
  defaults?: Record<string, string | number | boolean>;
  variants?: Variant[];
  states?: StateName[];
  size: CatalogueEntry['size'];
  anchors?: AnchorSet;
  source: SourceRef[];
  usage?: UsageRef[];
  contract?: CatalogueEntry['contract'];
}

/**
 * Build a full entry from the parts that are specific to it.
 *
 * The hash covers the cited sources AND the entry's own rendered shape (`html` + `classes`): an
 * entry whose markup was edited without its source changing is also drift, and the ratchet should
 * say so rather than pass because the files it points at happen to be untouched.
 */
export function defineEntry(input: EntryInput): CatalogueEntry {
  const usage = input.usage ?? [];
  const sourceKey = [
    ...input.source.map((s) => `${s.kind}:${s.file}:${s.line}`).sort(),
    input.html.replace(/\s+/g, ' ').trim(),
    [...input.classes].sort().join(','),
  ].join('|');

  return {
    id: input.id,
    category: input.category,
    areas: input.areas,
    label: input.label,
    description: input.description,
    keywords: input.keywords,
    synonyms: input.synonyms ?? [],
    concepts: input.concepts,
    html: input.html,
    classes: input.classes,
    slots: input.slots ?? [],
    props: input.props ?? COMMON_PROPS,
    defaults: input.defaults ?? {},
    variants: input.variants ?? [],
    states: input.states ?? ['default'],
    size: input.size,
    anchors: input.anchors ?? BOX_ANCHORS,
    source: input.source,
    usage,
    usageCount: usage.reduce((n, u) => n + u.count, 0),
    contract: input.contract,
    sourceHash: createHash('sha256').update(sourceKey).digest('hex').slice(0, 16),
  };
}
