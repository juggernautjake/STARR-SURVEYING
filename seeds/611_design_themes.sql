-- ============================================================================
-- 611_design_themes.sql
--
-- Themes and palettes, saved so they can be used on more than one page.
-- Spec: docs/planning/completed/DESIGN_THEMES_2026-08-23.md §Phase T5.
--
-- ── WHY A LIBRARY WHEN THE THEME IS ALREADY ON THE DESIGN ───────────────────
--
-- A design carries an EMBEDDED copy of its theme (see `DesignDocument.theme`),
-- and that is deliberate: an exported file must not depend on a row somebody
-- can delete, and a design opened next year must render the way it did when it
-- was made rather than in whatever the theme has become since.
--
-- The embedded copy makes a design self-contained. It does not make a theme
-- REUSABLE — and the whole point of "make different themes" is applying one to
-- many pages. So the library is the source you copy FROM, and the copy on the
-- design is what it renders BY. Editing a library theme never silently changes
-- a design that was already made with it.
--
-- ── PALETTES ARE SEPARATE ROWS, NOT A COLUMN ────────────────────────────────
--
-- A palette is what you have; a theme is what you did with it. One palette can
-- drive a light theme and a dark theme, and merging them would make that
-- impossible without duplicating the colours.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.design_palettes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  -- [{ name, value }] — ordered, because a palette has a first colour and that
  -- matters when a theme is generated from it.
  swatches     JSONB NOT NULL,
  -- The colour and harmony it was grown from, when it was generated rather than
  -- hand-mixed. Kept so it can be regenerated with a tweak instead of rebuilt.
  seed         TEXT,
  harmony      TEXT,
  owner_email  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

COMMENT ON TABLE public.design_palettes IS
  'Named colour sets for the Page Designer. A palette is what you HAVE; a theme is what you did with it.';

CREATE TABLE IF NOT EXISTS public.design_themes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  -- { "--theme-bg-page": "#F0F9FF", … } — only the tokens this theme overrides.
  -- An absent token falls through to the app's own value, which is what makes a
  -- theme that changes two colours a two-line object rather than a copy of all 28.
  tokens       JSONB NOT NULL,
  palette_id   TEXT REFERENCES public.design_palettes(id) ON DELETE SET NULL,
  -- Was it generated for a dark surface? Only useful for showing it back sensibly.
  is_dark      BOOLEAN NOT NULL DEFAULT false,
  owner_email  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

COMMENT ON TABLE public.design_themes IS
  'Saved themes for the Page Designer. Designs embed a COPY — this is the library you copy from, so editing a theme here never changes a design already made with it.';

CREATE INDEX IF NOT EXISTS idx_design_themes_live
  ON public.design_themes (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_design_palettes_live
  ON public.design_palettes (updated_at DESC) WHERE deleted_at IS NULL;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--   SELECT id, name, jsonb_object_keys_count(tokens) FROM public.design_themes WHERE deleted_at IS NULL;
--   SELECT id, name, jsonb_array_length(swatches) FROM public.design_palettes WHERE deleted_at IS NULL;
