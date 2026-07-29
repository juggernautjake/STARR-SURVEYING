// __tests__/dnd/ai-budget.test.ts — the daily AI ceiling, visible before it is hit (P2-2).
//
// The slice's bar is the second half of that sentence. A limit you only discover by being refused reads as
// arbitrary; the same limit shown while there is still room reads as fair. Meeting it needs a read path
// that does NOT consume budget, which is the whole reason `peekRateLimit` exists alongside the enforcing
// `checkRateLimit` — a meter built on the enforcing call would spend a unit of allowance every time it
// rendered, and a polling component would exhaust the budget by displaying it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  RATE_LIMIT_BUCKETS, SWEEP_RETAIN_SEC, decide, windowStart, retryAfterSeconds,
} from '@/lib/dnd/rate-limit';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the daily bucket is a real second control', () => {
  const hourly = RATE_LIMIT_BUCKETS.ai;
  const daily = RATE_LIMIT_BUCKETS['ai-daily'];

  it('runs over a day', () => {
    expect(daily.windowSec).toBe(86400);
  });

  it('and catches a paced grind the hourly window never would', () => {
    // THE reason this bucket exists. Someone pacing themselves at the hourly limit spends 30 × 24 = 720
    // calls a day without ever tripping it. If the daily ceiling were not well below that, it would be
    // decoration.
    const maxUnderHourly = hourly.limit * 24;
    expect(daily.limit).toBeLessThan(maxUnderHourly);
  });

  it('while staying above a heavy authoring day, so it is a cost ceiling not a usage policy', () => {
    // The full Studio flow — assist per field, an assessment, a transpose, retries — plus chat help should
    // fit comfortably. If this ever fails, the limit got tightened into a product decision by accident.
    expect(daily.limit).toBeGreaterThanOrEqual(100);
  });

  it('and its message says the rest of the app still works', () => {
    // Being told "you are out of AI" on a tabletop app should not read as "the site is broken".
    expect(daily.message).toMatch(/still works/i);
  });
});

describe('the sweep can never delete a live window', () => {
  it('retains for twice the longest window', () => {
    // Found while adding the daily bucket: the sweep cutoff was a hard-coded 24h, which exactly EQUALLED
    // the new 86400s window. A sweep firing late in a day would have been minutes from deleting the row it
    // was still counting against — silently refunding someone's whole daily budget.
    const longest = Math.max(...Object.values(RATE_LIMIT_BUCKETS).map((b) => b.windowSec));
    expect(SWEEP_RETAIN_SEC).toBe(2 * longest);
    expect(SWEEP_RETAIN_SEC).toBeGreaterThan(longest);
  });

  it('and is derived, so a longer bucket cannot outgrow it', () => {
    // The invariant has to survive someone adding a weekly bucket without reading this file.
    expect(read('lib/dnd/rate-limit.ts')).toMatch(/SWEEP_RETAIN_SEC = 2 \* Math\.max\(/);
    expect(read('lib/dnd/rate-limit.ts')).not.toMatch(/cutoff = new Date\(atMs - 24 \* 3600 \* 1000\)/);
  });
});

describe('window arithmetic holds for a 24-hour window too', () => {
  const DAY = 86400;
  it('buckets to the day boundary', () => {
    const a = windowStart(Date.parse('2026-08-14T00:00:01Z'), DAY).toISOString();
    const b = windowStart(Date.parse('2026-08-14T23:59:59Z'), DAY).toISOString();
    expect(a).toBe(b);
    expect(windowStart(Date.parse('2026-08-15T00:00:00Z'), DAY).toISOString()).not.toBe(a);
  });

  it('and retry-after never suggests an immediate retry', () => {
    expect(retryAfterSeconds(Date.parse('2026-08-14T23:59:59.900Z'), DAY)).toBeGreaterThanOrEqual(1);
  });

  it('the decision refuses past the limit and reports the daily message', () => {
    const over = decide('ai-daily', RATE_LIMIT_BUCKETS['ai-daily'].limit + 1, Date.now());
    expect(over.allowed).toBe(false);
    expect(over.message).toBe(RATE_LIMIT_BUCKETS['ai-daily'].message);
    expect(decide('ai-daily', RATE_LIMIT_BUCKETS['ai-daily'].limit, Date.now()).allowed).toBe(true);
  });
});

describe('reading the budget does not spend it', () => {
  it('the endpoint peeks rather than checks', () => {
    // The bug this prevents: `/api/dnd/ai/budget` calling `checkRateLimit` would increment on every render.
    const route = read('app/api/dnd/ai/budget/route.ts');
    expect(route).toContain('peekRateLimit(');
    // Calls, not words: the route's own comment explains why it does not use the enforcing form, and a
    // bare substring check flags that prose as a violation.
    expect(route, 'the budget endpoint must never CALL the enforcing form').not.toMatch(/\bcheckRateLimit\(/);
    expect(route, 'nor the enforcing wrapper').not.toMatch(/\benforce(Rate|Ai)Limits?\(/);
  });

  it('and returns BOTH windows, because either can be the binding one', () => {
    const route = read('app/api/dnd/ai/budget/route.ts');
    expect(route).toContain("peekRateLimit('ai', subject)");
    expect(route).toContain("peekRateLimit('ai-daily', subject)");
  });

  it('the meter reads that endpoint and nothing else', () => {
    const meter = read('app/dnd/_ui/AiBudgetMeter.tsx');
    expect(meter).toContain("fetch('/api/dnd/ai/budget')");
  });

  it('and stays quiet until a quarter of a window is spent', () => {
    // "0 of 120" on every page that mounts it is noise, and noise is how a warning stops being read.
    expect(read('app/dnd/_ui/AiBudgetMeter.tsx')).toMatch(/worst < 0\.25/);
  });
});

describe('every AI route enforces BOTH windows', () => {
  const AI_ROUTES = [
    'app/api/dnd/ai/test/route.ts',
    'app/api/dnd/characters/[id]/ingest/route.ts',
    'app/api/dnd/characters/[id]/variants/route.ts',
    'app/api/dnd/homebrew/[id]/assess/route.ts',
    'app/api/dnd/homebrew/[id]/transpose/route.ts',
    'app/api/dnd/homebrew/assist/route.ts',
    'app/api/dnd/homebrew/ingest/route.ts',
    'app/api/dnd/library/chat/route.ts',
    'app/api/dnd/sessions/[id]/ai-notes/route.ts',
    'app/api/dnd/sessions/[id]/recap/route.ts',
  ];

  it.each(AI_ROUTES)('%s uses the combined guard', (path) => {
    const src = read(path);
    expect(src).toContain('await enforceAiLimits(');
    expect(src).toContain('if (aiLimited) return aiLimited;');
  });

  it('and none is left on the hourly-only check', () => {
    // A route still calling `checkRateLimit('ai', …)` would be capped hourly and uncapped daily, which is
    // the exact hole this slice closes — and it would look throttled.
    for (const p of AI_ROUTES) {
      expect(read(p), `${p} should not use the hourly bucket alone`).not.toContain("checkRateLimit('ai'");
    }
  });

  it('checked hourly-first, so the actionable message wins', () => {
    // Telling someone to wait 24 hours when they merely burst for a minute is true and useless.
    expect(read('lib/dnd/rate-limit.ts')).toMatch(/enforceRateLimit\('ai', userId, opts\)\) \?\? \(await enforceRateLimit\('ai-daily'/);
  });
});

describe('no route imports the limiter without using it', () => {
  // Carried over from P2-1b, where a scripted edit left eight routes with a dangling import and no guard.
  // This slice edited ten more routes the same way, so the guard has to cover the new call shape too.
  function allRouteFiles(dir = 'app/api/dnd'): string[] {
    const out: string[] = [];
    const walk = (rel: string) => {
      for (const entry of readdirSync(join(ROOT, rel))) {
        const child = `${rel}/${entry}`;
        if (statSync(join(ROOT, child)).isDirectory()) walk(child);
        else if (entry === 'route.ts') out.push(child);
      }
    };
    walk(dir);
    return out;
  }

  it('every importer calls something', () => {
    const offenders = allRouteFiles().filter((f) => {
      const src = read(f);
      if (!src.includes("from '@/lib/dnd/rate-limit'")) return false;
      return !/(enforceRateLimit|checkRateLimit|enforceAiLimits|peekRateLimit)\(/.test(src);
    });
    expect(offenders, 'These import the limiter and never call it — the route is unthrottled.').toEqual([]);
  });
});
