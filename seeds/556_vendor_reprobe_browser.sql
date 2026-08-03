-- 556_vendor_reprobe_browser.sql — re-probing the "dead" vendors properly (plan R39).
--
-- CountyFusion turned out to be alive on a TLD our registry had wrong, and `fetch` also fails
-- against those hosts with ERR_HTTP2_STREAM_ERROR while a browser loads them fine. That made every
-- fetch-based "dead" verdict suspect, so all 40 remaining URLs were re-probed in a real browser.
--
-- ── THE VERDICT HELD FOR ALL THREE ──────────────────────────────────────────────────────────────
--
--     Henschen   16/16   ERR_NAME_NOT_RESOLVED — `<county>.co.texas.us` is not a real pattern
--     iDocket    18/18   HTTP 404 — the host resolves, the paths do not
--     Fidlar      6/6    ERR_NAME_NOT_RESOLVED
--
-- So R37 was right about these three and wrong only about CountyFusion. Recorded so nobody re-runs
-- the sweep hoping a browser will find something: it already has been re-run, that way, and it did
-- not. A confirmed negative is worth writing down — it is the difference between a closed question
-- and a suspicion that costs an afternoon every time somebody rediscovers it.
--
-- ── iDOCKET WAS NEVER A DEEDS VENDOR ────────────────────────────────────────────────────────────
--
-- online.idocket.com is alive and is JUDICIAL CASE SEARCH — court cases, not land records. Its
-- counties were in a clerk-deeds registry by mistake. Searching a court docket for a warranty deed
-- returns nothing, and that nothing would have been recorded as "this property has no deeds".
--
-- ── AND IT LED TO iDOCMARKET ────────────────────────────────────────────────────────────────────
--
-- The land-records product is iDocMarket. Its Basic Search opens with NO LOGIN. Seven Texas
-- counties: Bosque (BOSTX1), Glasscock, Hartley, Hemphill, Lamb, Reagan, Sutton. Only Bosque is
-- inside the 80-mile ring; the rest are recorded because finding them cost nothing and re-finding
-- them would not.
--
-- Bosque's iDocMarket index states 2012–2026 and the search form is fully exposed (date range,
-- document number, book/volume/page, party name, party type). The search was NOT driven to results,
-- so it is recorded as located, not working.
--
-- ── THE FINDING WORTH THE MOST HERE: BOSQUE'S TWO FREE INDEXES DO NOT MEET ──────────────────────
--
--     Kofile QuickLink   1847 – 1905     free, no login
--     iDocMarket         2012 – 2026     free to search, no login
--     ------------------------------------------------------------
--     NEITHER            1906 – 2011     a hole a century wide
--
-- A deed recorded in 1950 is in neither index. Both searches return nothing, and TWO empty results
-- look like a thorough search that found nothing — which is the most convincing possible way to be
-- wrong about whether a deed exists. `bosqueGapWarning()` names the gap and sends the researcher to
-- the clerk in Meridian or to a paid subscription.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'reprobed_in_browser', true,
           'reprobed_at', '2026-08-02',
           'reprobe_result', 'CONFIRMED DEAD in a real browser, not merely by fetch. Do not re-run this sweep.',
           'reprobe_note', 'CountyFusion was alive on a corrected TLD, which made every fetch-based verdict suspect. These three were re-tested the stronger way and did not come back.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND a.config->>'system' IN ('henschen', 'idocket', 'fidlar');

-- Bosque: two free windows and the hole between them.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'second_portal', 'https://www.idocmarket.com/BOSTX1/Document/Search',
           'second_portal_system', 'idocmarket',
           'second_portal_access', 'Basic Search opens with NO login. Coverage stated 2012-2026. Form exposes date range, document number, book/volume/page, party name and party type. NOT driven to results — located, not working.',
           'free_coverage_gap', '1906-2011 is in NEITHER free index',
           'gap_warning', 'A deed from 1906-2011 is in neither QuickLink (ends 1905) nor iDocMarket (begins 2012). BOTH searches return nothing, and two empty results are not evidence the deed does not exist. Obtain from the clerk in Meridian or a paid iDocMarket subscription.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bosque';

-- iDocket's counties: say plainly that the vendor indexes COURT CASES, not deeds.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'vendor_misclassified', true,
           'misclassification_note', 'online.idocket.com is Judicial Case Search — COURT CASES, not land records. These counties were in a clerk-deeds registry by mistake. Searching a court docket for a warranty deed returns nothing, and that nothing would read as "this property has no deeds".'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND a.config->>'system' = 'idocket';
