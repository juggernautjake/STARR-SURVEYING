// worker/src/lib/captcha-solver.ts
//
// Provider-agnostic CAPTCHA solver. Wraps CapSolver behind a single
// interface so we can swap providers (or add 2Captcha / AntiCaptcha later)
// without touching adapter code.
//
// Architecture:
//   - `CaptchaSolver` interface — providers implement `solve()` only.
//   - `StubCaptchaSolver` — deterministic fake tokens for development + CI.
//   - `CapSolverProvider` — real solver against api.capsolver.com via the
//     small HTTP client in `captcha-solver-http.ts`.
//   - `getCaptchaSolver()` factory — selects based on env.
//
// Behavior contracts that callers can rely on:
//
// 1. Three-strike escalation lives INSIDE `solve()`. Callers do not
//    implement their own retry counter. After 3 failed attempts (with
//    exponential backoff between them) the solver throws
//    `CaptchaEscalationRequired`. The caller's only branch is "got a
//    token" vs "escalation thrown".
//
// 2. `recordSolveAttempt()` is called inside `solve()` for every attempt
//    — success or failure — before the function returns or throws. In
//    stub mode it no-ops. In CapSolver mode it writes a row to the
//    `captcha_solves` table (see seeds/201_captcha_solves.sql).
//
// 3. Token caching is keyed on `(challenge type, host, egressIp, uaHash)`
//    in Redis with a 25-minute TTL (cf_clearance is typically valid 30
//    min; we leave a 5-minute margin). Stub mode does not touch Redis.
//
// 4. IP binding. CapSolver receives the proxy URL so the resulting token
//    is bound to the same egress as the browser session that submits it.
//    Callers should pass `egressIp` from the BrowserSession returned by
//    `browser-factory`.

import { createHash } from 'node:crypto';
import {
  CapSolverHttpClient,
  type CapSolverGetTaskResultResponse,
  type CapSolverTaskBase,
  type CapSolverTaskType,
} from './captcha-solver-http.js';

// ── Public types ───────────────────────────────────────────────────────────

export type ChallengeType =
  | 'turnstile'              // Cloudflare Turnstile
  | 'recaptcha-v2'           // Google reCAPTCHA v2 (image grid)
  | 'recaptcha-v2-invisible' // reCAPTCHA v2 invisible
  | 'recaptcha-v3'           // reCAPTCHA v3 (score-based)
  | 'recaptcha-enterprise'   // reCAPTCHA Enterprise
  | 'hcaptcha'               // hCaptcha
  | 'datadome'               // DataDome (used by some clerk portals)
  | 'unknown';

export interface SolveRequest {
  /** Challenge type. If 'unknown' we attempt detection from `pageUrl`. */
  type: ChallengeType;

  /** Full URL of the page that issued the challenge. */
  pageUrl: string;

  /** Site key (data-sitekey for Turnstile/reCAPTCHA, etc.). */
  siteKey: string;

  /**
   * Egress IP of the browser session that will submit the resulting token.
   * Required for IP-bound challenges (Turnstile, reCAPTCHA Enterprise).
   * Caller should pass `BrowserSession.egressIp` from `browser-factory`.
   */
  egressIp: string | null;

  /** User-Agent string of the browser session (used in token cache key). */
  userAgent: string;

  /**
   * Proxy URL bound to this session, in the format CapSolver expects:
   *   http://user:pass@host:port  or  http://host:port
   * Required by CapSolver for IP-bound challenges. The solver will strip
   * any embedded credentials before recording the URL in `captcha_solves`.
   */
  proxyUrl?: string;

  /** Optional reCAPTCHA v3 action name (e.g. 'submit', 'login'). */
  recaptchaAction?: string;

  /** Optional reCAPTCHA Enterprise score threshold (0.0–1.0). */
  recaptchaScoreMin?: number;

  /** For provider routing/telemetry: the county and adapter requesting the solve. */
  context?: {
    countyFips?: string;
    adapterId?: string;
    jobId?: string;
  };
}

export interface SolveResult {
  /** The token to inject back into the form / cookie. */
  token: string;
  /** Provider that solved it. */
  provider: string;
  /** Wall-clock time the solve took. */
  durationMs: number;
  /** Cost of this solve, in USD. May be 0 for cached or stubbed solves. */
  costUsd: number;
  /** When this token expires (best estimate, not guaranteed). */
  expiresAt: Date;
  /** Whether the result came from cache. */
  fromCache: boolean;
}

export type SolveErrorCategory =
  | 'unsupported_type'
  | 'missing_credentials'
  | 'provider_error'
  | 'timeout'
  | 'no_capacity'
  | 'invalid_request'
  | 'manual_handoff_required';

export class CaptchaSolveError extends Error {
  constructor(
    message: string,
    public readonly category: SolveErrorCategory,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CaptchaSolveError';
  }
}

/**
 * Thrown by `solve()` after the configured number of attempts have all
 * failed. Wraps the last underlying error for diagnostics. Callers must
 * NOT retry on this — it is the signal to escalate to the manual-handoff
 * event bus instead.
 */
export class CaptchaEscalationRequired extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(message);
    this.name = 'CaptchaEscalationRequired';
  }
}

export interface CaptchaSolver {
  readonly providerName: string;
  solve(req: SolveRequest): Promise<SolveResult>;
}

// ── Telemetry: solve-attempt recorder ──────────────────────────────────────

export interface SolveAttemptRecord {
  provider: 'capsolver' | 'stub';
  challengeType: ChallengeType;
  success: boolean;
  costUsd?: number;
  proxyUrl?: string;
  jobId?: string;
  adapterId?: string;
  errorMessage?: string;
  durationMs: number;
}

/**
 * Sink for solve-attempt records. Default in stub mode is a no-op; default
 * in CapSolver mode writes to the `captcha_solves` table via Supabase.
 *
 * Tests inject a custom sink to assert calls without touching the DB.
 */
export interface SolveAttemptSink {
  record(attempt: SolveAttemptRecord): Promise<void>;
}

export const noopSolveAttemptSink: SolveAttemptSink = {
  async record() { /* no-op */ },
};

let activeSink: SolveAttemptSink = noopSolveAttemptSink;

/**
 * Override the active sink. Production wiring calls this once at boot
 * with a Supabase-backed sink when CAPTCHA_PROVIDER=capsolver. Tests
 * call it to inject a spy.
 */
export function setSolveAttemptSink(sink: SolveAttemptSink): void {
  activeSink = sink;
}

/** Restore the no-op sink. Convenience for tests. */
export function resetSolveAttemptSink(): void {
  activeSink = noopSolveAttemptSink;
}

/**
 * Record one solve attempt. Called from inside `solve()` for every
 * attempt — success and failure both. Errors here are swallowed so a
 * telemetry blip never poisons a successful solve.
 */
export async function recordSolveAttempt(record: SolveAttemptRecord): Promise<void> {
  try {
    await activeSink.record(record);
  } catch (err) {
    console.warn('[captcha-solver] recordSolveAttempt sink failed:', err);
  }
}

// ── Token cache (Redis-backed, optional) ───────────────────────────────────

/**
 * Minimal Redis-shaped interface so the solver does not hard-depend on
 * any specific client. Production wiring passes an ioredis instance.
 */
export interface CaptchaCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

const CACHE_TTL_SECONDS = 25 * 60; // 25 min — 5 min margin under cf_clearance's typical 30 min

let activeCache: CaptchaCache | null = null;

/** Install a token cache (e.g. ioredis). Pass null to disable caching. */
export function setCaptchaCache(cache: CaptchaCache | null): void {
  activeCache = cache;
}

function cacheKey(req: SolveRequest): string {
  const host = safeHost(req.pageUrl);
  const egress = req.egressIp ?? 'noegress';
  const uaHash = createHash('sha1').update(req.userAgent).digest('hex').slice(0, 12);
  return `captcha:${req.type}:${host}:${egress}:${uaHash}`;
}

function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return 'unknown-host'; }
}

interface CachedTokenPayload {
  token: string;
  expiresAt: number;
  costUsd: number;
}

async function getCachedToken(req: SolveRequest): Promise<SolveResult | null> {
  if (!activeCache) return null;
  const raw = await activeCache.get(cacheKey(req));
  if (!raw) return null;
  let payload: CachedTokenPayload;
  try { payload = JSON.parse(raw); } catch { return null; }
  if (payload.expiresAt <= Date.now() + 30_000) return null; // expiring within 30s — refetch
  return {
    token: payload.token,
    provider: 'cache',
    durationMs: 0,
    costUsd: 0,
    expiresAt: new Date(payload.expiresAt),
    fromCache: true,
  };
}

async function putCachedToken(req: SolveRequest, result: SolveResult): Promise<void> {
  if (!activeCache) return;
  const payload: CachedTokenPayload = {
    token: result.token,
    expiresAt: result.expiresAt.getTime(),
    costUsd: result.costUsd,
  };
  await activeCache.set(cacheKey(req), JSON.stringify(payload), CACHE_TTL_SECONDS);
}

// ── Factory ────────────────────────────────────────────────────────────────

export type CaptchaProvider = 'capsolver' | 'stub' | 'auto';

/**
 * Resolve which solver to use. Selection rules:
 *   1. options.provider override
 *   2. process.env.CAPTCHA_PROVIDER ∈ {capsolver, stub}
 *   3. CAPSOLVER_API_KEY present → 'capsolver'
 *   4. Default → 'stub'
 *
 * Note: NODE_ENV-based auto-promotion was removed in Phase A prep so
 * test environments that happen to set CAPSOLVER_API_KEY do not silently
 * route through the real provider.
 */
export function getCaptchaSolver(provider: CaptchaProvider = 'auto'): CaptchaSolver {
  const resolved = resolveProvider(provider);
  switch (resolved) {
    case 'capsolver': return new CapSolverProvider();
    case 'stub':      return new StubCaptchaSolver();
  }
}

function resolveProvider(explicit: CaptchaProvider): Exclude<CaptchaProvider, 'auto'> {
  if (explicit === 'capsolver' || explicit === 'stub') return explicit;
  const env = (process.env.CAPTCHA_PROVIDER ?? '').toLowerCase();
  if (env === 'capsolver' || env === 'stub') return env;
  if (process.env.CAPSOLVER_API_KEY) return 'capsolver';
  return 'stub';
}

// ── Retry config ───────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;

/** Backoff between attempts: 500ms, 2000ms (only used after attempts 1 and 2). */
const BACKOFF_MS = [500, 2000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Stub provider ──────────────────────────────────────────────────────────

/**
 * Stub solver. Returns a deterministic fake token after a small delay so
 * higher-level code (retry logic, manual-handoff escalation, billing-tracker)
 * can be exercised end-to-end without a real CapSolver account.
 *
 * Set `process.env.CAPTCHA_STUB_MODE` to control behavior:
 *   - 'success' (default): returns a synthetic token on the first attempt
 *   - 'fail':              throws CaptchaSolveError(category='provider_error') —
 *                          three-strike escalation kicks in and the caller
 *                          eventually sees `CaptchaEscalationRequired`
 *   - 'manual':            throws CaptchaSolveError(category='manual_handoff_required')
 *                          on the first attempt, no retries
 *   - 'timeout':           throws CaptchaSolveError(category='timeout') —
 *                          retries kick in
 */
export class StubCaptchaSolver implements CaptchaSolver {
  readonly providerName = 'stub';

  async solve(req: SolveRequest): Promise<SolveResult> {
    return solveWithRetry(this, req, () => this.singleAttempt(req));
  }

  private async singleAttempt(req: SolveRequest): Promise<SolveResult> {
    const mode = (process.env.CAPTCHA_STUB_MODE ?? 'success').toLowerCase();
    await sleep(25);

    switch (mode) {
      case 'fail':
        throw new CaptchaSolveError(
          `[captcha-solver:stub] forced failure (CAPTCHA_STUB_MODE=fail)`,
          'provider_error',
        );
      case 'manual':
        throw new CaptchaSolveError(
          `[captcha-solver:stub] forced manual handoff (CAPTCHA_STUB_MODE=manual)`,
          'manual_handoff_required',
        );
      case 'timeout':
        throw new CaptchaSolveError(
          `[captcha-solver:stub] forced timeout (CAPTCHA_STUB_MODE=timeout)`,
          'timeout',
        );
      case 'success':
      default: {
        const token = `STUB-TOKEN.${req.type}.${hashShort(req.pageUrl + req.siteKey)}`;
        return {
          token,
          provider: 'stub',
          durationMs: 25,
          costUsd: 0,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          fromCache: false,
        };
      }
    }
  }
}

// ── CapSolver provider ─────────────────────────────────────────────────────

const CAPSOLVER_POLL_INTERVAL_MS = 2_000;
const CAPSOLVER_POLL_TIMEOUT_MS  = 120_000;

/**
 * Real CapSolver provider. Submits a task, polls for result, returns the
 * token. Three-strike retry is handled by `solveWithRetry()` — this class
 * implements only the single-attempt logic.
 */
export class CapSolverProvider implements CaptchaSolver {
  readonly providerName = 'capsolver';
  private readonly apiKey: string | undefined;
  /** Test seam: inject a custom HTTP client. */
  private readonly httpFactory: (apiKey: string) => CapSolverHttpClient;

  constructor(httpFactory?: (apiKey: string) => CapSolverHttpClient) {
    this.apiKey = process.env.CAPSOLVER_API_KEY;
    this.httpFactory = httpFactory ?? ((k) => new CapSolverHttpClient({ apiKey: k }));
  }

  async solve(req: SolveRequest): Promise<SolveResult> {
    if (!this.apiKey) {
      // No retries for missing creds — recordSolveAttempt + throw.
      const start = Date.now();
      await recordSolveAttempt({
        provider:      'capsolver',
        challengeType: req.type,
        success:       false,
        proxyUrl:      sanitizeProxy(req.proxyUrl),
        jobId:         req.context?.jobId,
        adapterId:     req.context?.adapterId,
        errorMessage:  'missing CAPSOLVER_API_KEY',
        durationMs:    Date.now() - start,
      });
      throw new CaptchaSolveError(
        '[captcha-solver:capsolver] CAPSOLVER_API_KEY is not set. Either ' +
        'provide one or set CAPTCHA_PROVIDER=stub for development.',
        'missing_credentials',
      );
    }

    // Cache check happens once per call, before retry loop.
    const cached = await getCachedToken(req);
    if (cached) {
      await recordSolveAttempt({
        provider:      'capsolver',
        challengeType: req.type,
        success:       true,
        costUsd:       0,
        proxyUrl:      sanitizeProxy(req.proxyUrl),
        jobId:         req.context?.jobId,
        adapterId:     req.context?.adapterId,
        durationMs:    0,
      });
      return cached;
    }

    return solveWithRetry(this, req, () => this.singleAttempt(req));
  }

  private async singleAttempt(req: SolveRequest): Promise<SolveResult> {
    const apiKey = this.apiKey!;
    const http = this.httpFactory(apiKey);
    const taskType = mapChallengeToTaskType(req);
    if (!taskType) {
      throw new CaptchaSolveError(
        `[captcha-solver:capsolver] unsupported challenge type: ${req.type}`,
        'unsupported_type',
      );
    }

    const task: CapSolverTaskBase = {
      type:       taskType,
      websiteURL: req.pageUrl,
      websiteKey: req.siteKey,
      userAgent:  req.userAgent,
    };
    if (req.proxyUrl)            task.proxy        = req.proxyUrl;
    if (req.recaptchaAction)     task.pageAction   = req.recaptchaAction;
    if (req.recaptchaScoreMin !== undefined) task.minScore = req.recaptchaScoreMin;

    const start = Date.now();
    let taskId: string;
    try {
      taskId = await http.createTask(task);
    } catch (err) {
      throw new CaptchaSolveError(
        `[captcha-solver:capsolver] createTask failed: ${(err as Error).message}`,
        'provider_error',
        err,
      );
    }

    // Poll for the result.
    const deadline = Date.now() + CAPSOLVER_POLL_TIMEOUT_MS;
    let lastResp: CapSolverGetTaskResultResponse | undefined;
    while (Date.now() < deadline) {
      let resp: CapSolverGetTaskResultResponse;
      try {
        resp = await http.getTaskResult(taskId);
      } catch (err) {
        throw new CaptchaSolveError(
          `[captcha-solver:capsolver] getTaskResult failed: ${(err as Error).message}`,
          'provider_error',
          err,
        );
      }
      lastResp = resp;
      if (resp.errorId !== 0) {
        throw new CaptchaSolveError(
          `[captcha-solver:capsolver] task error: ${resp.errorDescription ?? resp.errorCode ?? 'unknown'}`,
          mapCapSolverErrorCategory(resp.errorCode),
        );
      }
      if (resp.status === 'ready') break;
      await sleep(CAPSOLVER_POLL_INTERVAL_MS);
    }

    if (!lastResp || lastResp.status !== 'ready' || !lastResp.solution) {
      throw new CaptchaSolveError(
        `[captcha-solver:capsolver] timed out waiting for task ${taskId}`,
        'timeout',
      );
    }

    const token = extractToken(req.type, lastResp.solution);
    if (!token) {
      throw new CaptchaSolveError(
        `[captcha-solver:capsolver] solution payload missing expected token field`,
        'provider_error',
      );
    }

    const costUsd = parseFloat(lastResp.cost ?? '0') || 0;
    const result: SolveResult = {
      token,
      provider:  'capsolver',
      durationMs: Date.now() - start,
      costUsd,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      fromCache: false,
    };

    // Best-effort cache write.
    try { await putCachedToken(req, result); } catch { /* ignore cache failure */ }

    return result;
  }
}

// ── Retry harness ──────────────────────────────────────────────────────────

/**
 * Run the single-attempt callback up to MAX_ATTEMPTS times with backoff,
 * recording each attempt via `recordSolveAttempt()`. On final failure
 * throws `CaptchaEscalationRequired`. `manual_handoff_required` errors
 * short-circuit the retry loop — we don't burn budget on something that
 * already needs a human.
 */
async function solveWithRetry(
  solver: CaptchaSolver,
  req: SolveRequest,
  attempt: () => Promise<SolveResult>,
): Promise<SolveResult> {
  let lastErr: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const start = Date.now();
    try {
      const result = await attempt();
      await recordSolveAttempt({
        provider:      solverProviderName(solver),
        challengeType: req.type,
        success:       true,
        costUsd:       result.costUsd,
        proxyUrl:      sanitizeProxy(req.proxyUrl),
        jobId:         req.context?.jobId,
        adapterId:     req.context?.adapterId,
        durationMs:    Date.now() - start,
      });
      return result;
    } catch (err) {
      lastErr = err;
      const cat = err instanceof CaptchaSolveError ? err.category : 'provider_error';
      await recordSolveAttempt({
        provider:      solverProviderName(solver),
        challengeType: req.type,
        success:       false,
        proxyUrl:      sanitizeProxy(req.proxyUrl),
        jobId:         req.context?.jobId,
        adapterId:     req.context?.adapterId,
        errorMessage:  err instanceof Error ? err.message : String(err),
        durationMs:    Date.now() - start,
      });

      // Non-retriable categories — escalate immediately.
      if (cat === 'manual_handoff_required' ||
          cat === 'unsupported_type' ||
          cat === 'invalid_request' ||
          cat === 'missing_credentials') {
        break;
      }

      // Wait before next attempt (no wait after last attempt).
      if (i < MAX_ATTEMPTS - 1) {
        await sleep(BACKOFF_MS[i] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!);
      }
    }
  }

  const lastMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new CaptchaEscalationRequired(
    `[captcha-solver] giving up after ${MAX_ATTEMPTS} attempts: ${lastMsg}`,
    MAX_ATTEMPTS,
    lastErr,
  );
}

function solverProviderName(s: CaptchaSolver): 'capsolver' | 'stub' {
  return s.providerName === 'capsolver' ? 'capsolver' : 'stub';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hashShort(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 8);
}

/** Strip embedded `user:pass@` from a proxy URL before logging or persisting. */
export function sanitizeProxy(proxy: string | undefined): string | undefined {
  if (!proxy) return undefined;
  try {
    const u = new URL(proxy);
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    // Not a parseable URL — strip anything that looks like creds before @.
    return proxy.replace(/\/\/[^@/]+@/, '//');
  }
}

function mapChallengeToTaskType(req: SolveRequest): CapSolverTaskType | null {
  const proxied = !!req.proxyUrl;
  switch (req.type) {
    case 'turnstile':
      return proxied ? 'AntiTurnstileTask' : 'AntiTurnstileTaskProxyLess';
    case 'recaptcha-v2':
    case 'recaptcha-v2-invisible':
      return proxied ? 'ReCaptchaV2Task' : 'ReCaptchaV2TaskProxyLess';
    case 'recaptcha-v3':
    case 'recaptcha-enterprise':
      return proxied ? 'ReCaptchaV3Task' : 'ReCaptchaV3TaskProxyLess';
    case 'hcaptcha':
      return proxied ? 'HCaptchaTask' : 'HCaptchaTaskProxyLess';
    case 'datadome':
    case 'unknown':
    default:
      return null;
  }
}

function extractToken(type: ChallengeType, solution: Record<string, unknown>): string | null {
  if (type === 'turnstile') {
    const t = solution.token;
    return typeof t === 'string' ? t : null;
  }
  // reCAPTCHA + hCaptcha both return gRecaptchaResponse.
  const t = solution.gRecaptchaResponse ?? solution.token;
  return typeof t === 'string' ? t : null;
}

function mapCapSolverErrorCategory(code: string | undefined): SolveErrorCategory {
  if (!code) return 'provider_error';
  const c = code.toUpperCase();
  if (c.includes('TIMEOUT')) return 'timeout';
  if (c.includes('CAPACITY') || c.includes('NO_SLOT')) return 'no_capacity';
  if (c.includes('INVALID')) return 'invalid_request';
  return 'provider_error';
}
