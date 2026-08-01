// scripts/audit-org-scoping.mjs — which tables need `org_id`, and which must never have it (D1).
//
// Owner decision D1: *"Ship single-tenant. Add `org_id` to the business tables NOW (nullable, defaulted
// to the Starr org) so the eventual multi-tenant migration is a backfill, not a rewrite."*
//
// ── THE CLASSIFICATION IS THE WORK; THE COLUMN IS THE EASY PART ────────────────────────────────────
//
// 182 tables currently have no `org_id` and no org-scoped parent to inherit one from. Adding the column
// to all 182 would be wrong in three distinct ways, and each wrong way is worse than the gap:
//
//   · PLATFORM tables sit ABOVE the org — `organizations` itself, `operator_users`, `releases`,
//     `impersonation_sessions`. An `org_id` on `organizations` is a category error, and one on
//     `operator_users` would scope the operator console to a single customer, which defeats it.
//   · REFERENCE tables are shared catalogues, not tenant data — 254 Texas counties, the FS reference
//     library, the problem-template bank, seniority brackets. Copying 254 counties per customer is not
//     multi-tenancy, it is duplication with extra steps, and the first divergent copy is a support call.
//   · DND is a separate product with its own user table and its own access model, and the audit puts it
//     explicitly out of scope. Scoping it to a surveying organisation would be meaningless.
//
// What is left is TENANT data: the rows that belong to one firm and must not be visible to another.
// That is the set the column belongs on.
//
// Run: `node scripts/audit-org-scoping.mjs [--sql]`

import fs from 'node:fs';
import pg from 'pg';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

/** Above the org. An `org_id` here is a category error or an outright bug. */
const PLATFORM = new Set([
  'organizations', 'operator_users', 'registered_users', 'user_active_org',
  'impersonation_sessions', 'pending_operator_actions', 'broadcasts', 'releases', 'release_acks',
  'email_templates', 'processed_webhook_events', 'rate_limits', 'dnd_rate_limits',
]);

/** Shared catalogues. Per-tenant copies would be duplication, and the first divergent copy is a bug. */
const REFERENCE = new Set([
  'research_counties', 'research_data_vendors', 'research_site_adapters', 'research_county_data_sources',
  'research_adapter_canaries', 'research_adapter_health_checks', 'research_adapter_change_proposals',
  'research_self_heal_settings', 'county_portal_configs',
  'problem_templates', 'block_templates', 'analysis_templates', 'drawing_templates',
  'fs_reference_docs', 'fs_reference_chunks', 'fs_study_modules', 'exam_prep_categories',
  'question_bank', 'flashcards', 'kb_articles', 'learning_modules', 'learning_lessons',
  'learning_topics', 'lesson_blocks', 'lesson_versions', 'lesson_required_articles',
  'curriculum_milestones', 'education_courses', 'acc_course_enrollments', 'fieldbook_categories',
  'badges', 'rewards_catalog', 'module_xp_config', 'activity_tags', 'financial_allocation_categories',
]);

/** Per-person state that follows the USER, not the firm — a bookmark is not tenant data. */
const PER_USER = new Set([
  'user_bookmarks', 'user_article_completions', 'user_badges', 'user_calculator_state',
  'user_flashcard_discovery', 'user_flashcards', 'user_hub_layouts', 'user_lesson_progress',
  'user_milestone_progress', 'user_notification_prefs', 'user_presence', 'user_progress',
  'flashcard_reviews', 'practice_sessions', 'learn_tutor_conversations', 'messaging_preferences',
  'fs_module_progress', 'fs_practice_progress', 'fs_section_progress', 'fs_weak_areas',
  'fs_mock_exam_attempts', 'nav_events',
]);

const isDnd = (t) => t.startsWith('dnd_');

export function classify(table) {
  if (isDnd(table)) return { bucket: 'dnd', why: 'separate product, its own user table, explicitly out of the audit’s scope' };
  if (PLATFORM.has(table)) return { bucket: 'platform', why: 'sits ABOVE the org — scoping it to one would defeat its purpose' };
  if (REFERENCE.has(table)) return { bucket: 'reference', why: 'shared catalogue — a per-tenant copy is duplication, and the first divergent copy is a bug' };
  if (PER_USER.has(table)) return { bucket: 'per-user', why: 'follows the person, not the firm' };
  return { bucket: 'tenant', why: 'business data belonging to one firm' };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const cols = await c.query(`select table_name from information_schema.columns where table_schema='public' and column_name='org_id'`);
  const hasOrg = new Set(cols.rows.map((r) => r.table_name));

  // ── NULLABILITY IS PART OF THE DERIVED RULE, AND LEAVING IT OUT COST 16 TABLES ────────────────
  //
  // The rule "a child of a scoped table derives its tenant" is right. Applied without asking whether
  // the foreign key is NOT NULL, it is wrong for every table whose parent link is optional:
  //
  //   job_equipment.job_id           NOT NULL → cannot exist without a job. Derivable.
  //   equipment_inventory.vehicle_id NULLABLE → a total station in the cage is assigned to no
  //                                             vehicle, no job and no receipt. NOTHING to derive
  //                                             from, and no org_id column to filter on either.
  //
  // Measured 2026-08-01: 16 tables were in that state, including equipment_inventory, cad_drawings,
  // user_files and lead_lifecycle_events — and equipment_assignments, a CHILD of
  // equipment_inventory, already carried org_id while its parent did not. Fixed by seed 521.
  const fks = await c.query(`
    select tc.table_name as child, ccu.table_name as parent, col.is_nullable
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    join information_schema.columns col
      on col.table_schema = tc.table_schema and col.table_name = tc.table_name and col.column_name = kcu.column_name
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'`);
  const parents = new Map();
  for (const r of fks.rows) {
    if (r.child === r.parent) continue;
    if (!parents.has(r.child)) parents.set(r.child, new Set());
    // Only a MANDATORY link derives a tenant. An optional one is an association, not ownership.
    if (r.is_nullable === 'NO') parents.get(r.child).add(r.parent);
  }

  const all = await c.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`);
  const buckets = { tenant: [], platform: [], reference: [], 'per-user': [], dnd: [], derived: [], scoped: [] };

  for (const { table_name: t } of all.rows) {
    if (hasOrg.has(t)) { buckets.scoped.push(t); continue; }
    const ps = parents.get(t) ?? new Set();
    // A child of an org-scoped table DERIVES its tenant — a `job_equipment` row belongs to a job, and
    // denormalising the column onto every child is a second copy of the same fact that can disagree.
    if ([...ps].some((p) => hasOrg.has(p))) { buckets.derived.push(t); continue; }
    buckets[classify(t).bucket].push(t);
  }

  console.log('org scoping, by bucket\n');
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(10)} ${String(v.length).padStart(4)}`);
  }
  console.log(`\nTENANT tables still missing org_id (${buckets.tenant.length}) — these are the D1 set:\n`);
  for (const t of buckets.tenant) console.log('  ' + t);

  if (process.argv.includes('--sql')) {
    console.log('\n-- generated by scripts/audit-org-scoping.mjs\n');
    for (const t of buckets.tenant) {
      console.log(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;`);
      console.log(`CREATE INDEX IF NOT EXISTS idx_${t}_org ON ${t} (org_id);`);
    }
  }
  await c.end();
}
