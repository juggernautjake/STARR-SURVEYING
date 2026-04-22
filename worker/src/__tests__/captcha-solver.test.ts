// worker/src/__tests__/captcha-solver.test.ts
//
// Unit tests for the provider-agnostic CAPTCHA solver. Phase 0 only ships
// the Stub provider's behavior — the CapSolver provider is an
// intentional-throw until Phase A.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  StubCaptchaSolver,
  CapSolverProvider,
  CaptchaSolveError,
  getCaptchaSolver,
  type SolveRequest,
} from '../lib/captcha-solver.js';

const baseReq: SolveRequest = {
  type: 'turnstile',
  pageUrl: 'https://search.example.county.tx.us/search',
  siteKey: '0x4AAAAAAATest',
  egressIp: '203.0.113.1',
  userAgent: 'Mozilla/5.0 (compatible; StarrTest/1.0)',
};

describe('StubCaptchaSolver', () => {
  beforeEach(() => { delete process.env.CAPTCHA_STUB_MODE; });
  afterEach(()  => { delete process.env.CAPTCHA_STUB_MODE; });

  it('returns a deterministic stub token in default success mode', async () => {
    const solver = new StubCaptchaSolver();
    const a = await solver.solve(baseReq);
    const b = await solver.solve(baseReq);
    expect(a.token).toMatch(/^STUB-TOKEN\.turnstile\./);
    expect(a.token).toBe(b.token);             // deterministic
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

  it('throws provider_error when CAPTCHA_STUB_MODE=fail', async () => {
    process.env.CAPTCHA_STUB_MODE = 'fail';
    const solver = new StubCaptchaSolver();
    await expect(solver.solve(baseReq)).rejects.toMatchObject({
      name: 'CaptchaSolveError',
      category: 'provider_error',
    });
  });

  it('throws manual_handoff_required when CAPTCHA_STUB_MODE=manual', async () => {
    process.env.CAPTCHA_STUB_MODE = 'manual';
    const solver = new StubCaptchaSolver();
    await expect(solver.solve(baseReq)).rejects.toMatchObject({
      category: 'manual_handoff_required',
    });
  });

  it('throws timeout when CAPTCHA_STUB_MODE=timeout', async () => {
    process.env.CAPTCHA_STUB_MODE = 'timeout';
    const solver = new StubCaptchaSolver();
    await expect(solver.solve(baseReq)).rejects.toMatchObject({
      category: 'timeout',
    });
  });
});

describe('CapSolverProvider', () => {
  let savedKey: string | undefined;
  beforeEach(() => { savedKey = process.env.CAPSOLVER_API_KEY; });
  afterEach(()  => {
    if (savedKey === undefined) delete process.env.CAPSOLVER_API_KEY;
    else process.env.CAPSOLVER_API_KEY = savedKey;
  });

  it('throws missing_credentials when CAPSOLVER_API_KEY is unset', async () => {
    delete process.env.CAPSOLVER_API_KEY;
    const solver = new CapSolverProvider();
    await expect(solver.solve(baseReq)).rejects.toMatchObject({
      name: 'CaptchaSolveError',
      category: 'missing_credentials',
    });
  });

  it('throws not-yet-implemented (provider_error) when key IS set in Phase 0', async () => {
    process.env.CAPSOLVER_API_KEY = 'fake-key-for-test';
    const solver = new CapSolverProvider();
    try {
      await solver.solve(baseReq);
      throw new Error('expected solve() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CaptchaSolveError);
      expect((err as CaptchaSolveError).category).toBe('provider_error');
      expect((err as Error).message).toMatch(/not yet implemented/i);
    }
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
