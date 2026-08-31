// worker/src/lib/browser-factory.ts
//
// Single entry point for obtaining a Playwright Browser instance. Abstracts
// the choice between local Chromium (development), Browserbase CDP (Phase A
// production), and a no-op stub (CI / unit tests / no credentials).
//
// All code in the worker MUST acquire browsers through `getBrowser()` /
// `withBrowser()` / `acquireBrowser()` rather than calling `chromium.launch()`
// directly. This is what lets us swap in Browserbase later without touching
// 30+ call-sites scattered across the codebase.
//
// Backend selection (in priority order):
//   1. options.backend                    — explicit override per call (e.g. for tests)
//   2. process.env.BROWSER_BACKEND        — 'local' | 'browserbase' | 'stub'
//   3. fall back to 'local'
//
// NOTE (Phase A): Auto-promotion rules previously inferred 'browserbase' from
// the presence of BROWSERBASE_API_KEY and 'stub' from NODE_ENV=test. Those
// rules were stripped intentionally — Browserbase is paid infrastructure and
// must be opted into explicitly. See PR description and
// docs/planning/in-progress/PHASE_A_INTEGRATION_PREP.md.
//
// Per-adapter Browserbase gating: even when BROWSER_BACKEND=browserbase, a
// caller that passes `adapterId` will only be routed to Browserbase if its
// id is present in BROWSERBASE_ENABLED_ADAPTERS (a comma-separated list of
// filename-stem ids). This lets us roll out Browserbase one adapter at a
// time. Calls without an adapterId always honor BROWSER_BACKEND.

import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions } from 'playwright';

export type BrowserBackend = 'local' | 'browserbase' | 'stub';

/**
 * Canonical filename-stem ids for adapters that may be routed to Browserbase.
 * Read adapters live in worker/src/adapters/<stem>-adapter.ts.
 * Purchase/pay adapters live in worker/src/services/purchase-adapters/<stem>-adapter.ts
 * and use a `*-pay` or `*-purchase` suffix to disambiguate.
 *
 * Adding a new adapter: add its stem here AND make sure the adapter passes
 * its own stem as `adapterId` to getBrowser/withBrowser/acquireBrowser.
 */
export const KNOWN_ADAPTER_IDS = [
  // Read / clerk adapters
  'bell-clerk',
  'tyler-clerk',
  'bexar-clerk',
  'kofile-clerk',
  'henschen-clerk',
  'fidlar-clerk',
  'idocket-clerk',
  'texasfile',
  'countyfusion',
  'cad',
  // Purchase / pay adapters (separate folder)
  'fidlar-pay',
  'tyler-pay',
  'henschen-pay',
  'idocket-pay',
  'kofile-purchase',
  'texasfile-purchase',
  'govos-guest',
] as const;

export type AdapterId = (typeof KNOWN_ADAPTER_IDS)[number];

const KNOWN_ADAPTER_ID_SET: ReadonlySet<string> = new Set(KNOWN_ADAPTER_IDS);

export interface BrowserSession {
  /** The Playwright Browser handle (real or stub). */
  browser: Browser;
  /** The backend that produced this browser. Useful for telemetry/logging. */
  backend: BrowserBackend;
  /**
   * Egress IP of the browser, when known. CapSolver needs this for
   * IP-bound CAPTCHA token reuse. Local Playwright returns null (we infer
   * via egress lookup elsewhere); Browserbase returns the proxy IP it
   * assigned this session.
   */
  egressIp: string | null;
  /**
   * Browserbase session id, when applicable. Used for telemetry and
   * post-mortem debugging via the Browserbase dashboard.
   */
  browserbaseSessionId?: string;
  /** Best-effort cleanup; safe to call multiple times. */
  close: () => Promise<void>;
}

export interface BrowserFactoryOptions {
  /**
   * Stable identifier for the calling adapter. Filename stem of the adapter
   * file (e.g. 'bell-clerk' for worker/src/adapters/bell-clerk-adapter.ts).
   * Used to:
   *   1. Gate Browserbase routing through BROWSERBASE_ENABLED_ADAPTERS
   *   2. Provide telemetry attribution
   * If omitted, the call is treated as "ungated" — it honors BROWSER_BACKEND
   * directly with no per-adapter check.
   */
  adapterId?: string;
  /** Force a specific backend regardless of env or adapter gating. */
  backend?: BrowserBackend;
  /** Forwarded to Playwright `chromium.launch()` for the local backend. */
  launchOptions?: LaunchOptions;
  /** Forwarded to `browser.newContext()` if the caller wants a pre-built context returned. */
  contextOptions?: BrowserContextOptions;
  /**
   * Hint to the backend about the target site so a Browserbase session can
   * pre-warm the right region/proxy. Ignored by local backend.
   */
  targetUrl?: string;
  /**
   * If true, the session uses Browserbase's residential proxy pool (or the
   * configured stub equivalent). Required for any CAPTCHA-bound token.
   */
  useResidentialProxy?: boolean;
}

/**
 * Acquire a browser. Caller is responsible for calling `session.close()`
 * (or use `withBrowser()` below for automatic cleanup).
 */
export async function getBrowser(opts: BrowserFactoryOptions = {}): Promise<BrowserSession> {
  const backend = resolveBackend(opts);
  switch (backend) {
    case 'local':       return launchLocal(opts);
    case 'browserbase': return launchBrowserbase(opts);
    case 'stub':        return launchStub(opts);
  }
}

/**
 * Acquire a browser, run the callback, and close the browser even if the
 * callback throws. Preferred over manual close() in most call-sites.
 */
export async function withBrowser<T>(
  opts: BrowserFactoryOptions,
  fn: (session: BrowserSession) => Promise<T>,
): Promise<T> {
  const session = await getBrowser(opts);
  try {
    return await fn(session);
  } finally {
    await session.close().catch((err) => {
      // Don't mask the original error if the close itself fails.
      console.warn('[browser-factory] close() failed:', err);
    });
  }
}

/**
 * Convenience: get a fresh BrowserContext with sensible defaults applied.
 * Most call-sites want a context, not the raw Browser. This pattern avoids
 * leaking the underlying browser handle.
 */
export async function getContext(
  opts: BrowserFactoryOptions = {},
): Promise<{ context: BrowserContext; session: BrowserSession }> {
  const session = await getBrowser(opts);
  const context = await session.browser.newContext(opts.contextOptions);
  return { context, session };
}

/**
 * Drop-in replacement for `chromium.launch(launchOptions)` that routes
 * through the factory. Returns a Playwright Browser whose `close()` will
 * also release any backend-specific resources (Browserbase session, etc.).
 *
 * Use this from the ~30 historic `chromium.launch()` call-sites — it's the
 * lowest-risk migration shape because callers continue to manage the
 * Browser handle exactly as before; only the import line and the call
 * itself change.
 */
export async function acquireBrowser(opts: BrowserFactoryOptions = {}): Promise<Browser> {
  const session = await getBrowser(opts);
  // For Browserbase we want session.close() (which may release the SDK
  // session) to fire when the caller closes the browser. Hooking the
  // Playwright 'disconnected' event handles that without forcing every
  // caller to track a separate session handle.
  if (session.backend === 'browserbase') {
    session.browser.once('disconnected', () => {
      session.close().catch((err) => {
        console.warn('[browser-factory] post-disconnect cleanup failed:', err);
      });
    });
  }
  return session.browser;
}

// ── Leasing: one browser across many documents ─────────────────────────────
//
// ── THE COST THIS REMOVES ──────────────────────────────────────────────────
//
// From the owner's 2026-08-30 run, once per document, eleven times:
//
//     Browser launched — viewport 1920x1200 for max resolution capture
//
// `acquireBrowser` launches a fresh Chromium every call. Capturing a document set therefore paid
// eleven cold starts for eleven visits to the SAME portal.
//
// ── WHY A SEPARATE API AND NOT POOLING BEHIND acquireBrowser ───────────────
//
// Because 30+ call sites do `browser.close()` when they are done, and that is correct for them.
// Quietly pooling behind the existing function would mean the first caller to finish destroys the
// browser every other caller is still using — a fault that appears as random "Target closed"
// errors far from its cause. Leasing is opt-in: a caller that takes a lease releases it, and only
// the last release closes anything.
//
// ── WHY BROWSERBASE IS NEVER POOLED ────────────────────────────────────────
//
// A Browserbase session is billed, remotely hosted, and has its own lifecycle — `acquireBrowser`
// hooks 'disconnected' to release it. Holding one open across documents would extend a paid
// session for as long as the lease lives, which is the opposite of what the per-adapter gate is
// for. Leases fall back to launch-and-close for any non-local backend.

interface BrowserLease {
  browser: Browser;
  /** Release this lease. The browser closes when the last holder releases and the idle timer fires. */
  release: () => Promise<void>;
}

interface PooledBrowser {
  browser: Browser;
  /** Which backend produced it. The health check below only means something for a real Chromium:
   *  the stub deliberately reports isConnected() === false, being a test double rather than a
   *  connected browser, and treating that as "dead" recycled the pool on every single lease. */
  backend: BrowserBackend;
  refs: number;
  /** Recycled after this many leases — a long-lived Chromium accumulates memory. */
  uses: number;
  idleTimer: NodeJS.Timeout | null;
}

let pool: PooledBrowser | null = null;

/**
 * The launch currently in flight, if any.
 *
 * ── THE RACE THIS CLOSES ────────────────────────────────────────────────────────────────────────
 *
 * `leaseBrowser` did `if (!pool) pool = { browser: await acquireBrowser(), … }`. Two callers that
 * arrive while the pool is empty BOTH see `null`, both launch, and the second assignment overwrites
 * the first:
 *
 *     A: pool is null  → await acquireBrowser…            (suspends)
 *     B: pool is null  → await acquireBrowser…            (suspends)
 *     A: pool = {A}; current = A's pool; refs = 1
 *     B: pool = {B}   ← overwrites A's
 *     A: release() → refs 0, but `pool !== current`, so it returns early:
 *        no idle timer is set and nothing ever closes A.
 *
 * **A whole Chromium process leaks, silently, every time that interleaving happens.** Not a
 * theoretical future problem: `capacity.ts` allows six concurrent pipelines today, so two runs
 * starting together already hit it. It only became visible while scoping E5d, because concurrency
 * *inside* one run makes the interleaving common rather than occasional.
 *
 * A single shared promise fixes it: whoever finds no pool starts the launch and stores the promise;
 * everyone else awaits that same promise and gets the same browser. Deliberately NOT a mutex — the
 * work being serialised is one launch, and the second caller wants its RESULT, not a turn to repeat
 * it.
 */
let launching: Promise<PooledBrowser> | null = null;

/** Close the pooled browser once nothing has used it for this long. */
export const BROWSER_IDLE_CLOSE_MS = 60_000;
/** Recycle after this many leases regardless of idleness. */
export const BROWSER_MAX_LEASES = 40;

async function closePool(reason: string): Promise<void> {
  const current = pool;
  pool = null;
  if (!current) return;
  if (current.idleTimer) clearTimeout(current.idleTimer);
  try {
    await current.browser.close();
  } catch (err) {
    console.warn(`[browser-factory] pooled browser close failed (${reason}):`, err);
  }
}

/**
 * Borrow a browser, reusing a live one when possible.
 *
 * The caller MUST call `release()` and MUST NOT call `browser.close()` — closing a leased browser
 * pulls it out from under every other holder.
 */
export async function leaseBrowser(opts: BrowserFactoryOptions = {}): Promise<BrowserLease> {
  // BROWSERBASE is never pooled — specifically it, not "everything non-local". The reason is
  // billing and session lifecycle, which is a property of Browserbase and not of the stub backend;
  // writing the guard as `!== 'local'` also made the pool untestable without launching a real
  // Chromium, which the lease tests caught immediately.
  if (resolveBackend(opts) === 'browserbase') {
    const browser = await acquireBrowser(opts);
    return { browser, release: async () => { await browser.close().catch(() => {}); } };
  }

  // A disconnected browser is worse than none: every page call fails with "Target closed" and the
  // cause is a crash that happened during somebody else's document.
  const poolIsDead = pool !== null && pool.backend === 'local' && !pool.browser.isConnected();
  if (pool && (poolIsDead || pool.uses >= BROWSER_MAX_LEASES)) {
    const why = poolIsDead ? 'browser disconnected' : 'lease limit reached';
    if (pool.refs === 0) await closePool(why);
    else pool = null; // in use by someone else; let them finish, start a fresh one here
  }

  if (!pool) {
    // One launch, shared. See the note on `launching` — the naive version leaked a Chromium every
    // time two callers found the pool empty at the same moment.
    if (!launching) {
      launching = (async () => {
        const browser = await acquireBrowser(opts);
        return { browser, backend: resolveBackend(opts), refs: 0, uses: 0, idleTimer: null };
      })();
      // Clear the slot whether it resolves or rejects. Leaving a rejected promise here would make
      // one failed launch permanent: every later lease would await it and re-throw the same error,
      // and the worker would never open a browser again until it restarted.
      launching.finally(() => { launching = null; }).catch(() => {});
    }
    const created = await launching;
    // Someone may have finished first and installed a pool while this was waiting; if so, use
    // theirs and close the spare rather than overwriting — which is the leak, inverted.
    if (pool) {
      if ((pool as PooledBrowser).browser !== created.browser) {
        await created.browser.close().catch(() => {});
      }
    } else {
      pool = created;
    }
  }

  const current = pool!;
  current.refs += 1;
  current.uses += 1;
  if (current.idleTimer) { clearTimeout(current.idleTimer); current.idleTimer = null; }

  let released = false;
  return {
    browser: current.browser,
    release: async () => {
      if (released) return;   // double-release must not drive refs negative
      released = true;
      current.refs -= 1;
      if (current.refs > 0 || pool !== current) return;
      // Last holder. Do not close immediately — the next document is milliseconds away, and
      // closing between every document would reinstate the cost this exists to remove.
      current.idleTimer = setTimeout(() => {
        if (pool === current && current.refs === 0) void closePool('idle');
      }, BROWSER_IDLE_CLOSE_MS);
      current.idleTimer.unref?.();
    },
  };
}

/** Close the pooled browser now. For shutdown and for tests. */
export async function closeLeasedBrowser(): Promise<void> {
  await closePool('explicit');
}

/** Lease bookkeeping, for tests and diagnostics. */
export function leasedBrowserState(): { open: boolean; refs: number; uses: number } {
  return { open: pool !== null, refs: pool?.refs ?? 0, uses: pool?.uses ?? 0 };
}

// ── Backend resolution ─────────────────────────────────────────────────────

/**
 * Resolve which backend to use. Rules (priority order):
 *   1. opts.backend explicit override
 *   2. BROWSER_BACKEND env var
 *   3. fall back to 'local'
 *
 * If the resolved backend is 'browserbase' AND opts.adapterId is set,
 * the per-adapter gate is consulted. Adapters not in
 * BROWSERBASE_ENABLED_ADAPTERS fall back to 'local' with a debug log.
 */
/** Exported so the routing DECISION can be asserted without launching a browser — the
 *  Browserbase promotion rule is a policy, and a test that has to start Chromium to check a policy
 *  is testing the wrong thing (and fails on any machine without it installed). */
export function resolveBackend(opts: BrowserFactoryOptions): BrowserBackend {
  let backend: BrowserBackend;
  if (opts.backend) {
    backend = opts.backend;
  } else {
    const env = (process.env.BROWSER_BACKEND ?? '').toLowerCase();
    if (env === 'local' || env === 'browserbase' || env === 'stub') {
      backend = env;
    } else if (process.env.NODE_ENV === 'test') {
      // Belt-and-suspenders: default to stub in test environments so tests
      // never reach launchLocal()'s dynamic import('playwright') even when
      // BROWSER_BACKEND is unset. This prevents Chromium-not-installed
      // failures in CI for unit tests that don't need a real browser.
      backend = 'stub';
    } else {
      backend = 'local';
    }
  }

  // ── PROMOTION: the adapter list can turn Browserbase ON for one adapter ──────────────────────
  //
  // Until 2026-08-30 this list could only ever RESTRICT — it was consulted after the backend had
  // already resolved to browserbase. So the only way to use Browserbase for a single adapter was
  // `BROWSER_BACKEND=browserbase`, and the block below then pushed the other GATED adapters back to
  // local. Ungated calls — and there are many, the factory's own header says they "always honor
  // BROWSER_BACKEND" — went to Browserbase regardless.
  //
  // That is a per-session bill for the clerk scraping (~40 navigations a run, working perfectly on
  // local Chromium) in order to fix the CAD adapter, which is not it. The list reads like an opt-in
  // everywhere it is described; it now behaves like one.
  //
  // This is NOT the auto-promotion the header says was stripped. That inferred the backend from the
  // mere PRESENCE of BROWSERBASE_API_KEY — paid infrastructure switched on by a credential existing.
  // This requires an operator to name the adapter explicitly, and the list is empty by default, so
  // nothing changes for anyone who has not opted in.
  if (backend === 'local' && opts.adapterId !== undefined) {
    const enabled = parseEnabledAdapters(process.env.BROWSERBASE_ENABLED_ADAPTERS);
    if (enabled.has(opts.adapterId)) {
      console.log(`[browser-factory] adapter "${opts.adapterId}" promoted → browserbase (named in BROWSERBASE_ENABLED_ADAPTERS)`);
      return 'browserbase';
    }
  }

  // Per-adapter gating only applies when we'd otherwise route to Browserbase.
  if (backend === 'browserbase' && opts.adapterId !== undefined) {
    const enabled = parseEnabledAdapters(process.env.BROWSERBASE_ENABLED_ADAPTERS);
    if (!enabled.has(opts.adapterId)) {
      // Falling back to local because operator hasn't enabled this adapter
      // yet. Log so it's obvious why a known-Browserbase adapter is using a
      // local browser. Most adapters hit this during staged rollout.
      console.log(`[browser-factory] adapter "${opts.adapterId}" gated → local (add to BROWSERBASE_ENABLED_ADAPTERS to enable)`);
      return 'local';
    }
  }

  return backend;
}

// ── Adapter-flag parsing ───────────────────────────────────────────────────

/**
 * Parse BROWSERBASE_ENABLED_ADAPTERS into a Set of adapter ids. Unknown ids
 * are warned about and dropped; the env var is treated as advisory, not
 * authoritative. We never crash on a typo here because the consequence is
 * "Browserbase doesn't activate", not a data integrity issue.
 */
export function parseEnabledAdapters(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const piece of raw.split(',')) {
    const id = piece.trim();
    if (!id) continue;
    if (KNOWN_ADAPTER_ID_SET.has(id)) {
      out.add(id);
    } else {
      console.warn(
        `[browser-factory] BROWSERBASE_ENABLED_ADAPTERS contains unknown adapter id ` +
        `"${id}" — ignoring. Known ids: ${KNOWN_ADAPTER_IDS.join(', ')}.`,
      );
    }
  }
  return out;
}

/**
 * Validate the env var on startup. Call this once from worker bootstrap.
 * Safe to call multiple times; it just re-parses + re-warns.
 */
export function validateAdapterFlagOnStartup(): void {
  parseEnabledAdapters(process.env.BROWSERBASE_ENABLED_ADAPTERS);
}

// ── Local backend ──────────────────────────────────────────────────────────

async function launchLocal(opts: BrowserFactoryOptions): Promise<BrowserSession> {
  const playwright = await import('playwright');
  // Let a deployment pin the binary. Playwright resolves a *headless shell* build by default, which
  // is a separate download from the full Chromium — a machine with only `chromium-<rev>` installed
  // fails with "Executable doesn't exist" even though a perfectly good browser is sitting there.
  // Explicit beats reinstalling a second browser on every host.
  const pinned = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim();
  const browser = await playwright.chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    ...(pinned ? { executablePath: pinned } : {}),
    // Caller's options win, so an adapter can still override the pin.
    ...opts.launchOptions,
  });
  return {
    browser,
    backend: 'local',
    egressIp: null,
    close: async () => { await browser.close().catch(() => { /* idempotent */ }); },
  };
}

// ── Browserbase backend ────────────────────────────────────────────────────

/**
 * Launch a Browserbase-managed Chromium session and connect to it via CDP.
 *
 * Connection lifecycle:
 *   1. Create session via Browserbase SDK (with optional residential proxy).
 *   2. `chromium.connectOverCDP(connectUrl)` — Playwright connects remotely.
 *   3. Caller uses the Browser as if it were local.
 *   4. On close: disconnect Playwright AND release the Browserbase session
 *      so we don't keep paying for an idle browser.
 *
 * Errors:
 *   - Missing creds → throw immediately with a clear message naming the
 *     missing env var.
 *   - SDK or CDP errors → propagated; caller decides whether to retry.
 */
async function launchBrowserbase(opts: BrowserFactoryOptions): Promise<BrowserSession> {
  const apiKey    = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  const adapterTag = opts.adapterId ? ` adapter=${opts.adapterId}` : '';

  if (!apiKey) {
    console.error(`[browser-factory] launchBrowserbase failed: BROWSERBASE_API_KEY missing${adapterTag}`);
    throw new Error(
      '[browser-factory] BROWSERBASE_API_KEY must be set to use the browserbase ' +
      'backend. Set BROWSER_BACKEND=local or =stub to bypass.',
    );
  }
  if (!projectId) {
    console.error(`[browser-factory] launchBrowserbase failed: BROWSERBASE_PROJECT_ID missing${adapterTag}`);
    throw new Error(
      '[browser-factory] BROWSERBASE_PROJECT_ID must be set to use the browserbase ' +
      'backend. Set BROWSER_BACKEND=local or =stub to bypass.',
    );
  }

  const start = Date.now();
  console.log(`[browser-factory] launching browserbase session${adapterTag} residentialProxy=${opts.useResidentialProxy ? 'yes' : 'no'}`);

  // Dynamic import keeps the SDK out of the load path for local-only deploys.
  //
  // We deliberately route the module specifier through a variable so the
  // root Next.js typecheck (which transitively pulls this file in via
  // `@/worker/src/services/...` imports from API routes) does not require
  // `@browserbasehq/sdk` to be installed at the repo root. The SDK is a
  // worker-only runtime dependency; only `worker/package.json` declares it.
  // TypeScript treats `import(variable)` as `any`, which is what we want
  // for an optional runtime dep. See worker/tsconfig.json — typed access
  // to the SDK happens inside the worker tsc context where the module
  // resolves normally.
  const browserbaseModuleId = '@browserbasehq/sdk';
  const { default: Browserbase } = await import(browserbaseModuleId);
  const playwright = await import('playwright');

  const bb = new Browserbase({ apiKey });

  // Ask the SDK for a session. We pass proxies only if the caller asked for
  // residential routing; otherwise we let Browserbase pick its default
  // datacenter pool (cheaper).
  const sessionParams: Record<string, unknown> = { projectId };
  if (opts.useResidentialProxy) {
    sessionParams.proxies = true;
  }

  const created = await bb.sessions.create(sessionParams as Parameters<typeof bb.sessions.create>[0]);
  const sessionId = created.id;
  const connectUrl = created.connectUrl;

  let browser: Browser;
  try {
    browser = await playwright.chromium.connectOverCDP(connectUrl);
  } catch (err) {
    // Try to release the session if Playwright couldn't connect; otherwise
    // we'd leak a paid session. Best-effort — don't mask the original error.
    console.error(`[browser-factory] CDP connect failed for browserbase session ${sessionId}${adapterTag}: ${(err as Error).message}`);
    await releaseBrowserbaseSession(bb, sessionId).catch(() => { /* swallow */ });
    throw err;
  }

  // Browserbase exposes the egress proxy IP on the created session record.
  // The shape varies a bit by SDK minor version; defensive lookup.
  const egressIp =
    (created as { proxyIp?: string | null }).proxyIp ??
    (created as { proxy?: { ip?: string | null } | null }).proxy?.ip ??
    null;

  console.log(`[browser-factory] browserbase session ready id=${sessionId}${adapterTag} egressIp=${egressIp ?? 'unknown'} (${Date.now() - start}ms)`);

  return {
    browser,
    backend: 'browserbase',
    egressIp: egressIp ?? null,
    browserbaseSessionId: sessionId,
    close: async () => {
      // Idempotent: closing the Playwright handle and releasing the SDK
      // session can both be retried safely.
      try { await browser.close(); } catch { /* idempotent */ }
      await releaseBrowserbaseSession(bb, sessionId).catch((err) => {
        console.warn(
          `[browser-factory] failed to release Browserbase session ${sessionId}:`,
          err,
        );
      });
      console.log(`[browser-factory] browserbase session released id=${sessionId}${adapterTag}`);
    },
  };
}

/**
 * Release a Browserbase session via the SDK. Browserbase's API surface for
 * "end this session now" has shifted across SDK versions (`sessions.end`,
 * `sessions.update({status: 'COMPLETED'})`, etc.), so we probe in order
 * and accept whichever exists. Worst case the session times out on its
 * own — Browserbase has a server-side idle timeout.
 */
async function releaseBrowserbaseSession(
  bb: unknown,
  sessionId: string,
): Promise<void> {
  const sessions = (bb as { sessions?: Record<string, unknown> }).sessions;
  if (!sessions || typeof sessions !== 'object') return;

  const updateFn = (sessions as { update?: (id: string, body: unknown) => Promise<unknown> }).update;
  if (typeof updateFn === 'function') {
    await updateFn.call(sessions, sessionId, {
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      status: 'REQUEST_RELEASE',
    });
    return;
  }

  const endFn = (sessions as { end?: (id: string) => Promise<unknown> }).end;
  if (typeof endFn === 'function') {
    await endFn.call(sessions, sessionId);
    return;
  }
  // No release method available — let the server-side idle timeout reap it.
}

// ── Stub backend ───────────────────────────────────────────────────────────

/**
 * The stub backend returns a Browser whose methods throw on use. It exists
 * so that unit tests of higher-level code can exercise the factory contract
 * without launching real Chromium. Tests that need actual page interaction
 * should mock the returned browser directly or run against the local backend.
 */
async function launchStub(_opts: BrowserFactoryOptions): Promise<BrowserSession> {
  const stubBrowser = makeStubBrowser();
  return {
    browser: stubBrowser,
    backend: 'stub',
    egressIp: '203.0.113.1',  // RFC 5737 documentation IP, never routable
    close: async () => { /* no-op */ },
  };
}

function makeStubBrowser(): Browser {
  const fail = (method: string) => () => {
    throw new Error(
      `[browser-factory:stub] ${method}() called on stub browser. ` +
      `Either set BROWSER_BACKEND=local, or mock this call in your test.`,
    );
  };

  // We intentionally do not implement the full Browser interface — only the
  // shape callers will reach for first. Anything else throws with the same
  // clear error. This is safer than a partial fake that silently no-ops.
  const stub = {
    newContext:   fail('newContext'),
    newPage:      fail('newPage'),
    contexts:     () => [],
    isConnected:  () => false,
    version:      () => '0.0.0-stub',
    close:        async () => { /* no-op */ },
    browserType:  () => ({ name: () => 'stub' }),
    on:           () => stub,
    once:         () => stub,
    off:          () => stub,
    removeListener: () => stub,
    addListener:    () => stub,
  } as unknown as Browser;

  return stub;
}
