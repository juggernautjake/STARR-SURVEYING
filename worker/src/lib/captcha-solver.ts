// worker/src/lib/captcha-solver.ts
//
// Provider-agnostic CAPTCHA solver. Wraps CapSolver (or a future alternative
// like 2Captcha / AntiCaptcha) behind a single interface so we can swap
// providers without touching adapter code.
//
// CRITICAL DESIGN NOTES:
//
// 1. IP binding. Cloudflare Turnstile and reCAPTCHA Enterprise issue tokens
//    that are bound to the IP the solve happened on. If the browser session
//    that submits the form is on a different IP than the one CapSolver used,
//    the token is rejected. This solver therefore always asks the caller to
//    pass `egressIp` (from the Browserbase session) and forwards it to the
//    provider as proxy parameters.
//
// 2. Token caching. `cf_clearance` cookies are valid for ~30 minutes per
//    IP+UA pair. Caching them in Redis avoids paying for solves we already
//    have. The cache key is `captcha:cfclearance:<host>:<egressIp>:<uaHash>`.
//    Implemented in Phase A; Phase 0 just defines the cache interface.
//
// 3. Cost telemetry. Every solve emits a `captcha_solve` event to
//    billing-tracker so we can attribute cost per-county and per-job.
//
// 4. Three-strike escalation. Up to 3 attempts (with exponential backoff)
//    before falling through to the manual handoff event bus. Existing
//    `rate-limiter.ts` provides the retry mechanics; we wire into them in
//    Phase A.
//
// Phase 0 ships:
//   - Full TypeScript interface (`CaptchaSolver`, `SolveRequest`, `SolveResult`)
//   - Three concrete implementations: `StubCaptchaSolver`, `CapSolverProvider`
//     (throws until wired), and `getCaptchaSolver()` factory
//   - Cost-tracking shape (no actual emission yet)
//
// Phase A replaces the throws in `CapSolverProvider` with real HTTP calls
// against api.capsolver.com.

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

export class CaptchaSolveError extends Error {
  constructor(
    message: string,
    public readonly category:
      | 'unsupported_type'
      | 'missing_credentials'
      | 'provider_error'
      | 'timeout'
      | 'no_capacity'
      | 'invalid_request'
      | 'manual_handoff_required',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CaptchaSolveError';
  }
}

export interface CaptchaSolver {
  readonly providerName: string;
  solve(req: SolveRequest): Promise<SolveResult>;
}

// ── Factory ────────────────────────────────────────────────────────────────

export type CaptchaProvider = 'capsolver' | 'stub' | 'auto';

/**
 * Resolve which solver to use. Selection rules:
 *   1. options.provider override
 *   2. process.env.CAPTCHA_PROVIDER ∈ {capsolver, stub}
 *   3. CAPSOLVER_API_KEY present → 'capsolver'
 *   4. NODE_ENV === 'test' → 'stub'
 *   5. Default → 'stub' (Phase 0 — no real solver wired)
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

// ── Stub provider ──────────────────────────────────────────────────────────

/**
 * Stub solver. Returns a deterministic fake token after a small delay so
 * higher-level code (retry logic, manual-handoff escalation, billing-tracker)
 * can be exercised end-to-end without a real CapSolver account.
 *
 * Set `process.env.CAPTCHA_STUB_MODE` to control behavior:
 *   - 'success' (default): returns a synthetic token
 *   - 'fail':              throws CaptchaSolveError(category='provider_error')
 *   - 'manual':            throws CaptchaSolveError(category='manual_handoff_required')
 *   - 'timeout':           throws CaptchaSolveError(category='timeout')
 */
export class StubCaptchaSolver implements CaptchaSolver {
  readonly providerName = 'stub';

  async solve(req: SolveRequest): Promise<SolveResult> {
    const mode = (process.env.CAPTCHA_STUB_MODE ?? 'success').toLowerCase();

    // Tiny delay so callers can observe non-zero durations in telemetry.
    await new Promise<void>((resolve) => setTimeout(resolve, 25));

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
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
          fromCache: false,
        };
      }
    }
  }
}

// ── CapSolver provider (stub until Phase A) ────────────────────────────────

/**
 * Real CapSolver implementation. Phase 0 leaves the actual HTTP wiring as
 * TODO; the constructor checks for credentials and the `solve()` method
 * throws a clear error explaining what's left to do.
 *
 * Phase A wiring sketch:
 *
 *   POST https://api.capsolver.com/createTask
 *     body: {
 *       clientKey: this.apiKey,
 *       task: { type, websiteURL, websiteKey, proxy: ... },
 *     }
 *   → { taskId }
 *
 *   POST https://api.capsolver.com/getTaskResult
 *     body: { clientKey: this.apiKey, taskId }
 *   → polls every 2s for up to 120s; returns { solution: { token: ... } }
 *
 * Implementation notes for Phase A:
 *   - Map our ChallengeType → CapSolver task type ('AntiTurnstileTaskProxyless',
 *     'ReCaptchaV2TaskProxyLess', 'ReCaptchaV3EnterpriseTask', etc.).
 *   - When `egressIp` is set, route through the proxy variant of the task type
 *     (e.g. `AntiTurnstileTask` instead of `AntiTurnstileTaskProxyless`) and
 *     attach proxy credentials matching the Browserbase session's egress.
 *   - Cache successful tokens in Redis under
 *     `captcha:<type>:<host>:<egressIp>:<uaHash>` with TTL = expiresAt - 60s.
 *   - On timeout/no_capacity, throw with category so the caller can decide
 *     whether to retry or escalate to manual handoff.
 */
export class CapSolverProvider implements CaptchaSolver {
  readonly providerName = 'capsolver';
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.CAPSOLVER_API_KEY;
  }

  async solve(_req: SolveRequest): Promise<SolveResult> {
    if (!this.apiKey) {
      throw new CaptchaSolveError(
        '[captcha-solver:capsolver] CAPSOLVER_API_KEY is not set. Either ' +
        'provide one or set CAPTCHA_PROVIDER=stub for development.',
        'missing_credentials',
      );
    }

    throw new CaptchaSolveError(
      '[captcha-solver:capsolver] Not yet implemented (Phase A). The wiring ' +
      'sketch lives in the docstring of CapSolverProvider in this file. ' +
      'Until implemented, set CAPTCHA_PROVIDER=stub to use the deterministic ' +
      'stub solver. See docs/RECON_INVENTORY.md §6 for context.',
      'provider_error',
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hashShort(input: string): string {
  // Simple deterministic short hash for stub tokens. Not cryptographic.
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 8);
}
