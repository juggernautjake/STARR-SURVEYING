// lib/rate-limit.ts — the app's throttle. Was `lib/dnd/rate-limit.ts` until 2026-08-01.
//
// ── WHY IT MOVED (A1-1 of SURVEYING_BACKEND_ANALYSIS_2026-08-01) ────────────────────────────────────
//
// It was built for the hobby project and it worked: 27 D&D routes throttled since 2026-07-28. Meanwhile
// the BUSINESS — the half with the money in it — had no limit on anything, including a public contact form
// that sends three emails, uploads attachments to storage, and writes a lead row, once per submission,
// unbounded.
//
// The asymmetry was not a decision anyone made; the sweep that produced this module simply never ran over
// the business routes. So it moves up a level and keeps its D&D call sites through a re-export, rather
// than being copied. **A copy is how one gets the fix and the other does not** — this repo has that lesson
// written into three separate docs (the two `MAX_BYTES` constants, the four roll logs, the three stage
// tokens), and it is not going to be learned a fourth time here.
//
// The counter table moved with it: `dnd_rate_limits` → `rate_limits` (seed 502). Counter rows are
// ephemeral, so there was nothing to migrate — the new table just starts counting.
//
// ── THE ORIGINAL HEADER, which still describes what this does ───────────────────────────────────────
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
export type RateBucket =
  | 'ai' | 'ai-daily' | 'login' | 'write'
  // ── public, unauthenticated surfaces (A1-2, A1-4) ───────────────────────────────────────────────
  // These are counted per IP, because by definition there is no user. That makes them blunter than the
  // buckets above — an office behind one NAT shares a counter — so their limits are set with that in
  // mind: high enough that a shared address never notices, low enough that a script does.
  | 'contact-form' | 'contact-form-daily' | 'public-lookup' | 'public-payment'
  // A1-5 — counted in MEGABYTES rather than requests. See `contact-storage-daily` below.
  | 'contact-storage-daily';

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

  // ── the public forms ────────────────────────────────────────────────────────────────────────────
  //
  // THE COST OF BEING WRONG IS ASYMMETRIC HERE, in a way it is not for the buckets above, and the limits
  // are set from that rather than from a round number.
  //
  // Too tight and a real customer with a genuine survey enquiry is turned away — that is lost revenue, and
  // they will not try again, they will call the next firm. Too loose and a script exhausts the Resend
  // quota, at which point REAL enquiries stop being emailed to anyone: the failure is silent, and it looks
  // exactly like a quiet week.
  //
  // 5 per 10 minutes covers every honest case comfortably. A customer submits once; a customer who typos
  // their email and resubmits does it two or three times; a couple sitting together on one connection,
  // each enquiring about their own property, is still inside it. A script is not.
  'contact-form': {
    limit: 5,
    windowSec: 600,
    message: 'You’ve sent several messages just now. Give it a few minutes, or call us on (936) 662-0077 — we’ll pick up.',
  },
  // The daily ceiling exists for the SLOW grind that never trips the burst limit. 5 per 10 minutes is 720
  // a day if paced, which is 2,160 emails and a full storage bucket. 20 is far past any real household or
  // office and nowhere near a useful attack.
  'contact-form-daily': {
    limit: 20,
    windowSec: 86400,
    message: 'You’ve sent a lot of enquiries today. Please call us on (936) 662-0077 and we’ll help directly.',
  },
  // Invoice lookup. The number format (`SS-260618-A1B2`) is guessable, and a hit returns a customer name
  // and a balance, so this is an enumeration surface as much as a cost one. 30 in 5 minutes lets a
  // customer fumble their invoice number repeatedly without ever noticing the limit.
  'public-lookup': {
    limit: 30,
    windowSec: 300,
    message: 'Too many lookups just now. Wait a moment and try again, or call (936) 662-0077.',
  },

  // ── B1-1 · the public payment surface ────────────────────────────────────────────────────────────
  //
  // Found by the route sweep, not by reading the payment plan: A1-4 throttled the invoice LOOKUP and the
  // four routes beside it were never given one. They are the worse half.
  //
  //   · `POST …/intent`   creates a Stripe PaymentIntent — a paid external call per request.
  //   · `POST …/attempt`  records an "I sent it" claim **and emails the office**.
  //   · `POST …/receipt`  emails a receipt.
  //   · `GET  …/receipt/pdf` renders one.
  //
  // Two of those send mail, which is F1's finding arriving on a different endpoint: an exhausted Resend
  // quota does not merely stop receipts, it stops **real customer enquiries** being emailed at all.
  //
  // Tighter than `public-lookup` because these have side effects rather than being a read: a customer
  // paying an invoice makes one intent, one attempt and a receipt request or two, so ten in a quarter of
  // an hour is invisible to them and a wall to anything else.
  'public-payment': {
    limit: 10,
    windowSec: 900,
    message: 'Too many payment requests just now. Wait a few minutes and try again, or call (936) 662-0077.',
  },

  // ── A1-5 · the storage a single address can consume ──────────────────────────────────────────────
  //
  // `UPLOAD_LIMITS` caps ONE file and `QUOTE_ATTACHMENT_MAX_TOTAL_BYTES` caps one submission at 25 MB.
  // Nothing capped a DAY: A1-2 allows 20 submissions per address, so one connection could put **500 MB**
  // into the bucket, and nobody would find out until a storage bill or a quota wall did it for them.
  //
  // COUNTED IN MEGABYTES, which is why `checkRateLimit` takes a cost. A per-submission limit cannot
  // express "a lot of small ones", and a per-request limit set low enough to bound the bytes would refuse
  // the customer who legitimately sends one big site plan.
  //
  // 60 MB is deliberately far above a real enquiry — a survey request is a few photographs and a PDF —
  // and far below what makes filling the bucket worth anyone's time. A shared office address sending
  // three genuine quote requests in a day is nowhere near it.
  'contact-storage-daily': {
    limit: 60,
    windowSec: 24 * 3600,
    message: 'That is a lot of files from this connection today. Please email them to us directly and we will pick it up from there.',
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
  opts: {
    now?: number;
    /**
     * How much this request consumes. One by default — a request is one request.
     *
     * A1-5 uses it to count MEGABYTES instead, which is the only way to express "a lot of small uploads"
     * in a counter that otherwise knows only how often something happened.
     */
    cost?: number;
  } = {},
): Promise<RateLimitResult> {
  const atMs = opts.now ?? Date.now();
  const policy = RATE_LIMIT_BUCKETS[bucket];
  const start = windowStart(atMs, policy.windowSec);

  try {
    // Read-then-write rather than an atomic increment, because PostgREST has no `count = count + 1`
    // expression. The race costs at most a few extra requests through the wall under heavy concurrency —
    // irrelevant for a throttle, and not worth an RPC function that would need its own migration to change.
    const { data, error } = await supabaseAdmin
      .from('rate_limits')
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

    // Floored at 1 and rounded UP: a fractional cost would let a thousand 0.4 MB uploads count as nothing
    // in a column that stores integers, and a zero cost would make the check free to bypass.
    const charge = Math.max(1, Math.ceil(opts.cost ?? 1));
    const next = ((data as { count?: number } | null)?.count ?? 0) + charge;

    await supabaseAdmin
      .from('rate_limits')
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
      await supabaseAdmin.from('rate_limits').delete().lt('window_start', cutoff).then(() => {}, () => {});
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
  /** `cost` is passed straight through — see `checkRateLimit`. A1-5 charges megabytes with it. */
  opts: { ip?: string | null; now?: number; cost?: number } = {},
): Promise<NextResponse | null> {
  const result = await checkRateLimit(bucket, rateLimitSubject({ userId, ip: opts.ip }), { now: opts.now, cost: opts.cost });
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
      .from('rate_limits')
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
