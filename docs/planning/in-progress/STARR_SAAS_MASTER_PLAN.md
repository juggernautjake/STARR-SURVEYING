# Starr Software SaaS Pivot — Master Planning Document

**Status:** RFC / awaiting operator sign-off · DO NOT begin implementation slices until §10 open questions are answered
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Target repo path:** `docs/planning/in-progress/STARR_SAAS_MASTER_PLAN.md`

> **One-sentence pitch:** Repackage the existing Starr Surveying internal admin tool — CAD, Research/Recon, Education, Field Mobile, Business Management — as a tiered SaaS sold to surveying firms, with self-service customer billing + a Starr Software operator console for managing tenants, support, billing, and rolling out software updates.

---

## 0. tl;dr (read this even if you read nothing else)

1. **This is a real architectural pivot**, not a cosmetic rename. The codebase is single-tenant by design today (`endsWith('@starr-surveying.com')` gates 30+ surfaces, flat DB schema, no `organizations` table, mobile bundle ID hard-coded to `com.starrsoftware.starrfield`). Going multi-tenant touches auth, every DB table, every admin route's role gate, the mobile build, the marketing site, and the deployment topology.

2. **You're already 30-40% of the way there in unexpected places.** Stripe is fully wired for the *research* subscription product (`research_subscriptions` table, `/api/webhooks/stripe/route.ts`, three tiers: free / Surveyor Pro $99/mo / Firm Unlimited $299/mo, usage events, wallet ledger). The Testing Lab at `/admin/research/testing` is a mature developer console with branch ops, scrapers, analyzers, pipeline phases, logs, code browser. **Reuse over rewrite** is feasible for the billing pipeline and the operator console.

3. **What's missing entirely:** the `organizations` model, customer self-service signup, the firm-level (not just research-product-level) subscription, a support-desk surface, customer-facing in-app notifications, transactional auth emails, a desktop installer + auto-update channel, multi-tenant routing in middleware. None of this is a small task.

4. **Five decisions only the operator can make** are blocking before any implementation slice. They're listed in §10. The shape of the answer to each one materially changes the rest of the plan — picking the wrong tenancy model now is a 3-month rip-out later.

5. **Estimated effort:** 6-12 months of focused engineering for v1 (single-product tier, one tenancy model, no enterprise SSO, no custom domains), 12-18 months for the full vision (every product packaged, white-glove onboarding, custom-domain support, mobile app re-publishable per tenant). All numbers conservative.

This document is the strategic frame; ten sub-plans (listed in §8) cover the implementation detail and get authored one-by-one as you approve their parent decisions.

---

## 1. Business strategy (operator decisions)

The technical plan needs answers to these before any code ships. Defaults proposed; flag the ones you'd change.

### 1.1 Product packaging

**Proposed bundles** (named for clarity; rename as needed):

| Bundle | Includes | Target buyer |
|---|---|---|
| **Recon** | Research/Recon module only (existing `/admin/research/*`). Property research, document library, county-clerk pipelines, billing. | Solo surveyors / paralegals who only want title research |
| **Draft** | CAD Editor only (`/admin/cad/*`). Drawing tools, AI engine, plot styles, version snapshots. | Single-seat CAD operators / draftsmen |
| **Office** | Business management module: jobs, employees, payroll, receipts, scheduling, hours, messaging. Effectively the current `/admin/work` + `/admin/office` workspaces minus the firm-specific HR features. | Office managers / firm operators |
| **Field** | Starr Field mobile app standalone — clock in/out, data point capture, receipts, files. Read-only office hub view. | Crews-on-the-road / multi-state firms |
| **Academy** | Education module: learning hub, modules, exams, flashcards, fieldbook (`/admin/learn/*`). | Firms with apprentices / exam prep |
| **Firm Suite** | Everything above + unlimited seats + priority support. | Established surveying firms |

The exact bundle composition + pricing is an operator decision (§10 Q3). Plan assumes 5-6 bundles; if you'd rather sell á la carte or "everything-or-nothing", say so.

### 1.2 Pricing model

**Three plausible structures** — pick one:

(a) **Per-firm flat tier** (à la Notion Team): $X/mo for unlimited seats inside the firm. Simple to sell, expensive to upsell.

(b) **Per-seat tiered** (à la Slack): $Y/user/mo with bundled minimums. Standard SaaS, scales with growth, surveyors hate "another seat" friction.

(c) **Hybrid: per-firm base + per-seat overage** (à la GitHub Teams): $X/mo for 5 seats, $Y/extra seat. Best of both for small-firm market.

Existing research subscription is per-user, but that's the wrong shape for firm-level products. Recommendation: (c) hybrid with research-only legacy as a separate SKU.

### 1.3 Sales motion

**Three options** for going to market:

(a) **Pure self-serve**: Marketing site → pricing page → signup → Stripe Checkout → tenant provisioned in <60 sec. Cheap to operate, low ACV ceiling.

(b) **Sales-led + free trial**: Marketing site CTA → "Book a demo" → manual provisioning by operator. Higher ACV, no scaling without hiring.

(c) **Hybrid**: Self-serve for Recon / Draft / Field standalone bundles; sales-led for Firm Suite. Most common SMB SaaS pattern.

Recommendation: (c). Self-serve is achievable since Stripe is already wired; sales-led just means the operator console can manually create + assign subscriptions.

### 1.4 Free trial / freemium

Stripe trial periods + Stripe customer-portal handle this cleanly. **Recommendation:** 14-day free trial for self-serve bundles; no freemium (free reports/month is already in research-subscription tier, leave it). Free trial requires payment method up-front (industry default — surfaces signal early).

### 1.5 Starr Surveying's role

The pivot needs to decide: is Starr Surveying still a *firm operator* (running its own business through the platform), the *vendor* (selling to others), or both?

**Recommendation: both.** Starr Surveying becomes tenant #1 of its own SaaS — dogfoods the product, validates pricing, exposes pain points. A separate "Starr Software" identity owns the operator console. The data migration from today's single-tenant state to Starr-as-tenant-1 is the first implementation slice (covered in §6).

---

## 2. Current state (2026-05-13 audit findings)

Synthesized from a parallel-agent audit of auth, billing, and developer-tools surfaces today.

### 2.1 Single-tenant assumptions (the blockers)

**Auth + identity** (`lib/auth.ts:63-71`):
- `ADMIN_EMAILS` hardcoded to three Starr-specific addresses.
- `ALLOWED_DOMAIN = 'starr-surveying.com'` blocks all non-company Google sign-ins.
- `isCompanyUser()` (line 265) is the only "internal vs external" gate — checks email domain.
- No `org_id` / `tenant_id` anywhere in `types/next-auth.d.ts` session shape.

**DB schema** (57 seed files audited):
- No `organizations`, `tenants`, `firms`, or `workspaces` table exists.
- `registered_users` keyed solely on `email`. No tenant FK.
- Every table — equipment, jobs, points, notifications, vehicles, payroll, learning content, receipts — is flat across users.
- `lib/supabase.ts:11-14` is a single hard-coded Supabase project; no per-org project switching.

**Hardcoded firm identity** (~30 surfaces):
- `app/layout.tsx:12-14` — site metadata says "Starr Surveying" in title, OG image, creator, publisher.
- `app/sitemap.ts:4` — base URL `https://starr-surveying.com`.
- `app/components/Footer.tsx:86` — contact email `info@starr-surveying.com`.
- `app/admin/research/[projectId]/report/page.tsx:421` — every research report footer reads "Powered by Starr Recon — Starr Surveying Company, Belton, TX".
- `app/admin/settings/page.tsx:58` — company name defaults to "Starr Surveying" in firm settings form.
- `/public/logos/` — 48 logo asset variants, all Starr-branded.

**Role-gating** (`lib/admin/route-registry.ts:208-213`):
- `accessibleRoutes()` accepts `isCompanyUser: boolean` — binary company/external gate, no org-specific gating.
- `internalOnly: true` on most admin routes = "Starr employees only" (domain-based), not "this org's members only".

**Mobile** (`mobile/`):
- Bundle ID `com.starrsoftware.starrfield`; app name "Starr Field" throughout (`mobile/app.json:21`, plus dozens of UI strings).
- Single Supabase project; session is per-device, not per-org.
- No tenant scoping in any data fetch.

### 2.2 Already-SaaS-shaped scaffolding (the foundations)

**Stripe is production-ready for research subscriptions:**
- `package.json:192` — `stripe@^14.25.0` installed.
- `app/api/webhooks/stripe/route.ts` (69 lines) — fully implemented webhook handler. HMAC-SHA256 signature verification, 5-min skew tolerance, handles `checkout.session.completed`, `payment_intent.succeeded`, `customer.subscription.*`, `invoice.payment_*`.
- `app/api/admin/research/document-access/route.ts:70-175` — checkout-session creation flow with metadata-driven cost tracking.
- `app/api/admin/research/billing/route.ts` — billing dashboard API returning subscription tier, usage metrics, Stripe invoices.
- DB tables: `research_subscriptions` (stripe_customer_id, stripe_subscription_id, tier, status, period dates), `document_wallet_balance` (per-user USD), `document_purchase_history` (txn log), `research_usage_events` (cost ledger).
- Tier model: `free` (3 reports/mo), `surveyor_pro` ($99/mo, 50 reports), `firm_unlimited` ($299/mo, unlimited).
- State machine: active / inactive / past_due / canceled / trialing.

**This is the SaaS prototype.** Generalizing it from "research module add-on for our firm's customers" to "firm-level subscriptions for many customer firms" is the work; the primitives (customer, subscription, tier, webhook, invoice) all exist.

**Developer console (Testing Lab) is mature:**
- `/admin/research/testing/page.tsx` — admin/developer-gated. Seven tabs: Scrapers (10 adapters), Analyzers (8 modules), Pipeline Phases (9 stages), Full Pipeline, Code Browser, Health Check, Logs.
- API routes: `app/api/admin/research/testing/{run,pull,push,branches,ai-chat,ai-analyze,stream,files,dependencies}` — branch ops, live log streaming, AI debug chat.
- Property context scoping, deploy-status monitor, execution timelines, dependency graphs.

**Pipeline dashboard** (`/admin/research/pipeline`) — batch jobs, real-time progress, status filtering.
**Document library** (`/admin/research/library`) — full-text search, county/type filters, purchase-status filters.
**Coverage dashboard** (`/admin/research/coverage`) — per-county adapter routing reference (read-only).
**Error log** (`/admin/error-log`) — error reports with triage states, severity, breadcrumbs, post-mortem data.
**Self-healing adapter spec** — `docs/planning/completed/Self_healing_adapter_system_plan.md` — comprehensive plan blocked on operator-side prerequisites (Supabase migrations, Browserbase + CapSolver activation, Slack webhook provisioning).

**Mobile distribution scaffolded:**
- `mobile/eas.json` — EAS Build config. iOS (simulator + device + App Store submit), Android (internal/preview/production submit). Auto-increment version. Channel-based OTA via EAS Updates.
- Signing credentials are placeholders (`REPLACE_WITH_APPLE_ID`) — not yet provisioned.

**Email infrastructure (minimal):**
- Resend wired in `app/api/contact/route.ts` only — sends contact-form notifications + customer confirmations. `RESEND_API_KEY` env var.
- No transactional auth emails (welcome, password reset, invite). Auth uses NextAuth + Google primarily, so the existing flow is "Sign in with Google → auto-create user". External-domain self-serve signup would need email verification + invite flows that don't exist.

**Deployment:**
- Single Vercel project. `vercel.json` has two custom-memory functions + two cron jobs.
- No subdomain handling, no multi-domain routing, no per-tenant deployment isolation.

### 2.3 Internal-but-customer-shaped systems (the confusable ones)

`/admin/payroll`, `/admin/payout-log`, `/admin/receipts` are **Starr's internal HR/expense use only** (middleware `middleware.ts:16` enforces `admin` role). Not customer-facing, not connected to Stripe.

When we package "Office" as a SaaS bundle, these need to be rebuilt as **per-tenant business-management features** (each customer firm has its own payroll/receipts ledger) — but the existing code is the right shape, just needs org-scoping and a rename.

---

## 3. Target architecture

### 3.1 Multi-tenancy model (decision required — §10 Q1)

**Three plausible models**, tradeoffs sketched:

**(a) Shared DB + `org_id` column on every table + Postgres Row-Level Security (RLS).** Most common SaaS pattern, scales well, lowest operational overhead. Risk: missing an `org_id` filter anywhere = data leak; RLS policies must be airtight on every table. Stripe-style "soft tenancy" — tenant boundary is logical, not physical.

**(b) Schema-per-tenant** (one Postgres schema per customer firm, shared connection). Stronger isolation, easier compliance argument, harder to deliver cross-tenant aggregate features (operator dashboard usage stats, etc.). Migration tooling more complex.

**(c) Database-per-tenant** (one Supabase project per customer). Maximum isolation, most expensive per tenant, blocks easy in-house aggregation, but lets enterprise customers ask for "my data on my own AWS region" cleanly.

**Recommendation: (a) shared DB + RLS** for the SMB market this is targeting. Path forward if a future enterprise customer demands DB-per-tenant: build an "Enterprise" tier later that pins them to a private Supabase project — but don't pre-build it.

Operator console needs a way to **cross-tenant aggregate**, which is trivially supported by (a), painful with (b), and requires a separate fan-out service for (c).

### 3.2 Domain / URL strategy (decision required — §10 Q2)

**Three options:**

(a) **Path-based**: `app.starrsoftware.com/[firm-slug]/admin/...`. No DNS work per customer. Simple Vercel deploy. URL ugliness ("which firm am I on?").

(b) **Subdomain**: `[firm-slug].starrsoftware.com`. Standard pattern. Vercel supports wildcard subdomains. Trust signal for customer.

(c) **Custom domain**: `survey.customerfirm.com`. Enterprise table-stakes. Requires Vercel domain provisioning automation + cert issuance. Painful operationally — owe the customer DNS handholding.

**Recommendation:** (b) subdomain for v1. (a) is a stop-gap that creates ugly URLs that surveyors will see in client emails. (c) is a Firm Suite tier feature, not v1.

### 3.3 Identity stack changes

Current `lib/auth.ts` is NextAuth with Google + Credentials providers. Pivots needed:

1. **Remove `ALLOWED_DOMAIN` gate** at `lib/auth.ts:71` and the auto-approval check at line 159. External Google accounts must be sign-in-eligible. Domain restriction moves from global to per-tenant (each firm can optionally restrict to their own email domain).

2. **Session shape (`types/next-auth.d.ts`)** must carry `org_id` + `org_role` (the user's role *within* this org) — separate from the global `role` field, which becomes operator-side only.

3. **Org membership table** — new `organization_members(org_id, user_email, role, status, invited_by, invited_at, joined_at)`. A user can belong to multiple orgs (multi-hat surveyor who consults for two firms — rare but should not be designed out).

4. **Org switcher UI** in the topbar — if the user has multiple orgs, they pick which one they're acting under for this session. Active org id rides in the JWT.

5. **Invite flow** — `/admin/users` becomes an invite-and-manage UI per org. Email invitations require transactional email (slice depends on Resend setup expansion).

6. **Starr Software operator identity** is *separate* — a global role like `platform_admin` that lives outside any org. Granted to a tiny allowlist (you, Jacob's dad, future support hires). Carries the right to impersonate any tenant + see all data + cross-tenant aggregate.

### 3.4 Product modules — what's gated vs. universal

Every admin route already has a workspace assignment via `lib/admin/route-registry.ts`. The pivot adds a **product/module** dimension per route — what bundle does it require?

| Route prefix | Workspace today | Required bundle |
|---|---|---|
| `/admin/research/*` | research-cad | **Recon** |
| `/admin/cad/*` | research-cad | **Draft** |
| `/admin/jobs/*`, `/admin/leads/*`, `/admin/team/*`, `/admin/timeline`, `/admin/mileage`, `/admin/finances`, `/admin/vehicles`, `/admin/assignments`, `/admin/hours-approval`, `/admin/field-data` | work | **Office** |
| `/admin/learn/*` | knowledge | **Academy** |
| `/admin/equipment/*`, `/admin/personnel/crew-calendar` | equipment | **Office** (or unbundled as a follow-up) |
| `/admin/payroll`, `/admin/payout-log`, `/admin/receipts`, `/admin/employees`, `/admin/users`, `/admin/discussions`, `/admin/messages`, `/admin/notes`, `/admin/settings` | office | **Office** |
| `/admin/error-log` | office | **always available to org admins** |
| `/admin/me` (Hub) + workspace landings | n/a | **always available** (it's the shell) |
| `/admin/research/testing`, `/admin/research/pipeline`, `/admin/research/coverage`, `/admin/research/billing` | research-cad | **operator-only** (not bundled to customers) |

The route registry already has `roles` + `internalOnly`; this adds `requiredBundle: BundleId | null`. Customers without the bundle see a gentle "Upgrade to access [Module]" gate (with a link to their billing page).

**Critical design decision:** mobile (`Starr Field`) and the web app are two clients of the same backend. Bundle gates are evaluated server-side per request and reflected in both clients. Mobile's existing tabs (Jobs / Time / Receipts / Money / Me) all sit under the Office bundle today; the bundle gate hides tabs whose bundle the org lacks.

---

## 4. Surface inventory

### 4.1 Customer-facing surfaces (the "product end")

These are what a paying firm's users see. Routes prefixed with proposed paths.

| Surface | Path | What it does | New / Exists |
|---|---|---|---|
| **Marketing site** | `/`, `/pricing`, `/services`, `/contact`, `/about` | Top-of-funnel. Today informational; needs signup CTA + tier comparison table. | Exists, partial |
| **Signup flow** | `/signup` (or `/get-started`) | Create org + first user + Stripe customer + trial subscription. | New |
| **Auth surfaces** | `/credentials`, `/register`, `/login` | Sign in, sign up, password reset, accept invite. Today only sign-in. | Exists, partial |
| **Org-scoped admin shell** | `/admin/*` (current routes, now tenant-aware) | Everything the legacy `/admin/*` does, but for THIS customer's data only. | Exists (needs org scoping) |
| **Customer billing portal** | `/admin/billing` | Subscription state, plan changes, payment methods, invoices, usage. | New (extends `/admin/research/billing`) |
| **Customer support contact** | `/admin/support` | Submit tickets, view ticket history, knowledge-base search. | New |
| **User invite + management** | `/admin/users` (today exists for Starr) | Per-org user list, invites, role changes. Becomes per-tenant. | Exists (needs org scoping) |
| **Org settings** | `/admin/settings` (today exists) | Org name, logo, domain restriction, default user role, contact info. Per-org. | Exists (needs org scoping) |
| **Update notifications** | `/admin/me` Hub banner + in-app toasts | "v2.4 is out — see what's new." Dismissible per-user. | New |
| **Mobile app** | iOS + Android (existing Starr Field) | Same auth flow with org scoping; same tabs but bundle-gated; receives push notifications for ticket updates / billing alerts. | Exists (needs org + bundle gating) |

### 4.2 Operator-facing surfaces (the "management side")

The Starr Software operator console — separate from any one tenant's admin shell. Proposed paths under `/platform/` (or `/ops/` — naming TBD).

| Surface | Path | What it does | Notes |
|---|---|---|---|
| **Customer list** | `/platform/customers` | All tenant orgs, sortable by MRR / plan / status / signup date / last active. Search + filter. | New |
| **Customer detail** | `/platform/customers/[org-id]` | One org's: subscription state, users, support tickets, recent activity, billing history, impersonation entry point. | New |
| **Impersonation** | (action on customer detail) | "Sign in as" support flow with audit trail. Time-boxed (30 min). Required for support. | New, careful design |
| **Billing operations** | `/platform/billing` | All invoices, failed payments, dunning queue, refunds, manual subscription adjustments, MRR / churn metrics dashboard. | New (extends existing Stripe wiring) |
| **Support inbox** | `/platform/support` | Every open ticket across every tenant. Assign to operator, reply, close, escalate. | New |
| **Subscription operations** | `/platform/plans` | Create/edit/retire bundles, change pricing, manage coupon codes, view active subscriptions per plan. | New |
| **Telemetry / health** | `/platform/health` | Cross-tenant error log (extends existing `/admin/error-log`), per-adapter health (extends Self-Healing spec), pipeline run dashboard. | Extends existing |
| **Software release management** | `/platform/releases` | Tag a new release; mark required vs optional; per-bundle release notes; per-tenant rollout schedule (gradual rollout). Mobile OTA channel control via EAS. | New |
| **Broadcast + notifications** | `/platform/broadcasts` | Send announcements to all tenants / specific tenants / specific bundles. Email + in-app banner. Schedule for later. | New |
| **Developer surfaces** | `/admin/research/testing/*` (today) → moved to `/platform/dev/testing/*` | Existing Testing Lab + Pipeline Dashboard + Coverage + adapter health all live under operator console. Cross-tenant by default. | Existing → relocate |
| **Audit log** | `/platform/audit` | Every operator action: impersonation events, billing adjustments, plan changes, broadcasts sent, support replies. Immutable. | New |
| **Internal team management** | `/platform/team` | Who has operator access. Granular permissions (read-only vs full ops vs billing-only). | New |

### 4.3 What stays vs. moves

- **Stays in customer admin shell:** the existing `/admin/me` Hub, all per-tenant business management surfaces (jobs, employees, payroll, receipts, scheduling), the CAD editor, the research project list, the learning hub.
- **Moves to operator console:** Testing Lab, Pipeline Dashboard, Coverage Dashboard, Error Log (becomes cross-tenant), `/admin/research/billing` becomes per-tenant for customers + a separate operator view at `/platform/billing`.
- **Reused with org-scoping:** every existing query that today fetches global data becomes `WHERE org_id = ?`. The route registry's `accessibleRoutes()` adds a `bundle` filter.

---

## 5. Cross-cutting systems

Sub-plans for each are listed in §8.

### 5.1 Subscription + billing

Extends the existing research-subscription pipeline to firm-level. New tables: `organizations` (the tenant), `subscriptions` (replaces `research_subscriptions` for firm tier — old table becomes legacy + migrated), `subscription_items` (which bundles are on this sub), `invoices` (cached Stripe invoices for fast UI). Stripe is the source of truth; we mirror what we need for performance.

Customer-facing:
- Pricing page → checkout → trial → active → renews / cancels
- Self-service plan changes via Stripe Customer Portal (cheapest path) or our own UI (more polished, more work)
- Payment method management (cards, ACH for higher tiers)
- Invoice history + downloadable PDFs
- Usage display per bundle

Operator-facing:
- MRR / churn / cohort dashboards
- Failed payment queue with manual retry / refund / cancel flows
- Coupon / discount management
- Manual subscription provisioning (sales-led path)
- Per-tenant invoice viewer

Pricing must support: monthly + annual cycles, per-seat overage on top of base, free trials, proration on plan change, discounts, taxes (Stripe Tax integration recommended), refunds, ACH for enterprise.

### 5.2 Support desk

A ticketing system is needed because email doesn't scale past ~20 customers and the existing in-app `/admin/messages` is per-org chat, not customer ↔ operator support.

Two paths:

(a) **Build it in-house** — `support_tickets` table, `/admin/support` for customers, `/platform/support` for operators. Reuses the existing real-time WebSocket plumbing (`/api/ws/ticket` already exists in the route audit) and the Toast / notification primitives.

(b) **Embed an external** — Intercom / Help Scout / Zendesk widget. Faster to ship, monthly cost grows with ticket volume, customer data leaves the platform.

**Recommendation:** (a). The existing infrastructure makes this maybe 2-3 weeks of work and avoids the per-conversation cost ceiling. Knowledge base lives as a `/admin/learn` tenant — wait, no, that's per-tenant. The KB needs to be Starr-Software-side: `/help` or `/docs` on the marketing site. Article content reuses the existing Markdown/MDX infrastructure.

### 5.3 Customer messaging (in-app)

Three message flavors:

1. **Operator → tenant**: announcements, release notes, billing alerts, scheduled-maintenance warnings. In-app banner on Hub greeting + email digest (opt-out via preferences).
2. **Tenant admin → tenant users**: already exists as `/admin/discussions` + `/admin/messages`. Keep.
3. **Support back-and-forth**: handled by support desk above (real-time WebSocket via existing `/api/ws/ticket`).

The Hub greeting (`HubGreeting.tsx`) is the natural place for operator → tenant banners — it's the post-login landing. Add a notification center icon to the rail (top-right of tools) that opens a panel with unread items. Persists `lastSeenAt` per user.

### 5.4 Transactional notifications (email + SMS)

Resend is wired; Twilio is not. Triggers:

| Event | Recipient | Channel |
|---|---|---|
| Signup confirmation | new admin | Email |
| Invite to org | invited user | Email |
| Password reset | user | Email |
| Trial ending in 3 days | org billing contact | Email |
| Failed payment | org billing contact | Email |
| Subscription canceled | org billing contact | Email |
| Support ticket reply | requester | Email + in-app |
| New release available | org billing contact | Email + in-app banner |
| Critical security alert | all org admins | Email + SMS (Twilio, if enabled) |

Implementation: a `notifications` service module abstracts the delivery channel. Each event is a typed function (`notifyTrialEnding(orgId)`) that resolves recipients, picks template, dispatches via Resend (email) or Twilio (SMS) or both. SMS is opt-in per user.

### 5.5 Software update distribution

The user explicitly mentioned: "let customers know when we have updates for the software so that they can update their software whether on desktop or mobile."

**Web app:** updates ship instantly via Vercel deploy — no customer action needed. "Update available" is irrelevant for the web client. But customers want to know **what changed**. Solution: a release-notes drawer triggered by version bump (compare server-known `app.version` with the user's last-acknowledged version stored in localStorage; show "What's new in v2.4" banner until dismissed).

**Mobile (`Starr Field`):** EAS Updates already configured (`mobile/eas.json` uses channel-based OTA). Operator can ship a JS-only update via `eas update --channel production` — installed silently next app launch. Native code changes require an App Store / Play Store binary, which means going through review (1-7 days). Mobile clients should display: "Update available — close and reopen the app" toast when a new bundle is ready (`Updates.checkForUpdateAsync()` from Expo Updates).

**Desktop:** doesn't exist yet. If the operator wants a desktop client (the user did mention "desktop"), it's a separate ~3-month build — Electron or Tauri wrapping the web app, custom installer per OS, code signing (Apple Developer + Microsoft Authenticode certs), auto-update via Squirrel / TauriUpdater. **Recommendation: defer desktop client to a separate spec.** The web app works in any modern browser; surveyors aren't asking for a desktop wrapper.

Either way: **release management belongs in `/platform/releases`** — tag a release, write notes, mark required vs optional, schedule rollout (canary → all). The release notes feed customer messaging (§5.3).

### 5.6 Audit + observability

Cross-cutting: operator actions, customer admin actions, billing events, security events all log to an immutable audit table partitioned by org. The customer admin sees their own org's audit log at `/admin/audit`. The operator sees everything cross-tenant at `/platform/audit`.

Impersonation is the hardest case: a Starr Software support person signing in as a customer's admin needs to be logged loudly (visible banner to anyone viewing the org concurrently, audit trail with reason + time, automatic logout after 30 min).

The existing error-log surface (`/admin/error-log`) gets extended: today it shows per-user errors in flat shape; in v2 it's per-org for customers + cross-tenant for operators. The existing data shape supports this with minimal change.

---

## 6. Migration path

**Day 0:** today's single-tenant Starr Surveying database has all production data flat — no `org_id` anywhere.

**Day N:** every table has `org_id NOT NULL`; Starr Surveying is org `00000000-…-1`; every existing row backfilled to that org; RLS policies enforce isolation; every query that wasn't `org_id`-aware before is now.

The intermediate slices:

1. **Create the `organizations` table** with a single seed row for Starr Surveying. Add `default_org_id` to JWT.
2. **Add `org_id` column** to every customer-data table (nullable initially, default-set to Starr's id, then made NOT NULL after backfill verified).
3. **Add `organization_members(org_id, user_email, role)`** and backfill from current `registered_users` (every existing user is a member of Starr).
4. **Per-table, in order of risk: add RLS policy.** Start with low-risk tables (notifications, audit logs). End with payroll + receipts (highest blast-radius if RLS misconfigured).
5. **Update every API route** to include `org_id` in queries. Many are derived from session JWT; a smaller number (background jobs) need an explicit org id.
6. **Update the auth layer** to remove `ALLOWED_DOMAIN`. Domain restriction moves to a per-org setting.
7. **Update mobile** to attach `org_id` to every fetch.
8. **Smoke-test as Starr Surveying** — everything should still work exactly like today.
9. **Onboard first external customer** — likely a friend-of-firm beta tester.

This migration alone is 4-6 weeks if done correctly. RLS bugs are silent — automated tests against the per-org isolation are essential (one per critical table at minimum).

---

## 7. Phased rollout (proposed)

Each phase ends with a shippable state. Numbers are *engineering effort*, not calendar weeks — depends on team size.

### Phase A — Multi-tenancy foundation (4-6 weeks)
- New `organizations` + `organization_members` tables
- `org_id` on every customer-data table
- RLS policies for tenant isolation
- Auth changes (drop ALLOWED_DOMAIN, add per-org domain restriction, add org context to JWT)
- Migration: Starr Surveying becomes tenant #1, all existing data backfilled
- Per-org route gating
- *Acceptance:* Starr Surveying continues to work exactly as today; a second test org can be created and data is fully isolated.

### Phase B — Billing + plan management (3-5 weeks)
- New `subscriptions` table (firm-level, supersedes the per-user `research_subscriptions` for new customers; existing migrated)
- New plans / bundles in Stripe
- Customer billing portal at `/admin/billing` (extends existing research-billing surface)
- Operator console billing dashboard at `/platform/billing`
- Webhook handler extended for new event types
- *Acceptance:* operator can create a plan in Stripe + the system auto-syncs; customer can upgrade/downgrade self-serve.

### Phase C — Operator console + customer detail (3-4 weeks)
- `/platform/customers` list + detail
- Impersonation flow with audit trail
- Operator-only auth role (`platform_admin`)
- `/platform/audit` immutable log
- Move existing developer surfaces (Testing Lab, Pipeline, Coverage) to operator console namespace; customer admins lose access.
- *Acceptance:* operator can manage a customer's subscription, see their data, impersonate to debug an issue, every action audited.

### Phase D — Self-serve signup + onboarding (2-3 weeks)
- Public signup flow at `/signup` (create org, first user, Stripe customer, start trial)
- Email verification (Resend)
- Org onboarding wizard ("Set up your firm: name, logo, default user role")
- Pricing page CTA
- *Acceptance:* a stranger can sign up on the marketing site, get to their admin shell in <60 seconds with no operator intervention.

### Phase E — Support desk (2-3 weeks)
- `support_tickets` table
- Customer surface at `/admin/support`
- Operator surface at `/platform/support`
- Real-time chat via existing WebSocket route
- Email integration: ticket created → email operator; reply → email customer
- *Acceptance:* customer files a ticket; operator sees it; back-and-forth resolves; ticket closed; audit logged.

### Phase F — Customer messaging + notifications (2 weeks)
- `notifications` service abstraction
- Resend templates for every lifecycle email
- In-app notification center
- Hub greeting banners for operator broadcasts
- *Acceptance:* operator schedules an announcement; every customer sees it on next login; can dismiss; remains in their notification history.

### Phase G — Release management + update distribution (2 weeks)
- `/platform/releases` to tag + describe releases
- Customer-side "What's new in v2.4" drawer triggered by version bump
- Mobile EAS channel control from the operator console
- Required-update enforcement for breaking changes
- *Acceptance:* operator ships a release; customers see release notes; mobile clients pull the OTA update silently; release surfaces in audit log.

### Phase H — Knowledge base + self-service docs (2 weeks)
- `/help` or `/docs` on marketing site
- Searchable, Markdown-backed articles
- Linked from in-app `?` help button (Phase 6 of admin nav redesign — already designed)
- *Acceptance:* customer can resolve common questions without filing a ticket; ticket volume measurably decreases.

### Phase I — Enterprise polish (deferred indefinitely)
- Custom domains
- SSO (SAML / OIDC)
- DB-per-tenant tier
- SOC2 audit prep
- Dedicated success manager dashboard

**Total Phase A-H estimate: 20-28 engineering weeks.** Likely 6-9 calendar months with one full-time engineer; less with more.

---

## 8. Sub-plans roadmap

Each is a follow-up doc to author once the parent decisions in §10 are resolved. Listed in dependency order — earlier docs gate later ones.

| # | Doc | Authors | Status |
|---|---|---|---|
| 1 | `MULTI_TENANCY_FOUNDATION.md` | Architecture | Outline below; full doc deferred until §10 Q1 + Q2 answered |
| 2 | `SUBSCRIPTION_BILLING_SYSTEM.md` | Backend | After §10 Q3 + Q4 |
| 3 | `OPERATOR_CONSOLE.md` | Full-stack | After §10 Q1 |
| 4 | `CUSTOMER_PORTAL.md` | Frontend | After §10 Q3 |
| 5 | `SUPPORT_DESK.md` | Full-stack | After §10 Q5 |
| 6 | `CUSTOMER_MESSAGING_PLAN.md` | Backend | After Phase F priority confirmed |
| 7 | `SOFTWARE_UPDATE_DISTRIBUTION.md` | Devops | After Phase G priority confirmed |
| 8 | `SAAS_AUTH_REFRESH.md` | Backend | Subset of (1) but worth its own doc — auth changes have the highest blast radius |
| 9 | `MOBILE_MULTI_TENANT.md` | Mobile | After (1) — mobile changes follow web |
| 10 | `MARKETING_SIGNUP_FLOW.md` | Frontend | After §10 Q3 + Q4 |

The Self-Healing Adapter spec already in `completed/` becomes a Phase C / Phase G milestone — the existing plan applies, just under the operator console namespace.

---

## 9. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| RLS misconfiguration leaks one tenant's data to another | **Critical** | Automated per-table isolation tests; staged rollout; mandatory code review for every RLS-policy change; an operator runbook for the "I saw someone else's data" incident |
| Auth refactor breaks existing Starr employee login | High | Stage on a preview branch; backward-compatible fallback for the existing `ALLOWED_DOMAIN` check during transition; full-suite vitest run on every commit |
| Stripe webhook race condition double-charges or drops a subscription change | High | Idempotency keys on every webhook handler; reconciliation cron (compare local state with Stripe API daily); alert on drift |
| Customer signs up + Stripe checkout completes but tenant provisioning fails | High | Provision tenant **before** Stripe checkout (create org as `pending_payment`); checkout success webhook flips to `active`; failure cleans up the pending org after 24h |
| Operator console impersonation is abused or leaked | Critical | Mandatory reason on every impersonation; 30-min auto-logout; visible banner in the impersonated session; audit log + alert on every event; SOC2-style time-boxed access |
| Marketing site / pricing page changes go live without billing-side support | Medium | Feature flag for the signup CTA; soft-launch (visible only to whitelisted IPs) until backend is ready |
| Existing Starr Surveying data migration corrupts a field during backfill | High | Migration ships as a separate slice on a fork; full backup taken before; reconciliation script verifies row counts + checksum per table |
| Mobile users can't update fast enough when a breaking API change ships | Medium | Mobile API surface versioned (`/api/v1/...`); deprecation window of 90 days for any v1 → v2 change; required-update toast for actually-breaking changes |
| Support ticket volume exceeds operator capacity in week 2 | Medium | Knowledge base before public launch (Phase H before signup CTA flips on); rate-limit signup to a manageable number per day |
| Pricing model picked at signup → permanent regret 6 months later | Medium | Pricing is fluid via Stripe; existing customers grandfathered into their plan; reprice new signups freely |
| Vendor lock-in to Stripe | Low | Stripe is the right call; switching costs are real but they're not a v1 concern |

---

## 10. Open questions (BLOCKING — operator must answer before any slice ships)

These materially change the implementation plan. Defaults are proposed but should not be assumed.

**Q1 — Multi-tenancy model.** Shared DB + RLS (recommended), schema-per-tenant, or DB-per-tenant?

**Q2 — URL strategy.** Subdomain (`firm.starrsoftware.com`, recommended), path-based (`/firm/admin`), or both with custom-domain as a tier feature?

**Q3 — Product bundling.** Five-bundle proposal in §1.1 vs. one Firm Suite vs. á la carte. Specifically: is Recon a separate sellable product or only available as part of Firm Suite?

**Q4 — Pricing structure.** Per-firm flat tier, per-seat tiered, or hybrid (recommended)? With or without 14-day free trial? Annual vs monthly billing as default?

**Q5 — Build vs buy for support ticketing.** In-house ticketing (recommended) or embed Intercom/Help Scout/Zendesk?

**Q6 — Desktop client?** Build an Electron/Tauri wrapper (3-month effort) or stick with web + mobile (recommended)?

**Q7 — Brand identity.** Is the product "Starr Software" (the existing brand)? Or do we name the SaaS product separately (e.g., "Survey Suite by Starr Software") to keep room for non-Starr-affiliated firms to feel comfortable subscribing? This shapes asset rework + domain choice.

**Q8 — Starr Surveying's data fate.** Starr becomes tenant #1 of its own SaaS (recommended). Confirm? And: do existing employee accounts auto-migrate, or do they re-onboard?

**Q9 — Initial GTM (go-to-market) window.** When is the first external customer expected to sign up? This sets the latest acceptable date for Phase A-D completion.

**Q10 — Operator team size.** How many people will run customer success / billing / support? This shapes how much automation vs manual operator workflow we build into each operator surface.

---

## 11. Definition of done (master-plan level)

The pivot is complete when:

1. ✅ Starr Surveying is tenant #1 of the SaaS and runs entirely on the new infrastructure (no fallback to legacy single-tenant paths).
2. ✅ A new external firm can sign up on the marketing site, complete payment, and have a working admin shell in <60 seconds without operator intervention.
3. ✅ Subscription state is reflected accurately in the customer billing portal + operator dashboard; failed payments enter the dunning queue automatically.
4. ✅ Customer admins can invite/remove users, change roles, manage their billing, file support tickets, and acknowledge release notes from inside the admin shell.
5. ✅ Operators can list customers, impersonate (with audit), respond to tickets, push broadcasts, tag releases, and see cross-tenant health metrics.
6. ✅ RLS isolation is verified by an automated test suite (one test per critical table at minimum).
7. ✅ The existing developer console (Testing Lab + pipeline + adapter health) is reachable only by operators.
8. ✅ Mobile app authenticates with org context; bundle gates apply.
9. ✅ Audit log captures every operator-side action and every customer billing event.
10. ✅ Release notes drawer surfaces in-app on version bump; mobile OTA updates ship through EAS channels.
11. ✅ Cross-tenant churn / MRR / cohort dashboards exist for the operator console.
12. ✅ Knowledge base has at least 30 articles covering the top customer questions before public-launch CTA flips on.

---

## 12. Cross-references

- `docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md` — the admin shell pivot just shipped; the SaaS pivot inherits the route registry, palette, persona system, and pinning. The persona system (`lib/admin/personas.ts`) is a candidate for **per-org default role** plumbing.
- `docs/planning/completed/Self_healing_adapter_system_plan.md` — the operator-side adapter health surface lives in the new `/platform/dev/*` namespace; existing plan still applies.
- `docs/planning/completed/STARR_FIELD_MOBILE_APP_PLAN.md` — mobile app v1 spec; org/tenant pivot is a follow-up `MOBILE_MULTI_TENANT.md` (item 9 in §8).
- `docs/planning/completed/STARR_CAD_MASTER_PLAN.md` — CAD module spec; gets the **Draft** bundle gate but otherwise unchanged.
- `lib/auth.ts:63-71` — the `ALLOWED_DOMAIN` + `ADMIN_EMAILS` constants are the highest-blast-radius change.
- `lib/admin/route-registry.ts:208-213` — `accessibleRoutes()` gains a `bundle` filter.
- `app/api/webhooks/stripe/route.ts` — the existing webhook handler is the blueprint for the expanded firm-level subscription event handling.
- `app/admin/research/testing/page.tsx` — the existing developer console; relocates to `/platform/dev/testing` but reuses the implementation.
