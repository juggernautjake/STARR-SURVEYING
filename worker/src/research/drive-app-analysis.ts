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

export interface AnalysisCallOptions {
  documentId?: string;
  resume?: boolean;
  skipFinalization?: boolean;
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
    const r = await input.call({ documentId: doc.id, resume: true, skipFinalization: true, maxCostUsd: left });
    chunks += 1;
    if (!r.ok) chunkFailures += 1;
    log(`[${chunks}/${docs.length}] ${doc.label ?? doc.id}: ${r.statement}`);
  }

  const fin = await input.call({ resume: true, maxCostUsd: await remaining() });
  log(fin.statement);

  const statement =
    `Worker-driven analysis: ${chunks} of ${docs.length} document(s) analysed` +
    (chunkFailures ? ` (${chunkFailures} failed)` : '') +
    (skippedAtCap ? `, ${skippedAtCap} skipped at the cost cap` : '') +
    `; finalize ${fin.ok ? 'completed' : 'FAILED — ' + fin.statement}.`;
  return { documents: docs.length, chunks, chunkFailures, skippedAtCap, finalized: fin.ok, statement };
}
