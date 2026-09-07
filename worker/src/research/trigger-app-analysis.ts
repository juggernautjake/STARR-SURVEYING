// worker/src/research/trigger-app-analysis.ts — call the app's AI analysis route (plan P3/A5).
//
// The app's `analyzeProject` writes `extracted_data_points` (Data Points / Briefing / Encumbrances)
// and works, but nothing triggered it after a WORKER run — so those panels were empty until someone
// pressed Analyze. This calls the app's analyze route, authenticating as the worker (x-worker-key,
// the same credential the queue-claim uses). Non-fatal here: a run's research is done and filed
// whether or not the data-point extraction can be reached.
//
// Two ways to call it (2026-09-06):
//   • plain — fire-and-forget on the app side (the route returns at once and analyses in the
//     background). This is what a run-finish auto-analysis does.
//   • `awaitCompletion` — the route runs ONE bounded call (a document chunk, or the finalize) and
//     answers when it is done. The worker-driven analysis (drive-app-analysis.ts) uses this so the
//     work runs to completion inside a Vercel invocation instead of being frozen after the 200.

export interface AutoAnalysisResult {
  attempted: boolean;
  ok: boolean;
  statement: string;
}

export interface TriggerAppAnalysisOptions {
  allow: boolean;
  /** The analyze run's own cost cap, carried through to the app (plan R1). */
  maxCostUsd?: number;
  /** Analyse only this document (a chunk of the worker-driven analysis). */
  documentId?: string;
  /** Resume semantics on the app side: skip analysed documents, keep their points, carry the log. */
  resume?: boolean;
  /** Stop after storing this call's points — the finalize call does the cross-document work. */
  skipFinalization?: boolean;
  /** Run ONE stage of the finalize (2026-09-07): 'chain' → 'crossref' → 'coherence'. */
  finalizeStage?: 'chain' | 'crossref' | 'coherence';
  /** Ask the route to run the call and answer when it is done (not fire-and-forget). */
  awaitCompletion?: boolean;
  /** How long to wait for the app's answer. An awaited chunk needs the route's full maxDuration. */
  timeoutMs?: number;
}

export async function triggerAppAnalysis(
  projectId: string,
  opts: TriggerAppAnalysisOptions,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<AutoAnalysisResult> {
  if (!opts.allow) {
    return { attempted: false, ok: false, statement: 'AI data-point analysis not auto-run — the run settings did not allow it.' };
  }
  const base = env.APP_BASE_URL;
  const key = env.WORKER_API_KEY;
  if (!base || !key) {
    return { attempted: false, ok: false, statement: 'AI data-point analysis auto-run skipped — APP_BASE_URL or WORKER_API_KEY is not set.' };
  }
  const url = `${base.replace(/\/+$/, '')}/api/admin/research/${projectId}/analyze`;
  const body: Record<string, unknown> = {};
  if (typeof opts.maxCostUsd === 'number' && Number.isFinite(opts.maxCostUsd)) body.maxCostUsd = opts.maxCostUsd;
  if (opts.documentId) body.documentId = opts.documentId;
  if (opts.resume) body.resume = true;
  if (opts.skipFinalization) body.skipFinalization = true;
  if (opts.finalizeStage) body.finalizeStage = opts.finalizeStage;
  if (opts.awaitCompletion) body.awaitCompletion = true;
  const what = opts.documentId ? `document ${opts.documentId}` : opts.finalizeStage ? `the finalize stage "${opts.finalizeStage}"` : opts.resume ? 'the finalize pass' : 'the analysis';
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    if (res.ok) {
      return {
        attempted: true, ok: true,
        statement: opts.awaitCompletion
          ? `AI data-point analysis: ${what} completed on the app.`
          : 'AI data-point analysis auto-started — the Data Points / Briefing panels will populate.',
      };
    }
    let detail = '';
    try { detail = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* no body */ }
    return { attempted: true, ok: false, statement: `AI data-point analysis (${what}) returned HTTP ${res.status}${detail ? ` — ${detail}` : ''} — the Data Points panel may stay empty until Analyze is pressed.` };
  } catch (err) {
    return { attempted: true, ok: false, statement: `AI data-point analysis (${what}) could not reach the app: ${err instanceof Error ? err.message : String(err)}` };
  }
}
