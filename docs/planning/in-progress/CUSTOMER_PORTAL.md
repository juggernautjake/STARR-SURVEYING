# Customer Portal — Planning Document

**Status:** RFC / sub-plan of `STARR_SAAS_MASTER_PLAN.md` §4.1 (the "product end")
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Target repo path:** `docs/planning/in-progress/CUSTOMER_PORTAL.md`

> **One-sentence pitch:** The customer-facing side of the SaaS — the existing `/admin/*` admin shell tenant-scoped + augmented with billing self-service, support contact, user management, in-app notifications, release announcements, and the marketing/signup funnel that gets new firms in the door.

---

## 1. Goals & non-goals

### Goals

1. **Reuse the existing admin shell.** The IconRail + Hub + workspace landings + Cmd+K palette + ProfilePanel + per-tab content (just shipped in the admin-nav redesign) all become the customer's product experience. Don't rebuild — tenant-scope what's there.
2. **Self-service for everything routine.** Sign up, manage payment methods, change plan, invite teammates, file support tickets, dismiss release-note banners, acknowledge maintenance windows — without operator intervention.
3. **A trial-able product.** A new visitor lands on the marketing site, hits "Start free trial", completes signup in <60 seconds, lands inside a working admin shell with their own data sandbox.
4. **Clear bundle gating.** Customers without a bundle hit a graceful upgrade prompt — never a 404 or permission error.
5. **Friction in the right places.** Free-trial signup is fast; downgrading or canceling is one click but with a "are you sure?" gate; user invites require email confirmation; payment-method changes funnel through Stripe Customer Portal (Stripe handles all PCI compliance).
6. **Multi-org for the rare power user.** A surveyor consulting for two firms can switch organizations from the topbar; data stays cleanly scoped.

### Non-goals

- Building a competitor to the existing customer-side admin shell — the work here is *additive* and *scoping*, not net-new UX patterns.
- Customer-to-customer messaging (no public channels, no shared workspaces across orgs).
- Public profile pages or external project sharing — already exists for individual share tokens (`/share/[token]`); not expanding.
- Building our own payments UI when Stripe Customer Portal works (use Stripe's hosted UI for payment-method management; only build what they don't provide).
- White-labeling the product for resellers (a future tier feature; not v1).

---

## 2. Information architecture

Every customer-facing route lives under the chosen tenant URL (recommendation per master plan §3.2: subdomain `[org-slug].starrsoftware.com`). Inside, paths are unchanged from the existing admin shell:

```
/[org-slug].starrsoftware.com/
    /                              Marketing redirect → /admin/me
    /admin/me                      Hub (already shipped)
    /admin/work, /office, …        Workspaces (already shipped)
    /admin/cad/*                   CAD editor (bundle: Draft)
    /admin/research/*              Research/Recon (bundle: Recon)
    /admin/learn/*                 Academy (bundle: Academy)
    /admin/jobs/*, /employees/*…   Office (bundle: Office)
    /admin/billing                 Billing portal             ← NEW
    /admin/billing/payment-methods → redirect to Stripe        ← NEW
    /admin/billing/invoices        Invoice history            ← NEW
    /admin/billing/usage           Usage by bundle            ← NEW
    /admin/users                   User mgmt (org-scoped)     ← EXISTS, rescope
    /admin/users/invite            Send invite                ← NEW
    /admin/users/[email]           User detail + role         ← EXISTS
    /admin/settings                Org settings (rescope)     ← EXISTS
    /admin/support                 Support tickets            ← NEW (see SUPPORT_DESK.md)
    /admin/support/tickets/[id]    Ticket thread              ← NEW
    /admin/announcements           Release notes archive      ← NEW
    /admin/audit                   Org-level audit log        ← NEW (optional, §10)

starrsoftware.com/   (root, no subdomain)
    /                              Marketing home
    /pricing                       Plans + bundle comparison (exists, redesign)
    /services                      Services page (exists)
    /contact                       Contact form (exists)
    /signup                        Multi-step signup wizard   ← NEW
    /accept-invite/[token]         Accept teammate invite     ← NEW
    /reset-password                Password reset             ← NEW
    /docs                          Knowledge base             ← NEW
    /status                        Status page                ← NEW (Phase H+)
    /login                         Public login routing       ← EXISTS, rescope
```

### Topbar adjustments

The customer-side IconRail (shipped slice 3b) gets one new element: an **org switcher** between the brand logo and the workspaces, visible only when the user belongs to ≥2 orgs. Click → dropdown listing orgs → switch. JWT updates; redirect to `/admin/me`.

A **notifications bell** in the rail's `__tools` section (next to the Search button) opens the in-app notification center.

A **billing-issue badge** (red dot) appears on the rail's avatar when the org has an unresolved payment failure — clicking opens `/admin/billing`.

---

## 3. Surfaces (the meat)

### 3.1 Marketing site changes — `/pricing`

The existing `/pricing` page (231 lines) lists 10 surveying services with price ranges. That's the **services pricing** for Starr's own customers, not the SaaS subscription pricing.

For the SaaS launch, the page becomes a hybrid:

```
┌────────────────────────────────────────────────────────────────────┐
│ Plans for Surveying Firms                                            │
│                                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │  Recon   │ │  Draft   │ │  Field   │ │  Office  │ │   Firm   │    │
│ │  $99/mo  │ │ $99/mo   │ │ $49/mo   │ │ $199/mo  │ │  Suite   │    │
│ │ per seat │ │ per seat │ │ per seat │ │ flat 5   │ │ $499/mo  │    │
│ │          │ │          │ │          │ │ seats    │ │  + seats │    │
│ │ Research │ │ CAD      │ │ Mobile   │ │ Business │ │ Everything│   │
│ │ + docs   │ │ + AI eng │ │ field    │ │ mgmt     │ │ + priority│   │
│ │ + adapters│ │ + plots  │ │ + recpts │ │ + payroll│ │ support   │   │
│ │          │ │          │ │          │ │ + sched  │ │           │   │
│ │[Try free]│ │[Try free]│ │[Try free]│ │[Try free]│ │[Try free] │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                                      │
│ All plans: 14-day free trial · No credit card up front · Cancel any  │
│ time.                                                                │
│                                                                      │
│ Compare features ▾                                                   │
│                                                                      │
│ Looking for one-time surveying services from Starr Surveying itself? │
│ → Visit our services page                                            │
└────────────────────────────────────────────────────────────────────┘
```

A second section below — the existing services calculator — remains for Starr Surveying's own customer-services lead capture. Two sections, two audiences, clearly delineated.

**Comparison table** below the cards: every bundle's exact feature list, seat limits, storage, API call quotas, support tier (community / email / priority / phone), etc.

### 3.2 Signup wizard — `/signup`

Four steps. Each is one screen. Back button on each. Progress indicator at top.

**Step 1 — Plan + bundle picker.** Pre-selected from the pricing-page CTA. Show what they picked + monthly/annual toggle (annual = 20% off). Bundle add-ons are checkboxes (start with all the bundles in the picked tier; can toggle off individual ones at this stage).

**Step 2 — Org info.** Org name (required), slug (auto-generated from name, editable). Slug uniqueness checked live. Phone number (optional). State (Texas pre-filled but editable — drives some workflow defaults). Logo upload (optional). Pre-validated against any existing tenant.

**Step 3 — Admin user info.** Email (required), name (required), password (required, with strength meter). MFA setup deferred to first login. **No credit card here** — trial starts post-signup.

**Step 4 — Confirmation.** Summary card showing org + plan + admin user. Big "Create my firm" button. On click:
1. Create org row with `status='trialing'`, `trial_ends_at = now() + 14 days`.
2. Create the admin user with `org_role='admin'`.
3. Stripe customer created (no subscription yet — that happens at trial-end or earlier if they click "Subscribe now").
4. Sign the user in.
5. Redirect to `[org-slug].starrsoftware.com/admin/me` with a welcome banner.

**Idempotency:** if step 4 fails halfway (Stripe API down, etc.), the user can retry without creating duplicate orgs — the slug is reserved + the partially-created row has `status='provisioning'` with a 24h TTL.

### 3.3 Org billing — `/admin/billing`

Lands on the **Overview** sub-tab. Tabs:

- **Overview** — Current plan + bundles, MRR, trial state (if applicable), seat count vs. cap, days until renewal, primary payment method. Top: an action bar with "Change plan" + "Add bundle" + "Manage payment methods" (→ Stripe Customer Portal) + "Cancel subscription".
- **Invoices** — Table of every paid + open invoice. Status badges. Download PDF link (Stripe-hosted). Past-due invoices are amber + at the top.
- **Usage** — Per-bundle usage charts: research reports this month, CAD render minutes, mobile sync count, AI tokens, storage. Per-bundle quotas shown with bar fill. Quota-exhausted state shows an "Upgrade for more" CTA.
- **Plan history** — Audit-like view of plan changes, additions, removals. Filters by date range.

**Plan-change flow:**
1. User clicks "Change plan" → modal with current plan card + side-by-side comparison.
2. Pick new plan (upgrade or downgrade), pick monthly/annual.
3. See proration preview (Stripe API gives the exact cents).
4. "Confirm change" → calls Stripe API → webhook fires → local state updates → toast confirms.
5. If new plan removes a bundle the user currently relies on (e.g., they have data only available via Office, downgrading to Field would orphan that data): warn loudly + offer "export your data first" workflow before allowing the downgrade.

**Cancellation flow:**
1. "Cancel subscription" → confirmation modal.
2. Optional reason picker (5 common reasons + "Other" with text input). Used for cohort analysis.
3. Two-step confirmation. "Are you sure? Your data is preserved for 30 days; after that it's deleted permanently."
4. Stripe subscription canceled (at period end, not immediately — they keep access through what they've paid for).
5. Confirmation email.
6. Org status flips to `canceled` at period end; access read-only for 30 days; permanent deletion at day 60 with email warnings on days 30, 50, 59.

### 3.4 User management — `/admin/users`

Currently exists (`app/admin/users/page.tsx`) for Starr employee management. Rescoped:

```
┌────────────────────────────────────────────────────────────────────┐
│ Users · 12 active / 15 seat cap   [+ Invite user] [Manage seats]    │
├────────────────────────────────────────────────────────────────────┤
│ Filter: Role ▾  Status ▾  Last seen ▾   [Search...]                  │
├────────────────────────────────────────────────────────────────────┤
│  Name             Email                Role        Last seen        │
│ ────────────────────────────────────────────────────────────────────│
│  Alice Carter     alice@acme.com       Admin       2h ago           │
│  Bob Smith        bob@acme.com         Surveyor    just now         │
│  Carol Johnson    carol@acme.com       CAD Lead    Pending invite   │
│  Dave Lee         dave@gmail.com       Surveyor    3d ago           │
│  …                                                                   │
└────────────────────────────────────────────────────────────────────┘
```

**Invite flow:**
1. "Invite user" → modal with email (required), role (default: surveyor), bundle access (defaults to org's full bundle set; can restrict per-user later).
2. Email sent via Resend with a magic-link inviting them to join the org.
3. Recipient clicks link → `/accept-invite/[token]` → sees org name, role they'll get, who invited them. "Accept" creates their account if needed, joins them to the org.
4. If they already have a Starr Software account (from another org or solo signup), invite asks "Add this org to your account" — no new account.

**Role model (org-scoped, separate from operator roles):**
- `admin` — every customer-side surface incl. /admin/billing, /admin/settings
- `surveyor` — field + CAD + research; no admin / billing / settings
- `bookkeeper` — billing-only access (for firms where the office manager isn't the same person as the survey lead)
- `field_only` — mobile + receipts + their own jobs; no admin
- `view_only` — read access to anything they're explicitly granted

These are independent of the existing `UserRole` global union (used internally by Starr today); the customer-side `OrgRole` is per-membership.

### 3.5 Org settings — `/admin/settings`

Currently exists (`app/admin/settings/page.tsx`). Rescoped + expanded:

- **General** — Org name (display + slug), logo, primary admin contact email, phone, timezone, default state (Texas/etc.).
- **Security** — Domain restriction toggle: if on, only `@acme.com` email addresses can be invited. MFA-required toggle for all users. Session timeout.
- **Billing contact** — Email recipient for billing notifications (separate from primary admin).
- **Branding** — Custom logo for reports + emails. Optional brand color (used in their generated PDFs only, not the app chrome — too much white-label work for v1).
- **Integrations** — Future home for API keys, webhooks, Slack / Teams notifications. Empty for v1; just a placeholder section.
- **Data** — "Export everything" button (async — emails a zip download link). "Delete this org" (admin-only, two-step confirmation, 30-day grace).

### 3.6 Bundle-gated routes

Customers without a bundle hit a graceful gate. Implementation extends `lib/admin/route-registry.ts` with `requiredBundle?: BundleId`. Middleware checks: does the org's active subscription include this bundle? If no, redirect to:

```
/admin/billing/upgrade?requiredBundle=cad&returnTo=/admin/cad
```

**Upgrade prompt page:**

```
┌────────────────────────────────────────────────────────────────────┐
│  🔒 CAD Editor is in the Draft bundle                                │
│                                                                      │
│  You're currently on Office ($199/mo). The CAD Editor is part of    │
│  the Draft bundle ($99/mo) or available with Firm Suite ($499/mo).  │
│                                                                      │
│  [Add Draft to your plan]  [Compare Firm Suite]  [Talk to sales]    │
│                                                                      │
│  Add-on takes effect immediately. Pro-rated for the current period. │
└────────────────────────────────────────────────────────────────────┘
```

"Add Draft to your plan" is a one-click — Stripe API call, sub item appended, prorated, toast confirms, redirect to original URL. The friction is in the gate-visibility (clear what's locked) not the unlock flow (one click).

### 3.7 Support — `/admin/support`

Detailed in `SUPPORT_DESK.md` (future sub-plan). Summarized here:

```
┌────────────────────────────────────────────────────────────────────┐
│ Support · [+ New ticket]                  [Search knowledge base]    │
├────────────────────────────────────────────────────────────────────┤
│ My tickets · 2 open · 5 closed                                       │
│                                                                      │
│  T-0042   CAD export to DXF crashes        Awaiting reply  · 2h ago │
│  T-0039   How do I bulk-import jobs?       Open            · 1d ago │
│  T-0035   (Closed) Password reset issue                             │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

Click → ticket thread. Reply with file attachments. Mark resolved (closes; can reopen within 7 days).

Knowledge-base search (powered by /docs articles) at the top.

### 3.8 In-app notifications

Bell icon in the rail's `__tools` section. Click → panel slides in from the right showing:

- Unread badge count on the bell
- Tabbed: All / Releases / Billing / Support / System
- Each item: icon + message + timestamp + (sometimes) action button (e.g. "Open ticket", "View invoice")
- Mark all as read

Stored in `notifications(id, org_id, user_email, type, payload jsonb, read_at, dismissed_at, created_at)`. Real-time via the existing WebSocket plumbing (`/api/ws/ticket` extends to a generic per-user channel).

**Notification triggers** (customer-side; operator-side triggers in OPERATOR_CONSOLE.md):

| Event | Visible to | Channel |
|---|---|---|
| Trial ending in 3 days | Org admins | In-app + email |
| Payment failed | Org admins | In-app + email |
| Plan changed | All org users | In-app |
| New release available (per org's bundle) | All org users | In-app banner on Hub |
| Support ticket reply | Ticket creator | In-app + email |
| New user invited | Invitee | Email (no in-app — they haven't joined yet) |
| User joined org | All org admins | In-app |
| User role changed | The user | In-app + email |
| Maintenance window scheduled | All org users | In-app banner + email |
| Critical security alert | All org admins | In-app + email + (optional) SMS |
| Quota approaching limit (80% / 100%) | Org admins | In-app + email |

### 3.9 Release announcements — `/admin/announcements`

Archive of every operator-pushed release / broadcast. List view:

```
┌────────────────────────────────────────────────────────────────────┐
│ What's new                                                           │
├────────────────────────────────────────────────────────────────────┤
│ v2.4.0 · 2026-05-13 · CAD bundle                          [Read]    │
│   New: AI-suggested annotations · Bug: DXF export fixed             │
│                                                                      │
│ v2.3.2 · 2026-05-11 · All bundles                         [Read]    │
│   Bug: Login redirect loop on Safari                                 │
│                                                                      │
│ Maintenance · 2026-05-08 · 2:00-2:30 UTC                            │
│   Database migration                                                 │
└────────────────────────────────────────────────────────────────────┘
```

Item detail = full Markdown release notes. Linked from the in-app banner that fires on version bump (master plan §5.5).

Customer can opt-in to email digest (defaults to in-app only).

### 3.10 Audit log — `/admin/audit` (optional)

Per master plan §10 deferred-question 6 (operator console): whether customers see their org's audit log.

**Recommendation: ship it.** Surveyors are security-conscious; an "I can see what happened in my account" surface is valuable. Filters: actor (any user in this org), action type, date.

Implementation: same `audit_log` table from OPERATOR_CONSOLE.md; customer-side query is `WHERE org_id = current_user.org_id` and excludes events with `customer_visible=false` (e.g. internal operator-only metadata).

---

## 4. Auth flows

### 4.1 New user signup (org founder)

Covered in §3.2. Lands them on `/admin/me` of the new tenant.

### 4.2 Invited user joining

1. Email link → `/accept-invite/[token]?org=acme&role=surveyor`
2. Token validated server-side. If valid + not expired (default: 7 days):
3. Show org name, role being granted, inviter's name.
4. If user has an existing account → "Add Acme Surveying to your account" → join + redirect.
5. If user is new → present registration form (email pre-filled, can't change) + name + password.
6. Create user, add to org, sign in, redirect.

### 4.3 Existing user signing in

NextAuth flow (Google / credentials), unchanged except:
- After successful auth, if user belongs to 1 org → set as active, redirect to `[org-slug].starrsoftware.com/admin/me`.
- If user belongs to 2+ orgs → org-picker page → pick → redirect.
- If user belongs to 0 orgs → `/signup` (orphaned user — probably had account but org canceled).

### 4.4 Password reset

1. `/reset-password` → email entry.
2. Email sent (Resend) with magic link.
3. Link → password reset form (one-time use).
4. Update password, sign in.

### 4.5 Switching org

Active-org-picker dropdown in the topbar (visible only when user has ≥2 orgs). Click → JWT updates → redirect to new org's `/admin/me`.

### 4.6 SSO (deferred to Enterprise tier)

`MULTI_TENANCY_FOUNDATION.md` notes the architecture supports SAML / OIDC per-org via NextAuth's flexibility. Not v1.

---

## 5. Data model additions

Beyond what `MULTI_TENANCY_FOUNDATION.md` defines, the customer-portal-specific tables:

```sql
-- Invitations to join an org
CREATE TABLE org_invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inviter_email     TEXT NOT NULL,
  invitee_email     TEXT NOT NULL,
  role              org_role_enum NOT NULL DEFAULT 'surveyor',
  bundle_overrides  TEXT[] DEFAULT NULL,        -- if null, defaults to org's full bundle access
  token             TEXT UNIQUE NOT NULL,
  status            TEXT DEFAULT 'pending',     -- pending / accepted / expired / revoked
  expires_at        TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  accepted_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_org_invitations_token ON org_invitations(token);
CREATE INDEX idx_org_invitations_pending ON org_invitations(invitee_email) WHERE status = 'pending';

-- Cached subscription state (Stripe is source of truth)
-- Already exists as research_subscriptions; expanded for firm-level
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL UNIQUE REFERENCES organizations(id),
  stripe_subscription_id TEXT UNIQUE,
  status              TEXT NOT NULL,             -- trialing / active / past_due / canceled / paused
  trial_ends_at       TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end  TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at         TIMESTAMPTZ,
  bundles             TEXT[] NOT NULL DEFAULT '{}',  -- ['cad', 'office', 'recon']
  seat_count          INT NOT NULL DEFAULT 1,
  base_price_cents    INT,
  per_seat_price_cents INT,
  metadata            JSONB DEFAULT '{}',
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- In-app notifications
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_email  TEXT,                          -- null = sent to every user in org
  type        TEXT NOT NULL,                 -- release / billing / support / system
  severity    TEXT DEFAULT 'info',
  title       TEXT NOT NULL,
  body        TEXT,                          -- Markdown
  action_url  TEXT,                          -- optional CTA link
  action_label TEXT,
  payload     JSONB DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_email, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX idx_notifications_org ON notifications(org_id, created_at DESC) WHERE dismissed_at IS NULL;

-- Per-user release-note acknowledgement
CREATE TABLE release_acks (
  user_email TEXT NOT NULL,
  release_id UUID NOT NULL,
  acked_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_email, release_id)
);
```

---

## 6. Phased delivery

Each phase tied to the master plan's Phase A-D outline. Numbering picks up "D" since this sub-plan = master plan's Phase D ("self-serve signup + onboarding") plus the per-tenant surfaces from Phase A/B/C.

### Phase D-1 — Signup wizard + org provisioning (1.5 weeks)
- `/signup` four-step flow per §3.2
- Org creation API
- Resend transactional email templates: welcome, invite-pending
- Idempotency on partial signup
- *Acceptance:* anyone can sign up for a 14-day trial; ends up in `/admin/me` of their new tenant.

### Phase D-2 — Billing portal (1.5 weeks)
- [x] `/admin/billing` Overview — current plan, status (color-coded), monthly price, seats, trial-end + renewal dates, cancel-at-period-end warning, active bundles, action grid (Contact support live; others stubbed)
- [x] `/api/admin/billing` GET — returns org + subscription state
- [x] Invoices tab — `app/admin/billing/invoices/page.tsx` + `/api/admin/billing/invoices` (shipped earlier slice)
- [x] Plan history tab — `app/admin/billing/plan-history/page.tsx` + `/api/admin/billing/plan-history` (renders every subscription_events row with color-coded event pill, triggered-by attribution, expandable metadata JSON; tab added to `/admin/billing` nav)
- [ ] Usage tab — deferred (gated on the per-bundle usage_events ingestion path; meter aggregation lands with B-7 of SUBSCRIPTION_BILLING_SYSTEM.md)
- [x] Stripe Customer Portal integration — `/api/admin/billing/customer-portal` endpoint (admin-gated; returns 503 with friendly "billing pending" message until `STRIPE_SECRET_KEY` + `subscriptions.stripe_customer_id` are both populated; real Stripe session creation lands with B-5 of SUBSCRIPTION_BILLING_SYSTEM.md). UI: "Update payment method" button now enabled and POSTs to this endpoint.
- [ ] Plan-change flow with proration preview — `/api/admin/billing/change` endpoint
- [x] Cancellation flow with 30-day grace — `/api/admin/billing/cancel` endpoint (admin-gated; toggles `cancel_at_period_end`; writes `subscription_events` row + audit_log entry; UI: "Cancel subscription" / "Reactivate subscription" button on `/admin/billing` opens a confirm + posts; access continues until `current_period_end` per master plan §6).
- *Acceptance partial:* customer sees their plan + status; action buttons present but disabled with explanatory text until Stripe-side flows ship.

### Phase D-3 — User management + invites (1 week)
- `/admin/users` rescoped per §3.4 — deferred behind M-9 (the legacy /admin/users page is Starr-roles-only; rescoping needs org-aware session)
- [x] Invite composer + list + revoke — `app/admin/invites/page.tsx` (admin-only page; email + role dropdown; pending/accepted/revoked/expired badges; revoke action) + `app/api/admin/invites/route.ts` (admin-gated; GET lists org's last 100 invites; POST creates random URL-safe token + dispatches invite_sent email + audit_log) + `app/api/admin/invites/[id]/route.ts` (revoke pending; audit_log).
- `/accept-invite/[token]` web acceptance page — deferred behind M-9 (needs ability to create-or-link a registered_users row and immediately set activeOrgId to the new org's id in the JWT)
- [x] Email templates for invites — INVITE_SENT lives in `lib/saas/notifications/templates.ts`
- *Acceptance partial:* admin can compose + send invites and revoke pending ones. Acceptance side waits on M-9.

### Phase D-4 — Org settings + branding (1 week)
- [x] `/admin/org-settings` admin-only page — name + slug (read-only) + state + phone + billing-contact + default invite role + session-timeout + MFA-required toggle + webhook URL. `app/api/admin/org-settings/route.ts` (GET + PATCH; admin-gated; upserts org_settings row; audit_log entry on every save). Parked at `/admin/org-settings` rather than `/admin/settings` because the legacy `/admin/settings` is Starr-internal; URL canonicalization defers to M-10 component rescoping.
- [ ] Domain restriction enforcement at invite + signin time — deferred (requires NextAuth signIn callback edits that conflict with M-9 auth refactor; the field is captured for invite-side validation but not yet enforced).
- [ ] Logo upload + storage — deferred (needs a per-org Supabase Storage bucket + signed-URL plumbing; logos surface only on customer-facing PDFs which aren't org-branded yet).
- [ ] Export + delete flows — deferred (the data-export pipeline lands with B-9 of SUBSCRIPTION_BILLING_SYSTEM.md; org deletion is operator-only via /platform/customers until then).
- *Acceptance partial:* admin can change org name, default invite role, and operational defaults. Domain restriction + logo + export/delete remain.

### Phase D-5 — Bundle gating (1 week)
- [x] Route-registry extension with `requiredBundle` field (already shipped earlier slice)
- [x] Bundle-resolution helper `lib/saas/bundle-gate.ts` with workspace defaults + per-route overrides + Firm Suite implication; 21 vitest cases lock the resolution
- [ ] Middleware check (gated on Phase A M-9 — JWT must carry activeOrgId + bundles before middleware can read them)
- [x] `/admin/billing/upgrade?requiredBundle=…` graceful gate page UI — shipped as `app/admin/billing/upgrade/page.tsx`. Reads bundle from query param, renders bundle metadata (label + tagline + monthly/annual pricing), CTAs to /admin/billing + return-to link, support-email fallback. Stripe one-click upgrade flow itself ships with Phase D-2 billing portal scaffold.
- [x] Per-route bundle audit — `ROUTE_BUNDLE_OVERRIDES` map in `bundle-gate.ts` documents every customer-facing route's bundle (Hub + always-available routes return null; research-cad workspace's split into recon/draft/operator-only is explicit per-route; rest derive from `WORKSPACE_DEFAULT_BUNDLE`)
- *Acceptance:* `bundleForRoute('/admin/cad')` returns `'draft'`, `canAccessRoute({ pathname: '/admin/jobs', bundles: ['recon'] })` returns false, all locked by tests.

### Phase D-6 — In-app notifications (1 week)
- [x] `org_notifications` table + dispatcher write-path (seeds/267 + lib/saas/notifications/in-app.ts)
- [x] `/api/admin/org-notifications` GET/PATCH/DELETE API — lists user-targeted + org-wide unread; marks read (single or all); dismisses (soft-delete via dismissed_at)
- [ ] WebSocket fan-out — deferred to follow-up; the panel polls every 30s, which is the simplest fan-out that satisfies the panel's interaction shape (the per-user WS channel design crystallizes when sub-second freshness becomes a requirement)
- [x] In-app notification consumer — `HubNotifications` panel on `/admin/me` (icon + severity-color treatment + unread badge + mark-all-read + dismiss + action link); 30s polling on the API; legacy `NotificationBell` stays for Starr-internal events. Unified bell icon in the rail awaits M-10 component rescoping.
- [x] Templates for each event type — file-default templates in lib/saas/notifications/templates.ts + DB overrides via loadTemplate()
- *Acceptance partial:* dispatch writes to the table; API serves listed / read / dismissed state. Bell-icon UI consumer remains.

### Phase D-7 — Release-notes drawer (3 days)
- [x] Version-bump detection — `app/api/app/version/route.ts` returns `latestRelease` per user (G-4 partial)
- [x] "What's new in v2.4" banner on Hub — `app/admin/me/components/WhatsNewBanner.tsx` (G-4 complete)
- [x] `/admin/announcements` archive — `app/admin/announcements/page.tsx` + `app/api/admin/announcements/route.ts` filters releases by user's org bundles, renders Markdown-formatted release notes grouped by release type, supports ?id=<release-id> deep linking
- *Acceptance:* operator publishes a release; all customers see the banner; dismissal persists in localStorage; archive page shows history filtered by their bundles. ✓ (waits on the operator-side release composer at /platform/releases to actually publish)

### Phase D-8 — Org switcher (3 days)
- Topbar dropdown for multi-org users
- JWT active-org-id update
- Smooth redirect
- *Acceptance:* a user with 2 orgs can flip between them in one click; data isolation holds.

### Phase D-9 — Customer audit log (3 days)
- [x] `/admin/audit` page rendering table view with severity color coding + expandable metadata JSON
- [x] Search + severity filter (client-side over 200-row window)
- [x] `/api/admin/audit` server route — admin-role check + org-scoped query, 500-row cap
- *Acceptance shipped:* org admin sees their org's audit trail; non-admin org members see an empty list (defense in depth).

### Phase D-10 — Marketing pricing page + signup CTA (1 week)
- [x] SaaS bundle pricing tiles + "Start free trial" CTA — `app/pricing/software/page.tsx` (one card per bundle from `BUNDLES`, monthly + annual-per-month price, included-seats / per-seat-overage callouts, Firm Suite gets a "Most popular" badge + implication checklist, CTA links to `/signup?bundle=<id>` so the wizard preselects). URL parked at `/pricing/software` rather than `/pricing` because the legacy `/pricing` still serves the surveying-services price list; the marketing-site rework that swaps them (move services → `/services/pricing`, software → `/pricing`) is its own follow-up.
- Compare-features table — deferred (the per-card implication list covers the core comparison; a full feature matrix is a marketing-site rework).
- *Acceptance shipped:* a visitor clicks the pricing CTA and is at the signup wizard with the bundle preselected. ✓

**Total: ~10 weeks engineering.**

---

## 7. Open questions

Beyond master plan §10:

1. **Org-side role granularity.** Five roles in §3.4 (admin/surveyor/bookkeeper/field_only/view_only). Recommend yes. Alternative: simpler 3-role (admin / member / viewer) and lean on bundle-level access.
2. **Org slug renaming.** Allowed after signup? Recommendation: yes, with cooldown (3 months between changes) — slug is a URL component, churn pollutes search indexing.
3. **Custom logo on reports vs. admin chrome.** Recommend: reports get it, admin chrome stays Starr-branded (so users in 5 different orgs remember which product they're using). Alternative: full white-label for Firm Suite tier.
4. **Customer-side audit log default visibility.** All org users see it, or admin-only? Recommend admin-only — non-admins don't usually care, and exposing the audit log to all users surfaces sensitive things (role changes, etc.).
5. **Mobile invite acceptance.** Should `/accept-invite/[token]` work on mobile (deep-link into Starr Field app)? Recommend yes via Expo deep links; defers to `MOBILE_MULTI_TENANT.md`.
6. **What happens to existing Starr Surveying users at migration time?** Recommend: silent migration — every existing `registered_users` row gets `org_id = starr_org_id` + `org_role` mapped from their existing `roles`. No customer-side action required. Email announcement explains the new product chrome.
7. **Trial expiration cliff.** If trial ends + no payment method on file, what's the UX? Recommend: 7-day grace period where access is read-only + a top-banner CTA to add payment. After grace, log-in redirects to a "your trial ended, add payment to continue" page; no actual deletion.

---

## 8. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Signup wizard converts at 1% instead of 10% | Medium | A/B test pricing + CTA copy via the feature-flag system; analyze drop-off per step in PostHog/equivalent |
| Trial-end churn cliff is brutal | Medium | 7-day grace + email nudges on days 11, 13, 14; in-app trial-countdown banner from day 10 onward |
| User in 2 orgs accidentally creates content in the wrong one | High | Always show org name prominently in the topbar; active-org-confirmation modal on first session of a new browser; audit logs the org per action |
| Domain restriction locks out legitimate users (e.g. their personal Gmail) | Medium | Allow domain-restriction exemptions per-user from admin settings |
| Invite link is forwarded + opened by unintended recipient | High | One-use token; invite-email-only verification (recipient must arrive logged-in or proves email at acceptance); audit on each acceptance |
| Customer changes plan mid-period; proration is confusing | Medium | Always show "Your card will be charged $X today, then $Y/month going forward" in plan-change preview before commit |
| Customer cancels in anger; comes back next week | Low | 30-day grace + reactivate-from-canceled flow keeps data warm |
| Storage / quota enforcement is too aggressive and blocks active work | Medium | Soft-cap with banner at 80%; hard-cap only on free tier; paid tiers always allow overage with billing alert |
| Multi-org JWT confusion (signed for wrong org) | Critical | JWT carries explicit `active_org_id`; server-side double-check on every authenticated request; mismatch fails the request loudly |

---

## 9. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §4.1 — customer-facing surfaces overview
- `OPERATOR_CONSOLE.md` §3.4 — impersonation flow (the operator-side view of the customer's customer-portal)
- `SUPPORT_DESK.md` (TBD) — `/admin/support` ticket UX in detail
- `MULTI_TENANCY_FOUNDATION.md` (TBD) — `organizations` + `organization_members` + RLS — the foundation this builds on
- `SUBSCRIPTION_BILLING_SYSTEM.md` (TBD) — billing pipeline detail
- `MARKETING_SIGNUP_FLOW.md` (TBD) — signup-flow detail beyond what's in §3.2
- `docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md` — IconRail + Hub + workspace landings + Cmd+K are the reused customer-side foundation
- `app/admin/me/components/HubGreeting.tsx` — adds the org-name display + (eventually) the bundle-state widget
- `lib/admin/route-registry.ts` — extends with `requiredBundle?: BundleId`

---

## 10. Definition of done

The customer portal is complete when:

1. A stranger can land on `starrsoftware.com/pricing`, click a CTA, complete signup in <60 seconds, land in `[their-slug].starrsoftware.com/admin/me` with a working 14-day trial.
2. Customer admin can manage subscription self-serve: upgrade, downgrade, add bundle, cancel, reactivate — all without operator help.
3. Customer admin can invite teammates by email; invitee accepts and is in the org with the right role + bundle access.
4. Customer admin can change org name, set domain restriction, upload logo, export data, schedule org deletion.
5. Every existing `/admin/*` route checks bundle access; uncovered routes route to a graceful upgrade prompt instead of a 404.
6. In-app bell icon shows notifications for releases, billing events, support replies, system events.
7. Hub greeting shows the org-context banner ("Acme Surveying") + new-release banner when one is published.
8. `/admin/announcements` shows the release history for the customer's bundles.
9. Multi-org users can switch via the topbar; active-org JWT updates; no cross-org data leak.
10. Trial-end + payment-fail flows lead to graceful degraded states, not hard lockouts.
11. The customer-side audit log at `/admin/audit` works for org admins.
12. Mobile app honors the org context + bundle gates; deep links from invite emails resolve correctly.
13. Every customer-facing email (welcome, invite, plan-change, payment-failed, trial-ending, release announcement) ships via Resend with a working template.
14. The marketing site's pricing page reflects the live bundle catalog; CTAs all work.
15. Zero hardcoded "Starr Surveying" strings in customer-facing chrome (their org name + brand show consistently).
