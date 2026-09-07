// lib/research/review-progress.ts — where the AI review is, as a percentage and a sentence.
//
// The owner asked (2026-09-07) for "one loading bar for the research stage that just deals with
// file/doc/image retrieval, and then a seperate loading bar for the analysis stage … two seperate
// cost counters for each stage as well". The research run's bar comes off the worker's phase ladder;
// this is the review's. The worker stamps `analysis_metadata.review.progress` as it reads (the tiled
// OCR pass), analyses (one app call per document) and finalizes (chain → crossref → coherence), and
// the app's coherence finalize stamps `done`. Pure, so the arithmetic is unit-tested without a
// database.

export type ReviewStage = 'reading' | 'analyzing' | 'finalizing' | 'done' | 'stopped';

export interface ReviewProgress {
  stage: ReviewStage;
  /** Documents (or finalize stages) completed so far in this stage. */
  documentsDone: number;
  /** Documents (or stages) in this stage; null while the list is still being drawn up. */
  documentsTotal: number | null;
  /** What is being worked on right now — a document label, a finalize stage, or why it stopped. */
  label: string | null;
  /** For `stopped`: the stage it stopped in, so the bar keeps the height it had reached. */
  from?: ReviewStage | null;
  at?: string;
}

/** The review as the status route reports it: its own clock, its own spend, its own bar. */
export interface ReviewStatus {
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number;
  spendUsd: number;
  costCapUsd: number | null;
  progress: ReviewProgress | null;
  /** 0–100. Only a finished review reaches 100. */
  percent: number;
}

const STAGES: ReviewStage[] = ['reading', 'analyzing', 'finalizing', 'done', 'stopped'];

/** The stamped object, checked field by field — it is JSON written by another process. */
export function normaliseReviewProgress(raw: unknown): ReviewProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const stage = STAGES.includes(r.stage as ReviewStage) ? (r.stage as ReviewStage) : null;
  if (!stage) return null;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    stage,
    documentsDone: Math.max(0, num(r.documentsDone) ?? 0),
    documentsTotal: num(r.documentsTotal),
    label: typeof r.label === 'string' && r.label ? r.label : null,
    from: STAGES.includes(r.from as ReviewStage) ? (r.from as ReviewStage) : null,
    ...(typeof r.at === 'string' ? { at: r.at } : {}),
  };
}

/**
 * Where the bar sits.
 *
 *   reading     5 → 45   (one share per document read)
 *   analyzing  45 → 85   (one share per document analysed)
 *   finalizing 85 → 97   (chain of title, cross-reference, coherence review)
 *   done       100
 *   stopped    the height it had reached in the stage it stopped in
 *
 * Nothing stamped yet: 3 while the project is `analyzing` (the worker has the run and is listing
 * the documents), 100 for a finished review the worker never stamped (an in-app run), else 0.
 */
export function reviewPercent(status: string, p: ReviewProgress | null | undefined, finishedAt: string | null = null): number {
  if (!p) {
    if (status === 'analyzing') return 3;
    return status === 'review' && finishedAt ? 100 : 0;
  }
  const share = (from: number, to: number): number => {
    const total = p.documentsTotal;
    if (!total || total <= 0) return from;
    const frac = Math.min(1, Math.max(0, p.documentsDone / total));
    return from + (to - from) * frac;
  };
  const stage: ReviewStage = p.stage === 'stopped' ? (p.from ?? 'reading') : p.stage;
  let pct: number;
  switch (stage) {
    case 'reading': pct = share(5, 45); break;
    case 'analyzing': pct = share(45, 85); break;
    case 'finalizing': pct = share(85, 97); break;
    case 'done': pct = 100; break;
    default: pct = 3;
  }
  if (p.stage === 'stopped') return Math.min(97, Math.round(pct));
  if (stage !== 'done' && status === 'review' && finishedAt) return 100;
  return Math.min(stage === 'done' ? 100 : 97, Math.round(pct));
}

/** One line under the bar. */
export function describeReviewProgress(p: ReviewProgress | null | undefined, status: string): string {
  if (!p) return status === 'analyzing' ? 'The worker has the review — listing the documents to read.' : 'The review has not reported its progress.';
  const total = p.documentsTotal;
  const nth = (verb: string) => (total && p.documentsDone < total
    ? `${verb} document ${p.documentsDone + 1} of ${total}${p.label ? ` — ${p.label}` : ''}`
    : `${verb} — all ${total ?? ''} document(s) done`.replace('  ', ' '));
  switch (p.stage) {
    case 'reading': return nth('Reading');
    case 'analyzing': return nth('Extracting data points from');
    case 'finalizing': return `Finalizing (${Math.min(p.documentsDone + 1, total ?? 3)} of ${total ?? 3})${p.label ? ` — ${p.label}` : ''}`;
    case 'done': return p.label ?? 'Analysis complete.';
    case 'stopped': return p.label ?? 'The review stopped short of its finalize.';
  }
}
