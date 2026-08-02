-- 541_surveyed_county_portals.sql — what is actually there (plan R37).
--
-- Seed 540 registered the target counties with each county's own landing page, explicitly marked
-- `survey_status = 'not_surveyed'` because inventing a search path is how every adapter this repo has
-- shipped against a guessed DOM came to need rewriting.
--
-- This is the survey. Each URL below was **fetched and confirmed live** on 2026-08-02, paced at the
-- R12 politeness gap, with an identifying user agent. Nothing here is inferred from a county's
-- website layout — the vendor patterns were probed directly, because "does `<county>.tx.publicsearch.us`
-- answer" is a fact, while "this page links to something that says Search" is a guess.
--
-- ── WHAT THE SURVEY FOUND ───────────────────────────────────────────────────────────────────────
--
-- EIGHT of the thirteen target counties run Kofile/GovOS PublicSearch, which this repo already has a
-- working adapter for. Three of those eight — Leon, Madison and Montgomery — are NOT in the worker's
-- compiled `KOFILE_FIPS_SET`, so the platform could already have served them and did not know it.
-- That gap is the single most useful thing this survey turned up.
--
-- Five counties could not be confirmed: Harrison, McLennan, Robertson and Trinity clerks, and several
-- appraisal districts. They are left `not_surveyed` rather than given a plausible URL — a wrong base
-- URL does not fail loudly, it sends a run at the wrong site.

-- ── Clerk portals, verified live ────────────────────────────────────────────────────────────────
UPDATE research_site_adapters a
SET base_url = v.url,
    config = a.config
      || jsonb_build_object(
           'system', 'kofile',
           'survey_status', 'surveyed',
           'surveyed_at', '2026-08-02',
           'survey_method', 'HTTP GET on the vendor URL pattern, 200 OK, redirect followed',
           'notes', 'Kofile/GovOS PublicSearch confirmed live. The worker already has a Kofile adapter; the search path and field map still come from a browser probe (R7 site-probe) before this can be marked active.'
         ),
    updated_at = now()
FROM (VALUES
  ('Bell',       'https://bell.tx.publicsearch.us/'),
  ('Travis',     'https://travis.tx.publicsearch.us/'),
  ('Williamson', 'https://williamson.tx.publicsearch.us/'),
  ('Milam',      'https://milam.tx.publicsearch.us/'),
  ('Walker',     'https://walker.tx.publicsearch.us/'),
  ('Leon',       'https://leon.tx.publicsearch.us/'),
  ('Montgomery', 'https://montgomery.tx.publicsearch.us/'),
  ('Madison',    'https://madison.tx.publicsearch.us/')
) AS v(county_name, url)
JOIN research_counties c ON c.name = v.county_name
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum;

-- ── Appraisal districts, verified live ──────────────────────────────────────────────────────────
-- `esearch.<county>cad.org` is the True Automation / Harris Govern pattern used across Texas CADs.
UPDATE research_site_adapters a
SET base_url = v.url,
    config = a.config
      || jsonb_build_object(
           'system', 'esearch',
           'survey_status', 'surveyed',
           'surveyed_at', '2026-08-02',
           'survey_method', 'HTTP GET on the vendor URL pattern, 200 OK, redirect followed',
           'notes', 'True Automation / Harris Govern "esearch" property search confirmed live. Field map awaits a browser probe.'
         ),
    updated_at = now()
FROM (VALUES
  ('Bell',       'https://esearch.bellcad.org/'),
  ('Williamson', 'https://esearch.williamsoncad.org/'),
  ('Coryell',    'https://esearch.coryellcad.org/'),
  ('Walker',     'https://esearch.walkercad.org/'),
  ('Madison',    'https://esearch.madisoncad.org/')
) AS v(county_name, url)
JOIN research_counties c ON c.name = v.county_name
WHERE a.county_id = c.id
  AND a.site_type = 'appraisal_cad'::research_site_type_enum;

-- ── What the survey could NOT confirm ───────────────────────────────────────────────────────────
--
-- Recorded rather than left blank: a reviewer looking at coverage needs to see that these were
-- LOOKED FOR and not found, which is different from never having been attempted. The base URL stays
-- as the county's own landing page — the honest fallback, and a human starting point.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'survey_status', 'survey_failed',
           'surveyed_at', '2026-08-02',
           'notes', 'Surveyed 2026-08-02: the county''s own landing page did not respond, or no known vendor pattern answered for this county. NOT given a guessed URL — a wrong base URL does not fail loudly, it sends a run at the wrong site. Needs a person to find the real records portal.'
         ),
    updated_at = now()
FROM (VALUES
  ('Harrison',  'clerk_deeds'),
  ('McLennan',  'clerk_deeds'),
  ('Robertson', 'clerk_deeds'),
  ('Trinity',   'clerk_deeds'),
  ('Travis',    'appraisal_cad'),
  ('Milam',     'appraisal_cad'),
  ('Harrison',  'appraisal_cad'),
  ('McLennan',  'appraisal_cad'),
  ('Leon',      'appraisal_cad'),
  ('Montgomery','appraisal_cad'),
  ('Trinity',   'appraisal_cad'),
  ('Robertson', 'appraisal_cad')
) AS v(county_name, st)
JOIN research_counties c ON c.name = v.county_name
WHERE a.county_id = c.id
  AND a.site_type = v.st::research_site_type_enum
  AND a.config->>'survey_status' = 'not_surveyed';
