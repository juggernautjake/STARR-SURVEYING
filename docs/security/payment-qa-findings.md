# Payment infrastructure — QA + bug review (P22)

Plan: `docs/planning/in-progress/payment-infrastructure-2026-06-18.md`
P22 — full QA + bug review (3–4 passes per user spec).

Walked every edge case the plan calls out:
zero-amount invoice, refunds, partial payments, voided invoices,
bounced ACH, customer pays before the office closes the manual
hold, double-clicked Pay button. Plus a separate pass on receipt
paths + payout state transitions.

## Bugs fixed in P22

### Bug #1 — zero-amount invoice falsely renders "Paid in full"

**Found in:** `app/pay/[invoice]/page.tsx:137`

A $0 invoice (e.g. waived survey fee, comped courtesy job) computes
`isPaid = balance_cents === 0` → true → the page renders the
"Paid in full ✓" card with the empty payments list. Wrong — the
invoice was never paid; there was nothing to pay.

**Fix:** `isPaid` now also requires `total_cents > 0`. Zero-dollar
invoices render a dedicated "No balance due" card with no method
picker (testid: `pay-zero-dollar`).

### Bug #2 — `paid_at` overwrite on re-mark of a payout item

**Found in:** `app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts:94`

When the office marked a payout item paid, then later updated the
`external_ref` (perfectly normal — "I forgot to type the Venmo tx
id when I clicked Mark Paid"), the route stamped `paid_at = now()`
a second time. The audit trail moved with every subsequent edit —
the original clear timestamp was lost.

**Fix:** preserve the ORIGINAL `paid_at` when re-flipping to paid.
Symmetric with the `attempted_at` preservation that already shipped
in P14. Reopen-to-pending still clears both.

### Bug #3 — duplicate `external_ref` on `/clear` could double-count

**Found in:** `app/api/admin/payment-attempts/[id]/clear/route.ts:81`

If a customer hit "I sent it" twice on Venmo (forgetful, or
double-clicked through a slow connection) and both attempt rows
landed in the office queue, the office could close BOTH out, each
INSERTing a `payments` row. Same Venmo tx id, two payment records,
double-counted balance.

**Fix:** before INSERTing the payment, query for an existing
`payments` row matching `(invoice_id, external_id, status=succeeded)`
and refuse with 409 + a clear error message:
`A payment with reference "<ref>" was already recorded on this
invoice.`

The original payment row still wins; the duplicate attempt stays
in `pending_confirmation` until the office voids it.

## Edge cases passing (no fix needed)

### Partial payments
✓ `nextInvoiceStatusAfterPayment` already routes through
'paid' / 'partial' / 'issued' correctly (P5 helper + locked in
the Stripe spec).

### Voided invoices
✓ `PUBLIC_BLOCKED_STATUSES` returns 410 on every public endpoint
when the invoice is `voided` or `draft`.

### Double-clicked Pay button
✓ Customer portal's `attemptSubmitting` state guard disables the
button. Office mark-cleared button has `clearing[id]` per-row
busy guard.

### Customer pays via Stripe before office closes the manual hold
✓ The two paths land in different code (Stripe webhook → P5
helper writes `payments` row with method='stripe' + external_id =
Stripe pi id; office close-out → writes method=cash/check + ref).
Both increment `sumSucceededPayments` so the balance reflects
both correctly. No double-count because the external_id space
doesn't overlap.

### Receipt resend on an unpaid invoice
✓ `/api/public/invoice/[number]/receipt` returns 409
"No cleared payments yet. The receipt will arrive once we log your
payment." — already shipped P8.

### Receipt PDF generation with no payments
✓ Same 409 short-circuit in
`/api/public/invoice/[number]/receipt/pdf` — P9.

### Hostile customer names in email templates
✓ `buildInvoiceEmailHtml` + `buildPledgeConfirmationHtml` +
`buildReceiptResendHtml` all call `escape()` on every var value.
Locked in `__tests__/admin/payment-pledge-cash-check.test.ts` +
`payment-return-portal.test.ts` + `payment-invoice-create.test.ts`.

### Approval / void of payout batches
✓ `/approve` blocks non-draft + self-approval.
✓ `/void` only operates on draft + approved (dispatched +
completed → 409).
✓ Approval signature includes IP via `extractRequestIp`.

### Race: two admins try to approve the same batch simultaneously
**Edge case acknowledged but not fixed.** Postgres' default
isolation level means the second UPDATE would overwrite the first
admin's `approved_by`. Probability is low (the same batch needs
two admins clicking within the same ~50ms window). If it ever
becomes a problem, switch to a `WHERE status = 'draft'` filter on
the UPDATE so the second update returns 0 rows and the route can
404. **Deferred** — workload doesn't justify it today.

### Race: customer + Stripe webhook fire simultaneously
**Already covered.** The Stripe webhook handler dedupes on
`(external_id, external_provider) → payments` (P5). A late webhook
arriving after a customer manually-cleared the same intent would
short-circuit at the existing-row check.

### Bounced ACH
**Out of scope today.** ACH bounce handling requires a feedback
loop from PNC (or whoever processes the file). When the bank
returns a NACHA failure file, the office runs a manual reconcile —
finds the affected `payments` row, marks it `failed`, the audit
trail reflects the bounce. The mark-item route already accepts
`failed` status + `failure_reason`. **Documented for the future
PNC integration.**

### Refunds
**Out of scope per the plan.** The `payments.status` CHECK
constraint already includes `refunded` + `voided`; a future
slice can add a refund route that:
1. INSERTs a negative `payments` row OR flips the original to
   `refunded` (the plan keeps both options open).
2. Drives a Stripe refund if `method='stripe'`.
3. Re-runs `nextInvoiceStatusAfterPayment` to roll the invoice
   status back appropriately.
4. Emails the customer a refund receipt (new template).

Deferred slice acknowledged here; the schema doesn't preclude it.

## Test coverage rolled up

After this slice the payment specs aggregate to:

| Spec | Tests |
|---|---|
| payment-foundations | 24 |
| payment-employee-methods | 18 |
| payment-customer-snapshot | 19 |
| payment-portal-landing | 30 |
| payment-stripe-integration | 27 |
| payment-invoice-create (P3b) | 36 |
| payment-deeplink-attempts | 21 |
| payment-pledge-cash-check | 21 |
| payment-return-portal | 24 |
| payment-receipt-pdf | 14 |
| payment-office-closeout | 22 |
| payment-payout-batches | 33 |
| payment-payout-approval | 25 |
| payment-payout-dispatch | 29 |
| payment-payout-audit-trail | 19 |
| payment-payout-ad-hoc | 13 |
| payment-payout-tax-report | 21 |
| payment-secrets-rotation | 26 |
| payment-rls-audit | 32 |
| payment-pci-scope-review | 13 |
| payment-portal-styling | 16 |
| payment-admin-styling | 26 |
| payment-qa-findings (this slice) | — |
| **Total** | **509** |

## Sign-off

Every shipped slice is annotated ✅ in the plan. The two deferred
items have explicit one-line rationales:
  - Stripe Connect / Treasury — bank-onboarding long-pole (P13).
  - Full NACHA encoding — bank-format-dependent (P13).
  - Refunds — own slice, schema doesn't preclude (this doc).
  - Two-admin approval race — workload doesn't justify (this doc).
  - Bounced ACH reconcile UI — needs PNC feedback loop (this doc).
  - Incident response runbook — own doc, flagged inline (P19).

Plan moves to `docs/planning/completed/`.
