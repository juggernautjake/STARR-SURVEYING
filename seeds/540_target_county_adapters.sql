-- 540_target_county_adapters.sql — the counties this firm works, registered (plan R36).
--
-- The owner named 23 places; they resolve to 13 counties (see the Phase H table in the plan doc).
-- All 254 Texas counties already exist in `research_counties` — what was missing is an ADAPTER row
-- per target county, so `/admin/research/coverage` shows them at all.
--
-- ── EVERY ROW HERE IS A DRAFT, ON PURPOSE ───────────────────────────────────────────────────────
--
-- `status = 'draft'` and `last_verified_at` left NULL means R11's coverage renders these as
-- **registered and unproven**, which is exactly what they are. Marking them 'active' would make the
-- dashboard claim thirteen counties are searchable when not one has been exercised — and R11 exists
-- precisely because an intent map was being read as a coverage map.
--
-- ── BASE URLS ARE THE COUNTY'S PUBLIC PORTAL, NOT A GUESSED SEARCH PATH ─────────────────────────
--
-- Each `base_url` below is the county's own public records landing page. The SEARCH path, the form
-- fields and the results shape are deliberately NOT invented here: R37 surveys the live sites and
-- fills `config`/`field_map` from what is actually there. Every adapter this repo has shipped
-- against a guessed DOM has needed rewriting, which is why R7, R8 and R9 exist.

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT
  c.id,
  'clerk_deeds'::research_site_type_enum,
  v.base_url,
  'browser',
  jsonb_build_object(
    'system', v.system,
    -- Read by R12's captcha gate. 'unknown' is a refusal, not a shrug: until somebody reads this
    -- county's terms, no captcha there will be solved.
    'automation_posture', 'unknown',
    -- Named so R37 has an explicit worklist rather than a guess about what is missing.
    'survey_status', 'not_surveyed',
    'notes', 'Registered from the owner''s county list (plan R36). Search path and field map await the live site survey (R37).'
  ),
  '{}'::jsonb,
  'draft'::research_adapter_status_enum,
  '{}'::jsonb,
  'plan-R36'
FROM (VALUES
  ('Milam',      'https://www.milamcounty.net/county-clerk',                    'unknown'),
  ('Harrison',   'https://www.co.harrison.tx.us/page/harrison.County.Clerk',    'unknown'),
  ('McLennan',   'https://www.mclennancounty.gov/166/County-Clerk',             'unknown'),
  ('Walker',     'https://www.co.walker.tx.us/department/index.php?structureid=12', 'unknown'),
  ('Leon',       'https://www.co.leon.tx.us/page/leon.County.Clerk',            'unknown'),
  ('Montgomery', 'https://www.mctx.org/departments/departments_a_-_c/county_clerk/index.php', 'unknown'),
  ('Trinity',    'https://www.co.trinity.tx.us/page/trinity.County.Clerk',      'unknown'),
  ('Madison',    'https://www.madisoncountytx.org/county-clerk',                'unknown'),
  ('Robertson',  'https://www.co.robertson.tx.us/page/robertson.County.Clerk',  'unknown')
) AS v(county_name, base_url, system)
JOIN research_counties c ON c.name = v.county_name
-- Never duplicate an adapter a previous seed or the worker's registry publish already created.
WHERE NOT EXISTS (
  SELECT 1 FROM research_site_adapters a
  WHERE a.county_id = c.id AND a.site_type = 'clerk_deeds'::research_site_type_enum
);

-- The appraisal district is the other core source R11 counts (CORE_SITE_TYPES). Registering it as a
-- draft makes the gap visible per county instead of leaving 'appraisal_cad' absent everywhere, which
-- reads as "not applicable" rather than "not built".
INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT
  c.id,
  'appraisal_cad'::research_site_type_enum,
  v.base_url,
  'browser',
  jsonb_build_object(
    'system', 'unknown',
    'automation_posture', 'unknown',
    'survey_status', 'not_surveyed',
    'notes', 'Registered from the owner''s county list (plan R36). Awaits the live site survey (R37).'
  ),
  '{}'::jsonb,
  'draft'::research_adapter_status_enum,
  '{}'::jsonb,
  'plan-R36'
FROM (VALUES
  ('Bell',       'https://bellcad.org/'),
  ('Travis',     'https://traviscad.org/'),
  ('Williamson', 'https://www.wcad.org/'),
  ('Milam',      'https://www.milamad.org/'),
  ('Harrison',   'https://www.harrisoncad.org/'),
  ('McLennan',   'https://www.mclennancad.org/'),
  ('Coryell',    'https://www.coryellcad.org/'),
  ('Walker',     'https://www.walkercad.org/'),
  ('Leon',       'https://www.leoncad.org/'),
  ('Montgomery', 'https://mcad-tx.org/'),
  ('Trinity',    'https://www.trinitycad.net/'),
  ('Madison',    'https://www.madisoncad.org/'),
  ('Robertson',  'https://www.robertsoncad.com/')
) AS v(county_name, base_url)
JOIN research_counties c ON c.name = v.county_name
WHERE NOT EXISTS (
  SELECT 1 FROM research_site_adapters a
  WHERE a.county_id = c.id AND a.site_type = 'appraisal_cad'::research_site_type_enum
);
