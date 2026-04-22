// worker/src/__tests__/browser-factory.test.ts
//
// Unit tests for the browser-factory abstraction. We exercise the stub
// backend (no Playwright launch) and confirm the Browserbase backend throws
// the expected "not yet implemented" error in Phase 0.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBrowser } from '../lib/browser-factory.js';

describe('browser-factory: stub backend', () => {
  it('returns a session with backend=stub and an egressIp', async () => {
    const session = await getBrowser({ backend: 'stub' });
    expect(session.backend).toBe('stub');
    expect(session.egressIp).toBe('203.0.113.1');
    await session.close();
  });

  it('returns a stub Browser whose newContext throws clearly', async () => {
    const session = await getBrowser({ backend: 'stub' });
    expect(() => session.browser.newContext()).toThrow(/stub browser/);
    await session.close();
  });

  it('close() is idempotent', async () => {
    const session = await getBrowser({ backend: 'stub' });
    await session.close();
    await expect(session.close()).resolves.toBeUndefined();
  });
});

describe('browser-factory: browserbase backend (Phase 0 stubs)', () => {
  let saved: { key?: string; project?: string; backend?: string };
  beforeEach(() => {
    saved = {
      key: process.env.BROWSERBASE_API_KEY,
      project: process.env.BROWSERBASE_PROJECT_ID,
      backend: process.env.BROWSER_BACKEND,
    };
  });
  afterEach(() => {
    for (const [k, v] of Object.entries({
      BROWSERBASE_API_KEY: saved.key,
      BROWSERBASE_PROJECT_ID: saved.project,
      BROWSER_BACKEND: saved.backend,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('throws missing-credentials error when explicit but unconfigured', async () => {
    delete process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_PROJECT_ID;
    await expect(getBrowser({ backend: 'browserbase' }))
      .rejects.toThrow(/BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID/);
  });

  it('throws not-yet-implemented error when both vars are set in Phase 0', async () => {
    process.env.BROWSERBASE_API_KEY    = 'fake-key';
    process.env.BROWSERBASE_PROJECT_ID = 'fake-proj';
    await expect(getBrowser({ backend: 'browserbase' }))
      .rejects.toThrow(/not yet wired up \(Phase A\)/);
  });
});

describe('browser-factory: backend resolution', () => {
  let savedBackend: string | undefined;
  let savedKey:     string | undefined;
  beforeEach(() => {
    savedBackend = process.env.BROWSER_BACKEND;
    savedKey     = process.env.BROWSERBASE_API_KEY;
  });
  afterEach(() => {
    if (savedBackend === undefined) delete process.env.BROWSER_BACKEND;
    else process.env.BROWSER_BACKEND = savedBackend;
    if (savedKey === undefined) delete process.env.BROWSERBASE_API_KEY;
    else process.env.BROWSERBASE_API_KEY = savedKey;
  });

  it('honors BROWSER_BACKEND=stub even when BROWSERBASE_API_KEY is set', async () => {
    process.env.BROWSER_BACKEND     = 'stub';
    process.env.BROWSERBASE_API_KEY = 'fake';
    const session = await getBrowser({});
    expect(session.backend).toBe('stub');
    await session.close();
  });
});
