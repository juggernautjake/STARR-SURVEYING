-- ============================================================================
-- 265_saas_operator_console_schema.sql
--
-- SaaS pivot — Phase C foundation: operator console schema. Adds the
-- tables that back the /platform/* console (operator_users for the
-- platform-side roster, impersonation_sessions for tracked
-- "sign in as customer" support flows, audit_log as the cross-cutting
-- immutable record of every operator action).
--
-- No behavior change — adding tables, no app code reads them yet. The
-- /platform/* routes land in subsequent slices.
--
-- Spec: docs/planning/in-progress/OPERATOR_CONSOLE.md §5.
-- ============================================================================

BEGIN;

-- ── Operator role enum ──────────────────────────────────────────────────────
-- Separate enum from org_role_enum since operator roles live OUTSIDE any
-- org membership.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_role_enum') THEN
    CREATE TYPE public.operator_role_enum AS ENUM (
      'platform_admin',    -- full ops + write everywhere
      'platform_billing',  -- billing-only writes
      'platform_support',  -- support-only writes
      'platform_developer',-- dev tools + health, read-only otherwise
      'platform_observer'  -- read-only across the platform
    );
  END IF;
END $$;

-- ── Operator roster ─────────────────────────────────────────────────────────
-- A user can be an org member AND an operator (e.g. Starr's founding team).
-- The two roles are independent — operator capabilities are evaluated
-- separately and don't intersect with org_role_enum.
CREATE TABLE IF NOT EXISTS public.operator_users (
  email          TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  role           public.operator_role_enum NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',   -- active / suspended
  mfa_secret     TEXT,                              -- TOTP secret (encrypted at app layer)
  mfa_enrolled_at TIMESTAMPTZ,
  password_hash  TEXT,                              -- bcrypt; required for credentials-only login
  invited_by     TEXT REFERENCES public.operator_users(email) ON DELETE SET NULL,
  invited_at     TIMESTAMPTZ DEFAULT now(),
  last_signin_at TIMESTAMPTZ,
  last_signin_ip INET,
  metadata       JSONB DEFAULT '{}'
);
COMMENT ON TABLE  public.operator_users IS 'Starr Software operator team. Separate from org-side users. Credentials-only login + mandatory MFA.';
COMMENT ON COLUMN public.operator_users.mfa_secret IS 'TOTP secret. Encrypted at application layer before storage (never plaintext).';

-- ── Impersonation sessions ──────────────────────────────────────────────────
-- Every "sign in as customer" support flow gets a row. Mandatory reason +
-- 30-min TTL. Audit-loud per OPERATOR_CONSOLE.md §3.4.
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_email    TEXT NOT NULL REFERENCES public.operator_users(email),
  target_org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_user_email TEXT NOT NULL,
  reason            TEXT NOT NULL,                  -- required, ≥10 chars (app-enforced)
  scope             TEXT NOT NULL DEFAULT 'standard',  -- standard / deep
  started_at        TIMESTAMPTZ DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,
  ended_reason      TEXT,                           -- operator_ended / ttl_expired / system_revoked
  ip_address        INET,
  user_agent        TEXT,
  notified_org_admin BOOLEAN DEFAULT false
);
COMMENT ON TABLE public.impersonation_sessions IS 'Tracks every "sign in as customer" support session. Mandatory reason; 30-min TTL; visible red banner during session.';

CREATE INDEX IF NOT EXISTS idx_impersonation_active   ON public.impersonation_sessions(target_org_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_impersonation_operator ON public.impersonation_sessions(operator_email, started_at DESC);

-- ── Audit log (cross-tenant, append-only) ───────────────────────────────────
-- Immutable record of every operator + customer action that needs trust /
-- compliance. Partitioned-by-month after year 1; v1 ships unpartitioned.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_email  TEXT,                             -- null when not operator-triggered
  customer_email  TEXT,                             -- null when not customer-triggered
  org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
                  -- IMPERSONATION_STARTED, PLAN_CHANGED, REFUND_PROCESSED,
                  -- SUBSCRIPTION_CANCELED, OPERATOR_INVITED, ROLE_GRANTED,
                  -- BROADCAST_SENT, RELEASE_TAGGED, ORG_CREATED, USER_INVITED,
                  -- PAYMENT_FAILED, PAYMENT_SUCCEEDED, DATA_EXPORTED, etc.
  severity        TEXT DEFAULT 'info',              -- info / warning / critical
  metadata        JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.audit_log IS 'Immutable cross-tenant action log. Operator actions, customer billing events, security events. No UPDATE / DELETE allowed at the application layer.';

CREATE INDEX IF NOT EXISTS idx_audit_org      ON public.audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_operator ON public.audit_log(operator_email, created_at DESC) WHERE operator_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action   ON public.audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON public.audit_log(severity, created_at DESC) WHERE severity != 'info';

-- ── Pending operator actions (two-person rule) ──────────────────────────────
-- High-risk actions queued for second-operator approval. Per
-- OPERATOR_CONSOLE.md §6.4: granting platform_admin, refunds >$500,
-- plan-changes that increase MRR by >20%, breaking force-updates,
-- org deletion.
CREATE TABLE IF NOT EXISTS public.pending_operator_actions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_email       TEXT NOT NULL REFERENCES public.operator_users(email),
  action_type          TEXT NOT NULL,               -- GRANT_PLATFORM_ADMIN / REFUND_LARGE /
                                                    -- PLAN_CHANGE_MAJOR / FORCE_UPDATE_BREAKING /
                                                    -- ORG_DELETE
  target_org_id        UUID REFERENCES public.organizations(id),
  target_user_email    TEXT,
  payload              JSONB NOT NULL DEFAULT '{}', -- action-specific data
  proposer_reason      TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending / approved / rejected / expired
  approver_email       TEXT REFERENCES public.operator_users(email),
  approver_reason      TEXT,
  decided_at           TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_ops_status ON public.pending_operator_actions(status, created_at DESC);

-- ── Seed founding operators ────────────────────────────────────────────────
-- The three Starr admins from lib/auth.ts:63-67. Bootstrap so M-9 can flip
-- the auth path. mfa_secret is null — they enroll on first login.
-- password_hash is null too — they'll set on first sign-in (currently they
-- use Google SSO which doesn't go through this table).
-- Idempotent via ON CONFLICT.

INSERT INTO public.operator_users (email, name, role, status, metadata) VALUES
  ('hankmaddux@starr-surveying.com',  'Hank Maddux',  'platform_admin', 'active',
   jsonb_build_object('founding_operator', true, 'seeded_from', 'lib/auth.ts ADMIN_EMAILS')),
  ('jacobmaddux@starr-surveying.com', 'Jacob Maddux', 'platform_admin', 'active',
   jsonb_build_object('founding_operator', true, 'seeded_from', 'lib/auth.ts ADMIN_EMAILS')),
  ('info@starr-surveying.com',        'Starr Info Inbox', 'platform_admin', 'active',
   jsonb_build_object('founding_operator', true, 'seeded_from', 'lib/auth.ts ADMIN_EMAILS',
                      'shared_account', true))
ON CONFLICT (email) DO NOTHING;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT email, role, status FROM public.operator_users ORDER BY email;
--   -- expected: 3 rows (Hank, Jacob, info@), all platform_admin
--
--   SELECT count(*) FROM public.audit_log;            -- 0 (empty until M-9)
--   SELECT count(*) FROM public.impersonation_sessions; -- 0
--   SELECT count(*) FROM public.pending_operator_actions; -- 0
