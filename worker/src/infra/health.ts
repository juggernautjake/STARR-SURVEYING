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
    /** Adapters promoted to Browserbase. `backend` alone stopped answering "is Browserbase on?"
     *  once an adapter could be promoted while the default stayed `local`. */
    browserbaseAdapters: string[];
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
      // Which adapters are PROMOTED to Browserbase. Reported because `backend` alone stopped
      // telling the whole story once an adapter could be promoted while the default stayed local:
      // an operator who had configured exactly the recommended shape saw `backend: "local"` and
      // could not tell, from outside the box, whether their change had taken. Empty array means
      // nothing is promoted, which is a meaningful answer rather than a missing one.
      browserbaseAdapters: (process.env.BROWSERBASE_ENABLED_ADAPTERS ?? '')
        .split(',').map((s) => s.trim()).filter(Boolean),
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
  //
  // ⚠ THIS CHECKS PRESENCE, NOT VALIDITY, AND THE DIFFERENCE HAS BITTEN. Measured 2026-08-27: the
  // configured `CAPSOLVER_API_KEY` is 68 characters long and CapSolver's API rejects it outright
  // (`ERROR_KEY_DENIED_ACCESS`). A key that exists and is refused passes the check below in silence.
  //
  // Not fixed by probing the provider at boot, on purpose: a worker whose startup depends on a
  // third-party API cannot start during that API's outage, which is worse than the problem. Validity
  // belongs to the moment a provider is switched on — see R4a in
  // docs/planning/completed/RESEARCH_WORKER_REBUILD_AND_GROWTH_2026-08-26.md.
  // ⚠ AND THE LARGER PROBLEM, MEASURED 2026-08-30: THE SOLVER IS NOT CALLED BY ANYTHING.
  //
  // Controlled for — `getCaptchaSolver()` has zero callers outside its own module and tests, while
  // `browser-factory` has 37 importers. Only `setSolveAttemptSink` (telemetry) is wired in. So the
  // warning below was true about configuration and misleading about consequence: setting the key
  // does not make solving work, because nothing asks the solver to solve.
  //
  // The wording now says what actually happens, so an operator does not go buying a CapSolver
  // subscription to fix a portal challenge that would fail either way.
  if ((env.CAPTCHA_PROVIDER ?? 'stub').toLowerCase() === 'capsolver' && !env.CAPSOLVER_API_KEY) {
    warn.push('CAPTCHA_PROVIDER=capsolver but CAPSOLVER_API_KEY missing — note that captcha solving is NOT wired into any adapter, so setting it will not solve challenges either');
  }

  // ── PAID BUT UNUSED (added 2026-08-27) ────────────────────────────────────────────────────────
  //
  // The opposite failure to everything above: not a missing key, but a key that is present, valid,
  // billing, and unreachable by any code path. That is invisible by construction — nothing errors,
  // nothing degrades, and the only symptom is an invoice.
  //
  // Measured 2026-08-27 against Browserbase's own API: valid credentials, project created
  // 2026-04-23, **zero sessions ever run**. Four months of paying for infrastructure the config
  // forbids the code from touching. It takes TWO switches to enable, and both were off.
  // ⚠ CORRECTED 2026-08-30 — THIS WARNING OUTLIVED THE RULE IT DESCRIBED.
  //
  // It fired on `backend !== 'browserbase'` and said "no session can ever start". That was true
  // when the adapter list could only RESTRICT. Since the promotion change in browser-factory.ts, an
  // adapter NAMED in BROWSERBASE_ENABLED_ADAPTERS is routed to Browserbase while BROWSER_BACKEND
  // stays `local` — which is now the recommended way to enable one portal without billing the rest.
  //
  // So the warning was telling an operator who had just configured it correctly that nothing could
  // possibly work. A stale warning is worse than no warning: it is confidently wrong, and it costs
  // exactly the time somebody spends re-doing a step that was already right. Found within hours of
  // shipping the change that invalidated it, by reading the live /healthz rather than assuming.
  if (env.BROWSERBASE_API_KEY && env.BROWSERBASE_PROJECT_ID) {
    const backend = (env.BROWSER_BACKEND ?? 'local').toLowerCase();
    const adapters = (env.BROWSERBASE_ENABLED_ADAPTERS ?? '').trim();

    if (backend === 'browserbase' && !adapters) {
      // Globally on, gate empty: every UNGATED call bills, every gated one falls back to local.
      warn.push('BROWSER_BACKEND=browserbase but BROWSERBASE_ENABLED_ADAPTERS is empty — gated adapters route nowhere while ungated calls bill');
    } else if (backend !== 'browserbase' && !adapters) {
      // The original finding: credentials billing, nothing able to reach them.
      warn.push(`Browserbase credentials are set and billing, but BROWSER_BACKEND=${backend} and BROWSERBASE_ENABLED_ADAPTERS is empty — no session can start`);
    }
    // backend=local WITH a non-empty adapter list is the intended shape. No warning: it is the
    // configuration we recommend, and warning about it would train people to ignore this list.
  }

  // ── TAVILY IS NOT THIS PROCESS'S BUSINESS — check removed 2026-08-29 ──────────────────────────
  //
  // This used to warn `TAVILY_API_KEY missing — open-web research is inert; runs see county sources
  // only`. It was wrong in both directions, and it cost real time.
  //
  // Every consumer of `lib/research/open-web.ts` is an APP module: the portal, regulatory, market
  // and learning watches, lead enrichment, and the CAD-URL guess ("Method 9") in
  // `boundary-fetch.service.ts`. Measured — `grep -rn TAVILY worker/src` returned this line and
  // nothing else, against a control showing the worker genuinely reads `ANTHROPIC_API_KEY` in four
  // adapter files. And the deep research pipeline does not touch open-web at all: zero references in
  // `analyze*.ts` or any `*pipeline*.ts`.
  //
  // So the worker was reading ITS OWN environment to report on a DIFFERENT PROCESS's configuration,
  // which it cannot observe. Both failure modes follow:
  //
  //   · app has the key, worker does not  → warns falsely, and the operator "fixes" it by putting a
  //     key on a machine that will never read it. This happened on 2026-08-29.
  //   · worker has the key, app does not  → silent, while open-web is genuinely broken.
  //
  // The sentiment was not baseless — a worker run really does not include open-web research. But
  // that is because the worker has no open-web step, not because a key is missing, so the warning
  // named a cause that was wrong and a fix that did nothing.
  //
  // The app already reports this correctly and per-feature: `open-web.ts` returns a `not-configured`
  // status and every watch surfaces it. That is the right place — the process that holds the key.

  // ── THE PAYWALL, WHICH IS REACHED 20 MINUTES INTO A RUN ────────────────────────────────────────
  //
  // Measured 2026-08-27: 17 of 18 vendor credentials in Doppler `prd` are empty, TexasFile among
  // them. TexasFile is the UNIVERSAL clerk fallback — `getClerkSystem()` routes every county with no
  // specific proven vendor to it — so with no TexasFile login, paid document retrieval is impossible
  // almost everywhere, however well the routing works.
  //
  // Free platforms (`authType: 'none'` in paid-platform-registry) still search and still return what
  // they publish, so a run does not fail. It quietly returns less, having spent the full 20 minutes
  // getting there. That is the shape this whole warning list exists to catch.
  //
  // Deliberately NOT a re-implementation of `PaidPlatformRegistry.loadCredentialsFromEnv()`, which
  // reads `process.env` directly and would defeat the injected env these checks are tested with. One
  // pair, the one that decides the outcome, rather than a second copy of the whole map.
  if (!env.TEXASFILE_USERNAME || !env.TEXASFILE_PASSWORD) {
    warn.push('TEXASFILE credentials missing — the universal clerk fallback cannot buy documents; free sources only');
  }

  return warn;
}
