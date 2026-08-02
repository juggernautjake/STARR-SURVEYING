-- 545_kofile_department_codes.sql — the department code is per county (plan R38).
--
-- Driving each county's OWN search form and reading the address bar it produced (2026-08-02) showed
-- two things the guessed URL had wrong.
--
-- ── 1. THE PARAMETER NAMES ──────────────────────────────────────────────────────────────────────
--
-- The site emits `searchValue` + `searchType=quickSearch` + `keywordSearch=false`, not `q`. Both
-- return rows on the counties that work, but they are DIFFERENT SEARCHES: on Milam, "SMITH" gives
-- 5,484 through the quick search and 220,777 through `q`. The first is the indexed grantor/grantee
-- lookup; the second is a broad keyword sweep. A name search wants the narrow one, and reporting
-- 220,777 hits for a surname would bury the actual conveyances.
--
-- ── 2. THE DEPARTMENT CODE IS NOT A CONSTANT ────────────────────────────────────────────────────
--
-- Williamson's own form defaults to `department=CCM` with a date range of 1904–1999 — county court
-- minutes, not real property. A deed search there returns nothing, which is why it looked broken.
-- Milam's is `RP`. Travis and Madison reject `RP` outright, so theirs is something else again.
--
-- This is the "one vendor, many deployments" lesson for the third time: base URL (R8b), column set
-- (R38), and now department code. Each is per county, and each is repairable from this registry
-- rather than by cutting a release.

UPDATE research_site_adapters a
SET config = a.config || jsonb_build_object('department', 'RP'),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Milam', 'Leon', 'Bell', 'Walker', 'Montgomery');

-- Re-proven on 2026-08-02 with the site's own parameter names: 50 rows parsed from each, and the
-- counts are now precise name matches rather than keyword sweeps.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'parse_proven_note', v.note,
           'query_shape', 'department={dept}&searchType=quickSearch&searchValue={term}&keywordSearch=false&recordedDateRange={from},{to}&searchOcrText=false&limit={limit}&offset={offset}'
         ),
    updated_at = now()
FROM (VALUES
  ('Milam',      '50 parsed of 5,484 matches for "SMITH" (quick search, department RP).'),
  ('Leon',       '50 parsed of 14,953.'),
  ('Bell',       '50 parsed of 54,015. Instrument format DEPU-000021 among them.'),
  ('Walker',     '50 parsed of 12,843.'),
  ('Montgomery', '50 parsed of 106,309, from a 17-column table in a different order.')
) AS v(county_name, note)
JOIN research_counties c ON c.name = v.county_name
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum;

-- The three still blocked, with what is now a precise next step rather than "it did not work".
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'parse_blocker', v.reason,
           'blocker_next_step', 'Open the county''s quick search, run one search, and read the department code out of the resulting URL. It is a single value, and it is the only thing missing.'
         ),
    updated_at = now()
FROM (VALUES
  ('Williamson', 'Its own form defaults to department=CCM (county court minutes, indexed 1904-1999), so a deed search returns nothing. Needs its real-property department code — the portal works, the code is wrong.'),
  ('Travis',     'Rejects department=RP with a search error. Its form hydrates too slowly to drive unattended, so the code could not be read automatically.'),
  ('Madison',    'Rejects department=RP, OPR, LP and the parameter omitted. Its form hydrates too slowly to drive unattended.')
) AS v(county_name, reason)
JOIN research_counties c ON c.name = v.county_name
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum;
