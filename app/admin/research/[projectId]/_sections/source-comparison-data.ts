// app/admin/research/[projectId]/_sections/source-comparison-data.ts — plan 1.6 (A6).
//
// The SOURCE-COMPARISON manifest the free-first engine writes at buy time — "a detailed analysis of
// what all the sources provide", as the owner asked to SEE it. The worker
// (`runEarlyChecklistPurchase` in worker/src/index.ts) compares every discovered document across the
// sources that offer it (the free CAD record vs TexasFile), decides free-capture / purchase / skip,
// and persists the rows to `analysis_metadata.sourceComparison`. This module shapes what the page
// reads off that key — the same "declare the shape the page expects" pattern as gis-quality-data.ts,
// answering "no manifest" and "an empty manifest" in one place so the card can stay dumb.

import type { ResearchProject } from '@/types/research';

/** One source that offers a document, and what it costs there. */
export interface SourceOffer {
  sourceId: string;
  kind: 'free' | 'paid';
  unitCostUsd: number;
  canFreeCapture: boolean;
  canPurchase: boolean;
}

export type SourceDecision = 'free_capture' | 'purchase' | 'skip';

/** One document, every source that has it, and the engine's decision + why. */
export interface SourceComparisonRow {
  docType: string;
  instrument: string | null;
  book: string | null;
  page: string | null;
  recordingDate: string | null;
  relevance: number;
  sources: SourceOffer[];
  decision: SourceDecision;
  chosenSource: string | null;
  costUsd: number;
  reason: string;
}

export interface SourceComparison {
  rows: SourceComparisonRow[];
  /** How many documents the engine will buy (paid-exclusive), free-capture, and skip. */
  purchaseCount: number;
  freeCount: number;
  skipCount: number;
  /** Total planned paid spend across the manifest. */
  plannedPaidUsd: number;
}

/** Every key this module reads, held against the worker by the contract test. */
export const SOURCE_COMPARISON_KEYS = [
  'docType', 'instrument', 'book', 'page', 'recordingDate', 'relevance',
  'sources', 'decision', 'chosenSource', 'costUsd', 'reason',
  'sourceId', 'kind', 'unitCostUsd', 'canFreeCapture', 'canPurchase',
] as const;

/**
 * Read + summarise the manifest, or return null when there is none. A run made before the engine
 * shipped, a free-only run, or a run whose discovery failed all legitimately carry no manifest —
 * "no manifest" and "this run produced no comparison" are the same, normal, silent case.
 */
export function sourceComparisonOf(project: ResearchProject | null): SourceComparison | null {
  const meta = (project?.analysis_metadata ?? {}) as Record<string, unknown>;
  const raw = meta.sourceComparison;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const rows: SourceComparisonRow[] = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      docType: String(r.docType ?? 'document'),
      instrument: (r.instrument as string | null) ?? null,
      book: (r.book as string | null) ?? null,
      page: (r.page as string | null) ?? null,
      recordingDate: (r.recordingDate as string | null) ?? null,
      relevance: typeof r.relevance === 'number' ? r.relevance : 0,
      sources: Array.isArray(r.sources)
        ? (r.sources as Record<string, unknown>[]).map((s) => ({
            sourceId: String(s.sourceId ?? '—'),
            kind: s.kind === 'paid' ? 'paid' : 'free',
            unitCostUsd: typeof s.unitCostUsd === 'number' ? s.unitCostUsd : 0,
            canFreeCapture: !!s.canFreeCapture,
            canPurchase: !!s.canPurchase,
          }))
        : [],
      decision: r.decision === 'purchase' || r.decision === 'skip' ? r.decision : 'free_capture',
      chosenSource: (r.chosenSource as string | null) ?? null,
      costUsd: typeof r.costUsd === 'number' ? r.costUsd : 0,
      reason: String(r.reason ?? ''),
    }));

  return {
    rows,
    purchaseCount: rows.filter((r) => r.decision === 'purchase').length,
    freeCount: rows.filter((r) => r.decision === 'free_capture').length,
    skipCount: rows.filter((r) => r.decision === 'skip').length,
    plannedPaidUsd: Number(rows.reduce((sum, r) => sum + (r.decision === 'purchase' ? r.costUsd : 0), 0).toFixed(2)),
  };
}

/** A short human label for a document row: instrument, else book/page, else the type. */
export function rowLabel(r: SourceComparisonRow): string {
  if (r.instrument) return `Instrument ${r.instrument}`;
  if (r.book && r.page) return `Vol ${r.book} / Pg ${r.page}`;
  return r.docType;
}
