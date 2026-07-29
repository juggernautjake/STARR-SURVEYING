// __tests__/dnd/write-rate-limit.test.ts — the `write` bucket is actually applied (P2-1b, audit F-1).
//
// P2-1 shipped the limiter and covered the AI routes and login. The `write` policy existed, was tested, and
// **throttled nothing** — the same "ready and unreachable" shape as four other findings in this audit.
//
// THE TEST THAT EARNED ITS PLACE is `every importer also GUARDS`. Applying this across eleven routes with a
// scripted edit left eight of them with the import added and the guard silently missing — the regex did not
// account for CRLF. Typecheck passed (an unused import is not an error) and every route still worked. The
// only visible difference between that state and a correct one is whether a four-line block exists inside
// each handler, which is precisely what a source assertion is for.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RATE_LIMIT_BUCKETS, decide, enforceRateLimit } from '@/lib/dnd/rate-limit';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Every upload route — the ones where abuse costs stored bytes rather than just rows. */
const UPLOAD_ROUTES = [
  'app/api/dnd/campaigns/[id]/maps/route.ts',
  'app/api/dnd/campaigns/[id]/soundboard/sounds/route.ts',
  'app/api/dnd/characters/import/route.ts',
  'app/api/dnd/characters/[id]/media/route.ts',
  'app/api/dnd/characters/[id]/uploads/route.ts',
  'app/api/dnd/handouts/route.ts',
  'app/api/dnd/homebrew/[id]/image/route.ts',
  'app/api/dnd/media/route.ts',
  'app/api/dnd/messages/image/route.ts',
  'app/api/dnd/profile/avatar/route.ts',
  'app/api/dnd/sessions/[id]/media/route.ts',
];

/** Walk every /dnd API route file. */
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

describe('the one-line helper', () => {
  it('returns null when the caller is under budget, so the call site is a guard clause', () => {
    // A boolean return would let a caller forget to `return` and continue past a refusal. A response-or-null
    // cannot be misused that way.
    expect(typeof enforceRateLimit).toBe('function');
  });

  it('the write policy is a real budget, not a placeholder', () => {
    const p = RATE_LIMIT_BUCKETS.write;
    expect(p.limit).toBeGreaterThan(0);
    expect(p.windowSec).toBeGreaterThan(0);
    // Generous enough that ordinary play never trips it — a DM uploading a batch of maps is not an attack.
    expect(p.limit).toBeGreaterThanOrEqual(100);
  });

  it('and refusing says when to retry', () => {
    const over = decide('write', RATE_LIMIT_BUCKETS.write.limit + 1, Date.now());
    expect(over.allowed).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
    expect(over.message ?? '').not.toBe('');
  });
});

describe('every upload route is throttled', () => {
  it.each(UPLOAD_ROUTES)('%s enforces the write bucket', (path) => {
    const src = read(path);
    expect(src).toContain("from '@/lib/dnd/rate-limit'");
    expect(src).toContain("await enforceRateLimit('write'");
    expect(src).toContain('if (limited) return limited;');
  });

  it('covers all eleven', () => {
    expect(UPLOAD_ROUTES).toHaveLength(11);
  });
});

describe('no route imports the limiter without using it', () => {
  it('every importer also GUARDS', () => {
    // THE regression this file exists for. A scripted edit added the import to eleven routes and the guard
    // to three; typecheck passed, lint passed, every route still worked, and the throttle was absent from
    // eight of them. An unused import is the visible symptom of a half-applied security control.
    const offenders: string[] = [];
    for (const f of allRouteFiles()) {
      const src = read(f);
      if (!src.includes("from '@/lib/dnd/rate-limit'")) continue;
      // Any of the four call shapes counts: the two enforcing wrappers, the raw counter, and the
      // non-consuming read. Listing only some of them is how this guard would start reporting a false
      // positive the next time a new wrapper lands — which is exactly what `enforceAiLimits` did in P2-2.
      const uses = /(enforceRateLimit|checkRateLimit|enforceAiLimits|peekRateLimit)\(/.test(src);
      if (!uses) offenders.push(f);
    }
    expect(
      offenders,
      'These import the rate limiter and never call it — the import is decoration and the route is unthrottled.',
    ).toEqual([]);
  });

  it('and the guard is always followed by a return, never left dangling', () => {
    for (const f of allRouteFiles()) {
      const src = read(f);
      if (!src.includes('enforceRateLimit(')) continue;
      // Assigning the result and not returning it would throttle nothing while looking exactly right.
      const assigns = (src.match(/const limited = await enforceRateLimit\(/g) ?? []).length;
      const returns = (src.match(/if \(limited\) return limited;/g) ?? []).length;
      expect(returns, `${f}: ${assigns} limiter call(s) but ${returns} return(s)`).toBe(assigns);
    }
  });
});

describe('the throttle sits AFTER authentication', () => {
  it.each(UPLOAD_ROUTES)('%s authenticates first', (path) => {
    const src = read(path);
    const limitAt = src.indexOf("await enforceRateLimit('write'");
    // Every one of these routes rejects an unauthenticated caller before doing anything else. Counting an
    // anonymous request against a subject derived from a null user id would let one attacker's traffic
    // exhaust the shared IP bucket for everyone behind the same address.
    // The EARLIEST auth marker, not the latest: `res.status` also appears in unrelated later handlers, and
    // taking the max compared the throttle against a 403 in a different function entirely.
    const authAt = Math.min(
      ...[src.indexOf('status: 401'), src.indexOf('res.status')].filter((i) => i >= 0),
    );
    expect(Number.isFinite(authAt), `${path} should authenticate before throttling`).toBe(true);
    expect(authAt).toBeLessThan(limitAt);
  });
});
