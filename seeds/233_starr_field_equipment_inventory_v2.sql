-- seeds/233_starr_field_equipment_inventory_v2.sql
--
-- Phase F10.0a-i: equipment_inventory extensions (§5.12.1).
--
-- The live Supabase has `equipment_inventory` already (extracted
-- per scripts/snapshot-existing-schema.sql) with columns: name,
-- equipment_type, brand, model, serial_number, notes. That shape
-- is fine for the existing /api/admin/jobs/equipment route but
-- doesn't carry any of the §5.12 planning that turns inventory
-- into a real ledger:
--
--   * No status (in-use / available / maintenance / lost / retired)
--   * No QR-code identity for the §5.12.6 scan-in/scan-out flow
--   * No cost basis / depreciation hooks for the §5.12.10 tax tie-in
--   * No calibration / warranty fields the §5.12.7.4 dashboard reads
--   * No durable / consumable / kit distinction (§5.12.1.A/B/C)
--   * No soft-delete (every other Phase F2/F6 table has one — and
--     retiring a $40k total station should keep depreciation history
--     queryable)
--
-- This seed extends the table in place. ALL columns are nullable so
-- the migration is non-blocking against existing rows; the admin
-- UI (Phase F10.1) backfills as the Equipment Manager walks the
-- cage with the new fields.
--
-- Apply AFTER seeds/220-232. Idempotent — every ALTER guards on
-- existence; the CHECK constraints + indexes wrap in DO $$ blocks.
--
-- Subsequent F10.0a sub-batches (in their own seed files):
--   * 234 — equipment_kits + equipment_kit_items (§5.12.1.C)
--   * 235 — equipment_events audit log (§5.12.1 cross-cutting)
--   * 236 — equipment_templates + items + versions (§5.12.3)
--   * 237 — job_equipment FK back to equipment_inventory (§5.12.2)
--
-- Reservations (§5.12.5), personnel (§5.12.4), maintenance
-- (§5.12.8), and tax (§5.12.10) ship in seeds/238-241 as their
-- respective F10 sub-phases land.

BEGIN;

-- ── 1. Item-kind discriminator ──────────────────────────────────────────────
-- Three storage shapes per §5.12.1: durable+serialized (one row per
-- physical unit), consumable (one row per SKU + quantity_on_hand),
-- kit (parent row referencing children — child rows live in the
-- equipment_kit_items table that lands in seeds/234).
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS item_kind TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_inventory_item_kind_chk'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_item_kind_chk
        CHECK (item_kind IS NULL OR item_kind IN ('durable', 'consumable', 'kit'));
  END IF;
END $$;

-- ── 2. Category — open enum, indexed for category-of-kind lookups ──────────
-- §5.12.1: total_station / gps_rover / data_collector / tripod /
-- prism / level / vehicle_* / paint / lath / hubs / ribbon / etc.
-- Open string per §15 prereq #9 (Equipment Manager + surveyor agree
-- on the canonical list at onboarding); migration is permissive.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_equipment_inventory_category
  ON equipment_inventory (category)
  WHERE category IS NOT NULL;

-- ── 3. Lifecycle status — drives §5.12.5 conflict detection ────────────────
-- §5.12.1: available / in_use / maintenance / loaned_out / lost /
-- retired. The §5.12.5 status check hard-blocks reservations on any
-- non-'available' status (except 'in_use', which is checked via the
-- reservation overlap rule). 'in_transit' lands later (§5.12.11.D
-- cross-office transfer polish).
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS current_status TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_inventory_current_status_chk'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_current_status_chk
        CHECK (current_status IS NULL OR current_status IN (
          'available', 'in_use', 'maintenance',
          'loaned_out', 'lost', 'retired'
        ));
  END IF;
END $$;

-- Partial index for the §5.12.7.1 Today landing-page "currently
-- available" filter — by far the hottest read.
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_available
  ON equipment_inventory (category)
  WHERE current_status = 'available';

-- ── 4. QR code identity — drives §5.12.6 scan flows ────────────────────────
-- The Equipment Manager prints stickers in batches; v1 generates
-- UUIDv7-short-form server-side. UNIQUE so a misprint that lands
-- on two units gets caught at insert time.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS qr_code_id TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_inventory_qr_code_id_unique'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_qr_code_id_unique UNIQUE (qr_code_id);
  END IF;
END $$;

-- ── 5. Cost basis + depreciation hooks (§5.12.10 tax tie-in) ───────────────
-- These are nullable because the bulk-import flow (§5.12.11.H) lets
-- the Equipment Manager backfill cost from old vendor invoices over
-- time. depreciation_method defaults populated by the §5.12.10
-- receipt-promotion modal when the receipt path lands.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS acquired_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acquired_cost_cents BIGINT,
  ADD COLUMN IF NOT EXISTS useful_life_months  INT,
  ADD COLUMN IF NOT EXISTS placed_in_service_at DATE;

-- ── 6. Calibration + warranty + service tracking (§5.12.7.4 calendar) ──────
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS last_calibrated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_calibration_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warranty_expires_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS service_contract_vendor TEXT,
  ADD COLUMN IF NOT EXISTS last_serviced_at        TIMESTAMPTZ;

-- Partial index for the §5.12.5 calibration-overdue check + the
-- §5.12.7.4 "due in 60 days" feed. Sorted ASC so cron picks the
-- soonest-due row first.
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_calibration_due
  ON equipment_inventory (next_calibration_due_at ASC)
  WHERE next_calibration_due_at IS NOT NULL
    AND current_status NOT IN ('retired', 'lost');

-- ── 7. Consumable accounting (§5.12.1.B) ───────────────────────────────────
-- Used only when item_kind='consumable'; durable units leave NULL.
-- The §5.12.6 check-in flow's `consumed_quantity` decrements
-- quantity_on_hand server-side via a trigger that lands when the
-- check-in/check-out tables ship (seeds/238 reservations).
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS unit                 TEXT,
  ADD COLUMN IF NOT EXISTS quantity_on_hand     INT,
  ADD COLUMN IF NOT EXISTS low_stock_threshold  INT,
  ADD COLUMN IF NOT EXISTS last_restocked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor               TEXT,
  ADD COLUMN IF NOT EXISTS cost_per_unit_cents  INT;

-- §5.12.7.5 low-stock dashboard hot path.
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_low_stock
  ON equipment_inventory (quantity_on_hand)
  WHERE item_kind = 'consumable'
    AND low_stock_threshold IS NOT NULL
    AND quantity_on_hand <= low_stock_threshold;

-- ── 8. Home location — where the gear lives when not deployed ──────────────
-- §5.12.1: free-text label today (e.g. "Truck 3", "Cage shelf B2").
-- Per §5.12.11.D cross-office migration sketch, this becomes a FK
-- to an offices table when Starr opens a second location. v1: text.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS home_location TEXT;

-- Optional cross-link to the existing vehicles table for "this kit
-- lives on Truck 3 by default" — surfaced on the §5.12.7.1 loadout
-- view. NULL when the gear lives in the cage rather than a vehicle.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'vehicles')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'equipment_inventory'
         AND column_name = 'vehicle_id'
     ) THEN
    ALTER TABLE equipment_inventory
      ADD COLUMN vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 9. Personal kit flag (§5.12.9.4) ───────────────────────────────────────
-- Surveyor-owned tools that should NOT enter the equipment manager
-- workflow but ARE tracked for visibility. Excluded from §5.12.10
-- depreciation rollups (the tax summary filter checks is_personal=false).
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS is_personal   BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID;

-- ── 10. Soft-delete via retired_at (§5.12.1) ──────────────────────────────
-- Mirrors the receipts Batch CC pattern. Retired units stay in the
-- schema for §5.12.10 depreciation closeout + audit; the inventory
-- list filters retired_at IS NULL by default with an "include
-- retired" toggle.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS retired_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_reason  TEXT;

CREATE INDEX IF NOT EXISTS idx_equipment_inventory_active
  ON equipment_inventory (category, name)
  WHERE retired_at IS NULL;

-- ── 11. Serial-suspect flag (§5.12.11.L) ───────────────────────────────────
-- Counterfeit / fenced / recall-listed units. v1 manual flag; v2
-- polish wires a vendor fraud-database check at insert time.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS serial_suspect BOOLEAN DEFAULT false NOT NULL;

-- ── 12. Audit timestamps ───────────────────────────────────────────────────
-- The existing table may or may not have these — the live snapshot
-- doesn't list them but the existing /api/admin/jobs/equipment route
-- returns rows ordered by created_at. Defensive add.
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

COMMIT;
