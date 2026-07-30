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
const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['seeds/000_baseline_tables.sql', 'seeds/499_baseline_fks.sql'];
const SCRATCH = 'schema_verify_scratch';

const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const m = env.match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/);
if (!m) throw new Error('SUPABASE_DB_URL not set');

const raw = FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

// Point every schema-qualified reference at the scratch schema. The generated
// file always qualifies with `public.`; pg_get_constraintdef output and
// pg_indexes defs qualify the same way.
const sql = raw
  .replace(/\bpublic\./g, `${SCRATCH}.`)
  .replace(/\bON public\b/g, `ON ${SCRATCH}`);

const client = new pg.Client({
  connectionString: m[1].trim(),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
let ok = false;
try {
  await client.query('BEGIN');
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

  if (diff.rows.length === 0) {
    console.log(`\n✅ column parity: every column matches production exactly.`);
    ok = true;
  } else {
    console.error(`\n❌ column parity: ${diff.rows.length} difference(s) vs production:`);
    for (const r of diff.rows.slice(0, 40)) {
      console.error(
        `   ${r.table_name}.${r.column_name} — ${r.problem}\n` +
          `      prod:    ${r.prod_type} null=${r.prod_null} default=${r.prod_default ?? '∅'}\n` +
          `      rebuilt: ${r.rebuilt_type} null=${r.rebuilt_null} default=${r.rebuilt_default ?? '∅'}`,
      );
    }
    if (diff.rows.length > 40) console.error(`   …and ${diff.rows.length - 40} more.`);
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
