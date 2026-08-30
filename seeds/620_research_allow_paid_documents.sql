-- seeds/620_research_allow_paid_documents.sql — per-project control over paid document purchases.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────────────────────────
--
-- Texas has no statewide deed index. `getClerkSystem()` routes each county to the vendor that county
-- actually uses; where no adapter exists it falls through to TexasFile, which charges per document.
-- So the identical six clicks cost nothing in Bell County (Kofile) and real money in McLennan
-- (TexasFile).
--
-- Until now the only spend control was `run-budget.ts`: $2.00 and 20 paid pages per run. That is a
-- good backstop and it stops you AFTER the money is committed. This column stops you before, at the
-- moment you have the most context — is this particular property worth paying for?
--
-- ── WHY THE DEFAULT IS TRUE ─────────────────────────────────────────────────────────────────────
--
-- `DEFAULT true` preserves exactly today's behaviour for every existing project and for any code
-- path that does not set it. A default of `false` would be safer in the abstract and would silently
-- change what a re-run of an old project does, which is the worse failure: the operator would get a
-- thinner report and no reason for it.
--
-- The UI defaults the toggle ON and shows the cost, so the choice is explicit at the point of
-- creation rather than inherited from a column default nobody sees.
--
-- ── NOT NULL ───────────────────────────────────────────────────────────────────────────────────
--
-- Three states would be one too many. `NULL` would have to mean "unset, fall back to something",
-- and every reader would then need to know what that something is. Two states, both meaningful.

BEGIN;

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS allow_paid_documents boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN research_projects.allow_paid_documents IS
  'May a run for this project buy documents from a paid vendor (TexasFile)? Default true = today''s '
  'behaviour. When false the run still completes using free county sources, and the report states '
  'that paid documents were skipped BY CHOICE — which must never render the same as "the county has '
  'no such record".';

COMMIT;
