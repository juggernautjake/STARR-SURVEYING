// worker/src/research/drive-app-analysis.ts — the worker DRIVES the app's data-point analysis
//
// ── WHY ─────────────────────────────────────────────────────────────────────────────────────────
//
// After the worker's read pass (OCR, chain of title) the app's `analyzeProject` still ran on
// Vercel as a background job started by one HTTP call — and a Vercel function is frozen the moment
// it has responded, so a long analysis parked at `analyzing` until the owner unstuck it by hand
// (plan 6.7's last "noted, not changed" item). Porting the 2,500-line analysis into the worker
// would fork it; instead the worker becomes the CONDUCTOR and the app does bounded, awaited work:
//
//   1. one call per document — `{ documentId, resume: true, skipFinalization: true }` — extracts and
//      stores that document's points and returns; each fits one invocation (maxDuration 300 s);
//   2. one finalize call — `{ resume: true }` — runs chain of title, cross-reference, discrepancies
//      and the coherence review over every stored point and ends the project at `review`.
//
// The cost cap is honoured BETWEEN calls from the ledger (the app also honours it within a call):
// when the analyze run's cap is spent the remaining documents are skipped and the finalize still
// runs, so a capped run ends at `review` with what it could afford — never parked. Pure over the
// injected pieces so the sequence, the cap and the failure handling are unit-tested.

export type FinalizeStage = 'chain' | 'crossref' | 'coherence' | 'coherence1' | 'coherence2' | 'coherence3';

export interface AnalysisCallOptions {
  documentId?: string;
  resume?: boolean;
  skipFinalization?: boolean;
  /** Run ONE stage of the finalize (2026-09-07): 'chain' → 'crossref' → the coherence review a PASS at a
   *  time ('coherence1' → 'coherence2' → 'coherence3'): as one stage it outran Vercel's 300 s on run 6. */
  finalizeStage?: FinalizeStage;
  maxCostUsd?: number;
}

export interface DriveAppAnalysisInput {
  projectId: string;
  /** The analyze run's own cap; undefined = uncapped (a benchmark, or none set). */
  maxCostUsd?: number;
  /** The documents to analyse, in order — those the read pass left `extracted` or `analyzed`. */
  listDocuments: () => Promise<Array<{ id: string; label?: string | null }>>;
  /** One awaited call to the app's analyze route. */
  call: (opts: AnalysisCallOptions) => Promise<{ ok: boolean; statement: string }>;
  /** The project's ledger spend right now — the cap is measured against what it grows by. */
  spentSoFar: () => Promise<number>;
  /** Where the drive is, for the review's own loading bar (owner, 2026-09-07): before each document
   *  and before each finalize stage. Never fatal. */
  onProgress?: (p: { stage: 'analyzing' | 'finalizing'; done: number; total: number; label: string }) => void | Promise<void>;
  /** After one document has been read and analysed: the text is now evidence (a relevance verdict
   *  from what it says — research/text-relevance.ts). Failures are the hook's own business. */
  afterDocument?: (documentId: string) => Promise<void>;
  log?: (line: string) => void;
}

export interface DriveAppAnalysisResult {
  documents: number;
  chunks: number;
  chunkFailures: number;
  skippedAtCap: number;
  finalized: boolean;
  statement: string;
}

export async function driveAppAnalysis(input: DriveAppAnalysisInput): Promise<DriveAppAnalysisResult> {
  const log = input.log ?? (() => {});
  const cap = typeof input.maxCostUsd === 'number' && Number.isFinite(input.maxCostUsd) ? input.maxCostUsd : undefined;
  const startSpend = await input.spentSoFar();
  const remaining = async (): Promise<number | undefined> => {
    if (cap == null) return undefined;
    const spent = (await input.spentSoFar()) - startSpend;
    return Math.max(0, Number((cap - spent).toFixed(4)));
  };

  const docs = await input.listDocuments();
  if (docs.length === 0) {
    // Nothing to chunk over — the legacy whole-project call, so a project with no readable documents
    // still gets the app's own "no processed documents" verdict rather than silence.
    const r = await input.call({ maxCostUsd: cap });
    log(r.statement);
    return { documents: 0, chunks: 0, chunkFailures: 0, skippedAtCap: 0, finalized: false, statement: r.statement };
  }

  let chunks = 0;
  let chunkFailures = 0;
  let skippedAtCap = 0;
  for (const doc of docs) {
    const left = await remaining();
    if (left != null && left <= 0) {
      skippedAtCap = docs.length - chunks;
      log(`Analyze cap $${cap!.toFixed(2)} reached after ${chunks} of ${docs.length} document(s) — the rest are skipped; finalising over what was read.`);
      break;
    }
    try { await input.onProgress?.({ stage: 'analyzing', done: chunks, total: docs.length, label: doc.label ?? doc.id }); } catch { /* a courtesy */ }
    const r = await input.call({ documentId: doc.id, resume: true, skipFinalization: true, maxCostUsd: left });
    chunks += 1;
    if (!r.ok) chunkFailures += 1;
    log(`[${chunks}/${docs.length}] ${doc.label ?? doc.id}: ${r.statement}`);
    if (r.ok && input.afterDocument) {
      try { await input.afterDocument(doc.id); } catch (e) { log(`  after-read check failed: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  // The finalize, a STAGE at a time (2026-09-07): the whole thing — chain of title, cross-reference
  // + discrepancies, the 3-pass coherence review — took longer than one Vercel invocation on run 4
  // (HTTP 504 at the function limit) and the project sat at `analyzing`. Three awaited calls, each
  // inside the limit; the last one ends the project at `review`. A stage that fails stops the rest.
  const stages: FinalizeStage[] = ['chain', 'crossref', 'coherence1', 'coherence2', 'coherence3'];
  let fin: { ok: boolean; statement: string } = { ok: true, statement: '' };
  const stageLabel: Record<FinalizeStage, string> = {
    chain: 'Chain of title', crossref: 'Cross-reference and discrepancies', coherence: 'Coherence review',
    coherence1: 'Coherence review — pass 1 of 3', coherence2: 'Coherence review — pass 2 of 3', coherence3: 'Coherence review — pass 3 of 3',
  };
  for (const [i, stage] of stages.entries()) {
    try { await input.onProgress?.({ stage: 'finalizing', done: i, total: stages.length, label: stageLabel[stage] }); } catch { /* a courtesy */ }
    fin = await input.call({ resume: true, finalizeStage: stage, maxCostUsd: await remaining() });
    log(fin.statement);
    if (!fin.ok) break;
  }

  const statement =
    `Worker-driven analysis: ${chunks} of ${docs.length} document(s) analysed` +
    (chunkFailures ? ` (${chunkFailures} failed)` : '') +
    (skippedAtCap ? `, ${skippedAtCap} skipped at the cost cap` : '') +
    `; finalize ${fin.ok ? 'completed' : 'FAILED — ' + fin.statement}.`;
  return { documents: docs.length, chunks, chunkFailures, skippedAtCap, finalized: fin.ok, statement };
}
