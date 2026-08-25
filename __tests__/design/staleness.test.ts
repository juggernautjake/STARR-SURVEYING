// __tests__/design/staleness.test.ts
//
// S1 + S3 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// ── THE FAILURE THIS FILE IS ACTUALLY ABOUT ─────────────────────────────────────────────────────
//
// `--stale` shipped reporting **"0 route(s) have a default older than their page"** while the page
// list — drawn from the same rule, on the same data — said 50. The rule was right both times. The
// TRACER read `d.traced_at` off a summary object that spells it `tracedAt`, so the filter matched
// nothing and reported it as good news.
//
// That is the worst shape a bug can take here: a queue that says it is empty. Nobody investigates
// zero. It was caught only because the two numbers were visible side by side and disagreed, which is
// luck rather than method — hence these.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { staleRoutes, routesChangedSince, pageChangedAt, lastCommitByFile } from '@/lib/design/staleness';

const ROOT = path.join(__dirname, '..', '..');
const PAGES = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/design/pages.generated.json'), 'utf8')) as {
  routes: Array<{ route: string; file: string; area: string; dynamic: boolean }>;
};

describe('staleRoutes', () => {
  const page = { route: '/admin/billing', file: 'app/admin/billing' };

  it('flags a record older than the page', () => {
    const stale = staleRoutes([page], new Map([['/admin/billing', '2000-01-01T00:00:00.000Z']]), ROOT);
    expect([...stale]).toEqual(['/admin/billing']);
  });

  it('does not flag a record newer than the page', () => {
    const stale = staleRoutes([page], new Map([['/admin/billing', '2999-01-01T00:00:00.000Z']]), ROOT);
    expect([...stale]).toEqual([]);
  });

  it('says nothing about a route with no record at all', () => {
    // "Never traced" is a different gap with a different fix, and reporting it here would put one
    // page in two queues. The page list keeps them separate for the same reason.
    expect([...staleRoutes([page], new Map(), ROOT)]).toEqual([]);
  });

  it('ignores an unparseable timestamp rather than treating it as ancient', () => {
    // `Date.parse('nonsense')` is NaN, and every comparison against NaN is false. Asserted rather
    // than assumed, because the alternative reading — NaN as 0, so everything is stale — would put
    // the whole product in the queue.
    expect([...staleRoutes([page], new Map([['/admin/billing', 'nonsense']]), ROOT)]).toEqual([]);
  });

  it('says nothing about a route whose page file is not there', () => {
    const ghost = { route: '/admin/ghost', file: 'app/admin/ghost' };
    expect([...staleRoutes([ghost], new Map([['/admin/ghost', '2000-01-01T00:00:00.000Z']]), ROOT)]).toEqual([]);
  });
});

describe('the signal is git, not mtime', () => {
  it('reads a commit date for a file that is committed', () => {
    // The first version used `fs.statSync().mtimeMs` and reported 50 of 138 routes stale minutes
    // after they were traced: mtime moves on a checkout or a rebase, and this repository does both
    // daily. A queue that is a third false is one people stop opening.
    const commits = lastCommitByFile(ROOT);
    expect(commits, 'git should be available in the test environment').not.toBeNull();
    expect(commits!.get('app/admin/billing/page.tsx')).toBeGreaterThan(0);
  });

  it('falls back to mtime rather than returning nothing', () => {
    // A deployed container has no `.git`. Noisy beats absent, and it errs in the safe direction: a
    // page wrongly flagged costs one re-trace, a page silently stale costs a decision on a bad record.
    const viaFallback = pageChangedAt({ route: '/admin/billing', file: 'app/admin/billing' }, null, ROOT);
    expect(viaFallback).toBeGreaterThan(0);
  });
});

describe('routesChangedSince', () => {
  it('finds the routes a commit touched', () => {
    // ── WHY THIS NO LONGER SAYS `HEAD~40` ────────────────────────────────────────────────────────
    //
    // It did, with the note "C1 changed app/admin/billing/page.tsx". That was true on the day it was
    // written and decayed quietly afterwards: `HEAD~40` is a MOVING TARGET, so every commit that
    // does not touch a route pushes the window further from the change the assertion depends on.
    // Five docs-and-tests commits later it reached back to nothing and the test failed — reporting a
    // property of recent history as a fault in `routesChangedSince`.
    //
    // Anchored on the file instead: whatever commit last changed this page, ask what changed since
    // its parent. That is a fixed point no amount of later history can slide past, and it tests the
    // function rather than the shape of the log.
    const page = 'app/admin/billing/page.tsx';
    const sha = execSync(`git log -1 --format=%H -- ${page}`, { cwd: ROOT }).toString().trim();
    expect(sha, `no commit in history touches ${page}`).not.toBe('');

    const changed = routesChangedSince(PAGES.routes, `${sha}~1`, ROOT);
    expect(changed.size).toBeGreaterThan(0);
    expect([...changed]).toContain('/admin/billing');
  });

  it('refuses an unknown ref instead of quietly returning nothing', () => {
    // The whole lesson of this file. "Nothing changed" and "your ref was a typo" must not look the
    // same, because the first is a success and the second silently skips the work.
    expect(() => routesChangedSince(PAGES.routes, 'definitely-not-a-ref', ROOT)).toThrow(/valid git ref/i);
  });
});

describe('the callers spell the field the way the data does', () => {
  // The actual bug. A source-level check because the alternative is a live database.
  const tracer = fs.readFileSync(path.join(ROOT, 'scripts/trace-defaults.mjs'), 'utf8');

  it('the tracer reads tracedAt off the summary, not the column name', () => {
    const block = tracer.slice(tracer.indexOf('if (STALE_ONLY)'));
    expect(block).toMatch(/d\.tracedAt/);
    expect(block, 'traced_at is the COLUMN; the list API returns camelCase summaries').not.toMatch(/d\.traced_at/);
  });

  it('and the summary really carries it', () => {
    const server = fs.readFileSync(path.join(ROOT, 'lib/design/server.ts'), 'utf8');
    expect(server).toMatch(/tracedAt: string \| null;/);
    expect(server).toMatch(/tracedAt: row\.traced_at \?\? null,/);
    // One column list, not three hand-written copies — adding `traced_at` to one query and not the
    // others is how the filter came to match nothing.
    expect(server).toMatch(/const SUMMARY_COLS = '[^']*traced_at'/);
    expect(server.match(/\.select\('id, name, route, variant_of/g) ?? []).toHaveLength(0);
  });

  it('--limit is applied after the filters, not before them', () => {
    // `--since <ref> --limit 3` traced nothing while reporting "3 route(s) changed": plan() sliced
    // the inventory first and the filter then matched none of the survivors. The two numbers it
    // printed in one breath disagreed.
    expect(tracer).toMatch(/return \{ wanted, skipped \};/);
    const limitAt = tracer.indexOf('if (LIMIT > 0) todo = todo.slice(0, LIMIT);');
    const sinceAt = tracer.indexOf('if (SINCE) {');
    expect(limitAt).toBeGreaterThan(-1);
    expect(sinceAt).toBeGreaterThan(-1);
    expect(limitAt).toBeGreaterThan(sinceAt);
  });
});
