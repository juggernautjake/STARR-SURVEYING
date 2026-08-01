// lib/payments/reconcile.ts — which "I sent it" claims never turned into money (C1-2).
//
// The analysis states the problem exactly: *"The deep-link methods (Venmo, Cash App, Zelle) rely on the
// customer pressing 'I sent it', so the office queue is a claim, not a fact. A report of claims with no
// matching payment after N days is the control that makes it trustworthy."*
//
// ── A CLAIM IS NOT A LIE, AND THE REPORT MUST NOT READ AS AN ACCUSATION ────────────────────────────
//
// Almost every stale claim is a customer who genuinely paid and an office that has not reconciled the
// bank yet. A few are a Venmo that failed silently, or a name nobody could match. Roughly none are fraud.
// So this is a WORKLIST, not an alert: it says "these need a human to look at the bank", it is ordered
// oldest-first because the oldest is the most likely to have been forgotten, and the wording everywhere
// downstream says "unreconciled" rather than "unpaid".
//
// ── WHY "AFTER N DAYS" AND NOT "IMMEDIATELY" ──────────────────────────────────────────────────────
//
// A Zelle transfer can take three business days to appear. Flagging a claim the moment it is made would
// put every honest customer on the list and train the office to ignore it — which is the failure mode
// that matters, because a list nobody reads is worse than no list, having cost the work of building it.
//
// Pure and total: no I/O, no clock. `asOf` is passed in, so a test can stand anywhere in time.

/** A customer's claim that they sent money. */
export interface AttemptRow {
  id: string;
  invoice_id: string;
  method: string;
  intended_amount_cents: number;
  status: string;
  created_at: string;
  /** Set when the office has already linked this claim to a real payment. */
  resulted_in_payment_id: string | null;
  payer_email: string | null;
}

/** Money that actually arrived. */
export interface PaymentRow {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: string;
  status: string;
  cleared_at: string | null;
  created_at: string;
}

/** Statuses that mean "the customer says they have sent it and nobody has confirmed". */
export const UNCONFIRMED_STATUSES = new Set(['pledged', 'pending_confirmation']);

/** How long to leave a claim alone before it needs a human. Three business days, rounded up. */
export const STALE_AFTER_DAYS = 5;

export interface StaleClaim {
  attempt: AttemptRow;
  ageDays: number;
  /** Why it is on the list, in the words the office should see. */
  reason: 'no_payment' | 'amount_mismatch';
  /** For `amount_mismatch`, what did arrive against this invoice. */
  paidCents: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const succeeded = (p: PaymentRow) => p.status === 'succeeded';

/**
 * Claims that need a human, oldest first.
 *
 * A claim is clear when the office has LINKED it (`resulted_in_payment_id`) or when enough money has
 * arrived against that invoice since the claim was made. The second rule is what stops the list filling
 * up with claims the office reconciled by simply recording the payment — which is what an office
 * actually does, rather than going back to tick off the claim.
 *
 * `amount_mismatch` is reported separately from `no_payment` because they need different actions:
 * nothing arrived at all is a question for the customer, and less arrived than was claimed is a question
 * for the bank statement.
 */
export function staleClaims(
  attempts: readonly AttemptRow[],
  payments: readonly PaymentRow[],
  opts: { asOf: number; afterDays?: number },
): StaleClaim[] {
  const afterDays = opts.afterDays ?? STALE_AFTER_DAYS;
  const byInvoice = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    if (!succeeded(p)) continue;
    const list = byInvoice.get(p.invoice_id) ?? [];
    list.push(p);
    byInvoice.set(p.invoice_id, list);
  }

  const out: StaleClaim[] = [];
  for (const a of attempts) {
    if (!UNCONFIRMED_STATUSES.has(a.status)) continue;
    // Already linked by hand — the office has done the work, and re-listing it would train them to
    // ignore the list.
    if (a.resulted_in_payment_id) continue;

    const madeAt = Date.parse(a.created_at);
    if (!Number.isFinite(madeAt)) continue;
    const ageDays = (opts.asOf - madeAt) / DAY_MS;
    if (ageDays < afterDays) continue;

    // Money that arrived AT OR AFTER the claim. Payments before it belong to an earlier instalment and
    // counting them would clear a claim with somebody else's money.
    const paidCents = (byInvoice.get(a.invoice_id) ?? [])
      .filter((p) => Date.parse(p.cleared_at ?? p.created_at) >= madeAt - DAY_MS)
      .reduce((sum, p) => sum + (p.amount_cents || 0), 0);

    if (paidCents <= 0) {
      out.push({ attempt: a, ageDays: Math.floor(ageDays), reason: 'no_payment', paidCents: 0 });
    } else if (paidCents < a.intended_amount_cents) {
      out.push({ attempt: a, ageDays: Math.floor(ageDays), reason: 'amount_mismatch', paidCents });
    }
  }

  // Oldest first: the oldest is the most likely to have been forgotten, and a list sorted newest-first
  // buries exactly the rows that need attention.
  return out.sort((x, y) => y.ageDays - x.ageDays);
}

/** One line for the office, written as a worklist item rather than an accusation. */
export function describeClaim(c: StaleClaim): string {
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const age = `${c.ageDays} day${c.ageDays === 1 ? '' : 's'} ago`;
  if (c.reason === 'no_payment') {
    return `${c.attempt.method} — customer said they sent ${dollars(c.attempt.intended_amount_cents)} ${age}; nothing recorded against this invoice since. Check the bank.`;
  }
  return `${c.attempt.method} — customer said ${dollars(c.attempt.intended_amount_cents)} ${age}; ${dollars(c.paidCents)} recorded. Check the statement for the difference.`;
}
