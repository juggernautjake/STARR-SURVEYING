# Platform, public website and integrations

Catalogue entries are in `platform.json` (40 entries, `area: "platform"`). This file is the overview, plus three sections the owner asked for: multi-tenancy readiness, an integrations inventory, and a proposed integration architecture. Every claim cites code or a plan; the research is from the repository as of 2026-10-23. Nothing was run.

## 1. What this area is for

Three jobs share this area.

1. **The public face of Starr Surveying.** Home, services, about, service area, resources, contact, privacy, credentials and the surveying pricing page. Their job is to turn a landowner into a lead (`/api/contact` writes a lead row and emails the office) and to rank in local search.
2. **The SaaS layer that lets other firms use the software.** Bundles and prices, firm signup, tenant isolation, route and bundle gating, firm account pages, and the operator console Starr Software staff use to run customers.
3. **The plumbing every area depends on.** Auth, webhooks, 23 cron jobs, uploads and storage, AI calls and spend limits, Resend email, WebSocket and push, and the keys for roughly 15 outside services.

`app/api` holds 769 route handlers. 527 are under `/api/admin` and belong to the other area catalogues. The rest are mapped in `platform.api-group-map`. Two of the groups are not surveying at all: `/api/dnd` (145 routes, a tabletop game) and `/api/voice` (26 routes, a voice-over studio's business app). Both live in the same deployment.

## 2. How the parts fit together

```
Browser / customer link / provider webhook
        |
   middleware.ts  (matcher: /admin, /api/admin, /dnd only)
        |-- role list per route prefix (ROUTE_ROLES)
        |-- bundle gate: pages redirect to upgrade, APIs answer 402
        v
   route handler  -> auth() session (JWT: roles, memberships, activeOrgId, isOperator)
        v
   lib/supabase.ts  -> orgScoped() proxy: adds org_id filter and stamps inserts
        v
   Postgres (service role; Postgres RLS is bypassed by 466 of 517 routes)
```

- **Packaging.** `lib/saas/bundles.ts` defines Recon $99, Draft $99, Field $49, Office $199 (5 seats), Academy $79, Firm Suite $499 (5 seats). `subscriptions.bundles` is read at sign-in; only `active` or `trialing` subscriptions grant bundles (`lib/auth.ts:454`).
- **Isolation.** `lib/saas/org-scope.ts` filters about 168 tables by `org_id` at the one place the app creates its database client.
- **Identity.** `lib/auth.ts`: Google or email and password, 30-day JWT, memberships and active org resolved at sign-in.
- **Operations.** `/platform` (operator-only) reads across firms. Releases fan out to firms' notification bells. Cron jobs run on Vercel with a shared secret.

## 3. Main journeys

| Journey | Path | State |
|---|---|---|
| Landowner asks for a quote | `/`, `/contact`, `/pricing` -> `POST /api/contact` -> lead + emails | Works. 1,667-line route. |
| Customer pays an invoice | `/pay` -> invoice lookup -> Stripe Elements or "I sent it" claim | Built; payments are off until keys and `PAYMENTS_LIVE` are set. |
| Customer signs or approves | `/proposal/[token]`, `/change-order/[token]`, `/portal/[token]` | Works; four separate token mechanisms. |
| Another firm signs up | `/pricing/software` -> `/signup` -> `/api/signup/complete` -> `/admin/me?welcome=true` | Creates org, admin, 14-day trial. No email verification, no card, no Stripe link. |
| Firm admin manages account | `/admin/billing`, `/admin/org-settings`, `/admin/invites`, `/admin/support` | Billing cannot change plan or take a card (503 until Stripe products exist). |
| Operator runs the SaaS | `/platform/*` | Read-mostly; no impersonation, billing ops or broadcasts. |
| Staff sign in | `/admin/login` (Google or password) | Works; no MFA, SSO or SAML. |

## 4. Biggest problems

1. **A firm cannot be charged.** All Stripe price ids in `lib/saas/bundles.ts` are null (`:64-66`). The Stripe webhook updates only the legacy `research_subscriptions` table (`app/api/webhooks/stripe/route.ts:460`), not the firm-level `subscriptions` table that decides access. Signup marks every trial `stripe_pending` for the operator to finish by hand (`app/api/signup/complete/route.ts:208`). Nothing expires a trial automatically other than the stored status.
2. **Multi-tenancy is enforced in application code and has never been run with two firms.** The backfill argument is sound, but see section 5 for what remains.
3. **No public API, no outgoing webhooks, no OAuth framework, no SSO.** Section 6 and 7.
4. **Signup is unsafe to open to the internet.** No email verification, no rate limit on `/signup/complete`, precheck says "TODO when middleware lands" (`app/api/signup/precheck/route.ts:15`), and an existing user's email is linked to the new org without proof.
5. **Operator console promises more than it does.** The team page says "MFA required at sign-in" (`app/platform/team/page.tsx:97`); `lib/auth.ts` contains no MFA logic.
6. **Three products in one deployment.** D&D (145 routes) and the voice studio (26 routes) carry their own auth, public write endpoints and a second Stripe webhook inside the surveying app.
7. **Public pages are Starr's, as literals.** 268 occurrences of "Starr Surveying" or the domain remain across `app` and `lib`; 83 files mention Belton or Bell County. The root layout fixes the canonical URL to `www.starr-surveying.com` (`app/layout.tsx:55`).
8. **Config is deployment-wide.** One Anthropic key, one Stripe account, one Twilio number, one Maps key, one Resend sender. A firm cannot bring its own.
9. **No platform legal or security pack.** `/privacy` is Starr's policy as a surveying firm. There is no terms of service, DPA, subprocessor list or security overview for software customers; `docs/security` covers payment PCI scope only.
10. **Spend is bounded per run only** ($2 per research run, 20 paid pages); there is no per-firm monthly cap (`docs/planning/BLOCKERS.md:415`).

## 5. Multi-tenancy readiness

### What exists (isolation and permissions)

| Layer | What it does | Cite |
|---|---|---|
| `org_id` column | On 73 business tables from seed 513, backfilled to the Starr org; later seeds cover more. | `docs/planning/completed/PLATFORM_AUDIT_AND_LAUNCH_QUESTIONS_2026-07-29.md` §1.2 |
| Scope proxy | `select`, `update`, `delete` get `.eq('org_id', active)`; `insert` and `upsert` are stamped. | `lib/saas/org-scope.ts:376`, header `:1-60` |
| Table list | `ORG_SCOPED_TABLES` (about 168 names), `CROSS_ORG_TABLES` (members, invitations, subscriptions). Verifier script compares it with the live schema. | `lib/saas/org-scope.ts:84`, `:273` |
| Memberships and active org | JWT carries each membership's role and bundles; `user_active_org` persists the choice; org switcher API. | `lib/auth.ts:420-475`, `app/api/admin/orgs/route.ts:1-8` |
| Bundle gate | Pages redirect, APIs answer 402; unclassified API routes are refused. | `middleware.ts:305`, `lib/saas/api-bundle-gate.ts:60` |
| Staff test | Based on active membership, not an email suffix. | `lib/saas/internal-user.ts:1-40` |
| Public tenant resolution | Invoice's org, else Host matched to `organizations.custom_domain`, else the sole org; never guesses. | `app/api/public/tenant/route.ts:8-20` |
| Operators | Separate `operator_users` table, no scope, cross-tenant views. | `lib/auth.ts:411-418`, `app/api/platform/*` |
| Per-firm settings | `organizations` name, state, phone, logo, brand colour, domain restriction; `app_settings` and feature toggles are org scoped. | `lib/saas/tenant-profile.ts:1-14`, `lib/admin/feature-toggles.ts:43` |
| Roles | `custom_roles` is in the scoped table list, so per-firm roles are possible. | `lib/saas/org-scope.ts` list |

### What is still single-firm or Texas-specific

**Single-firm (Starr) in code**

- `ADMIN_EMAILS` grants admin to three Starr addresses in every deployment (`lib/auth.ts:47`).
- `/api/auth/register` refuses `@starr-surveying.com` addresses (`app/api/auth/register/route.ts:27`).
- Verified email sender is `info@starr-surveying.com` and `noreply@starr-surveying.com` (`lib/email/sender.ts:26-27`); the SaaS notification path uses a separate `noreply@starrsoftware.com` (`lib/saas/notifications/email.ts:17`). A firm's own sending domain is described as "a later slice".
- Public site: title, keywords, canonical URL, Belton HQ, 150-mile radius, "Central Texas", phone `833-842-6971` as literals (`app/layout.tsx:22-55`, `app/page.tsx:421-436`, `app/services/page.tsx:223`).
- Licence RPLS 6706 and a named owner in `lib/seo/business.ts:61` and `app/credentials/page.tsx:166,269`.
- One Stripe account, USD-only events, no Connect (`app/api/webhooks/stripe/route.ts`, `lib/payments/stripe.ts`).
- One Twilio number, one owner phone, one inbound email secret; webhooks resolve no org (`app/api/phone-tap/route.ts:1-6`, `app/api/webhooks/email-inbound/route.ts:11-14`).
- One Anthropic key, one TexasFile balance, one research worker box in Vienna (`docs/platform/KEYS_AND_APIS_SETUP.md:11-25, 130-160`).
- Cron jobs act on whole tables, at fixed UTC times written for Central Time (`vercel.json`, `app/api/cron/weekly-reports/route.ts:1-5`).
- Storage buckets are named `starr-*`; no per-tenant quota (`lib/storage/uploads.ts:34`).
- 101 files and 293 references to Starr remain on customer-visible surfaces per the project's own scan (`lib/saas/tenant-profile.ts:1-14`).

**Texas-specific**

- Counties: the 254-county Texas datalist on the quote forms (`app/contact/page.tsx:526-528`).
- Resources and credentials pages: TBPELS, Texas GLO, TSPS, Category 1A, "RPLS" as the licence name, TSSE exam (`app/resources/page.tsx:88-143`, `app/credentials/page.tsx:36-124`).
- Privacy page: Texas Data Privacy and Security Act, Texas record retention (`app/privacy/page.tsx:383,411`).
- Research: Bell CAD GIS only for Bell County (`app/api/admin/research/[projectId]/bell-cad-gis/route.ts:59`), county adapters (Kofile, TexasFile) (other areas cover this).
- `organizations.state` defaults null with country `US`; there is no per-firm units, datum, time zone, licensing board or county list (`app/api/signup/complete/route.ts:125-127`).

**Isolation gaps**

- Isolation is a client-side proxy; Postgres RLS is bypassed by the service role used in 466 of 517 routes (`lib/saas/org-scope.ts:1-30`). A route that imports the unscoped client leaks across firms.
- The table list drifts. Ten tables drifted once; the verifier has "nothing running it" in CI (`docs/planning/BLOCKERS.md:381, 935`).
- Not covered by the table filter: storage object paths, Redis and worker jobs, research documents, caches.
- Cron, webhooks, Twilio, voice, public token routes run without a scope by design (`lib/saas/org-scope.ts` header).
- Roles are global per email in `registered_users` (`lib/auth.ts:110`); a person in two firms gets one role set.
- No impersonation, tenant export or tenant deletion, no per-tenant backup restore.
- Lapsed or cancelled firms lose bundles but their data is only removed by a purge job that is not tenant-aware (`app/api/cron/purge-deleted`, unread detail: status unknown).

### Readiness verdict

The shape is right and the hard decision (shared database, `org_id` filter) is made and mostly applied. To serve many firms nationwide it still needs: billing that works, email and Stripe and phone per firm, two-firm isolation tests, a state/units/locale configuration layer, and content packs per state. Texas-first is fine; the Texas content must become data.

## 6. Integrations inventory

Legend: **Built** means code exists and is used; **Partial** means code exists but is untested against the live service, off, or one-directional; **Missing** means nothing in the repository.

### 6.1 Services the platform already uses

| Service | Used for | State |
|---|---|---|
| Supabase (Postgres, Storage, Auth mirror) | All data and files | Built |
| Stripe | Customer invoice card payments, document wallet | Partial: off until keys and `PAYMENTS_LIVE`; no Connect |
| Resend | Outbound email (about nine call sites), inbound webhook | Built; no bounce events |
| Twilio and ElevenLabs | Phone receptionist, SMS, transcripts | Built; single number |
| Anthropic | AI features, research analysis | Built; no per-firm cap |
| Google sign-in, Calendar, Ads, Maps | Auth, per-user calendar sync, conversions and spend, address and imagery | Built; single-firm credentials |
| Cloudflare R2, Redis/BullMQ, worker box | Research pipeline | Built; spec for lifecycle rules unclear |
| Tavily, TexasFile, Kofile | Research and document purchase | Built; Texas only |
| Web Push (VAPID) | Phone alerts | Partial: keys not set as of 2026-08-30 |

### 6.2 What firms use and where Starr stands

| Firm tool | What Starr has | Gap |
|---|---|---|
| **QuickBooks Online** | Receipts CSV export "for the bookkeeper to re-map" (`app/api/admin/receipts/export/route.ts:6`); tax summary mentions QuickBooks | **Missing** as an integration. No OAuth, no push of invoices, payments, bills or payroll journals, no chart-of-accounts mapping. |
| **Xero** | Same CSV comment only | **Missing.** |
| **Google Workspace** | Google sign-in; per-user Calendar OAuth (`lib/integrations/google-calendar.ts`) | **Partial.** No Drive file mirror, Gmail/Contacts sync, domain-wide sign-in or admin provisioning. |
| **Microsoft 365** (Outlook, Entra ID, Teams) | None (`microsoft` appears only in two unrelated files) | **Missing.** No Outlook calendar or mail, no Entra sign-in. |
| **Dropbox, Box, SharePoint/OneDrive** | Nothing in app code. A planning note says a helper on the office machine can watch a Drive/Dropbox folder (`app/api/admin/field-ingest/route.ts:10`) | **Missing.** Only manual upload and a collector file upload. |
| **Trimble Connect** | Cursor-based Object Sync poller and cron (`lib/field-ingest/trimble-connect.ts`, `app/api/cron/field-sync/route.ts`) | **Partial.** Never run against the live API; needs each firm's licence and keys. Research found Trimble Connect has no webhooks, so polling is correct. |
| **Trimble Business Center, Access** | JobXML parser, `trimble-pnezd` CSV preset, RW5 | **Partial.** File round trip only; no TBC export presets. |
| **Carlson** | LandXML and DXF readers and writers; CAD command names borrow Carlson conventions | **Partial** via files only. |
| **Leica / Hexagon** (Infinity, Exchange) | GSI parser added (`lib/cad/import/gsi-parser.ts`, format-detect) | **Partial.** Read only; no GSI export, no cloud API (research judged it partner gated). |
| **Topcon, Spectra, GeoMax** | RW5 and GSI cover much of them | **Partial** via files. |
| **Esri ArcGIS** | GeoJSON writer (`lib/cad/delivery/geojson-writer.ts`) | **Partial.** No feature service publish, no shapefile or geodatabase export, no parcel layer sync. |
| **Autodesk** (Civil 3D, AutoCAD, ACC) | DXF writer and reader, LandXML | **Partial** via files. No DWG, no APS or ACC connector. |
| **Zapier, Make** | None | **Missing.** Needs a public API plus REST-hook triggers. |
| **Public REST API and webhooks** | None; all routes are internal, unversioned, no keys, no OpenAPI | **Missing.** |
| **SSO, SAML, SCIM** | None; planned as an enterprise non-goal | **Missing.** |
| **Payroll and HR** (Gusto, ADP) | Plaid appears only in a seed; payouts are built in-house | **Missing.** |
| **E-signature** (DocuSign) | In-house typed-name signature on proposals, change orders and contracts | Alternative built; no external connector. |
| **Slack / Teams alerts** | Push, in-app and email only | **Missing.** |

## 7. Proposed integration architecture

Goal: any firm can connect Starr to what it already runs, without Starr building every connector. Build the platform once (events, API, OAuth, connectors), then connectors are small.

### 7.1 Principles

- **One domain layer, two front doors.** Business logic lives in services (jobs, customers, invoices, leads, points, files). `/api/admin` stays the private backend of the app. A new `/api/v1` is public. Both call the same services, so rules and org scope are not duplicated.
- **Org scope everywhere.** Every public request resolves an org from its credential and runs inside the existing `org-scope-context` so the filter in `org-scope.ts` applies unchanged.
- **Events are the contract.** Anything an integration wants to know is an event; webhooks, Zapier triggers, audit and notifications all read the same stream.
- **Firm secrets are firm data.** Tokens and keys live per org, encrypted, in one table, not in Doppler.

### 7.2 Public API (`/api/v1`)

- Resources first: `customers`, `contacts`, `jobs`, `leads`, `invoices`, `payments` (read), `points` and `files` for jobs, `employees` (read), `time-entries`, `events`.
- Conventions: JSON, cursor pagination, `updated_since` filter, idempotency keys on writes, standard error envelope, rate limit per key, OpenAPI 3.1 generated from route definitions, a docs page, a sandbox firm.
- Auth: (a) **API keys** per org, scoped (`jobs:read`, `leads:write`), hashed at rest, shown once, rotatable; (b) **OAuth 2.0 authorisation code** for third-party apps acting for a user, with the same scopes. Keys and apps are managed in Firm settings.
- Gate: a new API group classification in `api-bundle-gate.ts` so access follows the plan (API access can be a Firm Suite or add-on entitlement).
- Reuse: expose the existing lead intake as `POST /v1/leads` so firms' own websites, Zapier and ad platforms can post leads.

### 7.3 Events and webhooks

- **Outbox table** `events` (id, org_id, type, version, payload, occurred_at) written in the same transaction as the change. Types such as `lead.created`, `proposal.accepted`, `job.stage_changed`, `invoice.sent`, `invoice.paid`, `payment.failed`, `change_order.approved`, `points.received`, `file.uploaded`, `time_entry.submitted`.
- **Endpoints table** `webhook_endpoints` (org_id, url, secret, event filter, active) and **deliveries** (status, attempts, response). A cron or queue worker delivers with an HMAC-SHA256 signature header and timestamp, exponential retries, auto-disable after sustained failure, and a replay button.
- Internal consumers read the same outbox: notifications service, audit log, accounting sync, Zapier. The Stripe, Resend, Twilio inbound handlers translate provider events into these events.

### 7.4 Connector framework

- **One `integration_connections` table**: org_id, provider, auth type, encrypted tokens, scopes, status, last_sync, last_error, settings JSON. The two existing bespoke tables (Google Calendar, Google Ads) migrate onto it.
- **Provider interface**: `connect()`, `refresh()`, `pull(cursor)`, `push(event)`, `health()`. A runner polls `pull` on a schedule (generalising the Trimble cursor poller, which already advances only after save and dedupes by content hash) and subscribes to events for `push`.
- **Settings UI**: Firm settings > Integrations lists connectors with connect, status, last sync and logs. The operator console shows connector health per firm.
- **Mapping layer**: a small per-connector mapping screen (for accounting: Starr service type to income account, expense category to expense account, tax codes).

### 7.5 Connector roadmap by value

| Order | Connector | Direction | Why this order |
|---|---|---|---|
| 1 | Public API, API keys, outgoing webhooks | out and in | Unlocks everything below, and Zapier/Make with it. |
| 2 | **QuickBooks Online** (then **Xero**) | push invoices, payments, customers, bills and receipts; pull chart of accounts | Almost every firm's first question. The CSV export already shows the data shape. |
| 3 | **Cloud files**: Google Drive, OneDrive/SharePoint, Dropbox, Box | two-way for job folders; watched folder for collector exports | Works for every instrument brand without vendor permission; the universal ingest path from the earlier research. |
| 4 | **Microsoft 365 and Google Workspace** | calendar, mail threads attached to leads and jobs, SSO | Table stakes for office staff. |
| 5 | **SSO**: OIDC and SAML per firm, SCIM | auth | Required by larger firms; sell on the top plan. Use a managed provider rather than hand-built SAML. |
| 6 | **Trimble Connect** (finish and test), **TBC and Carlson presets**, **Leica GSI export** | files plus poll | Instrument-native credibility; Trimble is the only vendor with a viable cloud path. |
| 7 | **Esri ArcGIS** (feature service publish, shapefile) and **Autodesk** (DXF presets, then APS/ACC) | out | Needed for municipal and engineering clients. |
| 8 | **Zapier and Make apps** | triggers from events, actions into the API | Cheap once the API and webhooks exist. |
| 9 | Payroll and HR (Gusto, ADP), Slack/Teams alerts, e-signature | push | Demand-driven. |

### 7.6 What must be true before opening this to other firms

1. Billing works end to end (Stripe products, subscription webhook writing `subscriptions`, trial expiry).
2. Two-firm isolation test passes in CI across all routes, and the public API uses a database role with RLS as a second line.
3. API keys and connector tokens are encrypted per org, with rotation and an audit trail.
4. Tenant data export and delete exist (a firm will ask about leaving before it signs).
5. A platform terms, privacy and subprocessor page exists.

## 8. Rebuild recommendation for the area

Keep: the org-scope proxy, the bundle and API gate logic (including the "unclassified is refused" rule), the tenant profile and membership-based staff test, the idempotent cursor-based ingest design, the rate limiter's policy layer, and the documentation habit around keys.

Rebuild:

1. **Billing and provisioning** as one tested path: Stripe Checkout with trial, subscription webhook writing the firm's `subscriptions` row, reconciliation cron, operator tools, and signup with email verification and a transactional org-creation function.
2. **Public site as data.** Surveying sites render from a firm profile and state content pack; a separate product site (pricing, tour, security, integrations, demo) replaces `/pricing/software`.
3. **Identity** with MFA, per-org roles, SSO on the top plan, and operators in a separate pool; delete `ADMIN_EMAILS`.
4. **Integration platform** (section 7) before individual connectors.
5. **One mail service and one customer-link primitive** to replace nine Resend call sites and four token mechanisms.
6. **Per-firm credentials and budgets** (Stripe Connect, sender domain, phone number, AI and purchase caps) in place of deployment-wide keys.
7. **Split the repo's deployments:** move D&D and the voice studio out; keep the surveying platform's route tree and cron list clean.

Suggested order: billing and signup safety (P1), isolation CI test, mail and per-firm sender, API and events, QuickBooks and cloud files, SSO, then the rest. Platform entries marked P1 in `platform.json` follow this order.

## 9. Plans consulted

`docs/planning/completed/` STARR_SAAS_MASTER_PLAN, MULTI_TENANCY_FOUNDATION, SUBSCRIPTION_BILLING_SYSTEM, OPERATOR_CONSOLE, SUPPORT_DESK, SOFTWARE_UPDATE_DISTRIBUTION, MARKETING_SIGNUP_FLOW, MOBILE_MULTI_TENANT, PLATFORM_AUDIT_AND_LAUNCH_QUESTIONS_2026-07-29 (§1.2, §3c, §3d), plus `docs/planning/BLOCKERS.md` and `docs/platform/*`, `docs/security/*`. Plans that were not read in full are marked "not read" in the JSON. Open items from them that are not built: operator impersonation, billing operations, broadcasts, health page, firm sending domain, usage billing, tax handling, SSO and SAML, Topcon and Leica partnership conversations, aggregate spend cap, platform pricing-page redesign.
