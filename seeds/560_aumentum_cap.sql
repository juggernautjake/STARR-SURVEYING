-- 560_aumentum_cap.sql — Aumentum truncates at 100 and says nothing (plan R39).
--
-- The intended slice was pagination. There is none to build: the portal caps results at 100 rows
-- and offers no pager at all.
--
--     "SMITH"        100 records
--     "SMITH JAMES"  100 records
--     "ENSERCH"      100 records
--     "ZZYZX"          0 records
--
-- Three unrelated searches landing on exactly 100 is a cap, not a coincidence. The
-- first/prev/next/last controls named in the toolbar script are NOT present on the results list —
-- they belong to the document detail view, for stepping between selected documents.
--
-- ── WHY THIS IS THE WORST OF THE THREE TRUNCATIONS FOUND ────────────────────────────────────────
--
-- Tyler announces its over-limit with a banner. Avenu announces its timeout with a modal. Aumentum
-- announces NOTHING: it returns 100 rows and a counter reading "100 records", exactly as it would
-- if the property had 100 documents and no more.
--
-- So a search matching 3,000 instruments comes back looking like a complete answer of 100. A
-- surveyor would build a chain of title on it with nothing to suggest anything was missing. That is
-- the same defect this document opened with, in its most convincing disguise yet.
--
-- Landing exactly on the cap is the only available signal, and it cannot distinguish "exactly 100
-- exist" from "thousands exist". So it is REPORTED rather than resolved: every capped result now
-- carries "TRUNCATED — the true total is UNKNOWN and probably larger", and the adapter exposes
-- `lastResultTruncated` for a caller to act on.
--
-- Narrowing dimensions the form does offer: 160 document-type checkboxes, legal-description fields,
-- and a fuller party name.
--
-- ── A CORRECTION IN THE SAME PASS ───────────────────────────────────────────────────────────────
--
-- The adapter claimed this vendor offers no legal-description search. It does — the form carries
-- txtLDBook, txtLDLot, txtLDSection, txtLDMapId and txtLDFreeForm. They have NOT been driven, which
-- is a smaller and different claim than "not offered". Saying the wrong one would send a researcher
-- to a courthouse for something the portal can answer.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'result_cap', 100,
           'has_pagination', false,
           'cap_note', 'The portal returns at most 100 rows and offers NO pager. Verified: SMITH, SMITH JAMES and ENSERCH each returned exactly 100; ZZYZX returned 0. The first/prev/next/last controls belong to the document DETAIL view, not the results list.',
           'silent_truncation', true,
           'silent_truncation_note', 'Unlike Tyler (over-limit banner) or Avenu (timeout modal), NOTHING announces that the result is partial — 100 rows and a "100 records" counter look exactly like a complete answer. Landing on the cap is the only signal, and it cannot distinguish "exactly 100 exist" from "thousands exist".',
           'truncation_handling', 'Every capped result carries "TRUNCATED — the true total is UNKNOWN and probably larger"; the adapter exposes lastResultTruncated.',
           'narrowing_dimensions', '160 document-type checkboxes, legal-description fields (txtLDBook/Lot/Section/MapId/FreeForm), fuller party name',
           'legal_description_search', 'EXISTS on the form but NOT driven — a smaller claim than "not offered". The adapter previously said this vendor offers none, which was wrong.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bastrop';
