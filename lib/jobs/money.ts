// lib/jobs/money.ts — what we bid, what we received, and what is still owed.
//
// Owner, 2026-08-19: *"sometimes we get down payments… sometimes we change the price of the job…
// Sometimes we reject a job altogether after having started it… make sure that this is all wired up
// correctly with our financial pages properly so we can fully keep track of what we have bid and
// what we have spent and what we have received."*
//
// ── THE ONE DECISION THIS FILE EXISTS TO CENTRALISE ─────────────────────────────────────────────
//
// "What is this job worth?" has three plausible answers and they disagree:
//
//   quote_amount   what we said it would cost
//   final_amount   what we actually billed
//   sum(payments)  what has arrived
//
// Every screen that picks one of these on its own eventually picks a different one, and then the
// job page and the financial page report different numbers for the same job — which is worse than
// either being wrong, because there is no way to tell which to believe.
//
// So the rules live here, once:
//
//   billed      = final_amount when set, otherwise quote_amount. A job mid-flight has a number the
//                 firm is counting on; reporting zero would make live work look free.
//   received    = the SUM OF PAYMENTS, never `jobs.amount_paid`. That column is a running total
//                 somebody has to remember to update; the payment rows are the events. When they
//                 disagree the rows are right, and `reconcile` says so out loud rather than
//                 silently preferring one.
//   outstanding = billed − received, floored at zero, and ZERO for a cancelled job that is not
//                 keeping anything — chasing a debt on work nobody is doing is how a receivables
//                 report becomes fiction.
//
// Pure. No I/O — tested in `__tests__/jobs/money.test.ts`.

export type PaymentType = 'deposit' | 'progress' | 'final' | 'refund' | 'payment';

/** How a payment reads on screen. `deposit` is the one the owner asked for by name. */
export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Down payment',
  progress: 'Progress payment',
  final: 'Final payment',
  refund: 'Refund',
  payment: 'Payment',
};

export const PAYMENT_TYPES: PaymentType[] = ['deposit', 'progress', 'final', 'refund', 'payment'];

export function isPaymentType(v: unknown): v is PaymentType {
  return typeof v === 'string' && (PAYMENT_TYPES as string[]).includes(v);
}

export interface PaymentRow {
  amount?: number | null;
  payment_type?: string | null;
  paid_at?: string | null;
}

export interface JobMoneyInput {
  quote_amount?: number | null;
  final_amount?: number | null;
  amount_paid?: number | null;
  result?: string | null;
  amount_retained?: number | null;
  payments?: PaymentRow[];
}

export interface JobMoneySummary {
  /** What we said it would cost. */
  quoted: number;
  /** What we are actually charging — final where set, else the quote. */
  billed: number;
  /** Sum of payments received, refunds subtracted. */
  received: number;
  /** Of `received`, how much arrived as a down payment. */
  deposits: number;
  /** Still owed. Zero once a job is cancelled and nothing is being retained. */
  outstanding: number;
  /** True when the job is cancelled/lost — the callers that colour a row differently need this. */
  cancelled: boolean;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A refund is money going back out, so it reduces what we have received. */
function signed(p: PaymentRow): number {
  const amt = num(p.amount);
  return p.payment_type === 'refund' ? -Math.abs(amt) : amt;
}

export function summarise(job: JobMoneyInput): JobMoneySummary {
  const payments = job.payments ?? [];
  const quoted = num(job.quote_amount);
  const final = num(job.final_amount);
  const billed = final > 0 ? final : quoted;

  const received = round2(payments.reduce((a, p) => a + signed(p), 0));
  const deposits = round2(
    payments.filter((p) => p.payment_type === 'deposit').reduce((a, p) => a + signed(p), 0),
  );

  const cancelled = job.result === 'lost' || job.result === 'abandoned';

  // A cancelled job owes what it is RETAINING, not what it was quoted. If the firm keeps a $1,500
  // deposit on a $6,000 job it walked away from, the receivable is what remains of that 1,500 —
  // not 6,000, which is a bill nobody is ever going to send.
  const target = cancelled ? num(job.amount_retained) : billed;
  const outstanding = round2(Math.max(0, target - received));

  return { quoted: round2(quoted), billed: round2(billed), received, deposits, outstanding, cancelled };
}

/**
 * Does the stored running total agree with the payment rows?
 *
 * `jobs.amount_paid` predates `job_payments` and is still written by older paths. Rather than pick
 * a winner silently, this reports the disagreement so a screen can show it — a number that is quietly
 * wrong is the one that gets believed.
 */
export function reconcile(job: JobMoneyInput): { agrees: boolean; stored: number; fromRows: number; drift: number } {
  const stored = round2(num(job.amount_paid));
  const fromRows = summarise(job).received;
  const drift = round2(fromRows - stored);
  return { agrees: Math.abs(drift) < 0.005, stored, fromRows, drift };
}

export interface PriceChange {
  field?: string | null;
  old_amount?: number | null;
  new_amount?: number | null;
  reason?: string | null;
  changed_by?: string | null;
  created_at?: string | null;
}

/** One line of price history, as a person would read it. */
export function describePriceChange(c: PriceChange): string {
  const label = c.field === 'final' ? 'Final amount' : 'Quote';
  const from = c.old_amount === null || c.old_amount === undefined ? null : num(c.old_amount);
  const to = num(c.new_amount);
  // An opening figure is not a change, and rendering it as "— → $4,200" reads like data loss.
  if (from === null) return `${label} set to ${money(to)}`;
  const direction = to > from ? 'raised' : to < from ? 'lowered' : 'restated';
  return `${label} ${direction} from ${money(from)} to ${money(to)}`;
}

export function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

/** Roll a set of jobs up for a financial page: bid, received, outstanding across the firm. */
export function rollUpJobs(jobs: JobMoneyInput[]): {
  jobs: number; quoted: number; billed: number; received: number; deposits: number;
  outstanding: number; cancelled: number;
} {
  let quoted = 0, billed = 0, received = 0, deposits = 0, outstanding = 0, cancelled = 0;
  for (const j of jobs) {
    const s = summarise(j);
    quoted += s.quoted;
    // A cancelled job is excluded from what the firm is BILLING — it is not work in the pipeline —
    // but its retained money still counts as received, because that cash really did arrive.
    if (!s.cancelled) billed += s.billed;
    else cancelled += 1;
    received += s.received;
    deposits += s.deposits;
    outstanding += s.outstanding;
  }
  return {
    jobs: jobs.length,
    quoted: round2(quoted), billed: round2(billed), received: round2(received),
    deposits: round2(deposits), outstanding: round2(outstanding), cancelled,
  };
}
