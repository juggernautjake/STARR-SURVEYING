-- seeds/680_stripe_payment_lifecycle.sql — what happens to a card or bank payment after it is made.
--
-- Owner, 2026-11-10: "it is time we set up online payments for customers to pay online with card …
-- set it up however it makes the most sense." Stripe was already wired (seeds/323); what it lacked was
-- the life of a payment after the customer presses Pay:
--
--   • a bank (ACH) payment is `pending` for about four business days before it clears, and can still
--     fail — the invoice must not say paid until it clears, and must not invite a second payment;
--   • a refund, whole or part, gives money back — `refunded_cents` (a whole refund also sets status
--     `refunded`), so the balance reopens by exactly that much;
--   • a chargeback (dispute) pulls the money back while the bank decides — status `disputed`, and the
--     dispute's own id and status beside it; won → `succeeded` again.
--
-- The webhook (app/api/webhooks/stripe) writes these; the rules are lib/payments/stripe-lifecycle.ts.
-- Additive; safe twice.

alter table public.payments add column if not exists refunded_cents integer not null default 0
  check (refunded_cents >= 0);
alter table public.payments add column if not exists dispute_id text;
alter table public.payments add column if not exists dispute_status text;

-- `disputed` joins the statuses. Re-created by name, so running this twice is harmless.
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'succeeded', 'failed', 'refunded', 'voided', 'disputed'));

-- The webhook finds a payment by its Stripe PaymentIntent id on every event after the first.
create index if not exists idx_payments_external
  on public.payments (external_provider, external_id);

comment on column public.payments.refunded_cents is
  'Money given back on this payment (cents). Balance counts amount_cents - refunded_cents of succeeded payments.';
comment on column public.payments.dispute_status is
  'Stripe dispute status (warning_needs_response, needs_response, under_review, won, lost, …) while or after a chargeback.';
