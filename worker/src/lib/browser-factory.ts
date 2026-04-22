// worker/src/lib/browser-factory.ts
//
// Single entry point for obtaining a Playwright Browser instance. Abstracts
// the choice between local Chromium (development), Browserbase CDP (Phase A
// production), and a no-op stub (CI / unit tests / no credentials).
//
// All code in the worker MUST acquire browsers through `getBrowser()` rather
// than calling `chromium.launch()` directly. This is what lets us swap in
// Browserbase later without touching 37 call-sites scattered across the
// codebase.
//
// Backend selection (in priority order):
//   1. options.backend         — explicit override per call (e.g. for tests)
//   2. process.env.BROWSER_BACKEND ∈ {local, browserbase, stub}
//   3. process.env.BROWSERBASE_API_KEY present → 'browserbase'
//   4. process.env.NODE_ENV === 'test' → 'stub'
//   5. fall back to 'local'
//
// Phase 0 ships only the `local` and `stub` backends. The `browserbase`
// backend exists as a stub that throws a helpful error explaining how to
// finish the wiring once a Browserbase account exists. Phase A replaces
// that throw with a real CDP connection.

import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions } from 'playwright';

export type BrowserBackend = 'local' | 'browserbase' | 'stub';

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
  /** Best-effort cleanup; safe to call multiple times. */
  close: () => Promise<void>;
}

export interface BrowserFactoryOptions {
  /** Force a specific backend regardless of env. */
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
  const backend = resolveBackend(opts.backend);
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

// ── Backend resolution ─────────────────────────────────────────────────────

function resolveBackend(explicit?: BrowserBackend): BrowserBackend {
  if (explicit) return explicit;

  const env = (process.env.BROWSER_BACKEND ?? '').toLowerCase();
  if (env === 'local' || env === 'browserbase' || env === 'stub') return env;

  if (process.env.BROWSERBASE_API_KEY) return 'browserbase';
  if (process.env.NODE_ENV === 'test') return 'stub';
  return 'local';
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

// ── Browserbase backend (stub until Phase A) ───────────────────────────────

async function launchBrowserbase(opts: BrowserFactoryOptions): Promise<BrowserSession> {
  const apiKey    = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    throw new Error(
      '[browser-factory] BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set ' +
      'to use the browserbase backend. Set BROWSER_BACKEND=local or =stub to bypass.',
    );
  }

  // Phase 0: not implemented. The full implementation lives in Phase A and
  // looks roughly like:
  //
  //   const Browserbase = (await import('@browserbasehq/sdk')).default;
  //   const bb = new Browserbase({ apiKey });
  //   const session = await bb.sessions.create({
  //     projectId,
  //     proxies: opts.useResidentialProxy ? [{ type: 'browserbase' }] : undefined,
  //     ...
  //   });
  //   const playwright = await import('playwright');
  //   const browser = await playwright.chromium.connectOverCDP(session.connectUrl);
  //   return { browser, backend: 'browserbase', egressIp: session.proxyIp ?? null, ... };
  //
  // For Phase 0 we throw a clear, actionable error so that anyone toggling
  // BROWSER_BACKEND=browserbase before the Phase A wiring knows exactly what
  // to do.

  throw new Error(
    '[browser-factory] The browserbase backend is not yet wired up (Phase A). ' +
    'Install @browserbasehq/sdk, implement launchBrowserbase() in this file, ' +
    'then remove this throw. Until then, set BROWSER_BACKEND=local for development ' +
    'or BROWSER_BACKEND=stub for tests. See docs/RECON_INVENTORY.md §6 for the ' +
    'full migration plan.' +
    (opts.targetUrl ? ` (Caller targetUrl was: ${opts.targetUrl})` : ''),
  );
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
