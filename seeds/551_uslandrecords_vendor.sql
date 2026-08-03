-- 551_uslandrecords_vendor.sql — a third unknown vendor, and a 170-year gap (plan R39).
--
-- Found 2026-08-02 from Falls County's and Robertson County's own clerk pages: Avenu/Neumo's
-- "20/20 Perfect Vision Land Records", on per-county subdomains of uslandrecords.com.
--
--     Falls      https://i2i.uslandrecords.com/TX/Falls/D/        30 miles from Bell (Marlin)
--     Robertson  https://i2j.uslandrecords.com/TX/Robertson/D/    45 miles from Bell (Franklin)
--
-- The subdomain is NOT derivable — Falls is i2i, Robertson is i2j, and every other county tried on
-- those subdomains 404s. Each had to be found from its own county site. That is now the third
-- vendor this platform did not know existed, after eDocTec and the corrected Tyler Host pattern.
--
-- ── SEARCHING IS FREE ───────────────────────────────────────────────────────────────────────────
--
-- Quoted from the portal: "Searching and watermarked document viewing is provided as a free
-- service." Printing/downloading costs $1.00 for the first 10 pages then $0.10/page; printing
-- search results costs $1.50/page. So the index — which is what research needs — is free.
--
-- ── THE 170-YEAR GAP, WHICH IS THE POINT OF THIS SEED ───────────────────────────────────────────
--
-- Each county publishes a certification banner, and the two DISAGREE enormously:
--
--     Robertson   certified 01/01/1800 → 07/30/2026   last doc 20263237 @ 07/31/2026
--     Falls       certified 09/23/1970 → 07/30/2026   last doc 23447    @ 07/31/2026
--
-- Same vendor, same software, 170 years apart. A 1940 Falls deed is NOT in this index. A search for
-- it returns nothing, and that nothing is a fact about Falls County's website — not about the land.
-- Reporting it as "no records found" would be this project's recurring defect, and a costly one:
-- those years exist on paper at the courthouse, so the answer is "drive to Marlin", not "no deed".
--
-- `coverageWarning()` refuses to let a search run past the start of a county's index without
-- saying so.
--
-- ── NOT ROUTED ──────────────────────────────────────────────────────────────────────────────────
--
-- The search was not driven to results. Clicking Search opens a POPUP WINDOW — the site warns "This
-- site uses Pop-ups" — observed opening as about:blank and closing before it navigated. Reading
-- results means handling that window, and that is not built.
--
-- So both counties still fall through to TexasFile. Located is not working, which is the same line
-- Tyler was held to until its results were actually read.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'system', 'uslandrecords_2020',
           'vendor', 'Avenu / Neumo — 20/20 Perfect Vision Land Records',
           'survey_status', 'portal_located_results_not_driven',
           'surveyed_at', '2026-08-02',
           'search_is_free', true,
           'fee_note', 'Searching and watermarked viewing free; printing/download $1.00 first 10 pages then $0.10/page; search results $1.50/page.',
           'results_open_in_popup', true,
           'blocker', 'Search opens a popup window (about:blank, closed before navigating). Handling that window is not built, so no result has been read.',
           'not_routed_reason', 'Located is not working. Both counties still fall through to TexasFile.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Falls', 'Robertson');

UPDATE research_site_adapters a
SET base_url = 'https://i2i.uslandrecords.com/TX/Falls/D/',
    config = a.config
      || jsonb_build_object(
           'index_certified_from', '09/23/1970',
           'index_certified_to', '07/30/2026',
           'coverage_warning', 'The online index begins 09/23/1970. Anything earlier is NOT here and an empty result says nothing about whether the deed exists — those years are on paper at the courthouse in Marlin. Report as UNSEARCHABLE ONLINE, never as "no records".'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Falls';

UPDATE research_site_adapters a
SET base_url = 'https://i2j.uslandrecords.com/TX/Robertson/D/',
    config = a.config
      || jsonb_build_object(
           'index_certified_from', '01/01/1800',
           'index_certified_to', '07/30/2026',
           'coverage_note', 'Indexes back to 1800 — 170 years deeper than Falls on the SAME vendor. Never infer one county''s coverage from another''s.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Robertson';
