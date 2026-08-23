-- ============================================================================
-- 609_design_studio.sql
--
-- Storage for the Page Designer (/admin/design).
-- Spec: docs/planning/completed/DESIGN_STUDIO_2026-08-23.md §16.
--
-- ── WHY THE DATABASE, WHEN localStorage ALREADY WORKS ───────────────────────
--
-- The studio shipped saving to `localStorage` so the owner could open it and
-- place things the same night. That is genuinely fine for one person on one
-- machine, and it is not fine for the work being asked of it: the plan is to
-- design 147 pages, twice each. Losing that to a cleared browser, a new
-- laptop, or a private window is not a risk worth carrying, and a design that
-- exists on exactly one computer cannot be shown to anybody.
--
-- The document shape is IDENTICAL either way — `views: { desktop, mobile }`,
-- each with its own elements and grid settings — so this is a write path
-- rather than a rewrite, and the browser copy stays as the offline draft.
--
-- ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
--
-- No RLS policies beyond service-role. Every read and write goes through
-- `app/api/admin/design/*`, which is role-gated to admin + developer in the
-- route itself — the same shape as the rest of this app's admin surface.
-- Adding row policies for a table only the service role ever touches would be
-- security theatre that future readers would have to reason about.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.design_mockups (
  id           TEXT PRIMARY KEY,                 -- the studio's own readable id, e.g. d-mt5g-1a2b
  name         TEXT NOT NULL,
  route        TEXT,                             -- the page it is FOR: '/admin/jobs'. NULL = a scratch idea.
  variant_of   TEXT REFERENCES public.design_mockups(id) ON DELETE SET NULL,
  -- The whole document: { desktop: {width,height,settings,elements}, mobile: {...} }.
  -- One column rather than a table per element, because a design is edited and saved as a WHOLE —
  -- there is no query that wants "every button across every mockup", and normalising it would buy
  -- nothing while making every save a transaction over hundreds of rows.
  views        JSONB NOT NULL,
  owner_email  TEXT NOT NULL,
  org_id       UUID,
  status       TEXT NOT NULL DEFAULT 'draft',    -- draft | ready | archived
  version      INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

COMMENT ON TABLE public.design_mockups IS
  'Page Designer mockups (/admin/design). `views` holds the whole document — desktop and mobile are INDEPENDENT designs sharing a name, a target route and a history. Spec: docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.';

CREATE INDEX IF NOT EXISTS idx_design_mockups_owner
  ON public.design_mockups (owner_email, updated_at DESC)
  WHERE deleted_at IS NULL;

-- "Show me every design for /admin/jobs" — the question asked when redesigning a page.
CREATE INDEX IF NOT EXISTS idx_design_mockups_route
  ON public.design_mockups (route)
  WHERE deleted_at IS NULL AND route IS NOT NULL;

-- ── Versions ────────────────────────────────────────────────────────────────
--
-- Every explicit save writes one. Not autosave: a draft is written to the
-- browser many times a minute, and a history nobody can read is a list of
-- timestamps rather than a history.
CREATE TABLE IF NOT EXISTS public.design_mockup_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mockup_id    TEXT NOT NULL REFERENCES public.design_mockups(id) ON DELETE CASCADE,
  version      INT NOT NULL,
  views        JSONB NOT NULL,
  summary      TEXT,                             -- "added 4 elements to mobile"
  author_email TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mockup_id, version)
);

CREATE INDEX IF NOT EXISTS idx_design_versions_mockup
  ON public.design_mockup_versions (mockup_id, version DESC);

COMMENT ON TABLE public.design_mockup_versions IS
  'One row per explicit save of a mockup. Restoring writes a NEW version rather than deleting the ones after it — history that can be lost is not history.';

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--   SELECT id, name, route, version, jsonb_array_length(views->'desktop'->'elements') AS desktop_elements
--     FROM public.design_mockups WHERE deleted_at IS NULL ORDER BY updated_at DESC;
