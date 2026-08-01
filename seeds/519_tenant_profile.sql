-- seeds/519_tenant_profile.sql — the firm's identity, moved out of the source (audit §3c.3, item 8h).
--
-- `scripts/audit-starr-assumptions.mjs` counts **293 references across 101 tenant-surface files** that
-- spell out one firm's name, phone number, email domain and county. Meanwhile the `organizations` row
-- that exists to hold exactly those facts had `phone`, `domain_restriction`, `logo_url` and
-- `brand_color` all NULL. The data was declared and not applied — §3c.1's defect, one table over.
--
-- This fills the row. It is guarded the same way seeds 513 and 517 are: **only while exactly one
-- organisation exists.** With one firm, "whose phone number is this" has an answer. With two, writing
-- Starr's identity onto whichever row `LIMIT 1` returns is how a second customer's invoices go out
-- signed by a competitor — silent, plausible, and discovered by the customer.
--
-- Idempotent, and it never overwrites a value the firm has already set from the settings screen:
-- COALESCE keeps whatever is there and only fills a blank.

-- The postal address the firm asks customers to mail cheques to. It had no column at all — the pledge
-- confirmation email imported it from `app/components/ServiceAreaMap`, a MARKETING-SITE component, so
-- a second firm's customers would have been told to post their cheque to Starr's office. Two lines
-- rather than parsed fields, because that is the shape the templates and the receipt PDF already use
-- and inventing a structured address only to re-join it would add a formatting decision per country.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;

COMMENT ON COLUMN organizations.address_line1 IS 'Street line of the firm''s office, as printed on cheques and receipts.';
COMMENT ON COLUMN organizations.address_line2 IS 'City, state and postal code, as one line — the shape the mail templates use.';

DO $$
DECLARE
  org_count int;
  starr_id  uuid;
BEGIN
  SELECT count(*) INTO org_count FROM organizations;

  IF org_count <> 1 THEN
    RAISE NOTICE 'seeds/519: % organisations exist — refusing to guess whose identity this is. Set each firm''s details from Org Settings.', org_count;
    RETURN;
  END IF;

  SELECT id INTO starr_id FROM organizations LIMIT 1;

  UPDATE organizations SET
    -- The display name on invoices, outbound email and plat title blocks.
    name = COALESCE(NULLIF(name, ''), 'Starr Surveying'),
    -- Surveying is licensed per state, so this is not cosmetic — it decides which board's rules apply.
    state = COALESCE(NULLIF(state, ''), 'TX'),
    phone = COALESCE(NULLIF(phone, ''), '(936) 662-0077'),
    -- ── THE DOMAIN IS A CONVENIENCE, NOT THE MEMBERSHIP TEST ──────────────────────────────────────
    -- `lib/auth.ts` used to answer "is this person staff?" with `email ends with @starr-surveying.com`.
    -- Measured against the live database, that test is WRONG for two of the six accounts: both
    -- johntoddharding@gmail.com (an `admin` member of this org) and jacobmaddux96@gmail.com are active
    -- members with no company address, and both were losing every `internalOnly` route because of it —
    -- question-bank Q39, happening already. Membership in `organization_members` is now the test; this
    -- domain only means "an address here is one of ours too", for a firm that has not yet added
    -- everyone. NULL is a real answer and means "we don't use one".
    domain_restriction = COALESCE(NULLIF(domain_restriction, ''), 'starr-surveying.com'),
    primary_admin_email = COALESCE(NULLIF(primary_admin_email, ''), 'jacobmaddux@starr-surveying.com'),
    billing_contact_email = COALESCE(NULLIF(billing_contact_email, ''), 'info@starr-surveying.com'),
    address_line1 = COALESCE(NULLIF(address_line1, ''), '3779 W FM 436'),
    address_line2 = COALESCE(NULLIF(address_line2, ''), 'Belton, TX 76513'),
    website = COALESCE(NULLIF(website, ''), 'https://starr-surveying.com')
  WHERE id = starr_id;

  RAISE NOTICE 'seeds/519: tenant profile filled for the single organisation %.', starr_id;
END $$;

-- ── COUNTIES THE FIRM WORKS IN ────────────────────────────────────────────────────────────────────
--
-- The audit counts **106 references to a single county** hard-coded in the research pipeline, and
-- §3c.3 names the worst of them: lot verification "returns a 400 for any other county". `counties` is
-- already a shared reference catalogue of all 254 Texas counties (audit §1.2 classifies it that way on
-- purpose — a per-tenant copy of the county list is duplication with extra steps). What is per-tenant
-- is which of them a firm actually covers, and which one it defaults to.
--
-- So this is a join table, not a copy: coverage is the firm's, the counties stay shared.
CREATE TABLE IF NOT EXISTS org_counties (
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  county_slug text NOT NULL,          -- matches the research pipeline's lowercase key, e.g. 'bell'
  is_default  boolean NOT NULL DEFAULT false,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, county_slug)
);

-- At most one default per firm. A second default is not a tie to break at read time — it is a bug that
-- would make the research pipeline pick a different county depending on row order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_counties_one_default
  ON org_counties (org_id) WHERE is_default;

COMMENT ON TABLE org_counties IS
  'Which counties a firm works in, and which is its default. The county CATALOGUE (all 254) is shared '
  'reference data in `counties`; only coverage is per-tenant. Empty means the firm has not said, which '
  'the pipeline must report rather than silently assuming one.';

DO $$
DECLARE
  org_count int;
  starr_id  uuid;
BEGIN
  SELECT count(*) INTO org_count FROM organizations;
  IF org_count <> 1 THEN
    RAISE NOTICE 'seeds/519: % organisations — skipping county backfill.', org_count;
    RETURN;
  END IF;
  SELECT id INTO starr_id FROM organizations LIMIT 1;

  -- Bell County is what the pipeline has always assumed, so it is the default. The neighbouring
  -- counties Starr actually works are listed as covered but not default: the point of this table is
  -- that "covered" and "the one we assume" stop being the same fact.
  INSERT INTO org_counties (org_id, county_slug, is_default) VALUES
    (starr_id, 'bell',       true),
    (starr_id, 'coryell',    false),
    (starr_id, 'falls',      false),
    (starr_id, 'mclennan',   false),
    (starr_id, 'milam',      false),
    (starr_id, 'williamson', false),
    (starr_id, 'burnet',     false),
    (starr_id, 'lampasas',   false)
  ON CONFLICT (org_id, county_slug) DO NOTHING;
END $$;
