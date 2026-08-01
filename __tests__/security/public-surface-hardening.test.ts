// __tests__/security/public-surface-hardening.test.ts — A1-4b and A1-5.
//
// Both close a gap the earlier A1 slices left, and both are the kind of thing that quietly regresses: a
// new `return` in a route drops the timing floor, and a new bucket copied from an old one loses the cost.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIN_RESPONSE_MS, notBefore, now } from '@/lib/http/constant-time';
import { RATE_LIMIT_BUCKETS } from '@/lib/rate-limit';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('A1-4b — a hit and a miss take the same time', () => {
  const ROUTE = read('app/api/public/invoice/[number]/route.ts');

  it('EVERY terminal path goes through the floor, not just the 404', () => {
    // The leak is systematic, so one unpadded return reinstates it — and the one most likely to be added
    // later is a new early refusal, which is exactly the shape that returns fastest.
    const bare = ROUTE.match(/return NextResponse\.json\(/g) ?? [];
    expect(bare, 'a NextResponse returned without notBefore()').toEqual([]);
    expect((ROUTE.match(/notBefore\(startedAt/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('does the SAME round trips either way, which is the half padding cannot fix', () => {
    // A miss that skipped the payments query would be structurally faster, and a difference that scales
    // with how busy the database is cannot be padded away. So the second query runs on both paths.
    const paymentsQuery = ROUTE.indexOf(".from('payments')");
    const notFound = ROUTE.indexOf("'Invoice not found'");
    expect(paymentsQuery).toBeGreaterThan(0);
    expect(paymentsQuery, 'the payments query must run BEFORE the 404 returns').toBeLessThan(notFound);
  });

  it('starts the clock after the rate-limit check, not before', () => {
    // A throttled caller should be refused immediately; padding their 429 only makes the endpoint slower
    // to say no, and tells an attacker nothing either way.
    expect(ROUTE.indexOf('enforceRateLimit')).toBeLessThan(ROUTE.indexOf('const startedAt'));
  });

  it('the floor is a real one, and it is the backstop rather than the fix', () => {
    // Measured live: with both paths doing the same round trips, a hit and a miss came back at a median
    // of 515 ms and 522 ms — seven apart on five hundred. The equal-work change did that; the floor never
    // fired. It earns its place in the other regime, where both paths are tens of milliseconds and a
    // residual 15 ms is 60% rather than 1% — proportion is what an attacker averages, not absolute time.
    expect(MIN_RESPONSE_MS).toBeGreaterThanOrEqual(200);
  });

  it('holds a fast response and does not delay a slow one further', async () => {
    const t0 = now();
    await notBefore(t0, null, 60);
    expect(now() - t0).toBeGreaterThanOrEqual(55);

    const slow = now() - 500;
    const before = now();
    await notBefore(slow, null, 60);
    expect(now() - before, 'an already-slow response must not be delayed again').toBeLessThan(30);
  });
});

describe('A1-5 — the storage one address can consume', () => {
  const CONTACT = read('app/api/contact/route.ts');

  it('has a daily megabyte budget, not a request count', () => {
    // A per-submission limit cannot express "a lot of small ones", and a per-request limit low enough to
    // bound the bytes would refuse the customer who sends one big site plan.
    const bucket = RATE_LIMIT_BUCKETS['contact-storage-daily'];
    expect(bucket.windowSec).toBe(24 * 3600);
    expect(bucket.limit).toBeGreaterThan(25);   // above one legitimate maximal submission
    expect(bucket.limit).toBeLessThan(500);     // below the 20 × 25 MB the throttle alone allowed
  });

  it('the contact route charges it, in megabytes', () => {
    expect(CONTACT).toMatch(/enforceRateLimit\('contact-storage-daily'[\s\S]{0,80}cost: megabytes/);
    expect(CONTACT).toMatch(/\/ \(1024 \* 1024\)/);
  });

  it('charges only when there are files', () => {
    // An enquiry with no attachments consumes no storage, and spending someone's daily budget on one
    // would refuse the customer who then tries to send a photograph.
    const block = CONTACT.slice(CONTACT.indexOf('if (fileSummaries.length > 0)'));
    expect(block.indexOf('contact-storage-daily')).toBeGreaterThan(0);
    expect(block.indexOf('contact-storage-daily')).toBeLessThan(block.indexOf('\n    }\n\n    // Normalize'));
  });

  it('rounds the charge UP and floors it at one', () => {
    // The counter stores integers, so a thousand 0.4 MB uploads would otherwise cost nothing at all, and
    // a zero cost would make the whole check free to bypass.
    const LIMITER = read('lib/rate-limit.ts');
    expect(LIMITER).toMatch(/Math\.max\(1, Math\.ceil\(opts\.cost \?\? 1\)\)/);
  });

  it('every other bucket still costs one per request', () => {
    // The default has to stay 1, or adding `cost` would silently change the meaning of the seven buckets
    // that were counting requests before it existed.
    const LIMITER = read('lib/rate-limit.ts');
    expect(LIMITER).toMatch(/opts\.cost \?\? 1/);
  });
});
