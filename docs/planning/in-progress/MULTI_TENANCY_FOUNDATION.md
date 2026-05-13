# Multi-Tenancy Foundation — Planning Document

**Status:** RFC / sub-plan of `STARR_SAAS_MASTER_PLAN.md` §3 — locks the architecture decisions every other sub-plan depends on
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Target repo path:** `docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md`

> **One-sentence pitch:** Convert the single-tenant Starr Surveying codebase to a multi-tenant SaaS by adding an `organizations` table + `org_id` column on every customer-data table + Postgres Row-Level Security policies, while keeping today's Starr Surveying users + data working without disruption.

---

## 0. Decisions locked

Per master plan §10, several open questions block downstream work. This doc locks **architectural** decisions (with my recommendations) so downstream sub-plans have firm ground. Operator can override any of these by editing this section — but the recommendations stand until then.

| Q | Decision | Rationale |
|---|---|---|
| **Q1 — Tenancy model** | **Shared DB + Postgres RLS + `org_id` column on every tenant table** | Lowest operational overhead; scales to thousands of tenants; tooling mature; cross-tenant operator aggregation is trivial. Risks (RLS misconfig leak) mitigated by automated isolation tests + mandatory review. Future Enterprise tier can pin a customer to a private Supabase project. |
| **Q2 — URL strategy** | **Subdomains** (`acme.starrsoftware.com`) with custom-domain as a **Firm Suite** tier add-on | Standard SaaS pattern; Vercel supports wildcard subdomains; trust signal. Custom-domain provisioning is the Firm Suite differentiator. |
| **Q7 — Brand identity** | **"Starr Software" stays the platform brand** | Existing brand has equity. Product name is "Starr Software Suite" or per-bundle ("Starr Recon", "Starr Field", etc.). Future flexibility: white-label add-on for resellers in a later tier. |
| **Q8 — Starr Surveying's data fate** | **Tenant #1 of own SaaS, silent migration** | Backfill every existing row to `org_id = starr_org_id`; map existing roles to new `org_role` per user; no user-side action required. |

The remaining master-plan questions (Q3 bundle composition, Q4 pricing structure, Q5 support build-vs-buy, Q6 desktop client, Q9 GTM window, Q10 operator team size) don't gate this foundation — they affect downstream sub-plans (billing, support) but not the org / RLS layer. Recommendations remain master-plan defaults.

---

## 1. Goals & non-goals

### Goals

1. **Tenant isolation that's airtight by default.** Every customer-data query passes through RLS; bypassing it requires explicit use of `supabaseAdmin` in a reviewed code path.
2. **No data loss or downtime** during migration. Starr Surveying continues to operate every minute of the transition.
3. **Cleanly composable with downstream sub-plans.** Subscription / billing / operator-console / customer-portal sub-plans all extend this foundation without re-architecting.
4. **Per-org configuration is real, not nominal.** Domain restriction, branding, feature flags, default roles — all per-org settings actually take effect.
5. **Mobile parity from day one.** Mobile session carries `active_org_id` + bundle gates apply equally.

### Non-goals

- Per-tenant database isolation (rejected per Q1 — Enterprise tier deferred).
- Per-tenant schema (rejected per Q1).
- SSO (SAML / OIDC) — Enterprise tier deferred.
- Per-tenant region / data-residency — Enterprise tier deferred.
- Hosting tenants on separate Vercel projects — single project, multi-tenant routing.
- "Soft delete" of organizations on cancel — that's a customer-portal concern, not a foundation concern.

---

## 2. Current state (single-tenant assumptions to be removed)

Summary of `STARR_SAAS_MASTER_PLAN.md` §2.1 with file:line specifics for the migration. Audit findings reproduced for self-containment:

### 2.1 Code-side single-tenant assumptions

**`lib/auth.ts`** — the highest blast radius:
- L63-67: `ADMIN_EMAILS` array hardcodes 3 Starr addresses → moves to `operator_users` table (per OPERATOR_CONSOLE.md §5)
- L71: `ALLOWED_DOMAIN = 'starr-surveying.com'` → deleted entirely; per-org `domain_restriction` setting replaces it
- L159: auto-approval check based on `endsWith(ALLOWED_DOMAIN)` → deleted; auto-approval becomes per-org-invite-acceptance
- L265-268: `isCompanyUser()` → renamed / repurposed; per-org concept is `isOrgAdmin(user, orgId)` + bundle-level access
- L348: Google sign-in provider blocks non-domain emails → unblocked; signup flow handles new external users via `/signup`
- L94-109: `getUserRolesFromDB()` queries `registered_users` by email only → gains `org_id` parameter; returns per-org `org_role` instead of global `role`
- L115-202: `ensureRegisteredUser()` inserts to `registered_users` → split into (a) ensure user exists + (b) ensure user is a member of an org; org membership is separate
- `types/next-auth.d.ts` — session/JWT shape gains `active_org_id`, `org_role`, `bundle_access[]`, `is_operator` boolean

**`lib/admin/route-registry.ts`** — already extends cleanly:
- L208-213: `accessibleRoutes()` accepts `isCompanyUser: boolean` → replaced by `{ orgRoles: OrgRole[], bundles: BundleId[] }` shape
- `AdminRoute` interface gains `requiredBundle?: BundleId` (per CUSTOMER_PORTAL.md §3.6)
- L62-74: role-group constants (`WORK_ROLES`, etc.) → these become per-bundle gates; e.g. WORK_ROLES = ['admin', 'field_crew'] in the customer-side roles → simpler

**API routes** (`app/api/admin/*`) — every route handler today fetches data globally via `supabaseAdmin`:
- Existing pattern: `supabaseAdmin.from('jobs').select('*')`
- Target pattern: either (a) use a tenant-scoped Supabase client that respects RLS, OR (b) explicitly filter `WHERE org_id = currentOrgId` (operator-side cross-tenant uses supabaseAdmin)
- 100+ route handlers affected (rough estimate)

**Components** that consume `isCompanyUser`:
- `AdminSidebar.tsx:79` (now under the V2 nav, used as fallback)
- `WorkspaceLanding.tsx:35,40`
- `WorkspaceFlyout.tsx:46,49`
- `CommandPalette.tsx:63-79`
- `dashboard/page.tsx:42` and dozens of conditional renders
- → all consume from the new `useOrgContext()` hook with `org`, `orgRole`, `bundles`, `isOperator` fields

**Hardcoded firm identity** (~30+ surfaces enumerated in master plan §2.1):
- All literal "Starr Surveying" / "starr-surveying.com" strings → use `org.name` / `org.contact_email` / `org.slug` from context
- Public logos in `/public/logos/` → kept for marketing site (Starr Software brand); per-tenant logos in Supabase Storage
- Mobile bundle ID `com.starrsoftware.starrfield` → unchanged (single app for all tenants, brand is "Starr Field" at the OS level)

**Mobile (`mobile/`)**:
- `mobile/lib/auth.tsx` — Supabase session today; gains `active_org_id` in the session payload
- Every `useEffect` that fetches data — adds `org_id` to the request
- `mobile/lib/supabase.ts` — single client; uses RLS, no client-side `supabaseAdmin`

### 2.2 DB-side single-tenant assumptions

Every customer-data table is flat. Inventory (high-confidence list from the audit):

| Table | Action | Notes |
|---|---|---|
| `registered_users` | Add `default_org_id` column (the org they primarily belong to); split membership into `organization_members` | A user can be in multiple orgs; default is for landing-page redirect |
| `jobs` | Add `org_id NOT NULL` | Backfill all to Starr's id; RLS policy |
| `employees` | Add `org_id NOT NULL` | Same |
| `field_data_points` | Add `org_id NOT NULL` | Same |
| `equipment` (catalogue + all equipment_* sub-tables) | Add `org_id NOT NULL` | Same |
| `vehicles` | Add `org_id NOT NULL` | Same |
| `research_projects` | Add `org_id NOT NULL` | Same |
| `research_documents`, `research_*` ancillaries | Add `org_id NOT NULL` | Same |
| `research_subscriptions` | Migrate to `subscriptions` table per CUSTOMER_PORTAL.md §5; legacy table archived | Per-user → per-org |
| `document_wallet_balance` | Migrate to `org_wallet_balance` | Per-user → per-org |
| `document_purchase_history` | Add `org_id` (the org that purchased) | |
| `payroll_*` (every payroll-related table) | Add `org_id NOT NULL` | Same |
| `receipts` | Add `org_id NOT NULL` | Same |
| `learning_*` (curricula, articles, quizzes, etc.) | **Tricky** — see §2.3 | Content is shared by Starr Software; user progress is per-org |
| `messages`, `discussions`, `notes` | Add `org_id NOT NULL` | Same |
| `notifications` (existing internal) | Add `org_id` | Same |
| `error_log` | Add `org_id` (nullable for system-side errors) | Cross-tenant queryable via operator console |
| `audit_log` (new from OPERATOR_CONSOLE.md) | Has `org_id` from creation | |
| `analytics_events` (if exists) | Add `org_id` | |

### 2.3 Content tables (the "shared content" question)

Three categories of data:

(a) **Tenant data** — every row belongs to one org. Most tables. Direct `org_id` column.

(b) **Platform content** — owned by Starr Software, consumed by all tenants (Knowledge Base articles, default learning curricula, default equipment templates, default research adapters). No `org_id`; readable by all authenticated users.

(c) **Tenant-overridable platform content** — an org can fork a platform article / template for their own use. Tenant version has `org_id`; platform version doesn't. Query layer prefers tenant version when both exist.

Specifically for `learning_*`:
- `articles`, `modules`, `quizzes` — Platform content. Read by all. Operator-only write.
- `learning_progress`, `quiz_attempts`, `module_completions` — Tenant data. Per-user, per-org.
- `learning_credits` (if exists) — Tenant data.
- `fieldbook_entries` — Tenant data.

This shape needs explicit tagging in the DB schema. Proposed: `learning_articles.platform_owned BOOLEAN DEFAULT true` + nullable `org_id`. Where `platform_owned=true`, the row is platform content; where false, it's a tenant fork.

---

## 3. Target schema

### 3.1 Core multi-tenant tables

```sql
-- ── Organizations ─────────────────────────────────────────────────
CREATE TABLE organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  CITEXT UNIQUE NOT NULL,    -- 'acme-surveying', 5-40 chars, [a-z0-9-]
  name                  TEXT NOT NULL,             -- 'Acme Surveying & Mapping, LLC'
  status                TEXT NOT NULL DEFAULT 'trialing',
                        -- trialing / active / past_due / canceled / paused / pending / suspended
  state                 TEXT,                       -- 'TX', primary US state of operation
  country               TEXT DEFAULT 'US',
  primary_admin_email   TEXT NOT NULL,
  billing_contact_email TEXT,
  phone                 TEXT,
  logo_url              TEXT,
  brand_color           TEXT,
  domain_restriction    TEXT,                       -- if set, invites only @<this domain>
  custom_domain         TEXT UNIQUE,                -- 'survey.acme.com' (Firm Suite tier)
  custom_domain_verified BOOLEAN DEFAULT false,
  tags                  TEXT[] DEFAULT '{}',
  metadata              JSONB DEFAULT '{}',
  founded_at            TIMESTAMPTZ DEFAULT now(),
  deleted_at            TIMESTAMPTZ                  -- soft delete; hard delete by cron after 30d
);
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_custom_domain ON organizations(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX idx_organizations_status ON organizations(status);

-- ── Organization membership (user ↔ org many-to-many) ──────────────
CREATE TYPE org_role_enum AS ENUM (
  'admin', 'surveyor', 'bookkeeper', 'field_only', 'view_only'
);

CREATE TABLE organization_members (
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_email        CITEXT NOT NULL,                -- FK to registered_users.email (eventually)
  role              org_role_enum NOT NULL DEFAULT 'surveyor',
  bundle_overrides  TEXT[],                          -- null = inherit org's bundle access
  status            TEXT NOT NULL DEFAULT 'active', -- active / suspended / removed
  invited_by_email  CITEXT,
  invited_at        TIMESTAMPTZ,
  joined_at         TIMESTAMPTZ DEFAULT now(),
  last_active_at    TIMESTAMPTZ,
  PRIMARY KEY (org_id, user_email)
);
CREATE INDEX idx_org_members_user ON organization_members(user_email);

-- ── Subscriptions (firm-level, Stripe-mirrored) ───────────────────
-- Detailed in SUBSCRIPTION_BILLING_SYSTEM.md; minimal shape here.
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID UNIQUE NOT NULL REFERENCES organizations(id),
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id    TEXT,
  status                TEXT NOT NULL,             -- trialing / active / past_due / canceled / paused
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

-- ── Per-org settings ──────────────────────────────────────────────
CREATE TABLE org_settings (
  org_id              UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  default_invite_role org_role_enum DEFAULT 'surveyor',
  mfa_required        BOOLEAN DEFAULT false,
  session_timeout_min INT DEFAULT 480,             -- 8h default
  webhook_url         TEXT,                        -- per-org notifications endpoint
  feature_flags       JSONB DEFAULT '{}',
  notifications_pref  JSONB DEFAULT '{}',          -- {trial_warnings: bool, ...}
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ── Active-org cookie / session helper ────────────────────────────
-- The JWT carries active_org_id; this table caches per-user active org
-- for legacy session restoration (e.g. on mobile re-launch).
CREATE TABLE user_active_org (
  user_email   CITEXT PRIMARY KEY,
  active_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 RLS policies — pattern

For every tenant table:

```sql
-- 1. Enable RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS even for table owners (paranoia)
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;

-- 3. SELECT policy
CREATE POLICY jobs_select_member ON jobs FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_email = auth.email()
        AND status = 'active'
    )
  );

-- 4. INSERT policy
CREATE POLICY jobs_insert_member ON jobs FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_email = auth.email()
        AND status = 'active'
        AND role IN ('admin', 'surveyor')
    )
  );

-- 5. UPDATE policy (same as INSERT for most tables)
-- 6. DELETE policy (usually restricted to admin)
```

**Operator-side bypass:** the operator console queries use the **service-role key** (Supabase `supabaseAdmin`), which bypasses RLS entirely. Every operator-side route must:
1. Verify the caller is `is_operator = true` via JWT.
2. Use `supabaseAdmin` (RLS bypassed).
3. Apply explicit `WHERE org_id = ?` only if scoping to a single tenant; omit for cross-tenant queries.
4. Log to `audit_log` on every mutation.

The customer-side queries use the **anon key** with the user's JWT → RLS policies fire → only their org's rows return.

### 3.3 Bundle gating

Decision: bundle access lives on `subscriptions.bundles` (text[]). Membership in an org grants bundle access unless `organization_members.bundle_overrides` restricts.

Resolution at request time:

```ts
function effectiveBundles(orgId: string, userEmail: string): BundleId[] {
  const member = organization_members.find({ org_id: orgId, user_email: userEmail });
  if (!member || member.status !== 'active') return [];
  if (member.bundle_overrides && member.bundle_overrides.length > 0) {
    // Per-user restriction: intersect overrides with org's purchased bundles
    return intersect(member.bundle_overrides, subscriptions[orgId].bundles);
  }
  return subscriptions[orgId].bundles;
}
```

Cached in JWT for the session (refresh on subscription change).

---

## 4. Identity stack changes

### 4.1 NextAuth JWT shape (target)

`types/next-auth.d.ts`:

```ts
declare module 'next-auth' {
  interface Session {
    user: {
      email: string;
      name?: string;
      image?: string;
      isOperator: boolean;                     // platform_admin / billing / support / dev / observer
      operatorRole?: OperatorRole;             // null when isOperator = false
      memberships: Array<{
        orgId: string;
        orgSlug: string;
        orgName: string;
        role: OrgRole;
        bundles: BundleId[];
      }>;
      activeOrgId: string | null;              // current "as" org (null = no org / operator-only)
    };
  }
}
```

### 4.2 Auth flows

**Sign in (existing user):**
1. NextAuth resolves the user.
2. Fetch memberships from `organization_members WHERE user_email = ? AND status = 'active'`.
3. Resolve operator status from `operator_users`.
4. Determine active org:
   - JWT carries `activeOrgId` from previous session? Use it (if still valid).
   - Else: `user_active_org.active_org_id`? Use it.
   - Else: first membership (or null if no memberships).
5. Sign JWT with the resolved shape; set cookie.

**Sign up (new user):**
1. `/signup` wizard creates org + admin user atomically (see CUSTOMER_PORTAL.md §3.2).
2. User is signed in with active_org_id = new org.

**Accept invite:**
1. `/accept-invite/[token]` validates token → org_id + role.
2. If user exists: add to `organization_members`, optionally update active_org_id.
3. If user doesn't exist: create user, then membership.

**Org switch:**
1. User picks org from topbar dropdown.
2. POST `/api/auth/switch-org { org_id }` → server validates membership → updates `user_active_org` → re-signs JWT → returns cookie.
3. Client redirects to `/admin/me`.

**Operator login:**
1. Separate route: `/platform/login` (not `/admin/login`).
2. Credentials provider only (no Google SSO — operators don't get easier-mode auth).
3. MFA required.
4. Resolves `operator_users` record. Sets `isOperator=true`, `operatorRole=...`. `memberships=[]`, `activeOrgId=null`.

### 4.3 Middleware

`middleware.ts` becomes more sophisticated:

```ts
export async function middleware(req) {
  const path = req.nextUrl.pathname;
  const session = await getSession(req);

  // /platform/* requires operator
  if (path.startsWith('/platform/')) {
    if (!session?.user.isOperator) return Response.redirect('/platform/login');
    return NextResponse.next();
  }

  // /admin/* requires org membership
  if (path.startsWith('/admin/')) {
    if (!session?.user) return Response.redirect('/login');
    if (!session.user.activeOrgId) return Response.redirect('/signup');

    // Subdomain check: does the request host match the active org's slug or custom domain?
    const orgFromHost = await resolveOrgFromHost(req.headers.get('host'));
    if (orgFromHost && orgFromHost.id !== session.user.activeOrgId) {
      // Cross-subdomain navigation — switch active org if user belongs, else 403
      const membership = session.user.memberships.find(m => m.orgId === orgFromHost.id);
      if (!membership) return new Response('Forbidden', { status: 403 });
      return Response.redirect('/api/auth/switch-org?org_id=' + orgFromHost.id + '&returnTo=' + path);
    }

    // Bundle-gate check
    const route = findRoute(path);
    if (route?.requiredBundle) {
      const userBundles = session.user.memberships.find(m => m.orgId === session.user.activeOrgId).bundles;
      if (!userBundles.includes(route.requiredBundle)) {
        return Response.redirect('/admin/billing/upgrade?requiredBundle=' + route.requiredBundle + '&returnTo=' + path);
      }
    }
  }

  return NextResponse.next();
}
```

The `resolveOrgFromHost` helper:
1. Strip `starrsoftware.com` from host → that's the slug (e.g. `acme.starrsoftware.com` → `acme`).
2. Lookup `organizations WHERE slug = ?`.
3. Else: lookup `organizations WHERE custom_domain = ?`.
4. Cache in memory for the request lifetime.

---

## 5. URL strategy

### 5.1 Subdomain routing

Vercel supports wildcard subdomains via `*.starrsoftware.com` DNS + middleware host-matching. No per-tenant deployment.

```
starrsoftware.com           → marketing site (root)
*.starrsoftware.com         → tenant admin shell
api.starrsoftware.com       → optional: dedicated API subdomain for future public API
www.starrsoftware.com       → redirect to root
```

Special slugs reserved (can't be tenant names): `www`, `api`, `app`, `platform`, `admin`, `auth`, `signup`, `pricing`, `docs`, `help`, `blog`, `status`.

### 5.2 Custom domains (Firm Suite tier)

Customer maps `survey.acme.com` → CNAME → `cname.vercel-dns.com`. Operator verifies via `dig` check + provisions SSL via Vercel API. `organizations.custom_domain = 'survey.acme.com'` + `custom_domain_verified = true`.

Verification flow lives in `/platform/customers/[org-id]` → Custom Domain tab. SSL certs renew automatically via Vercel.

### 5.3 Localhost / development

`localhost:3000` → resolves to a single development org (e.g., `dev-org-uuid`). Devs override via env var `DEV_DEFAULT_ORG_ID`. Subdomain routing falls back to a fixed dev tenant when host doesn't match a slug.

---

## 6. Migration plan

The migration runs Starr Surveying from "single-tenant with no `org_id`" to "tenant #1 of multi-tenant SaaS" with **zero downtime** and **zero data loss**.

### 6.1 Pre-migration

1. Full DB snapshot taken via Supabase backup API.
2. Read-only mirror of production set up for testing the migration script.
3. Migration script reviewed + tested against the mirror with row-count + checksum verification.
4. Feature flag `multi_tenant_enabled` set to `false` everywhere — code is fully wired but old paths still execute.

### 6.2 Migration order (per-slice)

**Slice M-1: Schema only (no behavior change).** Add tables + nullable `org_id` columns. No RLS yet. Existing queries continue to work because `org_id` is nullable and unused. *Acceptance:* schema is in place; all tests green.

**Slice M-2: Seed Starr's org.** Insert one row into `organizations` with slug `starr`, name `Starr Surveying`. Insert one row into `subscriptions` granting all bundles. Migrate `research_subscriptions` data to the new `subscriptions` table for Starr's existing users. *Acceptance:* `organizations` has 1 row; subscriptions reflects Starr's full access.

**Slice M-3: Backfill `organization_members`.** For every row in `registered_users`, insert into `organization_members` with `org_id = starr_org_id` + `role = mapRoleToOrgRole(existing_roles)` (per §6.3 below). *Acceptance:* every active user is a member of Starr.

**Slice M-4: Backfill `org_id` on tenant tables.** One transaction per table, idempotent. `UPDATE jobs SET org_id = starr_org_id WHERE org_id IS NULL;`. Verify row counts. *Acceptance:* every customer-data row has `org_id`.

**Slice M-5: Tighten constraints.** `ALTER TABLE jobs ALTER COLUMN org_id SET NOT NULL` for each table. *Acceptance:* schema enforces tenant ownership.

**Slice M-6: Enable RLS on low-blast-radius tables first.** Start with `notifications`, then `messages`, then `audit_log`, then `error_log`. Per-table: enable RLS + apply policies + run automated isolation test (insert into Starr, query as a non-Starr user → must return 0 rows). *Acceptance:* each table passes isolation tests.

**Slice M-7: Enable RLS on mid-blast-radius tables.** `jobs`, `field_data_points`, `equipment_*`, `vehicles`, `learning_progress`. Same per-table protocol. *Acceptance:* each table passes isolation tests.

**Slice M-8: Enable RLS on high-blast-radius tables.** `payroll_*`, `receipts`, `research_*`, `document_*`. These are highest-value-if-leaked. *Acceptance:* each passes isolation tests AND a security review.

**Slice M-9: Auth refactor.** Update `lib/auth.ts` to emit the new JWT shape; drop `ALLOWED_DOMAIN` and `ADMIN_EMAILS` (move to `operator_users`); update middleware. Behind the feature flag — old auth path still works as fallback during rollout. *Acceptance:* feature flag toggled on for a single dev session works end-to-end.

**Slice M-10: Component refactor.** Update every consumer of `isCompanyUser` to use `useOrgContext()`. Update the route registry's `accessibleRoutes()` signature. *Acceptance:* tests pass; Starr's admin shell renders identically; the feature flag now controls a uniformly working path.

**Slice M-11: Mobile refactor.** Update mobile auth + every fetch to carry `org_id`. *Acceptance:* mobile sessions work for Starr users.

**Slice M-12: Flip the feature flag default.** Single-line change. *Acceptance:* Starr employees use the multi-tenant code path on every request; no observable behavior change.

**Slice M-13: Smoke test under load.** Run a representative read workload against the new code path. Compare query latency before/after (RLS adds ~1ms per query in benchmarks; should be negligible). *Acceptance:* p99 latency degrades <5%.

**Slice M-14: Onboard a second test tenant.** Create a `dev-test-org` via the signup wizard. Verify total data isolation from Starr. *Acceptance:* two orgs coexist; cross-tenant queries return nothing.

**Slice M-15: Cleanup.** Drop `ALLOWED_DOMAIN` constant entirely. Remove the feature flag — multi-tenant is the only path. Update docs. *Acceptance:* feature flag deleted, only one code path remains.

### 6.3 Role mapping (M-3)

Existing roles → `org_role`:

```ts
function mapRoleToOrgRole(roles: UserRole[]): OrgRole {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('developer')) return 'admin'; // dev = admin within Starr's own tenant
  if (roles.includes('tech_support')) return 'admin';
  if (roles.includes('field_crew')) return 'surveyor';
  if (roles.includes('researcher') || roles.includes('drawer')) return 'surveyor';
  if (roles.includes('teacher')) return 'admin'; // teachers manage learning content; treat as admin for org
  if (roles.includes('equipment_manager')) return 'admin';
  if (roles.includes('student')) return 'view_only'; // students consume but don't operate
  return 'view_only';
}
```

Existing `developer` / `tech_support` users also get rows in `operator_users` (since they're the founding operator team).

### 6.4 Rollback plan

If anything goes wrong post-M-12, the rollback is **feature-flag flip**:
- Toggle `multi_tenant_enabled = false`.
- Old code path resumes.
- Data is still backfilled (no rollback of `org_id` columns needed — they're harmless when unused).
- Investigate, fix, retry.

If a deeper issue (RLS leak detected) — rollback is **DB-level**:
- `ALTER TABLE … DISABLE ROW LEVEL SECURITY` on affected tables.
- Investigate, redeploy with fix, re-enable.
- Audit log entry for every disable / re-enable event.

---

## 7. Testing strategy

### 7.1 Isolation tests (mandatory per table)

For every tenant table, an automated vitest suite:

```ts
// __tests__/multitenant/isolation/jobs.test.ts
describe('jobs table — tenant isolation', () => {
  it('a member of org A cannot see jobs from org B', async () => {
    const orgA = await createTestOrg('a');
    const orgB = await createTestOrg('b');
    await createJob(orgA.id, { name: 'A-job' });
    await createJob(orgB.id, { name: 'B-job' });

    const aClient = await signInAs(orgA.adminEmail);
    const { data } = await aClient.from('jobs').select('*');
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('A-job');
  });

  it('UPDATE on org B from org A user is blocked', async () => {
    // …
  });

  it('DELETE on org B from org A user is blocked', async () => {
    // …
  });

  it('INSERT with org_id of org B from org A user is blocked', async () => {
    // …
  });
});
```

Every tenant table → 4 isolation tests minimum. ~30 tables × 4 tests = ~120 isolation tests. Mandatory for shipping the multi-tenant code path.

### 7.2 Performance benchmarks

Before and after RLS, run:
- 1000 sequential reads from `jobs` (single org)
- 100 concurrent reads from `field_data_points`
- A representative dashboard query (multi-table join)

Acceptable degradation: <10% latency increase. RLS in Postgres is typically very fast; degradation comes from poorly-written policies that don't use indexes.

### 7.3 Operator-side bypass tests

A separate suite verifies operator queries CAN see across tenants:

```ts
describe('operator cross-tenant queries', () => {
  it('platform_admin can see jobs from every org', async () => {
    const orgA = await createTestOrg('a');
    const orgB = await createTestOrg('b');
    await createJob(orgA.id, ...);
    await createJob(orgB.id, ...);

    const adminClient = await signInAsOperator('platform_admin');
    const { data } = await adminClient.adminFrom('jobs').select('*');  // uses supabaseAdmin
    expect(data).toHaveLength(2);
  });
});
```

### 7.4 Mock-tenant fixtures

A `__tests__/fixtures/orgs.ts` helper provides:
- `createTestOrg(suffix)` — seeds an org + admin user + subscription
- `signInAs(email)` — returns a Supabase client with that user's JWT
- `signInAsOperator(role)` — returns a client with operator JWT (RLS-bypass)
- `createJob(orgId, partial)` — seeds a single row

---

## 8. Phased delivery

Maps to master plan Phase A. ~6 weeks engineering.

| Slice | Description | Estimate | Status |
|---|---|---|---|
| **A-1** | Schema: new tables + nullable org_id columns (no behavior change) | 3 days | ✅ Shipped — `seeds/260_saas_multi_tenancy_foundation.sql` |
| **A-2** | Seed Starr org + subscription | 1 day | ✅ Shipped — `seeds/261_saas_seed_starr_tenant.sql` |
| **A-3** | Backfill organization_members from existing users | 1 day | ✅ Shipped — `seeds/262_saas_backfill_org_members.sql` |
| **A-4** | Backfill org_id on all tenant tables | 2 days | ✅ Shipped — `seeds/263_saas_backfill_org_id.sql` |
| **A-5** | Tighten NOT NULL constraints | 1 day | ✅ Shipped — `seeds/264_saas_org_id_not_null.sql` |
| **(parallel)** | Operator-console schema (operator_users, impersonation_sessions, audit_log, pending_operator_actions) | — | ✅ Shipped — `seeds/265_saas_operator_console_schema.sql` |
| **(parallel)** | Billing schema (invoices, subscription_events, usage_events, processed_webhook_events) | — | ✅ Shipped — `seeds/266_saas_billing_schema.sql` |
| **(parallel)** | Customer-portal schema (org_invitations, org_notifications, releases, release_acks, support_tickets, support_ticket_messages) | — | ✅ Shipped — `seeds/267_saas_customer_portal_schema.sql` |
| **A-6** | Enable RLS on low-blast-radius tables + tests | 3 days | ✅ SQL shipped — `seeds/270_saas_rls_low_blast.sql` enables RLS + SELECT/INSERT/UPDATE/DELETE policies on `notifications`, `org_notifications`, `error_reports`, `audit_log`, `message_contacts`, `discussion_messages` via reusable `_enable_tenant_rls()` helper. Policies use `auth.email()` JWT claim → `organization_members` lookup. Idempotent. Live behavior unchanged (existing code uses supabaseAdmin which bypasses RLS); policies activate when M-9 ships the anon-client + JWT shift. Isolation tests deferred to integration-suite slice with real DB. |
| **A-7** | Enable RLS on mid-blast-radius tables + tests | 4 days | ✅ SQL shipped — `seeds/272_saas_rls_mid_blast.sql` enables RLS on ~30 mid-blast tables (jobs / equipment / vehicles / research / learning_progress / messages / discussions / notes) via the same reusable `_enable_tenant_rls()` helper from M-6 (recreated since 270 dropped it). Live behavior unchanged (existing code uses supabaseAdmin which bypasses RLS); policies activate post-M-9. Isolation tests deferred to integration-suite slice. |
| **A-8** | Enable RLS on high-blast-radius tables + tests | 4 days |
| **A-9** | Auth refactor (NextAuth shape + middleware) | 5 days |
| **A-10** | Component refactor (useOrgContext consumers) | 5 days |
| **A-11** | Mobile refactor | 4 days |
| **A-12** | Flip feature flag default | 1 day |
| **A-13** | Smoke + load tests + perf benchmarks | 2 days |
| **A-14** | Onboard test tenant (dev-test-org) | 2 days |
| **A-15** | Cleanup + flag removal | 1 day |

**Total: ~6 weeks** assuming one full-time engineer. Could parallelize A-6/A-7/A-8 (different tables) for 4-5 weeks.

---

## 9. Open questions

Multi-tenancy foundation-specific decisions:

1. **Service-role key handling.** Use `SUPABASE_SERVICE_ROLE_KEY` (already configured) or rotate to a separate operator key? Recommendation: keep one service-role key but **only** use it in operator routes under `/api/platform/*` and `/app/(platform)/...`. Customer-side routes never use it.
2. **Existing `registered_users` table.** Migrate to a new `users` table, or evolve in place? Recommendation: evolve — fewer breaking refactors. Add `default_org_id` + soft-delete + keep email as primary key (the rest of the schema already keys off email).
3. **What if Starr's existing employees are in `developer` / `tech_support` roles — do they auto-get operator roles?** Recommendation: yes for now (founding team), with explicit grant in the migration script. Future operators added manually.
4. **JWT session lifetime.** Currently 30 days (NextAuth default). Multi-tenant adds risk if a leaked JWT lasts 30 days. Recommend reducing to 7 days with sliding renewal on activity.
5. **Cookie domain strategy.** Subdomain pivot complicates cookies. Options: (a) set cookies for `.starrsoftware.com` (works across subdomains), (b) per-subdomain cookies (forces re-login on org-switch). Recommendation: (a) for SSO across orgs.
6. **`learning_*` content forking model.** §2.3 sketched it. Should an org be able to *override* a platform article, or only *extend* it? Recommendation: full override (the fork wins for that org) — simpler model.
7. **Reserved-slug enforcement timing.** Check at signup-wizard step 2 only, or also re-validate at provisioning time? Recommendation: both (defense in depth — race conditions).
8. **Trial → past_due transition.** What happens when trial ends + no payment method? Recommendation: 7-day grace period during which `status='past_due'`, then auto-suspension (`status='suspended'`). Suspended orgs read-only; suspended >30d → soft delete.

---

## 10. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| RLS policy bug leaks one tenant's data to another | **Critical** | 120+ isolation tests; mandatory code review for every policy change; staged rollout (low-blast tables first); ability to disable RLS table-by-table during incident |
| Backfill script corrupts data | High | Idempotent UPDATEs; row-count + checksum verification; full backup before; test on read-only mirror |
| Migration window unexpectedly long (e.g. backfill of 10M-row table) | Medium | Tables are backfilled async with progress monitoring; new rows post-migration include `org_id` via trigger to prevent gap |
| Feature flag flipping breaks unrelated functionality | Medium | Feature flag is per-request; flag-off path remains green throughout migration; tests run both paths |
| Auth refactor breaks active sessions | High | NextAuth JWT shape migration handled by version bump + grace period for old JWTs (re-auth required for old shape) |
| Subdomain DNS misconfiguration on first external customer | Medium | Vercel docs explicit; provisioning automation tested on dev tenant first |
| Custom-domain SSL provisioning fails for a Firm Suite customer | Medium | Operator-console runbook for manual cert renewal; Vercel API retries with backoff |
| Operator-side query accidentally uses customer-side anon key → no rows returned | Low | Type-level enforcement: `adminFrom()` vs `from()`; lint rule forbids `supabaseAdmin.from(...)` in non-platform routes |
| Tenant-overridable content (learning_*) has confusing precedence | Low | Query layer always returns max-one-row-per-key by joining on `org_id IS NULL OR org_id = currentOrg` + `ORDER BY org_id NULLS LAST LIMIT 1` |
| Race condition during signup: org slug check + insert | Low | Unique constraint on `slug` is the source of truth; UI check is hint-only |
| Org-switch during in-flight mutation | Medium | All mutations carry explicit `org_id` from JWT at request time; org-switch in another tab doesn't affect this tab's in-flight requests |

---

## 11. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §3 (target architecture) + §6 (migration path) — the parent plan
- `OPERATOR_CONSOLE.md` §3.10 — operator-side query patterns and `supabaseAdmin` bypass
- `CUSTOMER_PORTAL.md` §4 (auth flows) + §5 (data model additions) — what consumes this foundation
- `SUBSCRIPTION_BILLING_SYSTEM.md` (TBD) — Stripe state mirrored in `subscriptions` defined here
- `SUPPORT_DESK.md` (TBD) — tickets get `org_id` + RLS
- `MARKETING_SIGNUP_FLOW.md` (TBD) — `/signup` creates the org via the schema here
- `MOBILE_MULTI_TENANT.md` (TBD) — mobile-side `active_org_id` in session
- `docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md` — the IconRail + Hub UX is the surface this foundation enables tenant-scoping for
- `lib/auth.ts:63-71` — the immediate refactor target
- `lib/admin/route-registry.ts:208-213` — `accessibleRoutes()` signature change
- `app/api/webhooks/stripe/route.ts` — extended to populate `subscriptions` table

---

## 12. Definition of done

The multi-tenancy foundation is complete when:

1. ✅ `organizations` + `organization_members` + `subscriptions` + `org_settings` tables exist with full schema.
2. ✅ Every customer-data table has `org_id NOT NULL`.
3. ✅ RLS policies enabled on every customer-data table with passing isolation tests (4 per table minimum).
4. ✅ Operator-side queries use `supabaseAdmin` with explicit operator-role gate.
5. ✅ NextAuth JWT carries `memberships[]` + `activeOrgId` + `isOperator` shape.
6. ✅ Middleware enforces subdomain → org resolution + bundle gates.
7. ✅ `/api/auth/switch-org` works for multi-org users.
8. ✅ Starr Surveying continues to operate without observable change post-migration.
9. ✅ A second test org can be created via signup wizard; data is fully isolated from Starr's.
10. ✅ Feature flag `multi_tenant_enabled` has been removed; multi-tenant is the only code path.
11. ✅ Performance benchmarks show <10% latency degradation vs single-tenant baseline.
12. ✅ 120+ isolation tests pass; full test suite (3613+ existing + new) green.
13. ✅ Cross-tenant operator queries work + are audit-logged.
14. ✅ Mobile clients carry `activeOrgId` + bundle gates apply.
15. ✅ `lib/auth.ts:63-67 ADMIN_EMAILS` and `lib/auth.ts:71 ALLOWED_DOMAIN` have been deleted; operators live in `operator_users`.
