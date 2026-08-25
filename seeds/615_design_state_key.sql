-- seeds/615_design_state_key.sql — a design is of a route IN A STATE, not just of a route.
--
-- V1 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────────────────────────
--
-- Owner: *"each page that has tabs and things that close elements and reveals different info and
-- stuff has its own like, sub page listed… we will have the main page, and then it will have
-- multiple views available for each toggled option so that I can edit each one individually."*
--
-- The design system's unit is a ROUTE. `/admin/billing` has three tabs and one design row, so the
-- record describes whichever tab happened to be showing. That was tolerable when tabs were rare; it
-- stops being tolerable now, because PAGE_CONSOLIDATION_2026-08-24.md is turning 111 sidebar links
-- into tabs. A design system whose unit is a route, pointed at a product whose unit is becoming a
-- tab, describes less of the product every week.
--
-- ── WHY `state_key` AND NOT `view_key` ──────────────────────────────────────────────────────────
--
-- `design_mockups` already has a column called `views`, and it means the desktop/mobile pair. A
-- `view_key` sitting beside a `views` column that means something else would be misread by the first
-- person to touch it. The word "view" is spent here; a tab is a STATE the page is in.
--
-- This also gets the axes right. A design has TWO and they multiply: `state_key` × viewport.
-- `/admin/billing?tab=invoices` at 390px is a real thing to look at.
--
-- ── WHY EMPTY STRING AND NOT NULL ───────────────────────────────────────────────────────────────
--
-- The plan said "null-defaulting". That is wrong for the dossier, and one convention across the
-- three tables beats two:
--
--   `design_page_dossiers.route` is the PRIMARY KEY, and a route with tabs needs one dossier per
--   tab — so the key has to become `(route, state_key)`. Postgres forbids NULL in a primary key, so
--   a nullable column cannot be part of one.
--
-- `''` means "the route as a whole", which is what all 468 existing rows are. It compares with `=`
-- like any other value, it groups, it indexes, and it never needs `IS NOT DISTINCT FROM`.

-- ── THE DESIGNS ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.design_mockups
  ADD COLUMN IF NOT EXISTS state_key TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.design_mockups.state_key IS
  'Which state of the route this design is of — the `?tab=` value, or the disclosure panel''s id. '
  'Empty string means the route as a whole, which is what every design made before 2026-08-24 is. '
  'Distinct from `views`, which is the desktop/mobile pair: a design has both axes and they multiply.';

-- `default` and `active` are singular PER STATE, not per route.
--
-- CORRECTED 2026-08-25: the original text here claimed that rule was "enforced in
-- lib/design/lifecycle.ts rather than here", and that was written without checking. Seed 612 had
-- already created two real unique indexes on (route), and they refused every per-tab default V4
-- tried to write. Seed 617 re-keys them to (route, state_key). The rule is enforced in the
-- DATABASE, and always was.
CREATE INDEX IF NOT EXISTS idx_design_mockups_route_state
  ON public.design_mockups (route, state_key, status) WHERE deleted_at IS NULL;

-- ── THE DOSSIERS ────────────────────────────────────────────────────────────────────────────────
--
-- The primary key genuinely changes here. Done as add-column → drop-constraint → add-constraint so
-- it is one transaction and re-runnable: every existing row takes `''` from the default, which is
-- exactly the value that keeps its current identity.
ALTER TABLE public.design_page_dossiers
  ADD COLUMN IF NOT EXISTS state_key TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.design_page_dossiers'::regclass
      AND contype = 'p'
      AND array_length(conkey, 1) = 1
  ) THEN
    ALTER TABLE public.design_page_dossiers DROP CONSTRAINT design_page_dossiers_pkey;
    ALTER TABLE public.design_page_dossiers ADD PRIMARY KEY (route, state_key);
  END IF;
END $$;

COMMENT ON COLUMN public.design_page_dossiers.state_key IS
  'Which state of the route this dossier describes. Empty string = the route as a whole. Part of the '
  'primary key, which is why it is NOT NULL: a tabbed page needs one dossier per tab.';

-- ── THE CHECKLIST ITEMS ─────────────────────────────────────────────────────────────────────────
--
-- Items are per ROUTE today. A tab's checklist should be its own — "does the invoices tab have an
-- empty state" is not a question about the overview tab.
ALTER TABLE public.design_checklist_items
  ADD COLUMN IF NOT EXISTS state_key TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS idx_design_checklist_items_route;
CREATE INDEX IF NOT EXISTS idx_design_checklist_items_route
  ON public.design_checklist_items (route, state_key, tier, sort) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.design_checklist_items.state_key IS
  'Which state of the route this item is about. Empty string = the route as a whole.';

-- ── AND WHAT DELIBERATELY DOES NOT CHANGE ───────────────────────────────────────────────────────
--
-- `design_checklist_state` is keyed `(design_id, item_id)` and needs NO state column. A design
-- belongs to exactly one state, so the design id already carries the answer. Adding one would be a
-- second place for the same fact to be recorded, and therefore a second place for it to be wrong.
--
-- ── Verification ────────────────────────────────────────────────────────────────────────────────
--   SELECT state_key, count(*) FROM public.design_mockups WHERE deleted_at IS NULL GROUP BY 1;
--     -- expect one row: '' with every existing design
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.design_page_dossiers'::regclass AND contype = 'p';
--     -- expect PRIMARY KEY (route, state_key)
