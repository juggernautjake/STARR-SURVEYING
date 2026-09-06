// worker/src/research/cross-source-match.ts — cluster the same document across sources (plan A2).
//
// Discovery (A1) returns a flat list of "source X has document Y". Before deciding where to acquire
// each document (A3) the engine must know which of those entries are the SAME underlying instrument —
// otherwise it would buy from TexasFile a deed the county clerk already has for free, which is the
// whole thing the owner asked to avoid.
//
// The cross-check compares every signal a record carries (owner 2026-09-05: "names, dates, location
// and instrument number and anything else"): an instrument number or book+page uniquely identifies a
// recorded instrument, so either is a DEFINITE match; otherwise the engine SCORES agreement across
// recording date, grantor, grantee and legal location, and only the borderline cases go to the
// injected AI image comparison. Pure except for the injected judge, so it is unit-tested with fakes.

import type { ManifestEntry } from './cross-source-discovery.js';

/** A real document, and every source that offers it (with each source's cost). */
export interface DocumentCluster {
  docType: string;
  instrument?: string;
  book?: string;
  page?: string;
  recordingDate?: string;
  grantor?: string;
  grantee?: string;
  legalDescription?: string;
  subdivision?: string;
  lot?: string;
  block?: string;
  /** One entry per source that has this document. */
  sources: ManifestEntry[];
}

/** Digits-only instrument, so `2019-3389` ≡ `20193389` ≡ `2019 3389` across vendors. */
export function normInstrument(raw?: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/** Lowercased, punctuation-stripped, whitespace-collapsed text for tolerant name/legal comparison. */
export function normText(raw?: string): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[.,#/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Two names agree if, normalised, one contains the other (handles "LHCS LLC" vs "LHCS, LLC."). */
function namesAgree(a?: string, b?: string): boolean {
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** The location signals two entries share (legal description, or subdivision+lot(+block), or situs). */
function locationAgrees(a: ManifestEntry, b: ManifestEntry): boolean {
  if (a.legalDescription && b.legalDescription && namesAgree(a.legalDescription, b.legalDescription)) return true;
  if (a.subdivision && b.subdivision && a.lot && b.lot
    && namesAgree(a.subdivision, b.subdivision)
    && normText(a.lot) === normText(b.lot)
    && normText(a.block ?? '') === normText(b.block ?? '')) return true;
  if (a.situsAddress && b.situsAddress && namesAgree(a.situsAddress, b.situsAddress)) return true;
  return false;
}

/** Which signals two entries agree on. `location` folds legal/subdivision/situs together. */
export interface MatchSignals {
  instrument: boolean;
  bookPage: boolean;
  date: boolean;
  grantor: boolean;
  grantee: boolean;
  location: boolean;
}

export function matchSignals(a: ManifestEntry, b: ManifestEntry): MatchSignals {
  const ia = normInstrument(a.instrument);
  const ib = normInstrument(b.instrument);
  return {
    instrument: !!ia && ia === ib,
    bookPage: !!a.book && !!a.page && normText(a.book) === normText(b.book) && normText(a.page) === normText(b.page),
    date: !!a.recordingDate && a.recordingDate === b.recordingDate,
    grantor: namesAgree(a.grantor, b.grantor),
    grantee: namesAgree(a.grantee, b.grantee),
    location: locationAgrees(a, b),
  };
}

const WEIGHTS = { date: 0.4, grantor: 0.25, grantee: 0.25, location: 0.4 } as const;
/** At/above this the entries are the same document on metadata alone. */
export const CONFIDENT_SAME = 0.7;
/** Below this they are different. Between it and CONFIDENT_SAME → ask the AI judge. */
export const NEEDS_JUDGE = 0.4;

/**
 * Confidence (0..1) that two entries are the same document. An instrument or book+page match is
 * DEFINITE (1). Otherwise a weighted sum of recording-date, grantor, grantee and location agreement.
 */
export function matchConfidence(a: ManifestEntry, b: ManifestEntry): number {
  const s = matchSignals(a, b);
  if (s.instrument || s.bookPage) return 1;
  let score = 0;
  if (s.date) score += WEIGHTS.date;
  if (s.grantor) score += WEIGHTS.grantor;
  if (s.grantee) score += WEIGHTS.grantee;
  if (s.location) score += WEIGHTS.location;
  return Math.min(1, score);
}

/**
 * A metadata key two entries share IFF they are DEFINITELY the same document (instrument, or
 * book+page). Returns null for entries that must be placed by scoring/judge instead.
 */
export function metaKey(e: ManifestEntry): string | null {
  const instr = normInstrument(e.instrument);
  if (instr) return `i:${instr}`;
  if (e.book && e.page) return `bp:${normText(e.book)}/${normText(e.page)}`;
  return null;
}

/** Injected AI comparison: are these two entries the same document? Used only for borderline pairs. */
export type SamenessJudge = (a: ManifestEntry, b: ManifestEntry) => Promise<boolean>;

function newCluster(e: ManifestEntry): DocumentCluster {
  return {
    docType: e.docType,
    instrument: e.instrument,
    book: e.book,
    page: e.page,
    recordingDate: e.recordingDate,
    grantor: e.grantor,
    grantee: e.grantee,
    legalDescription: e.legalDescription,
    subdivision: e.subdivision,
    lot: e.lot,
    block: e.block,
    sources: [e],
  };
}

function absorb(c: DocumentCluster, e: ManifestEntry): void {
  c.sources.push(e);
  // Fill in any identifier the cluster lacked but this entry has.
  c.instrument ??= e.instrument;
  c.recordingDate ??= e.recordingDate;
  c.grantor ??= e.grantor;
  c.grantee ??= e.grantee;
  c.book ??= e.book;
  c.page ??= e.page;
  c.legalDescription ??= e.legalDescription;
  c.subdivision ??= e.subdivision;
  c.lot ??= e.lot;
  c.block ??= e.block;
}

/**
 * Cluster manifest entries so each cluster is one real document offered by one or more sources.
 * Definite (instrument / book+page) matches group exactly. Every other entry is scored against the
 * existing clusters (same docType): a CONFIDENT_SAME score merges on metadata alone; a borderline
 * score (≥ NEEDS_JUDGE) is settled by the injected AI judge; anything lower starts its own cluster.
 * Fails toward NOT merging — a false merge hides a document, a false split at worst compares twice.
 */
export async function clusterEntries(
  entries: ManifestEntry[],
  judge?: SamenessJudge,
): Promise<DocumentCluster[]> {
  const byKey = new Map<string, DocumentCluster>();
  const clusters: DocumentCluster[] = [];
  const scored: ManifestEntry[] = [];

  // Pass 1 — definite grouping by instrument / book+page.
  for (const e of entries) {
    const key = metaKey(e);
    if (!key) { scored.push(e); continue; }
    const existing = byKey.get(key);
    if (existing) absorb(existing, e);
    else {
      const c = newCluster(e);
      byKey.set(key, c);
      clusters.push(c);
    }
  }

  // Pass 2 — place the rest by multi-signal score, judge for the borderline.
  for (const e of scored) {
    let best: { cluster: DocumentCluster; conf: number } | null = null;
    for (const c of clusters) {
      if (c.docType !== e.docType) continue;
      const conf = matchConfidence(c.sources[0], e);
      if (!best || conf > best.conf) best = { cluster: c, conf };
    }
    if (best && best.conf >= CONFIDENT_SAME) {
      absorb(best.cluster, e);
    } else if (best && best.conf >= NEEDS_JUDGE && judge && (await judge(best.cluster.sources[0], e))) {
      absorb(best.cluster, e);
    } else {
      clusters.push(newCluster(e));
    }
  }

  return clusters;
}

/** True when a cluster is available from at least one FREE source. */
export function hasFreeSource(c: DocumentCluster): boolean {
  return c.sources.some((s) => s.kind === 'free' && s.canFreeCapture);
}

/** The cheapest source offering a cluster (free beats paid; then lowest unitCostUsd). */
export function cheapestSource(c: DocumentCluster): ManifestEntry | null {
  if (c.sources.length === 0) return null;
  return [...c.sources].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'free' ? -1 : 1;
    return a.unitCostUsd - b.unitCostUsd;
  })[0];
}
