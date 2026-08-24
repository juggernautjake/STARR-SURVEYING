-- seeds/614_design_theme_and_notes.sql — the theme and the notes were never being stored.
--
-- Found while building Phase K of
-- docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
--
-- `DesignDocument` has carried `theme` (the embedded token map the artboard renders by) and `notes`
-- (*"a place to write notes for each page to explain what is on the page and what the purpose for
-- the page is"*) since the studio shipped. Both are edited in the UI, both are written to the
-- browser copy — and neither was ever in the row `saveMockup` writes. The columns did not exist.
--
-- So: pick a theme, save, reload on the same machine and it is there (localStorage). Open the same
-- design on another machine and it is the default palette and an empty notes box. Nothing failed;
-- the save reported success, because the server was storing every field it knew about.
--
-- This is a prerequisite for K2 — *"re-theming a design does not require rebuilding it"* — which is
-- unimplementable while a design's theme cannot survive a round trip. A theme sibling would be a
-- copy of the elements wearing nothing.

ALTER TABLE public.design_mockups
  -- The whole embedded theme: { id, name, tokens: { "--theme-bg-page": "#…" }, paletteId }.
  -- Embedded rather than referenced on purpose (see seed 611): a design opened next year must
  -- render as it was made, not as the library has since become.
  ADD COLUMN IF NOT EXISTS theme  JSONB,
  ADD COLUMN IF NOT EXISTS notes  TEXT;

COMMENT ON COLUMN public.design_mockups.theme IS
  'The design''s embedded theme — a copy of the token map, not a reference. Changing a library theme (design_themes) never changes a design already made with it.';
COMMENT ON COLUMN public.design_mockups.notes IS
  'What this page is and what it is for, in the designer''s own words. First thing in the exported brief. Distinct from design_page_dossiers.summary, which is about the ROUTE rather than about one design of it.';

-- ── Verification ────────────────────────────────────────────────────────────────────────────────
--   SELECT id, name, theme->>'name' AS theme, length(notes) AS note_chars
--     FROM public.design_mockups WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20;
