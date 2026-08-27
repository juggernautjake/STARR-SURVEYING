// worker/src/infra/health.ts — liveness that means something (research plan R1).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
//
// `worker/Dockerfile` has always polled **`/healthz`**. The Express app only ever defined
// **`/health`**, and `grep -rn healthz worker/src` returned nothing — so a container built from that
// Dockerfile fails its probe three times and gets restarted, forever, no matter how healthy the
// worker actually is. The Dockerfile even says so: *"TODO Phase A: confirm this endpoint exists; add
// if missing."* It was missing.
//
// The fix is not simply to alias the two. `/health` is a DEEP check: it launches Chromium, calls
// Supabase, and returns 503 if any sub-check is less than "ok" — including config-only warnings like
// a missing R2 bucket. As a 30-second container probe that would (a) launch a browser twice a minute
// forever and (b) restart a working worker because a nice-to-have credential is unset.
//
// So the two endpoints answer two different questions, which is the standard split:
//
//   /health   "is everything configured and reachable?"   — deep, expensive, for humans and the
//                                                            Testing Lab. Unchanged.
//   /healthz  "should this container keep running?"       — cheap, cached, for Docker.
//
// ── WHAT /healthz CONSIDERS FATAL, AND WHY IT IS NOT "EXPRESS IS UP" ────────────────────────────
//
// A liveness probe that only proves the event loop is alive would have called the current droplet
// healthy right up until somebody noticed research had stopped working. This worker's entire job is
// driving a browser, so a worker that cannot launch Chromium is not alive in any sense that matters —
// it is a process that will accept jobs and fail all of them.
//
// So the browser probe is part of liveness, but CACHED (default 5 minutes) and never run on the
// request path more than once per TTL: a 30-second probe must not launch a browser every 30 seconds.
// A boot grace period keeps a cold container from being killed before its first probe finishes.
//
// Config gaps are reported, never fatal. A missing credential is a deploy problem a restart cannot
// fix, and restarting on it turns one broken setting into a crash loop.

export type HealthState = 'ok' | 'degraded' | 'starting';

export interface BrowserProbeResult {
  ok: boolean;
  /** Why it failed, verbatim. Truncated by the caller if it ends up in a log line. */
  error?: string;
  durationMs: number;
}

export interface BrowserHealth extends BrowserProbeResult {
  /** When this result was produced. Null before the first probe completes. */
  checkedAt: string | null;
  /** True while the first probe is still running — the boot grace period. */
  pending: boolean;
}

export interface HealthzPayload {
  status: HealthState;
  /** Deploy identity. `unknown` when the image was built without BUILD_SHA. */
  version: string;
  buildSha: string;
  uptimeSeconds: number;
  browser: {
    backend: string;
    ok: boolean;
    pending: boolean;
    checkedAt: string | null;
    lastError?: string;
    durationMs: number;
  };
  queue: {
    activePipelines: number;
    completedResults: number;
    /** How many this machine will hold at once, and why (plan R7). Reported so a wrong-sized box is
     *  visible from the app rather than at minute 22 of a run. */
    maxConcurrentPipelines?: number;
    limitedBy?: string;
  };
  /** Config gaps. Present so a human reading a probe response can see them; never fatal. */
  warnings: string[];
}

export const DEFAULT_PROBE_TTL_MS = 5 * 60_000;
/** How long after boot a not-yet-probed browser is reported as `starting` rather than degraded. */
export const BOOT_GRACE_MS = 90_000;

/** Caches one browser probe and never runs two at once.
 *
 *  Deliberately a class holding its own clock and probe function rather than module-level state: the
 *  TTL arithmetic is the whole point of this file, and a module that reads `Date.now()` directly
 *  cannot be tested at a chosen moment. */
export class BrowserHealthCache {
  private last: BrowserProbeResult | null = null;
  private lastAt: number | null = null;
  private inFlight: Promise<BrowserProbeResult> | null = null;
  private readonly startedAt: number;

  constructor(
    private readonly probe: () => Promise<BrowserProbeResult>,
    private readonly now: () => number = () => Date.now(),
    private readonly ttlMs: number = DEFAULT_PROBE_TTL_MS,
  ) {
    this.startedAt = this.now();
  }

  /** The cached answer, refreshing in the BACKGROUND when stale.
   *
   *  The request is never made to wait on a browser launch. A probe that took 20 seconds because the
   *  host was thrashing would otherwise turn a health check into a timeout, which Docker reads as
   *  "unhealthy" — the failure mode this file exists to stop. */
  read(): BrowserHealth {
    const age = this.lastAt === null ? Infinity : this.now() - this.lastAt;
    if (age >= this.ttlMs && !this.inFlight) void this.refresh();

    if (!this.last) {
      const booting = this.now() - this.startedAt < BOOT_GRACE_MS;
      return { ok: booting, pending: true, checkedAt: null, durationMs: 0, error: booting ? undefined : 'no probe has completed' };
    }
    return { ...this.last, checkedAt: new Date(this.lastAt!).toISOString(), pending: this.inFlight !== null };
  }

  /** Run the probe now, deduplicated. Exposed for boot (warm the cache) and for tests. */
  async refresh(): Promise<BrowserProbeResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        return await this.probe();
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
      }
    })();
    try {
      const result = await this.inFlight;
      this.last = result;
      this.lastAt = this.now();
      return result;
    } finally {
      this.inFlight = null;
    }
  }
}

export interface HealthzInputs {
  version: string;
  buildSha: string;
  uptimeSeconds: number;
  browserBackend: string;
  browser: BrowserHealth;
  activePipelines: number;
  completedResults: number;
  warnings: string[];
  capacity?: { maxConcurrentPipelines: number; limitedBy: string };
}

/** Build the payload and decide the HTTP status.
 *
 *  Pure, so the decision that governs whether a container is killed can be tested without a browser,
 *  a socket or a clock. */
export function buildHealthz(input: HealthzInputs): { status: number; body: HealthzPayload } {
  const state: HealthState = input.browser.pending && !input.browser.checkedAt
    ? (input.browser.ok ? 'starting' : 'degraded')
    : (input.browser.ok ? 'ok' : 'degraded');

  const body: HealthzPayload = {
    status: state,
    version: input.version,
    buildSha: input.buildSha,
    uptimeSeconds: Math.round(input.uptimeSeconds),
    browser: {
      backend: input.browserBackend,
      ok: input.browser.ok,
      pending: input.browser.pending,
      checkedAt: input.browser.checkedAt,
      ...(input.browser.error ? { lastError: input.browser.error } : {}),
      durationMs: input.browser.durationMs,
    },
    queue: {
      activePipelines: input.activePipelines,
      completedResults: input.completedResults,
      ...(input.capacity
        ? { maxConcurrentPipelines: input.capacity.maxConcurrentPipelines, limitedBy: input.capacity.limitedBy }
        : {}),
    },
    warnings: input.warnings,
  };

  // `starting` is 200: a cold container must not be killed before its first probe lands.
  // `degraded` is 503 ONLY because the one thing it can be degraded about is the browser, which is
  // this service's reason to exist. Config gaps live in `warnings` and never reach this line.
  return { status: state === 'degraded' ? 503 : 200, body };
}

/** Config gaps worth telling a human about. Never fatal — see the header. */
export function configWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warn: string[] = [];
  if (!env.ANTHROPIC_API_KEY) warn.push('ANTHROPIC_API_KEY missing — AI analysis will fail');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) warn.push('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing — nothing will persist');
  if (!env.REDIS_URL) warn.push('REDIS_URL missing — falling back to redis://localhost:6379');
  if ((env.BROWSER_BACKEND ?? 'local') === 'browserbase' && !(env.BROWSERBASE_API_KEY && env.BROWSERBASE_PROJECT_ID)) {
    warn.push('BROWSER_BACKEND=browserbase but its credentials are missing — callers fall back to local');
  }

  // ── Added 2026-08-26 for the netcup rebuild (plan W1/W3) ──────────────────────────────────────
  //
  // Three settings that are each ACCEPTED at boot and only fail later, which is the worst shape a
  // misconfiguration can take on a box that runs 25-minute jobs.

  // W3. The worker authenticates callers with this. Absent, it starts perfectly and every request
  // from the app is rejected — which presents as "the research worker is not answering", sends the
  // operator to check DNS and firewalls, and is neither.
  if (!env.WORKER_API_KEY) {
    warn.push('WORKER_API_KEY missing — the worker will run but reject every call from the app, which looks like an outage');
  }

  // W1, and the reason this check exists at all. `resolveBackend()` honours STORAGE_BACKEND=r2
  // whether or not the credentials are there; the failure surfaces at the FIRST UPLOAD, part-way
  // through a run, after paid documents have already been bought. The previous host wrote artifacts
  // to local disk and lost them when it was destroyed, so `r2` is now the configured default —
  // which makes forgetting these keys a live risk rather than a theoretical one.
  if ((env.STORAGE_BACKEND ?? 'local').toLowerCase() === 'r2') {
    const missing = (['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const)
      .filter((k) => !env[k]);
    if (missing.length) {
      warn.push(`STORAGE_BACKEND=r2 but ${missing.join(', ')} missing — uploads will fail mid-run, not at boot`);
    }
  }

  // Same shape: the provider is selected by name, and the key is only reached when a portal actually
  // presents a captcha — typically minutes into a run against a county site.
  if ((env.CAPTCHA_PROVIDER ?? 'stub').toLowerCase() === 'capsolver' && !env.CAPSOLVER_API_KEY) {
    warn.push('CAPTCHA_PROVIDER=capsolver but CAPSOLVER_API_KEY missing — solving fails the first time a portal asks');
  }

  return warn;
}
