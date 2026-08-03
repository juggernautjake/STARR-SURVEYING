-- 549_tyler_eagle_portals.sql — nine portals located, none claimed (plan R39).
--
-- ── R38'S CONCLUSION WAS WRONG ──────────────────────────────────────────────────────────────────
--
-- R38 probed `<county>tx-web.tylerhost.net`, found only Williamson, and concluded the Tyler Host
-- pattern "does not generalise". It does. The guess simply omitted a word:
--
--     WRONG   mclennantx-web.tylerhost.net          (404 / no such host)
--     RIGHT   mclennancountytx-web.tylerhost.net    (live)
--
-- Re-sweeping 40 counties with the corrected pattern found NINE live deployments — including
-- McLennan, which is Waco, and which R38 had recorded as a dead end. The lesson is not about Tyler:
-- a negative result from a guessed URL is evidence about the guess, not about the county.
--
-- ── WHAT WAS PROVEN ─────────────────────────────────────────────────────────────────────────────
--
--   * All nine subdomains serve a Tyler "Self-Service" app behind /user/disclaimer.
--   * The main menu loads ASYNCHRONOUSLY. A fixed wait reads a working portal as having no search.
--   * Search IDs are per deployment, like Kofile's department codes — McLennan's official public
--     record search is DOCSEARCH402S1, its marriage search DOCSEARCH392S3. Never hardcode across
--     counties.
--   * The full form field map was read off the live page (field_BothNamesID, field_GrantorID,
--     field_GranteeID, field_RecDateID_DOT_StartDate/EndDate, field_DocNumID, book/volume/page).
--   * The submit control is EXACTLY `a#searchButton`. A looser id match hits the hidden
--     `advancedSearchButton-<field>` links and opens a help dialog — indistinguishable, from the
--     outside, from a search that returned nothing.
--   * The index answers: typing SMITH returned real indexed parties from McLennan's own
--     autocomplete ("SMITH & BRATCHER INC", "SMITH & BRATCHER INCORPORATED").
--   * McLennan states its coverage: indexed from Jan 1, 1857 through Jul 30, 2026.
--   * RESULTS ARE JSON, NOT HTML. POST /web/searchPost/<SEARCHID> answers
--     {"validationMessages":{},"totalPages":N,"currentPage":1}. Scraping the DOM for a results
--     table finds nothing because there is no table — worth knowing before writing the adapter.
--
-- ── WHY NOTHING HERE IS ROUTED ──────────────────────────────────────────────────────────────────
--
-- That POST returns totalPages=0 for SMITH, with NO validation messages, on a county holding 169
-- years of records whose own autocomplete just listed Smiths. The search was accepted and answered
-- "nothing", and that contradicts the index.
--
-- The likely cause is that deep-linking to /search/<ID> skips a session step the disclaimer sets.
-- That is a hypothesis. A hypothesis is not a county's records.
--
-- So these are recorded as LOCATED, not active. `tyler` stays out of PROVEN_VENDORS and no county
-- routes here. Marking them covered on the strength of a 200 and a well-formed form is precisely
-- what produced 53 fictional Kofile counties.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'system', 'tyler_eagle',
           'survey_status', 'portal_located_results_not_driven',
           'surveyed_at', '2026-08-02',
           'disclaimer_path', '/user/disclaimer',
           'search_post_path', '/searchPost/<SEARCH_ID>',
           'search_ids_are_per_deployment', true,
           'results_format', 'JSON: {validationMessages, totalPages, currentPage} — NOT an HTML table',
           'submit_selector', 'a#searchButton',
           'menu_loads_async', true,
           'blocker', 'searchPost returns totalPages=0 with no validation messages for a name the portal''s own autocomplete confirms is indexed. Contradiction unresolved — treat every result from this vendor as UNREAD, never as empty.',
           'not_routed_reason', 'Located is not working. tyler stays out of PROVEN_VENDORS until one search is proven to return rows.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('McLennan', 'Burnet', 'Hamilton', 'Hill', 'Mills', 'Erath', 'Navarro', 'Somervell', 'Williamson');

-- Per-county base URLs. Eight use /web/; Williamson uses /williamsonweb/ — a single hardcoded path
-- would have lost it, which is the same shape of error as the missing word "county" above.
UPDATE research_site_adapters a
SET base_url = 'https://' || lower(replace(c.name, ' ', '')) || 'countytx-web.tylerhost.net/web/',
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('McLennan', 'Burnet', 'Hamilton', 'Hill', 'Mills', 'Erath', 'Navarro', 'Somervell');

UPDATE research_site_adapters a
SET base_url = 'https://williamsoncountytx-web.tylerhost.net/williamsonweb/',
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Williamson';

-- McLennan's own coverage statement, from its search page.
UPDATE research_site_adapters a
SET config = a.config || jsonb_build_object('index_coverage', 'Jan 1, 1857 through Jul 30, 2026 (stated by the portal)'),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'McLennan';
