-- ============================================================================
-- 261_saas_seed_starr_tenant.sql
--
-- SaaS pivot — Phase A slice M-2: seed Starr Surveying as tenant #1.
-- Creates the one canonical organizations row + its subscription grant.
-- Does NOT yet backfill members or org_id on tenant tables — those are
-- M-3 and M-4. Schema is from slice M-1 (seeds/260).
--
-- Idempotent: re-running is a no-op (ON CONFLICT DO NOTHING).
--
-- Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §6.2 (M-2).
-- ============================================================================

BEGIN;

-- Starr Surveying's canonical org row. UUID is hard-coded to a known
-- value so downstream slices can reference it without a runtime SELECT.
-- The constant `00000000-0000-0000-0000-000000000001` is reserved for
-- tenant #1 forever.
INSERT INTO public.organizations (
  id, slug, name, status, state, country, primary_admin_email,
  billing_contact_email, founded_at, metadata
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'starr',
  'Starr Surveying',
  'active',
  'TX',
  'US',
  'jacobmaddux@starr-surveying.com',
  'info@starr-surveying.com',
  '2024-01-01T00:00:00Z',     -- backdate to firm's actual founding
  jsonb_build_object(
    'is_platform_owner', true,
    'note', 'Tenant #1: Starr Surveying. Owns the Starr Software platform; also a customer of itself (master plan §1.5).'
  )
) ON CONFLICT (id) DO NOTHING;

-- Starr's default org_settings row. mfa_required = false for now — the
-- existing surveyors haven't enrolled MFA. Tighten in a later slice.
INSERT INTO public.org_settings (
  org_id, default_invite_role, mfa_required, session_timeout_min,
  feature_flags, notifications_pref
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'surveyor',
  false,
  480,                            -- 8 hours
  jsonb_build_object(),
  jsonb_build_object('trial_warnings', true, 'release_announcements', true)
) ON CONFLICT (org_id) DO NOTHING;

-- Starr's subscription: all bundles, no Stripe linkage (Starr doesn't
-- bill itself). Bundles = every bundle that exists; seat count = high
-- enough to cover the founding team without a per-seat reconciliation
-- before M-9 wires per-user seat tracking.
INSERT INTO public.subscriptions (
  org_id, status, bundles, seat_count, base_price_cents,
  per_seat_price_cents, metadata
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'active',
  ARRAY['recon', 'draft', 'office', 'field', 'academy', 'firm_suite'],
  100,                                -- room to grow
  0,                                  -- platform owner doesn't pay
  0,
  jsonb_build_object(
    'is_platform_grant', true,
    'note', 'Starr Surveying does not bill itself. This row is the bundle-access source of truth for the firm.'
  )
) ON CONFLICT (org_id) DO NOTHING;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT id, slug, name, status FROM public.organizations;
--   -- expected: 1 row, slug='starr', status='active'
--
--   SELECT org_id, status, array_length(bundles, 1) AS bundle_count, seat_count
--     FROM public.subscriptions;
--   -- expected: 1 row, org_id=Starr's, bundle_count=6, seat_count=100
--
--   SELECT org_id, default_invite_role, mfa_required FROM public.org_settings;
--   -- expected: 1 row matching the seed above
