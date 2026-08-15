-- ============================================================================
-- 592_vehicle_mpg_and_fuel_price.sql
--
-- C0b2 of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
--
-- Owner, 2026-08-15: mileage becomes manual per job/trip — start address, job
-- address, distance calculated, "and then that will use the miles per gallon to
-- calculate the cost as well".
--
-- Two things that did not exist are added here:
--   1. `vehicles.mpg` — the figure the fuel cost is computed from.
--   2. an `app_settings` row keyed 'mileage' — the org-wide fuel price, so a
--      price change is one edit rather than a number retyped on every trip.
--
-- ── WHY THE FUEL COST IS NOT STORED ON THE TRIP AS THE ONLY MONEY FIGURE ────
--
-- `mileage_entries` (seed 282) already values a trip at `rate_cents_per_mile`,
-- the IRS business rate, and `total_cents` is a GENERATED column over it. That
-- number is what the firm reimburses and what /admin/payouts/tax-report reads.
--
-- A fuel-cost estimate answers a different question — what the trip actually
-- cost in fuel — and the two are not interchangeable. Replacing the rate with a
-- fuel figure would silently change reimbursement and tax reporting, so the fuel
-- columns are ADDITIVE and the existing money path is untouched. Retiring the
-- IRS figure stays available later as a deliberate decision.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + ON CONFLICT DO NOTHING, so a re-run is
-- a no-op rather than an error or a reset of an edited price.
-- ============================================================================

BEGIN;

-- ── 1. Per-vehicle fuel economy ─────────────────────────────────────────────
-- NUMERIC(5,2): 999.99 mpg is far past any real vehicle and leaves room for
-- electric equivalents (MPGe) if those are ever recorded here.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS mpg NUMERIC(5,2) CHECK (mpg IS NULL OR mpg > 0);

COMMENT ON COLUMN public.vehicles.mpg IS
  'Miles per gallon, used to estimate a trip''s fuel cost. NULL = unknown, in which case the trip form shows the reimbursement only rather than inventing a cost.';

-- ── 2. Trip-level fuel figures, alongside the reimbursement ─────────────────
-- Snapshots, not references: a trip logged in March must keep March''s fuel
-- price and the MPG the vehicle had then. `rate_cents_per_mile` on this table
-- is already a snapshot for exactly this reason — these follow the same rule.
ALTER TABLE public.mileage_entries
  ADD COLUMN IF NOT EXISTS start_address        TEXT,
  ADD COLUMN IF NOT EXISTS end_address          TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_id           UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mpg_snapshot         NUMERIC(5,2) CHECK (mpg_snapshot IS NULL OR mpg_snapshot > 0),
  ADD COLUMN IF NOT EXISTS fuel_price_cents     INTEGER CHECK (fuel_price_cents IS NULL OR fuel_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS fuel_cost_cents      INTEGER CHECK (fuel_cost_cents IS NULL OR fuel_cost_cents >= 0),
  ADD COLUMN IF NOT EXISTS distance_source      TEXT
    CHECK (distance_source IS NULL OR distance_source IN ('typed','lookup','odometer'));

COMMENT ON COLUMN public.mileage_entries.fuel_cost_cents IS
  'Estimated fuel cost for the trip: miles / mpg_snapshot * fuel_price_cents. ADDITIVE to total_cents (the IRS reimbursement) — it does not replace it.';
COMMENT ON COLUMN public.mileage_entries.distance_source IS
  'How `miles` was arrived at: typed by hand, looked up from the two addresses, or derived from odometer readings (the pre-2026-08-15 capture path).';

-- Historical rows predate the address capture, so they are marked as what they
-- actually were rather than left ambiguous. Only rows with no source set.
UPDATE public.mileage_entries
   SET distance_source = 'odometer'
 WHERE distance_source IS NULL;

-- ── 3. Org-wide fuel price ──────────────────────────────────────────────────
-- 389¢/gal is a placeholder the owner is expected to edit; it exists so the
-- form has a working default instead of a blank that reads as broken.
INSERT INTO public.app_settings (key, value, updated_by)
VALUES ('mileage', '{"fuelPriceCents": 389}'::jsonb, 'seed:592')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Verification:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'vehicles' AND column_name = 'mpg';                    -- 1 row
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'mileage_entries'
--      AND column_name IN ('start_address','end_address','vehicle_id',
--                          'mpg_snapshot','fuel_price_cents','fuel_cost_cents',
--                          'distance_source');                                 -- 7 rows
--   SELECT value->>'fuelPriceCents' FROM public.app_settings WHERE key='mileage';  -- 389
--   SELECT DISTINCT distance_source FROM public.mileage_entries;               -- 'odometer' for pre-existing rows
