-- 552_uslandrecords_proven.sql — Falls and Robertson work; seed 551 blamed the wrong thing (R39).
--
-- Seed 551 recorded that results "open in a popup window" which closed before navigating, and left
-- both counties unrouted. The popup was the site TESTING whether pop-ups are allowed. It had nothing
-- to do with results.
--
-- The real cause is smaller and more embarrassing: the form submits via <input type="submit">, and a
-- SYNTHETIC click — page.evaluate(() => el.click()) — does not submit it. No POST was ever sent. No
-- error, no change, nothing in the network log. That symptom reads as "the site is broken" when it
-- means "our click was not real". A trusted click submits immediately.
--
-- ── DRIVEN END TO END ───────────────────────────────────────────────────────────────────────────
--
--     Robertson   grantor SMITH JAMES   20 documents on page 1 of 239 rows, earliest 09/13/1871
--     Falls       grantor SMITH JAMES   20 documents on page 1 of  40 rows, earliest 06/03/1971
--
-- Falls's earliest result landing in 1971 confirms its 09/23/1970 coverage claim with data instead
-- of a banner.
--
-- ── THREE MORE TRAPS, ALL THE SAME TRAP ─────────────────────────────────────────────────────────
--
-- 1. A TIMEOUT IS NOT AN EMPTY INDEX. A bare surname across 1800–2026 returns a modal — "Your search
--    has reached the configured timeout period. Please narrow your search criteria" — and no rows.
--    Unhandled that is indistinguishable from "this name owns nothing in this county". It is the
--    third variant found in one day, after Kofile's empty department and Tyler's totalPages: 0.
--
-- 2. A READINESS CONDITION MET BY PAGE FURNITURE MANUFACTURES EMPTY ANSWERS. The wait was "a table
--    row containing a date" — but the certification banner ("Certified Date Range: 01/01/1800 thru
--    07/30/2026") is exactly that, and exists before any search runs. So the grid was read while
--    still empty and a 239-row result set was reported as "genuinely nothing recorded".
--
-- 3. THE GRID IS NOT ONE ROW PER RECORD. It renders as a SINGLE <tr> whose cells run the header
--    labels followed by every record's cells in sequence. Per-row parsing therefore yields exactly
--    one record regardless of how many the county returned — 239 rows read as one document. Records
--    are now cut at each date cell, which is the only reliable boundary.
--
-- ── WHAT IS STILL NOT DONE ──────────────────────────────────────────────────────────────────────
--
-- The grid paginates at 20 and only page one is read. That is REPORTED, not hidden: every result
-- carries "this is ONE PAGE of a larger result set — page through before concluding". Paging is the
-- next slice; silently returning 20 of 239 without saying so would be the same defect again.
--
-- There is no instrument number anywhere in this vendor: a document's identity is its
-- book/volume/page citation, and 19th-century volumes are LETTERED (OR/0000U/271), so the volume is
-- kept as a string. Parsing it as a number yields NaN and merges every lettered volume into one.

UPDATE research_site_adapters a
SET status = 'active'::research_adapter_status_enum,
    config = a.config
      || jsonb_build_object(
           'survey_status', 'driven_end_to_end',
           'surveyed_at', '2026-08-02',
           'requires_trusted_click', true,
           'trusted_click_note', 'A synthetic el.click() sends NO POST at all — no error, no change. Only a real page.click() submits.',
           'results_in_popup', false,
           'popup_note', 'The popup seen earlier was the site''s pop-up-blocker test, not the results target. Results render in the page.',
           'timeout_modal_means', 'TOO BROAD — narrow the search. It is NOT a report that no records exist.',
           'grid_shape', 'A SINGLE <tr> whose cells run header labels then every record in sequence. Cut records at each date cell; per-row parsing returns exactly one record.',
           'no_instrument_numbers', true,
           'citation_format', 'SERIES/VOLUME/PAGE, e.g. OR/00062/223. Volumes may be LETTERED (OR/0000U/271) — keep as string, never parse as a number.',
           'pagination', 'Grid pages at 20. Only page one is read; every result says so explicitly.',
           'supersedes_seed', 551,
           'correction', 'Seed 551 blamed a popup window. The cause was a synthetic click that never submitted the form.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Falls', 'Robertson');

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object('live_proof', 'Grantor SMITH JAMES through the compiled adapter: 20 documents on page 1 of 239 rows; earliest 09/13/1871, citation OR/0000U/271.'),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Robertson';

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object('live_proof', 'Grantor SMITH JAMES through the compiled adapter: 20 documents on page 1 of 40 rows; earliest 06/03/1971 — which confirms the 09/23/1970 coverage claim with data rather than a banner.'),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Falls';
