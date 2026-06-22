-- ============================================================================
-- 363_mock_customer_invoices.sql
--
-- S8 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — clearly-marked TEST invoices
-- so the owner can click through the full /pay flow + every upfront scenario.
--
-- All are tagged "[TEST]" in customer_name and use readable public slugs, so
-- they're trivial to spot in /admin/invoicing and delete:
--
--   DELETE FROM public.customer_invoices WHERE invoice_number LIKE 'TEST-%';
--
-- Idempotent — ON CONFLICT (invoice_number) DO NOTHING.
-- ============================================================================

BEGIN;

INSERT INTO public.customer_invoices
  (id, invoice_number, public_slug, customer_name, customer_email,
   line_items, subtotal_cents, tax_cents, total_cents,
   deposit_type, deposit_value, deposit_amount_cents, status, issued_at)
VALUES
  -- 1. No upfront — customer may pay any amount up to $1,000.
  ('a0000000-0000-4000-a000-000000000001', 'TEST-0001', 'test-no-upfront',
   '[TEST] No Upfront', 'test+none@example.com',
   '[{"description":"Boundary survey","quantity":1,"unit_price_cents":100000,"total_cents":100000}]'::jsonb,
   100000, 0, 100000, 'none', NULL, 0, 'issued', NOW()),

  -- 2. 25% upfront on $2,000 → first payment must be >= $500.
  ('a0000000-0000-4000-a000-000000000002', 'TEST-0002', 'test-25pct',
   '[TEST] 25% Upfront', 'test+pct@example.com',
   '[{"description":"ALTA survey","quantity":1,"unit_price_cents":200000,"total_cents":200000}]'::jsonb,
   200000, 0, 200000, 'percent', 25, 50000, 'issued', NOW()),

  -- 3. Fixed $500 upfront on $1,200 → first payment must be >= $500.
  ('a0000000-0000-4000-a000-000000000003', 'TEST-0003', 'test-fixed500',
   '[TEST] $500 Upfront', 'test+fixed@example.com',
   '[{"description":"Topographic survey","quantity":1,"unit_price_cents":120000,"total_cents":120000}]'::jsonb,
   120000, 0, 120000, 'fixed', 500, 50000, 'issued', NOW()),

  -- 4. Zero-dollar invoice → "no balance due" card.
  ('a0000000-0000-4000-a000-000000000004', 'TEST-0004', 'test-zero',
   '[TEST] Zero Dollar', 'test+zero@example.com',
   '[{"description":"Courtesy review","quantity":1,"unit_price_cents":0,"total_cents":0}]'::jsonb,
   0, 0, 0, 'none', NULL, 0, 'issued', NOW()),

  -- 5. Voided → /pay returns 410 (not available).
  ('a0000000-0000-4000-a000-000000000005', 'TEST-0005', 'test-voided',
   '[TEST] Voided', 'test+voided@example.com',
   '[{"description":"Cancelled job","quantity":1,"unit_price_cents":80000,"total_cents":80000}]'::jsonb,
   80000, 0, 80000, 'none', NULL, 0, 'voided', NOW()),

  -- 6. Partially paid — $750 of $1,500 cleared, 50% upfront already met.
  ('a0000000-0000-4000-a000-000000000006', 'TEST-0006', 'test-partpaid',
   '[TEST] Partially Paid', 'test+partial@example.com',
   '[{"description":"Construction staking","quantity":1,"unit_price_cents":150000,"total_cents":150000}]'::jsonb,
   150000, 0, 150000, 'percent', 50, 75000, 'partial', NOW())
ON CONFLICT (invoice_number) DO NOTHING;

-- The partial fixture needs a cleared payment so the balance reads $750.
INSERT INTO public.payments
  (invoice_id, amount_cents, method, status, external_provider, cleared_at, notes)
SELECT 'a0000000-0000-4000-a000-000000000006', 75000, 'check', 'succeeded', 'manual', NOW(), '[TEST] seed payment'
WHERE NOT EXISTS (
  SELECT 1 FROM public.payments
  WHERE invoice_id = 'a0000000-0000-4000-a000-000000000006' AND notes = '[TEST] seed payment'
);

COMMIT;
