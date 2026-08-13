// lib/payroll/payment-statement.ts
//
// What a person was actually paid, said honestly.
//
// ── WHY THIS IS NOT "MOVE THE PAY STUB ONTO THE BATCH PATH" ──────────────────────────────────────
//
// The plan's S9b said to port stub generation from the retiring engine to the surviving one. Reading
// both engines shows that would produce a document that misstates wages, because the two do
// fundamentally different things with tax:
//
//   * **The legacy run** computes withholding from FLAT ESTIMATED PERCENTAGES — 12% federal, 6.2%
//     social security, 1.45% medicare (`DEFAULT_DEDUCTIONS` in pay-stub.ts) — and its own comment
//     says so: *"an estimate … real withholding depends on a W-4, filing status and year-to-date
//     wages, and belongs to a payroll provider rather than to this codebase."* It then pays NET.
//
//   * **The payout batch** withholds nothing. It pays the full approved amount, and the tax story is
//     handled downstream by classifying each worker W-2 or 1099 and handing clean totals to a tax
//     preparer (`lib/payouts/worker-classification.ts`).
//
// Porting the first onto the second would print "Federal Tax −$120.00" and a net figure on a
// document an employee is entitled to, while the payment they actually received was the GROSS
// amount. A stub whose net does not equal the payment is worse than no stub: it is a wage statement
// that is wrong, and the person has no way to tell which number to believe.
//
// So this states what happened, from figures that exist, and invents nothing:
//
//     earned      what the approved hours came to
//     recovered   any pay advance taken back out of it
//     paid        what was actually sent
//     withheld    NOTHING, said out loud, with what that means for the person
//
// Whether the firm should be withholding at all is a question for an accountant or a payroll
// provider — D1 of the plan flags it — and it is not one this module answers by inventing a figure.

import { disbursedCents } from './disbursement';

/** A payout line, as a statement needs it. */
export interface StatementItem {
  user_email?: string | null;
  user_name?: string | null;
  total_cents?: number | null;
  recovered_cents?: number | null;
  method?: string | null;
  external_ref?: string | null;
  status?: string | null;
  paid_at?: string | null;
}

export interface PaymentStatement {
  /** What the approved hours came to, in cents, before anything was held back. */
  earnedCents: number;
  /** Held back against an outstanding pay advance. */
  recoveredCents: number;
  /** What actually went to the person. */
  paidCents: number;
  /** True once the money has genuinely gone, rather than merely been prepared. */
  isPaid: boolean;
  /** Every line of the statement, in the order a person reads them. */
  lines: Array<{ label: string; amountCents: number | null; note?: string }>;
  /**
   * The sentence that stops this being mistaken for a tax document.
   *
   * Always present. A wage statement silent about withholding invites the reader to assume tax was
   * taken — and if they assume that and it was not, they discover the error from a tax bill.
   */
  taxNote: string;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/** Payment methods where "paid" means the money has genuinely left the firm. `account` has not —
 *  it moved the obligation from "we owe you for hours" to "we hold this for you". */
const LEAVES_THE_FIRM = new Set(['cash', 'check', 'venmo', 'cashapp', 'zelle', 'ach', 'other']);

/**
 * Build an honest statement of one payment.
 *
 * Pure. Every figure comes from the payout item; none is derived from a tax table, because this
 * codebase does not have a real one and an estimated one on a wage statement is a wrong number
 * wearing a document's authority.
 */
export function buildPaymentStatement(item: StatementItem): PaymentStatement {
  const earnedCents = Math.max(0, Math.round(Number(item.total_cents) || 0));
  const recoveredCents = Math.max(0, Math.round(Number(item.recovered_cents) || 0));
  const paidCents = disbursedCents(item);
  const isPaid = (item.status ?? '') === 'paid';

  const lines: PaymentStatement['lines'] = [
    { label: 'Approved hours', amountCents: earnedCents },
  ];

  if (recoveredCents > 0) {
    lines.push({
      label: 'Pay advance repaid',
      amountCents: -recoveredCents,
      // Named as a repayment, never as a "deduction". An advance is money already handed over;
      // calling it a deduction would imply it was taken from earnings the person never received.
      note: 'Money already advanced to you, now repaid. Not a deduction from your wages.',
    });
  }

  lines.push({
    label: isPaid ? 'Paid to you' : 'To be paid to you',
    amountCents: paidCents,
    note: item.method === 'account'
      // The one method where "paid" does not mean the money moved.
      ? 'Held in your balance — it leaves when you withdraw it.'
      : undefined,
  });

  const taxNote = recoveredCents > 0
    ? 'No tax has been withheld from this payment. The advance repayment above is not a tax '
      + 'deduction. What you owe is settled through your W-2 or 1099 at the end of the year — '
      + 'ask the office if you are unsure which applies to you.'
    : 'No tax has been withheld from this payment. What you owe is settled through your W-2 or '
      + '1099 at the end of the year — ask the office if you are unsure which applies to you.';

  return { earnedCents, recoveredCents, paidCents, isPaid, lines, taxNote };
}

/** One line for a list, where the whole statement will not fit. */
export function summarisePayment(item: StatementItem): string {
  const s = buildPaymentStatement(item);
  const when = item.paid_at ? ` on ${item.paid_at.slice(0, 10)}` : '';
  if (s.recoveredCents === 0) {
    return `${money(s.paidCents)}${s.isPaid ? ` paid${when}` : ' prepared, not yet sent'}.`;
  }
  return `${money(s.paidCents)}${s.isPaid ? ` paid${when}` : ' prepared, not yet sent'} — `
    + `${money(s.earnedCents)} earned less ${money(s.recoveredCents)} repaid on a pay advance.`;
}
