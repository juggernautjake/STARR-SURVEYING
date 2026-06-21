// lib/payments/upfront-rule.ts
//
// Phase-2 Slice 0 of
// docs/planning/completed/CUSTOMER_INVOICING_PHASE2_2026-06-21.md.
//
// Pure helper that gates every payment attempt against the user-spec
// upfront rule:
//
//   "if they make a payment initially that is less than the upfront
//    cost, then it should notify them and tell them that they will
//    need to pay the rest of upfront cost before they can make a
//    payment. Like, we shouldn't accept any money for the job until
//    they pay the full upfront cost or more."
//                                       — user directive, 2026-06-21
//
// The rule, formalised:
//
//   - If the invoice has no upfront requirement (`deposit_type === 'none'`
//     or `deposit_amount_cents <= 0`), accept any positive amount up to
//     the remaining balance.
//   - If the invoice DOES have an upfront requirement, and the upfront
//     amount has not yet been satisfied by prior payments, the
//     candidate payment MUST be at least the remaining upfront.
//   - Once the upfront is satisfied (prior_paid_cents >= upfront_amount_cents),
//     any positive payment up to the remaining balance is fine.
//   - Always reject zero / negative / NaN / over-balance amounts.
//
// Pure — no DB, no network. The route handlers call this BEFORE creating
// a Stripe PaymentIntent or recording a cash/check pledge.

/** Subset of `customer_invoices` (post-collision-fix) the rule reads. */
export interface InvoiceForUpfrontRule {
  /** From the new column shipping in Phase-2 Slice 2.
   *  - `none`     → no upfront required
   *  - `percent`  → `deposit_value` is 0–100; `deposit_amount_cents`
   *                 is derived = round(total_cents * value / 100)
   *  - `fixed`    → `deposit_value` IS the cents amount (in dollars
   *                 on the column; helper converts). */
  deposit_type: 'none' | 'percent' | 'fixed';
  /** Either a percent 0–100, or a dollar amount (the route converts
   *  dollars to cents before calling). For Slice 2 we'll store the
   *  pre-computed `deposit_amount_cents` directly to dodge floating-
   *  point trouble. */
  deposit_amount_cents: number;
  /** Total billed on the invoice, in cents. */
  total_cents: number;
  /** Sum of completed `payments.amount_cents` for this invoice. */
  prior_paid_cents: number;
}

export type UpfrontDecision =
  | { accepted: true;  reason: 'no_upfront' | 'upfront_satisfied' | 'covers_upfront'; effective_amount_cents: number }
  | { accepted: false; reason: 'amount_invalid' | 'below_upfront' | 'over_balance' | 'invoice_paid';
      message: string;
      required_minimum_cents?: number;
      remaining_balance_cents?: number };

/** Pure. Decide whether a candidate payment amount is acceptable
 *  against the upfront rule. */
export function decideUpfrontAcceptance(
  invoice: InvoiceForUpfrontRule,
  candidate_amount_cents: number,
): UpfrontDecision {
  // ── 1. Reject malformed amounts ─────────────────────────────────
  if (!Number.isFinite(candidate_amount_cents) || candidate_amount_cents <= 0) {
    return {
      accepted: false,
      reason: 'amount_invalid',
      message: 'Enter a payment amount greater than $0.00.',
    };
  }
  const amount = Math.floor(candidate_amount_cents);

  // ── 2. Reject when the invoice has nothing left to pay ──────────
  const remaining_balance_cents = Math.max(0, invoice.total_cents - invoice.prior_paid_cents);
  if (remaining_balance_cents === 0) {
    return {
      accepted: false,
      reason: 'invoice_paid',
      message: 'This invoice is already paid in full.',
      remaining_balance_cents: 0,
    };
  }

  // ── 3. Reject payments that exceed the remaining balance ────────
  // Cap, not refund — the route can suggest the customer adjust to
  // remaining_balance_cents if they want to pay it all off.
  if (amount > remaining_balance_cents) {
    return {
      accepted: false,
      reason: 'over_balance',
      message: `That's more than the remaining balance of ${formatDollarsFromCents(remaining_balance_cents)}. Lower your payment to ${formatDollarsFromCents(remaining_balance_cents)} or less.`,
      remaining_balance_cents,
    };
  }

  // ── 4. Upfront not required — accept ─────────────────────────────
  const upfront_amount_cents = invoice.deposit_type === 'none'
    ? 0
    : Math.max(0, Math.floor(invoice.deposit_amount_cents));
  if (upfront_amount_cents <= 0) {
    return {
      accepted: true,
      reason: 'no_upfront',
      effective_amount_cents: amount,
    };
  }

  // ── 5. Upfront already satisfied by prior payments — accept ─────
  if (invoice.prior_paid_cents >= upfront_amount_cents) {
    return {
      accepted: true,
      reason: 'upfront_satisfied',
      effective_amount_cents: amount,
    };
  }

  // ── 6. Upfront NOT yet satisfied — the candidate payment must
  //      cover the REMAINING upfront in one shot. The user spec is
  //      explicit: "we shouldn't accept any money for the job until
  //      they pay the full upfront cost or more."
  const remaining_upfront_cents = upfront_amount_cents - invoice.prior_paid_cents;
  if (amount < remaining_upfront_cents) {
    return {
      accepted: false,
      reason: 'below_upfront',
      message:
        `Your first payment must cover the upfront amount of ${formatDollarsFromCents(upfront_amount_cents)}. ` +
        (invoice.prior_paid_cents > 0
          ? `You've paid ${formatDollarsFromCents(invoice.prior_paid_cents)} so far, so please pay at least ${formatDollarsFromCents(remaining_upfront_cents)} now.`
          : `Please raise your payment to at least ${formatDollarsFromCents(remaining_upfront_cents)}.`),
      required_minimum_cents: remaining_upfront_cents,
      remaining_balance_cents,
    };
  }

  // ── 7. Candidate clears the remaining upfront — accept ──────────
  return {
    accepted: true,
    reason: 'covers_upfront',
    effective_amount_cents: amount,
  };
}

/** Pure. Resolve the upfront amount in cents from a percent or
 *  fixed-dollar input. Use this at invoice-create time to populate
 *  the `deposit_amount_cents` column so the rule above never has to
 *  re-do the math. */
export function resolveDepositAmountCents(
  deposit_type: 'none' | 'percent' | 'fixed',
  deposit_value: number,
  total_cents: number,
): number {
  if (deposit_type === 'none') return 0;
  if (!Number.isFinite(deposit_value) || deposit_value <= 0) return 0;
  if (!Number.isFinite(total_cents) || total_cents <= 0) return 0;
  if (deposit_type === 'percent') {
    const clamped = Math.min(100, Math.max(0, deposit_value));
    return Math.round(total_cents * clamped / 100);
  }
  // fixed — `deposit_value` is a dollar amount; convert + cap at total.
  const cents = Math.round(deposit_value * 100);
  return Math.min(total_cents, Math.max(0, cents));
}

/** Pure. Has the invoice's upfront threshold been crossed? Drives the
 *  Phase-2 Slice 6 notification ("customer paid the deposit, start
 *  the research phase"). */
export function isUpfrontPaid(invoice: InvoiceForUpfrontRule): boolean {
  if (invoice.deposit_type === 'none') return true;
  const upfront = Math.max(0, Math.floor(invoice.deposit_amount_cents));
  if (upfront <= 0) return true;
  return invoice.prior_paid_cents >= upfront;
}

// ── Internals ────────────────────────────────────────────────────

function formatDollarsFromCents(cents: number): string {
  const safe = Math.max(0, Math.round(cents));
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(safe / 100);
}
