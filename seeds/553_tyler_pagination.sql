-- 553_tyler_pagination.sql — page one was never the answer (plan R39).
--
-- The Tyler adapter read the first page of results and returned it. Tyler serves 100 cards per page
-- and states the rest in its own banner:
--
--     "Showing page 1 of 5 for 436 Total Results"
--
-- So a search that matched 436 documents returned 100, with nothing marking it short. That is worse
-- than an empty result, not better: an empty result at least looks like a question, whereas 100
-- documents look like an answer. A surveyor would have built a chain of title on a quarter of the
-- county's records and had no reason to doubt it.
--
-- The walker now advances through the pager's "Next" control — results live in session state, so
-- there is no page-2 URL to request — and waits for the banner's page number to actually change
-- before reading. Clicking Next and reading immediately re-reads the page just left, which returns
-- the same 100 documents twice and stops early.
--
-- Records are deduplicated by instrument number across pages: a record shifting between pages while
-- the walker moves through them would otherwise appear twice, and a duplicated deed reads as two
-- conveyances of the same land.
--
-- ── DRIVEN ──────────────────────────────────────────────────────────────────────────────────────
--
-- McLennan, grantee SMITH, 2025: 196 documents across 2 pages, 0 duplicates, 160 carrying legal
-- descriptions, spanning 01/02/2025 to 12/30/2025. Before this change the same search returned 100.
--
-- ── AND IT SAYS SO WHEN IT FALLS SHORT ──────────────────────────────────────────────────────────
--
-- `describeCompleteness()` states "INCOMPLETE — the portal reported N page(s) but only M were read"
-- whenever the walk stops early, and reports any shortfall against the portal's own total. A short
-- answer that claims to be complete is worse than a short answer that admits it is not.
--
-- Bounded at 200 pages: a pager that never disables Next would otherwise hang a research run.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'pagination', 'IMPLEMENTED — walks every page via the pager''s Next control',
           'page_size', 100,
           'pagination_note', 'Results live in session state; there is no page-2 URL. Advance with Next and wait for the banner page number to change before reading, or the same page is read twice.',
           'dedupe', 'By instrument number across pages — a record shifting page while walking would otherwise read as two conveyances.',
           'max_pages', 200,
           'completeness_reporting', 'Reports "INCOMPLETE — the portal reported N page(s) but only M were read" whenever the walk stops early.',
           'pagination_proof', 'McLennan grantee SMITH 2025: 196 documents across 2 pages, 0 duplicates, 160 with legal descriptions, 01/02/2025–12/30/2025. The same search previously returned 100.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('McLennan', 'Burnet', 'Hamilton', 'Hill', 'Mills', 'Erath', 'Navarro', 'Somervell', 'Williamson');
