#!/usr/bin/env node
// scripts/build-prospect-list.mjs — compile every operating surveying firm in Texas.
//
// ── WHY THIS IS A SCRIPT AND NOT A FILE OF NAMES ────────────────────────────────────────────────
//
// A hand-typed prospect list is wrong the day after it is written: firms close, merge, move, and
// change numbers. Worse, a list assembled from memory or from a model's recollection contains
// plausible-looking businesses that do not exist, and the first anyone notices is a salesperson
// ringing a stranger. So this compiles the list from sources that are authoritative TODAY, records
// where every row came from, and can be re-run to refresh it.
//
// ── THE FOUR SOURCES, IN ORDER OF AUTHORITY ─────────────────────────────────────────────────────
//
//   1. TBPELS licensee roster — the Texas Board of Professional Engineers and Land Surveyors.
//      The only authoritative list of who may lawfully practise. Licensed individuals (RPLS/LSLS)
//      and registered surveying FIRMS. Not scrapeable from here: the board publishes a lookup, and
//      a full roster is obtainable by public information request. THIS IS THE SPINE — everything
//      else enriches it. See --merge-roster below.
//
//   2. Google Places — what this script automates. Finds operating businesses with an address, a
//      phone number and a website, which is exactly what the roster lacks. Misses sole
//      practitioners with no storefront listing.
//
//   3. Texas Secretary of State — entity status, registered agent, formation date. Confirms a firm
//      is still a going concern rather than a dead listing Google has not pruned.
//
//   4. TSPS chapter directories — membership implies engagement, which is the best predictor of
//      who will take a demo.
//
// Run 2 here, request 1 in parallel, then merge. The merge is the valuable artefact: a licensed
// firm WITH contact details, marked by which sources agree.
//
// ── USAGE ───────────────────────────────────────────────────────────────────────────────────────
//
//   node scripts/build-prospect-list.mjs                    # all 254 counties
//   node scripts/build-prospect-list.mjs --counties Bell,McLennan,Coryell
//   node scripts/build-prospect-list.mjs --dry-run          # show the plan and the cost, call nothing
//   node scripts/build-prospect-list.mjs --out ./prospects  # output prefix
//   node scripts/build-prospect-list.mjs --merge-roster roster.csv
//
// Needs GOOGLE_MAPS_SERVER_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) with **Places API (New)**
// enabled. Run it through Doppler so the key is the production one:
//
//   doppler run -- node scripts/build-prospect-list.mjs --dry-run
//
// Output: <out>.json (full records, provenance kept) and <out>.csv (ready to import).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── args ────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (argv[i + 1] ?? true);
};
const has = (name) => argv.includes(`--${name}`);

const DRY = has('dry-run');
const OUT = String(flag('out', path.join(ROOT, 'prospects-texas')));
const ONLY = flag('counties', null);
const ROSTER = flag('merge-roster', null);
const DELAY_MS = Number(flag('delay', 220));

const KEY = process.env.GOOGLE_MAPS_SERVER_KEY
  || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.GOOGLE_MAPS_API_KEY;

// ── the county list, read from the one place that owns it ───────────────────────────────────────
// Never paste a second copy of this list. lib/geo/texas-counties.ts says so in its own header and
// it is right: two lists agree the day they are written and drift silently afterwards.
function readCounties() {
  const src = fs.readFileSync(path.join(ROOT, 'lib/geo/texas-counties.ts'), 'utf8');
  const start = src.indexOf('TEXAS_COUNTIES');
  const open = src.indexOf('[', start);
  const close = src.indexOf('];', open);
  if (start === -1 || open === -1 || close === -1) {
    throw new Error('Could not locate TEXAS_COUNTIES in lib/geo/texas-counties.ts — has its shape changed?');
  }
  const names = [...src.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (names.length < 250) {
    throw new Error(`Expected 254 counties, parsed ${names.length}. Refusing to run a partial sweep.`);
  }
  return names;
}

// Two phrasings per county. Surveying firms name themselves inconsistently — "Land Surveying",
// "Surveyors", "Surveying Co" — and Places ranks on the query text, so one phrasing misses a
// predictable slice. Two is the point where the marginal query stops paying for itself.
const QUERIES = (county) => [
  `land surveying ${county} County Texas`,
  `land surveyor ${county} County Texas`,
];

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.businessStatus',
  'places.location',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'nextPageToken',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchText(textQuery, pageToken) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      pageSize: 20,
      ...(pageToken ? { pageToken } : {}),
      // Texas bounding box. Keeps a query like "land surveyor Bowie County Texas" from
      // wandering into Bowie, Maryland.
      locationRestriction: {
        rectangle: {
          low:  { latitude: 25.83, longitude: -106.65 },
          high: { latitude: 36.50, longitude:  -93.51 },
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Places ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// A surveying firm, or a fence company that mentions surveying? Places types are broad, so this
// keeps anything whose NAME reads like a surveyor and anything Google typed as one, and records
// the reason so a human can audit the rejects rather than trusting the filter.
const NAME_HINT = /\b(survey|surveying|surveyor|surveyors|geomatic|geomatics|land\s+title|rpls)\b/i;
function classify(p) {
  const name = p.displayName?.text ?? '';
  const types = p.types ?? [];
  if (types.includes('land_surveyor') || types.includes('surveyor')) return { keep: true, why: 'google-type' };
  if (NAME_HINT.test(name)) return { keep: true, why: 'name-match' };
  return { keep: false, why: 'no-signal' };
}

function toRow(p, county, why) {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? '',
    website: p.websiteUri ?? '',
    status: p.businessStatus ?? '',
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    counties: [county],
    matchedBy: why,
    sources: ['google-places'],
    // Filled by --merge-roster. Until then, UNVERIFIED: Places tells you a business exists,
    // not that anyone there holds a licence.
    licensed: null,
    licenceNumbers: [],
  };
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const all = readCounties();
  const counties = ONLY && ONLY !== true
    ? String(ONLY).split(',').map((c) => c.trim()).filter(Boolean)
    : all;

  const unknown = counties.filter((c) => !all.includes(c));
  if (unknown.length) {
    console.error(`Not Texas counties: ${unknown.join(', ')}`);
    process.exit(1);
  }

  const queries = counties.length * 2;
  const worstCaseRequests = queries * 3; // three pages each, at most
  console.log(`Counties        : ${counties.length}`);
  console.log(`Queries         : ${queries}  (two phrasings per county)`);
  console.log(`Requests, worst : ${worstCaseRequests}`);
  console.log(`Est. cost       : ~$${(worstCaseRequests * 0.032).toFixed(2)} at Places Text Search rates`);
  console.log(`Output          : ${OUT}.json / ${OUT}.csv`);

  if (DRY) {
    console.log('\n--dry-run: nothing called. Sample queries:');
    counties.slice(0, 3).forEach((c) => QUERIES(c).forEach((q) => console.log('  ' + q)));
    return;
  }
  if (!KEY) {
    console.error('\nNo API key. Set GOOGLE_MAPS_SERVER_KEY (Places API New must be enabled) and re-run,\n'
      + 'ideally through Doppler so it is the production key:\n'
      + '  doppler run -- node scripts/build-prospect-list.mjs');
    process.exit(1);
  }

  const byId = new Map();
  const rejected = [];
  let calls = 0, failures = 0;

  for (const [i, county] of counties.entries()) {
    for (const q of QUERIES(county)) {
      let pageToken;
      for (let page = 0; page < 3; page++) {
        let data;
        try {
          data = await searchText(q, pageToken);
          calls++;
        } catch (e) {
          failures++;
          console.warn(`  ! ${county}: ${e.message}`);
          if (e.status === 429) await sleep(3000);
          break;
        }
        for (const p of data.places ?? []) {
          const { keep, why } = classify(p);
          if (!keep) { rejected.push({ name: p.displayName?.text, county, why }); continue; }
          const existing = byId.get(p.id);
          if (existing) {
            if (!existing.counties.includes(county)) existing.counties.push(county);
          } else {
            byId.set(p.id, toRow(p, county, why));
          }
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
        await sleep(DELAY_MS);
      }
      await sleep(DELAY_MS);
    }
    if ((i + 1) % 10 === 0 || i === counties.length - 1) {
      console.log(`  ${i + 1}/${counties.length} counties · ${byId.size} firms · ${calls} calls`);
    }
  }

  let rows = [...byId.values()];

  // ── optional: fold in the TBPELS roster ───────────────────────────────────────────────────────
  if (ROSTER && ROSTER !== true) {
    const merged = mergeRoster(rows, String(ROSTER));
    rows = merged.rows;
    console.log(`\nRoster merge: ${merged.matched} firms matched a licence, ${merged.unmatchedRoster} roster entries had no Places listing.`);
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  fs.writeFileSync(`${OUT}.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    countiesSwept: counties.length,
    firms: rows.length,
    calls, failures,
    note: 'Google Places confirms a business exists. It does NOT confirm anyone there holds a licence — merge the TBPELS roster before treating any row as a licensed firm.',
    rows,
  }, null, 2));

  const cols = ['name', 'phone', 'website', 'address', 'counties', 'status', 'licensed', 'licenceNumbers', 'rating', 'reviews', 'sources', 'placeId'];
  const csv = [cols.join(',')]
    .concat(rows.map((r) => cols.map((c) => csvEscape(Array.isArray(r[c]) ? r[c].join('; ') : r[c])).join(',')))
    .join('\n');
  fs.writeFileSync(`${OUT}.csv`, csv);

  const operating = rows.filter((r) => r.status === 'OPERATIONAL').length;
  const withPhone = rows.filter((r) => r.phone).length;
  const withSite  = rows.filter((r) => r.website).length;

  console.log(`\n── Result ──`);
  console.log(`Firms found     : ${rows.length}`);
  console.log(`Marked operating: ${operating}`);
  console.log(`With a phone    : ${withPhone}`);
  console.log(`With a website  : ${withSite}`);
  console.log(`Rejected        : ${rejected.length} (name/type gave no surveying signal)`);
  console.log(`Failed calls    : ${failures}`);
  console.log(`\nWrote ${OUT}.json and ${OUT}.csv`);
  console.log(`\nNEXT: request the TBPELS roster and re-run with --merge-roster. Until then every`);
  console.log(`row is "a business Google believes exists", not "a licensed surveying firm".`);
}

// Roster CSV is expected to carry at least a firm/business name and a licence number. Column names
// vary by how the board exports it, so match case-insensitively on a few likely headers rather than
// demanding one shape.
function mergeRoster(rows, file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iName = col('firm', 'business', 'company', 'name');
  const iNum  = col('licen', 'registration', 'number');
  if (iName === -1) throw new Error('Roster CSV has no firm/business/company/name column.');

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/(inc|llc|lp|ltd|pllc|co|company|corp)$/g, '');
  const index = new Map(rows.map((r) => [norm(r.name), r]));
  let matched = 0, unmatchedRoster = 0;

  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const name = (cells[iName] ?? '').replace(/^"|"$/g, '').trim();
    if (!name) continue;
    const hit = index.get(norm(name));
    if (hit) {
      hit.licensed = true;
      if (iNum !== -1 && cells[iNum]) hit.licenceNumbers.push(cells[iNum].trim());
      if (!hit.sources.includes('tbpels-roster')) hit.sources.push('tbpels-roster');
      matched++;
    } else {
      unmatchedRoster++;
      // A licensed firm with no Places listing is still a prospect — often a sole practitioner
      // working from home, which is exactly the buyer the base product is priced for.
      rows.push({
        placeId: null, name, address: '', phone: '', website: '', status: 'UNKNOWN',
        lat: null, lng: null, rating: null, reviews: null, counties: [],
        matchedBy: 'roster-only', sources: ['tbpels-roster'],
        licensed: true, licenceNumbers: iNum !== -1 && cells[iNum] ? [cells[iNum].trim()] : [],
      });
    }
  }
  return { rows, matched, unmatchedRoster };
}

main().catch((e) => { console.error(e); process.exit(1); });
