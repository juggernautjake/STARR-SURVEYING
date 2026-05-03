-- seeds/249_starr_field_equipment_tax_columns.sql
--
-- Phase F10.9 (slice 1) — extend existing equipment + receipts
-- tables with the columns the §5.12.10 tax + depreciation
-- tie-in needs. Schema only; the equipment_tax_elections table
-- (per-year per-asset snapshot) lands in slice 2; the
-- depreciation algorithm + receipt-promotion modal + lock-year
-- ritual ship in follow-up batches.
--
-- Schema additions on equipment_inventory (extending seeds/233's
-- §5.12.10 baseline):
--
--   linked_acquisition_receipt_id  UUID NULL — FK to receipts;
--     set when a bookkeeper-approved receipt is "promoted" to an
--     inventory row via the §5.12.10 acquisition modal.
--   depreciation_method            TEXT — section_179 |
--     straight_line | macrs_5yr | macrs_7yr | bonus_first_year |
--     none. Default 'straight_line' per §5.12.10.
--   disposed_at                    DATE — closes the books when
--     a unit retires.
--   disposal_proceeds_cents        BIGINT — sale / trade-in value.
--   disposal_kind                  TEXT — sold | traded | scrapped
--     | lost | stolen | donated. Drives the §179 recapture rules.
--   tax_year_locked_through        INT — latest tax year locked
--     via the §5.12.10 annual close ritual; mirrors Batch QQ's
--     exported_period.
--
-- Schema addition on receipts:
--
--   promoted_to_equipment_id  UUID NULL — FK to equipment_inventory.
--     Set when the receipt-promotion modal confirms; the Batch QQ
--     tax summary excludes promoted rows on the receipts side so
--     the dollars don't land twice on Schedule C.
--
-- Apply AFTER seeds/233 (equipment_inventory v2) AND seeds/220
-- (receipts). Idempotent — every ADD COLUMN guards on IF NOT
-- EXISTS; FK constraints are added in DO blocks that check
-- pg_constraint first.

BEGIN;

-- ── 1. equipment_inventory: tax + disposal columns ──────────────
ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS linked_acquisition_receipt_id UUID,
  ADD COLUMN IF NOT EXISTS depreciation_method           TEXT
    DEFAULT 'straight_line' NOT NULL,
  ADD COLUMN IF NOT EXISTS disposed_at                   DATE,
  ADD COLUMN IF NOT EXISTS disposal_proceeds_cents       BIGINT,
  ADD COLUMN IF NOT EXISTS disposal_kind                 TEXT,
  ADD COLUMN IF NOT EXISTS tax_year_locked_through       INT;

-- depreciation_method enum guard.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_inventory_depreciation_method_chk'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_depreciation_method_chk
      CHECK (depreciation_method IN (
        'section_179',
        'straight_line',
        'macrs_5yr',
        'macrs_7yr',
        'bonus_first_year',
        'none'
      ));
  END IF;
END $$;

-- disposal_kind enum guard. NULL allowed (most rows are still
-- in service). The §5.12.10 disposal-flow endpoint enforces the
-- enum at write time too.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_inventory_disposal_kind_chk'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_disposal_kind_chk
      CHECK (
        disposal_kind IS NULL
        OR disposal_kind IN (
          'sold',
          'traded',
          'scrapped',
          'lost',
          'stolen',
          'donated'
        )
      );
  END IF;
END $$;

-- linked_acquisition_receipt_id → receipts FK. ON DELETE SET NULL
-- so a deleted receipt doesn't cascade-orphan a depreciable asset
-- (the asset itself is the canonical record once promoted).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'receipts')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_inventory_acq_receipt_fk'
     ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_acq_receipt_fk
        FOREIGN KEY (linked_acquisition_receipt_id)
        REFERENCES receipts(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- Lookup index for "every asset acquired via this receipt" — used
-- by the receipt-promotion modal to detect prior promotion.
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_acq_receipt
  ON equipment_inventory (linked_acquisition_receipt_id)
  WHERE linked_acquisition_receipt_id IS NOT NULL;

-- "Show me the still-in-service depreciable fleet" filter —
-- powers the §5.12.7.7 fleet valuation page.
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_active_assets
  ON equipment_inventory (depreciation_method, placed_in_service_at)
  WHERE disposed_at IS NULL
    AND retired_at IS NULL;

-- ── 2. receipts: cross-link back to the promoted asset ──────────
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS promoted_to_equipment_id UUID;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'receipts_promoted_to_equipment_fk'
     ) THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_promoted_to_equipment_fk
        FOREIGN KEY (promoted_to_equipment_id)
        REFERENCES equipment_inventory(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- The Batch QQ tax-summary endpoint will add
--   AND promoted_to_equipment_id IS NULL
-- to its receipts side. Index speeds up that filter on the
-- annual-close run.
CREATE INDEX IF NOT EXISTS idx_receipts_unpromoted
  ON receipts (created_at DESC)
  WHERE promoted_to_equipment_id IS NULL;

-- ── Comments for the docs generator ─────────────────────────────
COMMENT ON COLUMN equipment_inventory.linked_acquisition_receipt_id IS
  'Phase F10.9 — set when a bookkeeper-approved receipt is promoted to an inventory row via the §5.12.10 acquisition modal. The receipts.promoted_to_equipment_id column is the inverse pointer.';

COMMENT ON COLUMN equipment_inventory.depreciation_method IS
  'Phase F10.9 — election from §5.12.10 enum. The depreciation worker (lands in a follow-up batch) reads this + acquired_cost_cents + placed_in_service_at to compute per-tax-year amounts.';

COMMENT ON COLUMN equipment_inventory.tax_year_locked_through IS
  'Phase F10.9 — latest tax year locked via the annual close ritual. equipment_tax_elections rows for years <= this value are immutable; mirrors Batch QQ exported_period.';

COMMENT ON COLUMN receipts.promoted_to_equipment_id IS
  'Phase F10.9 — points at the equipment_inventory row created from this receipt. The Batch QQ tax summary excludes promoted receipts so dollars do not land twice on Schedule C.';

COMMIT;
