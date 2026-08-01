-- seeds/520_compliance_register.sql — every business-critical date, in one place (audit §3, item 8m
-- and Phase 2 item 12).
--
-- §3: *"No RPLS/licensure & insurance tracking as a compliance surface. `employee_certifications`
-- exists as a table with no schema and no expiry-alerting surface. CE hours, license renewal, COI
-- expiry, and vehicle registration/inspection are all business-critical dates with no home."*
--
-- §3c.2 item 8m arrives at the same place from the other direction: *"Instrument records with
-- make/model/serial tied to `equipment_inventory`, so a calibration certificate and its instrument are
-- the same object — which is also the compliance surface §3 says is missing."*
--
-- ── THE OBVIOUS BUILD IS THE WRONG ONE ───────────────────────────────────────────────────────────
--
-- The obvious build is one `compliance_items` table holding every dated obligation, backfilled from
-- the existing tables. It would work on day one and be wrong by the end of the week, because those
-- dates already have owners: `employee_certifications.expiry_date` is written by the certifications
-- flow, `equipment_inventory.next_calibration_due_at` by the equipment maintenance flow. Copying them
-- into a second table makes two places that can disagree about when a licence expires — which is
-- exactly the defect §1.3 measured when the sidebar and the route registry drifted 32 routes apart,
-- with a professional licence in place of a menu item.
--
-- So this seed does three things and deliberately not a fourth:
--   1. Adds the COLUMNS that are genuinely missing, where a home nearly exists (vehicles had
--      `last_inspected_at` but nothing that expires).
--   2. Adds `org_compliance_items` for obligations with no home at all — the firm's own COI, E&O
--      policy, business registration, TBPELS firm registration.
--   3. Adds `calibration_certificates`, because a certificate is a document with its own issuing lab,
--      number and validity window — a history, not a single "next due" field.
--   4. Creates the VIEW `compliance_register` that unions all of it into one shape. **The view is the
--      surface; the tables stay the truth.** Nothing is copied.
--
-- Idempotent.

-- ── 1. Vehicles: the dates a fleet actually gets stopped for ─────────────────────────────────────
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registration_expires_on date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS inspection_expires_on  date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expires_on   date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_policy_number text;

COMMENT ON COLUMN vehicles.inspection_expires_on IS
  'When the state inspection lapses. Distinct from `last_inspected_at`: a truck inspected 11 months '
  'ago is fine and one inspected 13 months ago is not, and only the expiry says which.';

-- ── 2. Instrument calibration certificates ──────────────────────────────────────────────────────
--
-- `equipment_inventory.next_calibration_due_at` answers "is this instrument due?" and stays the
-- authority on that. It does NOT answer "where is the certificate, who issued it, and what number is
-- on it" — which is what a client's QA reviewer or an expert witness asks for, and the reason this is
-- a table rather than four more columns. One instrument accumulates certificates over its life.
CREATE TABLE IF NOT EXISTS calibration_certificates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES organizations(id),
  equipment_id    uuid NOT NULL REFERENCES equipment_inventory(id) ON DELETE CASCADE,
  certificate_no  text,
  issuing_lab     text,
  calibrated_on   date NOT NULL,
  expires_on      date,
  -- The standard the calibration was performed against — ISO 17123 for total stations, the
  -- manufacturer's own procedure otherwise. A certificate with no standard named is not much of one.
  standard        text,
  document_url    text,
  notes           text,
  recorded_by     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calibration_certificates_equipment ON calibration_certificates (equipment_id, calibrated_on DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_certificates_expiry ON calibration_certificates (expires_on) WHERE expires_on IS NOT NULL;

COMMENT ON TABLE calibration_certificates IS
  'The certificate documents themselves, one row per calibration event. `equipment_inventory.'
  'next_calibration_due_at` remains the authority on whether an instrument is due — this is the '
  'evidence trail behind it, and a history rather than a current value.';

-- ── 3. Obligations with no home at all ──────────────────────────────────────────────────────────
--
-- The firm's own insurance, registrations and policies. Not per-employee (that is
-- `employee_certifications`), not per-asset. Deliberately generic in `category` rather than a column
-- per obligation: a firm in a second state will have obligations this schema has never heard of, and
-- adding a column per customer is how a multi-tenant schema dies.
CREATE TABLE IF NOT EXISTS org_compliance_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid REFERENCES organizations(id),
  category           text NOT NULL,   -- 'insurance' | 'registration' | 'license' | 'policy' | 'other'
  title              text NOT NULL,
  identifier         text,            -- policy or registration number
  issuing_authority  text,
  issued_on          date,
  expires_on         date,
  -- How far ahead this one needs warning about. An E&O renewal needs 60 days of lead time; a vehicle
  -- registration needs a week. One global threshold would either spam or arrive too late.
  renewal_lead_days  integer NOT NULL DEFAULT 30,
  document_url       text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_compliance_expiry ON org_compliance_items (org_id, expires_on);

-- ── 4. The alert ledger ─────────────────────────────────────────────────────────────────────────
--
-- What has already been said, so a nightly job does not re-tell somebody every morning for sixty days
-- that their licence expires in two months. Keyed by item + threshold: crossing 60 days is one alert,
-- crossing 30 is a second, and crossing 0 is a third.
CREATE TABLE IF NOT EXISTS compliance_alerts_sent (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES organizations(id),
  register_key   text NOT NULL,      -- '<source>:<id>' from the view below
  threshold_days integer NOT NULL,   -- which band fired: 60, 30, 14, 0…
  expires_on     date,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  sent_to        text[],
  -- Named explicitly: Postgres truncates generated constraint names at 63 characters, and the
  -- generated one here overflows — which makes any later COMMENT or ALTER referring to it fail with
  -- "constraint does not exist" for a reason nobody guesses on the first read.
  CONSTRAINT compliance_alert_once_per_band UNIQUE (register_key, threshold_days, expires_on)
);

COMMENT ON CONSTRAINT compliance_alert_once_per_band ON compliance_alerts_sent IS
  'Includes expires_on on purpose: when an item is RENEWED its expiry moves, and the new date must be '
  'able to fire its own alerts. Keyed on item+threshold alone, a renewed licence would go silent for '
  'the rest of its life.';

-- ── 5. The one surface — a view, so nothing is copied ───────────────────────────────────────────
--
-- Four sources, one shape. `register_key` is `<source>:<uuid>` so the alert ledger can reference a row
-- that lives in whichever table owns it.
--
-- `days_remaining` is computed here rather than stored, because a stored one is wrong the next day and
-- there is no such thing as a cache that expires exactly at midnight in every timezone the firm works.
CREATE OR REPLACE VIEW compliance_register AS
  -- Employee licences, certifications and CE
  SELECT
    'employee_certification:' || ec.id::text            AS register_key,
    ec.org_id                                           AS org_id,
    'employee'::text                                    AS subject_kind,
    ec.user_email                                       AS subject_label,
    ec.id                                               AS subject_id,
    COALESCE(NULLIF(ec.certification_type, ''), 'certification') AS category,
    COALESCE(NULLIF(ec.certification_name, ''), ec.certification_type, 'Certification') AS title,
    ec.license_number                                   AS identifier,
    ec.issued_date                                      AS issued_on,
    ec.expiry_date                                      AS expires_on,
    30                                                  AS renewal_lead_days,
    ec.document_url                                     AS document_url
  FROM employee_certifications ec

  UNION ALL

  -- Instrument calibration. The instrument's own due date is the authority; the certificate table is
  -- evidence, so the register reads the instrument.
  SELECT
    'equipment_calibration:' || e.id::text,
    e.org_id,
    'equipment',
    COALESCE(NULLIF(e.name, ''), CONCAT_WS(' ', e.brand, e.model), 'Equipment'),
    e.id,
    'calibration',
    CONCAT_WS(' ', 'Calibration —', COALESCE(NULLIF(e.name, ''), CONCAT_WS(' ', e.brand, e.model))),
    e.serial_number,
    COALESCE(e.last_calibrated_at::date, e.last_calibration),
    COALESCE(e.next_calibration_due_at::date, e.next_calibration_due),
    30,
    NULL
  FROM equipment_inventory e
  WHERE COALESCE(e.next_calibration_due_at::date, e.next_calibration_due) IS NOT NULL
    AND e.retired_at IS NULL

  UNION ALL

  -- Vehicle registration, inspection and insurance — three obligations per truck, so three rows.
  SELECT
    'vehicle_registration:' || v.id::text, v.org_id, 'vehicle',
    COALESCE(NULLIF(v.name, ''), v.license_plate, 'Vehicle'), v.id,
    'registration', CONCAT_WS(' ', 'Registration —', COALESCE(NULLIF(v.name, ''), v.license_plate)),
    v.license_plate, NULL::date, v.registration_expires_on, 14, NULL
  FROM vehicles v WHERE v.registration_expires_on IS NOT NULL

  UNION ALL

  SELECT
    'vehicle_inspection:' || v.id::text, v.org_id, 'vehicle',
    COALESCE(NULLIF(v.name, ''), v.license_plate, 'Vehicle'), v.id,
    'inspection', CONCAT_WS(' ', 'Inspection —', COALESCE(NULLIF(v.name, ''), v.license_plate)),
    v.license_plate, v.last_inspected_at::date, v.inspection_expires_on, 14, NULL
  FROM vehicles v WHERE v.inspection_expires_on IS NOT NULL

  UNION ALL

  SELECT
    'vehicle_insurance:' || v.id::text, v.org_id, 'vehicle',
    COALESCE(NULLIF(v.name, ''), v.license_plate, 'Vehicle'), v.id,
    'insurance', CONCAT_WS(' ', 'Insurance —', COALESCE(NULLIF(v.name, ''), v.license_plate)),
    v.insurance_policy_number, NULL::date, v.insurance_expires_on, 30, NULL
  FROM vehicles v WHERE v.insurance_expires_on IS NOT NULL

  UNION ALL

  -- The firm's own obligations.
  SELECT
    'org_compliance:' || o.id::text, o.org_id, 'organization',
    'The firm', o.id,
    o.category, o.title, o.identifier, o.issued_on, o.expires_on, o.renewal_lead_days, o.document_url
  FROM org_compliance_items o;

COMMENT ON VIEW compliance_register IS
  'Every dated obligation the firm has, from the tables that already own them. A VIEW rather than a '
  'table on purpose: copying these dates into a second store makes two places that can disagree about '
  'when a professional licence expires.';
