-- ============================================================================
-- 374_financial_allocation_categories.sql
--
-- Phase-2 Slice 7 of
-- docs/planning/in-progress/CUSTOMER_INVOICING_PHASE2_2026-06-21.md.
--
-- Adds the two tables the §2.2 financial-allocation system writes into:
--
--   - financial_allocation_categories — one row per spending bucket
--     ("Equipment & Supplies", "Employee Salaries", "Savings", "Investing"
--     etc.) with a target percentage of every dollar received. Dad sets
--     the percentages once in /admin/invoicing/categories (Phase-2
--     Slice 11); the allocation engine (Phase-2 Slice 8) uses them to
--     split every cleared payment automatically.
--
--   - financial_allocations — the ledger row written by the engine. One
--     row per (payment × category) pair; sum across rows for one
--     payment equals payment.amount_cents (the last-active-category
--     absorbs rounding remainder so the books always balance).
--
-- This seed also seeds every category the user named in the directive
-- ("Some of the money will be allotted to buying equipment and supplies,
-- some for travel expenses such as food and gas, some for the employees
-- salaries, some for savings, and some for investing.") PLUS the §2.2
-- proposed extras, all with target_percent = 0. Dad sets the percentages
-- before any allocation can write a non-zero row.
--
-- Depends on: seeds/323_payment_foundations.sql (the `payments` table
-- the ledger FKs to). NOT blocked by the customer_invoices rename — the
-- `payments` table is unaffected by the collision fix.
-- ============================================================================

BEGIN;

-- ── financial_allocation_categories ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_allocation_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key    TEXT UNIQUE NOT NULL,           -- snake-case stable id
  label           TEXT NOT NULL,                  -- human display name
  description     TEXT,
  target_percent  NUMERIC(5,2) NOT NULL DEFAULT 0,
  color           TEXT,                           -- '#RRGGBB' for the dashboard pill
  sort_order      INTEGER NOT NULL DEFAULT 100,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_allocation_categories_pct_chk
    CHECK (target_percent >= 0 AND target_percent <= 100)
);
CREATE INDEX IF NOT EXISTS idx_financial_allocation_categories_active_sort
  ON public.financial_allocation_categories(is_active, sort_order)
  WHERE is_active = TRUE;
COMMENT ON TABLE public.financial_allocation_categories IS
  '§2.2 + slice 7 — spending buckets with a target percentage of revenue. Dad sets the percentages; allocation engine in slice 8 splits cleared payments per these rows.';


-- ── financial_allocations (the ledger) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES public.financial_allocation_categories(id) ON DELETE RESTRICT,
  amount_cents    BIGINT NOT NULL,
  notes           TEXT,
  allocated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_allocations_amount_chk CHECK (amount_cents >= 0)
);
CREATE INDEX IF NOT EXISTS idx_financial_allocations_payment
  ON public.financial_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_financial_allocations_category_time
  ON public.financial_allocations(category_id, allocated_at DESC);

-- One row per (payment, category) — no duplicate allocations if the
-- engine is called twice on the same payment.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_financial_allocations_payment_category
  ON public.financial_allocations(payment_id, category_id);

COMMENT ON TABLE public.financial_allocations IS
  '§2.2 + slice 7 — append-only ledger written by lib/payments/allocation-engine.ts on every cleared payment. SUM(amount_cents) per payment equals payments.amount_cents (last-active-category absorbs rounding remainder).';


-- ── updated_at trigger on categories (ledger is append-only) ─────────────
CREATE OR REPLACE FUNCTION public.financial_allocation_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_financial_allocation_categories_updated
    BEFORE UPDATE ON public.financial_allocation_categories
    FOR EACH ROW EXECUTE FUNCTION public.financial_allocation_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Default categories ───────────────────────────────────────────────────
-- All start at target_percent = 0 — dad sets the actual split in the
-- Slice-11 admin editor. The seed only locks the buckets so the engine
-- has stable category_keys to reference and the reports surface every
-- intended dimension from day one.

INSERT INTO public.financial_allocation_categories
  (category_key, label, description, target_percent, color, sort_order) VALUES
  -- User-named (verbatim from the 2026-06-21 directive)
  ('equipment_supplies',   'Equipment & Supplies',
     'Total stations, GPS units, prisms, tripods, field supplies, software licenses tied to gear.',
     0, '#7C3AED', 10),
  ('travel_food_gas',      'Travel — Food & Gas',
     'Per-trip food + fuel for crew on the road. Vehicle maintenance lives in its own bucket.',
     0, '#D97706', 20),
  ('employee_salaries',    'Employee Salaries',
     'Gross pay for crew, including overtime and bonuses. Excludes owner''s draw.',
     0, '#1D3095', 30),
  ('savings',              'Savings',
     'General operating-cash reserve. Separate from emergency reserve + retirement.',
     0, '#059669', 40),
  ('investing',            'Investing',
     'Long-horizon investments — index funds, retirement contributions, brokerage.',
     0, '#0891B2', 50),

  -- §2.2 proposed additions (each documented inline; dad confirms or trims)
  ('insurance',            'Insurance',
     'General liability + vehicle + equipment + errors-and-omissions premiums.',
     0, '#DC2626', 60),
  ('office_overhead',      'Office Overhead',
     'Rent, utilities, internet, phone, software subscriptions, office supplies.',
     0, '#6B7280', 70),
  ('vehicle_maintenance',  'Vehicle Maintenance',
     'Oil changes, tires, repairs, registration. Fuel lives in Travel.',
     0, '#0F1419', 80),
  ('professional_dev',     'Professional Development',
     'RPLS CEUs, training, conferences, professional society dues.',
     0, '#7C2D12', 90),
  ('licenses_renewals',    'Licenses & Renewals',
     'RPLS license, business permits, vehicle registration, county filings.',
     0, '#A16207', 100),
  ('accounting',           'Accounting & Bookkeeping',
     'CPA, bookkeeper, tax prep, payroll service.',
     0, '#475569', 110),
  ('legal',                'Legal',
     'Attorney fees, contract review, regulatory consultation.',
     0, '#4B5563', 120),
  ('marketing',            'Marketing & Advertising',
     'Website, ads, business cards, signage, sponsorships.',
     0, '#9333EA', 130),
  ('quarterly_taxes',      'Quarterly Estimated Taxes',
     'Set aside for IRS estimated payments BEFORE owner''s draw. Federal + state.',
     0, '#B91C1C', 140),
  ('emergency_reserve',    'Emergency Reserve',
     'Target ≥3 months operating expenses, held in a separate account. NOT general savings.',
     0, '#15803D', 150),
  ('owner_draw',           'Owner''s Draw',
     'Cash dad takes home personally. After taxes + business expenses.',
     0, '#1D3095', 160),
  ('healthcare',           'Healthcare & Benefits',
     'Premiums, HSA contributions, employee benefits if/when extended.',
     0, '#EA580C', 170),
  ('charitable',           'Charitable Giving',
     'Donations + sponsorships (separate from marketing).',
     0, '#16A34A', 180)
ON CONFLICT (category_key) DO NOTHING;

COMMIT;
