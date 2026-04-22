// worker/src/__tests__/captcha-solver.test.ts
//
// Unit tests for the provider-agnostic CAPTCHA solver. Covers:
//   - Stub provider deterministic behavior + CAPTCHA_STUB_MODE branches
//   - CapSolver provider with mocked HTTP (createTask + getTaskResult)
//   - Three-strike retry inside solve()
//   - CaptchaEscalationRequired thrown on final failure
//   - recordSolveAttempt() called for every attempt (success + failure)
//   - Token cache: hit and miss paths
//   - Factory selection rules (env vs explicit)
//   - sanitizeProxy strips creds
//
// We deliberately do NOT make real network calls.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StubCaptchaSolver,
  CapSolverProvider,
  CaptchaSolveError,
  CaptchaEscalationRequired,
  getCaptchaSolver,
  setSolveAttemptSink,
  resetSolveAttemptSink,
  setCaptchaCache,
  sanitizeProxy,
  type SolveRequest,
  type SolveAttemptRecord,
  type CaptchaCache,
} from '../lib/captcha-solver.js';
import { CapSolverHttpClient } from '../lib/captcha-solver-http.js';

const baseReq: SolveRequest = {
  type: 'turnstile',
  pageUrl: 'https://search.example.county.tx.us/search',
  siteKey: '0x4AAAAAAATest',
  egressIp: '203.0.113.1',
  userAgent: 'Mozilla/5.0 (compatible; StarrTest/1.0)',
  context: { adapterId: 'bell-clerk', jobId: 'job-abc' },
};

// Helper: collect every recordSolveAttempt() call.
function makeSpySink() {
  const calls: SolveAttemptRecord[] = [];
  const sink = { record: vi.fn(async (r: SolveAttemptRecord) => { calls.push(r); }) };
  setSolveAttemptSink(sink);
  return { sink, calls };
}

describe('StubCaptchaSolver', () => {
  beforeEach(() => { delete process.env.CAPTCHA_STUB_MODE; resetSolveAttemptSink(); });
  afterEach(()  => { delete process.env.CAPTCHA_STUB_MODE; resetSolveAttemptSink(); });

  it('returns a deterministic stub token in default success mode', async () => {
    const solver = new StubCaptchaSolver();
    const a = await solver.solve(baseReq);
    const b = await solver.solve(baseReq);
    expect(a.token).toMatch(/^STUB-TOKEN\.turnstile\./);
    expect(a.token).toBe(b.token);
    expect(a.costUsd).toBe(0);
    expect(a.fromCache).toBe(false);
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('produces a different token for different (url, siteKey) pairs', async () => {
    const solver = new StubCaptchaSolver();
    const a = await solver.solve(baseReq);
    const b = await solver.solve({ ...baseReq, siteKey: '0xDIFFERENT' });
    expect(a.token).not.toBe(b.token);
  });

  it('escalates after MAX_ATTEMPTS=3 when CAPTCHA_STUB_MODE=fail', async () => {
    process.env.CAPTCHA_STUB_MODE = 'fail';
    const solver = new StubCaptchaSolver();
    await expect(solver.solve(baseReq)).rejects.toBeInstanceOf(CaptchaEscalationRequired);
  });

  it('escalates with attempts=3 and lastError preserved', async () => {
    process.env.CAPTCHA_STUB_MODE = 'fail';
    const solver = new StubCaptchaSolver();
    try {
      await solver.solve(baseReq);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CaptchaEscalationRequired);
      expect((err as CaptchaEscalationRequired).attempts).toBe(3);
      expect((err as CaptchaEscalationRequired).lastError).toBeInstanceOf(CaptchaSolveError);
    }
  });

  it('does NOT retry on manual_handoff_required — escalates after 1 attempt', async () => {
    process.env.CAPTCHA_STUB_MODE = 'manual';
    const { calls } = makeSpySink();
    const solver = new StubCaptchaSolver();
    await expect(solver.solve(baseReq)).rejects.toBeInstanceOf(CaptchaEscalationRequired);
    // One attempt recorded, all failures.
    expect(calls.length).toBe(1);
    expect(calls[0]?.success).toBe(false);
  }, 10_000);

  it('retries on timeout — three attempts before escalation', async () => {
    process.env.CAPTCHA_STUB_MODE = 'timeout';
    const { calls } = makeSpySink();
    const solver = new StubCaptchaSolver();
    await expect(solver.solve(baseReq)).rejects.toBeInstanceOf(CaptchaEscalationRequired);
    expect(calls.length).toBe(3);
    expect(calls.every(c => !c.success)).toBe(true);
  }, 10_000);
});

describe('recordSolveAttempt() instrumentation', () => {
  beforeEach(() => { delete process.env.CAPTCHA_STUB_MODE; resetSolveAttemptSink(); });
  afterEach(()  => { resetSolveAttemptSink(); });

  it('records a single success attempt with adapterId and jobId', async () => {
    const { calls } = makeSpySink();
    const solver = new StubCaptchaSolver();
    await solver.solve(baseReq);
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({
      provider:      'stub',
      challengeType: 'turnstile',
      success:       true,
      adapterId:     'bell-clerk',
      jobId:         'job-abc',
    });
    expect(calls[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records every attempt (3) when retries kick in', async () => {
    process.env.CAPTCHA_STUB_MODE = 'fail';
    const { calls } = makeSpySink();
    const solver = new StubCaptchaSolver();
    await expect(solver.solve(baseReq)).rejects.toBeInstanceOf(CaptchaEscalationRequired);
    expect(calls.length).toBe(3);
    expect(calls.every(c => !c.success)).toBe(true);
    expect(calls.every(c => c.errorMessage && c.errorMessage.length > 0)).toBe(true);
  }, 10_000);

  it('strips proxy credentials before recording', async () => {
    const { calls } = makeSpySink();
    const solver = new StubCaptchaSolver();
    await solver.solve({ ...baseReq, proxyUrl: 'http://user:secret@proxy.example.com:8080' });
    expect(calls[0]?.proxyUrl).toBe('http://proxy.example.com:8080/');
    expect(calls[0]?.proxyUrl).not.toContain('secret');
  });
});

describe('sanitizeProxy', () => {
  it('strips user:pass from a normal http URL', () => {
    expect(sanitizeProxy('http://user:pass@host:8080')).toBe('http://host:8080/');
  });
  it('returns undefined for undefined input', () => {
    expect(sanitizeProxy(undefined)).toBeUndefined();
  });
  it('handles unparseable input by stripping anything before @', () => {
    expect(sanitizeProxy('not-a-url://user:pass@host')).not.toContain('user:pass');
  });
  it('passes through already-clean URLs', () => {
    expect(sanitizeProxy('http://proxy.example.com:8080')).toBe('http://proxy.example.com:8080/');
  });
});

describe('CapSolverProvider', () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.CAPSOLVER_API_KEY;
    resetSolveAttemptSink();
    setCaptchaCache(null);
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.CAPSOLVER_API_KEY;
    else process.env.CAPSOLVER_API_KEY = savedKey;
    resetSolveAttemptSink();
    setCaptchaCache(null);
  });

  it('throws missing_credentials when CAPSOLVER_API_KEY is unset (no retry)', async () => {
    delete process.env.CAPSOLVER_API_KEY;
    const { calls } = makeSpySink();
    const solver = new CapSolverProvider();
    await expect(solver.solve(baseReq)).rejects.toMatchObject({
      name: 'CaptchaSolveError',
      category: 'missing_credentials',
    });
    // One attempt recorded, no retries (creds-related is fail-fast).
    expect(calls.length).toBe(1);
    expect(calls[0]?.success).toBe(false);
    expect(calls[0]?.errorMessage).toMatch(/missing CAPSOLVER_API_KEY/);
  });

  it('returns a token on the happy path with mocked HTTP', async () => {
    process.env.CAPSOLVER_API_KEY = 'fake-key';
    const fakeFetch = makeFakeFetch({
      createTask:    { errorId: 0, taskId: 'task-123' },
      getTaskResult: { errorId: 0, status: 'ready', solution: { token: 'TURNSTILE-OK' }, cost: '0.0010' },
    });
    const solver = new CapSolverProvider(
      (k) => new CapSolverHttpClient({ apiKey: k, fetchImpl: fakeFetch }),
    );
    const result = await solver.solve(baseReq);
    expect(result.token).toBe('TURNSTILE-OK');
    expect(result.provider).toBe('capsolver');
    expect(result.costUsd).toBeCloseTo(0.001);
    expect(result.fromCache).toBe(false);
  });

  it('three-strike retry then CaptchaEscalationRequired on persistent provider_error', async () => {
    process.env.CAPSOLVER_API_KEY = 'fake-key';
    let calls = 0;
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/createTask')) {
        calls++;
        return new Response(JSON.stringify({ errorId: 1, errorCode: 'ERR_PROVIDER_BUSY', errorDescription: 'busy' }), { status: 200 });
      }
      throw new Error('unexpected url ' + url);
    };
    const solver = new CapSolverProvider(
      (k) => new CapSolverHttpClient({ apiKey: k, fetchImpl: fakeFetch }),
    );
    await expect(solver.solve(baseReq)).rejects.toBeInstanceOf(CaptchaEscalationRequired);
    expect(calls).toBe(3); // exactly three attempts
  }, 10_000);

  it('routes reCAPTCHA v3 to ReCaptchaV3 task type and forwards pageAction/minScore', async () => {
    process.env.CAPSOLVER_API_KEY = 'fake-key';
    let createBody: any = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/createTask')) {
        createBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ errorId: 0, taskId: 't1' }), { status: 200 });
      }
      if (url.endsWith('/getTaskResult')) {
        return new Response(JSON.stringify({ errorId: 0, status: 'ready', solution: { gRecaptchaResponse: 'V3-TOKEN' }, cost: '0.0020' }), { status: 200 });
      }
      throw new Error(url);
    };
    const solver = new CapSolverProvider(
      (k) => new CapSolverHttpClient({ apiKey: k, fetchImpl: fakeFetch }),
    );
    const result = await solver.solve({
      ...baseReq,
      type: 'recaptcha-v3',
      recaptchaAction: 'submit',
      recaptchaScoreMin: 0.7,
    });
    expect(result.token).toBe('V3-TOKEN');
    expect(createBody.task.type).toBe('ReCaptchaV3TaskProxyLess');
    expect(createBody.task.pageAction).toBe('submit');
    expect(createBody.task.minScore).toBe(0.7);
  });

  it('uses proxied task type when proxyUrl is provided', async () => {
    process.env.CAPSOLVER_API_KEY = 'fake-key';
    let createBody: any = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/createTask')) {
        createBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ errorId: 0, taskId: 't' }), { status: 200 });
      }
      return new Response(JSON.stringify({ errorId: 0, status: 'ready', solution: { token: 'T' } }), { status: 200 });
    };
    const solver = new CapSolverProvider(
      (k) => new CapSolverHttpClient({ apiKey: k, fetchImpl: fakeFetch }),
    );
    await solver.solve({ ...baseReq, proxyUrl: 'http://u:p@proxy:8080' });
    expect(createBody.task.type).toBe('AntiTurnstileTask');
    expect(createBody.task.proxy).toBe('http://u:p@proxy:8080');
  });

  it('throws unsupported_type for datadome (no CapSolver task mapping)', async () => {
    process.env.CAPSOLVER_API_KEY = 'fake-key';
    const fakeFetch: typeof fetch = async () => new Response('{}', { status: 200 });
    const solver = new CapSolverProvider(
      (k) => new CapSolverHttpClient({ apiKey: k, fetchImpl: fakeFetch }),
    );
    // Single fail-fast attempt (no retry on unsupported_type).
    await expect(solver.solve({ ...baseReq, type: 'datadome' }))
      .rejects.toBeInstanceOf(CaptchaEscalationRequired);
  });
});

describe('Token cache', () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.CAPSOLVER_API_KEY;
    resetSolveAttemptSink();
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.CAPSOLVER_API_KEY;
    else process.env.CAPSOLVER_API_KEY = savedKey;
    setCaptchaCache(null);
    resetSolveAttemptSink();
  });

  function makeMemoryCache(): CaptchaCache & { store: Map<string, string> } {
    const store = new Map<string, string>();
    return {
      store,
      async get(k) { return store.get(k) ?? null; },
      async set(k, v) { store.set(k, v); },
    };
  }

  it('cache miss → calls HTTP → cache write', async () => {
    process.env.CAPSOLVER_API_KEY = 'fake-key';
    const cache = makeMemoryCache();
    setCaptchaCache(cache);
    const fakeFetch = makeFakeFetch({
      createTask: { errorId: 0, taskId: 't' },
      getTaskResult: { errorId: 0, status: 'ready', solution: { token: 'CACHED-TOKEN' }, cost: '0.001' },
    });
    const solver = new CapSolverProvider(
      (k) => new CapSolverHttpClient({ apiKey: k, fetchImpl: fakeFetch }),
    );
    const r = await solver.solve(baseReq);
    expect(r.token).toBe('CACHED-TOKEN');
    expect(r.fromCache).toBe(false);
    expect(cache.store.size).toBe(1);
  });

  it('cache hit → no HTTP call, fromCache=true', async () => {
    process.env.CAPSOLVER_API_KEY = 'fake-key';
    const cache = makeMemoryCache();
    setCaptchaCache(cache);
    // Pre-seed the cache with a valid (non-expiring) token for the baseReq.
    // Key format: captcha:turnstile:host:egress:uaHash — easier to just
    // run one solve to populate it, then check that the second solve doesn't hit HTTP.
    let httpCalls = 0;
    const fakeFetch: typeof fetch = async (input) => {
      httpCalls++;
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/createTask')) {
        return new Response(JSON.stringify({ errorId: 0, taskId: 't' }), { status: 200 });
      }
      return new Response(JSON.stringify({ errorId: 0, status: 'ready', solution: { token: 'PRIMED' }, cost: '0.001' }), { status: 200 });
    };
    const solver = new CapSolverProvider(
      (k) => new CapSolverHttpClient({ apiKey: k, fetchImpl: fakeFetch }),
    );
    await solver.solve(baseReq);
    const httpAfterPrime = httpCalls;

    // Second call — should be fully cache-served.
    const r2 = await solver.solve(baseReq);
    expect(r2.token).toBe('PRIMED');
    expect(r2.fromCache).toBe(true);
    expect(httpCalls).toBe(httpAfterPrime); // no additional HTTP calls
  });
});

describe('getCaptchaSolver factory', () => {
  let savedKey: string | undefined;
  let savedProv: string | undefined;
  beforeEach(() => {
    savedKey  = process.env.CAPSOLVER_API_KEY;
    savedProv = process.env.CAPTCHA_PROVIDER;
  });
  afterEach(() => {
    if (savedKey  === undefined) delete process.env.CAPSOLVER_API_KEY;
    else process.env.CAPSOLVER_API_KEY = savedKey;
    if (savedProv === undefined) delete process.env.CAPTCHA_PROVIDER;
    else process.env.CAPTCHA_PROVIDER = savedProv;
  });

  it('returns stub when no env hints are set', () => {
    delete process.env.CAPSOLVER_API_KEY;
    delete process.env.CAPTCHA_PROVIDER;
    expect(getCaptchaSolver().providerName).toBe('stub');
  });

  it('returns capsolver when CAPSOLVER_API_KEY is present', () => {
    process.env.CAPSOLVER_API_KEY = 'fake';
    delete process.env.CAPTCHA_PROVIDER;
    expect(getCaptchaSolver().providerName).toBe('capsolver');
  });

  it('honors explicit override above all env signals', () => {
    process.env.CAPSOLVER_API_KEY = 'fake';
    expect(getCaptchaSolver('stub').providerName).toBe('stub');
  });

  it('honors CAPTCHA_PROVIDER env over auto-detect', () => {
    process.env.CAPSOLVER_API_KEY = 'fake';
    process.env.CAPTCHA_PROVIDER  = 'stub';
    expect(getCaptchaSolver().providerName).toBe('stub');
  });
});

// ── Test helpers ───────────────────────────────────────────────────────────

interface FakeFetchSpec {
  createTask: object;
  getTaskResult: object;
}

function makeFakeFetch(spec: FakeFetchSpec): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.endsWith('/createTask')) {
      return new Response(JSON.stringify(spec.createTask), { status: 200 });
    }
    if (url.endsWith('/getTaskResult')) {
      return new Response(JSON.stringify(spec.getTaskResult), { status: 200 });
    }
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch;
}
