-- ============================================================================
-- 610_design_page_reviews.sql
--
-- "Go through the pages one by one and check them off."
-- Spec: docs/planning/completed/DESIGN_STUDIO_QUALITY_2026-08-23.md §Phase C.
--
-- ── WHY THIS IS NOT PART OF A DESIGN ────────────────────────────────────────
--
-- A page's review status is about the PAGE, not about any one mockup of it. A
-- route can have three variant designs and one status; a route can be marked
-- "done" because it needed no changes, with no design at all. Storing the
-- status inside a design document would make both of those unrepresentable.
--
-- ── WHY THE ROUTE IS THE KEY, AND NOT AN ID ─────────────────────────────────
--
-- The list of pages is generated from the filesystem (lib/design/pages.generated.json)
-- and has no database identity. The route string is what the two sides share.
-- A route that disappears leaves a row nobody joins to, which is harmless and
-- is also a record that somebody once reviewed it.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.design_page_reviews (
  route        TEXT PRIMARY KEY,
  -- not_started | in_progress | done | skipped
  --
  -- `skipped` earns its place: of 270 pages, some are redirects, some are
  -- dynamic detail routes covered by designing the list, and some are the D&D
  -- side project. Forcing those to sit at "not started" forever would make the
  -- progress number meaningless, and meaningless progress numbers get ignored.
  status       TEXT NOT NULL DEFAULT 'not_started',
  -- What is on this page and what it is for, in the reviewer's words. The same
  -- question the design document asks; answered here when there is no design yet.
  note         TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.design_page_reviews IS
  'Per-route review status for the Page Designer walkthrough. One row per page, created on first change — an untouched page has no row and reads as not_started.';

-- "What is left to do" is the question this table exists to answer.
CREATE INDEX IF NOT EXISTS idx_design_page_reviews_status
  ON public.design_page_reviews (status, updated_at DESC);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--   SELECT status, count(*) FROM public.design_page_reviews GROUP BY status ORDER BY 2 DESC;
