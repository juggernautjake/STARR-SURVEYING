-- 555_remaining_counties_survey.sql — the last six counties, and a typo that cost a vendor (R39).
--
-- ── COUNTYFUSION WAS NEVER DEAD ─────────────────────────────────────────────────────────────────
--
-- R37 probed every CountyFusion base URL and concluded the vendor was unreachable. It is not. Our
-- own table had the wrong TLD:
--
--     WRONG   countyfusion7.kofiletech.com    ERR_NAME_NOT_RESOLVED — the domain does not exist
--     RIGHT   countyfusion7.kofiletech.us     200, "Neumo Records County Access Portal"
--
-- All TWELVE numbered hosts answer on .us. So "all 54 vendor URLs are dead" was, for this vendor, a
-- fact about a typo in our registry rather than about the vendor.
--
-- A second lesson sits underneath it, and it is the more dangerous one: that sweep used `fetch`,
-- and `fetch` fails against these hosts with ERR_HTTP2_STREAM_ERROR even though a browser loads
-- them without complaint. A negative result from the wrong CLIENT is not evidence a site is down —
-- the same shape of mistake as a negative result from a guessed URL, and it cost a whole vendor.
--
-- CountyFusion is still NOT routed. Every per-county entry point is a username/password login and
-- no credentials exist. "The host is alive" and "we can read records" are different claims, and
-- collapsing them is how this platform came to claim 53 Kofile counties it could not reach.
--
-- ── THE SIX COUNTIES ────────────────────────────────────────────────────────────────────────────
--
--   Bosque      OPEN (partial)   kofilequicklinks.com/Bosque/ — free, no login, 1847–1905.
--                                1984→current is on iDocMarket at $5/day + $1/page.
--   Limestone   LOGIN REQUIRED   countyfusion10.kofiletech.us — records 1861→present, credentials unknown.
--   Bastrop     NOT FOUND        not yet hunted.
--   Hays        NOT FOUND        Henschen claims it; no Henschen URL resolves; no replacement located.
--   Lee         NOT FOUND        not yet hunted.
--   San Saba    NOT FOUND        not yet hunted.
--
-- Bosque is a real win despite the partial window: for boundary work the early deeds are frequently
-- the operative ones, so a free 1847–1905 index is worth more than the year count suggests.
--
-- `freePathWarning()` refuses to let a search run outside a county's free window without saying so.
-- Searching Bosque's free index for a 1995 deed returns nothing, and calling that "no deed" would be
-- wrong twice: the deed exists, and we know exactly where it is. Saying so turns a wrong answer into
-- a purchasing decision.
--
-- "NOT FOUND" here means an unfinished search. It does NOT mean a county without records.

UPDATE research_site_adapters a
SET base_url = 'https://kofilequicklinks.com/Bosque/',
    config = a.config
      || jsonb_build_object(
           'system', 'kofile_quicklink',
           'survey_status', 'open_partial',
           'surveyed_at', '2026-08-02',
           'free_coverage', '1847-1905 deed index books and volumes',
           'free_access', 'No login, no payment. Search by index book type/year/party, plus book/volume/page lookup.',
           'paid_remainder', 'Records 1984 to current are on iDocMarket: $5/day + $1/page, $50/week, or $100/month.',
           'notes', 'Partial free window, but for boundary work the early deeds are frequently the operative ones.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Bosque';

UPDATE research_site_adapters a
SET base_url = 'https://countyfusion10.kofiletech.us/countyweb/login.do?countyname=LimestoneTX',
    config = a.config
      || jsonb_build_object(
           'system', 'countyfusion',
           'survey_status', 'login_required',
           'surveyed_at', '2026-08-02',
           'coverage_claimed', '1861 to present',
           'blocker', 'Username/password login; no guest entry found.',
           'not_routed_reason', 'Reachable, not readable. The host answers but we hold no credentials.',
           'vendor_correction', 'This portal is the proof that CountyFusion was never dead — the registry had kofiletech.com, which does not resolve. The live TLD is kofiletech.us.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum AND c.name = 'Limestone';

-- The four still unfound. Recorded as an UNFINISHED SEARCH, explicitly not as an absence of records.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'survey_status', 'portal_not_found',
           'surveyed_at', '2026-08-02',
           'meaning', 'An unfinished search. This is NOT a county without records, and must never be reported as one.',
           'method_note', 'No vendor URL pattern generalises; each county has to be found from its own site.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Bastrop', 'Hays', 'Lee', 'San Saba');
