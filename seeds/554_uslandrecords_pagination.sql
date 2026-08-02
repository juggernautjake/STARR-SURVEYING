-- 554_uslandrecords_pagination.sql — the last page-one-only vendor (plan R39).
--
-- Falls and Robertson read 20 rows and stopped. Robertson's own counter said 239.
--
-- Two things fixed it, and the second is the interesting one.
--
-- ── 1. ASK FOR MORE ROWS BEFORE PAGING ──────────────────────────────────────────────────────────
--
-- The grid defaults to 20 rows and offers 20/50/100 as page-size buttons (#DocList1_PageView100Btn).
-- Raising it first is strictly better than walking a pager: fewer round trips, no postback
-- sequencing, and no chance of a record shifting page mid-walk. Robertson's 239-row search drops
-- from 12 pages to 3, and the whole search from 53 seconds to 6.
--
-- ── 2. THE WAIT WAS WATCHING A ROW THAT NEVER CHANGES ───────────────────────────────────────────
--
-- Paging still stopped after one page even though the Next control fired correctly. The pager is
-- #DocList1_LinkButtonNext — an ASP.NET postback link. Matching on the text "Next" instead picks up
-- a plain <td> that renders the same word and is not clickable.
--
-- But the real reason was the readiness condition. It waited for "the first row containing a date"
-- to change — and that row is the SEARCH CRITERIA SUMMARY ("Date From: 1/1/1800 Date Thru:
-- 7/30/2026"), which is identical on every page. The condition could never be satisfied, the wait
-- timed out, and the walk concluded there were no more pages.
--
-- This is the third time in this build that a readiness condition satisfiable by page furniture
-- produced a wrong answer, after the Tyler menu and this vendor's own certification banner. The
-- fix is the same each time: wait for the thing you actually need, not for something that resembles
-- it. Here that means a cell which is EXACTLY a date — a record's file date — never the summary
-- text that merely contains one.
--
-- ── DRIVEN ──────────────────────────────────────────────────────────────────────────────────────
--
--     Falls       grantor SMITH JAMES    39 documents from ALL 40 rows,  2 pages
--     Robertson   grantor SMITH JAMES   220 documents from ALL 239 rows, 3 pages, spanning 1839–2025
--
-- Zero duplicates in either. Robertson now reaches 1839 — thirty years deeper than the first page
-- alone showed, and well inside the 1800 coverage its banner claims.
--
-- The INCOMPLETE warning disappeared on its own once everything was read, which is the useful
-- proof: the completeness reporting is accurate in BOTH directions, not just pessimistic.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'pagination', 'IMPLEMENTED — page size raised to 100, then walks the pager',
           'default_page_size', 20,
           'page_size_control', '#DocList1_PageView100Btn (offers 20/50/100)',
           'pager_control', '#DocList1_LinkButtonNext — an ASP.NET postback link. Matching the TEXT "Next" hits a plain <td> that is not clickable.',
           'pagination_wait', 'Wait for the first cell that is EXACTLY a date to change. Waiting on "the first row containing a date" watches the search-criteria summary, which is identical on every page, so the walk stops after one.',
           'dedupe', 'By citation + file date across pages.',
           'max_pages', 100,
           'completeness_reporting', 'States "INCOMPLETE — the grid reported N row(s) but only M were read" when short, and claims nothing at all when the grid states no total.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Falls', 'Robertson');

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object('pagination_proof', 'Grantor SMITH JAMES: 220 documents from ALL 239 rows across 3 pages, 0 duplicates, spanning 1839–2025. Previously returned 20.'),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Robertson';

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object('pagination_proof', 'Grantor SMITH JAMES: 39 documents from ALL 40 rows across 2 pages, 0 duplicates. Previously returned 20.'),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Falls';
