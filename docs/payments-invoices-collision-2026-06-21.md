# `invoices` table-name collision — reconciliation spec (2026-06-21)

> **Status: BLOCKED on a human decision — deliberately not auto-applied.**
> This touches live Stripe payment processing; a wrong split breaks real
> billing or real customer payments. Everything needed to execute is below;
> it just needs a go-ahead + a test pass.

## The problem

Two unrelated features share the table name `public.invoices`:

| | Feature A — **SaaS/Stripe billing** | Feature B — **customer job invoicing (`/pay`)** |
|---|---|---|
| Schema | `stripe_invoice_id, number, amount_due_cents, amount_paid_cents, hosted_invoice_url, period_start/end, payment_intent_id…` | `invoice_number, public_slug, line_items, subtotal_cents, total_cents, issued_at, due_at, paid_at…` (seed 323) |
| Live DB | **This is what's live** (19 cols, populated by Stripe sync) | Never created — collides, so seed 323 fails |
| Code | `app/api/admin/billing/invoices/route.ts`, `app/api/platform/customers/[orgId]/route.ts`, the **subscription-invoice** branch of `app/api/webhooks/stripe/route.ts` | `app/pay/[invoice]/page.tsx`, all `app/api/public/invoice/[number]/**`, `app/api/admin/invoices/**`, `app/api/admin/payment-attempts/**`, `lib/payments/**`, and the **customer-payment** branch of `webhooks/stripe` (lines ~390-425: `total_cents`, `paid_at`, `payments` table) |

Because live `invoices` is Feature A's schema, **Feature B (`/pay`) is entirely
broken on live** — every query for `invoice_number`/`public_slug`/`total_cents`
errors — and seeds **323–327** can't apply (323 fails at
`CREATE INDEX … (status, issued_at)` because `issued_at` doesn't exist).

## The fix (rename Feature B to its own namespace)

Feature A keeps `invoices` (it owns the live data). Feature B moves to
`customer_invoices` + keeps its already-unique helper tables (`payments`,
`payment_intents`, `payment_attempts`, `payment_receipts` — these do NOT
collide and create fine once 323 runs).

1. **Seeds.** In `seeds/323_payment_foundations.sql` (and 324–327) rename
   every `public.invoices` → `public.customer_invoices` (table def, FKs from
   payments/intents/attempts/receipts, indexes, the `payments_set_updated_at`
   trigger loop array, RLS policy names). Then `npm run db:seed:all` applies
   323–327 cleanly.
2. **Code — repoint ONLY Feature B** `.from('invoices')` → `.from('customer_invoices')`:
   - `app/api/public/invoice/[number]/route.ts`, `…/intent`, `…/attempt`,
     `…/receipt/route.ts`, `…/receipt/pdf/route.ts`
   - `app/api/admin/invoices/route.ts`, `…/[id]/send/route.ts`
   - `app/api/admin/payment-attempts/route.ts`, `…/[id]/clear/route.ts`
   - `app/api/admin/research/document-access/route.ts`
   - `app/pay/[invoice]/page.tsx`, `app/admin/invoices/new/page.tsx`,
     `app/admin/payments/inbox/page.tsx`
   - `lib/payments/invoice-email.ts`, `invoice-public.ts`, `receipt-pdf.ts`,
     `rls-allowlist.ts`, `stripe.ts`
3. **Webhook — the careful part.** `app/api/webhooks/stripe/route.ts` has
   BOTH meanings. The customer-payment branch (the block selecting
   `total_cents, status` and updating `paid_at`, ~lines 388-426) → repoint to
   `customer_invoices`. Leave any Stripe-subscription-invoice handling on
   `invoices`. Verify by column names, not line numbers.
4. **Leave on `invoices` (Feature A):** `app/api/admin/billing/invoices/route.ts`
   (Stripe cols) and `app/api/platform/customers/[orgId]/route.ts` (counts
   org invoices for the operator console).

## Why it's safe once done
Feature B is already 100% broken on live, so repointing it can only fix it;
Feature A is untouched. **Required test before ship:** a Stripe test-mode
payment against a `/pay/<slug>` invoice + confirm a subscription-invoice
webhook still updates billing. That test is why this isn't auto-applied.

## Decision needed from the user
"Yes, rename Feature B to `customer_invoices` and repoint the 18 sites above"
— or "the `/pay` customer-invoicing feature is deprecated; delete seeds
323-327 and the Feature-B code instead." Either is a clean resolution; both
need your call.
