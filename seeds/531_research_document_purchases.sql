-- 531_research_document_purchases.sql — the document library, and never paying twice (plan R13).
--
-- Purchased documents were tracked in `/tmp/billing/<project>.json` by BillingTracker. On the
-- worker box that directory lives inside a container: it is wiped on every restart and is invisible
-- to the app. Two consequences, both of which cost real money:
--
--   1. Nothing could answer "have we already bought this deed?" A second run on the same property —
--      or a different job in the same county needing the same instrument — bought it again.
--   2. The receipt for money actually spent vanished on deploy.
--
-- This is the ledger AND the library. The unique index is the point: the guard lives in the
-- database, so a race between two concurrent runs on the same county cannot spend twice. A
-- code-side check alone loses that race, and this is exactly the workload that runs concurrently.

CREATE TABLE IF NOT EXISTS research_document_purchases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Text, not a FK: the same string space as research_usage_events.research_project_id, which
    -- carries temp ids for runs that start before a project row exists.
    research_project_id TEXT,
    run_id              TEXT,

    -- ── Identity ────────────────────────────────────────────────────────────────────────────────
    -- A document is identified by the county that recorded it and the instrument number, NOT by
    -- the platform it was bought from. The same deed bought from Tyler and from TexasFile is one
    -- document; keying on the vendor would happily buy it twice.
    county_fips         TEXT NOT NULL,
    instrument_key      TEXT NOT NULL,      -- normalised: uppercased, separators stripped
    instrument_raw      TEXT NOT NULL,      -- what the county actually calls it, for humans
    document_type       TEXT,

    -- ── What was bought ─────────────────────────────────────────────────────────────────────────
    platform_id         TEXT NOT NULL,
    pages               INTEGER NOT NULL DEFAULT 1,
    cost_usd            DECIMAL(10,4) NOT NULL DEFAULT 0,
    transaction_id      TEXT,

    -- Where the file landed. An array because a purchase is often one image per page.
    storage_paths       JSONB NOT NULL DEFAULT '[]',
    receipt             JSONB NOT NULL DEFAULT '{}',

    -- 'completed' is the only state that counts as owned. A failed attempt is recorded so the
    -- reason is visible, but must NOT block a retry — see the partial index below.
    status              TEXT NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('completed','failed','refunded')),
    failure_reason      TEXT,

    purchased_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One completed purchase per document, firm-wide. PARTIAL on status so a failed attempt does not
-- permanently poison an instrument we still need — the failure is a record, not a claim of
-- ownership. A refund likewise releases the document to be bought again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_purchases_owned
    ON research_document_purchases (county_fips, instrument_key)
    WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_doc_purchases_project ON research_document_purchases(research_project_id);
CREATE INDEX IF NOT EXISTS idx_doc_purchases_when    ON research_document_purchases(purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_purchases_platform ON research_document_purchases(platform_id);
