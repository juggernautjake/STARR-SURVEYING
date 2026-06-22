-- ============================================================================
-- 364_equipment_assignments.sql
--
-- E1 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md — a DIRECT check-out/check-in
-- ledger for the equipment manager. The existing equipment_reservations system
-- is job-dispatch bound (requires job_id); this is the simpler day-to-day flow:
-- lend an item to a crew member, load it on a vehicle, or send it to
-- maintenance, with condition tracking — no job required.
--
-- One OPEN assignment per item at a time (partial unique index), so an item can
-- never be double-checked-out. Closing an assignment (checked_in_at set) frees
-- the item. The API mirrors current_status on equipment_inventory and writes
-- the equipment_events audit log.
--
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.equipment_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id       UUID NOT NULL REFERENCES public.equipment_inventory(id) ON DELETE CASCADE,

  -- Who/what it's checked out to.
  assigned_kind      TEXT NOT NULL CHECK (assigned_kind IN ('crew', 'vehicle', 'maintenance', 'other')),
  assigned_user_id   UUID,                                                   -- crew member (auth.users); plain UUID like reservations
  assigned_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  assigned_label     TEXT,                                                   -- free text: team name, vendor, reason

  -- Check-out.
  checked_out_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_by     UUID,
  checkout_condition TEXT CHECK (checkout_condition IN ('good', 'fair', 'damaged')),
  checkout_notes     TEXT,
  expected_back_at   TIMESTAMPTZ,

  -- Check-in (NULL checked_in_at = still out).
  checked_in_at      TIMESTAMPTZ,
  returned_by        UUID,
  return_condition   TEXT CHECK (return_condition IN ('good', 'fair', 'damaged', 'lost')),
  return_notes       TEXT,
  consumed_quantity  INT CHECK (consumed_quantity IS NULL OR consumed_quantity >= 0),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.equipment_assignments IS
  'Direct (non-job) equipment check-out/check-in ledger for the equipment manager.';

-- At most ONE open assignment per item — structural guarantee against
-- double-checkout.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_equipment_assignments_open
  ON public.equipment_assignments (equipment_id)
  WHERE checked_in_at IS NULL;

-- "What's out right now" + per-item history.
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_open
  ON public.equipment_assignments (checked_in_at)
  WHERE checked_in_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_equipment
  ON public.equipment_assignments (equipment_id, checked_out_at DESC);

-- updated_at trigger.
CREATE OR REPLACE FUNCTION public.equipment_assignments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS equipment_assignments_updated_at ON public.equipment_assignments;
CREATE TRIGGER equipment_assignments_updated_at
  BEFORE UPDATE ON public.equipment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.equipment_assignments_set_updated_at();

-- RLS — service-role only (all access is route-mediated by the admin API).
ALTER TABLE public.equipment_assignments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY service_role_full_access_equipment_assignments
    ON public.equipment_assignments FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Verification:
--   SELECT to_regclass('public.equipment_assignments');
