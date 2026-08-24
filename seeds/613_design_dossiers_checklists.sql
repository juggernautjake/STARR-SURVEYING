-- seeds/613_design_dossiers_checklists.sql — what each page is for, and what it must contain.
--
-- Phases D + C of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
--
-- Owner: *"I want you to evaluate/analyze each page and determine the purpose of the page and what
-- all functions it serves. I want a clear comprehensive summary of the purpose of each page and
-- every main element on the page and what it is for. Then I want that information available in the
-- editor so that I can see what elements need to be on the page… like a checklist of the required
-- and optional elements. The bare minimum elements needed, the optional but useful elements, and
-- then the elements that the user adds themselves."*
--
-- ── WHY THE DERIVED AND AUTHORED HALVES ARE DIFFERENT COLUMNS ───────────────────────────────────
--
-- Half of a dossier is MEASURED: walk the route, record the forms, the tables, the buttons, the
-- endpoints it calls. That half is re-derived whenever the page changes, and it must be, or it
-- becomes a description of a page that no longer exists.
--
-- The other half is WRITTEN: what the page is for, who opens it, what they are trying to do. No
-- crawler produces that, and re-running the deriver must never overwrite it — losing a paragraph
-- somebody wrote because a button moved is the kind of thing that stops people writing paragraphs.
--
-- So they are separate columns with separate timestamps, and the API refuses to write one from the
-- path that writes the other. Merging them for display is `lib/design/dossier.ts`, which is the
-- only place that knows they were ever apart.
--
-- ── WHY CHECKLIST STATE IS KEYED BY DESIGN AND NOT BY ROUTE ─────────────────────────────────────
--
-- Three versions of /admin/jobs are at three different points. Keying state by route would make
-- ticking "has a filter bar" on a draft mark the active design complete — and the checklist exists
-- precisely so that "complete" is a claim with something behind it.

BEGIN;

-- ── DOSSIERS ────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.design_page_dossiers (
  route          TEXT PRIMARY KEY,

  -- The authored half. Prose, written by a person, never touched by the deriver.
  purpose        TEXT,                    -- one line: what this page is
  summary        TEXT,                    -- the comprehensive version
  audience       TEXT,                    -- who opens it, and on what
  authored_by    TEXT,
  authored_at    TIMESTAMPTZ,

  -- The derived half. Measured from the running page; replaced wholesale on each re-derive.
  --   functions  [{ id, label, detail, kind, evidence }]   the jobs the page does
  --   elements   [{ selector, label, tag, role, purpose, required, count, sample }]
  --   endpoints  [{ method, path, count }]                 what it calls while it loads and works
  functions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  elements       JSONB NOT NULL DEFAULT '[]'::jsonb,
  endpoints      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Counts kept out of the JSONB so the list view can sort and filter without unpacking it.
  element_count  INT NOT NULL DEFAULT 0,
  derived_at     TIMESTAMPTZ,
  derived_from   TEXT,                    -- the base URL the walk ran against

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.design_page_dossiers IS
  'What a page is for and what is on it. `purpose`/`summary`/`audience` are AUTHORED and are never '
  'written by the deriver; `functions`/`elements`/`endpoints` are DERIVED and are replaced on every '
  're-derive. Spec: docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md §D.';

COMMENT ON COLUMN public.design_page_dossiers.derived_at IS
  'When the measured half was last refreshed. A dossier whose derived half predates the last '
  'deploy is describing a page that may have moved on — the editor says so rather than implying '
  'the inventory is current.';

-- ── CHECKLIST ITEMS ─────────────────────────────────────────────────────────────────────────────
--
-- One row per thing a page ought to have. Generated items come from the dossier; custom ones come
-- from a person. `created_by IS NULL` is the marker for generated, and it is load-bearing: a user
-- has to be able to tell what the system inferred from what somebody decided, or they cannot trust
-- either. Regeneration deletes and rewrites generated rows and never touches custom ones.
CREATE TABLE IF NOT EXISTS public.design_checklist_items (
  id           TEXT PRIMARY KEY,
  route        TEXT NOT NULL,
  tier         TEXT NOT NULL CHECK (tier IN ('required', 'recommended', 'custom')),
  label        TEXT NOT NULL,
  detail       TEXT,
  -- The catalogue entry or class signature this item is about, when it has one. This is what lets
  -- the editor say "you have already placed this" instead of asking a person to notice.
  element_ref  TEXT,
  sort         INT NOT NULL DEFAULT 0,
  created_by   TEXT,                     -- NULL = generated from the dossier
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_design_checklist_items_route
  ON public.design_checklist_items (route, tier, sort) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.design_checklist_items.created_by IS
  'NULL for items generated from the dossier, an email for items a person added. Regeneration '
  'rewrites the generated rows and never touches the custom ones.';

-- ── CHECKLIST STATE, PER DESIGN ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.design_checklist_state (
  design_id    TEXT NOT NULL REFERENCES public.design_mockups(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES public.design_checklist_items(id) ON DELETE CASCADE,
  checked      BOOLEAN NOT NULL DEFAULT FALSE,
  note         TEXT,
  checked_by   TEXT,
  checked_at   TIMESTAMPTZ,
  PRIMARY KEY (design_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_design_checklist_state_design
  ON public.design_checklist_state (design_id);

COMMENT ON TABLE public.design_checklist_state IS
  'Which checklist items a PARTICULAR design satisfies. Keyed by design, not by route: three '
  'versions of one page are at three different points, and ticking an item on a draft must not '
  'mark the active design complete.';

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────────────────────────
--   SELECT route, element_count, derived_at, (purpose IS NOT NULL) AS authored
--     FROM public.design_page_dossiers ORDER BY route;
--   SELECT tier, count(*) FROM public.design_checklist_items WHERE deleted_at IS NULL GROUP BY tier;
