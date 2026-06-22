-- ============================================================================
-- 365_vehicle_condition.sql
--
-- E5 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md — vehicle condition tracking.
-- The vehicles table only had name/plate/VIN/active; the equipment manager
-- needs to track each truck's condition + odometer + inspection history.
--
-- Adds the current-condition snapshot to `vehicles` (so the fleet list shows it
-- at a glance) and a `vehicle_condition_logs` history table (every inspection /
-- condition update is an append-only row).
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS condition TEXT
    CHECK (condition IS NULL OR condition IN ('excellent', 'good', 'fair', 'poor', 'out_of_service')),
  ADD COLUMN IF NOT EXISTS odometer_miles    INTEGER,
  ADD COLUMN IF NOT EXISTS last_inspected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS condition_notes   TEXT;

CREATE TABLE IF NOT EXISTS public.vehicle_condition_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  condition       TEXT NOT NULL
                    CHECK (condition IN ('excellent', 'good', 'fair', 'poor', 'out_of_service')),
  odometer_miles  INTEGER,
  notes           TEXT,
  logged_by       TEXT,            -- email of who logged it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_condition_logs_vehicle
  ON public.vehicle_condition_logs (vehicle_id, created_at DESC);

ALTER TABLE public.vehicle_condition_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY service_role_full_access_vehicle_condition_logs
    ON public.vehicle_condition_logs FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Verification:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='vehicles' AND column_name IN ('condition','odometer_miles','last_inspected_at','condition_notes');
--   SELECT to_regclass('public.vehicle_condition_logs');
