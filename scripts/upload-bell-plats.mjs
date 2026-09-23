#!/usr/bin/env node
// scripts/upload-bell-plats.mjs — put the plat FILES where the document viewer can open them.
//
// ── WHY THE URL-ONLY IMPORT WAS NOT ENOUGH ──────────────────────────────────────────────────────
//
// `import-bell-plats.mjs` registered 8,078 plats as library rows pointing at bellcountytx.com. That
// answers "does a plat exist for this subdivision" — but the document viewer resolves a file from
// `storage_path` (for the signed download) and `pages_pdf_url` (to render inline), and a row with
// neither shows a person nothing. The archive was searchable and unopenable.
//
// It was also the wrong bet on durability. The county's own index carries three links to files its
// server does not have — CHIMNEY CORNERS REPLAT, T S I D SUB 1 REPLAT, and one with a literal `#`
// where the folder should be. A library of pointers fails precisely when the county reorganises,
// which is the case it exists to survive. We downloaded 19 GB so we would not depend on them; the
// import then depended on them anyway.
//
// ── WHY THE PUBLIC BUCKET IS RIGHT FOR THESE, AND ONLY THESE ────────────────────────────────────
//
// `research-documents` is a public bucket, which is a real problem for the customer work also in
// it and is a separate fix. For county plats it is not a problem at all: these are public records
// the county serves to anyone without a login. A public URL is what they already are.
//
//   node scripts/upload-bell-plats.mjs --dry-run
//   node scripts/upload-bell-plats.mjs --limit 25
//   node scripts/upload-bell-plats.mjs

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ROOT = process.env.BELL_PLAT_DIR || 'C:/Users/Jacob Maddux/BellCountyPlats';
const BUCKET = 'research-documents';
const PREFIX = 'library/bell/plats';
const MAX_BYTES = 50 * 1024 * 1024; // the bucket's own limit, seeds/102

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const dryRun = Boolean(arg('dry-run'));
const limit = Number(arg('limit', 0)) || Infinity;

const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const SUPA_URL = get('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const DB_URL = get('SUPABASE_DB_URL');
if (!SUPA_URL || !SERVICE_KEY || !DB_URL) { console.error('missing Supabase config in .env.local'); process.exit(1); }

const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

// The rows the URL-only import created, in the order a person would read them.
const { rows } = await db.query(
  `select id, document_label, original_filename, source_url, storage_path
     from research_documents
    where county_fips = 'bell' and provenance = 'public_record' and document_type = 'plat'
    order by document_label`);
console.log(`${rows.length} library rows; ${rows.filter((r) => r.storage_path).length} already have a file`);

// Map a row back to the file on disk by the county's own filename.
const onDisk = new Map();
for (const letter of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, letter);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.part')) continue;
    onDisk.set(f, path.join(dir, f));
  }
}
console.log(`${onDisk.size} files on disk`);

/** Storage keys allow a narrow alphabet; the county's names do not. */
const keyFor = (filename) =>
  `${PREFIX}/${filename.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_')}`;

async function upload(key, bytes) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'content-type': 'application/pdf',
      'cache-control': '31536000',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  return `${SUPA_URL}/storage/v1/object/public/${BUCKET}/${key}`;
}

let done = 0, skipped = 0, missing = 0, failed = 0, bytesUp = 0, n = 0;
for (const row of rows) {
  if (n >= limit) break;
  n++;
  if (row.storage_path) { skipped++; continue; }

  const file = onDisk.get(row.original_filename);
  if (!file) { missing++; if (missing <= 5) console.error(`  no file on disk for ${row.document_label}`); continue; }

  const stat = fs.statSync(file);
  if (stat.size > MAX_BYTES) {
    failed++;
    console.error(`  TOO BIG (${(stat.size / 1024 / 1024).toFixed(1)} MB) ${row.document_label}`);
    continue;
  }
  if (dryRun) { done++; bytesUp += stat.size; continue; }

  try {
    const key = keyFor(row.original_filename);
    const publicUrl = await upload(key, fs.readFileSync(file));
    await db.query(
      // `storage_path` is what the download route signs; `pages_pdf_url` is what the viewer opens
      // inline. A row needs both or it is visible in search and dead on click.
      `update research_documents
          set storage_path = $2, storage_url = $3, pages_pdf_url = $3,
              file_type = 'pdf', file_size_bytes = $4, page_count = coalesce(page_count, 1)
        where id = $1`,
      [row.id, key, publicUrl, stat.size]);
    done++;
    bytesUp += stat.size;
    if (done % 250 === 0) console.log(`  ${done} uploaded (${(bytesUp / 1024 / 1024 / 1024).toFixed(2)} GB)…`);
  } catch (e) {
    failed++;
    if (failed <= 5) console.error(`  FAILED ${row.document_label}: ${e.message.slice(0, 100)}`);
  }
}

console.log(`\n${dryRun ? 'would upload' : 'uploaded'}: ${done}  (${(bytesUp / 1024 / 1024 / 1024).toFixed(2)} GB)`);
console.log(`already had a file: ${skipped}   no file on disk: ${missing}   failed: ${failed}`);
if (!dryRun) {
  const c = await db.query(
    `select count(*)::int n from research_documents
      where county_fips='bell' and document_type='plat' and storage_path is not null`);
  console.log(`openable in the viewer: ${c.rows[0].n}`);
}
await db.end();
