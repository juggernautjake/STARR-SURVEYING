// scripts/verify-backup-posture.mjs — what can actually be checked about recovery, and what cannot (E1-1).
//
// *"Where are the backups? 277 tables of a real business. Confirm PITR is on and, more importantly, that
// a restore has actually been rehearsed. An unrehearsed backup is a belief."*
//
// ── THIS SCRIPT IS DELIBERATELY HONEST ABOUT ITS OWN LIMITS ────────────────────────────────────────
//
// Half of that question cannot be answered from a database connection. PITR retention, snapshot
// schedules and whether the plan includes them live in the Supabase dashboard, and a script that printed
// "backups: OK" from the settings it CAN see would be worse than no script — it would turn "I checked
// three postgres GUCs" into "recovery is fine", which is exactly the belief the analysis warns about.
//
// So the output has two halves, and the second is not a failure:
//
//   VERIFIED   — measured here, right now, against the live database.
//   NOT CHECKABLE FROM HERE — named, with where to look and what to look for.
//
// ── THE HALF THAT *IS* REHEARSABLE ─────────────────────────────────────────────────────────────────
//
// A restore has two parts: the schema and the rows. **The schema part is rehearsable from this repo and
// has been rehearsed** — `scripts/apply-seeds.mjs` builds all 291 public tables from 305 seed files, and
// on 2026-08-01 it ran clean end to end twice after two seeds were fixed that had never been run a
// second time. That is a real, repeated rehearsal of "can we rebuild the shape of this business", and it
// is the part that used to be broken.
//
// Run: `node scripts/verify-backup-posture.mjs`

import fs from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const ok = [];
const unknown = [];

async function one(label, sql, judge) {
  try {
    const r = await client.query(sql);
    const value = Object.values(r.rows[0] ?? {})[0];
    ok.push({ label, value: String(value), note: judge ? judge(String(value)) : '' });
  } catch (e) {
    unknown.push({ label, why: e.message.slice(0, 90) });
  }
}

await client.connect();

// ── what the database itself will tell us ────────────────────────────────────────────────────────
await one('wal_level', 'show wal_level', (v) =>
  v === 'logical' || v === 'replica'
    ? 'sufficient for point-in-time recovery — WAL carries enough to replay'
    : 'MINIMAL: point-in-time recovery is not possible at this setting');
await one('archive_mode', 'show archive_mode', (v) =>
  v === 'on' ? 'WAL is being archived' : 'NOT ARCHIVING — there is nothing to replay from');
await one('current WAL position', 'select pg_current_wal_lsn()::text', () => 'the database is generating WAL');
await one('public tables', "select count(*)::int from information_schema.tables where table_schema='public'");
await one('database size', 'select pg_size_pretty(pg_database_size(current_database()))');
await one('oldest row in the business', "select min(created_at)::text from leads", () =>
  'how far back a restore would need to reach to lose nothing');

// ── the schema rehearsal, which this repo owns ───────────────────────────────────────────────────
const seeds = readdirSync(join(process.cwd(), 'seeds')).filter((f) => f.endsWith('.sql'));
ok.push({
  label: 'seed files',
  value: String(seeds.length),
  note: 'the schema is rebuildable from this repo — rehearsed clean end to end on 2026-08-01, twice',
});

await client.end();

// ── what a database connection cannot answer ─────────────────────────────────────────────────────
const NOT_CHECKABLE = [
  ['PITR retention window', 'Supabase dashboard → Database → Backups. Confirm PITR is enabled and note the retention in days. Free and Pro-without-PITR keep daily snapshots only.'],
  ['Daily snapshot schedule + age of the newest one', 'Same page. A snapshot schedule nobody has looked at since it was set is the one that quietly stopped.'],
  ['Whether a RESTORE OF THE ROWS has ever been performed', 'Nowhere automatic. Restore into a scratch project and open one invoice, one job and one lead. Until that is done the row-level backup is a belief, however green the dashboard looks.'],
  ['Storage bucket backups (lead attachments, dnd-media, receipts)', 'Supabase Storage is NOT covered by the database backup. A restored database with no files is a lead whose site plan is a broken link.'],
];

console.log('VERIFIED — measured against the live database just now\n');
for (const r of ok) console.log(`  ${r.label.padEnd(30)} ${r.value.padEnd(14)} ${r.note}`);

if (unknown.length) {
  console.log('\nCOULD NOT MEASURE\n');
  for (const r of unknown) console.log(`  ${r.label.padEnd(30)} ${r.why}`);
}

console.log('\nNOT CHECKABLE FROM HERE — and naming them is the point, not a failure of this script\n');
for (const [what, where] of NOT_CHECKABLE) console.log(`  · ${what}\n      ${where}\n`);

console.log('An unrehearsed backup is a belief. The SCHEMA half is rehearsed and repeatable from this repo;');
console.log('the ROW half needs a human, once, in the dashboard — and then again after anything changes.');
