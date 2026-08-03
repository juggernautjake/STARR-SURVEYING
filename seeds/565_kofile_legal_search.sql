-- 565_kofile_legal_search.sql — twenty counties could not search by land, silently (plan R39).
--
-- `KofileClerkAdapter.searchByLegalDescription` logged "Legal description search not supported" and
-- returned an EMPTY ARRAY.
--
-- Two things were wrong with that, and the second is far worse than the first.
--
-- It was factually wrong: standard PublicSearch DOES support full-text search, through the
-- `searchOcrText` parameter the adapter was already sending as `false` on every other query.
--
-- And it returned [] for an unsupported operation. A caller cannot distinguish that from "this land
-- has no documents". So the platform's answer to every legal-description search across TWENTY Kofile
-- counties — including BELL, the home county — was a silent, confident nothing.
--
-- That is this document's defect at its largest blast radius: not one county, not one vendor, but
-- the single search a surveyor most wants, answered wrongly everywhere it was offered.
--
-- ── THE TWO MODES ARE DIFFERENT SEARCHES, NOT BROADER AND NARROWER ──────────────────────────────
--
-- Driven on Bell 2026-08-02 with the term HAMMIL:
--
--     searchOcrText=false   23 results — matching PARTY NAMES (HAMMILL ERICA, HAMMILL ANDREW P JR)
--     searchOcrText=true     7 results — the term appears NOWHERE in the row
--
-- The second set matched the OCR'd text INSIDE the scanned documents. Turning OCR on does not widen
-- the index search; it runs a different one. Anybody assuming it is a superset would conclude that
-- 16 documents had vanished.
--
-- ── AN UNVERIFIED ROUTE WAS PREFERRED OVER A PROVEN ONE ─────────────────────────────────────────
--
-- Bell is flagged `hasSUPERSEARCH`, and the method tried that first. Driving it times out waiting
-- for a search input that does not exist on the page — the same class of unverified URL R37 found
-- across four vendors. SUPERSEARCH is now disabled here and the driven `searchOcrText` path wins.
-- Re-enable it per county only after driving it.
--
-- (A second, smaller bug fell out: superSearch() was called BEFORE initSession(), so it failed with
-- "Session not initialized" from inside a method that looked unrelated.)
--
-- ── DRIVEN ──────────────────────────────────────────────────────────────────────────────────────
--
--     Bell, full-text "HAMMIL" → 7 documents, reaching back to 1929:
--         2005038056  8/25/2005  AFFIDAVIT  MCDANNEL LINDA -> MORRIS WENDELL DWAYNE DECD
--         1929001426  7/6/1929   (other)    HAMILL F P MRS -> SLOON J A
--         1945003495  5/22/1945  (other)    ENNIS STATE BANK -> SHANNON J K
--
-- ── AN EMPTY FULL-TEXT RESULT NOW CARRIES ITS MEANING ───────────────────────────────────────────
--
-- Full-text searches the scanned page TEXT, so a document indexed under a legal description it never
-- spells out will not match. An empty result says so, and says to try a party search or a different
-- phrasing — rather than implying the land is unencumbered.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'legal_description_search', 'IMPLEMENTED via full-text (searchOcrText=true).',
           'legal_search_mode', 'OCR full-text of the scanned document body — NOT the property-description index.',
           'search_modes_differ', 'searchOcrText=false searches the INDEX (party names); =true searches the scanned DOCUMENT TEXT. They are different searches, not broader and narrower. Bell/HAMMIL: 23 vs 7 results, with no overlap visible in the rows.',
           'previous_behaviour', 'Returned an EMPTY ARRAY with a "not supported" log, across all twenty Kofile counties including Bell. Indistinguishable from "this land has no documents".',
           'supersearch_disabled', 'Bell is flagged hasSUPERSEARCH but driving it times out on a search input that does not exist. The proven searchOcrText path is used instead; re-enable per county only after driving it.',
           'legal_search_proof', 'Bell full-text "HAMMIL" → 7 documents, oldest 7/6/1929.',
           'empty_result_meaning', 'A full-text miss means the words do not appear in the scanned pages — NOT that no document touches the land. Stated on every empty result.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Bell','Bexar','Brazos','Coleman','Collin','Denton','Grimes','Johnson','Kendall','Leon',
                 'Madison','Medina','Milam','Montgomery','Nacogdoches','Nueces','Potter','Tarrant','Travis','Walker');
