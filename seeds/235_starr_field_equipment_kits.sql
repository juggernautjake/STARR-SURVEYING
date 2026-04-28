-- seeds/235_starr_field_equipment_kits.sql
--
-- Phase F10.0a-iii: equipment kits — pre-bundled groupings of
-- durable + consumable inventory rows that check out as a single
-- unit (§5.12.1.C).
--
-- The motivating example from the user's directive: "Total Station
-- Kit #3" — the S9 itself, a tripod, prism + pole, data collector,
-- case, two batteries + charger. Eight pieces of metal that always
-- travel together. Without kits, the dispatcher's loadout flow has
-- to scan/check seven items per job; with kits, one QR scan flips
-- all seven children atomically (per §5.12.6).
--
-- Schema split — two paired tables:
--   * equipment_kits — thin wrapper carrying kit-only metadata
--     (description, pre-stage notes). One row per kit. FK back to
--     the kit's own row in equipment_inventory (item_kind='kit',
--     §5.12.1, seeds/233). Kept as a wrapper rather than expanding
--     equipment_inventory itself so the kit-specific fields stay
--     out of the durable-unit row format.
--   * equipment_kit_items — child join rows. One row per (kit,
--     member-equipment, quantity). The "two batteries" case
--     becomes one row with quantity=2.
--
-- Kit's `current_status` is computed on read as the worst-case of
-- its children (any child in 'maintenance' → kit reads as
-- 'maintenance'). Not stored as a column to avoid a denormalisation
-- problem; the §5.12.7.1 Today landing page derives this in the
-- Gantt query. v1 polish: a materialised view if the per-page
-- aggregation gets expensive.
--
-- Apply AFTER seeds/233 (which creates the item_kind='kit' enum
-- value on equipment_inventory).
--
-- Subsequent F10.0a:
--   * 236 — equipment_events audit log
--   * 237 — equipment_templates + items + versions

BEGIN;

-- ── 1. equipment_kits — wrapper table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The kit's own row in equipment_inventory. UNIQUE so a kit's
  -- inventory row can wrap exactly one equipment_kits entry. FK
  -- with ON DELETE CASCADE because retiring the kit's inventory
  -- row should clean up the wrapper too.
  inventory_id UUID NOT NULL UNIQUE,

  -- Kit-specific metadata that doesn't belong on the inventory row.
  description TEXT,
  pre_stage_notes TEXT,

  -- Audit timestamps.
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID
);

-- FK + CHECK guard wrapped in DO blocks so re-applying is safe even
-- if equipment_inventory was created earlier without these tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_kits_inventory_fk'
     ) THEN
    ALTER TABLE equipment_kits
      ADD CONSTRAINT equipment_kits_inventory_fk
        FOREIGN KEY (inventory_id)
        REFERENCES equipment_inventory(id)
        ON DELETE CASCADE;
  END IF;
END $$;

-- ── 2. equipment_kit_items — child join rows ──────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_kit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent kit. CASCADE so deleting a kit drops its child rows
  -- (the children themselves stay alive in equipment_inventory).
  kit_id UUID NOT NULL,

  -- The piece of inventory inside the kit. NOT NULL — every row is
  -- a real reference. Use ON DELETE RESTRICT to refuse to drop an
  -- inventory unit while it's a member of a kit; the §5.12.1
  -- soft-delete (retired_at) is the contract for "remove from active
  -- service" so kits can keep their historical composition queryable.
  child_equipment_id UUID NOT NULL,

  -- Quantity for consumable members ("two batteries"); always 1 for
  -- durable members. NOT NULL with a CHECK >= 1 so the schema can't
  -- silently drop a child by zeroing its count.
  quantity INT NOT NULL DEFAULT 1,

  -- When false, a missing/unavailable child is a soft-warning rather
  -- than a hard-block (§5.12.5). "Spare battery" is required=false;
  -- the S9 itself is required=true.
  is_required BOOLEAN NOT NULL DEFAULT true,

  -- Display ordering on the §5.12.7.3 inventory drilldown — Equipment
  -- Manager drags rows. Sparse ints (10/20/30/...) so re-ordering
  -- doesn't require renumbering everything.
  sort_order INT NOT NULL DEFAULT 0,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- A given child can only appear once in a given kit.
  CONSTRAINT equipment_kit_items_unique UNIQUE (kit_id, child_equipment_id)
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_kit_items_quantity_chk'
  ) THEN
    ALTER TABLE equipment_kit_items
      ADD CONSTRAINT equipment_kit_items_quantity_chk
        CHECK (quantity >= 1);
  END IF;
END $$;

-- FKs — separate DO blocks so each lands independently against an
-- already-extended schema.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_kit_items_kit_fk'
  ) THEN
    ALTER TABLE equipment_kit_items
      ADD CONSTRAINT equipment_kit_items_kit_fk
        FOREIGN KEY (kit_id) REFERENCES equipment_kits(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_kit_items_child_fk'
     ) THEN
    ALTER TABLE equipment_kit_items
      ADD CONSTRAINT equipment_kit_items_child_fk
        FOREIGN KEY (child_equipment_id)
        REFERENCES equipment_inventory(id)
        ON DELETE RESTRICT;
  END IF;
END $$;

-- ── 3. Indexes for the hot reads ──────────────────────────────────────────
-- Kit drilldown ("show me the children of this kit"): the FK +
-- sort_order powers the ordered child list on the §5.12.7.3
-- inventory drilldown.
CREATE INDEX IF NOT EXISTS idx_equipment_kit_items_kit
  ON equipment_kit_items (kit_id, sort_order);

-- Reverse lookup ("which kits include this inventory unit?") —
-- when an Equipment Manager retires a tripod, the §5.12.3 cleanup
-- queue needs to surface every kit that referenced it.
CREATE INDEX IF NOT EXISTS idx_equipment_kit_items_child
  ON equipment_kit_items (child_equipment_id);

COMMIT;
