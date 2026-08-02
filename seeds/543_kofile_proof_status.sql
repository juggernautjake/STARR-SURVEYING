-- 543_kofile_proof_status.sql — which counties were actually PROVEN, one by one (plan R38).
--
-- Seed 542 recorded the Kofile search shape read off Milam's live DOM. Running that same shape
-- against three counties showed it is **not uniform across deployments**, which is the whole reason
-- R9 keeps a canary per county rather than one per vendor:
--
--   Milam    50 rows of   220,777   — works
--   Leon     50 rows of   547,747   — works
--   Madison   0 rows, "Error While Running Search: Error with search query"
--
-- Madison rejects `department=RP`. Dropping the parameter clears the error and still returns
-- nothing, so its index uses some other department code. One vendor, three deployments, two
-- behaviours — an adapter marked working because a sibling county worked is an adapter nobody has
-- tested.
--
-- ── WHY THESE STAY DRAFT ────────────────────────────────────────────────────────────────────────
--
-- Even the two that returned rows are left `draft`. A URL that lists results is not the same as an
-- adapter that parses them, follows a document, and comes back with an instrument — and R11's
-- coverage promise ("proven to read a page") means the second thing. `last_verified_at` stays NULL
-- until a real run does it.

-- Proven to return real, parseable rows.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'search_proven', true,
           'search_proven_at', '2026-08-02',
           'search_proven_note', v.note
         ),
    updated_at = now()
FROM (VALUES
  ('Milam', 'A "SMITH" search returned 50 rows of 220,777, with the 3 leading blank cells and 7 named columns the field map records. Index certified through 07/30/2026.'),
  ('Leon',  'A "SMITH" search returned 50 rows of 547,747, same shape. Leon was in NO registry before this survey — the platform would have fallen through to the paid TexasFile route.')
) AS v(county_name, note)
JOIN research_counties c ON c.name = v.county_name
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum;

-- Tried and demonstrably not working — recorded so nobody assumes the vendor-level shape covers it.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'search_proven', false,
           'search_attempted_at', '2026-08-02',
           'search_failure', 'Rejects department=RP with "Error While Running Search: Error with search query". Without the parameter the error clears but no rows return, so this deployment uses a different department code. Needs a person to run one search in the UI and read the resulting URL.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name = 'Madison';

-- The five that share the shape but were not individually exercised. Marked as inheriting an
-- UNVERIFIED assumption rather than silently inheriting a proof — Madison is the reason that
-- distinction matters.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'search_proven', false,
           'search_assumption', 'Shares the Kofile shape proven on Milam and Leon, but was not itself exercised. Madison shares that shape too and does not work, so this is an assumption, not an inheritance.'
         ),
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Bell', 'Travis', 'Williamson', 'Walker', 'Montgomery');
