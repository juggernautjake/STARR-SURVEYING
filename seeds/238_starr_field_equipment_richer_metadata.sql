-- seeds/238_starr_field_equipment_richer_metadata.sql
--
-- Phase F10 polish: equipment_inventory richer metadata.
-- Per the user's directive: *"if we get a new piece of equipment,
-- we should be able to create it. We should be able to name it,
-- add an image that shows up for it, notes for it, value of it,
-- condition of it, what team has been it has been assigned to,
-- etc."*
--
-- seeds/233 covered name, notes, value (acquired_cost_cents),
-- and a `current_status` lifecycle enum. This seed adds the
-- gaps the user called out:
--
--   1. `photo_url TEXT` — bucket-relative path to the
--      Equipment Manager's photo of the unit. Surfaces on the
--      catalogue thumbnail + drilldown. Storage bucket policy
--      ships in a follow-up seed (`seeds/243`); column lands
--      first so the API can accept the value.
--
--   2. `condition TEXT` (open-string, with a CHECK enum) —
--      physical condition distinct from current_status:
--        * `new` — fresh out of the box, never used
--        * `good` — full working order, normal wear
--        * `fair` — works but cosmetic damage / minor issues
--        * `poor` — works with caveats; needs attention soon
--        * `damaged` — dented / cracked but functional
--        * `needs_repair` — won't perform spec; route to F10.7
--          maintenance
--      Distinct from current_status because a damaged unit can
--      still be 'in_use' (mid-job — surveyor reports condition
--      at next check-in) or 'available' (Equipment Manager
--      flagged it for inspection but hasn't started a service
--      event).
--
--   3. `condition_updated_at TIMESTAMPTZ` — paired with the
--      condition column so the catalogue surfaces "last
--      condition check 47 days ago" and the §5.12.7.4 dashboard
--      can flag stale assessments.
--
-- Team / crew assignment history is NOT a new column — the
-- existing `job_equipment` table (extended with the §F10.0a-ii
-- equipment_inventory_id FK in seeds/234) already records every
-- assignment event. The §5.12.7.3 inventory drilldown will
-- surface it via a join when the page lands; no schema change
-- needed.
--
-- Apply AFTER seeds/233 + 234. Idempotent.
--
-- Subsequent F10 sub-phases keep their seed numbers shifted:
--   * 239 — equipment_reservations (was 238 in earlier plan, now F10.3)
--   * 240 — personnel skills + unavailability (was 239, now F10.4)
--   * 241 — maintenance (was 240, now F10.7)
--   * 242 — tax tie-in (was 241, now F10.9)
--   * 243 — equipment-photos storage bucket policy (new, F10 polish)

BEGIN;

ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS photo_url           TEXT,
  ADD COLUMN IF NOT EXISTS condition           TEXT,
  ADD COLUMN IF NOT EXISTS condition_updated_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_inventory_condition_chk'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_condition_chk
        CHECK (
          condition IS NULL
          OR condition IN (
            'new', 'good', 'fair', 'poor', 'damaged', 'needs_repair'
          )
        );
  END IF;
END $$;

-- Partial index for the §5.12.7.5 / inventory drilldown
-- "needs attention" filter — units that aren't 'good' or 'new'.
-- Most units sit in good/new so the partial idx stays cheap.
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_needs_attention
  ON equipment_inventory (condition, condition_updated_at DESC)
  WHERE condition IS NOT NULL
    AND condition IN ('fair', 'poor', 'damaged', 'needs_repair')
    AND retired_at IS NULL;

COMMIT;
