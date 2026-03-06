// worker/src/infra/resilience.ts — Phase 11 Module K
// Circuit breaker and retry-with-backoff patterns for all external requests.
// Wraps county clerk, CAD, TxDOT, FEMA, GLO, TCEQ, RRC, NRCS, and Claude API calls.
//
// Spec §11.12.1 — Retry & Circuit Breaker

// ── Circuit Breaker ─────────────────────────────────────────────────────────

export class CircuitBreaker {
  private failureCount = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private config: {
      name: string;
      failureThreshold: number;
      resetTimeoutMs: number;
      halfOpenMaxAttempts: number;
    },
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.config.resetTimeoutMs) {
        this.state = 'half-open';
        console.log(
          `[CircuitBreaker] ${this.config.name} transitioning to HALF-OPEN`,
        );
      } else {
        throw new Error(
          `[CircuitBreaker] ${this.config.name} is OPEN — skipping request`,
        );
      }
    }

    try {
      const result = await fn();
      this.failureCount = 0;
      if (this.state === 'half-open') {
        this.state = 'closed';
        console.log(
          `[CircuitBreaker] ${this.config.name} recovered → CLOSED`,
        );
      }
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailure = Date.now();
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'open';
        console.warn(
          `[CircuitBreaker] ${this.config.name} TRIPPED — ${this.failureCount} consecutive failures`,
        );
      }
      throw err;
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }
}

// ── Retry with Exponential Backoff ──────────────────────────────────────────

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === maxAttempts) throw err;
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs,
      );
      const jitter = delay * 0.2 * Math.random();
      console.warn(
        `[Retry] Attempt ${attempt}/${maxAttempts} failed: ${err.message}. ` +
        `Retrying in ${(delay + jitter).toFixed(0)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
  throw new Error('unreachable');
}

// ── Pre-configured Circuit Breakers ─────────────────────────────────────────

export const circuitBreakers = {
  kofile: new CircuitBreaker({
    name: 'Kofile',
    failureThreshold: 3,
    resetTimeoutMs: 120_000, // 2 minutes
    halfOpenMaxAttempts: 1,
  }),

  texasfile: new CircuitBreaker({
    name: 'TexasFile',
    failureThreshold: 3,
    resetTimeoutMs: 120_000,
    halfOpenMaxAttempts: 1,
  }),

  fema: new CircuitBreaker({
    name: 'FEMA NFHL',
    failureThreshold: 5,
    resetTimeoutMs: 60_000,
    halfOpenMaxAttempts: 2,
  }),

  glo: new CircuitBreaker({
    name: 'Texas GLO',
    failureThreshold: 3,
    resetTimeoutMs: 120_000,
    halfOpenMaxAttempts: 1,
  }),

  tceq: new CircuitBreaker({
    name: 'TCEQ',
    failureThreshold: 3,
    resetTimeoutMs: 120_000,
    halfOpenMaxAttempts: 1,
  }),

  rrc: new CircuitBreaker({
    name: 'Texas RRC',
    failureThreshold: 3,
    resetTimeoutMs: 120_000,
    halfOpenMaxAttempts: 1,
  }),

  nrcs: new CircuitBreaker({
    name: 'NRCS SDA',
    failureThreshold: 3,
    resetTimeoutMs: 120_000,
    halfOpenMaxAttempts: 1,
  }),

  claude: new CircuitBreaker({
    name: 'Claude API',
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenMaxAttempts: 2,
  }),

  txdot: new CircuitBreaker({
    name: 'TxDOT',
    failureThreshold: 3,
    resetTimeoutMs: 120_000,
    halfOpenMaxAttempts: 1,
  }),
};
