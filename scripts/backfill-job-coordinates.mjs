// scripts/backfill-job-coordinates.mjs
//
// Fill jobs.latitude / jobs.longitude from the address already on the job.
//
//   node scripts/backfill-job-coordinates.mjs --dry-run    # show what would be looked up
//   node scripts/backfill-job-coordinates.mjs              # do it
//   node scripts/backfill-job-coordinates.mjs --limit 20   # a few at a time
//   node scripts/backfill-job-coordinates.mjs --force      # re-geocode jobs that already have coords
//
// Why this exists: the columns have been on `jobs` since the baseline schema and nothing has ever
// written them. The job form asked Google Places for an address and discarded the coordinates that
// came back with it (fixed 2026-09-18), so every job created before that has an address and no
// position. The global property map cannot fly anywhere without them.
//
// Costs money — one Google Geocoding call per job — so it is a script you run rather than something
// that happens on page load, it skips jobs that already have coordinates unless told otherwise, and
// it prints a running count so you can stop it.
//
// Rate: Google's limit is well above what this does, but the requests are spaced anyway. A backfill
// that finishes in four minutes instead of three is not worth a burst that trips a quota.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

// ── env ─────────────────────────────────────────────────────────────
// Read from .env.local the same way the other scripts here do, so this works without dotenv.
const envPath = path.join(REPO_ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const DRY = has('--dry-run');
const FORCE = has('--force');
const LIMIT = Number(opt('--limit', '500'));
const PAUSE_MS = Number(opt('--pause', '120'));

const KEY = (process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || '')
  .trim().replace(/^["']|["']$/g, '');
if (!KEY && !DRY) {
  console.error('No GOOGLE_MAPS_SERVER_KEY (or GOOGLE_MAPS_API_KEY) — nothing to geocode with.');
  process.exit(1);
}

// Mirrors lib/maps/geocode.ts buildGeocodeQuery. Kept as a copy rather than an import because this
// is a plain .mjs script and that module is TypeScript; the two are covered by the same test.
function buildQuery(j) {
  const street = (j.address ?? '').trim();
  const city = (j.city ?? '').trim();
  const zip = (j.zip ?? '').trim();
  const county = (j.county ?? '').trim();
  const state = (j.state ?? '').trim() || 'TX';
  if (!street) return null;
  if (!city && !zip && !county) return null;
  return [street, city || county, state, zip].filter(Boolean).join(', ');
}

async function geocode(query) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', KEY);
  url.searchParams.set('region', 'us');
  url.searchParams.set('components', 'country:US');
  const res = await fetch(url);
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const body = await res.json().catch(() => ({}));
  if (body.status !== 'OK') return { ok: false, error: body.status || 'NO_STATUS' };
  const first = (body.results ?? [])[0];
  const at = first?.geometry?.location;
  if (typeof at?.lat !== 'number' || typeof at?.lng !== 'number' || (at.lat === 0 && at.lng === 0)) {
    return { ok: false, error: 'no usable coordinates' };
  }
  return {
    ok: true,
    lat: at.lat,
    lng: at.lng,
    formatted: first?.formatted_address ?? query,
    precision: first?.geometry?.location_type ?? 'UNKNOWN',
  };
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const where = FORCE ? '' : 'AND (latitude IS NULL OR longitude IS NULL)';
const { rows } = await client.query(
  `SELECT id, job_number, name, address, city, county, state, zip, latitude, longitude
     FROM jobs
    WHERE address IS NOT NULL AND btrim(address) <> '' ${where}
    ORDER BY created_at DESC
    LIMIT $1`, [LIMIT]);

console.log(`${rows.length} job(s) to look at${DRY ? '  (dry run)' : ''}\n`);

let done = 0, skipped = 0, failed = 0;
const problems = [];

for (const job of rows) {
  const label = `${job.job_number ?? job.id.slice(0, 8)}  ${(job.name ?? '').slice(0, 40)}`;
  const query = buildQuery(job);
  if (!query) {
    skipped++;
    problems.push(`${label} — too little address to place it (${[job.address, job.city, job.zip].filter(Boolean).join(' / ') || 'nothing'})`);
    continue;
  }

  if (DRY) { console.log(`  would geocode  ${label}\n                 ${query}`); done++; continue; }

  const hit = await geocode(query);
  if (!hit.ok) {
    failed++;
    problems.push(`${label} — ${hit.error}  [${query}]`);
  } else {
    await client.query('UPDATE jobs SET latitude = $1, longitude = $2 WHERE id = $3', [hit.lat, hit.lng, job.id]);
    done++;
    const rough = hit.precision !== 'ROOFTOP' && hit.precision !== 'RANGE_INTERPOLATED' ? `  ⚠ ${hit.precision}` : '';
    console.log(`  ${String(done).padStart(3)}  ${label}  →  ${hit.lat.toFixed(6)}, ${hit.lng.toFixed(6)}${rough}`);
  }
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}

console.log(`\ngeocoded: ${done}   skipped (not enough address): ${skipped}   failed: ${failed}`);
if (problems.length) {
  console.log('\nneeds a human:');
  for (const p of problems) console.log(`   ${p}`);
  console.log('\nThese can be pinned by hand on the map instead.');
}

await client.end();
