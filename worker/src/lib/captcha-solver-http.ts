// worker/src/lib/captcha-solver-http.ts
//
// Minimal HTTP client for the CapSolver REST API. We deliberately keep the
// surface area small — only `createTask()` and `getTaskResult()` —
// because that's all our four supported challenge types need (Turnstile,
// reCAPTCHA v2, reCAPTCHA v3, hCaptcha).
//
// CapSolver does NOT publish an official Node SDK as of this PR
// (verified with `npm view @capsolver/sdk` returning 404). The third-party
// `capsolver-npm` package exists but is community-maintained; we prefer
// to own the small amount of code needed here so behavior is auditable
// and the only network-touching surface is documented in this file.
//
// CapSolver API reference:
//   https://docs.capsolver.com/guide/api-server.html
//
// Endpoints used:
//   POST https://api.capsolver.com/createTask    — submit a task
//   POST https://api.capsolver.com/getTaskResult — poll for solution

const DEFAULT_BASE_URL = 'https://api.capsolver.com';

/**
 * Subset of CapSolver task types that match our four supported challenge
 * types. The Proxyless variants are used when no `proxy` is supplied;
 * the proxy variants are used otherwise. See:
 *   https://docs.capsolver.com/guide/captcha/AntiTurnstile.html
 *   https://docs.capsolver.com/guide/captcha/ReCaptchaV2.html
 *   https://docs.capsolver.com/guide/captcha/ReCaptchaV3.html
 *   https://docs.capsolver.com/guide/captcha/HCaptcha.html
 */
export type CapSolverTaskType =
  | 'AntiTurnstileTaskProxyLess'
  | 'AntiTurnstileTask'
  | 'ReCaptchaV2TaskProxyLess'
  | 'ReCaptchaV2Task'
  | 'ReCaptchaV3TaskProxyLess'
  | 'ReCaptchaV3Task'
  | 'HCaptchaTaskProxyLess'
  | 'HCaptchaTask';

export interface CapSolverTaskBase {
  type: CapSolverTaskType;
  websiteURL: string;
  websiteKey: string;
  /** Required for non-Proxyless variants; in URL form e.g. "http://user:pass@host:port". */
  proxy?: string;
  /** reCAPTCHA v3 only. */
  pageAction?: string;
  /** reCAPTCHA v3 / Enterprise score floor (0.0–1.0). */
  minScore?: number;
  /** Optional User-Agent used by CapSolver when invoking the challenge. */
  userAgent?: string;
}

export interface CapSolverCreateTaskResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  taskId?: string;
}

export interface CapSolverGetTaskResultResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  status?: 'idle' | 'processing' | 'ready';
  /**
   * Solution payload. Shape varies per task type but the token/answer
   * always lives on a known property:
   *   - Turnstile: solution.token
   *   - reCAPTCHA: solution.gRecaptchaResponse
   *   - hCaptcha:  solution.gRecaptchaResponse
   * We expose the raw object and let the caller pick.
   */
  solution?: Record<string, unknown>;
  /** USD cost reported by CapSolver after the task completes. */
  cost?: string;
}

export interface CapSolverHttpClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Custom fetch implementation (used by tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class CapSolverHttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CapSolverHttpClientOptions) {
    this.apiKey   = opts.apiKey;
    this.baseUrl  = opts.baseUrl  ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Submit a new solve task. Returns the taskId on success.
   * Throws an Error with `errorCode` and `errorDescription` on API failure.
   */
  async createTask(task: CapSolverTaskBase): Promise<string> {
    const body = JSON.stringify({ clientKey: this.apiKey, task });
    const res = await this.fetchImpl(`${this.baseUrl}/createTask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const json = (await res.json()) as CapSolverCreateTaskResponse;
    if (json.errorId !== 0 || !json.taskId) {
      const msg = json.errorDescription ?? json.errorCode ?? 'unknown CapSolver error';
      throw new Error(`[capsolver] createTask failed: ${msg}`);
    }
    return json.taskId;
  }

  /**
   * Single poll for task result. Returns the response — caller decides
   * whether to retry on `status='processing'`.
   */
  async getTaskResult(taskId: string): Promise<CapSolverGetTaskResultResponse> {
    const body = JSON.stringify({ clientKey: this.apiKey, taskId });
    const res = await this.fetchImpl(`${this.baseUrl}/getTaskResult`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    return (await res.json()) as CapSolverGetTaskResultResponse;
  }
}
