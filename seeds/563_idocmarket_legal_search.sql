-- 563_idocmarket_legal_search.sql — search by land, not by name (plan R39).
--
-- Every adapter in this build searches by PARTY. That is how a title company works, but it is not
-- how a surveyor works: a surveyor starts with a piece of ground and wants every instrument that
-- touched it. `searchByLegalDescription` is that search, and Bosque is the first county where it
-- exists.
--
-- ── THE COUNTY PUBLISHES A CONTROLLED VOCABULARY ────────────────────────────────────────────────
--
-- iDocMarket's Subdivision field is a <select>, not a text box. Bosque enumerates 396 subdivisions.
-- That is unusual and worth exploiting: "does this county have a subdivision called X" becomes
-- answerable EXACTLY, instead of being inferred from a search that returned nothing.
--
-- `listSubdivisions()` exposes the list. An exact match is searched through the dropdown, which is
-- the reliable path and the surveyor's normal case.
--
-- ── THE NEAR MISS IS THE WHOLE POINT ────────────────────────────────────────────────────────────
--
-- A term that LOOKS like a subdivision but is not in the county's list would, searched free-form,
-- return nothing — and that nothing reads as "no documents touch this land" when it actually means
-- "this county has no subdivision by that name". Those are different answers and only one is true.
--
-- So an unmatched term is REFUSED, with the near misses named:
--
--     "LAKE PLACE" is not an exact subdivision in this county's index, but 2 similar name(s)
--      exist: #1 LAKE PLACE PHASE 1, LAKE PLACE PHASE 1.
--
-- Text resembling no subdivision at all is passed to the free-form Legal field, because there the
-- caller genuinely meant free-form.
--
-- `matchSubdivision()` is a pure function so this decision is tested rather than merely observed.
--
-- ── DRIVEN ──────────────────────────────────────────────────────────────────────────────────────
--
--     listSubdivisions()                    → 396 names
--     legal="#1 LAKE PLACE PHASE 1"         → 5 of 5 results, all returned
--     legal="LAKE PLACE"                    → refused, with both real names offered
--
--     2025-03091  9/23/2025  RELEASE OF LIEN  PEOPLES BANK -> STRAUGHAN TRACY
--     2016-01976  6/9/2016   RELEASE OF LIEN  CENTRAL NATIONAL BANK -> FAUNCE GARY
--
-- ── STILL PARTY-ONLY ELSEWHERE ──────────────────────────────────────────────────────────────────
--
-- Aumentum has legal-description fields (txtLDBook/Lot/Section/MapId/FreeForm) that remain undriven.
-- Tyler's form has none. Kofile, eDocTec and Avenu are party/instrument indexes only. So searching
-- by land works in exactly one county so far, and the adapters that cannot do it say so rather than
-- returning an empty list.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'legal_description_search', 'IMPLEMENTED via the Subdivision dropdown (exact) with a free-form Legal fallback.',
           'subdivision_vocabulary', 396,
           'subdivision_note', 'The Subdivision field is a <select>, so "does this county have a subdivision called X" is answerable EXACTLY rather than inferred from an empty search. listSubdivisions() exposes it.',
           'near_miss_rule', 'A term resembling a subdivision but absent from the list is REFUSED with the near misses named. Searching it free-form would return nothing, and that nothing reads as "no documents touch this land" when it means "no subdivision by that name exists here".',
           'legal_search_proof', 'legal="#1 LAKE PLACE PHASE 1" → 5 of 5 results, all returned. legal="LAKE PLACE" → refused, offering #1 LAKE PLACE PHASE 1 and LAKE PLACE PHASE 1.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bosque';

-- Say plainly, on every other county, that searching by land is not available there yet.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'legal_description_search', 'NOT available on this vendor/adapter. Search by party or instrument. The adapter throws rather than returning an empty list, so this never reads as "no documents touch this land".'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Coryell', 'Lampasas', 'Falls', 'Robertson', 'McLennan', 'Burnet', 'Hamilton', 'Hill', 'Mills', 'Erath', 'Navarro', 'Somervell', 'Williamson');
