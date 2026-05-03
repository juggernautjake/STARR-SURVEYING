-- seeds/250_starr_field_equipment_tax_elections.sql
--
-- Phase F10.9 (slice 2) — `equipment_tax_elections` table:
-- per-asset per-year frozen depreciation snapshot. The
-- §5.12.10 lock-year ritual writes one row per active asset
-- per tax year, freezing the depreciation_method, the
-- per-year amount, and the running accumulated total. Once
-- locked, the row is immutable so the Schedule C numbers
-- stay reproducible audit-side.
--
-- Drives:
--   * §5.12.10 lock-equipment-depreciation button on
--     /admin/finances (mirrors Batch QQ mark-exported).
--   * Tax summary endpoint extension — reads this table
--     for locked years; computes on the fly for unlocked.
--   * §5.12.10 Asset Detail Schedule PDF + CSV export.
--
-- Apply AFTER seeds/249 (which adds the depreciation_method
-- column the elections enum mirrors). Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS equipment_tax_elections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The asset this snapshot is about. ON DELETE CASCADE so a
  -- hard-deleted asset (rare — soft-delete is the contract via
  -- retired_at) drops its tax history with it. Tax history
  -- without an asset is unreferencable.
  equipment_id  UUID NOT NULL,

  -- The fiscal year this snapshot covers. Stored as INT
  -- (2026, 2027, ...) so date arithmetic is trivial.
  tax_year      INT NOT NULL CHECK (tax_year >= 2000),

  -- Snapshot of the method at lock time. Could differ from the
  -- equipment_inventory.depreciation_method column if the EM
  -- changed it mid-year (e.g. switched a unit from MACRS-7 to
  -- §179 expensing). The locked snapshot is what the IRS sees;
  -- the live column is what the next year computes from.
  depreciation_method TEXT NOT NULL
    CHECK (depreciation_method IN (
      'section_179',
      'straight_line',
      'macrs_5yr',
      'macrs_7yr',
      'bonus_first_year',
      'none'
    )),

  -- The dollars depreciated FOR this tax year (Schedule C Line
  -- 13 contribution). Stored as cents BIGINT to match the
  -- §5.11 receipts ledger.
  depreciation_amount_cents BIGINT NOT NULL
    CHECK (depreciation_amount_cents >= 0),

  -- Running total of every prior year's depreciation_amount_
  -- cents PLUS this year's. Surfaces in the Asset Detail
  -- Schedule "accumulated depreciation" column without a join.
  accumulated_depreciation_cents BIGINT NOT NULL
    CHECK (accumulated_depreciation_cents >= 0),

  -- The cost basis the calc started from. Typically a copy of
  -- acquired_cost_cents at acquisition; stored on the snapshot
  -- so a later edit to acquired_cost_cents doesn't retroactively
  -- change a locked year's numbers.
  basis_cents BIGINT NOT NULL
    CHECK (basis_cents >= 0),

  -- When the lock ritual fired. Once set, the row is treated as
  -- immutable by the application (no schema-level enforcement —
  -- a SECURITY-DEFINER trigger would be heavy-handed for a
  -- single-bookkeeper team; trust the UI).
  locked_at TIMESTAMPTZ,

  -- Actor email of the person who hit the lock button. Kept
  -- alongside locked_at so the audit story is one row.
  locked_by TEXT,

  -- Free-form context. Vendor-supplied "they switched from MACRS
  -- to §179 for tax-loss harvesting" or "section 179 election
  -- prorated 80% biz use 20% personal."
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── FK to equipment_inventory ───────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_tax_elections_equipment_fk'
     ) THEN
    ALTER TABLE equipment_tax_elections
      ADD CONSTRAINT equipment_tax_elections_equipment_fk
        FOREIGN KEY (equipment_id)
        REFERENCES equipment_inventory(id)
        ON DELETE CASCADE;
  END IF;
END $$;

-- ── Uniqueness: one snapshot per (asset, year) ──────────────────
-- Belt-and-suspenders against a double-lock ritual that would
-- otherwise create duplicate frozen rows.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_tax_elections_unique_per_year'
  ) THEN
    ALTER TABLE equipment_tax_elections
      ADD CONSTRAINT equipment_tax_elections_unique_per_year
      UNIQUE (equipment_id, tax_year);
  END IF;
END $$;

-- ── Read-path indexes ───────────────────────────────────────────
-- "Show me the locked 2026 schedule" — the dominant Schedule C
-- generator query.
CREATE INDEX IF NOT EXISTS idx_equipment_tax_elections_year
  ON equipment_tax_elections (tax_year DESC, locked_at);

-- "Per-asset depreciation history" — drives the Asset Detail
-- Schedule per-row drilldown.
CREATE INDEX IF NOT EXISTS idx_equipment_tax_elections_asset_year
  ON equipment_tax_elections (equipment_id, tax_year DESC);

-- ── updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION equipment_tax_elections_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_tax_elections_touch_updated_at
  ON equipment_tax_elections;
CREATE TRIGGER trg_equipment_tax_elections_touch_updated_at
  BEFORE UPDATE ON equipment_tax_elections
  FOR EACH ROW EXECUTE FUNCTION equipment_tax_elections_touch_updated_at();

COMMENT ON TABLE equipment_tax_elections IS
  'Phase F10.9 — per-asset per-year frozen depreciation snapshot. The §5.12.10 lock-year ritual writes one row per active asset per tax year; once locked_at IS NOT NULL the row is treated as immutable by the application so the Schedule C numbers stay reproducible audit-side.';

COMMIT;
