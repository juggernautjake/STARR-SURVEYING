-- seeds/521_org_scope_underivable.sql — the "derived" rule was right and applied wrong (audit §1.2).
--
-- Seed 513 classified 51 tables as **derived**: *"children of an already-scoped table — a
-- `job_equipment` row's tenant IS its job's. Denormalising the column onto every child is a second
-- copy of the same fact that can disagree with the first."* That reasoning is sound and still stands.
--
-- It was applied by asking "does this table have a foreign key to a scoped table?" — and never asking
-- whether that foreign key is **NOT NULL**. It matters completely:
--
--   `job_equipment.job_id`            NOT NULL → the row cannot exist without a job. Tenant derivable.
--   `equipment_inventory.vehicle_id`  NULLABLE → a total station in the cage is assigned to no vehicle,
--                                                no job and no receipt. It has NO parent, so there is
--                                                nothing to derive a tenant from, and `WHERE org_id =
--                                                <firm>` on a table with no org_id filters nothing.
--
-- Found while building the compliance register (item 8m), which needed `equipment_inventory.org_id`
-- and discovered there wasn't one. Measured across the whole schema: **16 tables** are in this state,
-- and the list is not obscure — it includes `equipment_inventory` (the instrument fleet),
-- `cad_drawings` (every drawing not attached to a job), `user_files`, `maintenance_events` and
-- `lead_lifecycle_events`.
--
-- The sharpest of them is `cad_drawings`. A drawing filed under a job derives that job's tenant; a
-- template, a standalone sketch or a drawing whose job was later deleted derives nothing, and on the
-- day a second firm exists it is visible to all of them. Worse, `equipment_assignments` — a CHILD of
-- `equipment_inventory` — already carries `org_id`. The child was scoped and the parent was not.
--
-- ── WHAT IS DELIBERATELY LEFT ALONE ──────────────────────────────────────────────────────────────
--
-- `learning_modules` appears in the same measurement and is NOT scoped here. Its only link to a scoped
-- table is `credential_bonuses.credential_key`, which is a lookup rather than ownership, and course
-- content is shared catalogue data — §1.2's "reference" bucket, where *"a per-tenant copy is
-- duplication with extra steps, and the first divergent copy is a support call about why one firm's
-- data is stale."* Scoping it would give every firm its own copy of the FS exam library.
--
-- Nullable with no default, same as 513, for the same reason: `NOT NULL DEFAULT <starr>` would stamp
-- every future row with the first firm, including rows a second customer's code inserts. Seed 517 adds
-- the DEFAULT and the backfill under its one-organisation guard, and must be re-run after this.
--
-- Idempotent.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- The instrument fleet and everything that happens to it. `equipment_assignments` (a child)
    -- already had org_id while its parent did not.
    'equipment_inventory',
    'equipment_events',
    'equipment_reservations',
    'equipment_template_versions',
    'maintenance_events',
    -- Drawings and point files. A drawing with no job is the common case for templates and details.
    'cad_drawings',
    'cad_point_files',
    -- A person's uploads. `jobs(job_id)` is optional — most user files are attached to nothing.
    'user_files',
    -- Money and time that attach to a person, where the job link is optional.
    'employee_bonuses',
    'pto_transactions',
    -- The lead lifecycle. Every one of its three parents is nullable, which is the point of the table:
    -- it records a lead BEFORE it has a customer or a job.
    'lead_lifecycle_events',
    'google_conversion_events',
    -- Vehicle movement. A segment between two stops with no vehicle recorded still belongs to a firm.
    'location_segments',
    -- Research working data. Scoped to the firm that paid for the research run.
    'lidar_data_cache',
    'captcha_solves',
    'recon_nodes',
    'recon_edges'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_org ON %I (org_id)', t || '_org_scope', t);
    ELSE
      RAISE NOTICE 'seeds/521: table % does not exist — skipped.', t;
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN equipment_inventory.org_id IS
  'The firm that owns this instrument. NOT derived from vehicle_id/current_job_id — both are nullable, '
  'and an instrument sitting in the cage is assigned to neither.';

COMMENT ON COLUMN cad_drawings.org_id IS
  'The firm that owns this drawing. NOT derived from job_id: templates, details and drawings whose job '
  'was deleted have no job, and those are precisely the ones that would leak.';
