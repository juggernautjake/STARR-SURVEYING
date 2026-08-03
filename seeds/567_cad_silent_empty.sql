-- 567_cad_silent_empty.sql — the same defect in the appraisal-district adapters (plan R39).
--
-- Seed 566 audited the CLERK adapters. The CAD adapters — routed live by property-discovery.ts —
-- carry the identical pattern in a different costume, and one instance is the quietest bug found in
-- this entire build.
--
-- ── WHAT WAS FOUND ──────────────────────────────────────────────────────────────────────────────
--
--   HCAD   searchByOwner            swallowed the error, returned []
--   HCAD   parseSearchResultsDOM    returned [] when the session had died
--   HCAD   parseSearchResultsAI     returned [] when both parsers failed
--   HCAD   findSubdivisionLotIds    swallowed the error, returned []
--   TAD    the same four
--   BIS    findSubdivisionLots      swallowed the error, returned []
--
-- On a CAD adapter an empty result does not read as "no deeds" — it reads as "NO PROPERTY EXISTS AT
-- THIS ADDRESS", which is a stronger and more damaging claim.
--
-- ── THE ADJOINER ONE IS THE WORST ───────────────────────────────────────────────────────────────
--
-- `findSubdivisionLotIds` / `findSubdivisionLots` enumerate the OTHER lots in a subdivision. They
-- feed the adjoiner list — the neighbouring-property feature this platform was explicitly asked to
-- build.
--
-- Swallowing a failure there produced a SHORT NEIGHBOUR LIST WITH NOTHING MARKING IT SHORT. A
-- surveyor would see three adjoining parcels where there are nine, and have no reason to doubt it.
-- Unlike a missing deed, nothing downstream would ever contradict it.
--
-- Every one of these now throws with what actually happened, and says the adjoiner list would be
-- INCOMPLETE rather than letting a partial list pass as a whole one.
--
-- ── THE RATCHET NOW COVERS BOTH FAMILIES ────────────────────────────────────────────────────────
--
-- `no-silent-empty-results.test.ts` checks the five routed CAD adapters alongside the seven routed
-- clerk adapters. It caught a scripted edit of tad-adapter.ts that had silently failed to apply —
-- the file reported success and changed nothing. Without the test that would have shipped as a fix
-- that fixed nothing, which is a fair summary of why this pattern keeps surviving code review.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'cad_empty_result_discipline', 'AUDITED 2026-08-02 — HCAD, TAD and BIS no longer return [] from a catch block or a dead session. On a CAD adapter an empty result reads as "no property exists at this address".',
           'adjoiner_completeness', 'findSubdivisionLotIds/findSubdivisionLots now THROW on failure. Swallowing produced a short neighbour list with nothing marking it short — three adjoining parcels shown where there are nine.',
           'ratchet_covers_cad', 'no-silent-empty-results.test.ts checks the five routed CAD adapters alongside the seven routed clerk adapters.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'appraisal_cad'::research_site_type_enum;
