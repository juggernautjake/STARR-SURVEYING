# Payment infrastructure — 2026-06-18

> User ask (verbatim, paraphrased + condensed):
>   - "I want to be able to use venmo, zelle, cashapp, or be
>     able to pay out directly from the company bank account to
>     the employee bank."
>   - "Customers need to be able to pay invoices through our
>     website."
>   - "They will go to the website, they will have their
>     invoice, they will input their invoice number, it will
>     give them their job information and stuff, and then it
>     will give them their total due."
>   - "They can then pay that total online using venmo,
>     cashapp, stripe, their bank, or whatever."
>   - "If they choose to pay cash in person or with a check in
>     person or through the mail, they should be able to list
>     that and let the company know."
>   - "As soon as the payment is cleared, they will get a final
>     receipt emailed to them, and they can always come back to
>     the site and put their invoice number in again to see the
>     details, though this time it will be marked as paid."
>   - "Now, if they pay with check or cash, someone in office
>     will have to close it out and mark it as paid and send
>     the receipt."
>   - "Please build out the entire front end payment page too,
>     but don't wire to it yet."
>   - "I don't want the payment page to go live yet. We will
>     have to set up our bank account with everything. We use
>     PNC banking."
>   - "Once daddy or someone in charge of payouts has approved
>     the totals at the end of each week, the employees will
>     have the money hit their preferred method."
>   - "If they are paid cash, then there needs to be a way to
>     mark that or note that and record it."
>   - "We also need to be able to give out one time payments
>     for bonuses."
>   - "Top notch security."

## Top-level diagnosis

Two parallel payment surfaces, both currently non-existent:

### A. Customer payments (inbound)

Customers pay an invoice through `/pay`:
1. Enter invoice number → look up
2. See job details + total due + payment status
3. Choose payment method:
   - Stripe (credit card / ACH)
   - Venmo (deep link to `@StarrSurveying`)
   - CashApp (deep link to `$StarrSurveying`)
   - Zelle (info card + Pay button)
   - Bank ACH (manual instructions)
   - Cash or check (pledge, office closes out manually)
4. Receipt emailed when payment clears
5. Return to `/pay` later, re-enter invoice number, see "Paid"

### B. Employee payouts (outbound)

End-of-week:
1. Office staff compute totals per employee (hours + bonuses + reimbursements)
2. Daddy (or designated payout admin) reviews + approves the batch
3. System fires payouts via each employee's preferred method:
   - Venmo / CashApp / Zelle (deep link OR API where available)
   - ACH (PNC business → employee bank)
   - Cash (recorded as paid; physical handoff offline)
4. Per-employee + per-payout audit trail; 1099-NEC / W-2 friendly

Both surfaces share schema (the `payments` table) but have
different roles, RLS, and UX.

## Architecture decisions

- **Stripe is the primary online processor.** Card + ACH +
  Apple Pay / Google Pay. Why: PCI scope offloaded, Tax + 1099
  reporting included, webhooks for clear status.
- **Venmo / CashApp / Zelle are deep-link only at first.** They
  don't have official Node SDKs for general business payments.
  The page generates a deep link the customer clicks; we then
  wait for the customer to mark "I sent it" + office confirms
  via the platform's transaction log. Reconciliation is manual
  until Stripe Atlas-style integrations exist.
- **PNC ACH** via a bank-issued API OR via Stripe Treasury OR
  via a manual NACHA file uploaded weekly. Path TBD when the
  bank account is set up; the schema models it generically as
  `payout_method = 'bank_ach'` + `payout_provider = 'pnc'`.
- **Cash + check are first-class statuses**, not edge cases.
  The customer-facing portal lets the customer self-declare a
  cash/check pledge; the office closes out via a one-click
  "Mark paid in cash/check" action that triggers the same
  receipt email.
- **Page is built but not wired.** The `/pay` route renders the
  full flow with stubbed handlers (each method's submit button
  shows a toast that says "Wiring coming after PNC setup").
  This is explicit per the user ask.

## Slice plan

### Foundations (P1–P3)

| Slice | What ships |
|---|---|
| **P1** ✅ | **Schema foundations.** Five seeds: invoices, payments, payment_intents, payment_attempts, payment_receipts. Status enums per the diagnosis. Per-table RLS. Indexes on invoice_number lookup, status filters, employee/customer scoping. Org_id default Starr per the SaaS pivot pattern. Includes a unique constraint on invoice_number + a public-facing slug column (so the customer URL doesn't leak sequential ids). _Shipped in `seeds/323_payment_foundations.sql` — five tables, eight-method CHECK shared across `payments` + `payment_attempts`, partial index on the office close-out queue (`pledged` / `pending_confirmation`), one shared `payments_set_updated_at` trigger across the mutable tables, RLS + service-role policy on every table. Source-locked by `__tests__/admin/payment-foundations.test.ts`._ |
| **P2** ✅ | **Employee payment methods schema** — `employee_payment_methods` table (employee_email, kind, handle, is_primary, verified, created_at). Kinds: venmo / cashapp / zelle / ach / cash. Encrypted-at-rest handles for ACH (account number + routing) via PGCrypto pgcrypto extension; everything else plaintext (Venmo handles are public). _Shipped in `seeds/324_employee_payment_methods.sql` — keyed by `user_email` (matches existing employee tables), CHECK enforces handle-vs-ACH-vs-cash shape, partial unique index pins one primary per user, partial unique index prevents duplicate public handles per `(user, kind)`. ACH stored as `BYTEA` via `pgp_sym_encrypt` SQL helpers (`encrypt_ach_secret` / `decrypt_ach_secret`) keyed by env `PAYMENT_ENCRYPTION_KEY` — key never lives in the DB. RLS: service-role full access + employee-self-read gated by `auth.jwt()->>email`. Source-locked by `__tests__/admin/payment-employee-methods.test.ts`._ |
| **P3** | **Customer contact methods on invoices.** When the office generates an invoice for a job, snapshot the customer's email + phone + address at that moment so receipts always go somewhere valid even if the lead's contact info changes later. |

### Customer-facing portal (P4–P10)

| Slice | What ships |
|---|---|
| **P4** | **`/pay` landing + invoice lookup.** Front-end-only at first. Customer enters invoice number → calls `GET /api/public/invoice/<number>` which returns job summary, total due, status. Shows a payment-options card. Stripe form stubbed. Other methods show deep link / instructions. Styled per the Starr brand (red/navy gradient header, Inter body, matching `/contact` look). Mobile-first (most customers will pay on a phone). |
| **P5** | **Stripe Elements integration.** Card + ACH. Backend creates a PaymentIntent on form submit. On `succeeded` webhook, mark invoice paid + send receipt. Test mode by default until PNC + Stripe live keys are set. |
| **P6** | **Deep-link payment options.** Venmo / CashApp / Zelle. Each method renders an info card with the company handle, a "Pay $X.XX" button that opens the platform with a prefilled note (`Invoice <number> — Starr Surveying`), and a "I sent it" follow-up button. Submitting "I sent it" creates a `payment_attempts` row in `pending_confirmation` status; office sees it on a queue page and confirms via the platform's app. |
| **P7** | **Cash / check pledge.** Customer picks "I'll pay in cash" or "Check by mail". Creates a `payment_attempts` row in `pledged` status; sends them a confirmation email with the company mailing address + a reminder that the receipt arrives once the office logs the payment. Office closes via P10. |
| **P8** | **Return-to-portal status view.** Customer types invoice number; if paid, shows a "Paid in full ✓" card with the date paid, method, transaction id (or "Cash payment in office"), and a "Download receipt" button. |
| **P9** | **Receipt PDF + email.** When a payment clears, generate a PDF via a serverless renderer (the existing Resend-HTML email infrastructure also works for the body; PDF attaches the bytes). Stored in a new private `receipts` storage bucket; receipt URL is signed + sent. |
| **P10** | **Office close-out tool.** New `/admin/payments/inbox` page lists pending cash/check pledges + venmo/cashapp/zelle "I sent it" confirmations. Each row has a one-click "Mark cleared" action that flips the payment status, triggers the receipt pipeline, and notifies the customer. |

### Employee payouts (P11–P16)

| Slice | What ships |
|---|---|
| **P11** | **Weekly payout batch UI.** `/admin/payouts/runs` lists past batches; "New batch" wizard pulls every employee's outstanding hours + bonuses + reimbursements for a date range, lets the office adjust per-employee totals, then submits as a `payout_batch` row in `draft` status. |
| **P12** | **Approval flow.** Designated payout-admin (today: daddy / Hank) reviews a draft batch and clicks "Approve". Status → `approved`. Approval signature stored (admin email + timestamp + IP). Unapproved batches can't fan out. |
| **P13** | **Outbound dispatch — per-method.** Each employee's preferred method dictates the dispatch path:<br>- **Stripe Connect / Treasury** (when wired) — instant payouts to a verified bank.<br>- **Venmo / CashApp / Zelle** — generate a deep-link list the payout admin works through one tap at a time, marking each as sent.<br>- **Cash** — generate a single "cash to hand out" list; admin physically distributes + marks each as paid.<br>- **Bank ACH (manual NACHA)** — generate a NACHA-compliant batch file the office uploads to PNC's portal. |
| **P14** | **Per-payout audit trail.** Every payout row tracks `attempted_at`, `cleared_at`, `method`, `external_ref` (Venmo transaction id, NACHA file id, etc.), `notes`. Visible on the employee's profile page. |
| **P15** | **One-time bonuses + reimbursements.** Outside the weekly batch, the office can fire a single ad-hoc payout to an employee (bonus check, expense reimbursement). Same approval flow, same audit trail. |
| **P16** | **Tax reporting prep.** Annual + quarterly export — list every payout per employee in a 1099-friendly + W-2-friendly format. Stripe Tax handles the Stripe Connect path automatically when wired; manual exports cover Venmo / cash / NACHA. |

### Security + compliance (P17–P19)

| Slice | What ships |
|---|---|
| **P17** | **Secrets handling.** Bank account numbers + ACH routing numbers encrypted at rest via pgcrypto (`pgp_sym_encrypt` keyed by `PAYMENT_ENCRYPTION_KEY` env var). Encryption key rotation script. No card numbers ever touch the database — Stripe Elements tokenises in the browser; we only store the Stripe payment_intent id. Audit-log every read of the encrypted columns. |
| **P18** | **RLS audit.** Every payment + payout + invoice table gates SELECT/UPDATE to either service_role (admin paths) or row-owner-by-email (employee viewing own payout history). Customer-facing `/pay` reads through a service-role API path with an invoice-number-required gate (no enumeration). |
| **P19** | **PCI scope review.** Document the boundary: Stripe = SAQ A scope, all other methods (Venmo / CashApp / Zelle / cash / check) = out-of-scope for PCI. Note explicitly in the docs/security file. |

### Polish + QA (P20–P22)

| Slice | What ships |
|---|---|
| **P20** | **Customer portal styling pass.** Three styling passes per the user spec — verify mobile (one-thumb tap targets), tablet, desktop. Brand-consistent header. Status-pill colors for paid/pending/overdue. Loading skeletons. Error states for invalid invoice numbers. Accessibility: WCAG AA contrast, keyboard nav, screen-reader labels. |
| **P21** | **Admin portal styling pass.** Three passes on the office surfaces — payment inbox, payout batch builder, audit views. Same polish bar. |
| **P22** | **Full QA + bug review (3–4 passes per user spec).** End-to-end smoke test of every payment method + every payout method + every receipt path. Check edge cases: zero-amount invoice, refunds, partial payments, voided invoices, bounced ACH, customer pays before the office closes the manual hold, double-clicked Pay button. |

## Notes locked from the spec

- **Do NOT enable any real-money path before PNC + Stripe live
  keys are explicitly wired.** Every payment-clearing route
  short-circuits to a "Not yet enabled — set up PNC first"
  response until a `PAYMENTS_LIVE=true` env flag is set.
- **`invoice_number` is the customer-facing token.** Generated
  per job (e.g. `SS-260618-A1B2`), printed on physical
  invoices, used as the lookup key on `/pay`. Office can
  regenerate (rare — only when a customer typo-can't-find).
- **Cash + check stay first-class.** The portal lets customers
  pledge; the office closes out. The receipt email fires the
  same regardless of method so the customer always gets a
  paper trail.
- **Employee payment-method storage is sensitive.** ACH gets
  the encrypted-column treatment; Venmo / CashApp / Zelle
  handles are not secret (they're public on those platforms)
  but still gated behind the employee's own profile.
- **Daddy's approval is required.** The approval flow has only
  one role today (`payout_admin`); future expansion (multi-
  admin sign-off, threshold-based escalation) is out of scope
  but the schema doesn't preclude it.
- **No automated tax filing.** The exports support a tax
  preparer or Stripe Tax — we don't file directly.
- **No customer accounts.** Customer auth via invoice number
  alone keeps the UX one-step. If a customer pays multiple
  invoices, they enter each number separately.

## Files / surfaces touched

- `seeds/320_invoices.sql` through `seeds/3XX_*` — schema
  foundations for each slice.
- `app/pay/page.tsx` + `app/pay/[invoice]/page.tsx` — public
  payment surface (LIVE: never; STAGED: yes).
- `app/api/public/invoice/[number]/route.ts` — read-only
  invoice lookup.
- `app/api/admin/payments/*` — close-out + audit routes.
- `app/api/admin/payouts/*` — batch + approval + dispatch
  routes.
- `app/admin/payments/inbox/page.tsx` — office close-out queue.
- `app/admin/payouts/runs/page.tsx` — weekly batch UI.
- `lib/payments/*` — Stripe client, deep-link builders,
  receipt PDF, audit helpers, encryption helpers.
- `lib/payouts/*` — NACHA writer, Venmo/CashApp/Zelle deep
  link builders, batch math.
- `docs/security/payments-pci-scope.md` — PCI + tax + AML
  notes.
