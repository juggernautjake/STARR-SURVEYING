// worker/src/research/cross-source-discovery.ts — the discovery pass (plan A1).
//
// The cross-source acquisition engine first asks EVERY in-scope source what it offers, before
// downloading or buying anything. This pass iterates the source registry (A0) and collects a metadata
// MANIFEST: one entry per document a source says it has, with the identifiers and cost needed to later
// match the same document across sources (A2) and pick the cheapest source per document (A3). It
// performs no capture and no purchase — that is A4, and keeping discovery cheap is what lets the
// engine avoid paying for anything a free source already has.
//
// The per-source SEARCH is injected: this module owns the ordering, error isolation and manifest
// shape; the real adapters (Bell clerk, TexasFile search, …) are supplied by the caller that wires
// this into the live run (A7). Pure orchestration, so it is unit-tested with fakes.

import { acquisitionSourcesFor, type AcquisitionSource } from './acquisition-sources.js';
import type { SelectionWant } from './selection-wants.js';

/** What the run knows to search each source by. Any subset may be present. */
export interface DiscoveryTarget {
  county: string;
  ownerName?: string;
  subdivision?: string;
  lot?: string;
  /** Specific instruments already located (e.g. from CAD deed history) to look up directly. */
  instruments?: string[];
  bookPages?: Array<{ book?: string; volume?: string; page?: string }>;
}

/** One document a source reports it can supply — metadata only, no file yet. */
export interface ManifestEntry {
  sourceId: string;
  kind: 'free' | 'paid';
  /** 'deed' | 'plat' | 'easement' | … (the source's classification). */
  docType: string;
  instrument?: string;
  book?: string;
  page?: string;
  recordingDate?: string;
  grantor?: string;
  grantee?: string;
  pageCount?: number;
  /** Per-document cost to acquire from this source; 0 for a free source. */
  unitCostUsd: number;
  /** A page/preview reference (URL or id) the acquire step can use. */
  previewRef?: string;
  canFreeCapture: boolean;
  canPurchase: boolean;
}

/** Injected per-source search: given a source + target, return the documents that source offers. */
export type SourceSearchFn = (
  source: AcquisitionSource,
  target: DiscoveryTarget,
) => Promise<ManifestEntry[]>;

export interface SourceSearchOutcome {
  sourceId: string;
  kind: 'free' | 'paid';
  found: number;
  error?: string;
}

export interface DiscoveryResult {
  /** Every document every source reported, flat. Matching into clusters is A2. */
  entries: ManifestEntry[];
  /** Per-source outcome, so the operator can see what searched and what failed. */
  searched: SourceSearchOutcome[];
}

export interface DiscoverOptions {
  /** When false, paid sources are not searched (a free-only run). Defaults to true. */
  paidEnabled?: boolean;
  log?: (message: string) => void;
}

/**
 * Search every in-scope source and collect what each offers — the availability manifest (A1). Free
 * sources are searched before paid ones (registry order). One source's failure never sinks the pass:
 * it is recorded in `searched` and the others still run. No capture, no purchase.
 */
export async function discoverAcrossSources(
  county: string,
  wants: SelectionWant[],
  target: DiscoveryTarget,
  search: SourceSearchFn,
  opts: DiscoverOptions = {},
): Promise<DiscoveryResult> {
  const log = opts.log ?? (() => {});
  const sources = acquisitionSourcesFor(county, wants, { paidEnabled: opts.paidEnabled });
  const entries: ManifestEntry[] = [];
  const searched: SourceSearchOutcome[] = [];

  for (const src of sources) {
    try {
      const found = await search(src, target);
      entries.push(...found);
      searched.push({ sourceId: src.source.id, kind: src.kind, found: found.length });
      log(`${src.source.label} (${src.kind}): ${found.length} document(s)`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      searched.push({ sourceId: src.source.id, kind: src.kind, found: 0, error });
      log(`${src.source.label} (${src.kind}): search failed — ${error}`);
    }
  }

  return { entries, searched };
}
