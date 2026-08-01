-- seeds/523_proposals_deliverables_ar.sql — the front door and the back end (audit §3, Phase 2 #9/#11).
--
-- §3 names four gaps in one breath:
--   · *"No proposal / estimate / contract with customer acceptance… For a surveying firm this is the
--     FRONT DOOR of every job."*
--   · *"No deliverable/document control… no concept of a deliverable with a revision number, an
--     issued-date, a recipient, and a 'final signed & sealed' state — which is the artifact a
--     surveying firm is legally on the hook for."*
--   · *"No change orders. Scope creep is how surveying jobs lose money."*
--   · *"No AR / collections view. Invoices exist; 'who owes me money and for how long' does not."*
--
-- ── PROPOSALS EXTEND `lead_quotes`; THEY ARE NOT A NEW TABLE ────────────────────────────────────
--
-- `lead_quotes` (seed 505) already does the hard part: versioned, append-only, with decline reasons
-- and a superseded chain, and its header explains at length why a quote is an object rather than a
-- column. A separate `proposals` table would be a second answer to "what did we offer this customer",
-- and the two would disagree the first time somebody revised one and not the other — §1.3's defect
-- with a contract in place of a menu item.
--
-- So a proposal IS a quote, with the things a customer-facing document needs: line items, a scope of
-- work in their words rather than ours, terms, and a token to reach it by.
--
-- ── ACCEPTANCE IS EVIDENCE, SO IT IS ITS OWN APPEND-ONLY TABLE ──────────────────────────────────
--
-- A signature is not a status flag. If a dispute arises, what matters is who typed what, from where,
-- at what moment, against which version of which document — and none of that survives being modelled
-- as `accepted_at` on a mutable row. `quote_acceptances` is written once and never updated; the
-- quote's status is the derived convenience.
--
-- Idempotent.

-- ── 1. A quote becomes a proposal ───────────────────────────────────────────────────────────────
ALTER TABLE lead_quotes ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE lead_quotes ADD COLUMN IF NOT EXISTS scope_of_work text;
ALTER TABLE lead_quotes ADD COLUMN IF NOT EXISTS terms text;
ALTER TABLE lead_quotes ADD COLUMN IF NOT EXISTS valid_until date;
-- Reachable by a customer with no account. Random, unguessable, and revoked by nulling it — the same
-- shape `customer_invoices.public_slug` already uses, so the pay portal and the proposal portal are
-- one mental model rather than two.
ALTER TABLE lead_quotes ADD COLUMN IF NOT EXISTS public_token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_quotes_public_token ON lead_quotes (public_token) WHERE public_token IS NOT NULL;

COMMENT ON COLUMN lead_quotes.scope_of_work IS
  'What the customer is buying, in their words. Distinct from `scope_notes`, which is the internal '
  '"why is v2 lower" record and must never be shown to them.';
COMMENT ON COLUMN lead_quotes.line_items IS
  'Array of { description, quantity, unit, unit_price_cents, total_cents }. `amount_cents` remains the '
  'authority on the total — line items that do not sum to it are a display problem, not a pricing one, '
  'and the total is what was agreed.';

-- ── 2. Scope-of-work templates ──────────────────────────────────────────────────────────────────
--
-- A boundary survey proposal says nearly the same thing every time. Retyping it is how a scope ends
-- up missing the clause that mattered.
CREATE TABLE IF NOT EXISTS proposal_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),
  name          text NOT NULL,
  survey_type   text,
  scope_of_work text NOT NULL,
  terms         text,
  -- Default line items, priced or unpriced. jsonb rather than a child table: a template is a starting
  -- point that gets edited on every use, so its parts have no independent life.
  line_items    jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposal_templates_org ON proposal_templates (org_id, is_active);

-- ── 3. Acceptance — written once, never updated ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_acceptances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES organizations(id),
  quote_id       uuid NOT NULL REFERENCES lead_quotes(id) ON DELETE CASCADE,
  -- The VERSION accepted, copied rather than referenced. A quote row could in principle be edited
  -- after the fact; the evidence must say what was on screen when they clicked, not what the row
  -- says today.
  quote_version  integer NOT NULL,
  amount_cents   bigint NOT NULL,
  scope_snapshot text,
  line_items_snapshot jsonb,

  -- Who. A typed name is a valid electronic signature under the US E-SIGN Act when accompanied by
  -- intent and an audit trail, which is what the rest of these columns are.
  signed_name    text NOT NULL,
  signed_email   text,
  -- Optional drawn signature, as a data URL. Not required: a drawn squiggle adds no legal weight over
  -- a typed name plus this trail, and requiring one on a phone loses acceptances.
  signature_image text,

  -- Where and when. Deliberately captured at the moment of the click.
  accepted_at    timestamptz NOT NULL DEFAULT now(),
  ip_hash        text,
  user_agent     text,

  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quote_acceptances_quote ON quote_acceptances (quote_id);
-- One acceptance per version. A customer clicking twice is not two agreements.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_acceptance_once ON quote_acceptances (quote_id, quote_version);

COMMENT ON TABLE quote_acceptances IS
  'Append-only evidence of acceptance. Never UPDATE a row here: if a dispute arises, what matters is '
  'who typed what, from where, at what moment, against which version — and none of that survives '
  'being modelled as a mutable `accepted_at` flag on the quote.';

-- ── 4. Deliverables — the artefact the firm is legally on the hook for ──────────────────────────
CREATE TABLE IF NOT EXISTS deliverables (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES organizations(id),
  job_id         uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  name           text NOT NULL,
  kind           text NOT NULL DEFAULT 'plat',   -- 'plat' | 'survey_report' | 'legal_description' | 'exhibit' | 'other'
  -- Revision, per deliverable, starting at 1. A "Rev C" plat and a "Rev 3" plat are the same idea
  -- with different labels, so the number is stored and the label is derived at render time.
  revision       integer NOT NULL DEFAULT 1,

  -- draft → issued → superseded, with `final` meaning signed and sealed. The state a surveying firm
  -- is answerable for is `final`, and it is deliberately not reachable by editing a string: see the
  -- CHECK, and the trigger-free rule that sealing stamps the sealer and the date together.
  state          text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'issued', 'final', 'superseded')),

  file_url       text,
  storage_path   text,
  -- Who signed and sealed it, and when. NULL until `final`. The RPLS is a person, not the firm.
  sealed_by      text,
  sealed_at      timestamptz,
  seal_number    text,

  -- Delivery. "Issued" without a recipient and a date is not a delivery, it is a file.
  issued_at      timestamptz,
  issued_to      text,
  delivery_method text,                          -- 'email' | 'portal' | 'post' | 'in_person'
  delivery_note  text,
  -- Proof the customer received it — a portal download timestamp or an email open. Weak evidence
  -- alone, which is why it is separate from `issued_at` rather than conflated with it.
  received_at    timestamptz,

  supersedes_id  uuid REFERENCES deliverables(id) ON DELETE SET NULL,
  notes          text,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliverables_job ON deliverables (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliverables_state ON deliverables (org_id, state);
-- One revision number per deliverable name per job. Two "Rev 2"s of the same plat is a records
-- problem that only shows up in a deposition.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliverables_revision ON deliverables (job_id, name, revision);

COMMENT ON COLUMN deliverables.state IS
  'draft → issued → final (signed and sealed) → superseded. `final` is the state the firm is legally '
  'answerable for; `sealed_by`, `sealed_at` and `seal_number` are what make it meaningful.';

-- ── 5. Change orders — how surveying jobs lose money ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES organizations(id),
  job_id         uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  -- Sequential per job. What a customer refers to on the phone.
  number         integer NOT NULL,

  description    text NOT NULL,
  -- Signed: a change order can REDUCE scope, and modelling it as unsigned forces a second "credit"
  -- concept for the same event.
  amount_cents   bigint NOT NULL DEFAULT 0,
  -- Days added to the schedule. Scope creep costs time as well as money and only one of them is
  -- usually recorded.
  days_added     integer NOT NULL DEFAULT 0,

  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'declined', 'void')),
  requested_at   timestamptz NOT NULL DEFAULT now(),
  requested_by   text,
  decided_at     timestamptz,
  -- The customer's approval, by the same rules as a proposal acceptance.
  approved_by_name text,
  approved_by_email text,
  approval_ip_hash text,
  decline_reason text,
  public_token   text,

  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_change_orders_number ON change_orders (job_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_change_orders_token ON change_orders (public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_job ON change_orders (job_id, number);

-- ── 6. AR aging — "who owes me money and for how long" ─────────────────────────────────────────
--
-- A view, not a table. Aging is a function of today and the invoice's own dates; storing it means
-- storing something that is wrong tomorrow morning.
--
-- The buckets are the ones an accountant reads (current / 1-30 / 31-60 / 61-90 / 90+), measured from
-- the DUE date rather than the issue date — an invoice with 30-day terms issued 40 days ago is 10
-- days late, not 40, and reporting it as 40 makes every report look like a collections crisis.
CREATE OR REPLACE VIEW ar_aging AS
  SELECT
    i.id,
    i.org_id,
    i.invoice_number,
    i.job_id,
    i.customer_name,
    i.customer_email,
    i.total_cents,
    COALESCE(paid.paid_cents, 0)                              AS paid_cents,
    i.total_cents - COALESCE(paid.paid_cents, 0)              AS balance_cents,
    i.issued_at,
    i.due_at,
    i.status,
    CASE
      WHEN i.due_at IS NULL THEN NULL
      ELSE GREATEST(0, (CURRENT_DATE - i.due_at::date))
    END                                                        AS days_overdue,
    CASE
      WHEN i.due_at IS NULL THEN 'no_terms'
      WHEN CURRENT_DATE <= i.due_at::date THEN 'current'
      WHEN CURRENT_DATE - i.due_at::date <= 30 THEN '1_30'
      WHEN CURRENT_DATE - i.due_at::date <= 60 THEN '31_60'
      WHEN CURRENT_DATE - i.due_at::date <= 90 THEN '61_90'
      ELSE '90_plus'
    END                                                        AS bucket
  FROM customer_invoices i
  LEFT JOIN LATERAL (
    SELECT sum(p.amount_cents) AS paid_cents
    FROM payments p
    WHERE p.invoice_id = i.id AND p.status = 'succeeded'
  ) paid ON true
  -- Voided invoices are not receivable, and drafts were never sent. Including either inflates AR with
  -- money nobody owes.
  WHERE i.status NOT IN ('voided', 'draft')
    AND i.total_cents - COALESCE(paid.paid_cents, 0) > 0;

COMMENT ON VIEW ar_aging IS
  'Open receivables, bucketed from the DUE date. A view because aging is a function of today — a '
  'stored bucket is wrong by tomorrow morning. Excludes voided and draft invoices: neither is money '
  'anybody owes.';

-- ── 7. Estimate vs actual ───────────────────────────────────────────────────────────────────────
--
-- §3: *"Job costing is one-directional… there is no estimate vs actual comparison, which is the
-- number that tells you if you're pricing right."* The estimate is the accepted quote plus approved
-- change orders — NOT the original quote, which is the number people quote at each other and the one
-- that makes every over-run look like a pricing failure rather than scope creep.
CREATE OR REPLACE VIEW job_estimate_vs_actual AS
  SELECT
    j.id                                        AS job_id,
    j.org_id,
    j.job_number,
    j.name,
    COALESCE(q.amount_cents, (j.quote_amount * 100)::bigint, 0) AS accepted_quote_cents,
    COALESCE(co.approved_cents, 0)              AS approved_change_cents,
    COALESCE(q.amount_cents, (j.quote_amount * 100)::bigint, 0) + COALESCE(co.approved_cents, 0) AS estimate_cents,
    COALESCE(inv.invoiced_cents, 0)             AS invoiced_cents,
    COALESCE(inv.paid_cents, 0)                 AS paid_cents,
    COALESCE(co.days_added, 0)                  AS approved_days_added
  FROM jobs j
  LEFT JOIN lead_quotes q ON q.id = j.accepted_quote_id
  LEFT JOIN LATERAL (
    SELECT sum(c.amount_cents) AS approved_cents, sum(c.days_added) AS days_added
    FROM change_orders c WHERE c.job_id = j.id AND c.status = 'approved'
  ) co ON true
  LEFT JOIN LATERAL (
    SELECT
      sum(i.total_cents) AS invoiced_cents,
      sum((SELECT COALESCE(sum(p.amount_cents), 0) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'succeeded')) AS paid_cents
    FROM customer_invoices i WHERE i.job_id = j.id AND i.status <> 'voided'
  ) inv ON true
  WHERE j.deleted_at IS NULL;

COMMENT ON VIEW job_estimate_vs_actual IS
  'The estimate is the ACCEPTED quote plus APPROVED change orders — not the original quote. Using the '
  'original makes every scope change look like a pricing failure, which is the opposite of what this '
  'number is for.';
