// scripts/audit-public-access.mjs — what can the PUBLIC key reach right now?
//
//   node scripts/audit-public-access.mjs
//
// The anon key ships inside every browser bundle and the mobile app, so anything it can read is
// public. On 2026-10-05 it could read staff messages, hours, Google Ads OAuth tokens and operator
// password hashes (closed by seeds/665–668). This asks the live database the same question an
// outsider would, and exits non-zero if the answer is anything but "only what we meant".
//
// Reads SUPABASE_DB_URL (catalogue) and NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// (the probe) from the environment or .env.local. Read-only: every probe is a SELECT … LIMIT 1 or a
// privilege check; nothing is written.

import fs from 'node:fs';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

/** Readable with a signed-in user's session, on purpose. Anything else reachable is a finding. */
const INTENDED_AUTHENTICATED_READS = new Set(['equipment_events', 'project_cleanup_log', 'daily_time_logs']);

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0 && !line.startsWith('#') && !(line.slice(0, i).trim() in env)) {
        env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
      }
    }
  } catch { /* environment only */ }
  return env;
}

const env = loadEnv();
const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const findings = [];

// 1. Tables with RLS off — readable by default grants.
const noRls = await db.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity`);
for (const r of noRls.rows) findings.push(`table without RLS: ${r.relname}`);

// 2. Policies that let anon/public/authenticated through unconditionally.
const open = await db.query(`
  select tablename, policyname, cmd, roles::text roles from pg_policies
  where schemaname = 'public' and (qual = 'true' or with_check = 'true')
    and (roles::text like '%public%' or roles::text like '%anon%' or roles::text like '%authenticated%')`);
for (const r of open.rows) {
  if (r.roles === '{authenticated}' && r.cmd === 'SELECT' && INTENDED_AUTHENTICATED_READS.has(r.tablename)) continue;
  findings.push(`open policy: ${r.tablename}.${r.policyname} (${r.cmd} to ${r.roles})`);
}

// 3. Views anon may select (views bypass RLS by running as their owner).
const views = await db.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m') and has_table_privilege('anon', c.oid, 'SELECT')`);
for (const r of views.rows) findings.push(`view readable by anon: ${r.relname}`);

// 4. Security-definer functions anon may execute (RLS does not apply inside them).
const fns = await db.query(`
  select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  join pg_type t on t.oid = p.prorettype
  where n.nspname = 'public' and p.prosecdef and t.typname <> 'trigger'
    and has_function_privilege('anon', p.oid, 'EXECUTE')`);
for (const r of fns.rows) findings.push(`security-definer function callable by anon: ${r.sig}`);

// 5. The empirical check: actually try to read every public table with the anon key.
const tables = await db.query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v','m') order by 1`);
for (const { relname } of tables.rows) {
  const { data, error } = await anon.from(relname).select('*').limit(1);
  if (!error && data && data.length > 0) findings.push(`anon key READ a row from: ${relname}`);
}

await db.end();

if (findings.length === 0) {
  console.log(`✓ The public key reaches nothing it should not (${tables.rows.length} relations probed).`);
} else {
  console.error(`✗ ${findings.length} finding(s):\n  ` + findings.join('\n  '));
  process.exit(1);
}
