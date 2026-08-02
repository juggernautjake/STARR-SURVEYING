// lib/research/intake.ts — request in, packet out (plan R28).
//
// ── WHAT WAS MISSING ────────────────────────────────────────────────────────────────────────────
//
// Starting research required a person: create a project in the admin UI, then press a button. The
// owner's ask is the opposite — "a request comes in → the server works 20–30 minutes → done" — and
// there was no object representing a REQUEST at all, so nothing could queue, retry, deduplicate or
// notify.
//
// ── THE THREE THINGS THAT COST MONEY IF GOT WRONG ───────────────────────────────────────────────
//
// 1. Duplicates. A run is 20–30 minutes of a machine plus real money in paid pages. Two requests for
//    the same property must not both run.
// 2. Claiming. Two workers polling one queue WILL race, and a read-then-write hands one property to
//    two machines.
// 3. Retries. A request that fails for a permanent reason — a county with no adapter — must stop,
//    not retry forever at full cost each time.

export type RequestStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled' | 'duplicate';

export interface ResearchRequestInput {
  address?: string;
  county?: string;
  state?: string;
  parcelId?: string | null;
  ownerName?: string | null;
  jobId?: string | null;
  source?: 'api' | 'job' | 'intake' | 'manual';
  notifyEmail?: string | null;
}

/** The key two requests must share to be the same property.
 *
 *  Address strings arrive punctuated a dozen ways — "123 FM 436", "123 F.M. 436", "123 Fm-436, Belton
 *  TX". Comparing them literally means paying twice for one property, which is the whole reason this
 *  key exists rather than a raw string comparison. Aggressive normalisation is right here for the
 *  same reason it was right for instrument numbers in R13: the cost of a false MISS is a duplicate
 *  25-minute run, and the cost of a false match is a request that returns an existing project — which
 *  a person notices immediately and can override.
 *
 *  County is part of the key because the same street address exists in many counties. */
export function dedupeKey(address: string, county: string, state = 'TX'): string {
  const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${squash(state)}|${squash(county)}|${squash(address)}`;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  normalised?: {
    address: string;
    county: string;
    state: string;
    dedupeKey: string;
  };
}

/** An unattended run cannot ask a person what they meant, so the guard is at the door.
 *
 *  County is required and not inferred from the address: guessing it wrong sends a 25-minute run at
 *  the wrong county's clerk, which fails slowly and expensively rather than immediately. */
export function validateRequest(input: ResearchRequestInput): ValidationResult {
  const address = (input.address ?? '').trim();
  const county = (input.county ?? '').trim();
  const state = (input.state ?? 'TX').trim().toUpperCase();

  if (address.length < 5) {
    return { ok: false, error: 'An address is required, and must be more than a few characters.' };
  }
  if (!county) {
    return {
      ok: false,
      error: 'A county is required. It is not inferred from the address — guessing it wrong sends the run at the wrong clerk, which fails slowly and expensively.',
    };
  }
  if (state.length !== 2) {
    return { ok: false, error: 'State must be a two-letter code.' };
  }

  return {
    ok: true,
    normalised: {
      address,
      // "Bell County" and "Bell" are the same county; the trailing word is noise in every lookup.
      county: county.replace(/\s+county$/i, '').trim(),
      state,
      dedupeKey: dedupeKey(address, county, state),
    },
  };
}

// ── Retry policy ────────────────────────────────────────────────────────────────────────────────

export interface RetryDecision {
  retry: boolean;
  reason: string;
}

/** Permanent failures. Retrying these burns a full run to reach the same answer.
 *
 *  Matched on the message because the worker reports failures as text; each pattern is a failure
 *  whose cause cannot change between now and five minutes from now. */
const PERMANENT = [
  { re: /no adapter|not supported|unsupported county/i, why: 'no adapter exists for this county' },
  { re: /invalid address|could not geocode|address not found/i, why: 'the address could not be resolved' },
  { re: /prohibit|terms of service|not permitted/i, why: 'automated access is not permitted here' },
  { re: /budget|ceiling|spend limit/i, why: 'the run hit a spending ceiling' },
];

export function shouldRetry(attempts: number, maxAttempts: number, failure: string | null): RetryDecision {
  if (attempts >= maxAttempts) {
    return { retry: false, reason: `Gave up after ${attempts} attempt(s).` };
  }
  const permanent = PERMANENT.find((p) => p.re.test(failure ?? ''));
  if (permanent) {
    return { retry: false, reason: `Not retried — ${permanent.why}, which will not change on a second attempt.` };
  }
  return { retry: true, reason: `Attempt ${attempts + 1} of ${maxAttempts}.` };
}

// ── What the requester is told ──────────────────────────────────────────────────────────────────

export interface RequestRow {
  id: string;
  address: string;
  county: string;
  status: RequestStatus;
  research_project_id: string | null;
  packet_id: string | null;
  failure_reason: string | null;
  attempts: number;
  max_attempts: number;
  queued_at: string;
  finished_at: string | null;
}

export interface Notification {
  title: string;
  body: string;
  link: string | null;
}

/** The message, either way.
 *
 *  Failure notification is the one people forget, and it is the one that matters: a request that
 *  quietly failed looks identical to one still running, and somebody finds out when the crew is
 *  already on site. */
export function notificationFor(r: RequestRow): Notification | null {
  const where = `${r.address}, ${r.county} County`;

  if (r.status === 'complete') {
    return {
      title: `Research finished — ${where}`,
      body: r.packet_id
        ? 'A packet has been assembled and is ready to review and approve.'
        : 'The research finished, but no packet was assembled — the facts are there, the deliverable is not.',
      link: r.research_project_id ? `/admin/research/${r.research_project_id}` : null,
    };
  }
  if (r.status === 'failed') {
    return {
      title: `Research FAILED — ${where}`,
      body:
        `${r.failure_reason ?? 'No reason was recorded.'} ` +
        (r.attempts >= r.max_attempts
          ? `Tried ${r.attempts} time(s) and stopped.`
          : 'It will not be retried automatically.') +
        ' Nothing has been researched for this property — do not assume it was covered.',
      link: r.research_project_id ? `/admin/research/${r.research_project_id}` : null,
    };
  }
  if (r.status === 'duplicate') {
    return {
      title: `Already being researched — ${where}`,
      body: 'A request for this property was already in progress, so a second run was not started.',
      link: r.research_project_id ? `/admin/research/${r.research_project_id}` : null,
    };
  }
  // queued / running / cancelled produce no notification: nobody needs telling that a thing they
  // just asked for is happening.
  return null;
}

export interface QueueSummary {
  queued: number;
  running: number;
  failed: number;
  unnotified: number;
  headline: string;
}

/** The queue at a glance. Leads with what is stuck, because a queue screen that leads with throughput
 *  is a screen that hides the request nobody was told failed. */
export function queueSummary(rows: RequestRow[], unnotified: number): QueueSummary {
  const count = (s: RequestStatus) => rows.filter((r) => r.status === s).length;
  const queued = count('queued');
  const running = count('running');
  const failed = count('failed');

  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} failed`);
  if (unnotified > 0) parts.push(`${unnotified} finished with nobody notified`);
  if (running > 0) parts.push(`${running} running`);
  if (queued > 0) parts.push(`${queued} waiting`);

  return {
    queued, running, failed, unnotified,
    headline: parts.length === 0 ? 'The research queue is empty.' : parts.join(', ') + '.',
  };
}
