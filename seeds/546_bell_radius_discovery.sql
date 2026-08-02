-- 546_bell_radius_discovery.sql — every county within 80 miles of Bell (plan R36/R38).
--
-- The owner asked for all counties surrounding Bell out to 80 miles. Twenty-three qualify by
-- centroid distance. Each was visited on 2026-08-02 and asked what it exposes, by reading
-- the county's own published department list at window.__data.configuration.departments — rather
-- than guessing a code.
--
-- ── WHAT THE SWEEP FOUND ────────────────────────────────────────────────────────────────────────
--
--   7  usable Kofile land-records departments (Bell, Milam, Travis, Burleson, Brazos, Llano, Blanco)
--   1  Kofile portal with NO land records at all (Williamson — Commissioners Court only)
--  15  not on Kofile; they run some other vendor and need their portal identified
--
-- The Williamson result is the one that matters. Its portal exposes only Commissioners Court, so a
-- deed search there returns an empty page — which reads as "this property has no deeds". The
-- adapter now refuses to search it and says why.
--
-- Date ranges are the county's own. Bell's index reaches back to 1600; Burleson's begins in 1939.
-- Sending a range outside a county's own span is an error, not a wider search, which is what made
-- Travis look broken before this sweep.

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, 'https://bell.tx.publicsearch.us', 'browser',
  '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":0,"department":"RP","department_date_range":"16000101,20260731","certified_through":"2026-07-31","departments_available":["RP=Property Records","ASN=Assumed Names","MC=Marriage","CCM=Commissioners Court"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Bell, indexed 16000101 to 20260731, certified through 2026-07-31."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Bell'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":0,"department":"RP","department_date_range":"16000101,20260731","certified_through":"2026-07-31","departments_available":["RP=Property Records","ASN=Assumed Names","MC=Marriage","CCM=Commissioners Court"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Bell, indexed 16000101 to 20260731, certified through 2026-07-31."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Bell';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, 'https://williamson.tx.publicsearch.us', 'browser',
  '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":28,"department":null,"department_date_range":null,"certified_through":null,"departments_available":["CCM=Commissioners Court"],"no_land_records":true,"discovery_note":"Williamson''s portal exposes no land-records department — only CCM (\"Commissioners Court\"). Its deeds are not on this site, so a search here would return nothing and mean nothing. Find the county''s separate real-property search."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Williamson'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":28,"department":null,"department_date_range":null,"certified_through":null,"departments_available":["CCM=Commissioners Court"],"no_land_records":true,"discovery_note":"Williamson''s portal exposes no land-records department — only CCM (\"Commissioners Court\"). Its deeds are not on this site, so a search here would return nothing and mean nothing. Find the county''s separate real-property search."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Williamson';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":31,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://coryell.tx."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Coryell'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":31,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://coryell.tx."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Coryell';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, 'https://milam.tx.publicsearch.us', 'browser',
  '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":34,"department":"RP","department_date_range":"18010101,20260731","certified_through":"2026-07-30","departments_available":["RP=Property Records","ASN=Assumed Names","MC=Marriage","CCM=Commissioners Court","MB=Marks and Brands","FC=Foreclosures","PRB=Probates"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Milam, indexed 18010101 to 20260731, certified through 2026-07-30."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Milam'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":34,"department":"RP","department_date_range":"18010101,20260731","certified_through":"2026-07-30","departments_available":["RP=Property Records","ASN=Assumed Names","MC=Marriage","CCM=Commissioners Court","MB=Marks and Brands","FC=Foreclosures","PRB=Probates"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Milam, indexed 18010101 to 20260731, certified through 2026-07-30."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Milam';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":35,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://falls.tx.pu"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Falls'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":35,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://falls.tx.pu"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Falls';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":39,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://mclennan.tx"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'McLennan'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":39,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://mclennan.tx"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='McLennan';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":45,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://burnet.tx.p"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Burnet'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":45,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://burnet.tx.p"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Burnet';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":46,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://lampasas.tx"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Lampasas'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":46,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://lampasas.tx"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Lampasas';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, 'https://travis.tx.publicsearch.us', 'browser',
  '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":52,"department":"RP","department_date_range":null,"certified_through":null,"departments_available":["RP=Land Records","ASN=Assumed Names","MC=Marriage","FC=Foreclosures"],"no_land_records":false,"discovery_note":"Using RP (\"Land Records\") for Travis, with no date range published by the site."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Travis'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":52,"department":"RP","department_date_range":null,"certified_through":null,"departments_available":["RP=Land Records","ASN=Assumed Names","MC=Marriage","FC=Foreclosures"],"no_land_records":false,"discovery_note":"Using RP (\"Land Records\") for Travis, with no date range published by the site."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Travis';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":57,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://robertson.t"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Robertson'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":57,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://robertson.t"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Robertson';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":59,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://hamilton.tx"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Hamilton'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":59,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://hamilton.tx"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Hamilton';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":59,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://lee.tx.publ"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Lee'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":59,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://lee.tx.publ"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Lee';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":60,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://bosque.tx.p"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Bosque'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":60,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://bosque.tx.p"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Bosque';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, 'https://burleson.tx.publicsearch.us', 'browser',
  '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":63,"department":"RP","department_date_range":"19390503,20260731","certified_through":"2026-07-27","departments_available":["RP=Property Records","PL=Plats","MC=Marriage","BR=Birth","DC=Deaths","CCM=Commissioners Court","MB=Marks and Brands","FC=Foreclosures","PRB=Probates","IO=School Census Records"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Burleson, indexed 19390503 to 20260731, certified through 2026-07-27."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Burleson'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":63,"department":"RP","department_date_range":"19390503,20260731","certified_through":"2026-07-27","departments_available":["RP=Property Records","PL=Plats","MC=Marriage","BR=Birth","DC=Deaths","CCM=Commissioners Court","MB=Marks and Brands","FC=Foreclosures","PRB=Probates","IO=School Census Records"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Burleson, indexed 19390503 to 20260731, certified through 2026-07-27."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Burleson';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":64,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://limestone.t"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Limestone'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":64,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://limestone.t"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Limestone';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":65,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://bastrop.tx."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Bastrop'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":65,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://bastrop.tx."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Bastrop';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":70,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://hill.tx.pub"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Hill'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":70,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://hill.tx.pub"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Hill';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":73,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://mills.tx.pu"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Mills'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":73,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://mills.tx.pu"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Mills';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, 'https://brazos.tx.publicsearch.us', 'browser',
  '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":74,"department":"RP","department_date_range":"18000101,20260731","certified_through":"2026-07-30","departments_available":["RP=Property Records","CCM=Commissioners Court","MC=Marriage","FC=Foreclosures"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Brazos, indexed 18000101 to 20260731, certified through 2026-07-30."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Brazos'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":74,"department":"RP","department_date_range":"18000101,20260731","certified_through":"2026-07-30","departments_available":["RP=Property Records","CCM=Commissioners Court","MC=Marriage","FC=Foreclosures"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Brazos, indexed 18000101 to 20260731, certified through 2026-07-30."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Brazos';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, 'https://llano.tx.publicsearch.us', 'browser',
  '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":75,"department":"RP","department_date_range":null,"certified_through":null,"departments_available":["RP=Property Records","MC=Marriage","BR=Birth","DC=Deaths","MB=Marks and Brands","CCM=Commissioners Court"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Llano, with no date range published by the site."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Llano'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":75,"department":"RP","department_date_range":null,"certified_through":null,"departments_available":["RP=Property Records","MC=Marriage","BR=Birth","DC=Deaths","MB=Marks and Brands","CCM=Commissioners Court"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Llano, with no date range published by the site."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Llano';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":75,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://hays.tx.pub"}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Hays'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":75,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://hays.tx.pub"}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Hays';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, 'https://blanco.tx.publicsearch.us', 'browser',
  '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":76,"department":"RP","department_date_range":"18000101,20260731","certified_through":"2026-07-29","departments_available":["RP=Property Records","CCM=Commissioners Court","MB=Marks and Brands","FC=Foreclosures"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Blanco, indexed 18000101 to 20260731, certified through 2026-07-29."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'Blanco'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"kofile","survey_status":"discovered","discovered_at":"2026-08-02","distance_from_bell_miles":76,"department":"RP","department_date_range":"18000101,20260731","certified_through":"2026-07-29","departments_available":["RP=Property Records","CCM=Commissioners Court","MB=Marks and Brands","FC=Foreclosures"],"no_land_records":false,"discovery_note":"Using RP (\"Property Records\") for Blanco, indexed 18000101 to 20260731, certified through 2026-07-29."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='Blanco';

INSERT INTO research_site_adapters (county_id, site_type, base_url, access_method, config, field_map, status, health, created_by)
SELECT c.id, 'clerk_deeds'::research_site_type_enum, '', 'browser',
  '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":79,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://sansaba.tx."}'::jsonb, '{}'::jsonb, 'draft'::research_adapter_status_enum, '{}'::jsonb, 'plan-R38-radius'
FROM research_counties c WHERE c.name = 'San Saba'
  AND NOT EXISTS (SELECT 1 FROM research_site_adapters a WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum);

UPDATE research_site_adapters a SET config = a.config || '{"system":"unknown","survey_status":"not_kofile","discovered_at":"2026-08-02","distance_from_bell_miles":79,"department":null,"department_date_range":null,"certified_through":null,"departments_available":[],"no_land_records":false,"discovery_note":"page.goto: net::ERR_NAME_NOT_RESOLVED at https://sansaba.tx."}'::jsonb, updated_at = now()
FROM research_counties c WHERE a.county_id=c.id AND a.site_type='clerk_deeds'::research_site_type_enum AND c.name='San Saba';

