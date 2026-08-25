-- seeds/618_design_composition_scope.sql — the two kinds of design, and who each one is for.
--
-- W1 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
--
-- ── THE TWO KINDS ───────────────────────────────────────────────────────────────────────────────
--
-- Everything in `design_mockups` today is a TRACE or an edit of one: a drawing of a page, made of
-- catalogue elements at measured coordinates. §2 of the plan says why a drawing cannot be served —
-- it holds rectangles, and a page holds behaviour.
--
-- A COMPOSITION is the other thing. It holds WIDGETS, which already exist, already fetch their own
-- data and already declare who may see them (`WidgetDefinition.allowedRoles`, `requiresBundle`).
-- A composition can genuinely be served, because every part of it is a working component; the
-- composition only says which ones and where.
--
-- They live in one table because they share everything that matters — versions, history, locking,
-- status lifecycle, themes, the route they belong to, and now the STATE of that route. Splitting
-- them would mean two of each of those, and the second copy is always the one that rots.
--
-- `kind` defaults to `trace`, which is what all 470-odd existing rows are.
--
-- ── AND WHO A COMPOSITION IS FOR ────────────────────────────────────────────────────────────────
--
-- §8 of the plan asked whose composition it is and called it a blocker, because it is the key. The
-- answer is in the owner's own words:
--
--     "I want it so that we can have full control in the settings as to what all pages are visible
--      and what pages are not… I want it so that pages load elements dynamically based on the ROLE
--      of the user."
--
-- That names a FIRM-level switch for what exists at all, and ROLE for which elements appear. The
-- third scope is not a choice: per-user layouts already exist in `user_hub_layouts` and people have
-- arranged their own. So the question was never which one — it was what happens when more than one
-- applies, and there is exactly one answer that throws nobody's work away:
--
--     user  →  role  →  firm  →  the hand-built page
--
-- Most specific wins; every layer falls through to the next. That is not a compromise between the
-- three, it is the only shape in which the live per-user rows, the requested per-role behaviour and
-- the requested firm-level control are all describable at once — and it is how everything that has
-- solved this already works: CSS specificity, config cascades, feature flags.
--
-- ── WHY THESE COLUMNS AND NOT A JOIN TABLE ──────────────────────────────────────────────────────
--
-- A composition has exactly one audience. A row that could have several would need a resolution
-- rule for its own multiplicity BEFORE the cascade above even starts, and two nested precedence
-- rules is one more than anybody can hold in their head while debugging why the wrong portal
-- appeared. One row, one audience, and the cascade is the only precedence in the system.

ALTER TABLE public.design_mockups
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'trace',
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'firm',
  ADD COLUMN IF NOT EXISTS scope_key TEXT NOT NULL DEFAULT '';

-- Checked in the database, not only in the code that writes. A row with `scope = 'admin'` — the
-- role in the scope column instead of the key — is the exact typo this shape invites, and it would
-- resolve to nothing rather than to an error: a portal that silently keeps showing the hand-built
-- page while somebody swears they saved a composition for it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'design_mockups_kind_check') THEN
    ALTER TABLE public.design_mockups
      ADD CONSTRAINT design_mockups_kind_check CHECK (kind IN ('trace', 'composition'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'design_mockups_scope_check') THEN
    ALTER TABLE public.design_mockups
      ADD CONSTRAINT design_mockups_scope_check CHECK (scope IN ('firm', 'role', 'user'));
  END IF;
  -- The firm is one thing, so its key is empty; a role and a user are named, so theirs must not be.
  -- Without this, `scope = 'role'` with an empty key is a composition for a role called nothing,
  -- which resolves for nobody and looks exactly like a composition that was never saved.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'design_mockups_scope_key_check') THEN
    ALTER TABLE public.design_mockups
      ADD CONSTRAINT design_mockups_scope_key_check
      CHECK ((scope = 'firm' AND scope_key = '') OR (scope <> 'firm' AND scope_key <> ''));
  END IF;
END $$;

COMMENT ON COLUMN public.design_mockups.kind IS
  'trace = a drawing of a page, made of catalogue elements at measured coordinates. composition = a '
  'layout of real WIDGETS, which can actually be served because every part of it is a working '
  'component. Every row written before 2026-08-25 is a trace.';

COMMENT ON COLUMN public.design_mockups.scope IS
  'Who this composition is for: firm | role | user. Resolved most-specific-first — user, then role, '
  'then firm, then the hand-built page. Meaningless for a trace: a measurement has no audience.';

COMMENT ON COLUMN public.design_mockups.scope_key IS
  'The role name or the email. Empty for firm scope, and required for the other two.';

-- The lookup the resolver does, in the order it does it. `route, state_key` first because that is
-- what narrows 470 rows to a handful; `scope` after, because the cascade tries three values against
-- that handful.
CREATE INDEX IF NOT EXISTS idx_design_mockups_composition
  ON public.design_mockups (route, state_key, scope, scope_key)
  WHERE kind = 'composition' AND deleted_at IS NULL;

-- ── WHAT DELIBERATELY DOES NOT CHANGE ───────────────────────────────────────────────────────────
--
-- The one-default-per-state and one-active-per-state indexes from seed 617 stay keyed on
-- (route, state_key) and are NOT widened to include the scope.
--
-- That is deliberate and it is the load-bearing decision in this seed. `default` means "a trace of
-- what is actually served", and there is one of those per state no matter how many audiences the
-- page has. A per-scope default would let a route hold three rows each claiming to be the record of
-- what is served — which is the same as holding none, because nothing could say which was true.
--
-- Compositions are drafts and alternatives; if one is ever promoted to `active`, it competes for
-- that single slot like anything else. The cascade decides which composition APPLIES to a viewer.
-- It does not decide what the page is.
--
-- ── Verification ────────────────────────────────────────────────────────────────────────────────
--   SELECT kind, scope, count(*) FROM public.design_mockups WHERE deleted_at IS NULL GROUP BY 1, 2;
--     -- expect one row: trace / firm, with every existing design
--
--   INSERT INTO public.design_mockups (id, name, kind, scope, scope_key)
--     VALUES ('x', 'x', 'composition', 'role', '');
--     -- expect: violates check constraint "design_mockups_scope_key_check"
