// Every cron Vercel is told to call must exist, and the worker watchdog must be one of them.
//
// ── WHY ─────────────────────────────────────────────────────────────────────────────────────────
//
// A cron in `vercel.json` pointing at a route that does not exist is called on schedule, forever,
// and returns 404 every time. Nothing goes red: Vercel records the invocation, the route is simply
// not there, and the job silently never runs. That is the same shape as the failure this repo's
// watchdog exists to catch — a thing that is not working while looking like it is.
//
// The reverse is not checked, and deliberately: a route under `app/api/cron/` with no entry in
// `vercel.json` is a perfectly normal state. Several are called manually, or by another route, or
// are staged ahead of being scheduled.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const crons: Array<{ path: string; schedule: string }> =
  JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).crons ?? [];

describe('vercel.json crons', () => {
  it('found a plausible number of them — an empty list would pass everything below vacuously', () => {
    expect(crons.length).toBeGreaterThan(10);
  });

  it('every scheduled path has a route file', () => {
    const missing = crons
      .filter((c) => !fs.existsSync(path.join(ROOT, 'app', c.path, 'route.ts')))
      .map((c) => c.path);
    expect(missing, `scheduled in vercel.json with no route.ts — Vercel will call these forever and `
      + `get a 404 every time:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('every schedule is five space-separated fields', () => {
    // A malformed expression is rejected at deploy time, which is a bad moment to find out.
    for (const c of crons) expect(c.schedule.trim().split(/\s+/), c.path).toHaveLength(5);
  });

  it('the research worker watchdog is scheduled', () => {
    // The point of the whole thing. A watchdog that exists and is not scheduled is worse than none,
    // because the code reads as though something is watching.
    const row = crons.find((c) => c.path === '/api/cron/worker-health');
    expect(row, 'the worker watchdog is not in vercel.json').toBeTruthy();
    // Not on the hour. Every scheduler in the world fires at :00, and a worker that is slow because
    // eighteen other jobs just woke is not a worker that is unhealthy.
    expect(row!.schedule.split(/\s+/)[0]).not.toBe('0');
  });
});
