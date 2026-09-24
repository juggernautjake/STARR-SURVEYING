// scripts/sync-surveyor-roster.mjs — keep a local copy of the State's list of licensed surveyors.
//
//   node scripts/sync-surveyor-roster.mjs            # fetch and upsert
//   node scripts/sync-surveyor-roster.mjs --dry-run  # fetch, report, write nothing
//
// TBPELS regenerates the RPLS roster daily as a CSV of roughly 5,400 licences. Kept locally because
// verification then costs a join instead of a network call — which matters at 8,000 documents, and
// matters more when the network is the thing that fails.
//
// ── CURL, NOT FETCH ─────────────────────────────────────────────────────────────────────────────
//
// The same lesson the county survey learned on 2026-09-21: node's fetch (undici) presents a TLS
// fingerprint that some hosts refuse with a 403 where curl gets a 200, and a survey built on the
// failing one produced two full runs of wrong answers before anybody checked. Shelling out to curl
// is less elegant and it works.
//
// ── A SHORT ROSTER IS A BROKEN ROSTER ───────────────────────────────────────────────────────────
//
// If the download returns a truncated or empty file and it is upserted anyway, verification quietly
// starts reporting real licences as "not on the register" — which looks exactly like a data-quality
// finding rather than a broken sync. So a file with implausibly few rows is refused outright.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const URL = 'https://tbpedownloads.s3-us-west-2.amazonaws.com/rpls_roster.csv';
/** The roster has been ~5,400 rows. Anything under this is a failed download wearing a CSV hat. */
const MIN_PLAUSIBLE_ROWS = 3000;

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = l.indexOf('='); if (i < 1 || l.trim().startsWith('#')) continue;
    const k = l.slice(0, i).trim(); if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** A CSV line reader that respects quoted fields — names contain commas. */
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

const tmp = path.join(os.tmpdir(), `rpls_roster_${Date.now()}.csv`);
console.log(`fetching ${URL}`);
try {
  execFileSync('curl', ['-sSL', '--max-time', '120', '-o', tmp, URL], { stdio: ['ignore', 'inherit', 'inherit'] });
} catch (e) {
  console.error(`download failed: ${e?.message ?? e}`);
  process.exit(1);
}

const text = fs.readFileSync(tmp, 'utf8');
const lines = text.split(/\r?\n/).filter((l) => l.trim());
console.log(`${lines.length - 1} row(s), ${(text.length / 1024).toFixed(0)} KB`);

if (lines.length - 1 < MIN_PLAUSIBLE_ROWS) {
  console.error(`REFUSED: only ${lines.length - 1} rows. The roster has been ~5,400; a short file means the download failed, and upserting it would make real licences look unregistered.`);
  process.exit(1);
}

const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
const col = (n) => header.indexOf(n);
const iNum = col('rpls'), iStatus = col('status'), iLast = col('last name'), iFirst = col('first name'),
  iMiddle = col('middle name'), iGranted = col('granted'), iExpires = col('expires'),
  iFirmNum = col('firm num'), iFirmName = col('firm name');
if (iNum < 0 || iLast < 0) {
  console.error(`REFUSED: the CSV header changed — got [${header.join(', ')}]. A silent column shift would fill the table with the wrong fields.`);
  process.exit(1);
}

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '').trim()) ? s.trim() : null);

// Keyed by number rather than appended: the roster carries a few licences twice (reissued), and an
// upsert batch that touches one key twice is refused outright by Postgres — "ON CONFLICT DO UPDATE
// command cannot affect row a second time" — which fails the whole batch, not the duplicate row.
// The file is in ascending order, so last write wins is the current record.
const byNum = new Map();
let skipped = 0;
for (const line of lines.slice(1)) {
  const f = parseCsvLine(line);
  const num = String(f[iNum] ?? '').replace(/\D/g, '').replace(/^0+(?=.)/, '');
  if (!num) { skipped += 1; continue; }
  if (byNum.has(num)) skipped += 1;
  const first = f[iFirst] ?? '', middle = f[iMiddle] ?? '', last = f[iLast] ?? '';
  byNum.set(num, {
    rpls_number: num,
    status: (f[iStatus] ?? '').trim() || null,
    last_name: last.trim() || null,
    first_name: first.trim() || null,
    middle_name: middle.trim() || null,
    full_name: norm(`${first} ${last}`) || null,
    granted_on: date(f[iGranted]),
    expires_on: date(f[iExpires]),
    firm_number: (f[iFirmNum] ?? '').trim() || null,
    firm_name: (f[iFirmName] ?? '').trim() || null,
    source: 'tbpels',
    synced_at: new Date().toISOString(),
  });
}
const rows = [...byNum.values()];

const byStatus = {};
for (const r of rows) byStatus[r.status ?? '—'] = (byStatus[r.status ?? '—'] ?? 0) + 1;
console.log(`\n${rows.length} licence(s) parsed, ${skipped} skipped (no number, or a repeat)`);
console.log('by status:');
for (const [k, v] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${v}`);

if (DRY) { console.log('\nDry run — nothing written.'); fs.unlinkSync(tmp); process.exit(0); }

let written = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const { error } = await db.from('surveyor_roster').upsert(batch, { onConflict: 'rpls_number' });
  if (error) { console.error(`  batch at ${i} failed: ${error.message}`); continue; }
  written += batch.length;
  console.log(`  ${written}/${rows.length}`);
}
fs.unlinkSync(tmp);
console.log(`\n${written} licence(s) on file.`);
