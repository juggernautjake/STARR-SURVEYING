-- 547_williamson_tyler_portal.sql — Williamson's land records, found (plan R38).
--
-- Williamson is 28 miles from Bell and on the owner's list (Round Rock, Georgetown, Hutto). Its
-- Kofile portal exposes ONLY Commissioners Court, so every deed search there returned an empty page
-- — which reads as "this property has no deeds".
--
-- Its land records are on Tyler Host:
--
--     https://williamsoncountytx-web.tylerhost.net/williamsonweb/
--
-- Verified 200 on 2026-08-02 (it redirects to a disclaimer page, which is normal Tyler Eagle
-- behaviour). Found by reading the county clerk's own page rather than by guessing a URL.
--
-- ── THE PATTERN DOES NOT GENERALISE ─────────────────────────────────────────────────────────────
--
-- The obvious next move — apply `<county>countytx-web.tylerhost.net/<county>web/` to every other
-- county — was tried and does not work. Hays, Bastrop and Coryell do not resolve at all; McLennan
-- returns 404. Recorded so nobody spends the afternoon rediscovering it: each county's portal has to
-- be found from that county's own site.
--
-- This is the same lesson as the Kofile department code and the results column set. One vendor, many
-- deployments, and nothing about one county is safe to assume about another.

UPDATE research_site_adapters a
SET base_url = 'https://williamsoncountytx-web.tylerhost.net/williamsonweb/',
    config = a.config
      || jsonb_build_object(
           'system', 'tyler_eagle',
           'survey_status', 'portal_found',
           'surveyed_at', '2026-08-02',
           'no_land_records', false,
           'kofile_portal', 'https://williamson.tx.publicsearch.us/ — Commissioners Court only, NO land records',
           'discovery_note', 'Land records are on Tyler Host, not on the county''s Kofile portal. Found from the county clerk''s own page (wilcotx.gov/countyclerk), verified 200. The Tyler Host URL pattern does NOT generalise — Hays, Bastrop and Coryell do not resolve and McLennan 404s.',
           'notes', 'Portal located but NOT driven: the Tyler adapter''s own base URLs were all found dead (see the vendor reachability sweep), so this URL needs a browser probe and a field map before it can be marked active.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Williamson';

-- Hays shows Tyler on its county site too, but no reachable Tyler Host URL was found. Recorded as a
-- lead rather than a location — the difference matters when somebody picks this up.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'survey_status', 'vendor_identified_url_unknown',
           'surveyed_at', '2026-08-02',
           'vendor_hint', 'tyler',
           'discovery_note', 'hayscountytx.gov references Tyler, but no Tyler Host URL resolved. The vendor is a lead; the portal has not been located.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Hays';
