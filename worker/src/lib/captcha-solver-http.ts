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
  /** Per-request timeout in ms. Defaults to 30s. */
  requestTimeoutMs?: number;
}

/** Default per-request timeout. CapSolver responds within seconds for createTask
 * and getTaskResult; 30s is a generous ceiling that prevents indefinite hangs. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Mask all but the first 4 / last 4 characters of a key for safe logging. */
function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)} (${key.length} chars)`;
}

export class CapSolverHttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(opts: CapSolverHttpClientOptions) {
    this.apiKey   = opts.apiKey;
    this.baseUrl  = opts.baseUrl  ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (!this.apiKey) {
      throw new Error('[capsolver] CapSolverHttpClient requires apiKey');
    }
    console.log(`[capsolver-http] client initialised: baseUrl=${this.baseUrl} apiKey=${maskKey(this.apiKey)} timeoutMs=${this.requestTimeoutMs}`);
  }

  /**
   * Submit a new solve task. Returns the taskId on success.
   * Throws an Error with `errorCode` and `errorDescription` on API failure.
   */
  async createTask(task: CapSolverTaskBase): Promise<string> {
    const start = Date.now();
    console.log(`[capsolver-http] createTask → type=${task.type} url=${task.websiteURL} proxied=${task.proxy ? 'yes' : 'no'}`);
    const json = await this.postJson<CapSolverCreateTaskResponse>('/createTask', {
      clientKey: this.apiKey, task,
    });
    if (json.errorId !== 0 || !json.taskId) {
      const msg = json.errorDescription ?? json.errorCode ?? 'unknown CapSolver error';
      console.warn(`[capsolver-http] createTask failed (${Date.now() - start}ms): errorId=${json.errorId} code=${json.errorCode ?? 'n/a'} ${msg}`);
      throw new Error(`[capsolver] createTask failed: ${msg}`);
    }
    console.log(`[capsolver-http] createTask ok (${Date.now() - start}ms): taskId=${json.taskId}`);
    return json.taskId;
  }

  /**
   * Single poll for task result. Returns the response — caller decides
   * whether to retry on `status='processing'`.
   */
  async getTaskResult(taskId: string): Promise<CapSolverGetTaskResultResponse> {
    const start = Date.now();
    const json = await this.postJson<CapSolverGetTaskResultResponse>('/getTaskResult', {
      clientKey: this.apiKey, taskId,
    });
    const status = json.status ?? 'unknown';
    const elapsed = Date.now() - start;
    if (json.errorId !== 0) {
      console.warn(`[capsolver-http] getTaskResult error (${elapsed}ms): taskId=${taskId} errorId=${json.errorId} code=${json.errorCode ?? 'n/a'}`);
    } else {
      console.log(`[capsolver-http] getTaskResult ok (${elapsed}ms): taskId=${taskId} status=${status}${json.cost ? ` cost=$${json.cost}` : ''}`);
    }
    return json;
  }

  /**
   * Internal: POST + JSON parse with timeout + non-2xx handling. Centralises
   * fetch error normalisation so createTask / getTaskResult don't duplicate it.
   */
  private async postJson<T>(pathSegment: string, payload: unknown): Promise<T> {
    const url = `${this.baseUrl}${pathSegment}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      const isTimeout = (err as Error).name === 'AbortError';
      const detail = isTimeout
        ? `request timed out after ${this.requestTimeoutMs}ms`
        : (err as Error).message;
      console.warn(`[capsolver-http] POST ${pathSegment} network error: ${detail}`);
      throw new Error(`[capsolver] ${pathSegment} ${isTimeout ? 'timeout' : 'network error'}: ${detail}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      // Try to read the body as text to surface CapSolver's error page if any.
      const text = await res.text().catch(() => '');
      const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
      console.warn(`[capsolver-http] POST ${pathSegment} HTTP ${res.status}: ${snippet || '(empty body)'}`);
      throw new Error(`[capsolver] ${pathSegment} HTTP ${res.status}: ${snippet || res.statusText}`);
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new Error(`[capsolver] ${pathSegment} returned non-JSON response: ${(err as Error).message}`);
    }
  }
}
