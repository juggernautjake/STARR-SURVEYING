-- 544_kofile_parser_proof.sql — the parser, proven against five live counties (plan R38).
--
-- Seed 543 recorded which counties returned rows. This records which ones the adapter can actually
-- READ, which is the harder and more useful claim — and it changed after two bugs were fixed:
--
--   1. The URL. `?searchOper=…&searchString=…` is ignored by the site: zero rows, no error.
--   2. The parser. It required an instrument number matching `\d{10,13}` and dropped any row
--      without one. Real numbers are `2019-3389`, `1981-147096`, `DEPU-000021` — none match. So even
--      with a working URL, every row was discarded.
--
-- Together those meant the adapter returned an empty array from a page of 220,777 records, and the
-- one county marked `active` had been doing exactly that.
--
-- ── AND THE COLUMNS ARE NOT THE SAME ────────────────────────────────────────────────────────────
--
-- The old parser read cells positionally from a comment describing "typical Kofile column order".
-- Five live counties, 2026-08-02:
--
--   Milam / Leon / Walker   Grantor | Grantee | Doc Type | Recorded Date | Doc Number | Book/Volume/Page | Legal Description
--   Bell                    same shape, different labels — "Inst Number", "Property Description"
--   Montgomery              17 columns, DIFFERENT ORDER — Doc Number first, Grantor fifth, plus
--                           Notary, High Lot, Low Lot, Block, Subdivision, Acreage, Comment
--
-- A fixed index reads Montgomery's document number as its grantor. The parser now maps by header
-- TEXT, and reports headers it does not recognise rather than guessing around them.

UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'parse_proven', true,
           'parse_proven_at', '2026-08-02',
           'parse_proven_note', v.note,
           'results_headers', v.headers::jsonb
         ),
    updated_at = now()
FROM (VALUES
  ('Milam',      '50 of 50 rows parsed. e.g. 2019-4779, PLAT, 12/30/2019.',
                 '["Grantor","Grantee","Doc Type","Recorded Date","Doc Number","Book/Volume/Page","Legal Description"]'),
  ('Leon',       '50 of 50 rows parsed. e.g. 1981-147096, OIL & GAS LEASE, grantor DE VAUGHN BERNARD to HIGHLAND RESOURCES INC.',
                 '["Grantor","Grantee","Doc Type","Recorded Date","Doc Number","Book/Volume/Page","Legal Description"]'),
  ('Bell',       '50 of 50 rows parsed. Instrument format DEPU-000021 — the old \d{10,13} rule would never have matched it.',
                 '["Grantor","Grantee","Doc Type","Recorded Date","Inst Number","Book/Volume/Page","Property Description"]'),
  ('Walker',     '50 of 50 rows parsed. e.g. 1979-2440.',
                 '["Grantor","Grantee","Doc Type","Recorded Date","Doc Number","Book/Volume/Page","Legal Description"]'),
  ('Montgomery', '50 of 50 rows parsed from a 17-column table in a different order; 8 county-specific columns reported as unrecognised and ignored.',
                 '["Doc Number","Vol/Bk/Pg","Doc Type","Image Code","Grantor","Grantee","Notary","Recorded Date","High Lot","Low Lot","Block","Subdivision","Acreage","Comment"]')
) AS v(county_name, note, headers)
JOIN research_counties c ON c.name = v.county_name
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum;

-- Still unproven, each for its own reason. Recorded per county because "Kofile works" is exactly the
-- vendor-level assumption Madison disproved.
UPDATE research_site_adapters a
SET config = a.config
      || jsonb_build_object(
           'parse_proven', false,
           'parse_attempted_at', '2026-08-02',
           'parse_blocker', v.reason
         ),
    updated_at = now()
FROM (VALUES
  ('Travis',     'The results request returned an error page. Not investigated further — needs one search run by hand in the UI so the working query can be read off the address bar.'),
  ('Williamson', 'The results request returned no rows and no error. Same next step as Travis.'),
  ('Madison',    'Rejects department=RP with "Error with search query"; OPR, LP and omitting the parameter all return nothing. This deployment uses a department code we have not found.')
) AS v(county_name, reason)
JOIN research_counties c ON c.name = v.county_name
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum;

-- The five proven counties may now be promoted from draft, because an adapter that fetches a page,
-- maps its columns and returns parsed rows is what `active` is supposed to mean.
--
-- `last_verified_at` is deliberately LEFT NULL: R11's coverage reads it as "a health check has
-- passed", and none has run. Proven-by-hand and proven-by-monitor are different claims, and the
-- dashboard should keep saying so until the monitor agrees.
UPDATE research_site_adapters a
SET status = 'active'::research_adapter_status_enum,
    updated_at = now()
FROM research_counties c
WHERE a.county_id = c.id
  AND a.site_type = 'clerk_deeds'::research_site_type_enum
  AND c.name IN ('Milam', 'Leon', 'Bell', 'Walker', 'Montgomery')
  AND (a.config->>'parse_proven')::boolean IS TRUE;
