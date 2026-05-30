-- ============================================================================
-- 305_contacts.sql
-- contacts plan Slice 1 — contacts table + job ↔ contact join.
--
-- Why: jobs today inline `client_name` / `client_email` / `client_phone`
-- / `client_company` directly on every row. A realtor with 20 jobs has
-- 20 copies of their info, no profile page, no shared notes. The user
-- wants saved contacts they can label (potential customer, recurring,
-- realtor, employee, …), give a profile to, and link to jobs both
-- directions.
--
-- Schema:
--
--   contacts            — one row per person/entity, with the labels
--                         array carrying the user's chosen tags (multi
--                         since a realtor can be both 'current
--                         customer' + 'recurring').
--   job_contacts        — the m:n join. Carries `role` (client,
--                         realtor, agent, buyer, seller, lender, …)
--                         so the same person can be both 'realtor on
--                         job A' and 'client on job B'.
--
-- jobs.client_* columns are intentionally untouched: legacy / unlinked
-- jobs keep displaying the inline info; the picker on the job detail
-- page (Slice 6) writes only to job_contacts.
-- ============================================================================

BEGIN;

-- ── contacts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    email       TEXT,
    phone       TEXT,
    company     TEXT,
    title       TEXT,
    address     TEXT,
    city        TEXT,
    state       TEXT,
    zip         TEXT,
    -- Free-form tag list. Default catalog ships in lib/contacts/labels.ts;
    -- user-coined labels (e.g., "VIP", "partner-firm") are allowed too.
    labels      TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT        NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_name_idx        ON contacts (lower(name));
CREATE INDEX IF NOT EXISTS contacts_company_idx     ON contacts (lower(company)) WHERE company IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_email_idx       ON contacts (lower(email))   WHERE email   IS NOT NULL;
-- GIN on labels so "?label=realtor" + "?label=current_customer" filters
-- are cheap.
CREATE INDEX IF NOT EXISTS contacts_labels_idx      ON contacts USING GIN (labels);
CREATE INDEX IF NOT EXISTS contacts_updated_at_idx  ON contacts (updated_at DESC);

-- Mirrors the cad_drawings updated_at trigger pattern.
CREATE OR REPLACE FUNCTION contacts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_updated_at_trigger ON contacts;
CREATE TRIGGER contacts_updated_at_trigger
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_set_updated_at();

-- ── job_contacts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_contacts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      UUID        NOT NULL REFERENCES jobs(id)     ON DELETE CASCADE,
    contact_id  UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    role        TEXT        NOT NULL DEFAULT 'client',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT        NOT NULL,
    -- Same person can hold multiple roles on the same job (rare but
    -- possible: realtor + buyer). Disallow duplicates of the same
    -- (job, contact, role) triple.
    CONSTRAINT job_contacts_unique UNIQUE (job_id, contact_id, role)
);

CREATE INDEX IF NOT EXISTS job_contacts_job_idx     ON job_contacts (job_id);
CREATE INDEX IF NOT EXISTS job_contacts_contact_idx ON job_contacts (contact_id);

-- ── RLS (service-role-only pattern matching drawing_notes / contacts) ──────
ALTER TABLE contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_service_role_all     ON contacts;
CREATE POLICY contacts_service_role_all     ON contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS job_contacts_service_role_all ON job_contacts;
CREATE POLICY job_contacts_service_role_all ON job_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
