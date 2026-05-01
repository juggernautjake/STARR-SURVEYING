-- seeds/240_starr_field_equipment_reservation_override.sql
--
-- Phase F10.3-e — soft-override schema. Adds the columns + the
-- relaxed EXCLUDE that let dispatchers force a reservation
-- against a hard block by inserting a SECOND row that explicitly
-- accepts the conflict.
--
-- Why a second row instead of a flag on the original?
--   The §5.12.5 rule is "the conflict remains visible." Both
--   reservations stay on the timeline so the Equipment Manager
--   sees Job #422 and Job #427 both pointing at Kit #3 over
--   Friday morning, and decides at the QR-scan moment which job
--   actually gets the gear. Collapsing into one row would erase
--   the original.
--
-- Schema deltas:
--   * is_override BOOLEAN NOT NULL DEFAULT false
--     Marks the row as a deliberate-conflict insert. The base
--     reservation always has false; the second row inserted by
--     the soft-override path has true.
--
--   * override_reason TEXT NULL
--     Required free-text justification (the F10.3-e POST handler
--     enforces non-empty when is_override=true; this is a NULL
--     column so that override=false rows don't carry a sentinel).
--     Stored separately from `notes` so admin queries like
--     "every override last week with reasons" don't have to
--     parse strings. The reserve handler ALSO prefixes notes
--     with 'OVERRIDE: ' for readability in the timeline UI —
--     same content, two places, deliberate.
--
--   * EXCLUDE relaxed: only fires when BOTH rows have
--     is_override=false. So:
--       (false, false) → blocked (race fence intact)
--       (false, true)  → allowed (the override accepts the
--                        conflict explicitly)
--       (true,  true)  → allowed (rare; surfaces in admin UI as
--                        "double override" with a warning)
--
-- Apply AFTER seeds/239.
-- Idempotent.

BEGIN;

-- ── 1. Schema additions ──────────────────────────────────────
ALTER TABLE equipment_reservations
  ADD COLUMN IF NOT EXISTS is_override     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- Belt-and-suspenders: when is_override=true, override_reason
-- must be non-empty. The F10.3-e route validates this before
-- inserting; the constraint is the safety net for any future
-- code path that touches the table directly.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_reservations_override_requires_reason'
  ) THEN
    ALTER TABLE equipment_reservations
      ADD CONSTRAINT equipment_reservations_override_requires_reason
        CHECK (
          is_override = false
          OR (override_reason IS NOT NULL AND length(trim(override_reason)) > 0)
        );
  END IF;
END $$;

-- ── 2. Replace the EXCLUDE with the override-aware version ───
-- Drop + recreate. The old constraint blocked any pair of
-- active rows; the new one ignores override pairs.
ALTER TABLE equipment_reservations
  DROP CONSTRAINT IF EXISTS equipment_reservations_no_active_overlap;

ALTER TABLE equipment_reservations
  ADD CONSTRAINT equipment_reservations_no_active_overlap
    EXCLUDE USING gist (
      equipment_inventory_id WITH =,
      tstzrange(reserved_from, reserved_to, '[)') WITH &&
    )
    WHERE (
      state IN ('held', 'checked_out')
      AND is_override = false
    );

-- ── 3. Admin-dashboard index — "show me every override" ──────
-- Drives the §5.12.7 reconcile dashboard's override-audit panel.
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_overrides
  ON equipment_reservations (created_at DESC)
  WHERE is_override = true;

-- ── 4. Sync trigger — override rows DO take ownership ────────
-- Override is meant to surface the conflict, but at any given
-- moment exactly one of the two rows is the "winner" — the
-- Equipment Manager picks at QR-scan time. The sync trigger
-- continues to set current_reservation_id from EITHER row;
-- which one wins comes down to "earliest reserved_from" tie-
-- break, matching the existing logic in seeds/239 (no change
-- needed there). Documented here so a future reader doesn't
-- get confused about why current_reservation_id can flip
-- between the two during overlap windows.

COMMIT;
