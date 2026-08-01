// scripts/verify-baseline-schema.mjs
//
// Proves the reconstructed baseline schema actually builds, and that it matches
// production column-for-column. Rewrites every `public.` reference to a scratch
// schema, runs the files inside ONE transaction, then ROLLS BACK — nothing
// persists and production is untouched (Postgres DDL is transactional).
//
// Verifies: syntax, column types + precision, nullability, defaults, constraint
// definitions, index definitions, and that every foreign key resolves.
//
//   node scripts/verify-baseline-schema.mjs                 # the two baseline files
//   node scripts/verify-baseline-schema.mjs a.sql b.sql     # explicit, in apply order

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = process.cwd();
// Tables first, then the foreign keys — the same order run-all applies them in.
//
// `513_org_scoping.sql` is in the DEFAULT list because it ALTERs baseline tables — it puts `org_id`
// on 73 of them (D1). Leaving it out made the default run report 34 phantom mismatches: columns that
// exist in production, are owned by a seed in this repo, and simply were not in the file list. A
// verifier that cries wolf 34 times is one nobody runs.
const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['seeds/000_baseline_tables.sql', 'seeds/513_org_scoping.sql', 'seeds/499_baseline_fks.sql'];
const SCRATCH = 'schema_verify_scratch';

// ── Columns the baseline is EXPECTED not to have, and why it stays a short list ─────────────────────
//
// These three are added by seeds 503/505/506, which ALTER `jobs` to point at `leads`, `customers` and
// `lead_quotes` — tables that are not part of the baseline. Including those seeds here would drag most
// of the seed range in behind them, so the baseline legitimately stops short.
//
// This allowlist exists so the run can be GREEN when only these appear, and RED the moment anything
// else does. Without it the default run exits non-zero forever, and a check that always fails is a
// check nobody reads — the same failure mode as the false green above, arrived at from the other side.
// Keep it exact (`table.column`) and keep it short: every entry is a column this script has stopped
// checking, so a wildcard here would quietly switch off the parity guarantee it exists to provide.
const EXPECTED_MISSING = new Set([
  'jobs.accepted_quote_id', // seed 505 — REFERENCES lead_quotes
  'jobs.customer_id',       // seed 503 — REFERENCES customers
  'jobs.origin_lead_id',    // seed 506 — REFERENCES leads
]);

const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const m = env.match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/);
if (!m) throw new Error('SUPABASE_DB_URL not set');

const raw = FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

// Point every schema-qualified reference at the scratch schema. The generated
// file always qualifies with `public.`; pg_get_constraintdef output and
// pg_indexes defs qualify the same way.
const sql = raw
  .replace(/\bpublic\./g, `${SCRATCH}.`)
  .replace(/\bON public\b/g, `ON ${SCRATCH}`)
  // ── STRIP THE SEED'S OWN TRANSACTION CONTROL, or this script's central promise is a lie ──────
  //
  // This file's header says *"runs the files inside ONE transaction, then ROLLS BACK — nothing
  // persists and production is untouched"*. A seed containing its own `BEGIN; … COMMIT;` breaks that
  // outright: the seed's COMMIT ends the wrapper transaction, the later ROLLBACK has nothing left to
  // undo, and the scratch schema is committed into production.
  //
  // Found 2026-08-01, by seed 513 doing exactly that. The symptom was quiet and compounding — a leaked
  // `schema_verify_scratch` that the NEXT run then diffed against instead of a fresh build, reporting
  // ZERO mismatches. A green tick meaning the opposite of what it says, on the one check standing
  // between this repo and a database nobody can rebuild.
  //
  // Only bare statement-level keywords on their own line are stripped — never a `BEGIN` inside a
  // `DO $$ … $$` block, which is PL/pgSQL and means something entirely different.
  .replace(/^[ \t]*(BEGIN|COMMIT|ROLLBACK)[ \t]*;[ \t]*$/gim, '-- (transaction control stripped by verify-baseline-schema)');

const client = new pg.Client({
  connectionString: m[1].trim(),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
let ok = false;
try {
  await client.query('BEGIN');
  // DROP FIRST, and it is not belt-and-braces — it fixes a FALSE GREEN.
  //
  // Observed 2026-08-01: a run left `schema_verify_scratch` behind (the footer says so, and says
  // nothing else about it), and the NEXT run then reported **0 mismatches** — because it was diffing
  // production against the stale schema from last time rather than against a fresh build. A schema
  // verifier whose second run always says "clean" is worse than no verifier: it is a green tick that
  // means the opposite of what it says, on the one check standing between the repo and a database
  // nobody can rebuild.
  await client.query(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE`);
  await client.query(`CREATE SCHEMA ${SCRATCH}`);
  // Extensions live in public/extensions; make their functions reachable.
  await client.query(`SET LOCAL search_path TO ${SCRATCH}, public, extensions`);
  await client.query(sql);

  const t = await client.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = $1 and table_type = 'BASE TABLE'`,
    [SCRATCH],
  );
  const i = await client.query(
    `select count(*)::int as n from pg_indexes where schemaname = $1`,
    [SCRATCH],
  );
  const f = await client.query(
    `select count(*)::int as n from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
       join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = $1 and con.contype = 'f'`,
    [SCRATCH],
  );

  console.log(`✅ ${FILES.join(" + ")} build cleanly from empty.`);
  console.log(`   tables:      ${t.rows[0].n}`);
  console.log(`   indexes:     ${i.rows[0].n}`);
  console.log(`   foreign keys:${String(f.rows[0].n).padStart(4)}`);

  // ── Parity: every reconstructed column must match production exactly ────
  // Generated FROM production, so this should be clean — but a rendering bug
  // (a dropped default, a widened type) would otherwise ship silently.
  const diff = await client.query(
    `with s as (
       select table_name, column_name, data_type, character_maximum_length,
              numeric_precision, numeric_scale, is_nullable, column_default
         from information_schema.columns where table_schema = $1
     ), p as (
       select table_name, column_name, data_type, character_maximum_length,
              numeric_precision, numeric_scale, is_nullable, column_default
         from information_schema.columns where table_schema = 'public'
     )
     select coalesce(s.table_name, p.table_name)   as table_name,
            coalesce(s.column_name, p.column_name) as column_name,
            case when s.column_name is null then 'MISSING in rebuild'
                 when p.column_name is null then 'EXTRA in rebuild'
                 else 'MISMATCH' end               as problem,
            p.data_type   as prod_type,   s.data_type   as rebuilt_type,
            p.is_nullable as prod_null,   s.is_nullable as rebuilt_null,
            p.column_default as prod_default, s.column_default as rebuilt_default
       from s full outer join p
         on s.table_name = p.table_name and s.column_name = p.column_name
      where p.table_name in (select table_name from s)
        and (s.column_name is null
          or p.column_name is null
          or s.data_type is distinct from p.data_type
          or s.character_maximum_length is distinct from p.character_maximum_length
          or s.numeric_precision is distinct from p.numeric_precision
          or s.numeric_scale is distinct from p.numeric_scale
          or s.is_nullable is distinct from p.is_nullable
          or replace(coalesce(s.column_default,''), '${SCRATCH}.', 'public.')
             is distinct from coalesce(p.column_default,''))
      order by 1, 2`,
    [SCRATCH],
  );

  // Only allowlist MISSING columns — an EXTRA or a MISMATCH on the same column would be a real defect
  // (a type that drifted, a default that vanished) and must still fail.
  const explained = diff.rows.filter(
    (r) => r.problem === 'MISSING in rebuild' && EXPECTED_MISSING.has(`${r.table_name}.${r.column_name}`),
  );
  const unexplained = diff.rows.filter((r) => !explained.includes(r));

  if (explained.length) {
    console.log(`\n○ ${explained.length} expected gap(s), added by later seeds outside the baseline:`);
    for (const r of explained) console.log(`   ${r.table_name}.${r.column_name}`);
  }

  if (unexplained.length === 0) {
    console.log(`\n✅ column parity: every column matches production exactly.`);
    ok = true;
  } else {
    console.error(`\n❌ column parity: ${unexplained.length} unexpected difference(s) vs production:`);
    for (const r of unexplained.slice(0, 40)) {
      console.error(
        `   ${r.table_name}.${r.column_name} — ${r.problem}\n` +
          `      prod:    ${r.prod_type} null=${r.prod_null} default=${r.prod_default ?? '∅'}\n` +
          `      rebuilt: ${r.rebuilt_type} null=${r.rebuilt_null} default=${r.rebuilt_default ?? '∅'}`,
      );
    }
    if (unexplained.length > 40) console.error(`   …and ${unexplained.length - 40} more.`);
    ok = false;
  }
} catch (e) {
  console.error(`❌ ${FILES.join(' + ')} failed to build:\n`);
  console.error(e.message);
  if (e.position) {
    const pos = Number(e.position);
    console.error('\n--- context ---');
    console.error(sql.slice(Math.max(0, pos - 400), pos + 200));
  }
} finally {
  // Always roll back — the scratch schema and everything in it disappear.
  await client.query('ROLLBACK');
  const left = await client.query(
    `select count(*)::int as n from information_schema.schemata where schema_name = $1`,
    [SCRATCH],
  );
  console.log(`\nrolled back — scratch schema remaining: ${left.rows[0].n} (expected 0)`);
  await client.end();
}
process.exit(ok ? 0 : 1);
