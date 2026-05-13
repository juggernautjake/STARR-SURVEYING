-- ============================================================================
-- 260_saas_multi_tenancy_foundation.sql
--
-- SaaS pivot — Phase A slice M-1: schema-only multi-tenancy foundation.
-- Adds the tables + nullable org_id columns that downstream slices fill
-- in. NO BEHAVIOR CHANGE — every existing query continues to work because
-- org_id is nullable and unused at this slice. RLS is added in later
-- slices (M-6 / M-7 / M-8) per docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §6.
--
-- Idempotent: every CREATE / ALTER is guarded by IF NOT EXISTS or an
-- explicit existence check so this file is safe to re-run via
-- seeds/run_all.sh.
--
-- Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §3 + §6.2.
-- ============================================================================

BEGIN;

-- ── 1. Enums ────────────────────────────────────────────────────────────────

-- org_role_enum: a user's role WITHIN an organization. Separate from the
-- global UserRole used internally today; the global role becomes operator-
-- side only (see operator_users in OPERATOR_CONSOLE.md §5).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role_enum') THEN
    CREATE TYPE public.org_role_enum AS ENUM (
      'admin',        -- full org admin: settings, billing, user mgmt
      'surveyor',     -- standard practitioner: field + CAD + research
      'bookkeeper',   -- billing-only access (office manager who isn't a surveyor)
      'field_only',   -- mobile + receipts + own jobs; no admin
      'view_only'     -- read access to explicitly-granted surfaces
    );
  END IF;
END $$;

-- ── 2. Core multi-tenant tables ─────────────────────────────────────────────

-- organizations: the tenant table.
CREATE TABLE IF NOT EXISTS public.organizations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'trialing',
                          -- trialing / active / past_due / canceled / paused /
                          -- pending / suspended / pending_deletion
  state                   TEXT,
  country                 TEXT DEFAULT 'US',
  primary_admin_email     TEXT NOT NULL,
  billing_contact_email   TEXT,
  phone                   TEXT,
  logo_url                TEXT,
  brand_color             TEXT,
  domain_restriction      TEXT,
  custom_domain           TEXT UNIQUE,
  custom_domain_verified  BOOLEAN DEFAULT false,
  tags                    TEXT[] DEFAULT '{}',
  metadata                JSONB DEFAULT '{}',
  founded_at              TIMESTAMPTZ DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);
COMMENT ON TABLE  public.organizations IS 'SaaS tenant. One row per customer firm. Starr Surveying is tenant #1 (seeded in slice M-2).';
COMMENT ON COLUMN public.organizations.slug IS 'Lowercase, [a-z0-9-], 5-40 chars. Becomes the subdomain: <slug>.starrsoftware.com. Reserved slugs enforced in app layer.';
COMMENT ON COLUMN public.organizations.custom_domain IS 'Optional Firm Suite tier feature. Customer points CNAME to cname.vercel-dns.com; Vercel issues SSL.';

CREATE INDEX IF NOT EXISTS idx_organizations_slug          ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status        ON public.organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_custom_domain ON public.organizations(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_deleted_at    ON public.organizations(deleted_at) WHERE deleted_at IS NOT NULL;

-- organization_members: user ↔ org many-to-many. A user can belong to
-- multiple orgs (rare but supported).
CREATE TABLE IF NOT EXISTS public.organization_members (
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_email        TEXT NOT NULL,                    -- references registered_users.email logically
  role              public.org_role_enum NOT NULL DEFAULT 'surveyor',
  bundle_overrides  TEXT[],                            -- null = inherit org's full bundle access
  status            TEXT NOT NULL DEFAULT 'active',   -- active / suspended / removed
  invited_by_email  TEXT,
  invited_at        TIMESTAMPTZ,
  joined_at         TIMESTAMPTZ DEFAULT now(),
  last_active_at    TIMESTAMPTZ,
  PRIMARY KEY (org_id, user_email)
);
COMMENT ON TABLE  public.organization_members IS 'A user is a member of zero, one, or many orgs. Status=active means they can sign in as that org.';
COMMENT ON COLUMN public.organization_members.bundle_overrides IS 'Per-user bundle restriction. null = inherit org subscription bundles. Use to gate field_only users away from CAD bundle, etc.';

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_email);

-- subscriptions: per-org firm-level Stripe subscription mirror.
-- (Stripe is source of truth; this is a denormalized cache for fast UI.)
-- Note: research_subscriptions exists as a per-user research add-on
-- (seeds/093_phase15_wallet_tables.sql). It is preserved for legacy
-- migration during M-2; downstream slices retire it for new customers.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_customer_id      TEXT,
  status                  TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at           TIMESTAMPTZ,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN DEFAULT false,
  canceled_at             TIMESTAMPTZ,
  bundles                 TEXT[] NOT NULL DEFAULT '{}',  -- ['recon','draft','office','field','academy','firm_suite']
  seat_count              INT NOT NULL DEFAULT 1,
  base_price_cents        INT,
  per_seat_price_cents    INT,
  metadata                JSONB DEFAULT '{}',
  updated_at              TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE  public.subscriptions IS 'Firm-level Stripe subscription mirror. One row per org. Stripe is source of truth; daily reconciliation cron catches drift.';
COMMENT ON COLUMN public.subscriptions.bundles IS 'Active product bundles. Drives requiredBundle route gate. See SUBSCRIPTION_BILLING_SYSTEM.md §3.1.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_status   ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON public.subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- org_settings: per-org configuration (separate from organizations so we
-- can extend without bloating the row).
CREATE TABLE IF NOT EXISTS public.org_settings (
  org_id              UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_invite_role public.org_role_enum DEFAULT 'surveyor',
  mfa_required        BOOLEAN DEFAULT false,
  session_timeout_min INT DEFAULT 480,                 -- 8h default
  webhook_url         TEXT,                            -- per-org notifications endpoint
  feature_flags       JSONB DEFAULT '{}',
  notifications_pref  JSONB DEFAULT '{}',              -- {trial_warnings: bool, ...}
  updated_at          TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.org_settings IS 'Per-org configuration. One row per org. Optional — defaults apply when no row exists.';

-- user_active_org: helper for restoring active-org context on session re-
-- creation (mobile re-launch, browser cookie expiry, etc.). JWT carries
-- active_org_id at runtime; this table is the persistent backup.
CREATE TABLE IF NOT EXISTS public.user_active_org (
  user_email     TEXT PRIMARY KEY,
  active_org_id  UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.user_active_org IS 'Persistent active-org-id per user. Used as fallback when JWT is freshly minted. JWT is authoritative during a session.';

-- ── 3. Nullable org_id columns on existing tenant tables ────────────────────
--
-- Adds org_id column without backfilling or constraining. Existing queries
-- ignore the new column. Slice M-4 backfills these to Starr's org_id;
-- slice M-5 tightens to NOT NULL. RLS is M-6 onward.
--
-- The migration is intentionally tolerant: only ALTER TABLEs that actually
-- exist. A surveying schema in transit may not have every table — better
-- to soft-add to whatever's there than to fail on a missing one.

CREATE OR REPLACE FUNCTION public._maybe_add_org_id(p_table TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RAISE NOTICE 'Skipping % — table does not exist', p_table;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'org_id'
  ) THEN
    RAISE NOTICE 'Skipping % — org_id column already exists', p_table;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL', p_table);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_org_id ON public.%I(org_id) WHERE org_id IS NOT NULL', p_table || '_orgid', p_table);
  RAISE NOTICE 'Added nullable org_id to %', p_table;
END $$;

DO $$
DECLARE
  tenant_tables TEXT[] := ARRAY[
    -- Work / business management
    'jobs', 'job_team', 'job_tags', 'job_files',
    'employees', 'time_logs', 'time_log_advances', 'time_log_bonuses', 'time_log_rates',
    'assignments', 'leads', 'mileage_entries', 'vehicles', 'schedule_events',
    -- Field data
    'field_data_points', 'field_data_attachments',
    -- Equipment
    'equipment', 'equipment_assignments', 'equipment_templates', 'equipment_template_items',
    'equipment_maintenance', 'equipment_maintenance_events', 'equipment_consumables',
    'equipment_overrides', 'equipment_tax_elections', 'equipment_photos',
    -- Research / Recon
    'research_projects', 'research_documents', 'research_document_versions',
    'research_artifacts', 'research_runs', 'research_pipeline_jobs',
    'research_report_shares', 'research_lidar_runs',
    -- Wallet / purchases (existing per-user; org_id added for forward-compat)
    'document_wallet_balance', 'document_purchase_history', 'research_usage_events',
    'research_subscriptions',
    -- People / payroll / pay
    'payroll_periods', 'payroll_entries', 'payout_log', 'pay_progression',
    'pay_advances', 'pay_bonuses', 'certifications', 'profile_changes',
    'receipts', 'receipt_attachments',
    -- Communication
    'messages', 'message_contacts', 'discussions', 'discussion_threads',
    'discussion_messages', 'notes',
    -- Learning (progress tables are tenant data; content tables remain
    -- platform-owned — see MULTI_TENANCY_FOUNDATION §2.3)
    'learning_progress', 'quiz_attempts', 'module_completions',
    'fieldbook_entries', 'fieldbook_entry_attachments', 'learning_credits',
    -- Notifications + observability
    'notifications', 'error_reports',
    -- Rewards
    'rewards_balance', 'rewards_history', 'rewards_store_purchases'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    PERFORM public._maybe_add_org_id(t);
  END LOOP;
END $$;

-- Cleanup helper (it served its purpose; not part of the long-term schema).
DROP FUNCTION public._maybe_add_org_id(TEXT);

-- ── 4. registered_users gets default_org_id ─────────────────────────────────
--
-- Slice M-3 backfills this to Starr's org_id for all existing users. Until
-- then it's nullable and unused.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'registered_users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = 'default_org_id') THEN
    ALTER TABLE public.registered_users
      ADD COLUMN default_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
    COMMENT ON COLUMN public.registered_users.default_org_id IS 'The org this user lands in by default at sign-in. null = no org (operator-only or orphaned).';
  END IF;
END $$;

COMMIT;

-- ── Verification queries (run manually to confirm the migration applied) ────
--
--   SELECT count(*) FROM public.organizations;            -- 0 (M-2 seeds Starr)
--   SELECT count(*) FROM public.organization_members;     -- 0 (M-3 backfills)
--   SELECT count(*) FROM public.subscriptions;            -- 0 (M-2 seeds Starr's sub)
--
--   -- Confirm org_id column added to tenant tables:
--   SELECT table_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND column_name = 'org_id'
--    ORDER BY table_name;
--
--   -- Confirm enum exists:
--   SELECT enumlabel FROM pg_enum
--    WHERE enumtypid = 'public.org_role_enum'::regtype
--    ORDER BY enumsortorder;
