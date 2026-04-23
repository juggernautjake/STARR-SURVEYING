-- ============================================================================
-- 210_hardening.sql
-- STARR RECON — Productization hardening pass
--
-- Consolidation migration that closes out known correctness, security, and
-- performance gaps from files 091-097, 200, 201. Addresses findings from the
-- Phase A migration review conducted after initial application.
--
-- Prerequisites:
--   * All migrations 090-201 must be applied first.
--   * Run against an already-populated schema — this file is purely additive
--     to live state and uses IF EXISTS / OR REPLACE guards throughout.
--
-- Rollback note:
--   Several sections modify RLS policies. If this migration needs to be
--   rolled back, the DROP POLICY IF EXISTS statements in §5-§8 will leave
--   tables with RLS enabled but no policies — effectively locking out
--   anon/authenticated clients. Re-apply 091/200/201's original RLS state
--   (none) by running `ALTER TABLE <table> DISABLE ROW LEVEL SECURITY`
--   on the affected tables. No data is touched.
--
-- Sections:
--   §1. Wallet trigger hardening (concurrency + overdraft rejection)
--   §2. 097 policy hardening (scope open-door writes, normalize auth accessor)
--   §3. Missing foreign keys (safe additions only)
--   §4. Drop redundant indexes
--   §5. 091 — enable RLS + user/project-scoped policies
--   §6. 092 — add authenticated SELECT policies (research_tax, research_topo)
--   §7. 200 — enable RLS + project-scoped policies on recon graph
--   §8. 201 — enable RLS + service-role-only policy on captcha_solves
--   §9. Immutable audit log guard on document_purchase_history
-- ============================================================================

BEGIN;


-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Wallet trigger hardening
-- ─────────────────────────────────────────────────────────────────────────────
-- The original sync_wallet_lifetime_totals() (093) has two bugs:
--
--   (a) Concurrency: two in-flight `document_purchase` inserts for the same
--       user both read the same balance, both subtract, and the running
--       balance diverges from reality. Fix: SELECT ... FOR UPDATE on the
--       wallet row serializes concurrent purchases.
--
--   (b) Silent overdraft: GREATEST(0, balance - amount) caps the debit at
--       zero, meaning a purchase that exceeds balance silently succeeds.
--       The purchase row persists, but the user never paid for it.
--       Fix: RAISE EXCEPTION on overdraft — the trigger's exception
--       propagates to the INSERT, rolling back the purchase row atomically.
--       App code catches the error and surfaces a "fund your wallet" prompt.
--
-- SECURITY DEFINER + explicit search_path hardening: the function runs with
-- the owner's privileges, but without `SET search_path` a malicious schema
-- shadow could hijack function resolution. Pinning to (public, pg_temp)
-- closes that vector.

CREATE OR REPLACE FUNCTION sync_wallet_lifetime_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance numeric(10, 2);
BEGIN
    -- Ensure wallet row exists. Idempotent — safe under concurrent inserts
    -- because ON CONFLICT DO NOTHING serializes at the unique constraint.
    INSERT INTO document_wallet_balance (
        user_email, balance_usd, lifetime_funded_usd, lifetime_spent_usd
    )
    VALUES (NEW.user_email, 0.00, 0.00, 0.00)
    ON CONFLICT (user_email) DO NOTHING;

    IF NEW.transaction_type = 'wallet_credit' AND NEW.status = 'completed' THEN
        -- Credits are additive; concurrent credits are safe (addition commutes).
        UPDATE document_wallet_balance
        SET balance_usd         = balance_usd + NEW.amount_usd,
            lifetime_funded_usd = lifetime_funded_usd + NEW.amount_usd,
            updated_at          = now()
        WHERE user_email = NEW.user_email;

    ELSIF NEW.transaction_type = 'document_purchase' AND NEW.status = 'completed' THEN
        -- Debits are NOT commutative under concurrent writes — we must
        -- serialize on the wallet row. FOR UPDATE takes a row-level lock
        -- that blocks other purchase triggers until this transaction commits
        -- (or rolls back via the exception path below).
        SELECT balance_usd
        INTO   v_current_balance
        FROM   document_wallet_balance
        WHERE  user_email = NEW.user_email
        FOR UPDATE;

        IF v_current_balance < NEW.amount_usd THEN
            -- Overdraft: reject the purchase. The INSERT that invoked this
            -- trigger gets rolled back automatically, so the purchase_history
            -- row doesn't persist and no money is spent.
            RAISE EXCEPTION
                'insufficient_wallet_balance: user=% balance=% requested=%',
                NEW.user_email, v_current_balance, NEW.amount_usd
                USING ERRCODE = '23514';  -- check_violation: apps can catch this cleanly
        END IF;

        UPDATE document_wallet_balance
        SET balance_usd        = balance_usd - NEW.amount_usd,
            lifetime_spent_usd = lifetime_spent_usd + NEW.amount_usd,
            updated_at         = now()
        WHERE user_email = NEW.user_email;

    ELSIF NEW.transaction_type = 'refund' AND NEW.status = 'completed' THEN
        -- Refunds are additive like credits.
        UPDATE document_wallet_balance
        SET balance_usd = balance_usd + NEW.amount_usd,
            updated_at  = now()
        WHERE user_email = NEW.user_email;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger itself unchanged — just the function body. Re-asserting for safety.
DROP TRIGGER IF EXISTS trg_sync_wallet_lifetime_totals ON document_purchase_history;
CREATE TRIGGER trg_sync_wallet_lifetime_totals
    AFTER INSERT ON document_purchase_history
    FOR EACH ROW
    EXECUTE FUNCTION sync_wallet_lifetime_totals();


-- ─────────────────────────────────────────────────────────────────────────────
-- §2. 097 policy hardening
-- ─────────────────────────────────────────────────────────────────────────────
-- Three fixes on lidar_data_cache and cross_county_properties:
--
--   (a) Replace `auth.email()` with `auth.jwt() ->> 'email'` for consistency
--       with 093/095/096. Both resolve to the same value in Supabase, but
--       the `auth.jwt()` form is the documented canonical accessor and
--       matches the rest of the codebase.
--
--   (b) Scope `lidar_cache_insert` — the original `WITH CHECK (true)` lets
--       any authenticated user insert lidar rows for any project. Scope to
--       project owner.
--
--   (c) Scope `cross_county_upsert` — the original `FOR ALL USING (true)
--       WITH CHECK (true)` lets any authenticated user read/write/delete
--       any project's record. Replace with three scoped policies (one per
--       operation) that filter by project ownership.

-- (a)+(b): lidar_data_cache ----------------------------------------------------

DROP POLICY IF EXISTS lidar_cache_select ON lidar_data_cache;
CREATE POLICY lidar_cache_select ON lidar_data_cache
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );

DROP POLICY IF EXISTS lidar_cache_insert ON lidar_data_cache;
CREATE POLICY lidar_cache_insert ON lidar_data_cache
    FOR INSERT
    WITH CHECK (
        project_id IS NULL  -- global cache rows
        OR project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );

DROP POLICY IF EXISTS lidar_cache_delete ON lidar_data_cache;
CREATE POLICY lidar_cache_delete ON lidar_data_cache
    FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );

-- (a)+(c): cross_county_properties ---------------------------------------------

DROP POLICY IF EXISTS cross_county_select ON cross_county_properties;
CREATE POLICY cross_county_select ON cross_county_properties
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );

DROP POLICY IF EXISTS cross_county_upsert ON cross_county_properties;
CREATE POLICY cross_county_insert ON cross_county_properties
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY cross_county_update ON cross_county_properties
    FOR UPDATE
    USING (
        project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY cross_county_delete ON cross_county_properties
    FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Missing foreign keys
-- ─────────────────────────────────────────────────────────────────────────────
-- Only one FK can be safely added without a data migration:
--   * captcha_solves.job_id → research_projects.id (both UUID, column nullable)
--
-- Two others are deferred because the referencing column is TEXT, not UUID,
-- and needs a full column migration (add uuid column, backfill, drop text):
--   * research_usage_events.research_project_id (TEXT)
--   * document_purchase_history.project_id (TEXT)
--
-- Those are left as-is; a follow-up migration can handle them once a
-- decision is made about whether to preserve or drop pre-backfill rows.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'captcha_solves_job_id_fkey'
    ) THEN
        ALTER TABLE captcha_solves
            ADD CONSTRAINT captcha_solves_job_id_fkey
            FOREIGN KEY (job_id)
            REFERENCES research_projects(id)
            ON DELETE SET NULL;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §4. Drop redundant indexes
-- ─────────────────────────────────────────────────────────────────────────────
-- Each of these duplicates a btree implicitly created by a UNIQUE constraint
-- on the same column. Dropping saves write throughput and storage.

DROP INDEX IF EXISTS idx_document_wallet_user_email;    -- dup of document_wallet_balance_user_email_key
DROP INDEX IF EXISTS idx_pipeline_versions_version_id;  -- dup of pipeline_versions_version_id_key
DROP INDEX IF EXISTS idx_cross_county_project;          -- dup of cross_county_properties_project_id_key
DROP INDEX IF EXISTS idx_report_shares_token;           -- dup of report_shares_token_key


-- ─────────────────────────────────────────────────────────────────────────────
-- §5. 091 — enable RLS + user/project-scoped policies
-- ─────────────────────────────────────────────────────────────────────────────
-- All six 091 tables currently have RLS OFF. Enabling with scoped policies
-- so authenticated users only see their own data. Service role bypasses RLS
-- as always.

-- research_batch_jobs — owned by created_by email
ALTER TABLE research_batch_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_batch_jobs_owner_all ON research_batch_jobs;
CREATE POLICY research_batch_jobs_owner_all ON research_batch_jobs
    FOR ALL
    USING      (created_by = auth.jwt() ->> 'email')
    WITH CHECK (created_by = auth.jwt() ->> 'email');
GRANT SELECT ON research_batch_jobs TO authenticated;
GRANT ALL    ON research_batch_jobs TO service_role;

-- research_flood_zone — scoped by project ownership
ALTER TABLE research_flood_zone ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_flood_zone_owner_select ON research_flood_zone;
CREATE POLICY research_flood_zone_owner_select ON research_flood_zone
    FOR SELECT
    USING (
        research_project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );
GRANT SELECT ON research_flood_zone TO authenticated;
GRANT ALL    ON research_flood_zone TO service_role;

-- research_chain_of_title — scoped by project ownership
ALTER TABLE research_chain_of_title ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_chain_of_title_owner_select ON research_chain_of_title;
CREATE POLICY research_chain_of_title_owner_select ON research_chain_of_title
    FOR SELECT
    USING (
        research_project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );
GRANT SELECT ON research_chain_of_title TO authenticated;
GRANT ALL    ON research_chain_of_title TO service_role;

-- research_subscriptions — owned by user_email
ALTER TABLE research_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_subscriptions_owner_select ON research_subscriptions;
CREATE POLICY research_subscriptions_owner_select ON research_subscriptions
    FOR SELECT
    USING (user_email = auth.jwt() ->> 'email');
GRANT SELECT ON research_subscriptions TO authenticated;
GRANT ALL    ON research_subscriptions TO service_role;

-- research_usage_events — owned by user_email
ALTER TABLE research_usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_usage_events_owner_select ON research_usage_events;
CREATE POLICY research_usage_events_owner_select ON research_usage_events
    FOR SELECT
    USING (user_email = auth.jwt() ->> 'email');
GRANT SELECT ON research_usage_events TO authenticated;
GRANT ALL    ON research_usage_events TO service_role;

-- research_clerk_lookups — reference data (county → clerk system mapping),
-- not user-owned. Authenticated users can read the full table.
ALTER TABLE research_clerk_lookups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_clerk_lookups_read_all ON research_clerk_lookups;
CREATE POLICY research_clerk_lookups_read_all ON research_clerk_lookups
    FOR SELECT
    TO authenticated
    USING (true);
GRANT SELECT ON research_clerk_lookups TO authenticated;
GRANT ALL    ON research_clerk_lookups TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- §6. 092 — add authenticated SELECT policies
-- ─────────────────────────────────────────────────────────────────────────────
-- research_tax and research_topo had RLS enabled but only a service_role_*
-- policy — meaning authenticated users got zero rows from PostgREST even
-- for their own projects. Header comment of 092 claims end-users should
-- see records for projects they own. Honor that.

DROP POLICY IF EXISTS research_tax_owner_select ON research_tax;
CREATE POLICY research_tax_owner_select ON research_tax
    FOR SELECT
    USING (
        research_project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );
GRANT SELECT ON research_tax TO authenticated;

DROP POLICY IF EXISTS research_topo_owner_select ON research_topo;
CREATE POLICY research_topo_owner_select ON research_topo
    FOR SELECT
    USING (
        research_project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );
GRANT SELECT ON research_topo TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §7. 200 — enable RLS + project-scoped policies on recon graph
-- ─────────────────────────────────────────────────────────────────────────────
-- Nodes can be "global" (project_id IS NULL) — shared across projects, e.g.
-- a subdivision used by many jobs in the same county. Visibility rules:
--   * Global nodes (project_id IS NULL) → visible to any authenticated user.
--   * Project-scoped nodes → visible only to the project owner.
-- Edges inherit from the edge's own project_id, same logic.

-- recon_nodes
ALTER TABLE recon_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recon_nodes_read ON recon_nodes;
CREATE POLICY recon_nodes_read ON recon_nodes
    FOR SELECT
    USING (
        project_id IS NULL
        OR project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );
GRANT SELECT ON recon_nodes TO authenticated;
GRANT ALL    ON recon_nodes TO service_role;

-- recon_edges
ALTER TABLE recon_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recon_edges_read ON recon_edges;
CREATE POLICY recon_edges_read ON recon_edges
    FOR SELECT
    USING (
        project_id IS NULL
        OR project_id IN (
            SELECT id FROM research_projects
            WHERE created_by = auth.jwt() ->> 'email'
        )
    );
GRANT SELECT ON recon_edges TO authenticated;
GRANT ALL    ON recon_edges TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- §8. 201 — enable RLS on captcha_solves (service-role only)
-- ─────────────────────────────────────────────────────────────────────────────
-- Operational telemetry, not user-facing. Only the worker (service_role)
-- writes; only admins (service_role via admin API) should read. RLS enabled
-- with no authenticated policy = authenticated clients see zero rows.

ALTER TABLE captcha_solves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS captcha_solves_service_role ON captcha_solves;
CREATE POLICY captcha_solves_service_role ON captcha_solves
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
GRANT ALL ON captcha_solves TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- §9. Immutable audit log guard on document_purchase_history
-- ─────────────────────────────────────────────────────────────────────────────
-- The table is documented as an immutable audit log (093 header), but RLS
-- currently only defines a SELECT policy. UPDATE and DELETE from non-
-- service-role clients aren't blocked in any explicit way. Add explicit
-- deny policies so the intent is encoded in schema.

DROP POLICY IF EXISTS document_purchase_history_no_update ON document_purchase_history;
CREATE POLICY document_purchase_history_no_update ON document_purchase_history
    FOR UPDATE
    USING (false);

DROP POLICY IF EXISTS document_purchase_history_no_delete ON document_purchase_history;
CREATE POLICY document_purchase_history_no_delete ON document_purchase_history
    FOR DELETE
    USING (false);

-- Note: service_role still bypasses RLS, so admin tooling can correct
-- erroneous rows if absolutely needed. The policies above block only
-- anon/authenticated paths.


COMMIT;
