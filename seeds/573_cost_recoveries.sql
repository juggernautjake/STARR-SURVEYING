-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 573 — Pass-through costs: what we paid on the customer's behalf, and what we got back.
--
-- FINANCE_TAX_AND_INTAKE plan F2. We pay a sanitarian to complete a survey, then bill the customer
-- for it. The money moves twice and, when it works, nets to zero — but unless the two legs are
-- LINKED, the books show an expense on one day and an unrelated revenue on another. That overstates
-- both sides, misstates the profit on the job, and leaves nobody able to answer "did we actually get
-- that $450 back?" without reading two documents side by side.
--
-- ── WHY THIS IS A TABLE AND NOT A BOOLEAN ───────────────────────────────────────────────────────
-- The tempting design is `receipts.is_pass_through BOOLEAN`, and it is wrong in exactly the case
-- that costs money. Pay a sanitarian $450, bill the customer $400, and the flag says "pass-through,
-- nets to zero" while the job quietly lost $50. Over a year of small shortfalls that is a real
-- number nobody ever sees, because every individual row looked like a wash.
--
-- Recovery is therefore ARITHMETIC over real linked amounts (lib/finance/cost-recovery.ts), and
-- `NO_NET_GAIN` is returned only when what was billed equals what was paid, to the cent. Billing
-- MORE than the cost is not a pass-through either — that is margin, and filing it as a wash
-- understates income.
--
-- ── WHY THE LINK CARRIES AN AMOUNT, AND POINTS AT AN INVOICE RATHER THAN A LINE ─────────────────
-- `customer_invoices.line_items` is a JSONB array with no stable per-line identity, so a foreign key
-- to "the line that recovered this" would be an index into an array that reordering silently
-- invalidates — a link that looks intact while pointing at the wrong line is worse than no link.
-- The invoice is the stable thing; the amount is recorded here, and `line_description` snapshots
-- what it was billed as at the time.
--
-- One expense can be split across several invoices — a shared plat fee across two lots is ordinary,
-- not an edge case — so this is a table of links, not a column on the receipt.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cost_recoveries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The expense leg. Nullable FK rather than NOT NULL because a pass-through cost does not always
    -- arrive as a photographed receipt — a sanitarian's emailed bill is the common case — and
    -- refusing to record the recovery until a receipt exists would lose the link entirely.
    receipt_id        UUID REFERENCES receipts(id) ON DELETE CASCADE,

    -- What we actually paid, in cents. Stored here rather than read from the receipt so a recovery
    -- for a bill with no receipt row still has a cost, and so the arithmetic has one source.
    cost_cents        INTEGER NOT NULL CHECK (cost_cents >= 0),

    -- Who we paid, for the cases with no receipt row. "Bell County Sanitarian", "ACME Drilling".
    payee             TEXT,
    description       TEXT,

    -- The job the cost belongs to, so a job's true margin can be computed.
    job_id            UUID REFERENCES jobs(id) ON DELETE SET NULL,

    -- Deliberately absorbed. A DECISION, distinct from "not billed yet" — the difference between
    -- "we ate this" and "we forgot", which is precisely what a bookkeeper's working queue turns on.
    not_recoverable   BOOLEAN NOT NULL DEFAULT FALSE,
    not_recoverable_reason TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID REFERENCES registered_users(id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cost_recoveries_receipt ON cost_recoveries (receipt_id);
CREATE INDEX IF NOT EXISTS idx_cost_recoveries_job     ON cost_recoveries (job_id);

-- The bookkeeper's working queue: money paid out that has not been billed on and was not knowingly
-- absorbed. A partial index so it stays a lookup rather than a scan of every pass-through ever.
CREATE INDEX IF NOT EXISTS idx_cost_recoveries_open
    ON cost_recoveries (created_at) WHERE not_recoverable = FALSE;

-- ── The recovery leg ────────────────────────────────────────────────────────────────────────────
-- One row per amount billed on an invoice against a cost. Several per cost is normal.
CREATE TABLE IF NOT EXISTS cost_recovery_links (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cost_recovery_id   UUID NOT NULL REFERENCES cost_recoveries(id) ON DELETE CASCADE,
    invoice_id         UUID NOT NULL REFERENCES customer_invoices(id) ON DELETE CASCADE,

    -- What was billed to recover this cost, in cents. NOT necessarily the invoice total, and not
    -- necessarily equal to the cost — the whole point is that the two can differ.
    amount_cents       INTEGER NOT NULL CHECK (amount_cents >= 0),

    -- Snapshot of how it appeared on the invoice, since line_items has no stable identity and the
    -- wording is what a customer will quote back at you.
    line_description   TEXT,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         UUID REFERENCES registered_users(id) ON DELETE SET NULL,

    -- The same cost billed twice on the same invoice is a data-entry slip, not a split.
    CONSTRAINT cost_recovery_links_unique_per_invoice UNIQUE (cost_recovery_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_cost_recovery_links_invoice ON cost_recovery_links (invoice_id);

-- NOTE ON VOIDED INVOICES. `lib/finance/cost-recovery.ts` excludes voided invoices from the
-- recovered total but keeps the link — an invoice raised and then voided is a fact about what
-- happened, and deleting it would silently re-open the cost with no trace of the attempt. Voiding is
-- read from `customer_invoices.status = 'voided'`; there is no duplicate flag here, because two
-- places to record the same thing is how they come to disagree.

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
-- Deny-by-default, same floor as the rest of the admin schema. These rows say what a job really
-- cost and what the customer was really charged; every read and write goes through a service-role
-- route that has already checked the session and the role.
ALTER TABLE cost_recoveries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_recovery_links  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cost_recoveries' AND policyname = 'cost_recoveries_no_direct_access') THEN
    CREATE POLICY cost_recoveries_no_direct_access ON cost_recoveries FOR ALL USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cost_recovery_links' AND policyname = 'cost_recovery_links_no_direct_access') THEN
    CREATE POLICY cost_recovery_links_no_direct_access ON cost_recovery_links FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;
