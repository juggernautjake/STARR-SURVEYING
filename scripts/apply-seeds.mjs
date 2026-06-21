// scripts/apply-seeds.mjs
//
// Apply the full ordered seed set to the database in one command.
//
//   npm run db:seed              # apply every NNN_*.sql in numeric order,
//                                # SKIPPING the destructive 000_reset.sql.
//   npm run db:seed:reset        # same, but run 000_reset.sql FIRST
//                                # (TRUNCATES every table — wipes all rows!).
//   node scripts/apply-seeds.mjs --from 220   # only files with prefix >= 220
//   node scripts/apply-seeds.mjs --only 092_phase13_tables.sql
//   node scripts/apply-seeds.mjs --dry-run     # list the plan, connect, apply nothing
//
// Why this exists: the seeds are numbered for ordering (000, 001, 010, …,
// 243) and almost all are idempotent — every CREATE TABLE uses
// IF NOT EXISTS and data inserts use ON CONFLICT — so re-running the set
// against a live DB creates anything missing and upserts config without
// dropping data. The ONE exception is 000_reset.sql, which TRUNCATEs every
// table; it is excluded unless you pass --reset.
//
// Connection: reads SUPABASE_DB_URL from the environment, falling back to
// parsing it out of .env.local (so it works without dotenv installed).
// Per memory/project_apply_seeds_to_supabase.md the node-pg path is the
// one that actually connects (the supabase CLI paths fail here).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const SEEDS_DIR = path.join(REPO_ROOT, 'seeds');

// ── args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getOpt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const INCLUDE_RESET = hasFlag('--reset');
const DRY_RUN = hasFlag('--dry-run');
const ONLY = getOpt('--only'); // exact filename
const FROM = getOpt('--from'); // numeric prefix lower bound

// ── resolve the DB url ──────────────────────────────────────────────
function readDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return null;
}

// ── build the ordered file list ─────────────────────────────────────
// Only NNN_*.sql files (numeric prefix). Non-numbered one-offs like
// audit_*.sql and README_*.md are intentionally excluded — they are
// maintenance scripts, not part of the canonical seed order.
function planFiles() {
  const numeric = /^(\d{3})_.*\.sql$/;
  let files = fs
    .readdirSync(SEEDS_DIR)
    .filter((f) => numeric.test(f))
    .map((f) => ({ f, n: parseInt(f.match(numeric)[1], 10) }))
    .sort((a, b) => (a.n - b.n) || a.f.localeCompare(b.f))
    .map((x) => x.f);

  if (ONLY) return files.filter((f) => f === ONLY);
  if (!INCLUDE_RESET) files = files.filter((f) => f !== '000_reset.sql');
  if (FROM) files = files.filter((f) => parseInt(f.slice(0, 3), 10) >= parseInt(FROM, 10));
  return files;
}

async function main() {
  const dbUrl = readDbUrl();
  if (!dbUrl) {
    console.error('✗ SUPABASE_DB_URL not set and not found in .env.local.');
    process.exit(2);
  }

  const files = planFiles();
  if (files.length === 0) {
    console.error('✗ No matching seed files.');
    process.exit(2);
  }

  console.log(`Plan: ${files.length} seed file(s)${INCLUDE_RESET ? ' (INCLUDING 000_reset — TRUNCATES ALL TABLES)' : ' (000_reset excluded)'}`);
  if (INCLUDE_RESET) {
    console.log('⚠  --reset will DELETE ALL ROWS in every table before re-seeding.');
  }
  if (DRY_RUN) {
    files.forEach((f) => console.log('  · ' + f));
    console.log('dry-run: connecting to verify credentials, applying nothing.');
  }

  // connect with a few retries (the pooler occasionally refuses the first hit)
  let client;
  for (let attempt = 1; attempt <= 5; attempt++) {
    client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    try { await client.connect(); break; }
    catch (e) {
      console.error(`  connect attempt ${attempt}/5 failed: ${e.code || ''} ${e.message}`);
      if (attempt === 5) process.exit(3);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (DRY_RUN) { await client.end(); console.log('✓ connection OK (dry-run done).'); return; }

  let applied = 0;
  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(SEEDS_DIR, f), 'utf8');
      try {
        await client.query(sql);
        applied++;
        console.log(`  ✓ ${String(applied).padStart(3)}/${files.length}  ${f}`);
      } catch (e) {
        console.error(`\n✗ FAILED on ${f}: ${e.code || ''} ${e.message}`);
        if (e.position) {
          const p = parseInt(e.position, 10);
          console.error('  near: …' + sql.slice(Math.max(0, p - 160), p + 100).replace(/\s+/g, ' ') + '…');
        }
        console.error(`\nStopped after ${applied} file(s). Fix the SQL above, then re-run` +
          ` (idempotent files already applied are safe to re-run, or use --from ${f.slice(0, 3)}).`);
        await client.end();
        process.exit(1);
      }
    }
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }

  console.log(`\n✓ Done — applied ${applied}/${files.length} seed file(s).`);
}

main().catch((e) => { console.error('OUTER', e?.stack || e); process.exit(3); });
