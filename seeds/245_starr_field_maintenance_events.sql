-- seeds/245_starr_field_maintenance_events.sql
--
-- Phase F10.5-g-i — `maintenance_events` table per §5.12.8.
-- The data model for service occurrences (calibration / repair /
-- firmware / inspection / cleaning / scheduled service / damage
-- triage / vendor recall / software license).
--
-- The §5.12.6 damage / lost triage hooks (F10.5-g-ii + g-iii)
-- INSERT a single row here with origin='damaged_return' or
-- 'lost_returned' when /check-in receives condition='damaged' or
-- 'lost'. The full F10.7 maintenance phase will layer on:
--   * maintenance_event_documents (cert PDFs, work orders)
--   * maintenance_schedules (recurring annual cal triggers)
--   * /admin/equipment/maintenance calendar UI
--   * The 3am cron that auto-creates due-date events
--
-- Apply AFTER seeds/233 (equipment_inventory) + seeds/236
-- (equipment_events — has a maintenance_event_id UUID column
-- with no FK; this seed wires it).
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS maintenance_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- XOR target: exactly one of these two columns is non-null.
  -- Vehicles flow through the same maintenance pipeline as gear
  -- so the EM has one calendar to manage.
  equipment_inventory_id   UUID,
  vehicle_id               UUID,

  -- §5.12.8 enum: what kind of work.
  kind TEXT NOT NULL
    CHECK (kind IN (
      'calibration',
      'repair',
      'firmware_update',
      'inspection',
      'cleaning',
      'scheduled_service',
      'damage_triage',
      'recall',
      'software_license'
    )),

  -- §5.12.8 enum: why this event was created. The F10.5-g-ii
  -- damage-triage path uses 'damaged_return'; the F10.5-g-iii
  -- lost path uses 'lost_returned'. The other origins land in
  -- F10.7 when the recurring-schedule + cert-expiring crons
  -- ship.
  origin TEXT NOT NULL
    CHECK (origin IN (
      'recurring_schedule',
      'damaged_return',
      'manual',
      'vendor_recall',
      'cert_expiring',
      'lost_returned'
    )),

  -- Lifecycle.
  state TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (state IN (
      'scheduled',
      'in_progress',
      'awaiting_parts',
      'awaiting_vendor',
      'complete',
      'cancelled',
      'failed_qa'
    )),

  -- Planning + actuals.
  scheduled_for     TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  -- When the gear should be available again — drives the
  -- §5.12.5 reservation hard-block + the §5.12.7.2 timeline
  -- shading. Equipment Manager edits as the work progresses.
  expected_back_at  TIMESTAMPTZ,

  -- Vendor fields (third-party work).
  vendor_name        TEXT,
  vendor_contact     TEXT,
  vendor_work_order  TEXT,

  -- In-shop work — Equipment Manager or designee. Mutually
  -- exclusive with vendor_name when kind='calibration' because
  -- a NIST cert requires a third-party (enforced at the route
  -- layer in F10.7; not in the DB to keep the schema simple
  -- for damage_triage rows that may have neither set yet).
  performed_by_user_id  UUID,

  cost_cents          BIGINT,
  linked_receipt_id   UUID,

  -- Required short summary for list views ("Annual NIST cal
  -- sent to Trimble Service Houston" / "Damaged on return —
  -- triage pending").
  summary  TEXT NOT NULL,
  notes    TEXT,

  qa_passed    BOOLEAN,
  next_due_at  TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- XOR target: exactly one of equipment_inventory_id or vehicle_id
-- is non-null.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_events_target_xor_chk'
  ) THEN
    ALTER TABLE maintenance_events
      ADD CONSTRAINT maintenance_events_target_xor_chk
        CHECK (
          (equipment_inventory_id IS NOT NULL AND vehicle_id IS NULL)
          OR
          (equipment_inventory_id IS NULL AND vehicle_id IS NOT NULL)
        );
  END IF;
END $$;

-- ── FKs (conditional on referenced tables existing) ───────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'maintenance_events_inventory_fk'
     ) THEN
    ALTER TABLE maintenance_events
      ADD CONSTRAINT maintenance_events_inventory_fk
        FOREIGN KEY (equipment_inventory_id)
        REFERENCES equipment_inventory(id)
        ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'vehicles')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'maintenance_events_vehicle_fk'
     ) THEN
    ALTER TABLE maintenance_events
      ADD CONSTRAINT maintenance_events_vehicle_fk
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_events_performed_by_fk'
  ) THEN
    ALTER TABLE maintenance_events
      ADD CONSTRAINT maintenance_events_performed_by_fk
        FOREIGN KEY (performed_by_user_id)
        REFERENCES auth.users(id)
        ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_events_created_by_fk'
  ) THEN
    ALTER TABLE maintenance_events
      ADD CONSTRAINT maintenance_events_created_by_fk
        FOREIGN KEY (created_by)
        REFERENCES auth.users(id)
        ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'receipts')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'maintenance_events_receipt_fk'
     ) THEN
    ALTER TABLE maintenance_events
      ADD CONSTRAINT maintenance_events_receipt_fk
        FOREIGN KEY (linked_receipt_id)
        REFERENCES receipts(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- ── Read-path indexes ─────────────────────────────────────────
-- Per-unit history (the §5.12.7.3 inventory drilldown's
-- "service history" tab).
CREATE INDEX IF NOT EXISTS idx_maintenance_events_inventory
  ON maintenance_events (equipment_inventory_id, created_at DESC)
  WHERE equipment_inventory_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_events_vehicle
  ON maintenance_events (vehicle_id, created_at DESC)
  WHERE vehicle_id IS NOT NULL;

-- Calendar query: "every event scheduled in the next 30 days."
CREATE INDEX IF NOT EXISTS idx_maintenance_events_scheduled
  ON maintenance_events (scheduled_for)
  WHERE state IN ('scheduled', 'in_progress', 'awaiting_parts', 'awaiting_vendor');

-- "Open work" landing-page view.
CREATE INDEX IF NOT EXISTS idx_maintenance_events_open
  ON maintenance_events (state, expected_back_at)
  WHERE state IN ('scheduled', 'in_progress', 'awaiting_parts', 'awaiting_vendor');

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION maintenance_events_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maintenance_events_touch_updated_at
  ON maintenance_events;
CREATE TRIGGER trg_maintenance_events_touch_updated_at
  BEFORE UPDATE ON maintenance_events
  FOR EACH ROW EXECUTE FUNCTION maintenance_events_touch_updated_at();

-- ── Backfill the deferred FK from seeds/236 ───────────────────
-- equipment_events.maintenance_event_id was created without a
-- FK so the events table could ship before this one. Add it
-- now (ON DELETE SET NULL — deleting the maintenance row leaves
-- the audit-event row pointing nowhere, which is the right
-- behaviour for chain-of-custody continuity).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_events')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_events_maintenance_event_fk'
     ) THEN
    ALTER TABLE equipment_events
      ADD CONSTRAINT equipment_events_maintenance_event_fk
        FOREIGN KEY (maintenance_event_id)
        REFERENCES maintenance_events(id)
        ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
