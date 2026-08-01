// The rate limiter (P2-1, audit finding F-1).
//
// 113 routes, nine reaching a paid model, behind an account creatable with a four-character name and a
// four-character password, and no throttling of any kind. The only `429` in the tree was in the Anthropic
// client's RETRY logic — us backing off when *they* throttle *us*.
//
// The policy arithmetic is tested without a database on purpose: "how many requests in what window, and
// what does the caller get told" is the part that must be right, and it should not need Postgres to assert.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RATE_LIMIT_BUCKETS, rateLimitSubject, windowStart, retryAfterSeconds, decide, rateLimitHeaders,
  type RateBucket,
} from '@/lib/dnd/rate-limit';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const BUCKETS = Object.keys(RATE_LIMIT_BUCKETS) as RateBucket[];

describe('the policies are sane', () => {
  it('every bucket has a positive limit, a window and a human message', () => {
    for (const b of BUCKETS) {
      const p = RATE_LIMIT_BUCKETS[b];
      expect(p.limit, b).toBeGreaterThan(0);
      expect(p.windowSec, b).toBeGreaterThan(0);
      expect(p.message.length, `${b} needs a message written for a player`).toBeGreaterThan(20);
      expect(p.message, `${b}'s message should not leak operator vocabulary`).not.toMatch(/rate.?limit|429|bucket/i);
    }
  });

  it('login is the tightest — there is no account recovery yet', () => {
    // With no reset flow (P2-4), a guessed password is a permanently lost account, so slowing an attacker
    // here is worth more than it would be on a site you can recover from.
    expect(RATE_LIMIT_BUCKETS.login.limit).toBeLessThan(RATE_LIMIT_BUCKETS.ai.limit);
    expect(RATE_LIMIT_BUCKETS.ai.limit).toBeLessThan(RATE_LIMIT_BUCKETS.write.limit);
  });
});

describe('window arithmetic', () => {
  const HOUR = 3600;

  it('truncates to the window, so a window is a stable key', () => {
    const t = Date.parse('2026-07-28T14:37:11.500Z');
    expect(windowStart(t, HOUR).toISOString()).toBe('2026-07-28T14:00:00.000Z');
  });

  it('two times in the same window share a start; the next one does not', () => {
    const a = Date.parse('2026-07-28T14:00:00Z');
    const b = Date.parse('2026-07-28T14:59:59Z');
    const c = Date.parse('2026-07-28T15:00:00Z');
    expect(windowStart(a, HOUR).getTime()).toBe(windowStart(b, HOUR).getTime());
    expect(windowStart(c, HOUR).getTime()).not.toBe(windowStart(a, HOUR).getTime());
  });

  it('retryAfter counts to the END of the window', () => {
    expect(retryAfterSeconds(Date.parse('2026-07-28T14:00:00Z'), HOUR)).toBe(HOUR);
    expect(retryAfterSeconds(Date.parse('2026-07-28T14:59:30Z'), HOUR)).toBe(30);
  });

  it('and never returns 0, which would invite an immediate retry that also fails', () => {
    expect(retryAfterSeconds(Date.parse('2026-07-28T14:59:59.999Z'), HOUR)).toBeGreaterThanOrEqual(1);
  });
});

describe('decide', () => {
  const now = Date.parse('2026-07-28T14:00:00Z');

  it('allows up to the limit and refuses the one after', () => {
    const n = RATE_LIMIT_BUCKETS.ai.limit;
    expect(decide('ai', n, now).allowed).toBe(true);
    expect(decide('ai', n + 1, now).allowed).toBe(false);
  });

  it('reports what remains, so a UI can warn BEFORE the wall', () => {
    expect(decide('ai', 1, now).remaining).toBe(RATE_LIMIT_BUCKETS.ai.limit - 1);
    expect(decide('ai', 999, now).remaining).toBe(0); // never negative
  });

  it('carries a message only when refusing', () => {
    expect(decide('ai', 1, now).message).toBeUndefined();
    expect(decide('ai', 9999, now).message).toBe(RATE_LIMIT_BUCKETS.ai.message);
  });
});

describe('subjects', () => {
  it('prefers the user id when there is one', () => {
    expect(rateLimitSubject({ userId: 'u1', ip: '1.2.3.4' })).toBe('user:u1');
  });

  it('falls back to the address for pre-auth routes', () => {
    expect(rateLimitSubject({ ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
  });

  it('groups every unattributable caller into ONE bucket — the strictest reading', () => {
    expect(rateLimitSubject({})).toBe('ip:unknown');
    expect(rateLimitSubject({ ip: '   ' })).toBe('ip:unknown');
    expect(rateLimitSubject({ userId: null, ip: null })).toBe('ip:unknown');
  });
});

describe('headers', () => {
  it('carries Retry-After, which is the one clients actually honour', () => {
    const h = rateLimitHeaders(decide('ai', 9999, Date.parse('2026-07-28T14:30:00Z')), 'ai');
    expect(h['Retry-After']).toBe('1800');
    expect(h['X-RateLimit-Limit']).toBe(String(RATE_LIMIT_BUCKETS.ai.limit));
  });
});

describe('it fails OPEN, and says why', () => {
  it('a counter error allows the request', () => {
    const src = read('lib/rate-limit.ts');
    expect(src).toMatch(/catch \{[\s\S]{0,220}allowed: true/);
    // The judgement call is argued in the file rather than being a silent swallow.
    expect(src).toMatch(/FAIL OPEN/);
  });

  it('and the file is explicit that this is not an authorization gate', () => {
    expect(read('lib/rate-limit.ts')).toMatch(/not an authorization gate/i);
  });
});

describe('the routes that cost money are actually limited', () => {
  const AI_ROUTES = [
    'app/api/dnd/ai/test/route.ts',
    'app/api/dnd/library/chat/route.ts',
    'app/api/dnd/characters/[id]/ingest/route.ts',
    'app/api/dnd/characters/[id]/variants/route.ts',
    'app/api/dnd/sessions/[id]/ai-notes/route.ts',
    'app/api/dnd/sessions/[id]/recap/route.ts',
  ];

  it('every AI route calls the limiter', () => {
    // RE-POINTED 2026-07-28 (P2-2). This named `checkRateLimit('ai', …)`, the hand-rolled four-line form.
    // Those routes now call `enforceAiLimits`, which applies the hourly AND the new daily window — so the
    // old assertion would fail on code that is strictly *more* limited than before. The property being
    // guarded is unchanged: a route that costs money is throttled.
    for (const r of AI_ROUTES) {
      expect(read(r), `${r} calls a paid model and must be limited`).toContain('await enforceAiLimits(');
    }
  });

  it('and returns a 429 rather than failing some other way', () => {
    // The 429 moved INTO the wrapper, so asserting the literal in each route would now be asserting that
    // the duplication came back. Check the guard is returned at the call site, and that the wrapper is
    // where the status lives — one assertion for the shape, one for the substance.
    for (const r of AI_ROUTES) {
      expect(read(r), `${r} must return the limiter's refusal`).toContain('if (aiLimited) return aiLimited;');
    }
    expect(read('lib/rate-limit.ts'), 'the wrapper must answer 429').toContain('status: 429');
  });

  it('login is limited on BOTH the address and the name being attempted', () => {
    // Address alone misses a distributed attack on one account; name alone misses someone spraying one
    // password across many accounts.
    // RE-POINTED 2026-07-28 (P2-3). The inline `rateLimitSubject({ ip })` became the shared
    // `loginSubjects(name, ip)` — because this route was the ONLY one counting attempts, while `quick`,
    // `signup` and `register` all verified or set passwords with no throttle at all. Four hand-rolled
    // copies of "what does a sign-in count against" is how they drift; `password-policy.test.ts` now
    // asserts all four use this one.
    const src = read('app/api/dnd/auth/login/route.ts');
    expect(src).toContain("checkRateLimit('login'");
    expect(src).toContain('loginSubjects(');
    // The `name:` subject moved WITH the helper, so it is asserted where it now lives rather than in the
    // route that no longer builds it.
    expect(read('lib/dnd/password-policy.ts')).toMatch(/return \[`ip:\$\{[^}]+\}`, `name:\$\{who\}`\]/);
  });

  it('and counts the attempt BEFORE verifying the password', () => {
    // Counting only failures lets an attacker holding one correct credential reset their own budget, and
    // the cost being controlled is the guess itself.
    const src = read('app/api/dnd/auth/login/route.ts');
    expect(src.indexOf("checkRateLimit('login'")).toBeLessThan(src.indexOf('verifyPassword('));
  });
});
