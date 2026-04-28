-- seeds/234_starr_field_job_equipment_fk.sql
--
-- Phase F10.0a-ii: link job_equipment rows back to equipment_inventory.
--
-- Today's `job_equipment` table (per
-- app/api/admin/jobs/equipment/route.ts) has free-text columns:
-- equipment_name, equipment_type, serial_number. Two dispatchers
-- can each "check out" the same Trimble S9 to two different jobs
-- and the schema doesn't notice — the row is essentially an audit
-- log, not a reservation system.
--
-- §5.12.2 migration sketch: add an FK column
-- `equipment_inventory_id UUID REFERENCES equipment_inventory(id)`
-- alongside the existing free-text fields (kept for historical rows
-- + ad-hoc entries). The §5.12.5 conflict-detection engine + the
-- §5.12.6 check-in/out flow read through the FK to enforce the
-- "this exact unit is in use" rule.
--
-- The free-text columns stay in place because:
--   1. Historical job_equipment rows pre-date the inventory ledger
--      and we don't want to invent FKs for archive data.
--   2. Some short-lived ad-hoc gear (a borrowed item from a sister
--      firm — §5.12.11.A) doesn't earn an inventory row but should
--      still appear on the job's loadout. equipment_borrowed_in
--      lands later as its own table; until then, free-text covers it.
--
-- Apply AFTER seeds/233. Idempotent.
--
-- Subsequent F10.0a sub-batches:
--   * 235 — equipment_kits + equipment_kit_items
--   * 236 — equipment_events audit log
--   * 237 — equipment_templates + items + versions

BEGIN;

-- ── 1. The FK column ───────────────────────────────────────────────────────
-- Nullable — historical rows + ad-hoc free-text entries pass NULL.
-- ON DELETE SET NULL because retiring an inventory unit shouldn't
-- nuke its historical assignment trail. Soft-delete via the §5.12.1
-- `retired_at` is the contract; the FK is for live rows only.
ALTER TABLE job_equipment
  ADD COLUMN IF NOT EXISTS equipment_inventory_id UUID;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'job_equipment_inventory_fk'
     ) THEN
    ALTER TABLE job_equipment
      ADD CONSTRAINT job_equipment_inventory_fk
        FOREIGN KEY (equipment_inventory_id)
        REFERENCES equipment_inventory(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2. Index for join + reverse-lookup hot paths ───────────────────────────
-- The §5.12.7.2 reservations Gantt timeline groups by inventory id;
-- the §5.12.7.3 inventory drilldown shows "which jobs has this unit
-- been assigned to?" Both want this column indexed.
CREATE INDEX IF NOT EXISTS idx_job_equipment_inventory_id
  ON job_equipment (equipment_inventory_id)
  WHERE equipment_inventory_id IS NOT NULL;

-- Composite index for "which inventory unit is currently checked
-- out to which job?" — the §5.12.6 check-in lookup needs this.
-- `returned_at IS NULL` is the existing column from the live route
-- that marks an open assignment.
CREATE INDEX IF NOT EXISTS idx_job_equipment_open_assignments
  ON job_equipment (equipment_inventory_id, job_id)
  WHERE equipment_inventory_id IS NOT NULL
    AND returned_at IS NULL;

COMMIT;
