-- seeds/239_starr_field_equipment_reservations.sql
--
-- Phase F10.3-a — equipment_reservations + sync triggers.
--
-- This is the schema foundation for §5.12.5 (availability +
-- conflict-detection engine). One row per (job × instrument ×
-- window) — the source of truth every availability lookup reads.
--
-- Why a dedicated table instead of just stamping
-- equipment_inventory.current_status='in_use'? The naïve flag
-- model only knows *right now*. Real planning happens days /
-- weeks ahead ("Friday morning crew needs an S9; Thursday's job
-- runs late and an S9 gets stuck on-site overnight"). The
-- reservation table models time windows so the dispatcher can
-- ask "is Kit #3 free Friday 8am-noon?" and get a deterministic
-- answer.
--
-- The four "is this assignable?" checks (the engine that runs
-- against this table — implemented in F10.3-b's lib):
--   1. Status check on equipment_inventory.current_status
--   2. Reservation overlap (this table — GiST exclusion below)
--   3. Calibration / certification gate
--   4. Stock check (consumables — quantity_on_hand vs need)
--
-- Race safety is structural, not code-side: the GiST EXCLUDE
-- constraint below blocks two overlapping `held` / `checked_out`
-- rows from ever co-existing for the same instrument. Two
-- dispatchers racing to reserve Kit #3 → second insert raises
-- a constraint violation, which the F10.3-c POST handler turns
-- into a typed `reserved_for_other_job` conflict.
--
-- Apply AFTER seeds/233 (equipment_inventory v2), 234 (FK to
-- jobs), 236 (events table — gets a deferred FK below), 237
-- (templates — for from_template_id audit ref).
--
-- Idempotent (CREATE … IF NOT EXISTS, conditional ALTERs).
-- Subsequent F10 sub-phases keep their seed numbers per
-- seeds/238's plan: 240 personnel, 241 maintenance, 242 tax,
-- 243 photo bucket.

BEGIN;

-- ── 0. Required Postgres extension ────────────────────────────
-- btree_gist powers the GiST exclusion below — it lets us mix
-- the equipment_inventory_id equality check with the tstzrange
-- overlap (`&&`) operator inside a single EXCLUDE. The extension
-- ships with Postgres core; CREATE EXTENSION is a no-op on
-- environments where it's already installed.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. equipment_reservations table ───────────────────────────
CREATE TABLE IF NOT EXISTS equipment_reservations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Specific unit. Category-of-kind requests resolve to a
  -- specific unit at reserve-time (NOT at apply-time) per
  -- §5.12.5 — so reservations always pin a real instrument and
  -- the timeline view never has "some kit, TBD" rows.
  equipment_inventory_id   UUID NOT NULL,

  -- Job this reservation belongs to. ON DELETE CASCADE so
  -- cancelling / deleting a job releases all of its locks; the
  -- §5.12.11.K litigation trail still survives via the
  -- equipment_events rows that snapshot reservation_id at the
  -- moment they were written.
  job_id                   UUID NOT NULL,

  -- Audit trail to the template that produced this reservation.
  -- Stored verbatim per §5.12.3 — the template can version /
  -- archive freely afterwards and we still know exactly which
  -- snapshot drove this gear pick.
  from_template_id         UUID,
  from_template_version    INT,

  -- The reservation window. Defaults wired in F10.3-c's POST
  -- handler from the job's scheduled start/end + a 1h overrun
  -- grace per the §5.12.5 worked example.
  reserved_from            TIMESTAMPTZ NOT NULL,
  reserved_to              TIMESTAMPTZ NOT NULL,
  CHECK (reserved_to > reserved_from),

  -- Lifecycle. The §5.12.6 morning/evening QR scans flip
  -- 'held' → 'checked_out' → 'returned'. 'cancelled' is the
  -- pre-checkout dispatcher pull-back path.
  state                    TEXT NOT NULL
    CHECK (state IN ('held', 'checked_out', 'returned', 'cancelled')),

  -- Physical-event timestamps recorded at scan moments
  -- (§5.12.6). NULL until the corresponding scan happens.
  actual_checked_out_at    TIMESTAMPTZ,
  actual_returned_at       TIMESTAMPTZ,

  -- Free-text notes — substitution reason, soft-override
  -- justification (F10.3-e prefixes 'OVERRIDE: '), damage
  -- callout, etc. Indexed via tsvector when full-text search
  -- lands as v2 polish.
  notes                    TEXT,

  reserved_by              UUID NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. The race-safe overlap guard ────────────────────────────
-- This is the structural guarantee §5.12.5 asks for. Postgres
-- itself blocks two ACTIVE ('held'/'checked_out') reservations
-- for the same instrument from ever overlapping in time. The
-- F10.3-c POST handler still wraps the insert in a
-- transaction + SELECT…FOR UPDATE on the inventory row so the
-- error surfaces as a clean typed conflict instead of a raw
-- 23P01, but the EXCLUDE is the actual race fence — application
-- code can never lose this race even on a buggy retry path.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_no_active_overlap'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_no_active_overlap
        EXCLUDE USING gist (
          equipment_inventory_id WITH =,
          tstzrange(reserved_from, reserved_to, '[)') WITH &&
        )
        WHERE (state IN ('held', 'checked_out'));
  END IF;
END $$;

-- ── 3. FKs — conditional on referenced tables existing ────────
-- Same defensive pattern seeds/234 + 236 use. Lets the seed
-- pipeline run on environments where some tables haven't shipped.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_reservations_inventory_fk'
     ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_inventory_fk
        FOREIGN KEY (equipment_inventory_id)
        REFERENCES equipment_inventory(id)
        ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'jobs')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_reservations_job_fk'
     ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_job_fk
        FOREIGN KEY (job_id)
        REFERENCES jobs(id)
        ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_templates')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_reservations_template_fk'
     ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_template_fk
        FOREIGN KEY (from_template_id)
        REFERENCES equipment_templates(id)
        ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_reserved_by_fk'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_reserved_by_fk
        FOREIGN KEY (reserved_by)
        REFERENCES auth.users(id)
        ON DELETE RESTRICT;
  END IF;
END $$;

-- ── 4. Indexes for the read paths ─────────────────────────────
-- Range-overlap lookups by instrument: the F10.3-b availability
-- engine's hottest query.
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_unit_window
  ON equipment_reservations
  USING gist (
    equipment_inventory_id,
    tstzrange(reserved_from, reserved_to, '[)')
  )
  WHERE state IN ('held', 'checked_out');

-- "What's locked right now or in the future for this instrument?"
-- Drives the inventory drilldown timeline + the §5.12.7
-- reconcile dashboard.
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_active_by_unit
  ON equipment_reservations (equipment_inventory_id, reserved_from)
  WHERE state IN ('held', 'checked_out');

-- Reverse lookup: every reservation for a job (apply-flow
-- preview, cancel-job cleanup, audit reports).
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_job
  ON equipment_reservations (job_id, reserved_from);

-- "Who reserved what when" — admin audit / reporting.
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_reserved_by
  ON equipment_reservations (reserved_by, created_at DESC);

-- ── 5. Derived columns on equipment_inventory ─────────────────
-- Kept in sync by triggers (§6 below) so availability lookups
-- stay one-table fast for the §5.12.7.1 Today landing-page card.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS next_available_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_reservation_id UUID;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_inventory_current_reservation_fk'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_current_reservation_fk
        FOREIGN KEY (current_reservation_id)
        REFERENCES equipment_reservations(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- Hot-path index on the "currently reserved" flag — the §5.12.7
-- reconcile dashboard reads `WHERE current_reservation_id IS NOT NULL`.
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_current_reservation
  ON equipment_inventory (current_reservation_id)
  WHERE current_reservation_id IS NOT NULL;

-- ── 6. Sync trigger — keep derived cols current ───────────────
-- Recomputes next_available_at + current_reservation_id whenever
-- reservations change for a unit. Two writers max per inventory
-- row per reservation event (one for the affected unit on
-- INSERT/UPDATE, one for the previous unit if equipment_inventory_id
-- moved on UPDATE — extremely rare but covered).
CREATE OR REPLACE FUNCTION equipment_reservations_sync_inventory()
RETURNS TRIGGER AS $$
DECLARE
  unit_ids UUID[] := ARRAY[]::UUID[];
  uid UUID;
  active_now UUID;
  next_at TIMESTAMPTZ;
BEGIN
  -- Collect every inventory row potentially affected by this change.
  IF TG_OP = 'INSERT' THEN
    unit_ids := ARRAY[NEW.equipment_inventory_id];
  ELSIF TG_OP = 'UPDATE' THEN
    unit_ids := ARRAY[NEW.equipment_inventory_id];
    IF OLD.equipment_inventory_id IS DISTINCT FROM NEW.equipment_inventory_id THEN
      unit_ids := unit_ids || OLD.equipment_inventory_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    unit_ids := ARRAY[OLD.equipment_inventory_id];
  END IF;

  FOREACH uid IN ARRAY unit_ids LOOP
    -- Active reservation that owns the unit at now() (if any).
    SELECT id INTO active_now
      FROM equipment_reservations
     WHERE equipment_inventory_id = uid
       AND state IN ('held', 'checked_out')
       AND tstzrange(reserved_from, reserved_to, '[)') @> now()
     ORDER BY reserved_from ASC
     LIMIT 1;

    -- Earliest moment the unit is free again.
    -- NULL = available right now AND no future locks.
    IF active_now IS NULL THEN
      -- No active reservation touching now() — but there could
      -- still be a future one. Surface its start as the "free
      -- until" hint, otherwise NULL = free indefinitely.
      SELECT reserved_from INTO next_at
        FROM equipment_reservations
       WHERE equipment_inventory_id = uid
         AND state IN ('held', 'checked_out')
         AND reserved_from > now()
       ORDER BY reserved_from ASC
       LIMIT 1;
      -- If a future lock exists, next_available_at points AT it
      -- (the unit is free up until that moment). The §5.12.5
      -- engine reads this as "free now, busy after T."
      -- If no future lock, next_at stays NULL.
    ELSE
      -- The unit is locked right now. next_available_at = the
      -- end of the latest contiguous active window covering now()
      -- (so chained back-to-back reservations roll forward as a
      -- single "busy until" answer).
      WITH RECURSIVE chain AS (
        SELECT id, reserved_from, reserved_to
          FROM equipment_reservations
         WHERE id = active_now
        UNION ALL
        SELECT r.id, r.reserved_from, r.reserved_to
          FROM equipment_reservations r
          JOIN chain c
            ON r.equipment_inventory_id = uid
           AND r.state IN ('held', 'checked_out')
           AND r.reserved_from <= c.reserved_to
           AND r.reserved_to > c.reserved_to
      )
      SELECT MAX(reserved_to) INTO next_at FROM chain;
    END IF;

    UPDATE equipment_inventory
       SET current_reservation_id = active_now,
           next_available_at = next_at
     WHERE id = uid;
  END LOOP;

  RETURN NULL;  -- AFTER trigger; return value is ignored.
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_reservations_sync_inventory
  ON equipment_reservations;
CREATE TRIGGER trg_equipment_reservations_sync_inventory
  AFTER INSERT OR UPDATE OR DELETE ON equipment_reservations
  FOR EACH ROW EXECUTE FUNCTION equipment_reservations_sync_inventory();

-- updated_at bookkeeping. Mirrors the helper from earlier seeds
-- — defined inline here so this seed is self-contained.
CREATE OR REPLACE FUNCTION equipment_reservations_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_reservations_touch_updated_at
  ON equipment_reservations;
CREATE TRIGGER trg_equipment_reservations_touch_updated_at
  BEFORE UPDATE ON equipment_reservations
  FOR EACH ROW EXECUTE FUNCTION equipment_reservations_touch_updated_at();

-- ── 7. Backfill the deferred FK from seeds/236 ────────────────
-- equipment_events.reservation_id was created without a FK so
-- the events table could ship before this one. Add the FK now.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_events')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_events_reservation_fk'
     ) THEN
    ALTER TABLE equipment_events
      ADD CONSTRAINT equipment_events_reservation_fk
        FOREIGN KEY (reservation_id)
        REFERENCES equipment_reservations(id)
        ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
