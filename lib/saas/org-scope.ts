// lib/saas/org-scope.ts — make `org_id` a filter instead of a column (audit §3c.1 item 8g).
//
// §1.2 shipped the column on 73 business tables and said so plainly:
//
//   *"The column exists and is empty of meaning until queries filter on it. Enforcement — RLS or a
//    scoped query helper — is Phase 3 work; today a second org would still see everything."*
//
// This is that enforcement, and the shape of it is decided by one measured fact: **466 of 517 API
// routes use the RLS-bypassing service role.** So RLS is not the lever — a service-role connection
// ignores every policy by design. Switching 466 routes to a user-scoped client is a rewrite, not a
// slice, and a rewrite that touches every data path in the app is how you get a launch that slips.
//
// What there IS, measured, is a genuine choke point: the whole application talks to Postgres through
// exactly TWO `createClient()` calls, both in `lib/supabase.ts`, and 485 API files import the admin
// one. Scoping happens there — once — rather than in 485 places that each have to remember.
//
// ── WHAT IT DOES ────────────────────────────────────────────────────────────────────────────────
//
// For a table carrying `org_id`, when a tenant scope is active:
//   · `select`  → `.eq('org_id', <scope>)`  — you read your firm's rows.
//   · `update`  → `.eq('org_id', <scope>)`  — you cannot write another firm's rows.
//   · `delete`  → `.eq('org_id', <scope>)`  — nor delete them.
//   · `insert` / `upsert` → the row is stamped with the scope when the caller did not set it.
//
// The stamp matters as much as the filter. A filter alone would make every row this app writes from
// today onwards invisible to the session that wrote it — the column would be enforced and unpopulated,
// which is a worse failure than not enforcing it, because it looks like data loss.
//
// ── WHY IT IS SAFE TO SHIP TODAY ────────────────────────────────────────────────────────────────
//
// Not by the argument §3c.1 used for the bundle gate. That claim — *"inert for a session with no org
// memberships, which is every Starr session today"* — is **false, and was false when it was written**:
// `organization_members` has 6 rows, all six Starr staff, all in the single Starr org. Every Starr
// session resolves an `activeOrgId`. The bundle gate is live for them and passes only because Starr's
// subscription lists all six bundles. Repeating that reasoning here would have shipped a filter
// believing it was inert while it was in fact filtering every query in the app.
//
// The real reason this is safe is duller and checkable: **every row in every scoped table already
// carries the Starr org** (seeds/513's guarded backfill, verified 100% coverage on every populated
// table). So `WHERE org_id = <starr>` selects exactly what `no WHERE` selected. The behaviour change
// is zero today and total on the day a second firm exists — which is the whole point.
//
// ── WHAT IS DELIBERATELY NOT SCOPED ─────────────────────────────────────────────────────────────
//
// · **No session → no scope.** Webhooks, cron, the public pay portal and the share-token routes never
//   call `auth()`, so they resolve no org and behave exactly as they do today. A system process has no
//   tenant; inventing one for it would be a guess.
// · **Operators have no scope.** The operator console works *across* firms by definition — scoping it
//   to one is the same category error as putting `org_id` on `organizations`.
// · **CROSS_ORG_TABLES** (below) are the three tables a request must read outside its own org to work
//   at all. Each is named with its reason; the list is deliberately tiny.
//
// Pure module: no React, no Node built-ins, no I/O. `lib/supabase.ts` reaches the browser, so anything
// it imports must too — the AsyncLocalStorage that supplies the scope lives in `org-scope-context.ts`
// and registers itself here at runtime.
//
// Tested in `__tests__/saas/org-scope.test.ts`.

/** The tenant column. One name, one place. */
export const ORG_COLUMN = 'org_id';

/** Every base table in the public schema carrying an `org_id` column, as of 2026-08-01.
 *
 *  Derived from the live schema rather than hand-written, and checked by
 *  `scripts/verify-org-scoped-tables.mjs` — a table that gains the column and not an entry here is a
 *  table that silently opts out of tenancy, which is indistinguishable from one that never needed it.
 *
 *  Order is alphabetical so a diff to this list reads as a diff. */
export const ORG_SCOPED_TABLES: ReadonlySet<string> = new Set([
  'active_clock_sessions',
  'activity_log',
  'ad_spend_daily',
  'admin_alert_settings',
  'admin_discussion_threads',
  'ai_usage_log',
  'app_settings',
  'assignments',
  'audit_log',
  'balance_transactions',
  'bank_transactions',
  'cad_drawings',
  'cad_folders',
  'cad_point_files',
  'calibration_certificates',
  'captcha_solves',
  'change_orders',
  'company_notes',
  'compliance_alerts_sent',
  'contacts',
  'conversation_participants',
  'conversations',
  'conversion_upload_log',
  'credential_bonuses',
  'credit_thresholds',
  'custom_roles',
  'customer_invoices',
  'customer_portal_access',
  'customers',
  'daily_time_logs',
  'deliverables',
  'document_embeddings',
  'document_purchase_history',
  'document_wallet_balance',
  'drawing_elements',
  'drawing_notes',
  'email_send_log',
  'employee_bonuses',
  'employee_certifications',
  'employee_contact_methods',
  'employee_earned_credentials',
  'employee_images',
  'employee_learning_credits',
  'employee_payment_methods',
  'employee_payouts',
  'employee_privacy',
  'employee_profile_changes',
  'employee_profiles',
  'employee_role_history',
  'employee_salary_history',
  'employee_threshold_achievements',
  'equipment_assignments',
  'equipment_events',
  'equipment_inventory',
  'equipment_kit_items',
  'equipment_kits',
  'equipment_reservations',
  'equipment_tax_elections',
  'equipment_template_items',
  'equipment_template_versions',
  'equipment_templates',
  'error_reports',
  'field_data_points',
  'fieldbook_entry_categories',
  'fieldbook_notes',
  'file_nodes',
  'google_ads_connections',
  'google_calendar_connections',
  'google_conversion_events',
  'ingest_batches',
  'instrument_points',
  'instrument_sources',
  'invoices',
  'job_files',
  'job_payment_allocations',
  'job_tags',
  'job_team',
  'jobs',
  'lead_lifecycle_events',
  'lead_notes',
  'lead_replies',
  'leads',
  'learning_assignments',
  'learning_credit_values',
  'lidar_data_cache',
  'location_pings',
  'location_segments',
  'location_stops',
  'maintenance_event_documents',
  'maintenance_events',
  'maintenance_schedules',
  'media_library',
  'messages',
  'mileage_entries',
  'module_completions',
  'notifications',
  'org_compliance_items',
  'org_counties',
  'org_invitations',
  'org_notifications',
  'org_settings',
  'organization_members',
  'pay_advance_requests',
  'pay_period_locks',
  'pay_raises',
  'pay_rate_standards',
  'pay_stubs',
  'pay_system_config',
  'payment_attempts',
  'payment_intents',
  'payment_receipts',
  'payment_secret_reads',
  'payments',
  'payout_batch_items',
  'payout_batches',
  'payout_log',
  'payroll_runs',
  'personnel_skills',
  'personnel_unavailability',
  'portal_stage_labels',
  'project_cleanup_log',
  'proposal_templates',
  'pto_balances',
  'pto_transactions',
  'quiz_attempts',
  'quote_acceptances',
  'receipts',
  'recon_edges',
  'recon_nodes',
  'recycle_bin',
  'reply_templates',
  'research_batch_jobs',
  'research_clerk_lookups',
  'research_documents',
  'research_projects',
  'research_subscriptions',
  'research_usage_events',
  'rewards_purchases',
  'role_pay_adjustments',
  'role_tiers',
  'schedule_events',
  'scheduled_bonuses',
  'seniority_brackets',
  'subscription_events',
  'subscriptions',
  'support_tickets',
  'typing_indicators',
  'usage_events',
  'user_files',
  'user_pay_overrides',
  'vehicles',
  'weekly_pay_periods',
  'withdrawal_requests',
  'work_type_rates',
  'xp_balances',
  'xp_milestone_achievements',
  'xp_pay_milestones',
  'xp_transactions',
]);

/** Tables that carry `org_id` and must NEVER be filtered by the ambient scope, because the request
 *  that reads them is by definition asking a question that crosses the org boundary.
 *
 *  Three, each for a reason that is a bug if you get it wrong — not a preference:
 *
 *  · `organization_members` — sign-in asks *"which orgs does this person belong to"*. Filtering that
 *    by the org we have not resolved yet is circular, and filtering it by the active org would make
 *    the org switcher show exactly one org forever.
 *  · `org_invitations` — you accept an invitation to a firm you are not yet a member of. Scoped to
 *    your current org, an invite from any other firm is invisible, so it can never be accepted.
 *  · `subscriptions` — sign-in reads the bundle list for *every* org the user belongs to, in one
 *    `.in('org_id', …)`. That is the query the bundle gate depends on.
 *
 *  Anything added here is a hole. Add with a reason on the line, or do not add it. */
export const CROSS_ORG_TABLES: ReadonlySet<string> = new Set([
  'organization_members',
  'org_invitations',
  'subscriptions',
]);

/** True when the ambient tenant scope should be applied to this table. */
export function isScopedTable(table: string): boolean {
  return ORG_SCOPED_TABLES.has(table) && !CROSS_ORG_TABLES.has(table);
}

// ── Where the scope comes from ──────────────────────────────────────────────────────────────────
//
// A registered function rather than a direct import, for one mechanical reason: `lib/supabase.ts`
// also exports the browser (anon) client and is therefore pulled into client bundles. It cannot
// import `node:async_hooks`, directly or transitively. So the request-scoped store lives in
// `org-scope-context.ts` — server-only — and installs itself here when that module loads.
//
// Nothing registered → `currentOrgId()` returns null → every client is unscoped, exactly as before
// this file existed. That is the correct failure mode for a *filter*: unregistered means the app
// behaves as it did yesterday, whereas a filter that failed closed would empty every page in the app
// on an import-order accident.

type OrgResolver = () => string | null;

let resolver: OrgResolver | null = null;

/** Installs the request-scoped org source. Called once, by `org-scope-context.ts`. */
export function setOrgScopeResolver(fn: OrgResolver | null): void {
  resolver = fn;
}

/** The active tenant for the current request, or null when there is none. */
export function currentOrgId(): string | null {
  return resolver ? resolver() : null;
}

// ── The proxy ───────────────────────────────────────────────────────────────────────────────────

/** Minimal structural type for what we intercept. Deliberately not `SupabaseClient` — this module is
 *  imported by client bundles and should not drag the full type graph with it. */
interface FromCapable {
  from(table: string): unknown;
}

interface QueryBuilderLike {
  select?: (...args: unknown[]) => unknown;
  insert?: (...args: unknown[]) => unknown;
  upsert?: (...args: unknown[]) => unknown;
  update?: (...args: unknown[]) => unknown;
  delete?: (...args: unknown[]) => unknown;
}

/** Adds `org_id` to a row (or every row of an array) that does not already declare one.
 *
 *  An explicit `org_id` from the caller always wins, including an explicit `null`. A caller writing a
 *  deliberately unowned row — a platform-level record, a fixture — must be able to say so, and
 *  silently overriding them would make this proxy the thing that is lying. */
export function stampOrg<T>(values: T, orgId: string): T {
  if (Array.isArray(values)) {
    return values.map((v) => stampOne(v, orgId)) as unknown as T;
  }
  return stampOne(values, orgId);
}

function stampOne<T>(value: T, orgId: string): T {
  if (!value || typeof value !== 'object') return value;
  if (ORG_COLUMN in (value as Record<string, unknown>)) return value;
  return { ...(value as Record<string, unknown>), [ORG_COLUMN]: orgId } as unknown as T;
}

function scopeQueryBuilder(qb: QueryBuilderLike, orgId: string): QueryBuilderLike {
  return new Proxy(qb as object, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop as string];
      if (typeof value !== 'function') return value;
      const fn = value as (...args: unknown[]) => unknown;

      // Reads and targeted writes: constrain to the tenant's rows. `.eq()` is appended FIRST, so any
      // filter the caller adds afterwards narrows within the tenant rather than replacing the bound.
      if (prop === 'select' || prop === 'update' || prop === 'delete') {
        return (...args: unknown[]) => {
          const builder = fn.apply(target, args) as { eq?: (c: string, v: string) => unknown };
          return typeof builder?.eq === 'function' ? builder.eq(ORG_COLUMN, orgId) : builder;
        };
      }

      // Writes that create rows: stamp the tenant on, so the row is visible to the session that
      // just wrote it.
      if (prop === 'insert' || prop === 'upsert') {
        return (values: unknown, ...rest: unknown[]) => fn.apply(target, [stampOrg(values, orgId), ...rest]);
      }

      return fn.bind(target);
    },
  }) as QueryBuilderLike;
}

/** Wraps a Supabase client so `.from(<tenant table>)` is scoped to the current request's org.
 *
 *  Everything else on the client — `.rpc()`, `.storage`, `.auth`, `.channel()` — passes through
 *  untouched. An RPC's tenancy is the function's own business (`search_everything` takes `p_org`
 *  explicitly), and storage has no rows to filter. */
export function orgScoped<T extends FromCapable>(client: T, getOrgId: OrgResolver = currentOrgId): T {
  return new Proxy(client as object, {
    get(target, prop) {
      if (prop === 'from') {
        return (table: string) => {
          const qb = (target as FromCapable).from(table);
          const orgId = getOrgId();
          if (!orgId || !isScopedTable(table)) return qb;
          return scopeQueryBuilder(qb as QueryBuilderLike, orgId);
        };
      }
      const value = (target as Record<string | symbol, unknown>)[prop as string];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as T;
}
