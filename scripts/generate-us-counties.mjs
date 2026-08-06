// scripts/generate-us-counties.mjs
//
// Regenerates `lib/weather/us-counties.ts` — every county (and county-equivalent) in the United
// States, with the coordinates the weather forecast is fetched for.
//
// ── WHY A BUNDLED TABLE AND NOT A GEOCODER CALL ─────────────────────────────────────────────────
//
// The weather search asks Open-Meteo's geocoder for cities, which it is good at. It cannot answer
// for counties: measured 2026-08-06, "Bell County" returns *Bell County Expo Center* (a park) and
// "Travis County" returns *Travis County Softball Field Complex*. Both are real places with real
// coordinates, so a naive search does not fail — it silently forecasts for a ballpark.
//
// The Census gazetteer is the authority on what a county is and where its interior point lies, so
// counties come from here and cities come from the geocoder.
//
// INTPTLAT/INTPTLONG are the Census "internal point": a coordinate guaranteed to fall INSIDE the
// county's land area, unlike a bounding-box centre which can land in a lake or a neighbouring county
// for a crescent-shaped one. That is exactly the property a forecast lookup needs.
//
// Usage:  node scripts/generate-us-counties.mjs
// Output: lib/weather/us-counties.ts  (checked in — the build must not depend on census.gov)

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

const YEAR = 2023;
const URL = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${YEAR}_Gazetteer/${YEAR}_Gaz_counties_national.zip`;
const OUT = path.join(process.cwd(), 'lib', 'weather', 'us-counties.ts');

// USPS code → full name. Territories included: the gazetteer carries PR/GU/VI/AS/MP, and a
// surveying firm working in Puerto Rico should still get a forecast.
const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gaz-'));
const zipPath = path.join(tmp, 'counties.zip');

console.log(`Fetching ${URL}`);
const res = await fetch(URL);
if (!res.ok) throw new Error(`Census returned HTTP ${res.status}`);
fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

// No zip support in the Node stdlib; both platforms we build on have a shell unzipper.
if (process.platform === 'win32') {
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tmp}' -Force"`,
    { stdio: 'inherit' },
  );
} else {
  execSync(`unzip -o "${zipPath}" -d "${tmp}"`, { stdio: 'inherit' });
}

const txt = fs.readdirSync(tmp).find((f) => f.endsWith('.txt'));
if (!txt) throw new Error('No .txt in the gazetteer archive');
const lines = fs.readFileSync(path.join(tmp, txt), 'utf8').split(/\r?\n/).filter(Boolean);

const header = lines[0].split('\t').map((h) => h.trim());
const col = (n) => {
  const i = header.indexOf(n);
  if (i < 0) throw new Error(`Gazetteer is missing the ${n} column — schema changed`);
  return i;
};
const [cUsps, cGeoid, cName, cLat, cLon] =
  [col('USPS'), col('GEOID'), col('NAME'), col('INTPTLAT'), col('INTPTLONG')];

const rows = [];
for (const line of lines.slice(1)) {
  const f = line.split('\t');
  const usps = (f[cUsps] ?? '').trim();
  const name = (f[cName] ?? '').trim();
  const lat = Number((f[cLat] ?? '').trim());
  const lon = Number((f[cLon] ?? '').trim());
  const fips = (f[cGeoid] ?? '').trim();
  if (!usps || !name || !fips || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const state = STATES[usps];
  if (!state) {
    console.warn(`  ! unknown USPS code ${usps} (${name}) — skipped`);
    continue;
  }
  rows.push({ fips, name, usps, state, lat: +lat.toFixed(4), lon: +lon.toFixed(4) });
}

rows.sort((a, b) => a.fips.localeCompare(b.fips));
if (rows.length < 3000) throw new Error(`Only parsed ${rows.length} counties — expected ~3,200`);

const body = rows
  .map((r) => `  ['${r.fips}', ${JSON.stringify(r.name)}, '${r.usps}', ${JSON.stringify(r.state)}, ${r.lat}, ${r.lon}],`)
  .join('\n');

const out = `// lib/weather/us-counties.ts
//
// GENERATED — do not edit by hand. Run \`node scripts/generate-us-counties.mjs\` to refresh.
// Source: US Census ${YEAR} Gazetteer, counties (national). ${rows.length} counties and
// county-equivalents, with the Census "internal point" — a coordinate guaranteed to fall inside the
// county's land area, which a bounding-box centre is not.
//
// Bundled rather than fetched because the weather search must work offline of census.gov, and
// because Open-Meteo's geocoder cannot answer county queries at all: "Bell County" returns a park
// of that name. See the generator's header for the measurement.
//
// Stored as tuples, not objects: ${rows.length} rows × 6 keys of JSON property names is ~180KB of
// repeated strings. This module is imported by the search route ONLY (server-side), so it never
// reaches a browser bundle — keep it that way.

/** [fips, name, stateCode, stateName, latitude, longitude] */
export type CountyRow = readonly [string, string, string, string, number, number];

export const US_COUNTIES: readonly CountyRow[] = [
${body}
];
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${rows.length} counties → ${path.relative(process.cwd(), OUT)}`);
