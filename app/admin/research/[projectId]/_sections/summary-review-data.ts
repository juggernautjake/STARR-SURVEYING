// app/admin/research/[projectId]/_sections/summary-review-data.ts — B1a.
//
// The Review tab's Summary panel: the first screen a surveyor sees when a run finishes, and the
// widest cast in the file — 26 keys off `analysis_metadata.result`, plus three counts that come
// from the project's own stats row.
//
// Same argument as `survey-review-data.ts`: a cast is a claim, not a check, and an empty stat is
// indistinguishable from a stat that was never reported. The keys are listed at the bottom so
// `review-reads-what-the-worker-writes.test.ts` can hold them against the worker.

export interface SummaryBoundary {
  type?: string;
  callCount?: number;
  confidence?: number;
  verified?: boolean;
  bearingsAndDistances?: string[];
  monuments?: string[];
}

export interface SummaryStats {
  document_count: number;
  data_point_count: number;
  discrepancy_count: number;
}

export interface SummaryReviewData {
  finalSummary: string;
  ownerName: string;
  propertyId: string;
  situsAddress: string;
  acreage: string;
  legalDesc: string;
  docCount: number;
  dpCount: number;
  discCount: number;
  durationMs: number;
  callCount: number;
  monumentCount: number;
  confidenceTier: string;
  confidenceScore: number;
  fema: { floodZone?: string; inSFHA?: boolean } | null;
  txdot: { highwayName?: string; rowWidth?: number | null } | null;
  screenshotCount: number;
  errorCount: number;
  fatalErrors: number;
  /** Whether the run reported a document count at all — `0` is a finding, absent is not. */
  hasDocCount: boolean;
}

export interface SummaryProject {
  parcel_id?: string | null;
  legal_description_summary?: string | null;
  analysis_metadata?: unknown;
}

/** Human duration: minutes and seconds past a minute, seconds below it. */
export function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function summaryReviewData(project: SummaryProject, stats: SummaryStats): SummaryReviewData {
  const meta = (project.analysis_metadata ?? null) as Record<string, unknown> | null;
  const result = (meta?.result ?? null) as Record<string, unknown> | null;

  const text = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    return '';
  };
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const boundary = (result?.boundary ?? null) as SummaryBoundary | null;
  const errors = Array.isArray(result?.errors)
    ? (result.errors as Array<{ recovered?: boolean }>)
    : [];

  // `stats.document_count || result.documentCount` — `||` treats a genuine 0 as "ask the other
  // source", which is right here: the stats row is not populated until the run's rows land, so a
  // zero there really does mean "not counted yet" rather than "none found".
  const docCount = stats.document_count || num(result?.documentCount);

  return {
    finalSummary: text(result?.finalSummary ?? meta?.finalSummary),
    ownerName: text(result?.ownerName ?? meta?.ownerName),
    propertyId: text(result?.propertyId ?? project.parcel_id),
    situsAddress: text(result?.situsAddress),
    acreage: text(result?.acreage),
    legalDesc: text(result?.legalDescription ?? project.legal_description_summary),
    docCount,
    dpCount: stats.data_point_count,
    discCount: stats.discrepancy_count || num(result?.discrepancyCount),
    durationMs: num(result?.duration_ms),
    callCount: boundary?.callCount ?? boundary?.bearingsAndDistances?.length ?? 0,
    monumentCount: boundary?.monuments?.length ?? 0,
    confidenceTier: text(result?.confidenceTier),
    confidenceScore: num(result?.confidenceScore),
    fema: (result?.fema ?? null) as SummaryReviewData['fema'],
    txdot: (result?.txdot ?? null) as SummaryReviewData['txdot'],
    screenshotCount: num(result?.screenshotCount),
    errorCount: errors.length,
    // `!e.recovered`, not `=== false`: an error that never said whether it was recovered is not
    // the same as one that said it was. The safe reading is the one that surfaces it — and it is
    // what this panel did before the extraction.
    fatalErrors: errors.filter((e) => !e.recovered).length,
    // ── "0 documents" IS THE FINDING ──────────────────────────────────────────────────────────
    //
    // The stat was rendered behind `docCount > 0`, so a run that retrieved NOTHING showed no
    // Documents stat at all — identical to a run where the count was never reported. The same
    // shortcut was hiding a zero document count in `PipelineProgressPanel`, fixed the same day.
    //
    // On the Review summary it matters more: this is the screen somebody signs off from, and a
    // missing row reads as "not applicable" rather than "we found none".
    hasDocCount: docCount > 0 || result?.documentCount != null || stats.document_count != null,
  };
}

/** Every `result` key this panel reads, for the contract test. */
export const SUMMARY_RESULT_KEYS = [
  'finalSummary', 'ownerName', 'propertyId', 'situsAddress', 'acreage', 'legalDescription',
  'documentCount', 'discrepancyCount', 'duration_ms', 'confidenceTier', 'confidenceScore',
  'screenshotCount', 'errors', 'fema', 'txdot',
  'boundary.type', 'boundary.callCount', 'boundary.confidence', 'boundary.verified',
  'boundary.bearingsAndDistances', 'boundary.monuments',
  'fema.floodZone', 'fema.inSFHA', 'txdot.highwayName', 'txdot.rowWidth', 'errors.recovered',
] as const;
