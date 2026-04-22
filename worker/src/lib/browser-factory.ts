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
function resolveBackend(opts: BrowserFactoryOptions): BrowserBackend {
  let backend: BrowserBackend;
  if (opts.backend) {
    backend = opts.backend;
  } else {
    const env = (process.env.BROWSER_BACKEND ?? '').toLowerCase();
    if (env === 'local' || env === 'browserbase' || env === 'stub') {
      backend = env;
    } else {
      backend = 'local';
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
  const browser = await playwright.chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
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
