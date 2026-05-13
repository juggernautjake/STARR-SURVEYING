-- ============================================================================
-- 266_saas_billing_schema.sql
--
-- SaaS pivot — Phase B foundation: subscription / billing schema. Adds
-- the tables the firm-level billing pipeline needs beyond the existing
-- research-subscription wiring.
--
-- Existing tables stay (research_subscriptions, document_wallet_balance,
-- document_purchase_history, research_usage_events) — they preserve
-- legacy data and the existing webhook handler continues to write to them
-- for any non-migrated customer. Phase B migrations decide which records
-- move to the new tables.
--
-- Spec: docs/planning/in-progress/SUBSCRIPTION_BILLING_SYSTEM.md §3.2.
-- ============================================================================

BEGIN;

-- ── Invoices mirror (Stripe is source of truth) ─────────────────────────────
-- Cached for fast UI. Daily reconciliation cron catches drift.
CREATE TABLE IF NOT EXISTS public.invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_invoice_id     TEXT UNIQUE NOT NULL,
  number                TEXT,                       -- Stripe-generated invoice number (INV-0001)
  status                TEXT NOT NULL,              -- draft / open / paid / void / uncollectible
  amount_due_cents      INT NOT NULL,
  amount_paid_cents     INT NOT NULL DEFAULT 0,
  amount_refunded_cents INT NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'usd',
  period_start          TIMESTAMPTZ,
  period_end            TIMESTAMPTZ,
  hosted_invoice_url    TEXT,                       -- Stripe-hosted invoice page (customers click here)
  invoice_pdf_url       TEXT,                       -- downloadable PDF
  payment_intent_id     TEXT,
  attempted_count       INT DEFAULT 0,              -- for dunning queue
  next_payment_attempt  TIMESTAMPTZ,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE  public.invoices IS 'Cached Stripe invoice mirror. Reconciled daily; never authoritative.';

CREATE INDEX IF NOT EXISTS idx_invoices_org      ON public.invoices(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON public.invoices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_failing  ON public.invoices(org_id) WHERE status = 'open' AND attempted_count > 0;

-- ── Subscription change events (audit + analytics) ──────────────────────────
-- One row per state transition on subscriptions. Surfaces in customer
-- billing portal + operator MRR / cohort analysis.
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
                -- created / upgraded / downgraded / bundle_added / bundle_removed /
                -- seat_count_changed / canceled / reactivated / payment_failed /
                -- payment_succeeded / refunded / coupon_applied / trial_extended
  from_state    JSONB,                              -- previous { bundles, seats, price_cents }
  to_state      JSONB,                              -- new { bundles, seats, price_cents }
  triggered_by  TEXT,                               -- customer / operator:<email> / stripe_webhook / system
  amount_cents  INT,                                -- relevant for payments / refunds
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.subscription_events IS 'Lifecycle audit log for subscriptions. Drives MRR / cohort / churn analytics.';

CREATE INDEX IF NOT EXISTS idx_sub_events_org    ON public.subscription_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_events_type   ON public.subscription_events(event_type, created_at DESC);

-- ── Usage events (per-bundle, generalized from research_usage_events) ──────
-- Tracks usage that may drive future metered-billing OR usage-based add-ons.
-- v1 ships flat-rate pricing; this table just feeds the usage display in
-- /admin/billing/usage. Phase 6 wires Stripe Metered Billing on top.
CREATE TABLE IF NOT EXISTS public.usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_email  TEXT,                                 -- nullable for system-emitted events
  bundle      TEXT NOT NULL,                        -- recon / draft / office / field / academy
  event_type  TEXT NOT NULL,                        -- bundle-specific event taxonomy
  quantity    INT NOT NULL DEFAULT 1,
  cost_cents  INT,                                  -- Starr-side cost (AI tokens, API calls); nullable
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);
COMMENT ON COLUMN public.usage_events.event_type IS
  'Bundle-specific. Recon: research_report, document_purchase, ai_query, adapter_run. ' ||
  'Draft: cad_export, ai_drawing_run, render_minute. ' ||
  'Office: invoice_created, employee_added, payroll_run. ' ||
  'Field: mobile_sync, photo_uploaded, point_collected. ' ||
  'Academy: quiz_attempted, module_completed.';

CREATE INDEX IF NOT EXISTS idx_usage_org_bundle    ON public.usage_events(org_id, bundle, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_org_type      ON public.usage_events(org_id, event_type, created_at DESC);

-- ── Webhook deduplication ───────────────────────────────────────────────────
-- Stripe occasionally fires the same event twice. This table provides
-- transaction-safe idempotency.
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type      TEXT,
  processed_at    TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.processed_webhook_events IS 'Idempotency guard for Stripe webhook handler. Same event_id = no-op on second arrival.';

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON public.processed_webhook_events(event_type, processed_at DESC);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT count(*) FROM public.invoices;                      -- 0
--   SELECT count(*) FROM public.subscription_events;           -- 0
--   SELECT count(*) FROM public.usage_events;                  -- 0
--   SELECT count(*) FROM public.processed_webhook_events;      -- 0
