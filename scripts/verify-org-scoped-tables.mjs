// scripts/verify-org-scoped-tables.mjs — does the tenant filter still cover the tenant data?
//
// Audit item 8g made `org_id` load-bearing: `lib/saas/org-scope.ts` lists the tables the scoped
// Supabase client filters, and everything not on that list is read and written unfiltered. So the
// list is a security boundary maintained by hand, and there are exactly three ways it rots. This
// checks all three against the live database.
//
//   1. **A table gained `org_id` and nobody added it to the list.** It looks scoped in the schema and
//      is not scoped in the app — the worst combination, because the column's presence is the thing
//      a reviewer would check.
//   2. **The list names a table that no longer carries the column.** Harmless until the day the proxy
//      appends `.eq('org_id', …)` to a table without one and every query on it returns a 42703.
//   3. **Rows with no owner.** A row with `org_id IS NULL` matches no scoped session's filter, so it
//      is invisible to the app while sitting in the table. Seed 517's guarded DEFAULT is what
//      prevents this for session-less writers; this counts what got through anyway.
//
// Plus the invariant seed 517 rests on: a default may exist **only** while there is exactly one
// organisation. Two orgs and a default is a live mis-attribution bug — every session-less insert
// silently becomes the first firm's row.
//
// Read-only: catalogue SELECTs and COUNT(*). Run: `node scripts/verify-org-scoped-tables.mjs`

import fs from 'node:fs';
import pg from 'pg';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

/** The list as the application actually holds it. Parsed from the TS source rather than imported,
 *  because this is a plain node script and the point is to check the file a reviewer reads. */
export function listedTables(source = fs.readFileSync('lib/saas/org-scope.ts', 'utf8')) {
  const block = source.match(/export const ORG_SCOPED_TABLES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error('ORG_SCOPED_TABLES not found in lib/saas/org-scope.ts');
  return new Set([...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const listed = listedTables();

  const { rows: cols } = await client.query(`
    SELECT c.table_name, c.column_default IS NOT NULL AS has_default
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'org_id'
    ORDER BY 1
  `);
  const live = new Set(cols.map((r) => r.table_name));

  const problems = [];

  const missing = [...live].filter((t) => !listed.has(t));
  if (missing.length) {
    problems.push(
      `${missing.length} table(s) carry org_id but are NOT in ORG_SCOPED_TABLES, so the app reads and ` +
      `writes them across every tenant:\n    ${missing.join('\n    ')}`,
    );
  }

  const dangling = [...listed].filter((t) => !live.has(t));
  if (dangling.length) {
    problems.push(
      `${dangling.length} table(s) are listed as scoped but have no org_id column. Any query the ` +
      `proxy filters on them will fail with 42703:\n    ${dangling.join('\n    ')}`,
    );
  }

  const { rows: [{ n: orgCount }] } = await client.query('SELECT count(*)::int n FROM organizations');
  const withDefault = cols.filter((r) => r.has_default).map((r) => r.table_name);

  if (orgCount === 1 && withDefault.length !== cols.length) {
    const without = cols.filter((r) => !r.has_default).map((r) => r.table_name);
    problems.push(
      `One organisation exists, but ${without.length} table(s) have no org_id DEFAULT. Rows written ` +
      `by webhooks and cron — which have no session to stamp them — will land unowned and be ` +
      `invisible to every screen. Run seeds/517_org_default.sql:\n    ${without.join('\n    ')}`,
    );
  }
  if (orgCount > 1 && withDefault.length > 0) {
    problems.push(
      `${orgCount} organisations exist and ${withDefault.length} table(s) still carry an org_id ` +
      `DEFAULT. Every session-less insert is now silently attributed to one firm. Re-run ` +
      `seeds/517_org_default.sql — it drops the defaults itself:\n    ${withDefault.join('\n    ')}`,
    );
  }

  // Unowned rows. Counted per table so the report names where to look, not just that a problem exists.
  const unowned = [];
  for (const t of [...live].sort()) {
    const { rows: [{ n }] } = await client.query(`SELECT count(*)::int n FROM ${JSON.stringify(t).replace(/"/g, '"')} WHERE org_id IS NULL`);
    if (n > 0) unowned.push(`${t} (${n})`);
  }
  if (unowned.length) {
    problems.push(
      `${unowned.length} table(s) hold rows with no org_id. They exist in the database and are ` +
      `invisible to every scoped session:\n    ${unowned.join('\n    ')}`,
    );
  }

  await client.end();

  console.log(`Tables carrying org_id: ${live.size} · listed in lib/saas/org-scope.ts: ${listed.size}`);
  console.log(`Organisations: ${orgCount} · tables with an org_id DEFAULT: ${withDefault.length}`);

  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  · ${p}\n`);
    process.exit(1);
  }
  console.log('\n✓ Every table carrying org_id is scoped in the app, every listed table has the column,');
  console.log('  the DEFAULT matches the organisation count, and no row is unowned.');
}
