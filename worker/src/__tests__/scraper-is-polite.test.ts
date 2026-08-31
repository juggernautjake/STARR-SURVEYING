// worker/src/__tests__/scraper-is-polite.test.ts
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────
//
// `infra/politeness.ts` was written for the scraper. Its own header:
//
//   "These are small government servers. The fastest way to lose a county is to look like a load
//    test on a Tuesday morning."
//
// Measured 2026-08-30, with a control: `withPoliteness` had ZERO callers in `services/bell-clerk.ts`
// — the file that actually drives a browser against county portals — and its only consumer anywhere
// was `infra/site-health-monitor.ts`. The mechanism written to keep the SCRAPER from hammering a
// county was wired to the health checker and to nothing that scrapes.
//
// One owner run made roughly forty back-to-back navigations against bell.tx.publicsearch.us with no
// pacing at all. Nothing failed, which is exactly why nobody noticed: the cost of this defect is not
// an error, it is a ban, and it arrives long after the code that earned it.
//
// This is also the precondition for the concurrency work. Capturing documents in parallel against an
// unthrottled portal does not make a run faster so much as it raises the odds of losing the county —
// and a banned county is not a slow run, it is no run.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCRAPER = path.resolve(__dirname, '../services/bell-clerk.ts');

const strip = (s: string) => s
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');

const src = strip(fs.readFileSync(SCRAPER, 'utf8'));

describe('every navigation in the scraper is paced', () => {
  it('imports the politeness helper', () => {
    expect(src).toMatch(/import \{ withPoliteness \} from '\.\.\/infra\/politeness\.js'/);
  });

  it('has no raw page.goto left', () => {
    // The whole point. A single unwrapped navigation is an unpaced request to a county server,
    // and it would be invisible — nothing errors, the page just loads.
    const raw = [...src.matchAll(/await page\.goto\(/g)];
    expect(
      raw.length,
      'every navigation must go through politeGoto so it is paced per host',
    ).toBe(0);
  });

  it('routes a plausible number of navigations through the paced helper', () => {
    // Control. If politeGoto were deleted and every call site removed, the assertion above would
    // pass on an empty file. This pins that the navigations still exist.
    const paced = [...src.matchAll(/await politeGoto\(page,/g)];
    expect(paced.length).toBeGreaterThanOrEqual(8);
  });

  it('the helper paces on the URL being fetched, not a constant', () => {
    // Politeness keys on host. Passing anything but the real URL would pace the wrong host — or
    // one bucket for all of them — and read as compliant while being neither.
    expect(src).toMatch(/withPoliteness\(url, \(\) => page\.goto\(url, options\)\)/);
  });
});

describe('the pacing itself still means something', () => {
  it('politeness serialises per host rather than merely delaying', () => {
    const politeness = strip(fs.readFileSync(path.resolve(__dirname, '../infra/politeness.ts'), 'utf8'));
    // A per-host chain is what makes concurrent capture safe later: parallel work across DIFFERENT
    // counties proceeds, while two requests to the SAME county still queue.
    expect(politeness).toContain('chain');
    expect(politeness).toMatch(/hosts\.set\(host, state\)/);
  });

  it('the interval is configurable but defaults to something slower than a person clicking', () => {
    const politeness = strip(fs.readFileSync(path.resolve(__dirname, '../infra/politeness.ts'), 'utf8'));
    expect(politeness).toMatch(/DEFAULT_MIN_INTERVAL_MS = 1_500/);
    expect(politeness).toContain('CLERK_RATE_LIMIT_MS');
  });
});
