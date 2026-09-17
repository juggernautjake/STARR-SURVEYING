// lib/geo/texas-counties.ts
//
// Every county in Texas. All 254 of them. This file is the ONLY place in the codebase
// where county names are enumerated — if you are about to paste a list of counties
// anywhere else, import from here instead.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────
//
// The quote calculator used to ship a REQUIRED <select> with eleven counties and an
// "Other (specify below)" escape hatch. In September 2026 a customer near Canyon Lake
// — Comal County — could not find their county, could not submit the form, and phoned
// instead. That is one lead we know about because they bothered to call; the ones who
// closed the tab are invisible. A short list on a required field is a wall, not a
// convenience.
//
// So: every form that asks for a county offers all 254, with type-to-filter and a
// dropdown, and validation accepts whatever shape the customer types.
//
// ── WHERE THE LIST CAME FROM ───────────────────────────────────────────────────────
//
// U.S. Census Bureau, 2020 FIPS codes for counties and county equivalents:
//   https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt
// filtered to STATE == "TX", with the trailing " County" stripped. Machine-read from
// the authoritative file rather than transcribed, because the spellings matter: these
// names end up on a survey's cover letter, and "DeWitt", "McLennan", "Val Verde" and
// "Deaf Smith" are all things a human transcriber gets wrong.
//
// Sorted A→Z case-insensitively (so "Deaf Smith" precedes "DeWitt", which a raw
// code-unit sort gets backwards). See __tests__/lib/texas-counties.test.ts.

/** All 254 Texas counties, plain names ("Comal", not "Comal County"), sorted A→Z. */
export const TEXAS_COUNTIES: readonly string[] = [
  "Anderson", "Andrews", "Angelina", "Aransas",
  "Archer", "Armstrong", "Atascosa", "Austin",
  "Bailey", "Bandera", "Bastrop", "Baylor",
  "Bee", "Bell", "Bexar", "Blanco",
  "Borden", "Bosque", "Bowie", "Brazoria",
  "Brazos", "Brewster", "Briscoe", "Brooks",
  "Brown", "Burleson", "Burnet", "Caldwell",
  "Calhoun", "Callahan", "Cameron", "Camp",
  "Carson", "Cass", "Castro", "Chambers",
  "Cherokee", "Childress", "Clay", "Cochran",
  "Coke", "Coleman", "Collin", "Collingsworth",
  "Colorado", "Comal", "Comanche", "Concho",
  "Cooke", "Coryell", "Cottle", "Crane",
  "Crockett", "Crosby", "Culberson", "Dallam",
  "Dallas", "Dawson", "Deaf Smith", "Delta",
  "Denton", "DeWitt", "Dickens", "Dimmit",
  "Donley", "Duval", "Eastland", "Ector",
  "Edwards", "El Paso", "Ellis", "Erath",
  "Falls", "Fannin", "Fayette", "Fisher",
  "Floyd", "Foard", "Fort Bend", "Franklin",
  "Freestone", "Frio", "Gaines", "Galveston",
  "Garza", "Gillespie", "Glasscock", "Goliad",
  "Gonzales", "Gray", "Grayson", "Gregg",
  "Grimes", "Guadalupe", "Hale", "Hall",
  "Hamilton", "Hansford", "Hardeman", "Hardin",
  "Harris", "Harrison", "Hartley", "Haskell",
  "Hays", "Hemphill", "Henderson", "Hidalgo",
  "Hill", "Hockley", "Hood", "Hopkins",
  "Houston", "Howard", "Hudspeth", "Hunt",
  "Hutchinson", "Irion", "Jack", "Jackson",
  "Jasper", "Jeff Davis", "Jefferson", "Jim Hogg",
  "Jim Wells", "Johnson", "Jones", "Karnes",
  "Kaufman", "Kendall", "Kenedy", "Kent",
  "Kerr", "Kimble", "King", "Kinney",
  "Kleberg", "Knox", "La Salle", "Lamar",
  "Lamb", "Lampasas", "Lavaca", "Lee",
  "Leon", "Liberty", "Limestone", "Lipscomb",
  "Live Oak", "Llano", "Loving", "Lubbock",
  "Lynn", "Madison", "Marion", "Martin",
  "Mason", "Matagorda", "Maverick", "McCulloch",
  "McLennan", "McMullen", "Medina", "Menard",
  "Midland", "Milam", "Mills", "Mitchell",
  "Montague", "Montgomery", "Moore", "Morris",
  "Motley", "Nacogdoches", "Navarro", "Newton",
  "Nolan", "Nueces", "Ochiltree", "Oldham",
  "Orange", "Palo Pinto", "Panola", "Parker",
  "Parmer", "Pecos", "Polk", "Potter",
  "Presidio", "Rains", "Randall", "Reagan",
  "Real", "Red River", "Reeves", "Refugio",
  "Roberts", "Robertson", "Rockwall", "Runnels",
  "Rusk", "Sabine", "San Augustine", "San Jacinto",
  "San Patricio", "San Saba", "Schleicher", "Scurry",
  "Shackelford", "Shelby", "Sherman", "Smith",
  "Somervell", "Starr", "Stephens", "Sterling",
  "Stonewall", "Sutton", "Swisher", "Tarrant",
  "Taylor", "Terrell", "Terry", "Throckmorton",
  "Titus", "Tom Green", "Travis", "Trinity",
  "Tyler", "Upshur", "Upton", "Uvalde",
  "Val Verde", "Van Zandt", "Victoria", "Walker",
  "Waller", "Ward", "Washington", "Webb",
  "Wharton", "Wheeler", "Wichita", "Wilbarger",
  "Willacy", "Williamson", "Wilson", "Winkler",
  "Wise", "Wood", "Yoakum", "Young",
  "Zapata", "Zavala",
];

/** How many counties Texas has. A constant so a test can state the number out loud. */
export const TEXAS_COUNTY_COUNT = 254;

/**
 * The shared `id` for the <datalist> of all 254 counties. Any `<input list={…}>` that
 * asks for a county points at this, and renders <TexasCountyDatalist /> alongside it.
 */
export const TEXAS_COUNTY_DATALIST_ID = 'texas-counties';

/** Lowercased canonical name → canonical name. Built once at module load. */
const BY_LOWER: ReadonlyMap<string, string> = new Map(
  TEXAS_COUNTIES.map((name) => [name.toLowerCase(), name]),
);

/**
 * Reduce whatever the customer typed to a comparable key: trimmed, collapsed internal
 * whitespace, lowercased, with a trailing "County"/"Co."/"Co" dropped.
 *
 * "  COMAL County " → "comal";  "de witt" stays "de witt" (not a county — deliberately,
 * because guessing at a misspelling is how the wrong county lands on a legal document).
 */
function toKey(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,.]?\s+(county|co\.?)$/i, '')
    .trim()
    .toLowerCase();
}

/**
 * The canonical spelling of a Texas county, or null if it is not one.
 *
 * Forgiving about the things people actually type — case, stray whitespace, and the
 * word "County" on the end — and strict about everything else:
 *
 *   normalizeCounty('comal county') === 'Comal'
 *   normalizeCounty('  COMAL  ')    === 'Comal'
 *   normalizeCounty('mclennan')     === 'McLennan'
 *   normalizeCounty('Nowhere')      === null
 */
export function normalizeCounty(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const key = toKey(input);
  if (!key) return null;
  return BY_LOWER.get(key) ?? null;
}

/** Whether `input` names a Texas county, under the same forgiving rules as normalizeCounty. */
export function isTexasCounty(input: string | null | undefined): boolean {
  return normalizeCounty(input) !== null;
}

/**
 * Typeahead matches for `query`: counties whose name STARTS WITH the query first (in
 * A→Z order), then counties that merely contain it. An empty query returns the first
 * `limit` counties, so a freshly-focused field still has something to show.
 *
 * Prefix-before-contains is what makes the field feel like it is reading along: typing
 * "co" should offer Coke, Coleman, Collin… before Nacogdoches, which merely contains
 * the letters.
 */
export function matchCounties(query: string | null | undefined, limit = 10): string[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  if (safeLimit === 0) return [];
  const key = typeof query === 'string' ? toKey(query) : '';
  if (!key) return TEXAS_COUNTIES.slice(0, safeLimit);

  const prefix: string[] = [];
  const contains: string[] = [];
  for (const name of TEXAS_COUNTIES) {
    const lower = name.toLowerCase();
    if (lower.startsWith(key)) prefix.push(name);
    else if (lower.includes(key)) contains.push(name);
  }
  return [...prefix, ...contains].slice(0, safeLimit);
}

/**
 * What to store for a county the customer typed: the canonical name when we recognise
 * it, otherwise their text, tidied but intact.
 *
 * Deliberately never returns empty for non-empty input and never rejects: the office
 * decides what it will travel for, not the form. A county we do not recognise is a
 * typo to be read by a human, not a reason to refuse a lead.
 */
export function canonicalizeCountyInput(input: string | null | undefined): string {
  if (typeof input !== 'string') return '';
  return normalizeCounty(input) ?? input.trim().replace(/\s+/g, ' ');
}
