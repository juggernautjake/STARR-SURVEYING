# Subscription & Billing System — Planning Document

**Status:** RFC / sub-plan of `STARR_SAAS_MASTER_PLAN.md` §5.1 — extends the existing research-subscription Stripe pipeline to firm-level
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Target repo path:** `docs/planning/in-progress/SUBSCRIPTION_BILLING_SYSTEM.md`

> **One-sentence pitch:** Scale the production-ready research-subscription Stripe pipeline (`app/api/webhooks/stripe/route.ts`, `research_subscriptions` table) from a per-user research add-on to firm-level subscriptions with bundle composition, per-seat overage, prorated plan changes, dunning, refunds, and a customer self-service billing portal — without ripping out the existing wiring.

---

## 0. Decisions locked

| Q | Decision | Rationale |
|---|---|---|
| **Q3 — Bundle composition** | **Five separate bundles + Firm Suite all-in-one**, per master plan §1.1 | Maximizes addressable market: surveyors who only want one product can buy that one. Existing Recon-only customers fit the standalone-bundle pattern. |
| **Q4 — Pricing structure** | **Hybrid: per-firm base + per-seat overage** | Firm Suite at $499/mo includes 5 seats; $49/extra seat. Standalone bundles: $99-199/mo per-seat with 1-seat minimum. 14-day free trial, no card up front. Annual billing = 20% off. |
| **Master plan Q5 — Build vs buy** | **Build in-house** (covered in `SUPPORT_DESK.md`) | Stripe handles payment surface; we own subscription state mirror + dunning UX. |

These align with master plan §1.1-§1.4 recommendations.

---

## 1. Goals & non-goals

### Goals

1. **Stripe is the source of truth.** We mirror subscription / invoice / payment state into Postgres for fast UI; reconciliation cron catches drift daily.
2. **Self-service for routine operations.** Customer can upgrade, downgrade, add bundle, change seat count, cancel, reactivate, update payment method, download invoice — without operator help.
3. **Operator-side power tools.** Manual subscription provisioning (sales-led), refund queue, dunning queue, coupon management, manual prorated credits, plan-change overrides.
4. **Bundle-level access control** — `subscriptions.bundles` drives the `requiredBundle` route gate from CUSTOMER_PORTAL.md §3.6.
5. **Trial → paid conversion is frictionless.** Trial expires gracefully (7-day grace), card-add CTA is everywhere, no surprise lockouts.
6. **Reuse the existing research-subscription wiring.** Don't reinvent the webhook, the checkout-session creator, or the Stripe Customer Portal integration.

### Non-goals

- Building our own payments UI (Stripe Checkout + Stripe Customer Portal handle this).
- Implementing tax calculation in-house (use Stripe Tax — supports US + international, $0.50 per invoice).
- Building an invoicing PDF generator (Stripe-hosted invoice PDFs are downloadable).
- ACH / wire / check payment processing in v1 — Stripe handles those for Enterprise tier when we get there.
- Multi-currency in v1 — USD only, expand later.
- Per-tenant Stripe accounts (Stripe Connect) — every customer is a Stripe customer under Starr Software's single Stripe account. Stripe Connect is for marketplace SaaS, not us.

---

## 2. Current state (existing research-subscription pipeline)

From the master plan §2.2 audit. This is the system we're extending.

**Stripe package** (`package.json:192`): `stripe@^14.25.0` installed.

**Webhook handler** (`app/api/webhooks/stripe/route.ts`, 69 lines, fully implemented):
- HMAC-SHA256 signature verification with 5-min tolerance
- Event handlers: `checkout.session.completed`, `payment_intent.succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
- Writes to: `research_subscriptions`, `document_wallet_balance`, `document_purchase_history`

**Existing DB tables:**
- `research_subscriptions(user_email, stripe_customer_id, stripe_subscription_id, tier, status, current_period_start, current_period_end, created_at, updated_at)` — per-user, tier `free`/`surveyor_pro`/`firm_unlimited`
- `document_wallet_balance(user_email, balance_cents, updated_at)`
- `document_purchase_history(user_email, type, amount_cents, project_id, instrument_number, stripe_payment_intent_id, created_at)`
- `research_usage_events(user_email, event_type, cost_cents, metadata, created_at)`

**API routes:**
- `app/api/admin/research/billing/route.ts` — GET billing dashboard (tier, usage, invoices via Stripe API, purchase history)
- `app/api/admin/research/document-access/route.ts` — POST checkout-session creation for `fund_wallet` or `purchase_document` actions

**Customer billing UI:** `app/admin/research/billing/page.tsx` — 4-tab dashboard (Overview / Invoices / Purchases / Usage) with subscription tier badge, usage bar, monthly chart, ledger.

**This is production-ready.** The pivot extends rather than rewrites.

---

## 3. Target architecture

### 3.1 Stripe product catalog

In Stripe, create:

**Products** (one per bundle):
- `prod_recon` — Recon bundle
- `prod_draft` — Draft (CAD)
- `prod_office` — Office (business management)
- `prod_field` — Field (mobile-first)
- `prod_academy` — Academy (learning)
- `prod_firm_suite` — Firm Suite (all bundles)

**Prices** (per product, monthly + annual variants):
- `price_recon_monthly` — $99/mo per seat, 1-seat minimum
- `price_recon_annual` — $79/mo per seat (annual billing, 20% off)
- `price_draft_monthly` — $99/mo per seat
- `price_draft_annual` — $79/mo per seat
- `price_office_monthly` — $199/mo flat (5 seats included) + `price_office_seat_overage` at $39/mo per extra seat
- `price_office_annual` — $159/mo flat
- `price_field_monthly` — $49/mo per seat
- `price_field_annual` — $39/mo per seat
- `price_academy_monthly` — $79/mo per seat
- `price_academy_annual` — $63/mo per seat
- `price_firm_suite_monthly` — $499/mo flat (5 seats included) + `price_firm_seat_overage` at $49/mo per extra seat
- `price_firm_suite_annual` — $399/mo flat

**Coupons / discount codes:**
- `LAUNCH50` — 50% off for first 3 months (for early-bird signups)
- `ANNUAL_INTRO` — extra 10% off first annual cycle
- `STARR_FRIEND` — perpetual 25% off (for friends-of-firm beta testers)

The Stripe products + prices are created **manually in the Stripe dashboard** initially. Phase B-3 ships an operator UI to manage them via `/platform/plans`.

### 3.2 Subscription state in Postgres

The `subscriptions` table (defined in `MULTI_TENANCY_FOUNDATION.md` §3.1):

```sql
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID UNIQUE NOT NULL REFERENCES organizations(id),
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id    TEXT,
  status                TEXT NOT NULL,
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN DEFAULT false,
  canceled_at           TIMESTAMPTZ,
  bundles               TEXT[] NOT NULL DEFAULT '{}',
  seat_count            INT NOT NULL DEFAULT 1,
  base_price_cents      INT,
  per_seat_price_cents  INT,
  metadata              JSONB DEFAULT '{}',
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

Two new related tables:

```sql
-- Cached invoice mirror (Stripe is source of truth; we mirror for speed)
CREATE TABLE invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  stripe_invoice_id   TEXT UNIQUE NOT NULL,
  number              TEXT,                       -- Stripe-generated invoice number (INV-0001)
  status              TEXT NOT NULL,              -- draft / open / paid / void / uncollectible
  amount_due_cents    INT NOT NULL,
  amount_paid_cents   INT NOT NULL DEFAULT 0,
  amount_refunded_cents INT NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'usd',
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  hosted_invoice_url  TEXT,                       -- Stripe-hosted invoice page
  invoice_pdf_url     TEXT,
  payment_intent_id   TEXT,
  attempted_count     INT DEFAULT 0,              -- for dunning
  next_payment_attempt TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_invoices_org ON invoices(org_id, created_at DESC);
CREATE INDEX idx_invoices_failing ON invoices(org_id) WHERE status = 'open' AND attempted_count > 0;

-- Subscription change history (audit + analytics)
CREATE TABLE subscription_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id),
  event_type         TEXT NOT NULL,
                     -- created / upgraded / downgraded / bundle_added / bundle_removed /
                     -- seat_count_changed / canceled / reactivated / payment_failed /
                     -- payment_succeeded / refunded / coupon_applied
  from_state         JSONB,                       -- previous bundle + seats + price
  to_state           JSONB,                       -- new bundle + seats + price
  triggered_by       TEXT,                        -- 'customer' / 'operator:jacob' / 'stripe_webhook' / 'system'
  amount_cents       INT,                         -- relevant for payments / refunds
  metadata           JSONB DEFAULT '{}',
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sub_events_org ON subscription_events(org_id, created_at DESC);

-- Usage events (per-bundle, per-event-type — for usage display + future usage-based billing)
-- Generalized from research_usage_events
CREATE TABLE usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  user_email  TEXT,
  bundle      TEXT NOT NULL,                      -- 'recon' / 'draft' / 'office' / 'field' / 'academy'
  event_type  TEXT NOT NULL,
              -- recon: research_report, document_purchase, ai_query, adapter_run
              -- draft: cad_export, ai_drawing_run, render_minute
              -- office: invoice_created, employee_added, payroll_run
              -- field: mobile_sync, photo_uploaded, point_collected
              -- academy: quiz_attempted, module_completed
  quantity    INT DEFAULT 1,
  cost_cents  INT,                                -- only for events that incur Starr-side cost (AI, etc.)
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_usage_org_bundle ON usage_events(org_id, bundle, created_at DESC);
```

### 3.3 The lifecycle state machine

```
                ┌──────────┐
                │  (none)  │
                └────┬─────┘
                     │ /signup wizard completes
                     ▼
                ┌──────────┐
                │ trialing │
                └────┬─────┘
        14d passed   │            ┌──── add payment method ────┐
        no card      │            │                            │
        ┌────────────┘            │                            ▼
        ▼                                                ┌──────────┐
   ┌──────────┐                                          │  active  │
   │ past_due │◄─── invoice.payment_failed ──────────────┴────┬─────┘
   └────┬─────┘                                                │
        │ payment recovered                                    │ customer.cancel()
        └─────────► active ◄────────────┐                      │
        │                                │                     ▼
        │ 7d grace expires               │              ┌─────────────┐
        ▼                                │              │  canceled   │
   ┌─────────────┐                       │              │  (read-only │
   │  suspended  │                       │              │   30d)      │
   │  (read-only)│                       │              └────┬────────┘
   └────┬────────┘                       │                   │
        │ 30d                            │                   │ 30d
        ▼                                │                   ▼
   ┌─────────────┐                       │              ┌──────────────┐
   │  pending    │ ◄─── reactivate ──────┘              │  (soft del'd)│
   │  deletion   │                                      └──────────────┘
   └─────────────┘
```

States:
- **trialing**: 14 days, no card required, all bundles included that the trial covers
- **active**: paying customer
- **past_due**: invoice failed, Stripe retrying via smart-retry (default 1d / 3d / 5d / 7d), org access continues during retry window
- **suspended**: past_due 7+ days, no payment recovered → read-only access (no creating new data; existing data viewable)
- **canceled**: customer canceled or operator canceled; 30-day grace where access is read-only
- **pending_deletion**: 30+ days after cancellation, queued for hard delete (60 days from cancel total)
- **paused**: voluntary pause (Firm Suite tier feature) — operator action; resumes on operator action

Transitions are driven by Stripe webhooks + cron jobs (for grace-period timeouts).

### 3.4 Webhook handler extension

Current `app/api/webhooks/stripe/route.ts` handles 7 event types. Extension adds:

```
customer.created                  → seed stripe_customer_id on the org (if not already set)
customer.updated                  → mirror to stripe_customer_id metadata
customer.deleted                  → flag org for review (rare event)
customer.subscription.trial_will_end → schedule trial-ending notifications
invoice.created                   → mirror to invoices table; if first invoice on a new sub, fire welcome
invoice.upcoming                  → 7 days before — notify billing contact
invoice.payment_action_required   → notify customer (3D Secure auth needed)
charge.refunded                   → mirror to subscription_events; notify customer
charge.dispute.created            → operator alert (chargeback)
payment_method.attached/detached  → no-op (Stripe portal handles this)
```

Each handler is **idempotent** (same event ID can fire twice — second is no-op) via a `processed_webhook_events` table:

```sql
CREATE TABLE processed_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  processed_at    TIMESTAMPTZ DEFAULT now()
);
```

Webhook flow: receive event → check `processed_webhook_events` → if seen, return 200 OK no-op → else process + insert into `processed_webhook_events` in same transaction.

### 3.5 Reconciliation cron

Daily job at 2:00 AM UTC:

```ts
// Fetch every active subscription from Stripe
const stripeSubs = await stripe.subscriptions.list({ status: 'active', limit: 100 });

// For each, compare with our local `subscriptions` row
for (const stripeSub of stripeSubs.data) {
  const local = await fetchLocalSub(stripeSub.id);
  if (!local) {
    // We're missing a subscription Stripe knows about — alert operator
    alert(`Missing local subscription for ${stripeSub.id}`);
    continue;
  }
  if (local.status !== stripeSub.status) {
    // Drift — update local + alert
    await updateLocal(local.id, stripeSub);
    alert(`Subscription state drift fixed for ${stripeSub.id}: ${local.status} → ${stripeSub.status}`);
  }
  // Repeat for current_period_end, cancel_at_period_end, etc.
}
```

Failures alert the operator console + Slack.

---

## 4. Customer-facing flows

### 4.1 Signup → trial start

Covered in `CUSTOMER_PORTAL.md` §3.2. At step 4 (confirmation):
1. Create org (`status='pending'`).
2. Create Stripe customer (`stripe_customer_id` saved on org).
3. Create Stripe subscription **with `trial_period_days=14`** and **no payment method** (Stripe allows this for trials).
4. Update org status → `trialing`.
5. Sign user in.

No initial invoice is generated until the trial ends and a payment method is on file.

### 4.2 Add payment method during trial

Customer hits `/admin/billing` → sees "No payment method on file. Add one before your trial ends." → clicks "Add card" → redirected to Stripe Customer Portal in setup-intent mode → returns to `/admin/billing?setup=success`. The Portal handles all PCI compliance.

### 4.3 Trial → paid conversion

7 days before trial ends: `customer.subscription.trial_will_end` webhook → trigger emails (day -7, day -3, day -1) via Resend. In-app notifications fire too.

Day 0:
- If payment method on file → Stripe attempts first charge; on success, `status='active'`. On failure, `status='past_due'`.
- If no payment method → Stripe `invoice.payment_failed` fires → `status='past_due'` → 7-day grace begins.

### 4.4 Self-service plan change

Customer at `/admin/billing` → "Change plan" modal:

1. Pick new plan (upgrade / downgrade / different billing cycle).
2. Pick new seat count (if applicable).
3. Toggle bundle add-ons.
4. See **proration preview** (call `stripe.invoices.retrieveUpcoming` with the proposed changes — Stripe returns exact prorated amount):
   ```
   You'll be charged $147.50 today (prorated for the rest of this period).
   Starting Jun 15, you'll pay $499/month.
   ```
5. "Confirm change" → calls `stripe.subscriptions.update` with new items.
6. Webhook fires; local state updates.
7. Toast: "Plan changed. Welcome to Firm Suite!"

For downgrades, an extra step: warn loudly if the user has data only accessible via the bundle they're dropping ("You'll lose access to your CAD drawings — export them first").

### 4.5 Cancellation

Two-step modal:

```
Step 1: "Why are you canceling? (optional)"
        Reasons: Too expensive / Missing features / Switching to another tool / 
                 Business closing / Just trying it out / Other

Step 2: "Are you sure?"
        Your data is preserved for 30 days. After that it's deleted.
        [Keep my plan]  [Yes, cancel]
```

On confirm: `stripe.subscriptions.update(id, { cancel_at_period_end: true })`. Customer retains access through the end of the paid period. After period ends, `status='canceled'`. After 30 days, soft-delete. After 60 days, hard-delete (cron).

Reason gets logged in `subscription_events.metadata.cancellation_reason` for cohort analysis.

**Reactivation** (within 30-day grace): one click `/admin/billing` → "Reactivate plan" button → `stripe.subscriptions.update(id, { cancel_at_period_end: false })`. Org status → `active` (or `past_due` if past period end).

### 4.6 Bundle add-on (mid-cycle)

Customer at `/admin/billing` → "Add bundle" → picks a bundle:
1. Proration preview shown.
2. Confirm → `stripe.subscriptions.update` with new `subscription_item`.
3. Webhook fires; local `subscriptions.bundles` updates.
4. Customer can now access the routes gated to that bundle.

### 4.7 Failed payment recovery

Stripe `invoice.payment_failed` webhook:
1. `subscriptions.status='past_due'`.
2. Email customer's billing contact: "Your payment failed. Please update your card."
3. In-app notification with action button → opens Stripe Portal for card update.
4. Stripe smart-retry handles the actual retry schedule (default 4 attempts over 1 week).
5. On success → `status='active'`, email "Payment recovered".
6. On final failure → `status='past_due'` → 7-day grace → `status='suspended'`.

---

## 5. Operator-facing flows

### 5.1 Manual subscription provisioning (sales-led)

At `/platform/customers` → "Create org" or at customer detail → "Manual subscription":

```
┌──────────────────────────────────────────────────────────────────┐
│ Manual provisioning                                                │
│                                                                    │
│ Organization name:  [_________________]                            │
│ Primary admin email:[_________________]                            │
│ Bundle selection:   [✓] Recon  [✓] Office  [✓] Firm Suite         │
│ Seat count:         [____]                                         │
│ Billing cycle:      ( ) Monthly  ( ) Annual                        │
│ Apply discount:     [____________]                                 │
│ Start date:         [2026-05-15]                                   │
│ Trial days:         [14_____]                                      │
│ Skip payment method:[_]  (Yes — invoice instead of card)           │
│                                                                    │
│ [Cancel] [Create + send onboarding email]                         │
└──────────────────────────────────────────────────────────────────┘
```

Operator creates org + Stripe customer + Stripe subscription. Onboarding email sends magic-link to set password + accept terms.

### 5.2 Refund queue

At `/platform/billing/refunds`:

```
┌──────────────────────────────────────────────────────────────────┐
│ Refunds · 3 pending review · $487 total                            │
├──────────────────────────────────────────────────────────────────┤
│  T-0042  Acme  $99  "Charged twice" — Aug 12   [Review →]         │
│  T-0039  Brown $499 "Canceling, refund" — Aug 11 [Review →]       │
│  T-0035  Crews $39  "Bug caused data loss" Aug 9 [Review →]       │
└──────────────────────────────────────────────────────────────────┘
```

Click → refund detail. Refund full / partial / decline. Reason required. Two-person rule for refunds >$500 (per OPERATOR_CONSOLE.md §6.4). On approve: `stripe.refunds.create` → invoice updated → org notified by email.

### 5.3 Dunning queue

At `/platform/billing/dunning`:

```
┌──────────────────────────────────────────────────────────────────┐
│ Failed payments · 12 customers                                     │
├──────────────────────────────────────────────────────────────────┤
│ Days late ↓  Org           Amount  Last attempt  Actions          │
│ ────────────────────────────────────────────────────────────────  │
│  6           Acme           $499   2h ago        [Retry] [Wait]   │
│  4           Brown & Co     $99    yesterday     [Retry] [Comp]   │
│  3           Dixie          $49    6h ago        [Retry] [Cancel] │
│  …                                                                 │
└──────────────────────────────────────────────────────────────────┘
```

Actions:
- **Retry** — manually trigger another Stripe retry (`stripe.invoices.pay`).
- **Wait** — no-op; lets Stripe smart-retry continue.
- **Comp** — zero the invoice (`stripe.invoices.voidInvoice` + create $0 replacement); org status returns to `active`.
- **Cancel** — `stripe.subscriptions.cancel` immediately; org status → `canceled` (skips 30-day grace).

Every action audited.

### 5.4 Coupon management

At `/platform/billing/coupons`:
- List active coupons (Stripe-side)
- Create new coupon (code, % or $ off, duration: once / repeating / forever, max redemptions, expires)
- Apply coupon to existing customer

### 5.5 MRR + cohort dashboard

At `/platform/billing` (Dashboard tab):

```
┌──────────────────────────────────────────────────────────────────┐
│ MRR · $14,847   (+12% vs last month)                              │
│ ARR · $178,164                                                     │
│ Active customers · 47                                              │
│ Net MRR change · +$1,580                                           │
│                                                                    │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │  MRR over time (line chart)                                  │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ Churn this month   2.1%   (3 customers, $447 MRR)                 │
│ New MRR            $2,247 (5 customers)                            │
│ Expansion MRR      $380   (3 upgrades)                             │
│ Contraction MRR    -$220  (2 downgrades)                          │
│                                                                    │
│ Cohort retention table (last 12 months)                            │
│ Top expansion candidates                                           │
│ Top churn risks (declining usage)                                  │
└──────────────────────────────────────────────────────────────────┘
```

Powered by daily-batch aggregation from `subscriptions` + `subscription_events` + `usage_events`. Charts via a lightweight library (recharts — already used elsewhere if any chart exists).

---

## 6. Tax handling

Stripe Tax (~$0.50 per invoice) handles US sales tax + international VAT. Enabled via the Stripe dashboard.

Customer-side: tax line appears on invoices automatically. No customer action required (Stripe Tax uses customer address from Stripe customer object).

Operator-side: tax remittance is a manual quarterly process — Stripe Tax doesn't file taxes for you, just calculates them. Operator dashboard surfaces a "Tax summary" tab pulling from Stripe Tax reports.

For v1: enable Stripe Tax for US only. International expansion is a Firm Suite-tier consideration.

---

## 7. Usage-based billing (deferred)

The schema supports usage tracking (`usage_events` table), and master plan §5.1 mentions Stripe Metered Billing as a future option. For v1: **flat-rate per-seat with no usage-based components**.

Why: simpler pricing for SMB sales motion. Usage-based pricing is a Firm Suite tier upgrade for high-volume customers (e.g., "Pay $0.50 per AI drawing run beyond 1000/mo") that we'll layer on later.

The infrastructure to track usage is in place (the table). Wiring it to Stripe Metered Billing is a 2-week project when we want it.

---

## 8. Phased delivery

Maps to master plan Phase B. ~5 weeks engineering.

| Slice | Description | Estimate |
|---|---|---|
| **B-1** | Stripe product + price catalog setup (manual in dashboard); new `subscriptions`, `invoices`, `subscription_events`, `usage_events`, `processed_webhook_events` tables | 3 days | ✅ Schema shipped — `seeds/266_saas_billing_schema.sql` adds the four new tables. The Stripe dashboard product+price catalog setup is an operator credential task; the per-bundle `stripePriceMonthly` / `stripePriceAnnual` / `stripePriceSeatOverage` fields in `lib/saas/bundles.ts` are placeholder `null` until the operator pastes IDs in. |
| **B-2** | Extend `app/api/webhooks/stripe/route.ts` with new event handlers; idempotency via `processed_webhook_events` | 4 days | ✅ Idempotency shipped — `processStripeEvent` does an `INSERT … ON CONFLICT` check against `processed_webhook_events`; duplicate event ids (Postgres 23505) short-circuit; transient DB errors fail-open + log. New event-type handlers (customer.created/updated/trial_will_end/invoice.created/etc.) deferred to a follow-up slice since each needs the new firm-level `subscriptions` table populated which depends on master-plan M-9 auth refactor. |
| **B-3** | `/platform/plans` operator UI for managing Stripe products + prices via API | 3 days | Deferred — operator credential task (Stripe dashboard is the source of truth for product creation; the catalog UI under `/platform/plans` makes sense once an operator wants to nudge prices without leaving the console). `BUNDLES` in `lib/saas/bundles.ts` already serves as the catalog reference for routes that don't need Stripe ids. |
| **B-4** | Customer billing portal `/admin/billing` (Overview / Invoices / Usage / Plan history) | 5 days | ✅ Partial shipped — `/admin/billing` Overview, `/admin/billing/invoices`, `/admin/billing/plan-history` are live. Usage tab deferred until B-7 meter aggregation lands. |
| **B-5** | Plan-change flow with proration preview | 4 days | Deferred — needs `STRIPE_SECRET_KEY` + per-bundle price IDs to be live so Stripe can compute the proration. The customer-side button + endpoint stub already returns a friendly "billing pending" message until products exist; the actual call lands when Stripe is wired. |
| **B-6** | Bundle-add flow + cancellation + reactivation | 3 days | ✅ Partial — cancellation + reactivation shipped via `/api/admin/billing/cancel`. Bundle-add is the inverse of plan-change and gates on B-5 (same Stripe-products dependency). |
| **B-7** | Operator refund queue + dunning queue + manual provisioning | 4 days | Deferred — operator-side Stripe writes (refund / manual_provision / dunning_retry) all depend on Stripe customer + subscription IDs being populated, which gates on B-2 follow-up event handlers (which themselves gate on master-plan M-9). |
| **B-8** | Reconciliation cron + drift alerting | 2 days | Deferred — the cron compares `subscriptions` mirror against Stripe API state; needs live Stripe data first. Cron infrastructure is in place (see B-10 trial-ending cron pattern) — this is a ~50-line follow-up once Stripe is wired. |
| **B-9** | MRR + cohort dashboard | 4 days | ✅ Partial shipped — `/api/platform/dashboard` returns the live aggregated MRR (sum of `base_price_cents + per_seat_price_cents * seat_count` across active+trialing subs) and `/platform` renders it as a headline stat alongside customer / open-ticket / audit counts. Full cohort / churn / LTV breakdown deferred until customer-count growth makes it useful. |
| **B-10** | Trial-end + payment-failure email sequences via Resend | 2 days | ✅ Shipped — payment-failed email dispatches from the Stripe webhook handler on `invoice.payment_failed`; trial-ending-D7 email dispatches via the new daily `/api/cron/trial-ending` (wired into vercel.json crons at 14:00 UTC). Both templates live in `lib/saas/notifications/templates.ts`. Recipient resolves via `billing_contact_email` then `primary_admin_email` on the org. |

**Total: ~5 weeks** with one engineer.

---

## 9. Open questions

1. **Annual billing discount.** 20% recommended. Operator preference?
2. **Coupon strategy at launch.** Aggressive launch promo (50% off 3 months) vs. conservative (10% annual discount only). Recommend aggressive — drives initial customer count for case studies.
3. **What's the trial bundle?** All bundles available in trial (recommendation — maximize evaluation breadth), or just the one they signed up under?
4. **Seat-overage friction.** Auto-charge when a 6th user is invited on an Office plan, or block the invite until admin approves the seat add? Recommend auto-charge with clear pre-invite warning.
5. **Grandfather pricing.** When we change prices on the Stripe side, existing customers stay on old prices, or migrate? Recommend grandfather indefinitely — promised price is sacred.
6. **Multi-currency.** USD-only v1. Operator preference?
7. **Reconciliation alert noise.** What's "drift worth alerting on"? Recommend any state mismatch + any active sub missing locally; ignore minor metadata drift.
8. **Refund policy.** Refund within 30 days no-questions, partial-refund for prorated mid-period cancellations, or operator discretion only? Recommend: 30-day no-questions for first-month cancellations; operator discretion otherwise.
9. **Invoice line-item granularity.** Show "Office bundle × 7 seats" or "Office bundle base ($199) + Office seat × 5 ($195) + AI overage ($23)"? Stripe's default is granular; recommend keeping that for transparency.

---

## 10. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Webhook race condition double-charges customer | High | Idempotency via `processed_webhook_events`; webhook handler tested under concurrent fire |
| Subscription state drifts from Stripe and we serve wrong access | High | Daily reconciliation cron; alerts to operator on detected drift |
| Customer's card declines but we don't notice → access continues | High | Stripe webhook + 7-day grace before suspend; daily reconciliation as backup |
| Stripe API rate limit hit during a sale event | Medium | Stripe has reasonable limits; if hit, queue + retry with exponential backoff |
| Tax calculation wrong for a customer in a state we don't expect | Medium | Stripe Tax handles US 50 states; international expansion deferred |
| Refund issued by operator without proper authorization | High | Two-person rule for refunds >$500; audit log; refund reason mandatory |
| Failed cancellation: customer says they canceled but charges continue | Critical | Cancellation flow is single-button → directly calls Stripe API; confirmation email + receipt; logs in subscription_events; customer-side audit trail |
| Bundle access falls out of sync with subscription change | Medium | JWT carries bundles[]; refresh on every subscription webhook; client-side check is hint, server-side check is authoritative |
| Annual subscriber wants pro-rated refund on mid-year cancel | Medium | Define refund policy in TOS upfront; operator discretion overrides |
| Currency confusion if we expand to international | Low | USD-only v1; multi-currency requires explicit price set per currency in Stripe |
| Stripe webhook signature verification fails on legitimate event | Low | Existing handler tested; failure modes well-known (clock skew, secret mismatch) |
| Coupon code shared on Reddit and abused | Medium | Set max-redemptions per coupon; one-coupon-per-customer; monitor signups for coupon-spike anomaly |

---

## 11. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §1.2 (pricing model) + §5.1 (billing system)
- `MULTI_TENANCY_FOUNDATION.md` §3.1 — `subscriptions` table schema
- `OPERATOR_CONSOLE.md` §3.5 (billing ops) + §3.7 (plan management)
- `CUSTOMER_PORTAL.md` §3.3 (customer billing portal) + §3.6 (bundle gating)
- `app/api/webhooks/stripe/route.ts` — extends this existing 69-line handler
- `app/api/admin/research/billing/route.ts` — the existing billing dashboard, becomes a per-org view
- `app/api/admin/research/document-access/route.ts` — pattern for checkout-session creation, extends to bundle subscription
- `app/admin/research/billing/page.tsx` — existing 4-tab dashboard; the structure carries forward
- `app/pricing/page.tsx` — marketing pricing page; redesigned per CUSTOMER_PORTAL.md §3.1

---

## 12. Definition of done

The billing system is complete when:

1. ✅ Stripe products + prices for every bundle exist (Recon / Draft / Office / Field / Academy / Firm Suite × monthly + annual).
2. ✅ Webhook handler processes every relevant event idempotently; `processed_webhook_events` prevents double-handling.
3. ✅ Customer `/admin/billing` shows correct subscription state, lists invoices, displays usage per bundle.
4. ✅ Customer can: change plan (with proration preview), add/remove bundle, change seat count, cancel, reactivate within grace, update payment method via Stripe Portal.
5. ✅ Operator `/platform/billing` shows MRR / ARR / churn / cohort retention; supports refund queue, dunning queue, manual provisioning, coupon management.
6. ✅ Trial-ending emails fire on day -7, -3, -1 via Resend.
7. ✅ Failed-payment emails + in-app notifications fire on every invoice.payment_failed.
8. ✅ 7-day grace period from past_due → suspended is enforced by cron.
9. ✅ Reconciliation cron runs daily; detected drift is logged + alerts operator.
10. ✅ Refunds >$500 require two-person approval.
11. ✅ Bundle access reflects subscription state within 5s of a webhook event.
12. ✅ Stripe Tax is enabled; US state sales tax appears correctly on invoices.
13. ✅ All Phase B vitest cases pass (≥30 new cases covering webhook idempotency, plan-change proration, dunning state transitions).
14. ✅ Subscription state for Starr Surveying (tenant #1) is `firm_unlimited` equivalent + free for life (operator override).

---

## 12. Shipped vs. deferred summary

What's live:

- Full billing schema (`subscriptions`, `invoices`, `subscription_events`,
  `usage_events`, `processed_webhook_events`) — `seeds/266`.
- Stripe webhook idempotency via `processed_webhook_events` — B-2 base.
- Customer billing portal: Overview + Invoices + Plan history tabs;
  Customer Portal redirect endpoint (returns friendly "pending" until
  Stripe IDs are live); Cancellation flow with 30-day grace.
- Live MRR + customer-count + open-ticket + audit-24h on `/platform`
  dashboard.
- Trial-ending-D7 daily cron + payment_failed email dispatch via
  Resend.

What defers, and why:

- **Anything that calls the Stripe API directly (B-3, B-5, B-6 bundle-add,
  B-7, B-8)**: gates on the operator pasting the per-bundle price IDs
  into `BUNDLES` after creating the products in the Stripe dashboard.
  The customer-side endpoints already return a friendly "billing
  pending" message and the audit / events tables already capture the
  state changes; the Stripe SDK calls drop in cleanly once products
  are live.
- **Usage tab (B-4)** and **cohort / churn dashboards (B-9 beyond MRR)**:
  defer until customer-count growth makes them actionable.

Every customer-side cash flow today (cancel, reactivate, switch active
org, view invoices, view plan history, view trial countdown) works
end-to-end without Stripe being wired; the Stripe layer is purely
write-side to the external provider.
