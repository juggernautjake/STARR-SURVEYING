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
//
//   node scripts/apply-seeds.mjs --target staging   # STAGING_DB_URL instead of production
//   node scripts/apply-seeds.mjs --target <url>     # an explicit connection string
//
// ── WHY --target EXISTS (platform audit §8.2) ───────────────────────
//
// The audit's remaining Phase 0 item is *"stand up an actual staging Supabase project from these
// seeds"*, and the reason nobody had is visible right here: until now this script could only ever
// reach ONE database. Bootstrapping staging meant editing `.env.local` to point at it, running the
// seeds, and remembering to put production back — with `--reset` one forgotten edit away from
// TRUNCATE-ing every table in the live business.
//
// So the escape hatch and the guard ship together, because either alone is worse than neither: a way
// to point elsewhere makes the destructive flag easier to fire by accident, and a guard on a script
// that can only hit production just makes the one necessary path annoying.

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
// Keep going past a file that errors (e.g. an INSERT colliding with rows
// already live — many seeds are NOT fully idempotent). Each file manages
// its own BEGIN/COMMIT, so on failure we ROLLBACK to clear the connection's
// aborted-transaction state, record it, and move on.
const CONTINUE_ON_ERROR = hasFlag('--continue-on-error');
const ONLY = getOpt('--only'); // exact filename
const FROM = getOpt('--from'); // numeric prefix lower bound

const TARGET = getOpt('--target'); // 'staging' | 'production' | a connection string
const I_MEAN_IT = hasFlag('--yes-truncate-production');

// ── resolve the DB url ──────────────────────────────────────────────
function readEnv(name) {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`));
      if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return null;
}

/** @returns {{url: string|null, label: string, isProduction: boolean}} */
function resolveTarget() {
  if (TARGET && /^postgres(ql)?:\/\//.test(TARGET)) {
    // An explicit URL is never assumed safe: it may well BE production, typed out by hand.
    const prod = readEnv('SUPABASE_DB_URL');
    return { url: TARGET, label: 'explicit --target url', isProduction: !!prod && sameHost(TARGET, prod) };
  }
  if (TARGET === 'staging') {
    return { url: readEnv('STAGING_DB_URL'), label: 'STAGING_DB_URL', isProduction: false };
  }
  if (TARGET && TARGET !== 'production') {
    console.error(`✗ Unknown --target "${TARGET}". Use "staging", "production", or a postgres:// URL.`);
    process.exit(2);
  }
  return { url: readEnv('SUPABASE_DB_URL'), label: 'SUPABASE_DB_URL (production)', isProduction: true };
}

/** Compare by host+database only — credentials and pooler ports differ between equivalent URLs. */
function sameHost(a, b) {
  try {
    const pa = new URL(a), pb = new URL(b);
    return pa.hostname === pb.hostname && pa.pathname === pb.pathname;
  } catch { return false; }
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
  const target = resolveTarget();
  const dbUrl = target.url;
  if (!dbUrl) {
    console.error(`✗ ${target.label} not set and not found in .env.local.`);
    if (TARGET === 'staging') {
      console.error('  Create a staging Supabase project, then add STAGING_DB_URL=postgres://… to .env.local');
      console.error('  and run:  node scripts/apply-seeds.mjs --target staging --reset');
    }
    process.exit(2);
  }

  // ── The guard (platform audit §8.2) ───────────────────────────────
  //
  // `000_reset.sql` TRUNCATEs every table. Combined with a default target of production, that made
  // `npm run db:seed:reset` a single un-prompted command away from deleting the entire live business —
  // every job, every time log, every payroll run. It has been that way the whole time; nothing had
  // fired it yet, which is not the same as it being safe.
  //
  // Deliberately a distinct flag rather than an interactive prompt: a prompt is a reflex to dismiss,
  // and it does not survive the case that matters most — this running unattended from a script or CI.
  if (INCLUDE_RESET && target.isProduction && !I_MEAN_IT) {
    console.error('✗ REFUSING to run 000_reset.sql against PRODUCTION.');
    console.error(`  Target: ${target.label}`);
    console.error('  000_reset.sql TRUNCATEs every table — all jobs, time logs, payroll and receipts.');
    console.error('');
    console.error('  If you want a clean database, that is what staging is for:');
    console.error('      node scripts/apply-seeds.mjs --target staging --reset');
    console.error('  If you genuinely mean to wipe production, say so explicitly:');
    console.error('      node scripts/apply-seeds.mjs --reset --yes-truncate-production');
    process.exit(2);
  }

  console.log(`Target: ${target.label}${target.isProduction ? '  ⚠ PRODUCTION' : ''}`);

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
  const failures = [];
  try {
    for (const [i, f] of files.entries()) {
      const sql = fs.readFileSync(path.join(SEEDS_DIR, f), 'utf8');
      try {
        await client.query(sql);
        applied++;
        console.log(`  ✓ ${String(i + 1).padStart(3)}/${files.length}  ${f}`);
      } catch (e) {
        const detail = `${e.code || ''} ${e.message}`.trim();
        // Each file manages its own transaction; a mid-file error leaves the
        // connection in an aborted-transaction state, so reset it before the
        // next file. Harmless no-op if no transaction is open.
        await client.query('ROLLBACK').catch(() => {});

        if (!CONTINUE_ON_ERROR) {
          console.error(`\n✗ FAILED on ${f}: ${detail}`);
          if (e.position) {
            const p = parseInt(e.position, 10);
            console.error('  near: …' + sql.slice(Math.max(0, p - 160), p + 100).replace(/\s+/g, ' ') + '…');
          }
          console.error(`\nStopped after ${applied} file(s). Fix the SQL above, then re-run` +
            ` (or use --continue-on-error to skip already-applied / failing files, or --from ${f.slice(0, 3)}).`);
          await client.end();
          process.exit(1);
        }

        failures.push({ f, detail });
        console.log(`  ⤳ ${String(i + 1).padStart(3)}/${files.length}  ${f}  — skipped (${detail})`);
      }
    }
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }

  console.log(`\n✓ Done — ${applied}/${files.length} applied, ${failures.length} skipped.`);
  if (failures.length) {
    console.log('\nSkipped files (already-applied data or a real error — review):');
    for (const { f, detail } of failures) console.log(`  · ${f} — ${detail}`);
  }
}

main().catch((e) => { console.error('OUTER', e?.stack || e); process.exit(3); });
