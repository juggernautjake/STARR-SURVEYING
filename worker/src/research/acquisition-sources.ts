// worker/src/research/acquisition-sources.ts — the source registry the cross-source engine searches (A0).
//
// The cross-source acquisition engine (plan Phase A) searches every free AND paid source that can
// supply a checklist document for this county, compares what each offers, and buys only what a free
// source cannot provide. This module answers the first question — WHICH sources to search — by
// reusing the existing `SOURCE_CATALOGUE` (not a second list) scoped to the run's checklist. Pure, so
// the selection is unit-tested without a browser.

import {
  SOURCE_CATALOGUE,
  servesCounty,
  isSourceWired,
  type ResearchSource,
  type SourceCapability,
} from './research-modes.js';
import type { SelectionWant } from './selection-wants.js';

/** The clerk-document capability a paid want implies. Map/GIS wants are FREE captures the capture
 *  plan handles, not clerk sources, so they map to nothing here. */
export function capabilityForWant(w: SelectionWant): SourceCapability | null {
  switch (w.documentType) {
    case 'deed':
    case 'easement':
      return 'conveyances';
    case 'plat':
      return 'plats';
    default:
      return null; // 'map' etc.
  }
}

/** The distinct document capabilities this run's checklist asks the acquisition engine to find. */
export function wantedCapabilities(wants: SelectionWant[]): SourceCapability[] {
  const set = new Set<SourceCapability>();
  for (const w of wants) {
    const c = capabilityForWant(w);
    if (c) set.add(c);
  }
  return [...set];
}

export interface AcquisitionSource {
  source: ResearchSource;
  kind: 'free' | 'paid';
}

export interface AcquisitionSourcesOptions {
  /** When false, paid sources (TexasFile, …) are excluded — a free-only run. Defaults to true. */
  paidEnabled?: boolean;
  /** Injectable for tests; defaults to the live catalogue. */
  catalogue?: ResearchSource[];
}

/**
 * The sources the discovery pass should search for THIS run: every WIRED source that serves the
 * county and covers a capability the checklist asked for — free and paid together, so the engine can
 * compare them and buy only what a free source cannot provide. Free sources come first, then paid, so
 * a caller that iterates in order tries the free options before any paid one.
 */
export function acquisitionSourcesFor(
  county: string,
  wants: SelectionWant[],
  opts: AcquisitionSourcesOptions = {},
): AcquisitionSource[] {
  const paidEnabled = opts.paidEnabled !== false;
  const catalogue = opts.catalogue ?? SOURCE_CATALOGUE;
  const caps = new Set(wantedCapabilities(wants));
  if (caps.size === 0) return [];

  const chosen = catalogue
    .filter((s) => servesCounty(s, county))
    .filter((s) => isSourceWired(s, county))
    .filter((s) => s.capabilities.some((c) => caps.has(c)))
    .filter((s) => s.cost === 'free' || paidEnabled)
    .map((s): AcquisitionSource => ({ source: s, kind: s.cost === 'free' ? 'free' : 'paid' }));

  // Free before paid — the anti-waste ordering (plan S-14): try what is free before spending.
  return chosen.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'free' ? -1 : 1));
}
