-- 542_kofile_verified_fieldmap.sql — the Kofile search, read off the live DOM (plan R37/R38).
--
-- ── THE FINDING THAT MATTERS ────────────────────────────────────────────────────────────────────
--
-- `kofile-clerk-adapter.ts` builds its searches as:
--
--     {baseUrl}/results?searchOper=instrument&searchString=…
--
-- The PATH is right. The QUERY PARAMETERS are not: the live site ignores `searchOper` and
-- `searchString` entirely and wants `q`, `department` and `recordedDateRange`. Verified against
-- Milam on 2026-08-02 —
--
--     /results?searchOper=instrument&searchString=2019-3389        →   0 rows, no error
--     /results?department=RP&limit=50&offset=0&q=2019-3389
--             &recordedDateRange=18000101,20260802&searchOcrText=false  →  50 rows of 220,777
--
-- **The zero-row outcome is worse than a 404 would be.** A 404 fails loudly and a health check
-- catches it; a results page that renders correctly and lists nothing is indistinguishable from
-- "this property has no records" — so every search through this adapter has been returning an empty
-- index as though it were an answer.
--
-- Bell's adapter is marked `active` in this table and is broken in exactly this way. This is the
-- scenario R7/R8/R9 were built for, except nothing had ever run the check against a live county, so
-- nobody found out. This seed records what the truth is; the code fix is separate.
--
-- ── VERIFIED, NOT ASSUMED ───────────────────────────────────────────────────────────────────────
--
-- Every field below was read off the rendered page: the search box is `#basicSearchInputBox`, the
-- scope radios are `search-scope` with values `withOcr`/`withoutOcr`, and the results table's seven
-- columns are named by the site itself. A search for "SMITH" on Milam returned **220,777 records**,
-- so the shape is confirmed against real data rather than an empty state.

UPDATE research_site_adapters a
SET
  field_map = jsonb_build_object(
    -- Read from the live results table's own <th> text.
    'results_columns', jsonb_build_array(
      'Grantor', 'Grantee', 'Doc Type', 'Recorded Date', 'Doc Number', 'Book/Volume/Page', 'Legal Description'
    ),
    -- The first three <td> of each row are icon/checkbox cells with no text; a parser that maps
    -- column N to header N without this offset reads the grantor as blank.
    'results_leading_blank_cells', 3,
    'row_selector', 'table tbody tr',
    'cell_selector', 'td',
    'search_input_selector', '#basicSearchInputBox',
    'scope_radio_name', 'search-scope',
    'scope_values', jsonb_build_array('withoutOcr', 'withOcr')
  ),
  config = a.config
    || jsonb_build_object(
         'system', 'kofile',
         'survey_status', 'dom_verified',
         'dom_verified_at', '2026-08-02',
         -- What actually works. `{q}` is the search term; the date range is inclusive and required.
         'results_path_template', '/results?department=RP&limit={limit}&offset={offset}&q={q}&recordedDateRange={from},{to}&searchOcrText={ocr}',
         'default_limit', 50,
         'search_placeholder', 'Search for grantor/grantee, subdivision, doc type, or doc#',
         -- The site prints how current its index is ("Certified through 07/30/2026"). Worth reading
         -- on every run: a chain that stops in 2024 because the index does is not a gap in our work.
         'certified_through_selector_text', 'Certified through',
         'anonymous_search', true,
         'sign_in_is_optional', true,
         'captcha_present', false,
         'broken_query_shape', 'searchOper/searchString are ignored by the live site and return 0 rows with no error — worse than a 404, because an empty results page reads as "no records for this property"',
         'notes', 'Search URL shape and field map read off the live DOM on 2026-08-02; a "SMITH" search on Milam returned 220,777 records. The adapter code still builds the searchOper/searchString query, which returns zero rows silently — that is a code fix, not a config one.'
       ),
  updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Bell', 'Travis', 'Williamson', 'Milam', 'Walker', 'Leon', 'Montgomery', 'Madison');

-- ── The appraisal side ──────────────────────────────────────────────────────────────────────────
--
-- Bell CAD's esearch presents a CAPTCHA. R12's rule is that a captcha is only solved where the
-- county's terms are confirmed to permit automation, and `automation_posture` here is 'unknown' —
-- which is a refusal, not a shrug. Recording it means the run explains itself instead of failing
-- mysteriously, and it puts a specific question in front of the owner.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'system', 'esearch',
           'survey_status', 'dom_verified',
           'dom_verified_at', '2026-08-02',
           'captcha_present', true,
           'search_fields', jsonb_build_array('OwnerName', 'PropertyType', 'DoingBusinessAs', 'Year'),
           'notes', 'esearch property search with a CAPTCHA on the search form. R12 refuses to solve it while automation_posture is "unknown" — the owner must read this district''s terms before it can be automated.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'appraisal_cad'::research_site_type_enum
  AND c.name = 'Bell';

-- Williamson CAD redirected to a tracking URL and rendered no form — an interstitial or bot check
-- rather than a search page. Recorded rather than guessed at.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'survey_status', 'survey_blocked',
           'surveyed_at', '2026-08-02',
           'notes', 'Redirected to a tracking URL (tr_uuid/fp parameters) and rendered no form — an interstitial or bot check stands in front of the search page. Needs a person to look before an adapter is attempted.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'appraisal_cad'::research_site_type_enum
  AND c.name = 'Williamson';
