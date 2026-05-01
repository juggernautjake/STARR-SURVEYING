-- seeds/242_starr_field_equipment_check_inout.sql
--
-- Phase F10.5-a — schema additions for the §5.12.6 daily
-- check-in / check-out workflow. seeds/239 already shipped
-- actual_checked_out_at + actual_returned_at on
-- equipment_reservations; this seed adds the remaining columns
-- the morning-scan and evening-scan endpoints need.
--
-- Two scan moments:
--   * Morning check-out flips reservation state='held' →
--     'checked_out'. Records WHO scanned, WHO received the
--     gear, WHICH vehicle, the condition + optional photo.
--   * Evening check-in flips 'checked_out' → 'returned'.
--     Records WHO scanned the return in, condition + optional
--     photo, optional damage / loss notes, and (consumables
--     only) consumed_quantity.
--
-- Plus the end-of-day nag affordances:
--   * extended_overnight_at — surveyor tapped "Keep overnight"
--     during clock-out OR the in-app "Extend until tomorrow
--     8am" button on a 6pm/9pm nag notification.
--   * extended_until — when the nag-extend action moves
--     reserved_to forward, we keep the original reserved_to in
--     metadata so the audit trail shows the schedule slipped
--     vs. running long mid-job.
--
-- Apply AFTER seeds/239. Idempotent.

BEGIN;

-- ── 1. Check-out columns ──────────────────────────────────────
ALTER TABLE equipment_reservations
  ADD COLUMN IF NOT EXISTS checked_out_by         UUID,
  ADD COLUMN IF NOT EXISTS checked_out_to_user    UUID,
  ADD COLUMN IF NOT EXISTS checked_out_to_vehicle UUID,
  ADD COLUMN IF NOT EXISTS checked_out_condition  TEXT,
  ADD COLUMN IF NOT EXISTS checked_out_photo_url  TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_checkout_condition_chk'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_checkout_condition_chk
        CHECK (
          checked_out_condition IS NULL
          OR checked_out_condition IN ('good', 'fair', 'damaged')
        );
  END IF;
END $$;

-- ── 2. Check-in columns ───────────────────────────────────────
ALTER TABLE equipment_reservations
  ADD COLUMN IF NOT EXISTS returned_by           UUID,
  ADD COLUMN IF NOT EXISTS returned_condition    TEXT,
  ADD COLUMN IF NOT EXISTS returned_photo_url    TEXT,
  ADD COLUMN IF NOT EXISTS returned_notes        TEXT,
  ADD COLUMN IF NOT EXISTS consumed_quantity     INT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_return_condition_chk'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_return_condition_chk
        CHECK (
          returned_condition IS NULL
          OR returned_condition IN ('good', 'fair', 'damaged', 'lost')
        );
  END IF;
END $$;

-- consumed_quantity must be non-negative when set. Null = not
-- a consumable line OR check-in hasn't happened yet.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_consumed_qty_chk'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_consumed_qty_chk
        CHECK (consumed_quantity IS NULL OR consumed_quantity >= 0);
  END IF;
END $$;

-- ── 3. Nag-extend columns ────────────────────────────────────
ALTER TABLE equipment_reservations
  ADD COLUMN IF NOT EXISTS extended_overnight_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_reserved_to   TIMESTAMPTZ;

-- ── 4. FKs (conditional on referenced tables) ─────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_checked_out_by_fk'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_checked_out_by_fk
        FOREIGN KEY (checked_out_by)
        REFERENCES auth.users(id)
        ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_checked_out_to_user_fk'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_checked_out_to_user_fk
        FOREIGN KEY (checked_out_to_user)
        REFERENCES auth.users(id)
        ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_returned_by_fk'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_returned_by_fk
        FOREIGN KEY (returned_by)
        REFERENCES auth.users(id)
        ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'vehicles')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_reservations_checked_out_to_vehicle_fk'
     ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_checked_out_to_vehicle_fk
        FOREIGN KEY (checked_out_to_vehicle)
        REFERENCES vehicles(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- ── 5. Read-path indexes ──────────────────────────────────────
-- "What's in my truck right now" — drives §5.12.9 surveyor view.
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_checked_out_to_user
  ON equipment_reservations (checked_out_to_user, state)
  WHERE state = 'checked_out' AND checked_out_to_user IS NOT NULL;

-- End-of-day nag query: "every checked_out row past reserved_to."
-- The cron at 6pm/9pm runs this every tick.
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_overdue
  ON equipment_reservations (reserved_to)
  WHERE state = 'checked_out';

-- Damage triage routing — admin dashboard panel.
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_damaged
  ON equipment_reservations (actual_returned_at DESC)
  WHERE returned_condition IN ('damaged', 'lost');

-- Vehicle drilldown — "what's loaded on Truck #2 right now?"
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_vehicle_active
  ON equipment_reservations (checked_out_to_vehicle, state)
  WHERE state = 'checked_out' AND checked_out_to_vehicle IS NOT NULL;

-- ── 6. Documentation hooks ────────────────────────────────────
COMMENT ON COLUMN equipment_reservations.checked_out_by IS
  'User who scanned the gear out (Equipment Manager OR an authorised crew lead per §5.12.6 self-service after-hours).';
COMMENT ON COLUMN equipment_reservations.checked_out_to_user IS
  'Crew member receiving the gear — often same as checked_out_by, but a crew lead can scan-out for a junior surveyor.';
COMMENT ON COLUMN equipment_reservations.consumed_quantity IS
  'Consumables only. reserved_quantity - returned_quantity = consumed; NULL until check-in.';
COMMENT ON COLUMN equipment_reservations.extended_overnight_at IS
  'Set by the clock-out modal "Keep overnight" action OR the 6pm/9pm nag "Extend until tomorrow 8am" button. NULL = on schedule.';
COMMENT ON COLUMN equipment_reservations.original_reserved_to IS
  'Captured the first time reserved_to is bumped via nag-extend so the audit trail shows the schedule slipped vs ran long. NULL = never extended.';

COMMIT;
