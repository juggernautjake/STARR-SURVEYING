// D4 — one-time backfill of `identity_key` (and duplicate reconciliation) on legacy rows.
//
// The rule lives in src/research/identity-backfill.ts (unit-tested); this runner is only I/O: load
// every research_documents row and its project's county, plan the writes with the SAME functions a
// live run uses, print the plan, and — only with --apply — write it inside one transaction. The
// partial unique index (project, identity_key) WHERE duplicate_of IS NULL is honoured because the
// plan gives each key exactly one non-duplicate row; the rest carry duplicate_of, so no two
// non-duplicate rows ever share a key.
//
// Usage (from worker/, after `npm run build`, with SUPABASE_DB_URL in the env):
//   node src/scripts/backfill-identity.mjs            # dry run — prints the plan, writes nothing
//   node src/scripts/backfill-identity.mjs --apply    # writes the plan in a transaction

import pg from 'pg';
import { planIdentityBackfill } from '../../dist/research/identity-backfill.js';

const APPLY = process.argv.includes('--apply');
const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('SUPABASE_DB_URL not set'); process.exit(1); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const projects = (await c.query('select id, county from research_projects')).rows;
const countyByProject = new Map(projects.map((p) => [p.id, p.county ?? '']));

const rows = (await c.query(
  `select id, research_project_id, identity_key, duplicate_of, recording_info,
          document_label, original_filename, harvest_metadata, recorded_date, created_at
   from research_documents`,
)).rows.map((r) => ({
  ...r,
  created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
}));

const plan = planIdentityBackfill(rows, countyByProject);
console.log(
  `rows=${rows.length} | updates=${plan.updates.length} ` +
  `(canonical-key ${plan.updates.filter((u) => !u.duplicate_of).length}, ` +
  `duplicates ${plan.updates.filter((u) => u.duplicate_of).length}) | ` +
  `unkeyable=${plan.unkeyable} | alreadyCorrect=${plan.alreadyCorrect} | duplicateGroups=${plan.duplicateGroups}`,
);
for (const u of plan.updates.slice(0, 10)) {
  console.log('  ', u.id, '→', u.identity_key, u.duplicate_of ? `(duplicate_of ${u.duplicate_of})` : '(canonical)');
}
if (plan.updates.length > 10) console.log(`   … and ${plan.updates.length - 10} more`);

if (!APPLY) {
  console.log('DRY RUN — pass --apply to write.');
  await c.end();
  process.exit(0);
}

await c.query('begin');
let applied = 0;
try {
  // Canonical key-only writes first, then the duplicate rows (whose duplicate_of keeps them out of
  // the partial unique index entirely) — though the plan guarantees no key collision in any order.
  const ordered = [...plan.updates].sort((a, b) => Number(!!a.duplicate_of) - Number(!!b.duplicate_of));
  for (const u of ordered) {
    if (u.duplicate_of) {
      await c.query(
        `update research_documents set identity_key=$2, duplicate_of=$3, duplicate_reason=$4, updated_at=now() where id=$1`,
        [u.id, u.identity_key, u.duplicate_of, u.duplicate_reason],
      );
    } else {
      await c.query(
        `update research_documents set identity_key=$2, updated_at=now() where id=$1`,
        [u.id, u.identity_key],
      );
    }
    applied++;
  }
  await c.query('commit');
  console.log(`APPLIED ${applied} update(s).`);
} catch (e) {
  await c.query('rollback');
  console.error('ROLLED BACK — no rows changed:', e instanceof Error ? e.message : String(e));
  await c.end();
  process.exit(1);
}
await c.end();
