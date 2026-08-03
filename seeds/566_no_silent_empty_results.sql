-- 566_no_silent_empty_results.sql — the defect, audited and ratcheted (plan R39).
--
-- Seed 565 fixed one instance of this platform's central defect. Auditing every routed adapter for
-- the same shape found SEVEN more, in code that was already "working".
--
-- ── WHAT WAS FOUND ──────────────────────────────────────────────────────────────────────────────
--
--   Kofile      searchByLegalDescription  logged "not supported", returned []   (seed 565)
--   Kofile      parseSearchResults        returned [] when the session had died
--   Kofile      DOM + vision both failed  returned []
--   Kofile      AI reply unparseable      returned []
--   TexasFile   instrument-number search  swallowed the error, returned []
--   TexasFile   volume/page search        swallowed the error, returned []
--   TexasFile   grantee search            swallowed the error, returned []
--   TexasFile   grantor search            swallowed the error, returned []
--   TexasFile   searchByLegalDescription  "not on the free tier", returned []
--   TexasFile   getDocumentImages         "requires purchase", returned []
--   TexasFile   parseResults              returned [] when the session had died
--
-- TexasFile is the fallback for 232 counties, so its instances reached further than any other bug
-- in this build: a slow site, a blocked request or a changed page reported "this property has no
-- records" for most of Texas.
--
-- ── WHY IT KEEPS HAPPENING ──────────────────────────────────────────────────────────────────────
--
-- Every one of these is locally reasonable. Returning [] from a catch block looks defensive;
-- returning [] for an unsupported operation looks tidy; returning [] when the page is gone looks
-- like a guard clause. The damage is invisible at the site of the decision and only appears at the
-- call site, where "the search crashed", "we do not offer that search" and "this land is
-- unencumbered" arrive as the same value.
--
-- ── THE RATCHET ─────────────────────────────────────────────────────────────────────────────────
--
-- `no-silent-empty-results.test.ts` now fails the build if any routed adapter:
--
--   * returns [] from a catch block, or
--   * returns [] when this.page is missing.
--
-- It found two instances I had missed while writing the fix for the other nine, which is the
-- argument for having it: this defect is not something a careful reading reliably catches.
--
-- Every failure path now throws with what actually happened — "session failure, NOT an empty
-- index", "UNREAD, NOT no records", "the absence of ACCESS, not the absence of images".
--
-- ── VERIFIED ────────────────────────────────────────────────────────────────────────────────────
--
-- Bell after the change: grantor "SMITH" → 50 documents; full-text "HAMMIL" → 7 documents. The
-- parser rewrite did not break the paths that worked.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'empty_result_discipline', 'AUDITED 2026-08-02 — no routed adapter returns [] from a catch block or from a missing session. Every failure path throws with what actually happened.',
           'ratchet_test', 'worker/src/__tests__/no-silent-empty-results.test.ts fails the build if the pattern returns.',
           'audit_finding', 'Eleven instances across Kofile and TexasFile, all in code that was already "working". The ratchet caught two that a careful manual pass had missed.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum;
