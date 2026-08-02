// lib/research/worker-status.ts — is the research engine actually there? (research plan R2)
//
// §2.1 of the plan: `WORKER_URL` points at a droplet that answers nothing and does not ping, and the
// app never says so. A deep run against a dead worker currently surfaces as a spinner, then a
// generic failure, then — if the fallback happens to fire — a *silently weaker* lite run whose only
// announcement is a transient status line. Three different situations produce one indistinguishable
// experience, and the person waiting has no idea which one they are in.
//
// They need different fixes, so they get different words:
//
//   not_configured  no WORKER_URL — a valid state (a fresh clone, a firm that never bought one).
//                   Nothing is broken; deep research simply is not available here.
//   unreachable     configured and not answering. Somebody must start or redeploy it.
//   degraded        answering, but its own /healthz says it cannot launch a browser. It will accept
//                   work and fail it — worse than being down, because it looks up.
//   ok              answering and able to work.
//
// Pure on purpose: the fetch lives in the route, so the interpretation — which is the part with an
// opinion in it — is testable without a network.

export type WorkerState = 'ok' | 'degraded' | 'unreachable' | 'not_configured';

/** The `/healthz` body the worker returns. Only the fields this module reads. */
export interface WorkerHealthzBody {
  status?: string;
  version?: string;
  buildSha?: string;
  uptimeSeconds?: number;
  browser?: { backend?: string; ok?: boolean; pending?: boolean; lastError?: string };
  queue?: { activePipelines?: number; completedResults?: number };
  warnings?: string[];
}

export interface WorkerProbe {
  /** False when WORKER_URL / WORKER_API_KEY are unset. */
  configured: boolean;
  /** HTTP status, or null when the request never completed. */
  httpStatus: number | null;
  body: WorkerHealthzBody | null;
  /** Transport-level failure text (DNS, refused, timeout). */
  transportError?: string;
  latencyMs: number;
}

export interface WorkerVerdict {
  state: WorkerState;
  /** One sentence, for a banner. Says what is true and what it means for a run. */
  headline: string;
  /** What would fix it, when there is such a thing. */
  hint?: string;
  /** Whether a DEEP run can be started right now. */
  canRunDeep: boolean;
  /** Whether the in-app lite pipeline is worth offering as the alternative. */
  offerLite: boolean;
  version?: string;
  buildSha?: string;
  activePipelines?: number;
  latencyMs: number;
  warnings: string[];
}

export function interpretWorkerProbe(probe: WorkerProbe): WorkerVerdict {
  const base = { latencyMs: probe.latencyMs, warnings: probe.body?.warnings ?? [] };

  if (!probe.configured) {
    return {
      ...base,
      state: 'not_configured',
      headline: 'Deep research is not configured on this deployment, so runs use the built-in lite pipeline.',
      hint: 'Set WORKER_URL and WORKER_API_KEY to point at a research worker.',
      canRunDeep: false,
      offerLite: true,
    };
  }

  if (probe.httpStatus === null) {
    return {
      ...base,
      state: 'unreachable',
      // Named precisely. "Research is down" sends somebody hunting through the app; "the worker is
      // not answering" sends them to the machine, which is where the problem is.
      headline: 'The research worker is not answering, so deep research cannot run right now.',
      hint: probe.transportError
        ? `The server did not respond: ${probe.transportError}`
        : 'The server did not respond. It may be stopped, restarting, or unreachable from here.',
      canRunDeep: false,
      offerLite: true,
    };
  }

  if (probe.httpStatus === 401 || probe.httpStatus === 403) {
    return {
      ...base,
      state: 'unreachable',
      headline: 'The research worker rejected this deployment’s credentials, so deep research cannot run.',
      hint: 'WORKER_API_KEY here does not match the worker’s. Neither side is broken; they disagree.',
      canRunDeep: false,
      offerLite: true,
    };
  }

  const browserOk = probe.body?.browser?.ok !== false;
  const degraded = probe.httpStatus >= 500 || probe.body?.status === 'degraded' || !browserOk;

  if (degraded) {
    return {
      ...base,
      state: 'degraded',
      // The dangerous case: it is up, so nothing looks wrong, and it will accept a run and fail it.
      headline: 'The research worker is running but cannot open a browser, so a deep run would fail.',
      hint: probe.body?.browser?.lastError
        ? `The worker reported: ${probe.body.browser.lastError.split('\n')[0]}`
        : 'Its own health check reports the browser as unavailable.',
      canRunDeep: false,
      offerLite: true,
      version: probe.body?.version,
      buildSha: probe.body?.buildSha,
      activePipelines: probe.body?.queue?.activePipelines,
    };
  }

  const busy = probe.body?.queue?.activePipelines ?? 0;
  return {
    ...base,
    state: 'ok',
    headline: busy > 0
      ? `The research worker is up and currently running ${busy} ${busy === 1 ? 'job' : 'jobs'}.`
      : 'The research worker is up and idle.',
    canRunDeep: true,
    // Still true, and still worth saying: lite is a legitimate choice for a quick look even when
    // the deep engine is available.
    offerLite: false,
    version: probe.body?.version,
    buildSha: probe.body?.buildSha,
    activePipelines: busy,
  };
}

/** How long a probe result may be reused before asking again.
 *
 *  The banner is rendered on pages people leave open. Fifteen seconds is short enough that "I just
 *  started the worker" is reflected almost immediately, and long enough that ten open tabs do not
 *  become ten health checks a second against a machine that is already struggling. */
export const WORKER_PROBE_TTL_MS = 15_000;
