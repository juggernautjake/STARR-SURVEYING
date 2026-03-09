-- ============================================================================
-- 091_phase11_expansion_tables.sql
-- Phase 11: Product Expansion & Subscription Platform — Database Schema
--
-- Creates tables for:
--   1. research_batch_jobs      — BullMQ batch research job tracking
--   2. research_flood_zone      — FEMA NFHL flood zone results per project
--   3. research_chain_of_title  — Chain of title results per project
--   4. research_subscriptions   — Stripe subscription records per user
--   5. research_usage_events    — Per-project AI token / API usage events
--   6. research_clerk_lookups   — County clerk lookup results (cached)
--
-- Depends on: 090_research_tables.sql (research_projects table)
-- Usage:  Run via Supabase SQL Editor or psql after 090_research_tables.sql
-- ============================================================================

BEGIN;

-- ── 1. research_batch_jobs ───────────────────────────────────────────────────
-- Tracks multi-property batch research jobs submitted to the BullMQ worker.
-- Corresponds to BatchJob in worker/src/types/expansion.ts.

CREATE TABLE IF NOT EXISTS research_batch_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        TEXT UNIQUE NOT NULL,   -- BullMQ job ID from worker
    created_by      TEXT NOT NULL,          -- user email
    status          TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),

    -- Input
    property_count  INTEGER NOT NULL DEFAULT 0,
    options         JSONB NOT NULL DEFAULT '{}',

    -- Progress
    completed_count INTEGER NOT NULL DEFAULT 0,
    failed_count    INTEGER NOT NULL DEFAULT 0,
    results         JSONB NOT NULL DEFAULT '[]',    -- array of per-property results

    -- Timing
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user ON research_batch_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON research_batch_jobs(status);


-- ── 2. research_flood_zone ───────────────────────────────────────────────────
-- FEMA NFHL flood zone query results cached per project.

CREATE TABLE IF NOT EXISTS research_flood_zone (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    created_by          TEXT NOT NULL,

    -- Query parameters
    longitude           DECIMAL(10,7),
    latitude            DECIMAL(10,7),

    -- Result (full FloodZoneResult JSON)
    result              JSONB,
    primary_zone        TEXT,
    is_in_floodplain    BOOLEAN,
    flood_insurance_required BOOLEAN,
    firm_panel_number   TEXT,
    risk_level          TEXT CHECK (risk_level IN ('high', 'moderate', 'low', 'undetermined')),

    -- Metadata
    source_url          TEXT,
    queried_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    error               TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flood_zone_project ON research_flood_zone(research_project_id);


-- ── 3. research_chain_of_title ───────────────────────────────────────────────
-- Chain of title results per project (built by chain-builder.ts).

CREATE TABLE IF NOT EXISTS research_chain_of_title (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    created_by          TEXT NOT NULL,

    -- Chain summary
    links_found         INTEGER NOT NULL DEFAULT 0,
    oldest_year         INTEGER,
    newest_year         INTEGER,
    has_gap             BOOLEAN DEFAULT false,

    -- Full result (ChainLink[] JSON array)
    chain               JSONB NOT NULL DEFAULT '[]',
    warnings            JSONB NOT NULL DEFAULT '[]',

    queried_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    error               TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chain_of_title_project ON research_chain_of_title(research_project_id);


-- ── 4. research_subscriptions ────────────────────────────────────────────────
-- Stripe subscription records.  One row per user subscription.
-- Stripe is the source of truth; this table is a local cache/reference.

CREATE TABLE IF NOT EXISTS research_subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email          TEXT NOT NULL,          -- references registered_users.email
    stripe_customer_id  TEXT,
    stripe_subscription_id TEXT,
    tier                TEXT NOT NULL DEFAULT 'free'
                            CHECK (tier IN ('free', 'surveyor_pro', 'firm_unlimited')),
    status              TEXT NOT NULL DEFAULT 'inactive'
                            CHECK (status IN ('active', 'inactive', 'past_due', 'cancelled', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user ON research_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON research_subscriptions(stripe_subscription_id);


-- ── 5. research_usage_events ────────────────────────────────────────────────
-- Per-project AI token / API usage events for cost tracking.
-- Corresponds to UsageEvent in worker/src/types/expansion.ts.

CREATE TABLE IF NOT EXISTS research_usage_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id TEXT NOT NULL,          -- project ID string (may be temp ID)
    user_email          TEXT NOT NULL,
    event_type          TEXT NOT NULL,          -- 'ai_call', 'document_fetch', 'api_lookup'
    model               TEXT,                   -- AI model name
    prompt_tokens       INTEGER NOT NULL DEFAULT 0,
    completion_tokens   INTEGER NOT NULL DEFAULT 0,
    total_tokens        INTEGER NOT NULL DEFAULT 0,
    cost_usd            DECIMAL(10,6) NOT NULL DEFAULT 0,
    metadata            JSONB NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_project ON research_usage_events(research_project_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user ON research_usage_events(user_email);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON research_usage_events(created_at);


-- ── 6. research_clerk_lookups ────────────────────────────────────────────────
-- Cached clerk adapter lookups — avoids re-querying the county registry.

CREATE TABLE IF NOT EXISTS research_clerk_lookups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    county_name         TEXT NOT NULL,
    county_fips         TEXT,
    clerk_system        TEXT NOT NULL,          -- 'kofile', 'henschen', 'texasfile', 'idocket', 'manual'
    clerk_url           TEXT,
    requires_manual     BOOLEAN DEFAULT false,
    notes               TEXT,

    -- Cache validity
    cached_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    cache_expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clerk_lookups_county ON research_clerk_lookups(county_name);

-- ── Seed: pre-cache the 17 counties from clerk-registry.ts ──────────────────

INSERT INTO research_clerk_lookups (county_name, county_fips, clerk_system, clerk_url, requires_manual)
VALUES
    ('Bell',       '48027', 'kofile',    'https://bellcountytx.com/district-clerk/', false),
    ('Travis',     '48453', 'kofile',    'https://www.traviscountytx.gov/county-clerk/', false),
    ('Bexar',      '48029', 'kofile',    'https://www.bexar.org/1615/County-Clerk', false),
    ('Dallas',     '48113', 'kofile',    'https://www.dallascounty.org/government/clerk/', false),
    ('Tarrant',    '48439', 'henschen',  'https://recordsonline.tarrantcounty.com/', false),
    ('Collin',     '48085', 'kofile',    'https://www.collincountytx.gov/county_clerk/', false),
    ('Denton',     '48121', 'kofile',    'https://dentoncounty.gov/Departments/CountyClerk/', false),
    ('El Paso',    '48141', 'kofile',    'https://www.epcounty.com/countyclerk/', false),
    ('Hidalgo',    '48215', 'texasfile', 'https://www.texasfile.com/', false),
    ('Harris',     '48201', 'hcad',      'https://www.hcad.org/', false),
    ('Fort Bend',  '48157', 'kofile',    'https://www.fortbendcountytx.gov/government/departments/county-clerk/', false),
    ('Williamson', '48491', 'kofile',    'https://www.wilco.org/Departments/County-Clerk/', false),
    ('Montgomery', '48339', 'texasfile', 'https://www.texasfile.com/', false),
    ('Galveston',  '48167', 'texasfile', 'https://www.texasfile.com/', false),
    ('Brazoria',   '48039', 'texasfile', 'https://www.texasfile.com/', false),
    ('Lubbock',    '48303', 'kofile',    'https://co.lubbock.tx.us/departments/county_clerk/', false),
    ('McLennan',   '48309', 'kofile',    'https://www.co.mclennan.tx.us/index.aspx?NID=136', false)
ON CONFLICT (county_name) DO NOTHING;

COMMIT;
