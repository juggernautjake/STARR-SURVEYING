// lib/dnd/rate-limit.ts — the throttle the /dnd API has never had (P2-1, audit finding F-1).
//
// 113 routes, nine of which call a paid model, behind an account you can create with a four-character name
// and a four-character password. No throttling, no quota, no 429 anywhere. This is that.
//
// SHAPE: the POLICY is pure and exhaustively testable; the COUNTER touches Postgres and is one function.
// Keeping them apart matters here more than usual — "how many requests in what window, and what does the
// caller get told" is the part that must be right, and it should not need a database to assert.
//
// FAIL OPEN, deliberately, and this is the one judgement call worth arguing with. If the counter itself
// errors — a missing table on a fresh environment, a transient outage — the request is ALLOWED. The
// alternative is that a broken limiter takes the whole tabletop API down, which is a far worse outcome than
// a brief window with no throttle. A limiter is a cost and abuse control, not an authorization gate; the
// authorization gates fail closed, and they are separate from this on purpose.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/** What is being limited. Each bucket is a separate counter, so a burst of saves cannot exhaust the AI
 *  allowance and vice versa. */
export type RateBucket = 'ai' | 'ai-daily' | 'login' | 'write';

export interface BucketPolicy {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
  /** Shown to the caller when they hit it. Written for a player, not an operator. */
  message: string;
}

export const RATE_LIMIT_BUCKETS: Record<RateBucket, BucketPolicy> = {
  // The expensive one. 30/hour is generous for a person authoring content and a wall for a script: a
  // builder using AI assist heavily might touch a dozen in a session.
  ai: {
    limit: 30,
    windowSec: 3600,
    message: 'You’ve used a lot of AI help in the last hour. Give it a few minutes and try again.',
  },
  // The DAILY ceiling (P2-2), which is a different control from the hourly one above and not a replacement
  // for it. The hourly bucket stops a burst; this stops a slow grind that never trips it — 30/hour is 720 a
  // day if someone paces themselves, and that is real money. Both apply, and the tighter one wins naturally
  // because each is checked independently.
  //
  // 120 is set so that a heavy authoring day never notices: the whole Content Studio flow (assist per
  // field, an assessment, a transpose, a retry or two) is well inside it, and a player using chat help all
  // evening is nowhere near. It is a cost ceiling, not a usage policy.
  'ai-daily': {
    limit: 120,
    windowSec: 86400,
    message: 'You’ve reached today’s AI limit. It resets within 24 hours — everything else still works.',
  },
  // Brute-force control. Deliberately tight — a person who has genuinely forgotten their password tries a
  // handful of times, not fifteen, and there is no account recovery yet (P2-4), so the value of slowing an
  // attacker here is unusually high.
  login: {
    limit: 10,
    windowSec: 900,
    message: 'Too many sign-in attempts. Wait a few minutes before trying again.',
  },
  // Ordinary writes. High enough that no real session notices; low enough that a runaway client stops.
  write: {
    limit: 300,
    windowSec: 300,
    message: 'That’s a lot of changes very quickly. Give it a moment and try again.',
  },
};

/**
 * How long a counter row is kept before the opportunistic sweep may delete it.
 *
 * Derived from the buckets rather than hard-coded, so adding a longer window can never leave the sweep
 * eating live rows. Twice the longest window: one full window of slack past expiry.
 */
export const SWEEP_RETAIN_SEC = 2 * Math.max(...Object.values(RATE_LIMIT_BUCKETS).map((b) => b.windowSec));

/** The subject a limit is counted against. `user:` when someone is signed in; `ip:` for routes that run
 *  before there is a user (login). */
export function rateLimitSubject(opts: { userId?: string | null; ip?: string | null }): string {
  if (opts.userId) return `user:${opts.userId}`;
  // `unknown` groups every address-less caller into ONE bucket. That is intentional: it is the strictest
  // reading, and a request we cannot attribute is exactly the kind worth limiting hardest.
  return `ip:${(opts.ip ?? '').trim() || 'unknown'}`;
}

/** The start of the fixed window a timestamp falls in. Exported so the tests can assert the boundary
 *  arithmetic without a clock or a database. */
export function windowStart(atMs: number, windowSec: number): Date {
  const ms = windowSec * 1000;
  return new Date(Math.floor(atMs / ms) * ms);
}

/** Seconds until the current window ends — what goes in `Retry-After`. Always at least 1, because a
 *  `Retry-After: 0` invites an immediate retry that will also fail. */
export function retryAfterSeconds(atMs: number, windowSec: number): number {
  const start = windowStart(atMs, windowSec).getTime();
  return Math.max(1, Math.ceil((start + windowSec * 1000 - atMs) / 1000));
}

export interface RateLimitResult {
  allowed: boolean;
  /** How many remain in this window. Reported so a UI can warn BEFORE the wall, which is the difference
   *  between a limit that feels fair and one that feels arbitrary. */
  remaining: number;
  retryAfter: number;
  message?: string;
}

/** The pure decision, given a count already made. Separated so the arithmetic is testable without I/O. */
export function decide(bucket: RateBucket, count: number, atMs: number): RateLimitResult {
  const policy = RATE_LIMIT_BUCKETS[bucket];
  const allowed = count <= policy.limit;
  return {
    allowed,
    remaining: Math.max(0, policy.limit - count),
    retryAfter: retryAfterSeconds(atMs, policy.windowSec),
    ...(allowed ? {} : { message: policy.message }),
  };
}

/**
 * Count this request and decide. One UPSERT on the hot path.
 *
 * `now` is injectable so a test can drive window boundaries without waiting; production never passes it.
 */
export async function checkRateLimit(
  bucket: RateBucket,
  subject: string,
  opts: { now?: number } = {},
): Promise<RateLimitResult> {
  const atMs = opts.now ?? Date.now();
  const policy = RATE_LIMIT_BUCKETS[bucket];
  const start = windowStart(atMs, policy.windowSec);

  try {
    // Read-then-write rather than an atomic increment, because PostgREST has no `count = count + 1`
    // expression. The race costs at most a few extra requests through the wall under heavy concurrency —
    // irrelevant for a throttle, and not worth an RPC function that would need its own migration to change.
    const { data, error } = await supabaseAdmin
      .from('dnd_rate_limits')
      .select('count')
      .eq('bucket', bucket)
      .eq('subject', subject)
      .eq('window_start', start.toISOString())
      .maybeSingle();

    // `.error` IS CHECKED, and that is not pedantry. supabase-js RESOLVES `{ data: null, error }` rather
    // than throwing, so a failed read — a missing table, a permissions change — produced `data === null`,
    // `next = 1`, an upsert that also failed silently, and a `decide()` that saw the first request of a
    // fresh window. Every request. The limiter would have been off, indefinitely, without ever reaching
    // the catch below that documents the fail-open trade-off, and with nothing anywhere to say so.
    //
    // Fail-open is still the decision — see the header, a broken limiter must not take the API down. This
    // only makes the failure take the STATED path instead of masquerading as normal operation. The
    // difference matters: `allowed: true` from the catch is a known, reasoned outcome; `allowed: true`
    // from a silent miscount is an outage nobody can see.
    if (error) throw error;

    const next = ((data as { count?: number } | null)?.count ?? 0) + 1;

    await supabaseAdmin
      .from('dnd_rate_limits')
      .upsert(
        { bucket, subject, window_start: start.toISOString(), count: next },
        { onConflict: 'bucket,subject,window_start' },
      );

    // Opportunistic sweep, ~1 request in 200, so old windows never accumulate and nothing has to be
    // scheduled. A cron that silently stops running is a worse failure than an occasional extra DELETE.
    //
    // The cutoff MUST stay comfortably longer than the longest window. It was 24h, which exactly equalled
    // the `ai-daily` window added in P2-2 — a sweep firing late in a day would have been within minutes of
    // deleting the window it was still counting against, silently refunding someone's daily budget. Twice
    // the longest window is the invariant, and a test pins it.
    if (Math.random() < 0.005) {
      const cutoff = new Date(atMs - SWEEP_RETAIN_SEC * 1000).toISOString();
      await supabaseAdmin.from('dnd_rate_limits').delete().lt('window_start', cutoff).then(() => {}, () => {});
    }

    return decide(bucket, next, atMs);
  } catch {
    // See the header: a broken limiter must not take the API down with it.
    return { allowed: true, remaining: policy.limit, retryAfter: 0 };
  }
}

/** The headers a limited response carries. `Retry-After` is the one clients and crawlers actually honour. */
export function rateLimitHeaders(r: RateLimitResult, bucket: RateBucket): Record<string, string> {
  return {
    'Retry-After': String(r.retryAfter),
    'X-RateLimit-Limit': String(RATE_LIMIT_BUCKETS[bucket].limit),
    'X-RateLimit-Remaining': String(r.remaining),
  };
}

/**
 * The whole opt-in, in one line: `const limited = await enforceRateLimit('write', session.userId); if
 * (limited) return limited;`
 *
 * P2-1 applied the limiter by hand — four lines per route, and the response shape written out each time.
 * That was fine for the eleven AI/login routes it covered. P2-1b is ~124 write handlers, where four lines
 * of copy-paste apiece is how the `MAX_BYTES` duplication in P1-6 happened: every copy is a place for the
 * status code, the headers, or the message to drift.
 *
 * Returns a ready-to-return 429 when the caller is over budget, or **null** when the request may proceed —
 * so the call site reads as a guard clause and cannot accidentally continue after a refusal the way a
 * boolean can.
 */
export async function enforceRateLimit(
  bucket: RateBucket,
  userId: string | null | undefined,
  opts: { ip?: string | null; now?: number } = {},
): Promise<NextResponse | null> {
  const result = await checkRateLimit(bucket, rateLimitSubject({ userId, ip: opts.ip }), { now: opts.now });
  if (result.allowed) return null;
  return NextResponse.json({ error: result.message }, { status: 429, headers: rateLimitHeaders(result, bucket) });
}

/** What a caller has left, without spending any of it. */
export interface BudgetStatus {
  bucket: RateBucket;
  used: number;
  limit: number;
  remaining: number;
  /** When this window resets, as an ISO instant — so the UI can say "resets at 9pm", not "soon". */
  resetsAt: string;
}

/**
 * Read a bucket's usage WITHOUT counting a request against it (P2-2).
 *
 * This is the whole reason the slice's "visible before it is hit" clause is achievable. `checkRateLimit`
 * increments — it has to, it is the enforcement path — so a UI that called it to render "34 of 120 today"
 * would consume a unit of budget every time the number appeared on screen, and a page that polled would
 * exhaust the allowance by displaying it. That bug writes itself if the only available function is the
 * enforcing one.
 *
 * Fails OPEN like everything else here: a missing table reports a full budget rather than telling a player
 * they are out of AI when they are not.
 */
export async function peekRateLimit(bucket: RateBucket, subject: string, opts: { now?: number } = {}): Promise<BudgetStatus> {
  const atMs = opts.now ?? Date.now();
  const policy = RATE_LIMIT_BUCKETS[bucket];
  const start = windowStart(atMs, policy.windowSec);
  const resetsAt = new Date(start.getTime() + policy.windowSec * 1000).toISOString();

  try {
    const { data } = await supabaseAdmin
      .from('dnd_rate_limits')
      .select('count')
      .eq('bucket', bucket)
      .eq('subject', subject)
      .eq('window_start', start.toISOString())
      .maybeSingle();
    const used = (data as { count?: number } | null)?.count ?? 0;
    return { bucket, used, limit: policy.limit, remaining: Math.max(0, policy.limit - used), resetsAt };
  } catch {
    return { bucket, used: 0, limit: policy.limit, remaining: policy.limit, resetsAt };
  }
}

/**
 * The guard every AI route wants: hourly AND daily, in one call.
 *
 * Checked in that order deliberately — the hourly window is the one a person is most likely to hit and its
 * message ("give it a few minutes") is far more actionable than the daily one. Reporting the 24-hour wall
 * to someone who merely burst would be true and useless.
 */
export async function enforceAiLimits(
  userId: string | null | undefined,
  opts: { ip?: string | null; now?: number } = {},
): Promise<NextResponse | null> {
  return (await enforceRateLimit('ai', userId, opts)) ?? (await enforceRateLimit('ai-daily', userId, opts));
}
