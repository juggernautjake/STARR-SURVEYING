-- seeds/612_design_versions.sql — a default, an active, alternatives and drafts, per page.
--
-- Phases P + S of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
--
-- Owner: *"we will have the active version, the alternative versions that are inactive but
-- considered complete and functional, and then the drafts that are still being worked on"*, and
-- *"we should never be able to change the default page for any page itself, but we should be able
-- to clone it and change the clone."*
--
-- ── WHY `status` IS ONE COLUMN AND NOT FOUR BOOLEANS ────────────────────────────────────────────
--
-- `is_default` + `is_active` + `is_alternative` + `is_draft` can represent "active and draft", and
-- given enough saves it eventually will. One column with a CHECK constraint cannot.
--
--   default      a TRACE of the page as it is actually served. Immutable. One per route.
--   active       the design of record for the route — what the page is supposed to be. One per route.
--   alternative  complete and usable, not currently the record. Any number.
--   draft        still being built. Any number.
--   archived     kept for history, out of the way. Any number.
--
-- ── THE TWO RULES THE DATABASE ENFORCES ITSELF ──────────────────────────────────────────────────
--
-- Application code that promotes one row and demotes another is two writes and an opportunity. The
-- partial unique indexes below make "two active designs for /admin/jobs" unrepresentable, which
-- matters because that state is not loud: it looks like everything is fine until two people are
-- reading different specs for the same page.

ALTER TABLE public.design_mockups
  DROP CONSTRAINT IF EXISTS design_mockups_status_check;

-- Existing rows first, or the constraint refuses to attach. `ready` was the old word for a design
-- somebody considered finished, which is exactly what `alternative` means now.
UPDATE public.design_mockups SET status = 'alternative' WHERE status = 'ready';
UPDATE public.design_mockups SET status = 'draft'
  WHERE status NOT IN ('default', 'active', 'alternative', 'draft', 'archived');

ALTER TABLE public.design_mockups
  ADD CONSTRAINT design_mockups_status_check
  CHECK (status IN ('default', 'active', 'alternative', 'draft', 'archived'));

-- `locked` is not derived from `status` in a trigger, because a lock is a statement about what may
-- be written and deriving it would hide that. Every default is locked; nothing else is, today.
ALTER TABLE public.design_mockups
  ADD COLUMN IF NOT EXISTS locked        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Designs that are the same LAYOUT in different themes share this. Null means "not part of a
  -- theme family", which is most of them.
  ADD COLUMN IF NOT EXISTS theme_group   TEXT,
  -- Which theme this design wears: a design_themes.id, or one of the built-in shell theme ids.
  ADD COLUMN IF NOT EXISTS theme_id      TEXT,
  ADD COLUMN IF NOT EXISTS activated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_by  TEXT,
  -- Set when a default is traced, so "is this still what the page looks like?" has an answer.
  ADD COLUMN IF NOT EXISTS traced_at     TIMESTAMPTZ;

COMMENT ON COLUMN public.design_mockups.status IS
  'default (an immutable trace of the served page) | active (the design of record) | alternative (complete, not current) | draft (in progress) | archived.';
COMMENT ON COLUMN public.design_mockups.locked IS
  'TRUE for defaults. A default is a record of what is served, so editing one would make it a lie. The save API rejects writes to a locked row; clone it instead.';
COMMENT ON COLUMN public.design_mockups.theme_group IS
  'Designs sharing this id are the same layout in different themes. Set when a design is branched FOR a theme rather than for a layout.';

-- ── ONE DEFAULT AND ONE ACTIVE PER ROUTE ────────────────────────────────────────────────────────
--
-- Partial, so the constraint says exactly what is meant: any number of alternatives and drafts,
-- exactly one of each of the two singular kinds. `deleted_at IS NULL` is part of the predicate
-- because a soft-deleted design must not hold the slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_design_mockups_one_default_per_route
  ON public.design_mockups (route)
  WHERE status = 'default' AND deleted_at IS NULL AND route IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_design_mockups_one_active_per_route
  ON public.design_mockups (route)
  WHERE status = 'active' AND deleted_at IS NULL AND route IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_design_mockups_route_status
  ON public.design_mockups (route, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_design_mockups_theme_group
  ON public.design_mockups (theme_group) WHERE theme_group IS NOT NULL AND deleted_at IS NULL;

-- ── SITE VERSIONS ───────────────────────────────────────────────────────────────────────────────
--
-- Owner: *"eventually we can create full alternative versions of the website ... so that once we
-- built out a full version of the website, we can make that one active and have all of the pages
-- served at once."* A version is a named set of designs plus a theme; publishing it activates every
-- member. Membership is its own table because a design can belong to more than one version, and
-- because "which version is this design in" is a question worth asking from either side.
CREATE TABLE IF NOT EXISTS public.design_site_versions (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  theme_id     TEXT,
  owner_email  TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.design_site_version_members (
  version_id   TEXT NOT NULL REFERENCES public.design_site_versions(id) ON DELETE CASCADE,
  design_id    TEXT NOT NULL REFERENCES public.design_mockups(id) ON DELETE CASCADE,
  route        TEXT NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, design_id)
);

-- One design per route within a version: a version that names two designs for /admin/jobs cannot
-- be published, and finding that out at publish time is finding out too late.
CREATE UNIQUE INDEX IF NOT EXISTS idx_design_version_one_per_route
  ON public.design_site_version_members (version_id, route);

COMMENT ON TABLE public.design_site_versions IS
  'A named set of designs across many routes, with a theme. Publishing activates every member. Spec: docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.';
