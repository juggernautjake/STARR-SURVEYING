// lib/weather/location-search.ts
//
// Turning what somebody types into a place we can forecast for. Pure functions, no fetch — the route
// does the network call and hands the payload here, so all the ranking is unit-testable in node.
//
// ── TWO SOURCES, BECAUSE NEITHER ONE ANSWERS BOTH QUESTIONS ─────────────────────────────────────
//
// CITIES come from Open-Meteo's geocoder: every populated place in the US, with its county in
// `admin2` and state in `admin1`. Good at exactly this.
//
// COUNTIES come from the bundled Census table, because the geocoder is not merely worse at them, it
// is confidently wrong. Measured 2026-08-06: "Travis County" returns *Travis County Softball Field
// Complex*, and county queries generally answer with a park or a school of that name. Those hits
// carry real coordinates, so the search looks like it worked and then forecasts for a ballpark.
// Nothing errors, which is why this needed measuring rather than trusting.
//
// ── THE COUNTRY FILTER THAT WAS NOT FILTERING ───────────────────────────────────────────────────
//
// The old weather route passed `&country=US` to the geocoder. That is not a parameter Open-Meteo
// has, and it was silently ignored — measured the same day, "Killeen" returned three Irish towns and
// "78701" returned Conflans-Sainte-Honorine, France. The correct parameter is `countryCode`. We send
// it AND filter on `country_code` here, because a search that quietly leaves the country is the kind
// of bug that only shows up when somebody's forecast is eight hours out of step.

import { US_COUNTIES, type CountyRow } from './us-counties';

export type LocationKind = 'city' | 'county' | 'zip';

export interface LocationHit {
  /** Stable identity for React keys + de-duplication. */
  id: string;
  kind: LocationKind;
  /** What to show as the primary line: "Flagstaff" / "Orleans Parish". */
  name: string;
  /** Full state name: "Texas". */
  state: string;
  /** County the city sits in, when we know it. Absent for county hits (it IS the county). */
  county?: string;
  latitude: number;
  longitude: number;
  /** One-line display + what gets stored as the forecast's location label. */
  label: string;
}

// ── ZIP ─────────────────────────────────────────────────────────────────────────────────────────

/** A US ZIP, with or without the +4. Used to decide whether to ask the geocoder for a postcode. */
export function isZipQuery(q: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(q.trim());
}

// ── county search ───────────────────────────────────────────────────────────────────────────────

const STATE_CODES = new Set(US_COUNTIES.map((c) => c[2]));
const STATE_NAMES = new Map(US_COUNTIES.map((c) => [c[3].toLowerCase(), c[2]]));

function norm(s: string): string {
  return s.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "Mohave County" → "mohave". Lets "mohave", "Mohave County" and "mohave co" all hit the same row. */
function bareCountyName(name: string): string {
  return norm(name)
    .replace(/\b(county|parish|borough|census area|municipality|city and borough|municipio)\b/g, '')
    .trim();
}

interface ParsedQuery {
  /** The place part: "bell" from "bell county tx". */
  place: string;
  /** USPS code when the query named a state, else null. */
  stateCode: string | null;
  /** True when the user actually typed "county" / "parish" — a strong signal they want the county. */
  saidCounty: boolean;
  /** The specific word they used, when it was more specific than "county".
   *
   *  Louisiana has parishes, Alaska has boroughs and census areas, Puerto Rico has municipios. Those
   *  are the real names, and a user who types one has told us which state they mean. Measured
   *  2026-08-06: without this, "orleans parish" returned Orleans County, New York and Orleans County,
   *  Vermont ABOVE Orleans Parish, Louisiana — all three score identically on the name "orleans", and
   *  the alphabetical tiebreak puts "County" before "Parish". */
  suffix: string | null;
}

/** The non-"county" suffixes worth matching on, longest first so "city and borough" wins over
 *  "borough". */
const SUFFIXES = ['city and borough', 'census area', 'municipality', 'municipio', 'parish', 'borough'];

/** Split "Mohave County, AZ" into its place, state and intent. Exported for the tests. */
export function parseQuery(raw: string): ParsedQuery {
  let q = norm(raw);
  const saidCounty = /\b(county|parish|borough|co)\b/.test(q);

  let stateCode: string | null = null;
  // Longest state names first so "west virginia" is not eaten by "virginia".
  const names = [...STATE_NAMES.keys()].sort((a, b) => b.length - a.length);
  for (const n of names) {
    if (q === n || q.endsWith(' ' + n)) {
      stateCode = STATE_NAMES.get(n)!;
      q = q.slice(0, q.length - n.length).trim();
      break;
    }
  }
  if (!stateCode) {
    const m = q.match(/\b([a-z]{2})$/);
    if (m && STATE_CODES.has(m[1].toUpperCase())) {
      stateCode = m[1].toUpperCase();
      q = q.slice(0, q.length - 2).trim();
    }
  }

  const suffix = SUFFIXES.find((s) => q.includes(s)) ?? null;

  const place = q
    .replace(/\b(county|parish|borough|census area|municipality|municipio|co)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { place, stateCode, saidCounty, suffix };
}

function countyHit(row: CountyRow): LocationHit {
  const [fips, name, , state, lat, lon] = row;
  return {
    id: `county:${fips}`,
    kind: 'county',
    name,
    state,
    latitude: lat,
    longitude: lon,
    label: `${name}, ${state}`,
  };
}

/** County matches for a query, best first. Empty when the query is too short to be useful. */
export function searchCounties(raw: string, limit = 6): LocationHit[] {
  const { place, stateCode, saidCounty, suffix } = parseQuery(raw);
  if (place.length < 2) return [];

  const scored: Array<{ row: CountyRow; score: number }> = [];
  for (const row of US_COUNTIES) {
    if (stateCode && row[2] !== stateCode) continue;
    const bare = bareCountyName(row[1]);
    let score: number;
    if (bare === place) score = 100;
    else if (bare.startsWith(place)) score = 70;
    else if (bare.includes(place)) score = 40;
    else continue;

    // Typing the word "county" is the clearest statement of intent we get; a named state narrows
    // 3,222 rows to a few dozen, so both earn a real boost over a bare city-name collision.
    if (saidCounty) score += 25;
    if (stateCode) score += 15;
    // Typing "parish" / "borough" / "census area" names the division type, and only some states use
    // each — so it is nearly as strong a signal as naming the state outright.
    if (suffix && row[1].toLowerCase().includes(suffix)) score += 30;
    // Shorter names match more tightly: "Bell" beats "Campbell" for the query "bell".
    score -= Math.min(bare.length - place.length, 20) * 0.5;
    scored.push({ row, score });
  }

  // Ties break on state, then name, so the order is explainable rather than an artefact of FIPS
  // ordering in the generated table.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.row[3].localeCompare(b.row[3]) ||
      a.row[1].localeCompare(b.row[1]),
  );
  return scored.slice(0, limit).map((s) => countyHit(s.row));
}

// ── city search (Open-Meteo payload → hits) ─────────────────────────────────────────────────────

export interface OpenMeteoGeoResult {
  id?: number;
  name?: string;
  latitude?: number;
  longitude?: number;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  feature_code?: string;
  population?: number;
  postcodes?: string[];
}
export interface OpenMeteoGeoResponse { results?: OpenMeteoGeoResult[] }

/** Places that are not somewhere a person works: parks, buildings, and other point features. The
 *  geocoder returns these for county queries, which is the whole reason counties come from Census. */
const PLACE_FEATURE = /^(PPL|ADM)/;

/** Map a geocoder payload to hits, dropping anything outside the US or that is not a populated
 *  place. `zipLabelled` marks the query as a postcode so the label can carry it. */
export function cityHits(
  payload: OpenMeteoGeoResponse,
  opts: { zip?: string; limit?: number } = {},
): LocationHit[] {
  const { zip, limit = 8 } = opts;
  const out: LocationHit[] = [];
  for (const r of payload.results ?? []) {
    if (r.country_code !== 'US') continue;              // the filter the API param never applied
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue;
    if (r.feature_code && !PLACE_FEATURE.test(r.feature_code)) continue;
    if (!r.name) continue;

    const state = r.admin1 ?? '';
    const county = r.admin2 || undefined;
    const bits = [r.name, state].filter(Boolean).join(', ');
    out.push({
      id: `city:${r.id ?? `${r.latitude},${r.longitude}`}`,
      kind: zip ? 'zip' : 'city',
      name: r.name,
      state,
      county,
      latitude: r.latitude,
      longitude: r.longitude,
      label: zip ? `${bits} ${zip}`.trim() : bits,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ── merge ───────────────────────────────────────────────────────────────────────────────────────

/** Interleave county and city hits into one list.
 *
 *  Cities lead unless the query said "county": somebody typing "austin" wants the city, and
 *  somebody typing "bell county" could not have been clearer. Duplicate coordinates are dropped so
 *  a county and its identically-named seat do not both appear when they resolve to the same point. */
export function mergeLocationResults(
  counties: LocationHit[],
  cities: LocationHit[],
  raw: string,
  limit = 10,
): LocationHit[] {
  const { saidCounty } = parseQuery(raw);
  const first = saidCounty ? counties : cities;
  const second = saidCounty ? cities : counties;

  const seen = new Set<string>();
  const out: LocationHit[] = [];
  for (const hit of [...first, ...second]) {
    const key = `${hit.kind}:${hit.latitude.toFixed(3)},${hit.longitude.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}
