-- seeds/617_design_one_default_per_state.sql — one default per STATE, not per route.
--
-- V4 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
--
-- ── A CORRECTION TO SEED 615 ────────────────────────────────────────────────────────────────────
--
-- Seed 615 says, in a comment:
--
--     "`default` and `active` are singular PER STATE, not per route. Enforced in
--      `lib/design/lifecycle.ts` rather than here"
--
-- The second half of that sentence is **false**, and it was written without checking. Seed 612
-- created two real unique indexes:
--
--     idx_design_mockups_one_default_per_route  UNIQUE (route) WHERE status = 'default'
--     idx_design_mockups_one_active_per_route   UNIQUE (route) WHERE status = 'active'
--
-- They are correct and they are load-bearing — a route with two "as served" records has no record at
-- all. But they are keyed on the route alone, so the moment V4 tried to store a default for
-- `/admin/billing` state `invoices`, Postgres refused it: **"duplicate key value violates unique
-- constraint"**, three times, one per tab.
--
-- Found by running the tracer, not by reading the schema. Recorded here rather than quietly fixed
-- because the comment in 615 will be read again and it needs to stop being wrong.
--
-- ── THE CHANGE ──────────────────────────────────────────────────────────────────────────────────
--
-- The invariant is unchanged in spirit and sharper in fact: one default, and one active, per
-- (route, state). `/admin/settings` has six tabs and so has six defaults, and still cannot have two
-- of any one of them.

DROP INDEX IF EXISTS public.idx_design_mockups_one_default_per_route;
DROP INDEX IF EXISTS public.idx_design_mockups_one_active_per_route;

CREATE UNIQUE INDEX IF NOT EXISTS idx_design_mockups_one_default_per_state
  ON public.design_mockups (route, state_key)
  WHERE status = 'default' AND deleted_at IS NULL AND route IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_design_mockups_one_active_per_state
  ON public.design_mockups (route, state_key)
  WHERE status = 'active' AND deleted_at IS NULL AND route IS NOT NULL;

COMMENT ON INDEX public.idx_design_mockups_one_default_per_state IS
  'One traced record per route per state. `/admin/settings` has six tabs and so has six defaults; it '
  'still cannot have two of any one of them. Replaces idx_design_mockups_one_default_per_route from '
  'seed 612, which predated states.';

-- ── Verification ────────────────────────────────────────────────────────────────────────────────
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'design_mockups' AND indexname LIKE 'idx_design_mockups_one_%';
--     -- expect the two _per_state indexes and neither _per_route one
--
--   SELECT route, state_key, count(*) FROM public.design_mockups
--    WHERE status = 'default' AND deleted_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1;
--     -- expect no rows, before and after
