// worker/src/research/trigger-app-analysis.ts — kick the app's AI analysis after a run (plan P3/A5).
//
// The app's `analyzeProject` writes `extracted_data_points` (Data Points / Briefing / Encumbrances)
// and works, but nothing triggered it after a WORKER run — so those panels were empty until someone
// pressed Analyze. This calls the app's analyze route at run finish, authenticating as the worker
// (x-worker-key, the same credential the queue-claim uses). Fire-and-forget on the app side (the
// route returns immediately and runs the analysis in the background), non-fatal here: a run's
// research is done and filed whether or not the data-point extraction can be reached.

export interface AutoAnalysisResult {
  attempted: boolean;
  ok: boolean;
  statement: string;
}

export async function triggerAppAnalysis(
  projectId: string,
  opts: { allow: boolean },
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
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-key': key },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      return { attempted: true, ok: true, statement: 'AI data-point analysis auto-started — the Data Points / Briefing panels will populate.' };
    }
    return { attempted: true, ok: false, statement: `AI data-point analysis auto-run returned HTTP ${res.status} — the Data Points panel may stay empty until Analyze is pressed.` };
  } catch (err) {
    return { attempted: true, ok: false, statement: `AI data-point analysis auto-run could not reach the app: ${err instanceof Error ? err.message : String(err)}` };
  }
}
