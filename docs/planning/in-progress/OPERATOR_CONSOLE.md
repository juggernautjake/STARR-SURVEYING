# Operator Console — Planning Document

**Status:** RFC / awaiting operator sign-off on master plan §10 decisions · sub-plan of `STARR_SAAS_MASTER_PLAN.md` §4.2
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Target repo path:** `docs/planning/in-progress/OPERATOR_CONSOLE.md`

> **One-sentence pitch:** Build a `/platform/*` console — separate from any tenant's admin shell — that lets Starr Software operate the SaaS: see and manage every customer, handle billing, run support, push releases, broadcast announcements, and access the existing developer surfaces (Testing Lab, pipeline, adapter health) safely above the tenant boundary.

---

## 1. Goals & non-goals

### Goals

1. **Single pane of glass** for the operator team. Everything customer-related is reachable in ≤2 clicks from `/platform`.
2. **Safe impersonation** so a support operator can debug a customer's issue without provisioning a duplicate environment. Every impersonation event is loud, time-boxed, and immutably audited.
3. **Reuse the existing developer console** (`/admin/research/testing`, pipeline, coverage, error log) rather than rebuilding. Relocate it to operator-only namespace.
4. **Cross-tenant aggregation** as first-class — MRR, churn, active-user counts, error volume by tenant — without per-tenant context-switching.
5. **Granular operator permissions** so a billing-only contractor can't read CAD drawings, and a support hire can't issue refunds.
6. **Audit everything an operator does.** Immutable log; visible to all operators with audit access; alerts on high-risk actions (impersonation, refund, plan-change).

### Non-goals

- Replacing the customer-side admin shell. Customers continue to use `/admin/*` per the existing nav redesign; operators have a *separate* shell.
- Building a customer success / CRM tool. (Pipedrive / HubSpot are mature; embed if needed.)
- Replacing Stripe Dashboard. Stripe stays the canonical billing source of truth; the operator console is the *integrated* surface — every Stripe action we expose has a write-back to Stripe's API and re-fetches state.
- Marketing analytics (PostHog / Google Analytics live separately).
- Knowledge-base content authoring UI (that's part of the Support Desk sub-plan).
- Status page (deferred to Phase I in master plan).

---

## 2. Information architecture

All routes under `/platform/*`. Naming proposal — the master plan flagged this as a TBD (master §4.2). Alternative names considered: `/ops/`, `/console/`, `/admin/platform/`. **Recommendation: `/platform/`** — short, distinct from `/admin/` (customer-side), unambiguous.

```
/platform                           Operator dashboard (home)
/platform/customers                 Customer list
/platform/customers/[org-id]        Customer detail
/platform/customers/[org-id]/impersonate    Impersonation entry (POST → time-boxed session)
/platform/billing                   Billing operations
/platform/billing/invoices          Invoice list (cross-tenant)
/platform/billing/dunning           Failed-payment queue
/platform/billing/refunds           Refund queue
/platform/plans                     Plan + bundle management
/platform/plans/[plan-id]           Plan detail
/platform/support                   Support inbox
/platform/support/tickets/[id]      Ticket thread
/platform/releases                  Release management
/platform/releases/[release-id]     Release detail
/platform/broadcasts                Broadcast composer + history
/platform/health                    Cross-tenant health dashboard
/platform/health/errors             Error log (cross-tenant)
/platform/health/adapters          Adapter health (extends Self-Healing spec)
/platform/health/pipelines         Pipeline runs (cross-tenant)
/platform/dev/testing              Testing Lab (relocated from /admin/research/testing)
/platform/dev/coverage             Coverage dashboard (relocated)
/platform/dev/code-browser         Code browser (relocated)
/platform/audit                    Audit log
/platform/team                     Internal operator team management
/platform/settings                 Operator-side settings (Stripe keys env display, feature flags, etc.)
```

### Top-level nav structure

A dedicated operator-side rail (parallel to the customer-side IconRail just shipped). Six top-level groups:

| Icon | Group | Routes covered |
|---|---|---|
| `Home` | Dashboard | `/platform` (operator home — MRR, ticket queue, recent signups, top alerts) |
| `Users` | Customers | `/platform/customers/*` |
| `DollarSign` | Billing | `/platform/billing/*`, `/platform/plans/*` |
| `LifeBuoy` | Support | `/platform/support/*` |
| `Megaphone` | Releases & Broadcasts | `/platform/releases/*`, `/platform/broadcasts/*` |
| `Activity` | Health | `/platform/health/*`, `/platform/dev/*` |
| `ShieldCheck` | Trust | `/platform/audit/*`, `/platform/team/*`, `/platform/settings` |

Cmd+K palette extended to search across customers + tickets + releases (extends the existing `lib/admin/route-registry.ts` ranker with a different scope when on `/platform/*` routes).

---

## 3. Surfaces (the meat)

### 3.1 Operator dashboard — `/platform`

Post-login landing. Six panels stacked, matching the Hub pattern:

1. **Headline metrics** — MRR (this month vs last), active orgs, open tickets, signups this week, churn this month. Numbers with sparklines.
2. **Action queue** — items that need an operator's attention RIGHT NOW: failed payments awaiting decision, tickets without response in >24h, broadcasts scheduled today, high-severity errors in the last hour. Each is a one-click jump to the relevant detail.
3. **Recent signups** — top 5 newest orgs with trial status. Click → customer detail.
4. **Top accounts** — top 5 by MRR; quick at-a-glance health (any open tickets, last-seen-active, payment state).
5. **System health** — adapter availability ribbon, error count trend, pipeline backlog. Click → `/platform/health`.
6. **Today's deliverables** — broadcasts scheduled to fire, releases tagged for today, scheduled maintenance windows.

### 3.2 Customers — `/platform/customers`

```
┌──────────────────────────────────────────────────────────────────┐
│ Customers   [+ Create org]  [Export CSV]  [Search...]    [⌘K]     │
├──────────────────────────────────────────────────────────────────┤
│ Filters: Plan ▾  Status ▾  Signed up ▾  MRR ▾                    │
├──────────────────────────────────────────────────────────────────┤
│  Name             Plan        MRR    Status   Seats  Last seen   │
│ ─────────────────────────────────────────────────────────────────│
│  Acme Surveying   Firm Suite  $499   Active    12    2h ago      │
│  Brown & Co       Recon       $99    Trialing   2    1d ago      │
│  Crews Eng        Office      $199   Past Due   5    4d ago  🚨   │
│  Dixie Surveys    Field       $49    Active     1    just now    │
│  …                                                                │
├──────────────────────────────────────────────────────────────────┤
│ 47 orgs · sorted by MRR ▼                          [Page 1 of 5] │
└──────────────────────────────────────────────────────────────────┘
```

- Table is sortable on every column. Default: MRR desc.
- Status badges: Active (green), Trialing (blue), Past Due (amber), Canceled (gray), Paused (gray), Pending (yellow — sign-up incomplete).
- Click a row → customer detail.
- Bulk-actions toolbar appears on multi-select: export, message, tag, suspend (admin-only).
- "Create org" button → manual provisioning form (for sales-led onboarding).
- "Export CSV" → all orgs matching current filters; goes through audit log.

### 3.3 Customer detail — `/platform/customers/[org-id]`

Tabbed view. Top of page: identity card + key actions.

```
┌──────────────────────────────────────────────────────────────────┐
│  🏢 Acme Surveying                          [⭐ Pin] [Impersonate]│
│  Org ID: org_01H4… · TX · Founded: 2026-04-12                    │
│  Plan: Firm Suite ($499/mo) · MRR: $499 · LTV: $1,497 · 3 mo old │
│  Active · No payment issues · 12 seats / 12 used                 │
├──────────────────────────────────────────────────────────────────┤
│  Overview · Users · Billing · Tickets · Releases · Audit · Data   │
└──────────────────────────────────────────────────────────────────┘
```

**Tabs:**

- **Overview** — Activity timeline (signups, plan changes, upgrades/downgrades, ticket history, broadcast deliveries, impersonation events). Health snippets (last sync, last error, last-seen-active per user).
- **Users** — Roster of every user in this org. Role, last-seen-active, MFA status. Operator can disable a user (rare; only with reason).
- **Billing** — Mirror of Stripe customer page: payment methods (read-only — direct customer to their portal for changes), upcoming invoice, paid invoices, failed payments, subscription items, upcoming renewal. **Operator-write actions:** apply coupon, manual prorated credit, refund (with reason), cancel subscription, change plan, extend trial.
- **Tickets** — Every ticket this org has filed. New ticket button (operator-side ticket — internal note that isn't customer-visible until the operator marks it shared).
- **Releases** — Which release this org's web client is on. Mobile clients individually (per user) with their EAS bundle id. "Force update" toggle (rare, dangerous — audit-loud).
- **Audit** — Every operator action on this org. Filterable by operator + action type + date.
- **Data** — At-a-glance data summary (counts: jobs, projects, drawings, employees, monthly storage usage, monthly API calls). "Export org data" button (GDPR-style — bundles everything into a zip + emails the org admin).

### 3.4 Impersonation flow

The riskiest feature. Specifies precisely how it works:

1. Operator on `/platform/customers/[org-id]` clicks **Impersonate**.
2. Modal opens demanding a **reason** (required, 10+ chars, free text) and a target user (default: the org's primary admin; selectable).
3. Operator submits → server creates an **impersonation session token** with 30-minute TTL, stored in `impersonation_sessions(id, operator_email, target_org_id, target_user_email, reason, started_at, expires_at, ended_at)`.
4. The operator is redirected to `/admin/me` *as the target user*, with the session JWT carrying `impersonating: { operator: …, original_role: 'platform_admin', target: { org_id, user_email }, expires_at }`.
5. **Visible everywhere during the impersonation:**
   - Red banner across the top of every page: `⚠ Impersonating Acme Surveying as alice@acme.com · 28:14 remaining · End impersonation`.
   - Top-bar avatar changes to show both the operator's face *and* the target user's name beneath.
   - The admin shell's normal toast / message systems all carry "(impersonated by Jacob)" in metadata so any chat or action the operator takes is visibly attributed.
6. **Restrictions during impersonation:**
   - Can read everything the target user can read.
   - **Cannot** perform destructive actions: no user deletion, no plan change from inside the impersonated session (must use the operator console), no data deletion. Server-side check on every mutating route.
   - **Cannot** read certain customer-private fields by default: payroll exact amounts, individual employee SSNs, private user messages between customer's users. Operator must explicitly request "deep impersonation" (separate, more-audited flow) for those.
7. **End the session:**
   - Operator clicks "End impersonation" → JWT invalidated server-side → redirect to `/platform/customers/[org-id]`.
   - Auto-end at TTL expiry (server-side check on every request).
   - `ended_at` written to the impersonation_sessions row.
8. **Audit:**
   - `impersonation_started`, `impersonation_ended`, and every mutating action during impersonation gets a row in `audit_log` with `operator_email`, `org_id`, `target_user_email`, `action`, `metadata`.
   - All other operators with audit access see the session in real-time in `/platform/audit`.
   - Optional: customer org admin gets an email notification "A Starr Software support operator accessed your account on [date] for [reason]." Configurable per-tenant; default ON.

### 3.5 Billing operations — `/platform/billing`

Sub-tabs:

- **Dashboard** — MRR / ARR / churn / cohort retention curves (3, 6, 12 month). Failed-payment volume. New trial signups. Conversion rate (trial → paid). Top discount usage. Each metric is plottable + exportable.
- **Invoices** — Cross-tenant invoice list. Search by org, status (paid / open / overdue / void), date range. Click → Stripe invoice page in new tab (Stripe is canonical).
- **Dunning** — Customers with failed payments. Days-since-failure column. Action: retry (re-triggers Stripe retry), wait (no-op, lets Stripe's smart-retry continue), cancel (mark sub `canceled` immediately), comp (zero-the-invoice). Every action audited.
- **Refunds** — Refund queue. Customer can request a refund via support ticket; operator reviews + processes here. Records reason, amount, Stripe refund id, audit-log entry.
- **Plans** (sub-route `/platform/plans`) — list of all Stripe products + prices. Operator can create new (with confirm dialog — "Are you sure? Creates real product in Stripe."), retire, edit metadata. Tier matrix for `requiredBundle` route gates (master plan §3.4) is editable here — the route registry consumes it as data.

### 3.6 Support inbox — `/platform/support`

Sub-plan: `SUPPORT_DESK.md` (TBD; gated on master plan §10 Q5). This summarizes only.

```
┌──────────────────────────────────────────────────────────────────┐
│ Support · 12 open · 3 awaiting first response · 8 awaiting reply │
├──────────────────────────────────────────────────────────────────┤
│ Filter: Status ▾  Priority ▾  Assigned ▾  Tag ▾   [Search...]    │
├──────────────────────────────────────────────────────────────────┤
│  T-0042  Crews Eng     CAD export to DXF crash     Open   🔥 P0  │
│  T-0041  Acme Surv     Adapter for Bell County     Open   P2     │
│  T-0040  Brown & Co    How do I invite a user?     Awaiting reply│
│  …                                                                │
└──────────────────────────────────────────────────────────────────┘
```

Ticket detail: thread view, internal-notes-only toggle, attached files, related tickets (by customer or by tag), assigned operator, priority, status. Actions: assign, change priority, change status, reply, add internal note, close.

### 3.7 Releases — `/platform/releases`

```
┌──────────────────────────────────────────────────────────────────┐
│ Releases · [+ Tag release]                          [Search...]   │
├──────────────────────────────────────────────────────────────────┤
│  v2.4.0 · 2026-05-13 · Office bundle · 24 tenants notified       │
│  v2.3.2 · 2026-05-11 · Bug fix · Notification suppressed         │
│  v2.3.1 · 2026-05-09 · Recon bundle · 31 tenants notified · req  │
│  …                                                                │
└──────────────────────────────────────────────────────────────────┘
```

Release detail:
- Tag (Git tag + commit SHA, auto-pulled from current main on tag)
- Affected bundle(s) — checkbox list
- Release notes (Markdown editor)
- Type: feature / bugfix / breaking / security
- Required-update flag (forces customers to update mobile / dismisses-not-allowed for the in-app banner)
- Rollout schedule: immediate / gradual (10% → 50% → 100% over 24h) / specific tenants
- Mobile OTA channel: triggers `eas update --channel production --message "..."` server-side
- Audience preview ("This release will notify 24 tenants")
- "Publish" button → fires notifications + opens in-app banners + (if mobile) triggers EAS OTA

### 3.8 Broadcasts — `/platform/broadcasts`

Composer:
- Audience: All orgs / orgs on plan(s) / orgs with bundle(s) / specific orgs / orgs by tag (e.g. `texas-only`)
- Channel: in-app banner + email + (optional) SMS
- Subject + body (Markdown)
- Schedule: send now / send at [datetime]
- Preview: shows the recipient count + sample-rendered banner

History list shows every past broadcast with delivery counts (sent / opened / clicked), audience snapshot, and operator who composed.

### 3.9 Health — `/platform/health`

Three sub-routes:

- **Errors** (`/platform/health/errors`) — extends the existing `/admin/error-log` to cross-tenant. Same filters + triage states. Per-org column. Operator can dismiss or escalate to a support ticket.
- **Adapters** (`/platform/health/adapters`) — implements the front-end of `Self_healing_adapter_system_plan.md` (currently in `completed/`). Adapter ribbon (status by site), recent failures, regression-fixture diffs, manual probe button.
- **Pipelines** (`/platform/health/pipelines`) — cross-tenant pipeline run list. Pulled from the existing Pipeline Dashboard data. Per-org filtering. Stuck-job killer with audit.

### 3.10 Developer surfaces — `/platform/dev/*`

The existing Testing Lab (`/admin/research/testing/page.tsx`), Pipeline (`/admin/research/pipeline`), Coverage (`/admin/research/coverage`), Code Browser, and Logs all relocate to `/platform/dev/*`. **Customer admins lose access to these.** Routes are gated to `platform_admin` role and (for some) `developer` role.

Migration: each route's existing path keeps working with a redirect to its new home; the route registry is updated; the old `/admin/research/testing/` files become tiny redirect wrappers (analogous to slice 2c in the admin nav redesign).

### 3.11 Audit log — `/platform/audit`

```
┌──────────────────────────────────────────────────────────────────┐
│ Audit log                              [Search...]  [Export]      │
├──────────────────────────────────────────────────────────────────┤
│ Filter: Operator ▾  Org ▾  Action ▾  Severity ▾  Date range ▾    │
├──────────────────────────────────────────────────────────────────┤
│ 2026-05-13 14:22  Jacob   IMPERSONATION_STARTED  Acme · CAD bug   │
│ 2026-05-13 14:18  Jacob   PLAN_CHANGED           Acme · → Firm S. │
│ 2026-05-13 13:55  Hank    REFUND_PROCESSED       Brown · $99      │
│ 2026-05-13 12:01  System  PAYMENT_FAILED         Crews · invoice  │
│ …                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Detail view shows full action metadata (request body, response, IP, user-agent, time). Immutable — no edit, no delete. Retention: indefinite for high-severity events; 1 year for routine.

### 3.12 Team — `/platform/team`

Internal operator team management. Lists every `platform_admin` / `platform_billing` / `platform_support` / `platform_developer` user. Roles + permissions matrix (see §4). Invite, suspend, role-change. Two-person-rule for high-risk actions (proposed): another platform_admin must approve any new platform_admin invite or any role escalation.

### 3.13 Settings — `/platform/settings`

Operator-side global config:
- Env-var status (Stripe key version, Resend API key set, Twilio credentials set — masked display, never the raw secret)
- Feature flags (enable/disable specific surfaces during rollout)
- Default email templates (welcome, invite, trial-ending, payment-failed) — editable Markdown with variable substitution
- Default broadcast templates
- Webhook URLs (Stripe, Slack alerts, Sentry, etc.)

---

## 4. Operator role model

The platform side uses a separate role union from the customer-side `UserRole`. Proposed `OperatorRole`:

| Role | Read | Customer ops | Billing ops | Support | Releases | Dev tools | Audit | Team mgmt |
|---|---|---|---|---|---|---|---|---|
| `platform_admin` | all | yes | yes | yes | yes | yes | yes | yes |
| `platform_billing` | customers, billing | no | yes | no | no | no | yes (billing) | no |
| `platform_support` | customers, tickets | no | view | yes | no | no | yes (support) | no |
| `platform_developer` | health, dev | no | no | yes | yes | yes | yes | no |
| `platform_observer` | all | no | no | no | no | no | yes | no |

`platform_admin` is granted by another `platform_admin` (two-person rule). Initial seed: the two human admins from `lib/auth.ts:63-67` plus an emergency-recovery service account.

**Critical constraint:** no customer-side user (regardless of their `org_role`) has any access to `/platform/*`. The operator role lives outside the org-membership model. Operator login uses a separate flow (recommendation: dedicated MFA required, no Google SSO — `credentials` provider only with a stricter password policy).

---

## 5. Data model

New tables (proposed; final schema lands in `SAAS_AUTH_REFRESH.md` and `MULTI_TENANCY_FOUNDATION.md` sub-plans):

```sql
-- Operator roster (separate from customer-side registered_users)
CREATE TABLE operator_users (
  email          TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  role           operator_role_enum NOT NULL,
  status         TEXT DEFAULT 'active',     -- active / suspended
  mfa_secret     TEXT NOT NULL,             -- TOTP secret, encrypted at rest
  password_hash  TEXT NOT NULL,
  invited_by     TEXT REFERENCES operator_users(email),
  invited_at     TIMESTAMPTZ DEFAULT now(),
  last_signin_at TIMESTAMPTZ
);

-- Impersonation sessions
CREATE TABLE impersonation_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_email    TEXT NOT NULL REFERENCES operator_users(email),
  target_org_id     UUID NOT NULL,
  target_user_email TEXT NOT NULL,
  reason            TEXT NOT NULL,             -- required, 10+ chars
  scope             TEXT DEFAULT 'standard',   -- standard / deep
  started_at        TIMESTAMPTZ DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,
  ended_reason      TEXT,                      -- operator_ended / ttl_expired / system_revoked
  ip_address        INET,
  user_agent        TEXT
);
CREATE INDEX idx_impersonation_active ON impersonation_sessions(target_org_id) WHERE ended_at IS NULL;

-- Audit log (cross-tenant, append-only)
CREATE TABLE audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_email    TEXT,                      -- null when triggered by system / customer
  customer_email    TEXT,                      -- null when triggered by operator outside any session
  org_id            UUID,                      -- null for org-creation events
  action            TEXT NOT NULL,             -- IMPERSONATION_STARTED, PLAN_CHANGED, etc.
  severity          TEXT DEFAULT 'info',       -- info / warning / critical
  metadata          JSONB NOT NULL DEFAULT '{}',
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_org ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_operator ON audit_log(operator_email, created_at DESC) WHERE operator_email IS NOT NULL;
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);
```

The customer-side `organizations` table is specified in `MULTI_TENANCY_FOUNDATION.md` (TBD). For this doc's purposes, it has at minimum:

```sql
CREATE TABLE organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT UNIQUE NOT NULL,        -- 'acme-surveying' → acme-surveying.starrsoftware.com
  name           TEXT NOT NULL,
  status         TEXT DEFAULT 'active',       -- active / trialing / past_due / canceled / paused / pending
  stripe_customer_id TEXT,
  subscription_id    UUID REFERENCES subscriptions(id),
  primary_admin_email TEXT NOT NULL,
  founded_at     TIMESTAMPTZ DEFAULT now(),
  domain_restriction TEXT,                    -- if set, only users at this domain can be invited
  tags           TEXT[] DEFAULT '{}',
  metadata       JSONB DEFAULT '{}'
);
```

---

## 6. Cross-cutting concerns

### 6.1 Real-time updates

The operator dashboard needs live updates (new tickets, payment failures, signups). The existing `/api/ws/ticket` route is the WebSocket plumbing — extend it to a per-operator subscription channel that pushes:
- New tickets in tenants the operator can see
- Payment failures
- Critical errors
- Impersonation events by other operators
- New signups

In-progress alerts (e.g. "Acme Surveying just hit a CAD error") surface as bottom-right toast cards. Click → relevant detail.

### 6.2 Search across operator console

A global "Find anything" palette (Cmd+Shift+K) scoped to `/platform/*`. Searches:
- Customers (by name, slug, domain, primary admin email)
- Tickets (by id, subject, requester)
- Audit events (by id, operator, action type)
- Releases (by tag, notes content)

Implementation extends `lib/admin/route-registry.ts:rankRoutes` to accept a custom corpus. Cross-tenant search requires `platform_admin` or specific scope role.

### 6.3 Mobile parity

The operator console is web-first; no mobile counterpart in v1. Operators on the road can hit it on a mobile browser (responsive layout required) but a dedicated operator-mobile app is deferred.

### 6.4 Two-person rule for high-risk actions

Inspired by the SaaS security playbook. Actions that require a second operator's approval before they take effect:

- Granting `platform_admin` role
- Refunds >$500
- Plan-changes that increase a customer's MRR by >20% (catches typos)
- Force-update releases marked breaking
- Deleting an org (only allowed manually; never auto)

Mechanism: action is queued in `pending_operator_actions`; a different operator approves via `/platform/team/pending` or the operator dashboard's action queue. Approver gets a notification. 24h TTL on pending actions.

### 6.5 Telemetry events

Every page-view in `/platform/*` is logged for debugging operator UX. Every mutating action emits an audit row (which is the strong record). Lightweight pageviews live separately (proposed: console-local Sentry or a `platform_telemetry` table).

---

## 7. Phased delivery

Each phase produces a shippable state. Phase letters chained off the master plan's Phase C ("Operator console + customer detail") for context.

### Phase C-1 — Operator auth + dashboard shell (1 week)
- [x] `operator_users` + `audit_log` tables — shipped in `seeds/265_saas_operator_console_schema.sql`.
- [ ] Operator login flow (separate from customer-side `/admin/login` — at `/platform/login`, credentials-only, MFA-required) — gated on master plan M-9 auth refactor.
- [x] `/platform` route scaffold + brand-distinct gradient layout + surface directory — shipped as `app/platform/{page,layout}.tsx` + `app/platform/components/PlatformLayoutClient.tsx`. Gates on `session.user.isOperator`; non-operators redirected to `/admin/me`; unauthenticated to `/admin/login`. Until M-9 ships the `isOperator` JWT claim, the route is unreachable in practice (defense in depth).
- [ ] `/platform/customers` empty list — Phase C-2.
- [x] Operator role gate (component-level redirect; middleware-level enforcement adds in C-2 alongside the customer list).
- *Acceptance partial:* operator can navigate to `/platform`, see the surface directory chrome, and be redirected if non-operator. Full login flow waits for M-9.

### Phase C-2 — Customer list + detail (1 week)
- [x] `organizations` table seeded with Starr Surveying — `seeds/261_saas_seed_starr_tenant.sql`
- [x] `/platform/customers` list — `app/platform/customers/page.tsx` table with name / slug / status (color-coded) / MRR / seats / bundles / admin email / founded; search + status + sort filters; total-MRR header
- [x] `/api/platform/customers` GET — operator-auth-gated, joins organizations + subscriptions, computes monthly MRR per org
- [x] Customer detail (Overview) — `app/platform/customers/[orgId]/page.tsx` + `app/api/platform/customers/[orgId]/route.ts`. Returns org row + subscription state + headline stats (active members / invoice count / open tickets) + last 25 audit entries. Operator-gated.
- [ ] Per-tab detail (Users / Billing / Tickets / Audit / Data) — deferred to follow-up; the Overview tab subsumes the most-asked-for fields. Full per-tab breakdown lands when operators need to drill in.
- *Acceptance partial:* operator sees a real detail page when clicking through from the list. Per-tab deep-drilling is the next slice.

### Phase C-3 — Impersonation (1.5 weeks)
- Impersonation flow per §3.4.
- Red banner + audit logging.
- 30-minute TTL enforcement.
- *Acceptance:* operator can impersonate Starr admin, see Starr's admin shell, banner shows, audit row written, TTL ends session.

### Phase C-4 — Billing operations write surface (1 week)
- Apply coupon, refund, plan change, cancel via operator console.
- Each action calls Stripe API, audits, re-fetches state.
- Dunning queue with retry / wait / cancel / comp.
- *Acceptance:* operator can refund a Starr test invoice; refund appears in Stripe within 30s; audit row written.

### Phase C-5 — Audit log surface (3 days)
- [x] `/platform/audit` table view with When / Operator / Org / Action / Severity / Details columns
- [x] Filters: search, severity, action type (dynamically populated from observed actions)
- [x] `/api/platform/audit` server route — operator auth gate (session.isOperator OR operator_users lookup fallback until M-9), 1000-row cap
- [ ] CSV export (async via background job) — deferred to follow-up slice when broader operator-tooling export pattern is settled
- *Acceptance partial:* every action queryable; CSV export remains.

### Phase C-6 — Move developer surfaces (3 days)
- Relocate `/admin/research/testing`, `/admin/research/pipeline`, `/admin/research/coverage`, `/admin/research/library`, `/admin/research/billing` (operator side), `/admin/error-log` → under `/platform/dev/*` and `/platform/health/*`.
- Old paths redirect to new with a 301 (kept for 1 PR-cycle grace).
- *Acceptance:* every existing developer-side URL keeps working; the route registry reflects the new home; customers can't reach `/platform/*`.

### Phase C-7 — Releases + broadcasts (1.5 weeks)
- `/platform/releases` per §3.7 (without mobile OTA — that's Phase G of the master plan).
- `/platform/broadcasts` per §3.8.
- *Acceptance:* operator tags release v2.4, writes notes, schedules broadcast; customers see banner.

### Phase C-8 — Cross-tenant health + dashboards (1 week)
- `/platform` dashboard headline metrics wired to real data.
- `/platform/health` error log cross-tenant.
- Adapter health from existing Self-Healing spec data.
- *Acceptance:* MRR is the real Stripe MRR; error log shows every tenant's errors.

### Phase C-9 — Team + settings + two-person rule (1 week)
- `/platform/team` per §3.12.
- Two-person approval flow per §6.4.
- `/platform/settings` per §3.13.
- *Acceptance:* operator can invite a second operator; the second operator can approve pending actions.

**Total: ~9 weeks of engineering** for Phase C complete. Order is flexible — C-3 (impersonation) and C-4 (billing ops) can swap; C-6 (move dev surfaces) can ship in parallel with anything.

---

## 8. Open questions specific to this sub-plan

These are *in addition* to the master plan's §10 questions. Master-plan answers gate broader architecture; these are narrower.

1. **Operator-console branding.** Is it visually distinct from the customer console? Recommendation: yes — different palette (deep navy + amber accents vs. customer-side red + blue). Makes "you're on the platform side" obvious.
2. **MFA enforcement for operators.** Mandatory TOTP from day 1, or just strongly encouraged? Recommendation: mandatory.
3. **Operator-side login provider.** Credentials-only (recommendation) or also support Google SSO for Starr-domain operators?
4. **Audit log retention.** Indefinite (recommendation), 7 years (SOC2-ready), or 1 year (cheap)? Affects storage cost in the long run, not v1.
5. **Two-person rule scope.** Just the actions listed in §6.4 (recommendation) or extend to refunds <$500 and force-updates of any kind?
6. **External-customer access to their own audit log.** Should customer admins see *their org's* audit entries (recommendation: yes, helpful for security-conscious customers) or only operator-side? Trade-off: more transparency vs. more support questions.
7. **Slack integration.** Should critical-severity audit events ping a Slack channel (recommendation: yes, low-cost, high-leverage)? Requires webhook URL in settings.
8. **Operator-side AI assistant.** The Testing Lab already has an AI chat helper. Should `/platform/*` get a similar surface (e.g. "Why did this customer's payment fail?" → AI summarizes the data)? Recommendation: defer to Phase 6 polish — useful but not v1-critical.

---

## 9. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Operator impersonates without legitimate reason | High | Mandatory reason text on every session; visible to all platform_admin; weekly review of high-frequency impersonators |
| Impersonation token leaks → external attacker accesses any customer | Critical | Short-lived (30 min), single-use, IP-bound, audit on every request, revocation via `/platform/team` |
| Operator role escalation by social engineering | High | Two-person rule on platform_admin grants; MFA mandatory; alerts on role changes |
| Cross-tenant query returns rows from wrong tenant due to RLS bypass | Critical | The operator-side queries explicitly bypass RLS via `supabaseAdmin`. Mandatory code review + test coverage for every cross-tenant query path |
| Operator deletes data they shouldn't | High | No hard-delete on customer data from operator console; "delete" is soft (sets `deleted_at`); only background job hard-deletes after 30 days; recovery flow exists |
| Stripe action via operator console diverges from Stripe state | Medium | Every action calls Stripe API and re-fetches; reconciliation cron daily |
| Audit log grows too large to query | Medium | Partition by month after year 1; archive to cold storage; retention policy on routine events |
| Two-person rule blocks legitimate fast actions | Low | Approver gets push notification; 24h TTL means stale actions auto-expire; emergency override available with 3-person approval |
| Operator console is so good it becomes a customer success workaround | Low | Document what's customer-self-service vs. operator-only; track operator-time-spent-per-tenant as a metric |

---

## 10. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §4.2 — operator surfaces overview (this doc is the expansion)
- `STARR_SAAS_MASTER_PLAN.md` §10 Q5 — support build-vs-buy gates §3.6 detail
- `docs/planning/completed/Self_healing_adapter_system_plan.md` — extends `/platform/health/adapters` (existing spec applies as-is)
- `docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md` §5.3 — IconRail pattern; operator-side rail follows the same shape with different icons + Cmd+1..7
- `lib/admin/route-registry.ts:208-213` — `accessibleRoutes()` gains an operator-side counterpart `accessibleOperatorRoutes()` or extends to a `scope: 'customer' | 'platform'` parameter
- `app/api/webhooks/stripe/route.ts` — extended for `customer.created`, `customer.updated`, `customer.deleted` events when sub-plan 2 lands
- `lib/auth.ts:63-71` — `ADMIN_EMAILS` retires; replaced by `operator_users` table seed
- `app/admin/research/testing/page.tsx` — relocates to `/platform/dev/testing/page.tsx` in Phase C-6

---

## 11. Definition of done

The operator console is complete when:

1. Operator can log in via `/platform/login` with MFA and reach `/platform`.
2. `/platform/customers` lists every tenant with sortable / filterable columns; clicking opens the detail tabs.
3. Operator can impersonate a tenant user with: required reason, 30-min TTL, visible red banner, full audit trail, restriction on destructive actions.
4. Customer detail Billing tab supports: refund (with reason), plan change, coupon apply, manual credit, cancellation — all writing to Stripe + audit log.
5. `/platform/support` shows every tenant's tickets and supports operator reply (full support-desk surface depends on `SUPPORT_DESK.md` for ticketing protocols).
6. `/platform/releases` supports tagging, notes, scheduled rollout, mobile OTA channel control (mobile OTA pending master plan Phase G).
7. `/platform/broadcasts` supports send-now + send-later + audience filtering + delivery analytics.
8. `/platform/health` aggregates errors, adapter health, and pipeline runs across tenants.
9. The previous developer console (Testing Lab, pipeline, coverage, error log) has been relocated to `/platform/dev/*` and `/platform/health/*`; old paths 301-redirect for one PR-cycle grace.
10. `/platform/audit` lists every operator action with filters; export-to-CSV works (async for large queries).
11. `/platform/team` supports operator invites + role changes with two-person rule on escalations.
12. Cross-tenant queries from operator console use `supabaseAdmin` (RLS bypass) — every such query is in a reviewed code path with explicit operator-role check.
13. Every page-load + action emits a row in `audit_log` (operator action) or `platform_telemetry` (page-view).
14. Mobile responsiveness: rail collapses to a top-of-page menu; all detail surfaces are usable on a phone (operator-on-the-road use case).
15. No customer-side user has access to `/platform/*`; every route is gated to `OperatorRole`.
