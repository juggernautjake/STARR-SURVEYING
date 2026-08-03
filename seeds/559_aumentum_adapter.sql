-- 559_aumentum_adapter.sql — Bastrop routed through a real adapter (plan R39).
--
-- Seed 558 recorded Bastrop's search as driven but unrouted, because no adapter class existed for
-- Harris/Aumentum. It exists now: AumentumClerkAdapter, with AumentumResultsParser behind it, and
-- Bastrop routes to it. Twenty-one counties are now served by a proven adapter.
--
-- ── THE GRID IS A FLAT CELL SEQUENCE ────────────────────────────────────────────────────────────
--
-- `#Table1` is not one <tr> per record. Like Avenu's grid it renders the records run together, so
-- per-row parsing returns exactly one record however many came back. Records are cut at each cell
-- that is EXACTLY a date — the filing date, which is the only reliable boundary.
--
-- ── THE PARTY SUMMARY IS THE SOURCE OF TRUTH ────────────────────────────────────────────────────
--
-- Each record carries a cell listing every party inline with its role marker:
--
--     [E] SMITH JAMES (+) [R] JENSEN DONALD (+)
--
--     [R] = grantoR      [E] = grantEe
--
-- The individual name cells sit at UNSTABLE offsets — they shift with how many parties a document
-- has, and blank cells pad unpredictably — so counting positions would attribute the wrong name to
-- the wrong side of a conveyance. Parsing the summary is both simpler and safer. The marker mapping
-- is confirmed against the search form's own party-type radio values rather than guessed.
--
-- The `(+)` "and others" marker is KEPT. Dropping it would silently turn a conveyance by several
-- people into one by a single person.
--
-- ── MULTI-PARTY RECORDS ARE MERGED, NOT DUPLICATED ──────────────────────────────────────────────
--
-- Records sharing an instrument number and filing date are the same document listed once per party,
-- exactly as on eDocTec and Avenu. The first run returned 66 rows with 11 duplicates; merging by
-- instrument+date and unioning the party lists gives 55 documents with none.
--
-- Completeness is measured against BOUNDARIES, not merged documents: the grid counts rows, and
-- merging legitimately yields fewer documents than rows. Comparing merged totals would cry
-- INCOMPLETE on a complete read.
--
-- ── DRIVEN THROUGH THE COMPILED ADAPTER ─────────────────────────────────────────────────────────
--
--     Grantor "SMITH JAMES" → 55 documents from 100 grid rows, 0 duplicates,
--     every one carrying BOTH parties. Oldest 10/24/1974, and the coverage warning fires
--     correctly when the caller asks for years before 1973.
--
--     2325  10/24/1974  DEED OF TRUST   JENSEN DONALD (+) -> SMITH JAMES (+)
--     5554  08/23/1979  MECHANICS LIEN  SMITH JAMES (+)   -> JONES EARL (+)
--     4164  07/01/1982  (other)         SMITH JAMES (+)   -> ENSERCH EXPLORATION INC
--
-- ── WHAT IS STILL NOT BUILT ─────────────────────────────────────────────────────────────────────
--
-- Instrument-number and book/page search both have form fields and have NOT been driven; each
-- throws rather than returning an empty array, because [] would read as "no such document
-- recorded". Image retrieval goes through the site's basket flow and is not wired up. Pagination
-- past the first 100 rows is not implemented, and any shortfall is reported as INCOMPLETE.

UPDATE research_site_adapters a
SET status = 'active'::research_adapter_status_enum,
    config = a.config
      || jsonb_build_object(
           'survey_status', 'driven_end_to_end',
           'adapter_class', 'AumentumClerkAdapter',
           'routed', true,
           'grid_shape', 'A flat cell sequence in #Table1 — cut records at cells that are EXACTLY a date. Per-row parsing returns one record however many came back.',
           'party_source', 'The [R]/[E] summary cell, NOT the individual name cells — those sit at unstable offsets and counting positions attributes names to the wrong side.',
           'merge_rule', 'Records sharing instrument + filing date are one document listed once per party; merge and union the party lists.',
           'completeness_basis', 'Compared against grid ROWS (date boundaries), not merged documents — merging legitimately yields fewer documents than rows.',
           'live_proof', 'Grantor SMITH JAMES through the compiled adapter: 55 documents from 100 grid rows, 0 duplicates, every one with both parties; oldest 10/24/1974.',
           'not_built', 'Instrument-number search, book/page search, image retrieval and pagination past the first 100 rows. Each throws rather than returning [], because an empty array would read as "no such document recorded".',
           'supersedes_seed', 558
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bastrop';
