-- seeds/524_customer_portal.sql — a customer can see their own job (audit §3, Phase 2 item 10).
--
-- §3: *"No customer portal. Customers get a marketing site, an email thread, and `/pay/[invoice]`
-- (which requires them to already know the invoice number). They cannot log in to see job status,
-- approve a change order, or download their plat."*
--
-- ── NO PASSWORDS, AND THAT IS A DECISION ────────────────────────────────────────────────────────
--
-- The obvious build is customer accounts: email, password, reset flow, session. It is also the build
-- that fails, for a reason specific to this business: a surveying customer interacts with the firm
-- three times over six weeks and then not again for a decade. Nobody remembers a password from a
-- decade ago, so every visit becomes a reset email — which is a magic link with extra steps, plus a
-- password database to breach.
--
-- So: a long-lived, revocable **access token** per customer per job, delivered in the emails the firm
-- already sends. The same shape as the proposal link (seed 523) and the pay portal, so a customer
-- learns one thing rather than three, and the firm has one thing to revoke.
--
-- Q25 in the question bank asks whether customers ever need to log in. This answers "not yet" in a
-- way that does not have to be undone if the owner later says yes: a real account, when it exists,
-- grants the same access these tokens do.
--
-- ── SCOPED TO A JOB, NOT TO A CUSTOMER ──────────────────────────────────────────────────────────
--
-- A token grants one job. A customer with three jobs holds three links. That is slightly worse for
-- them and much better when one link is forwarded to a lender, a neighbour or a title company —
-- which is normal, and which a customer-wide token would turn into a disclosure of every job they
-- have ever had.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS customer_portal_access (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,

  -- 256 bits, base64url. Unguessable and not enumerable — the thing behind it is a customer's
  -- property, their price and their documents.
  token         text NOT NULL UNIQUE,
  -- Who it was issued to, so revoking is a decision about a person rather than about a string.
  issued_to_email text,
  issued_to_name  text,

  -- Null means it does not expire. A survey's records matter for decades and a link that dies in
  -- ninety days sends the customer back to the phone — which is the cost this portal exists to remove.
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    text,

  -- Seen, so the firm can answer "did they get it?" without an email-tracking pixel. `last_seen_at`
  -- also makes an unused link visible, which is usually a wrong address rather than an uninterested
  -- customer.
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  view_count    integer NOT NULL DEFAULT 0,

  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_portal_job ON customer_portal_access (job_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_live ON customer_portal_access (token) WHERE revoked_at IS NULL;

COMMENT ON TABLE customer_portal_access IS
  'One revocable link per customer per JOB. Job-scoped rather than customer-scoped on purpose: links '
  'get forwarded to lenders, neighbours and title companies, and a customer-wide token would turn '
  'that normal act into a disclosure of every job they have ever had.';

-- ── What a customer is allowed to be told about a stage ─────────────────────────────────────────
--
-- Q29 asks whether customers should see job status *"or is that too much transparency"*. The answer
-- built here is: they see a PHASE, not the internal stage. `jobs.stage` is an operational value with
-- names that mean something to the office and either nothing or the wrong thing to a customer
-- ("legal_complete" is not a phrase anybody wants to receive by email about their land).
--
-- A mapping table rather than a CASE in the code, because the firm should be able to change what its
-- customers are told without a deploy — and because the phrasing is a business decision, not a
-- technical one.
CREATE TABLE IF NOT EXISTS portal_stage_labels (
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage         text NOT NULL,
  customer_label text NOT NULL,
  customer_note text,
  -- Where this phase sits in the customer's view of progress, 0–100. Not derived from the stage
  -- order: "in drafting" is halfway in the office's mind and much further along in the customer's.
  progress_pct  integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  is_visible    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (org_id, stage)
);

COMMENT ON TABLE portal_stage_labels IS
  'What a customer is told about each internal stage. A table rather than a CASE in code: the phrasing '
  'is a business decision, and a firm should be able to change what its customers see without a deploy. '
  'A stage with no row here is NOT shown — unmapped fails closed.';

-- Sensible defaults for the single organisation, under the same guard as seeds 513/517/519.
DO $$
DECLARE
  n_orgs int;
  only_org uuid;
BEGIN
  SELECT count(*) INTO n_orgs FROM organizations;
  IF n_orgs <> 1 THEN
    RAISE NOTICE 'seeds/524: % organisations — skipping default stage labels.', n_orgs;
    RETURN;
  END IF;
  SELECT id INTO only_org FROM organizations LIMIT 1;

  INSERT INTO portal_stage_labels (org_id, stage, customer_label, customer_note, progress_pct, is_visible) VALUES
    (only_org, 'accepted',          'Accepted',            'We have your signed proposal and your job is in the schedule.', 10, true),
    (only_org, 'research',          'Records research',    'We are pulling deeds, plats and prior surveys for your property.', 25, true),
    (only_org, 'scheduled',         'Scheduled',           'Your field work is booked. We will call before the crew arrives.', 35, true),
    (only_org, 'fieldwork',         'Field work',          'Our crew is on site or on the way.', 50, true),
    (only_org, 'fieldwork_complete','Field work complete', 'Measurements are in. Your drawing is next.', 65, true),
    (only_org, 'drafting',          'In drafting',         'Your plat is being drawn.', 75, true),
    (only_org, 'review',            'In review',           'Your surveyor is checking the work before it is sealed.', 85, true),
    (only_org, 'delivered',         'Delivered',           'Your documents have been issued.', 100, true),
    (only_org, 'complete',          'Complete',            'Everything is finished. Your documents stay available here.', 100, true),
    -- Deliberately hidden. An internal hold is a conversation to have on the phone, not a status a
    -- customer discovers at 11pm with no explanation and nobody to ask.
    (only_org, 'on_hold',           'On hold',             NULL, 0, false),
    (only_org, 'cancelled',         'Cancelled',           NULL, 0, false)
  ON CONFLICT (org_id, stage) DO NOTHING;
END $$;
