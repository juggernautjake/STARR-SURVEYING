// worker/src/__tests__/browser-lease.test.ts
//
// From the owner's 2026-08-30 run, once per document, eleven times:
//
//     Browser launched — viewport 1920x1200 for max resolution capture
//
// `acquireBrowser` launches a fresh Chromium on every call, so capturing a document set paid
// eleven cold starts for eleven visits to the SAME portal. `leaseBrowser` keeps one warm.
//
// These tests use the `stub` backend so nothing launches a real browser — the behaviour under test
// is the REFERENCE COUNTING, which is where a pool goes wrong: a browser closed while another
// holder is still using it surfaces as "Target closed" a long way from its cause.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BROWSER_MAX_LEASES,
  closeLeasedBrowser,
  leaseBrowser,
  leasedBrowserState,
} from '../lib/browser-factory.js';

const STUB = { backend: 'stub' as const };

beforeEach(async () => { await closeLeasedBrowser(); });
afterEach(async () => { await closeLeasedBrowser(); });

describe('a lease reuses one browser', () => {
  it('hands the same browser to two concurrent holders', async () => {
    const a = await leaseBrowser(STUB);
    const b = await leaseBrowser(STUB);
    // The entire point: one Chromium, two documents.
    expect(a.browser).toBe(b.browser);
    expect(leasedBrowserState().refs).toBe(2);
    await a.release();
    await b.release();
  });

  it('counts holders, so releasing one does not close it under the other', async () => {
    const a = await leaseBrowser(STUB);
    const b = await leaseBrowser(STUB);
    await a.release();
    // b is still working. This is the failure a naive pool produces, and it appears as a crash
    // during a DIFFERENT document than the one that caused it.
    expect(leasedBrowserState().refs).toBe(1);
    expect(leasedBrowserState().open).toBe(true);
    await b.release();
  });

  it('does not drive the count negative when a lease is released twice', async () => {
    // Defensive: a `finally` that runs twice, or a caller that releases and then throws, must not
    // corrupt the count for every later document.
    const a = await leaseBrowser(STUB);
    await a.release();
    await a.release();
    expect(leasedBrowserState().refs).toBe(0);
  });

  it('keeps the browser open briefly after the last release', async () => {
    // Closing between every document would reinstate exactly the cost this removes — the next
    // document is milliseconds away.
    const a = await leaseBrowser(STUB);
    await a.release();
    expect(leasedBrowserState().open).toBe(true);
    expect(leasedBrowserState().refs).toBe(0);
  });

  it('recycles after a bounded number of leases', async () => {
    // A long-lived Chromium accumulates memory. The cap is what stops "reuse" becoming "never
    // restart".
    expect(BROWSER_MAX_LEASES).toBeGreaterThan(1);
    expect(BROWSER_MAX_LEASES).toBeLessThanOrEqual(200);

    for (let i = 0; i < BROWSER_MAX_LEASES; i++) {
      const l = await leaseBrowser(STUB);
      await l.release();
    }
    const before = leasedBrowserState().uses;
    expect(before).toBeGreaterThanOrEqual(BROWSER_MAX_LEASES);

    const next = await leaseBrowser(STUB);
    expect(leasedBrowserState().uses).toBe(1); // recycled — a fresh browser, count restarted
    await next.release();
  });

  it('closeLeasedBrowser really closes it', async () => {
    const a = await leaseBrowser(STUB);
    await a.release();
    await closeLeasedBrowser();
    expect(leasedBrowserState().open).toBe(false);
  });
});

describe('the capture path leases rather than launching', () => {
  it('bell-clerk takes a lease and releases it, and never closes the browser it borrowed', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../services/bell-clerk.ts'), 'utf8')
      .split('\r\n').join('\n')
      .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');

    const capture = src.slice(src.indexOf('export async function fetchDocumentImages'));
    const body = capture.slice(0, capture.indexOf('\nexport ') === -1 ? capture.length : capture.indexOf('\nexport '));

    expect(body).toContain('lease = await leaseBrowser(');
    expect(body).toContain('await lease?.release()');
    // The one thing that must never happen: closing a browser other documents are holding.
    expect(body, 'closing a leased browser pulls it out from under every other holder')
      .not.toMatch(/await browser\.close\(\)/);
  });
});
