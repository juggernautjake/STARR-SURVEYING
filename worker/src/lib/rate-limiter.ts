// worker/src/lib/rate-limiter.ts
// Per-Site Rate Limiting — Starr Software Spec v2.0 §18
//
// Provides the concurrency + delay + exponential-backoff limits from the spec:
//
//   Bell CAD (BIS API):        5 req/sec,  200ms delay,  2× backoff (1/2/4/8s)
//   Bell County Clerk (Kofile): 2 concurrent, 3-5s delay, 3× backoff (30/60/120s)
//   TexasFile:                 5 req/sec,  1s delay,    2× backoff (5/10/20s)
//   TxDOT RPAM (ArcGIS):      10 req/sec, no delay,    2× backoff (5/10s)
//   Claude API:                Per-tier — handled by ai-extraction.ts retry logic

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SiteRateConfig {
  /** Maximum number of simultaneous in-flight requests */
  maxConcurrent: number;
  /** Minimum milliseconds between sequential requests on the same site */
  delayMs: number;
  /** Additional random jitter added to delayMs (prevents thundering-herd) */
  jitterMs: number;
  /** Initial backoff delay in ms for the first retry */
  backoffBaseMs: number;
  /** Backoff multiplier (2 = double each retry; 3 = triple) */
  backoffMultiplier: number;
  /** Maximum number of retries before giving up */
  maxRetries: number;
  /** Maximum backoff cap in ms */
  maxBackoffMs: number;
}

export type KnownSite =
  | 'bell_cad'
  | 'bell_clerk'
  | 'texasfile'
  | 'txdot_arcgis'
  | 'generic';

// ── Site configurations from spec §18 ────────────────────────────────────────

const SITE_CONFIGS: Record<KnownSite, SiteRateConfig> = {
  bell_cad: {
    maxConcurrent:    5,
    delayMs:          200,
    jitterMs:         50,
    backoffBaseMs:    1_000,
    backoffMultiplier: 2,
    maxRetries:       4,
    maxBackoffMs:     8_000,
  },
  bell_clerk: {
    maxConcurrent:    2,
    delayMs:          4_000,  // 3-5s; use 4s as default
    jitterMs:         1_000,
    backoffBaseMs:    30_000,
    backoffMultiplier: 3,
    maxRetries:       3,
    maxBackoffMs:     120_000,
  },
  texasfile: {
    maxConcurrent:    5,
    delayMs:          1_000,
    jitterMs:         200,
    backoffBaseMs:    5_000,
    backoffMultiplier: 2,
    maxRetries:       3,
    maxBackoffMs:     20_000,
  },
  txdot_arcgis: {
    maxConcurrent:    10,
    delayMs:          0,
    jitterMs:         0,
    backoffBaseMs:    5_000,
    backoffMultiplier: 2,
    maxRetries:       3,
    maxBackoffMs:     10_000,
  },
  generic: {
    maxConcurrent:    3,
    delayMs:          1_000,
    jitterMs:         200,
    backoffBaseMs:    2_000,
    backoffMultiplier: 2,
    maxRetries:       3,
    maxBackoffMs:     30_000,
  },
};

// ── Rate Limiter ──────────────────────────────────────────────────────────────

/**
 * Per-site rate limiter with concurrency control, delay enforcement,
 * and exponential backoff.
 *
 * Usage:
 *   const limiter = RateLimiter.forSite('bell_clerk');
 *   const result  = await limiter.execute(() => searchClerk(name));
 */
export class RateLimiter {
  private readonly config: SiteRateConfig;
  private activeCount   = 0;
  private lastRequestAt = 0;
  private readonly queue: Array<() => void> = [];

  constructor(config: SiteRateConfig) {
    this.config = config;
  }

  /** Get a pre-configured limiter for a known site */
  static forSite(site: KnownSite): RateLimiter {
    return new RateLimiter(SITE_CONFIGS[site]);
  }

  /**
   * Execute a task respecting rate limits and concurrency.
   * Retries on failure with exponential backoff.
   *
   * @param task  Async function to execute
   * @param label  Human-readable label for log output
   */
  async execute<T>(task: () => Promise<T>, label = 'task'): Promise<T> {
    await this.acquireSlot();

    try {
      return await this.executeWithBackoff(task, label);
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * Run multiple tasks in parallel, respecting concurrency limits.
   * Results are returned in the same order as the input tasks.
   */
  async executeAll<T>(
    tasks: Array<() => Promise<T>>,
    label = 'batch',
  ): Promise<Array<T | Error>> {
    const results: Array<T | Error> = new Array(tasks.length);

    const runners = tasks.map((task, i) =>
      this.execute(task, `${label}[${i}]`).then(
        r  => { results[i] = r; },
        err => { results[i] = err instanceof Error ? err : new Error(String(err)); },
      ),
    );

    await Promise.all(runners);
    return results;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async acquireSlot(): Promise<void> {
    // Wait for an available concurrency slot
    while (this.activeCount >= this.config.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.activeCount++;

    // Enforce minimum delay between sequential requests
    const now   = Date.now();
    const since = now - this.lastRequestAt;
    const total = this.config.delayMs + Math.random() * this.config.jitterMs;

    if (since < total) {
      await sleep(total - since);
    }
    this.lastRequestAt = Date.now();
  }

  private releaseSlot(): void {
    this.activeCount--;
    // Wake up the next queued waiter
    const next = this.queue.shift();
    if (next) next();
  }

  private async executeWithBackoff<T>(task: () => Promise<T>, label: string): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const rawDelay = this.config.backoffBaseMs *
          Math.pow(this.config.backoffMultiplier, attempt - 1);
        const delay = Math.min(rawDelay, this.config.maxBackoffMs);
        console.warn(`[RateLimiter] ${label}: attempt ${attempt}/${this.config.maxRetries}, backing off ${delay}ms`);
        await sleep(delay);
      }

      try {
        return await task();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on non-transient errors
        const msg = lastError.message.toLowerCase();
        if (msg.includes('captcha') || msg.includes('403') || msg.includes('401')) {
          throw lastError;
        }
      }
    }

    throw lastError;
  }
}

// ── Session heartbeat ─────────────────────────────────────────────────────────

/**
 * Session heartbeat that periodically checks if a clerk session is still valid
 * and re-authenticates when it expires.
 *
 * County clerk sessions expire after 15-30 minutes of inactivity. During long
 * parallel research runs (6+ adjacent properties), earlier sessions may expire.
 *
 * Usage:
 *   const heartbeat = new SessionHeartbeat(adapter, 10 * 60 * 1000); // 10 min
 *   heartbeat.start();
 *   // ... do work ...
 *   heartbeat.stop();
 */
export class SessionHeartbeat {
  private timer:       ReturnType<typeof setInterval> | null = null;
  private readonly isValid:   () => Promise<boolean>;
  private readonly refresh:   () => Promise<void>;
  private readonly intervalMs: number;
  private readonly label:      string;

  constructor(
    isValid:     () => Promise<boolean>,
    refresh:     () => Promise<void>,
    intervalMs = 10 * 60 * 1000,  // default: check every 10 minutes
    label = 'session',
  ) {
    this.isValid    = isValid;
    this.refresh    = refresh;
    this.intervalMs = intervalMs;
    this.label      = label;
  }

  /** Start the heartbeat checks */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      try {
        const valid = await this.isValid();
        if (!valid) {
          console.info(`[SessionHeartbeat:${this.label}] Session expired — refreshing...`);
          await this.refresh();
          console.info(`[SessionHeartbeat:${this.label}] Session refreshed`);
        }
      } catch (err) {
        console.warn(
          `[SessionHeartbeat:${this.label}] Heartbeat check failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }, this.intervalMs);
  }

  /** Stop the heartbeat */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Detect whether an error response indicates a CAPTCHA challenge */
export function isCaptchaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('captcha') || msg.includes('cloudflare') || msg.includes('blocked');
}

/** Detect whether an error response indicates a session expiry (401/redirect-to-login) */
export function isSessionExpiredError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('session') && msg.includes('expir') ||
    msg.includes('redirect') && msg.includes('login')
  );
}
