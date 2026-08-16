// scripts/seed-reconcile.mjs — which seeds has the live database actually had applied?
//
// C48 of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// ── WHY THIS IS NOT A LOOKUP ────────────────────────────────────────────────────────────────────
//
// There is **no migration-tracking table**. Checked first: nothing in `public` matches
// `%migration%`, `%seed%` or `%schema_version%`. So "which seeds have been applied" cannot be
// answered by asking; it has to be inferred from what each seed CLAIMS to create and whether the
// live schema has it.
//
// That inference is sound in one direction and not the other, and the difference matters enough to
// be the first thing this prints:
//
//   * a seed whose declared table or column is MISSING has certainly not been applied;
//   * a seed whose objects are all present **probably** has been — but an `IF NOT EXISTS` seed
//     whose table was created by an earlier seed looks identical to one that ran.
//
// So the output is deliberately asymmetric. "Missing" is a finding. "Present" is not a claim that
// the seed ran, only that nothing it declares is absent — which is the property that actually
// matters before C49 applies anything.
//
// ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────────────────────────
//
// Seeds that only INSERT rows declare no schema, so they are reported separately as UNVERIFIABLE
// rather than folded into "present". Counting a data-only seed as applied because it created no
// columns would be the instrument manufacturing a clean number, which this document has paid for
// four times.
//
// Usage:  node scripts/seed-reconcile.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const AS_JSON = process.argv.includes('--json');
const SEED_DIR = 'seeds';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!url) {
  console.error('SUPABASE_DB_URL not found in .env.local');
  process.exit(1);
}

/** Objects a seed file declares. Comments are stripped first — several seeds document the shape
 *  they expect in prose, and counting that prose as a declaration would invent findings.
 *
 *  ── THE CRLF TRAP, WHICH THIS COST A FULL RUN ──────────────────────────────────────────────────
 *
 *  The first version stripped line comments with `l.replace(/--.*$/, '')` after splitting on '\n'.
 *  Every file in this repository is CRLF, so each of those lines ends with a stray '\r' — and in
 *  JavaScript `.` does NOT match '\r' (it excludes all four line terminators, not just '\n'). With
 *  no `m` flag, `$` means end of string, which the '\r' sits before. So the pattern matched
 *  NOTHING, on any line, of any seed.
 *
 *  The comment stripping was inert across all 392 files, and the run reported five seeds as
 *  unapplied on the strength of prose: "the CREATE TABLE above is a no-op" became a missing table
 *  named `above`. That it produced five findings rather than fifty is luck, not partial success —
 *  a silently disabled filter looks exactly like a filter with nothing to do.
 *
 *  Normalising the line endings first is the fix, and it is done before anything else reads the
 *  text so no later pattern can inherit the same blind spot. */
function declares(sql) {
  const code = sql
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

  const tables = new Set();
  const columns = new Set(); // "table.column"

  for (const m of code.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) {
    tables.add(m[1].toLowerCase());
  }
  for (const m of code.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi,
  )) {
    columns.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  }
  return { tables, columns };
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const liveTables = new Set(
  (await client.query(
    "select table_name from information_schema.tables where table_schema='public'",
  )).rows.map((r) => r.table_name.toLowerCase()),
);
const liveColumns = new Set(
  (await client.query(
    "select table_name, column_name from information_schema.columns where table_schema='public'",
  )).rows.map((r) => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`),
);
// Views satisfy a CREATE TABLE check too — a seed that later became a view is not "unapplied".
// Tracked separately as well, because the reverse check below has to tell a view created by
// `CREATE VIEW` (which this parser never looks for, so it is expected to be unmatched) from a base
// table nothing in the repo creates (which is real drift).
const liveViews = new Set(
  (await client.query(
    "select table_name from information_schema.views where table_schema='public'",
  )).rows.map((r) => r.table_name.toLowerCase()),
);
for (const v of liveViews) liveTables.add(v);

await client.end();

const files = fs
  .readdirSync(SEED_DIR)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

const rows = [];
for (const f of files) {
  const sql = fs.readFileSync(path.join(SEED_DIR, f), 'utf8');
  const { tables, columns } = declares(sql);
  const missingTables = [...tables].filter((t) => !liveTables.has(t));
  // A column on a table that does not exist is not a second finding — the table is the finding.
  const missingColumns = [...columns].filter((c) => {
    const [t] = c.split('.');
    return liveTables.has(t) && !liveColumns.has(c);
  });
  const declaredCount = tables.size + columns.size;
  rows.push({
    seed: f,
    n: parseInt(f, 10),
    declaredTables: tables.size,
    declaredColumns: columns.size,
    missingTables,
    missingColumns,
    status:
      declaredCount === 0 ? 'UNVERIFIABLE'
        : missingTables.length || missingColumns.length ? 'MISSING'
          : 'PRESENT',
  });
}

// ── Drift the other way ─────────────────────────────────────────────────────────────────────────
//
// The reconciliation above only asks "does the database have what the repo declares". The reverse
// question turns out to matter more here: `calls` and `call_events` are live and NO seed in this
// repository creates them. The business-phone work applied its migrations directly and its seed
// files never landed in the repo, so the numbering is now ambiguous and the schema is
// unreproducible from a clean database.
//
// Reported rather than fixed. Writing DDL to match a live table is how a "migration" that does not
// actually match ships — the shape would be guessed from column names, and the constraints,
// defaults and indexes would be invented. What is useful is knowing the list.
//
// VIEWS are excluded. This parser only looks for `CREATE TABLE`, so every view in the database is
// unmatched by construction — folding them in would have reported 22 where 11 are real, and half a
// finding list that is an artefact is worse than none.
const declaredEverywhere = new Set(rows.flatMap((r) => [...declares(fs.readFileSync(path.join(SEED_DIR, r.seed), 'utf8')).tables]));
const orphanTables = [...liveTables]
  .filter((t) => !declaredEverywhere.has(t) && !liveViews.has(t))
  .sort();

if (AS_JSON) {
  console.log(JSON.stringify({ seeds: rows, tablesWithNoSeed: orphanTables }, null, 2));
} else {
  const missing = rows.filter((r) => r.status === 'MISSING');
  const unverifiable = rows.filter((r) => r.status === 'UNVERIFIABLE');
  const present = rows.filter((r) => r.status === 'PRESENT');

  console.log(`\n  ${rows.length} seed files, reconciled against the live schema\n`);
  console.log(`  PRESENT       ${present.length}   (nothing they declare is absent)`);
  console.log(`  MISSING       ${missing.length}   (certainly not applied)`);
  console.log(`  UNVERIFIABLE  ${unverifiable.length}   (declare no schema — data-only)\n`);

  if (missing.length) {
    console.log('  ── seeds whose declared objects are absent ──');
    for (const r of missing) {
      console.log(`     ${r.seed}`);
      for (const t of r.missingTables) console.log(`        table  ${t}`);
      for (const c of r.missingColumns) console.log(`        column ${c}`);
    }
    console.log('');
  }
  if (orphanTables.length) {
    console.log(`  ── ${orphanTables.length} live BASE TABLES that no seed in this repo creates ──`);
    console.log('     (drift the other way: applied directly, never committed. The schema is not');
    console.log('      reproducible from a clean database for these.)');
    for (const t of orphanTables) console.log(`     ${t}`);
    console.log('');
  }

  console.log('  "PRESENT" is not a claim that the seed ran — an IF NOT EXISTS seed whose table an');
  console.log('  earlier seed created looks identical. It is the weaker and sufficient claim that');
  console.log('  nothing it declares is absent.\n');
  process.exitCode = missing.length > 0 ? 1 : 0;
}
