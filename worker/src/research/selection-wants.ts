// worker/src/research/selection-wants.ts — turn the Configure checklist into gather targets (plan S2)
//
// S1 gave the run a `GatherSelections` (which items to find, for the subject and optionally each
// adjoiner). This maps those selections onto concrete WANTS the gather run works through: each want
// says what document/capture to get, at what scope (the single most-recent one vs. all of them), and
// crucially whether it is a PAID TexasFile candidate (draws the TexasFile budget) or a FREE capture
// (a screenshot/tile, draws nothing). The two-budget accounting (B2) keys off `paid`.
//
// Pure so the expansion — especially "All Files" and the adjoiner duplication — is unit-tested.

import {
  type GatherSelections,
  type GatherSelectionKey,
} from './run-settings.js';

export type WantDocumentType = 'deed' | 'easement' | 'plat' | 'map';
export type WantScope = 'recent' | 'all' | 'single';
export type CaptureKind = 'google_map' | 'gis_satellite' | 'gis_parcel';

export interface SelectionWant {
  /** The selection this want came from (after expanding `all_files`). */
  key: Exclude<GatherSelectionKey, 'all_files'>;
  target: 'subject' | 'adjoiner';
  documentType: WantDocumentType;
  scope: WantScope;
  /** True → a TexasFile purchase candidate (draws the TexasFile budget); false → a free capture. */
  paid: boolean;
  /** For a free map/GIS capture, which kind. */
  captureKind?: CaptureKind;
  label: string;
}

/** One selection key → its want shape (before target is applied). `all_files` is expanded first. */
const SPEC: Record<Exclude<GatherSelectionKey, 'all_files'>, Omit<SelectionWant, 'target' | 'label' | 'key'>> = {
  recent_deed:     { documentType: 'deed',     scope: 'recent', paid: true },
  recent_easement: { documentType: 'easement', scope: 'recent', paid: true },
  recent_plat:     { documentType: 'plat',     scope: 'recent', paid: true },
  all_deeds:       { documentType: 'deed',     scope: 'all',    paid: true },
  all_plats:       { documentType: 'plat',     scope: 'all',    paid: true },
  google_map:      { documentType: 'map',      scope: 'single', paid: false, captureKind: 'google_map' },
  gis_satellite:   { documentType: 'map',      scope: 'single', paid: false, captureKind: 'gis_satellite' },
  gis_parcel:      { documentType: 'map',      scope: 'single', paid: false, captureKind: 'gis_parcel' },
};

// "All Files" means everything: every document type at full scope, plus every map/GIS capture. This
// is the default ("all information"), so it must be comprehensive rather than a synonym for one type.
const ALL_FILES_EXPANSION: Array<Exclude<GatherSelectionKey, 'all_files'>> = [
  'all_plats', 'all_deeds', 'recent_easement', 'google_map', 'gis_satellite', 'gis_parcel',
];

const LABELS: Record<Exclude<GatherSelectionKey, 'all_files'>, string> = {
  recent_deed: 'Most-recent deed',
  recent_easement: 'Most-recent easement',
  recent_plat: 'Most-recent plat',
  all_deeds: 'All deeds',
  all_plats: 'All plats',
  google_map: 'Google map view',
  gis_satellite: 'GIS satellite view',
  gis_parcel: 'GIS parcel map',
};

/** Expand a raw selection list: `all_files` → the full set; de-dup; keep a stable, priority order. */
function expand(keys: GatherSelectionKey[]): Array<Exclude<GatherSelectionKey, 'all_files'>> {
  const set = new Set<Exclude<GatherSelectionKey, 'all_files'>>();
  for (const k of keys) {
    if (k === 'all_files') ALL_FILES_EXPANSION.forEach((e) => set.add(e));
    else set.add(k);
  }
  // Priority order: visual first (plats/maps), then deeds, then easements — the owner's stated order
  // (drawings/plats → overhead views → the rest), applied to whatever survived the selection.
  const ORDER: Array<Exclude<GatherSelectionKey, 'all_files'>> = [
    'recent_plat', 'all_plats', 'gis_parcel', 'gis_satellite', 'google_map',
    'recent_deed', 'all_deeds', 'recent_easement',
  ];
  return ORDER.filter((k) => set.has(k));
}

function wantsFor(
  keys: GatherSelectionKey[],
  target: 'subject' | 'adjoiner',
): SelectionWant[] {
  return expand(keys).map((key) => ({
    key,
    target,
    label: (target === 'adjoiner' ? 'Adjoiner — ' : '') + LABELS[key],
    ...SPEC[key],
  }));
}

/**
 * Build the gather want-list from the run's selections. Subject wants first, then (if the adjoiner
 * toggle is on and it selected anything) the adjoiner wants — generic, applied to each adjoiner by
 * the acquisition step.
 */
export function selectionsToWants(selections: GatherSelections): SelectionWant[] {
  const subject = wantsFor(selections.items ?? [], 'subject');
  const adj = selections.adjoiners?.enabled ? wantsFor(selections.adjoiners.items ?? [], 'adjoiner') : [];
  return [...subject, ...adj];
}

/** The paid (TexasFile-candidate) wants — the ones the TexasFile budget must cover. */
export function paidWants(wants: SelectionWant[]): SelectionWant[] {
  return wants.filter((w) => w.paid);
}
/** The free-capture wants — maps/GIS, drawing on the other-sources budget (mostly $0). */
export function captureWants(wants: SelectionWant[]): SelectionWant[] {
  return wants.filter((w) => !w.paid);
}
