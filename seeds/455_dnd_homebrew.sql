-- seeds/455_dnd_homebrew.sql — the shareable homebrew catalog gets a real table.
--
-- WHAT THIS UNBLOCKS. `lib/dnd/homebrew/` is a complete, tested foundation for creator-authored content:
-- `model.ts` (kinds, attribution, system scope, a draft→approved lifecycle, search), `policy.ts` (the
-- per-campaign DM allowlist), `adopt.ts` (`adoptHomebrew` turns a saved piece into a real ClassDefinition /
-- CustomFeat / ActiveEffect, validated through the engine's OWN validators and refused if invalid), and
-- `projection.ts` (the library section + AI grounding). Every one of those is wired to the library today.
--
-- Its entire data source is a TWO-ENTRY HARD-CODED ARRAY in `seeds.ts`. There has never been a table, so
-- nobody has ever been able to author a piece. This is that table. See
-- docs/planning/completed/TABLETOP_AUDIT_REMEDIATION_AND_CONTENT_STUDIO_2026-07-28.md, slice P6-2.
--
-- WHY A NEW TABLE RATHER THAN EXTENDING `dnd_content`. `dnd_content` (Phase C19) already stores homebrew
-- gear and feeds `engine/content.ts`. It is kept and left alone on purpose: it is in active use, its rows
-- are campaign-scoped with no creator attribution, no system scope and no lifecycle, and bolting five
-- columns onto it would migrate live play data to serve a feature that does not exist yet. The Studio
-- proves itself on its own table first; P6-19 migrates `dnd_content` into it afterwards. Two tables briefly
-- is cheaper than one broken one.
--
-- VISIBILITY vs STATUS — two axes that are easy to conflate and must not be.
--   · `visibility` is the CREATOR's choice about who can see it: private (just me) / unlisted (anyone with
--     the link) / public (listed in browse). This is the owner's "add it to their public or private content".
--   · `status` is the piece's own readiness: draft / submitted / approved / rejected, already modelled and
--     already consumed by `isHomebrewPublished`.
-- A piece can be public+draft (shared early for feedback) or private+approved (finished, kept back). Folding
-- them into one column would make both of those unrepresentable.
BEGIN;

CREATE TABLE IF NOT EXISTS dnd_homebrew (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     uuid NOT NULL REFERENCES dnd_users(id) ON DELETE CASCADE,

  -- The 18 kinds in `HOMEBREW_KINDS`. Deliberately NOT a CHECK constraint: the vocabulary is owned by
  -- `lib/dnd/homebrew/model.ts` and widened as the Studio grows (it went 13 → 18 on 2026-07-28), and a
  -- constraint here would mean a migration every time — with the failure landing at INSERT time in
  -- production rather than at the boundary. `normalizeHomebrew` already DROPS a row with an unknown kind
  -- rather than coercing it, so the invalid state is unreachable through the app either way.
  kind              text NOT NULL,

  -- A system key, or 'any' for a system-agnostic piece (`KindSpec.allowAnySystem`; the Rangor race uses it).
  system            text NOT NULL DEFAULT 'any',

  name              text NOT NULL,
  summary           text,
  description       text,
  tags              text[] NOT NULL DEFAULT '{}',

  -- The mechanical shape for this kind: a ClassDefinition, a CustomFeat, or `{ effects: Effect[] }`.
  -- NULL/'{}' means a prose-only piece, which is a valid outcome — `kindIsMechanicalIn` decides whether a
  -- kind can carry mechanics in a given system, and where it cannot the piece is still real content.
  payload           jsonb,

  status            text NOT NULL DEFAULT 'draft',
  visibility        text NOT NULL DEFAULT 'private',

  image_url         text,

  -- The AI's write-up on save (P6-17): balance, consistency, completeness. Advisory, never a gate — it is
  -- an opinion on the author's work, so it is stored beside the piece rather than blocking it.
  assessment        jsonb,

  -- An existing thing this was derived from ("start from Fighter and modify"). Free text, not an FK: it may
  -- name an OFFICIAL class that has no row anywhere. Recorded for the DM's review, never enforced.
  based_on          text,

  -- How far a level-by-level build actually got. NULL for kinds with no level dimension; a number < 20 means
  -- PARTIAL, which is a first-class state, not an error — the owner's "build to any level and just hit save".
  partial_to_level  smallint,

  -- The piece this was transposed FROM (P6-18). Set on an AI-generated variant in another system so the
  -- review loop can show them side by side. ON DELETE SET NULL: deleting the original orphans the variant
  -- rather than destroying work the user may have since edited by hand.
  origin_id         uuid REFERENCES dnd_homebrew(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dnd_homebrew_status_valid
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  CONSTRAINT dnd_homebrew_visibility_valid
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  -- A name is the one field with no sensible default: `validateHomebrew` requires it and a nameless piece
  -- cannot be found, cited or adopted.
  CONSTRAINT dnd_homebrew_name_present CHECK (length(btrim(name)) > 0),
  CONSTRAINT dnd_homebrew_partial_level_sane
    CHECK (partial_to_level IS NULL OR (partial_to_level >= 0 AND partial_to_level <= 20))
);

ALTER TABLE dnd_homebrew ENABLE ROW LEVEL SECURITY;

-- The creator's own library — the Studio's "Mine" tab and the lobby's custom-content section.
CREATE INDEX IF NOT EXISTS idx_dnd_homebrew_owner
  ON dnd_homebrew (owner_user_id, updated_at DESC);

-- Browse: the public catalog for a system, which is also what the library projection and the AI grounding
-- read. Partial on the two conditions those surfaces always apply, so the index stays small.
CREATE INDEX IF NOT EXISTS idx_dnd_homebrew_public
  ON dnd_homebrew (system, kind, updated_at DESC)
  WHERE visibility = 'public' AND status = 'approved';

-- The transpose review loop walks origin → variants.
CREATE INDEX IF NOT EXISTS idx_dnd_homebrew_origin
  ON dnd_homebrew (origin_id)
  WHERE origin_id IS NOT NULL;

COMMENT ON TABLE dnd_homebrew IS
  'Creator-authored, shareable content for the Content Studio. The pure model, DM allowlist, adoption converters and library projection all live in lib/dnd/homebrew/ and predate this table — until now their only data source was a two-entry hard-coded array.';
COMMENT ON COLUMN dnd_homebrew.visibility IS
  'The CREATOR''s choice of audience: private / unlisted / public. Orthogonal to `status`, which is the piece''s readiness — a piece can be public+draft or private+approved, and folding the two would make both unrepresentable.';
COMMENT ON COLUMN dnd_homebrew.payload IS
  'The kind''s mechanical shape (ClassDefinition / CustomFeat / {effects}). NULL = a prose-only piece, which is valid: kindIsMechanicalIn decides where mechanics are possible, and elsewhere the content is still real.';
COMMENT ON COLUMN dnd_homebrew.partial_to_level IS
  'How far a level-by-level build got. < 20 means PARTIAL — a first-class state, not an error.';

COMMIT;
