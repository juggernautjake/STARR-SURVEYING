-- seeds/244_starr_field_equipment_nag_silence.sql
--
-- Phase F10.5-f-i — `nag_silenced_until` column on
-- equipment_reservations. Drives the §5.12.6 "Mark in transit"
-- inline action on the 6pm/9pm overdue-gear notification.
--
-- Two extend-flavoured user actions on the nag:
--
--   * "Extend until tomorrow 8am" → moves reserved_to forward.
--     The F10.5-d endpoint handles this; the nag query
--     (`reserved_to < now()`) naturally excludes the row once
--     reserved_to is in the future, so no extra column needed.
--
--   * "Mark in transit" → the surveyor is driving the gear
--     back right now; they don't want a 9pm nag if 6pm just
--     fired and they'll be at the office in 30 minutes. This
--     column captures the silence window. The F10.5-f-ii cron
--     query adds `AND (nag_silenced_until IS NULL OR
--     nag_silenced_until < now())` so silenced rows are
--     skipped until the silence expires (typically midnight
--     of the silence day).
--
-- Apply AFTER seeds/239 (which created the table).
-- Idempotent.

BEGIN;

ALTER TABLE equipment_reservations
  ADD COLUMN IF NOT EXISTS nag_silenced_until TIMESTAMPTZ;

-- Sanity guard — silence windows must be in the future when
-- set; otherwise the column is meaningless. NULL = no silence.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_nag_silence_chk'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_nag_silence_chk
        CHECK (
          nag_silenced_until IS NULL
          OR nag_silenced_until > created_at
        );
  END IF;
END $$;

-- The nag cron's hottest query is "every checked_out row past
-- reserved_to AND not silenced." The seeds/242
-- idx_equipment_reservations_overdue index already covers
-- reserved_to + state='checked_out'; this partial index makes
-- the silence-aware refinement a quick AND on a covered field.
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_nag_silence_active
  ON equipment_reservations (nag_silenced_until)
  WHERE state = 'checked_out' AND nag_silenced_until IS NOT NULL;

COMMENT ON COLUMN equipment_reservations.nag_silenced_until IS
  'Set by the F10.5-f-iii "Mark in transit" action on the 6pm/9pm overdue-gear notification. Cron skips silenced rows until the timestamp passes (typically midnight of the silence day). NULL = no active silence.';

COMMIT;
