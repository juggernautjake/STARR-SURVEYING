-- seeds/616_design_dossier_states.sql — the states a page can be in, recorded rather than guessed.
--
-- V2 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
--
-- Owner: *"each page that has tabs and things that close elements and reveals different info and
-- stuff has its own like, sub page listed."*
--
-- Seed 615 gave every design and dossier a `state_key`. This is where the LIST of states a route has
-- gets stored, so the page list can nest them (V3) without anybody typing them out.
--
-- ── WHY DERIVED AND NOT DECLARED ────────────────────────────────────────────────────────────────
--
-- A hand-maintained list of tabs is wrong the first time somebody adds one. The deriver already
-- walks the live DOM for every route; it now also records what it found there — a real `[role="tab"]`
-- tablist, an HTML `<details>` disclosure, or this app's own `__tab`/`-tab` class convention.
--
-- Shape, per entry:
--   { key, label, kind: 'tab' | 'disclosure', selected: bool, addressable: 'yes' | 'unknown' }
--
-- `addressable` is never 'no', and that is deliberate. A tab written as `<a href="?tab=x">` proves
-- itself linkable. A tab written as a `<button>` that calls `router.replace` — which is what
-- /admin/billing does, correctly — is indistinguishable from the DOM from one holding its state in a
-- variable. Claiming the second is "not addressable" would say something false about a page that had
-- just been given `?tab=` on purpose.

ALTER TABLE public.design_page_dossiers
  ADD COLUMN IF NOT EXISTS states JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.design_page_dossiers.states IS
  'The states this route can be in — tabs and disclosure panels — as observed by the deriver. '
  '[{ key, label, kind, selected, addressable }]. `key` matches design_mockups.state_key, which is '
  'how a design of one tab finds the tab it is of. Empty for the majority of routes, which have none.';

-- ── Verification ────────────────────────────────────────────────────────────────────────────────
--   SELECT route, jsonb_array_length(states) AS n,
--          (SELECT string_agg(s->>'key', ', ') FROM jsonb_array_elements(states) s) AS keys
--     FROM public.design_page_dossiers
--    WHERE jsonb_array_length(states) > 0
--    ORDER BY n DESC LIMIT 20;
