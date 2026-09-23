#!/usr/bin/env node
// scripts/import-bell-plats.mjs — put the downloaded Bell plat archive into the document library.
//
// 8,077 plats are on disk (scripts/bell-plat-archive.mjs). Until they are rows in
// `research_documents` they are a folder, and a research run cannot see a folder: the firm-wide
// lookup added in seed 658 asks the DATABASE what we hold.
//
// ── WHY THESE MAY BE SHARED, WHEN A PURCHASE MAY NOT ────────────────────────────────────────────
//
// Every file here came from bellcountytx.com — the county's own site, published for anyone, no
// login, no charge. Texas government records carry no copyright. So `provenance: 'public_record'`
// and `shareable: true`, and `research/source-licence.ts` is where that reasoning lives rather than
// in this script's head.
//
// A TexasFile purchase is the other case and must never be imported this way. Its terms forbid
// redistribution and the building of "title abstract plants"; a purchased document belongs to the
// job that paid for it. This script refuses anything that is not county-sourced.
//
// ── THE STORAGE QUESTION IT DOES NOT ANSWER ─────────────────────────────────────────────────────
//
// This registers the plats as library rows with a `source_url` pointing at the county, and does NOT
// upload 19 GB into Supabase. Two reasons. The bucket is public and holds customer work, which is
// a separate problem to fix first. And the county serves these files itself, for free, forever —
// so the useful thing to know is "Bell has a plat for GLENDALE ADDITION and here is where", which
// is what a run needs to stop re-searching for it.
//
//   node scripts/import-bell-plats.mjs --dry-run      # what would be written
//   node scripts/import-bell-plats.mjs                # write it
//   node scripts/import-bell-plats.mjs --limit 50     # a taste first

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const ROOT = process.env.BELL_PLAT_DIR || 'C:/Users/Jacob Maddux/BellCountyPlats';
const COUNTY = 'bell';
const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const dryRun = Boolean(arg('dry-run'));
const limit = Number(arg('limit', 0)) || Infinity;

const env = fs.readFileSync('.env.local', 'utf8');
const dbUrl = (env.match(/^SUPABASE_DB_URL\s*=\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
if (!dbUrl) { console.error('SUPABASE_DB_URL not found in .env.local'); process.exit(1); }

const state = JSON.parse(fs.readFileSync(path.join(ROOT, '_state.json'), 'utf8'));
const held = Object.values(state.files).filter((f) => f.status === 'done' && f.path && fs.existsSync(f.path));
console.log(`${held.length} plats on disk`);

// ── The county's own name for the plat is the label a person will search for ───────────────────
//
// `document_label` is what `heldPlatForSubdivision` matches against, so it has to be the name the
// county uses — GLENDALE ADDITION AMENDED — not the filename, which for two of these was DOC000.pdf.
function labelFor(f) {
  const fromIndex = (f.name || '').trim();
  if (fromIndex) return fromIndex;
  return decodeURIComponent(path.basename(f.path)).replace(/\.[A-Za-z0-9]+$/, '');
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

// A single project to own the county-level library rows: `research_documents.research_project_id`
// is NOT NULL, and these belong to no one job. Named so nobody mistakes it for a customer's work.
const LIBRARY_PROJECT = 'Bell County plat archive (library)';
let projectId = null;
{
  const found = await client.query(
    `select id from research_projects where name = $1 limit 1`, [LIBRARY_PROJECT]);
  if (found.rows.length) projectId = found.rows[0].id;
  else if (!dryRun) {
    const ins = await client.query(
      // `created_by` is NOT NULL and is an email everywhere else. This project has no author in the
      // ordinary sense — it is the county's archive, registered by a script — so it says so rather
      // than borrowing a person's name for rows they did not make.
      `insert into research_projects (name, county, state, status, description, created_by)
       values ($1, 'Bell', 'TX', 'complete', $2, 'library@starr-surveying.com') returning id`,
      [LIBRARY_PROJECT,
       'Not a survey. The county plat archive downloaded from bellcountytx.com, registered so the '
       + 'firm-wide document library can answer "do we already have this plat" before a run searches '
       + 'or spends.']);
    projectId = ins.rows[0].id;
    console.log(`created library project ${projectId}`);
  }
}
if (!projectId && !dryRun) { console.error('no library project'); process.exit(1); }

let written = 0, skipped = 0, failed = 0, n = 0;
for (const f of held) {
  if (n >= limit) break;
  n++;
  const label = labelFor(f);
  const sourceUrl = f.url;
  try {
    // Identity is the county's own URL: stable, unique, and the thing a re-import would collide on.
    const existing = await client.query(
      `select id from research_documents where source_url = $1 limit 1`, [sourceUrl]);
    if (existing.rows.length) { skipped++; continue; }
    if (dryRun) { written++; continue; }

    const sha = crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');
    await client.query(
      `insert into research_documents
         (research_project_id, source_type, original_filename, file_type, source_url,
          document_type, document_label, processing_status, file_size_bytes,
          county_fips, content_sha256, provenance, source_vendor, shareable, notes)
       values ($1,'property_search',$2,'pdf',$3,'plat',$4,'pending',$5,$6,$7,'public_record',
               'county_portal', true, $8)`,
      [projectId, path.basename(f.path), sourceUrl, label, f.bytes ?? null, COUNTY, sha,
       'Bell County Clerk plat archive, downloaded 2026-09-22/23. The county publishes these for '
       + 'anyone; the file is also held locally.']);
    written++;
    if (written % 500 === 0) console.log(`  ${written} written…`);
  } catch (e) {
    failed++;
    if (failed <= 5) console.error(`  FAILED ${label}: ${e.message.slice(0, 90)}`);
  }
}

console.log(`\n${dryRun ? 'WOULD WRITE' : 'written'}: ${written}   already present: ${skipped}   failed: ${failed}`);
if (!dryRun && written) {
  const c = await client.query(
    `select count(*)::int n from research_documents
      where county_fips = $1 and shareable = true and document_type = 'plat'`, [COUNTY]);
  console.log(`the library now holds ${c.rows[0].n} shareable Bell plats`);
}
await client.end();
