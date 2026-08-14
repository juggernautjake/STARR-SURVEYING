// lib/jobs/financials.ts — slice J3 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// > **Done when:** the Financial tab states quoted / invoiced / paid / outstanding, and payments
// > recorded elsewhere appear here rather than only in the finance area.
//
// ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────────
//
// The Financial tab showed Quote, Paid and "Balance Due", where Balance Due was
// `(final ?? quote) − amount_paid`. Three separate problems, none of which look like a bug on screen:
//
//   1. It never mentioned INVOICES. `customer_invoices` has a `job_id` and the /pay portal bills
//      against it, so a job could have been invoiced $8,000 and quoted $6,000 and the job page
//      would answer "what is owed" with a number derived from the quote. Quoting and billing are
//      different acts and the gap between them is a thing somebody needs to see.
//   2. `jobs.amount_paid` is a cached column written by the payments route. It was computed
//      excluding refunds, so recording a refund left the job showing the money as received (fixed
//      in that route on 2026-08-14). A summary that recomputes from the rows cannot drift.
//   3. A voided invoice still counted as a demand for money, and a draft invoice — one nobody has
//      sent — counted as one too.
//
// ── CENTS AND DOLLARS ───────────────────────────────────────────────────────────────────────────
//
// `job_payments.amount` is DOLLARS (a numeric). `customer_invoices.total_cents` is CENTS. They are
// summed together here, so the conversion happens once, in this file, with the unit in the
// parameter names. Getting this wrong is a 100× error that renders as a plausible number.

/** A row of `job_payments`. Amounts are dollars. */
export interface JobPaymentRow {
  amount: number;
  payment_type: string;
}

/** A row of `customer_invoices`. Amounts are cents. */
export interface JobInvoiceRow {
  total_cents: number;
  status: string;
}

/**
 * Invoice states that represent money actually being asked for.
 *
 * `draft` is excluded: nobody has seen it, so it is not a demand. `voided` is excluded: it was
 * withdrawn. Both of those counting toward "invoiced" is how a job appears to owe money it does
 * not. `refunded` IS counted — the invoice was issued and paid and then given back, and the refund
 * shows up on the payments side; dropping it here would double-count the reversal.
 */
export const BILLED_INVOICE_STATES = new Set(['issued', 'partial', 'paid', 'overdue', 'refunded']);

export interface JobFinancials {
  /** What we said we would charge: the final amount if one has been agreed, otherwise the quote. */
  quoted: number;
  /** Whether `quoted` came from a final amount rather than the original quote — the difference is
   *  worth naming on screen, because "we quoted 6 and agreed 8" is a story. */
  quotedIsFinal: boolean;
  /** The sum of invoices that actually ask for money. */
  invoiced: number;
  /** Quoted but not yet invoiced. The number that answers "have we billed this job yet?", which is
   *  otherwise a question requiring two screens. */
  unbilled: number;
  /** Money in, before refunds. */
  received: number;
  /** Money given back. */
  refunded: number;
  /** What the firm actually has. */
  netReceived: number;
  /** Still owed. Zero, never negative — an overpayment is reported by `overpaid`, because a
   *  negative "outstanding" reads as a rounding bug rather than as somebody paying twice. */
  outstanding: number;
  /** Paid more than was asked for. Rare and always worth surfacing: it is either a deposit against
   *  the next job or a mistake, and both need somebody to look. */
  overpaid: number;
  /** What "outstanding" was measured against — `invoiced` once anything has been billed, otherwise
   *  the quote. Returned so the UI can say which, rather than presenting a number with no basis. */
  basis: 'invoiced' | 'quoted' | 'none';
  status: 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'nothing_to_bill';
}

export function summariseJobFinancials(args: {
  quoteAmount?: number | null;
  finalAmount?: number | null;
  payments: readonly JobPaymentRow[];
  invoices: readonly JobInvoiceRow[];
}): JobFinancials {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const finalAmount = num(args.finalAmount);
  const quoteAmount = num(args.quoteAmount);
  // A final amount of 0 is not "no final amount agreed" — a job can genuinely be waived — so the
  // test is on the value being present and positive rather than on `??`, which would treat an
  // explicit zero as a final amount and report a $0 job as fully billed.
  const quotedIsFinal = finalAmount > 0 && finalAmount !== quoteAmount;
  const quoted = finalAmount > 0 ? finalAmount : quoteAmount;

  const invoiced = args.invoices
    .filter((i) => BILLED_INVOICE_STATES.has(i.status))
    .reduce((s, i) => s + num(i.total_cents) / 100, 0);

  const received = args.payments
    .filter((p) => p.payment_type !== 'refund')
    .reduce((s, p) => s + num(p.amount), 0);
  const refunded = args.payments
    .filter((p) => p.payment_type === 'refund')
    .reduce((s, p) => s + num(p.amount), 0);
  const netReceived = received - refunded;

  const basis: JobFinancials['basis'] = invoiced > 0 ? 'invoiced' : quoted > 0 ? 'quoted' : 'none';
  const owedAgainst = basis === 'invoiced' ? invoiced : basis === 'quoted' ? quoted : 0;

  // Rounded to the cent before comparing. Floating-point dollars leave $0.000000001 outstanding on
  // a job that is exactly paid, which shows as "Outstanding $0.00" next to a status of "partial" —
  // a contradiction on screen that nobody can explain.
  const balance = Math.round((owedAgainst - netReceived) * 100) / 100;

  const status: JobFinancials['status'] =
    basis === 'none' ? 'nothing_to_bill'
    : balance < 0 ? 'overpaid'
    : balance === 0 ? 'paid'
    : netReceived > 0 ? 'partial'
    : 'unpaid';

  return {
    quoted,
    quotedIsFinal,
    invoiced,
    unbilled: Math.max(0, Math.round((quoted - invoiced) * 100) / 100),
    received,
    refunded,
    netReceived,
    outstanding: Math.max(0, balance),
    overpaid: Math.max(0, -balance),
    basis,
    status,
  };
}

/** Dollars, always with cents. Money on a financial screen without cents is money somebody will
 *  reconcile against a bank statement and find off by a few pennies. */
export function formatMoney(amount: number): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const FINANCIAL_STATUS_LABEL: Record<JobFinancials['status'], string> = {
  unpaid: 'Nothing received',
  partial: 'Part paid',
  paid: 'Paid in full',
  overpaid: 'Overpaid',
  nothing_to_bill: 'Not quoted yet',
};
