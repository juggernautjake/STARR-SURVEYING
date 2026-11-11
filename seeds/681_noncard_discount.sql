-- seeds/681_noncard_discount.sql — a discount for paying without a card.
--
-- Owner, 2026-11-10: "if people pay cash or [check] or whatever, they will pay the sales tax, but no
-- processing fee. If they pay with card, they will pay the processing fee." Texas Bus. & Com. Code
-- §604A.0021 forbids a card SURCHARGE but expressly allows a DISCOUNT for paying by cash, check or
-- other non-card means — so the invoice carries the CARD price, and every other way of paying gets
-- a discount equal to the card fee, 2.9% + 30¢ (lib/payments/pay-discount.ts).
--
-- A discounted payment settles MORE of the invoice than the money it carries: $1,000 by bank settles
-- a $1,030 balance. `payments.discount_cents` is that difference — balance credit, not money. So:
--   balance  = total − Σ succeeded (amount_cents + discount_cents − refunded_cents)
--   revenue  = Σ amount_cents   (unchanged: the finance reports count money received)
--
-- A cash/check/Zelle pledge records what the customer will SEND (intended_amount_cents, already
-- discounted) and the part of the invoice it settles (credit_cents) at the rate it was promised
-- (discount_bps + discount_fixed_cents), so the office's "mark cleared" credits exactly what the
-- pay page showed.
--
-- Additive; safe twice.

alter table public.payments add column if not exists discount_cents integer not null default 0
  check (discount_cents >= 0);
comment on column public.payments.discount_cents is
  'Non-card discount credited against the invoice on top of the money (cents). Balance counts amount + discount − refunded.';

alter table public.payment_attempts add column if not exists credit_cents integer
  check (credit_cents is null or credit_cents >= 0);
alter table public.payment_attempts add column if not exists discount_bps integer not null default 0
  check (discount_bps >= 0 and discount_bps <= 1000);
alter table public.payment_attempts add column if not exists discount_fixed_cents integer not null default 0
  check (discount_fixed_cents >= 0 and discount_fixed_cents <= 500);
comment on column public.payment_attempts.credit_cents is
  'How much of the invoice this pledge settles (cents). intended_amount_cents is the money to be sent; the difference is the non-card discount.';

-- Open receivables count the discount as settled, and refunds as owed again. Same columns, same order.
CREATE OR REPLACE VIEW ar_aging AS
  SELECT
    i.id,
    i.org_id,
    i.invoice_number,
    i.job_id,
    i.customer_name,
    i.customer_email,
    i.total_cents,
    COALESCE(paid.paid_cents, 0)                              AS paid_cents,
    i.total_cents - COALESCE(paid.paid_cents, 0)              AS balance_cents,
    i.issued_at,
    i.due_at,
    i.status,
    CASE
      WHEN i.due_at IS NULL THEN NULL
      ELSE GREATEST(0, (CURRENT_DATE - i.due_at::date))
    END                                                        AS days_overdue,
    CASE
      WHEN i.due_at IS NULL THEN 'no_terms'
      WHEN CURRENT_DATE <= i.due_at::date THEN 'current'
      WHEN CURRENT_DATE - i.due_at::date <= 30 THEN '1_30'
      WHEN CURRENT_DATE - i.due_at::date <= 60 THEN '31_60'
      WHEN CURRENT_DATE - i.due_at::date <= 90 THEN '61_90'
      ELSE '90_plus'
    END                                                        AS bucket
  FROM customer_invoices i
  LEFT JOIN LATERAL (
    SELECT sum(GREATEST(0, p.amount_cents + COALESCE(p.discount_cents, 0) - COALESCE(p.refunded_cents, 0))) AS paid_cents
    FROM payments p
    WHERE p.invoice_id = i.id AND p.status = 'succeeded'
  ) paid ON true
  WHERE i.status NOT IN ('voided', 'draft')
    AND i.total_cents - COALESCE(paid.paid_cents, 0) > 0;
