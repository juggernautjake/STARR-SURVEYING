-- seeds/237_starr_field_equipment_templates.sql
--
-- Phase F10.0a-v: equipment templates — the user's headline ask
-- (§5.12.3): dispatchers create reusable bundles ("4-corner
-- residential boundary, total station") and apply them to new jobs
-- in one tap.
--
-- Three paired tables:
--
--   * equipment_templates — header (name, slug, job_type,
--     default crew size + duration, required certifications,
--     composition, archive flag, version counter)
--
--   * equipment_template_items — line-item children. The crucial
--     split between equipment_inventory_id (pin a SPECIFIC
--     instrument — "always Total Station Kit #3") and category
--     (any-of-kind — "any total station kit") drives the §5.12.5
--     conflict-detection ergonomics:
--       - specific match: works or doesn't (substitution suggested
--         on fail)
--       - category match: resolved at apply-time to whatever's
--         available (substitution flexibility built in)
--
--   * equipment_template_versions — immutable snapshots at every
--     save. The §5.12.3 versioning rule: live template is mutable
--     but every save freezes a snapshot here so historical
--     job_equipment rows that referenced version N still resolve
--     even after version N+1 lands.
--
-- Composition (composes_from UUID[]) — stackable add-ons per the
-- §5.12.3 design ("OSHA road-work add-on" layers onto base
-- "Residential boundary" without forcing 4× catalogue duplication).
-- Recursion guard (MAX_DEPTH=4) lives at the app layer; SQL just
-- stores the array.
--
-- Apply AFTER seeds/233-236. Idempotent.
--
-- Closes Phase F10.0a (the schema foundation). Next:
--   * F10.0e — equipment_manager role enum + sidebar wiring
--   * F10.1+ — admin UI on top of this schema
--   * Subsequent seeds (238 reservations, 239 personnel,
--     240 maintenance, 241 tax) ship in their respective F10
--     sub-phases.

BEGIN;

-- ── 1. equipment_templates — the header ───────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display label. Mutable. The §5.12.3 versioning rule snapshots
  -- name_at_version into equipment_template_versions on every save
  -- so historical job_equipment.from_template_id+_version still
  -- resolves to the name the dispatcher saw at apply-time.
  name TEXT NOT NULL,

  -- Stable slug for URL routes + cross-references.
  -- residential_4corner_total_station / osha_road_work_addon / etc.
  slug TEXT UNIQUE,

  description TEXT,

  -- Free-form tag — boundary / topo / stakeout / road_work — that
  -- powers the §5.12.3 apply-flow's "templates for this kind of
  -- job" picker filter. Indexed below.
  job_type TEXT,

  -- Planning hints. The dispatcher's loadout-preview view surfaces
  -- both; the bookkeeper's IRS time-on-site estimate uses
  -- default_duration_hours pre-clock-in.
  default_crew_size INT,
  default_duration_hours NUMERIC,

  -- §5.12.3: e.g. ['rpls'] — checked against personnel_skills when
  -- §5.12.4 personnel side lands (seeds/239). Open string array
  -- so new credential codes don't need a migration.
  requires_certifications TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,

  -- §5.12.4: personnel slots the template insists on. Example:
  -- [
  --   {"slot_role": "rpls", "min": 1, "max": 1,
  --    "required_skills": ["rpls"]},
  --   {"slot_role": "field_tech", "min": 1, "max": 2,
  --    "required_skills": []}
  -- ]
  -- Stored as JSONB so additive shape changes don't need migrations.
  required_personnel_slots JSONB DEFAULT '[]'::jsonb NOT NULL,

  -- §5.12.3 composition — array of parent template IDs whose items
  -- get unioned in at apply-time. App layer enforces a MAX_DEPTH=4
  -- recursion guard + de-dups by (equipment_inventory_id OR
  -- category) so applying "Residential boundary" + "OSHA road work"
  -- pulls a single 4-pack of cones, not two.
  composes_from UUID[] DEFAULT ARRAY[]::UUID[] NOT NULL,

  -- Bumped on every save; the snapshot row in
  -- equipment_template_versions records the items_jsonb at this
  -- value.
  version INT NOT NULL DEFAULT 1,

  -- §5.12.3: soft-archive when a template is no longer used. Older
  -- jobs that referenced it still resolve via the per-row snapshot
  -- in equipment_template_versions; the picker filters
  -- is_archived=false by default.
  is_archived BOOLEAN NOT NULL DEFAULT false,

  -- Audit.
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for the hot reads.
CREATE INDEX IF NOT EXISTS idx_equipment_templates_job_type
  ON equipment_templates (job_type)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_equipment_templates_active
  ON equipment_templates (name)
  WHERE is_archived = false;

-- ── 2. equipment_template_items — line-item children ──────────────────────
CREATE TABLE IF NOT EXISTS equipment_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent template. CASCADE on delete (template-deletion is rare —
  -- the soft-archive is the contract — but if it does happen the
  -- items go too).
  template_id UUID NOT NULL,

  -- Three storage shapes per §5.12.1.
  item_kind TEXT NOT NULL,

  -- The crucial XOR: pin a specific instrument OR a category-of-kind,
  -- never both, never neither. §5.12.5 conflict detection branches on
  -- which is set:
  --   * equipment_inventory_id NOT NULL → "always Total Station Kit
  --     #3 because it's our newest." Conflict surfaces a substitution
  --     to other units of the same category.
  --   * category NOT NULL → "any total station kit." Resolved at
  --     apply-time to whatever's available; reservation pins the
  --     resolved unit.
  equipment_inventory_id UUID,
  category TEXT,

  -- Consumable counts ("4 cans of paint"); always 1 for durables.
  quantity INT NOT NULL DEFAULT 1,

  -- §5.12.3: false → §5.12.5 soft-warn rather than hard-block.
  -- "Spare battery if available, paint if not."
  is_required BOOLEAN NOT NULL DEFAULT true,

  -- Free-form line-item context — "Spare battery for cold-weather
  -- jobs." Surfaces in the §5.12.3 apply-flow preview.
  notes TEXT,

  -- Drag-reorder UI on the §5.12.3 template editor. Sparse ints
  -- (10/20/30/...) so re-ordering doesn't renumber everything.
  sort_order INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- CHECK: item_kind enum.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_template_items_kind_chk'
  ) THEN
    ALTER TABLE equipment_template_items
      ADD CONSTRAINT equipment_template_items_kind_chk
        CHECK (item_kind IN ('durable', 'consumable', 'kit'));
  END IF;
END $$;

-- CHECK: quantity >= 1 — schema can't silently drop a line by
-- zeroing its count.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_template_items_quantity_chk'
  ) THEN
    ALTER TABLE equipment_template_items
      ADD CONSTRAINT equipment_template_items_quantity_chk
        CHECK (quantity >= 1);
  END IF;
END $$;

-- CHECK: XOR on the specific-vs-category split. Exactly one must
-- be set.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_template_items_target_xor_chk'
  ) THEN
    ALTER TABLE equipment_template_items
      ADD CONSTRAINT equipment_template_items_target_xor_chk
        CHECK (
          (equipment_inventory_id IS NOT NULL AND category IS NULL)
          OR
          (equipment_inventory_id IS NULL AND category IS NOT NULL)
        );
  END IF;
END $$;

-- FKs — separate DO blocks for idempotent re-apply.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_template_items_template_fk'
  ) THEN
    ALTER TABLE equipment_template_items
      ADD CONSTRAINT equipment_template_items_template_fk
        FOREIGN KEY (template_id)
        REFERENCES equipment_templates(id)
        ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'equipment_inventory')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_template_items_inventory_fk'
     ) THEN
    -- ON DELETE SET NULL — retiring a pinned instrument shouldn't
    -- nuke the template line; the §5.12.3 cleanup queue surfaces
    -- "templates referencing retired gear" so the Equipment Manager
    -- can re-pin or swap to category-of-kind.
    ALTER TABLE equipment_template_items
      ADD CONSTRAINT equipment_template_items_inventory_fk
        FOREIGN KEY (equipment_inventory_id)
        REFERENCES equipment_inventory(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for the hot reads.
CREATE INDEX IF NOT EXISTS idx_equipment_template_items_template
  ON equipment_template_items (template_id, sort_order);

-- Reverse lookup — "which templates pin this inventory unit?" —
-- powers the §5.12.3 "templates referencing retired gear" cleanup
-- queue badge on the sidebar.
CREATE INDEX IF NOT EXISTS idx_equipment_template_items_inventory_ref
  ON equipment_template_items (equipment_inventory_id)
  WHERE equipment_inventory_id IS NOT NULL;

-- Reverse lookup — "which templates use this category?" — powers
-- "what templates would be affected if we drop this category?"
CREATE INDEX IF NOT EXISTS idx_equipment_template_items_category_ref
  ON equipment_template_items (category)
  WHERE category IS NOT NULL;

-- ── 3. equipment_template_versions — immutable per-save snapshots ─────────
-- The §5.12.3 versioning rule: live template is mutable but every
-- save bumps `version` and inserts a snapshot here. Job rows record
-- (from_template_id, from_template_version) so the audit trail can
-- answer "what did Job #427 actually go out with?" by reading the
-- snapshot, not the live template.
CREATE TABLE IF NOT EXISTS equipment_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  template_id UUID NOT NULL,

  -- Matches equipment_templates.version at the moment of save.
  -- UNIQUE(template_id, version) below.
  version INT NOT NULL,

  -- Frozen snapshots of the mutable header fields so the audit
  -- trail doesn't drift if the live row is renamed / re-described
  -- after this version was applied to a job.
  name_at_version TEXT NOT NULL,
  description_at_version TEXT,
  job_type_at_version TEXT,
  composes_from_at_version UUID[] DEFAULT ARRAY[]::UUID[] NOT NULL,
  required_personnel_slots_at_version JSONB DEFAULT '[]'::jsonb NOT NULL,
  requires_certifications_at_version TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,

  -- Frozen snapshot of every line item at save-time. The on-the-wire
  -- shape mirrors a SELECT * FROM equipment_template_items WHERE
  -- template_id = $1 ORDER BY sort_order. JSONB rather than a
  -- relational join table because:
  --   * versions are immutable; relational FKs would need to point
  --     at frozen snapshots of equipment_inventory too
  --   * the snapshot is read whole, never partially queried
  --   * jsonb keeps the version count cheap (~50 versions per
  --     template over years is fine)
  items_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,

  saved_by UUID,
  saved_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_template_versions_template_fk'
  ) THEN
    ALTER TABLE equipment_template_versions
      ADD CONSTRAINT equipment_template_versions_template_fk
        FOREIGN KEY (template_id)
        REFERENCES equipment_templates(id)
        ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'equipment_template_versions_unique'
  ) THEN
    ALTER TABLE equipment_template_versions
      ADD CONSTRAINT equipment_template_versions_unique
        UNIQUE (template_id, version);
  END IF;
END $$;

-- Index for the audit-trail lookup: "give me the snapshot row for
-- (template_id=X, version=Y)" — the per-job historical-loadout
-- view hits this every time it renders.
CREATE INDEX IF NOT EXISTS idx_equipment_template_versions_lookup
  ON equipment_template_versions (template_id, version DESC);

COMMIT;
