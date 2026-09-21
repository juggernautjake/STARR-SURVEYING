// lib/geo/state-plane.ts — turning survey coordinates into map coordinates.
//
// Owner, 2026-09-21, choosing between three options for CSV import: "Add proj4, require a zone."
//
// ── WHY THIS FILE EXISTS, AND WHY IT DID NOT BEFORE ─────────────────────────────────────────────
//
// `lib/cad/geo/texas-state-plane.ts` declares the five Texas zones and then deliberately refuses to
// project, saying so in its own header:
//
//     "It does not re-project. There is no projection library in this repo and adding one is a real
//      decision, not a side effect of tidying a constant."
//
// That was the right call at the time. Everything the CAD side did worked in native state-plane
// values, so the maths was never the missing piece — the *declaration* was.
//
// What changed is that three separate features now need coordinates on a Google map: a CSV of
// collector points, points streamed from Trimble Connect, and anything ingested through
// `lib/field-ingest`. All three arrive as northing/easting in US survey feet. None of them can be
// drawn without projecting. So the decision that file declined to make on its own has now been made
// on purpose, by the owner, with the alternatives on the table.
//
// **The zone list is not duplicated here.** It is imported. Two lists of five zones is exactly how
// EPSG:2277 came to be described as two different zones in two different modules — the bug that
// file was written to fix.
//
// ── THE FAILURE THIS FILE IS SHAPED AROUND ──────────────────────────────────────────────────────
//
// From that same header, and it is worth repeating because it is the whole risk:
//
//     "a receiving system that trusts the label will re-project from the wrong zone — putting the
//      parcel some thousands of feet from where it belongs, with no error message anywhere, because
//      every number involved is individually plausible."
//
// A wrong zone does not throw. It returns a latitude and longitude that look completely ordinary
// and are in the wrong county. So this module:
//
//   - never guesses a zone — every call takes one explicitly;
//   - never silently coerces bad input — non-finite in, `null` out, and the caller must handle it;
//   - offers `looksLikeTexas()` so a caller can refuse a result that cannot be right.
//
// `DEFAULT_TEXAS_ZONE_KEY` exists in the zone module for *labelling* a drawing that did not say.
// It is deliberately NOT used here as a projection fallback: mislabelling a file is recoverable,
// and placing 247 points in the wrong county is the thing somebody discovers a month later.

import proj4 from 'proj4';
import {
  TEXAS_STATE_PLANE_ZONES,
  zoneByKey,
  type TexasStatePlaneZone,
} from '@/lib/cad/geo/texas-state-plane';

/** WGS84 lat/lng — what Google Maps draws in, and what `job_map_points.lat/lng` stores. */
export const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

/**
 * proj4 definitions for the five NAD83 Texas zones in US survey feet.
 *
 * ── THE SUBTLETY THAT BITES ──
 * In a proj4 string, `x_0` and `y_0` are ALWAYS in metres, even when `+units=us-ft` means every
 * coordinate going in and out is in feet. So EPSG:2277's published false origin of 2,296,583.333
 * ftUS appears here as 699999.999898 — the same distance, in the unit proj4 wants for that field.
 * Writing the foot value into `x_0` would shift every point by roughly two million feet, which is
 * far enough to be obvious, unlike the errors this module actually worries about.
 *
 * These are the standard EPSG definitions. They are not trusted on my say-so: the test suite
 * projects the same point through the METRIC EPSG for each zone (32139 and friends) and requires
 * the two to agree after a unit conversion. That is an independent check of the false origin — a
 * round-trip test alone would happily confirm a self-consistently wrong projection.
 */
const ZONE_PROJ4: Record<TexasStatePlaneZone['key'], string> = {
  NORTH:
    '+proj=lcc +lat_0=34 +lon_0=-101.5 +lat_1=36.1833333333333 +lat_2=34.65 ' +
    '+x_0=200000.0001016 +y_0=999999.999898399 +ellps=GRS80 +datum=NAD83 +units=us-ft +no_defs',
  NORTH_CENTRAL:
    '+proj=lcc +lat_0=31.6666666666667 +lon_0=-98.5 +lat_1=33.9666666666667 +lat_2=32.1333333333333 ' +
    '+x_0=600000 +y_0=2000000.0001016 +ellps=GRS80 +datum=NAD83 +units=us-ft +no_defs',
  CENTRAL:
    '+proj=lcc +lat_0=29.6666666666667 +lon_0=-100.333333333333 +lat_1=31.8833333333333 +lat_2=30.1166666666667 ' +
    '+x_0=699999.999898399 +y_0=3000000 +ellps=GRS80 +datum=NAD83 +units=us-ft +no_defs',
  SOUTH_CENTRAL:
    '+proj=lcc +lat_0=27.8333333333333 +lon_0=-99 +lat_1=30.2833333333333 +lat_2=28.3833333333333 ' +
    '+x_0=600000 +y_0=3999999.9998984 +ellps=GRS80 +datum=NAD83 +units=us-ft +no_defs',
  SOUTH:
    '+proj=lcc +lat_0=25.6666666666667 +lon_0=-98.5 +lat_1=27.8333333333333 +lat_2=26.1666666666667 ' +
    '+x_0=300000 +y_0=5000000.0001016 +ellps=GRS80 +datum=NAD83 +units=us-ft +no_defs',
};

/** The metric twin of each zone, used ONLY by the test suite to cross-check the false origins. */
export const ZONE_PROJ4_METRIC: Record<TexasStatePlaneZone['key'], string> = {
  NORTH:
    '+proj=lcc +lat_0=34 +lon_0=-101.5 +lat_1=36.1833333333333 +lat_2=34.65 ' +
    '+x_0=200000 +y_0=1000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs',
  NORTH_CENTRAL:
    '+proj=lcc +lat_0=31.6666666666667 +lon_0=-98.5 +lat_1=33.9666666666667 +lat_2=32.1333333333333 ' +
    '+x_0=600000 +y_0=2000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs',
  CENTRAL:
    '+proj=lcc +lat_0=29.6666666666667 +lon_0=-100.333333333333 +lat_1=31.8833333333333 +lat_2=30.1166666666667 ' +
    '+x_0=700000 +y_0=3000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs',
  SOUTH_CENTRAL:
    '+proj=lcc +lat_0=27.8333333333333 +lon_0=-99 +lat_1=30.2833333333333 +lat_2=28.3833333333333 ' +
    '+x_0=600000 +y_0=4000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs',
  SOUTH:
    '+proj=lcc +lat_0=25.6666666666667 +lon_0=-98.5 +lat_1=27.8333333333333 +lat_2=26.1666666666667 ' +
    '+x_0=300000 +y_0=5000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs',
};

/** One US survey foot in metres. Not 0.3048 — that is the *international* foot, and the two differ
 *  by about 1 part in 500,000, which is a foot and a half across the width of a Texas zone. */
export const US_SURVEY_FOOT_IN_METRES = 1200 / 3937;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GridPoint {
  /** Y. In US survey feet. */
  northing: number;
  /** X. In US survey feet. */
  easting: number;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Northing/easting in US survey feet → WGS84 lat/lng.
 *
 * Returns `null` for input that is not two finite numbers, rather than producing `NaN` coordinates
 * that would be stored and drawn as a point at the origin.
 *
 * The zone is required. There is no default — see the header.
 */
export function gridToLatLng(
  grid: GridPoint,
  zoneKey: TexasStatePlaneZone['key'],
): LatLng | null {
  if (!finite(grid?.northing) || !finite(grid?.easting)) return null;
  const def = ZONE_PROJ4[zoneKey];
  if (!def) return null;

  // proj4 speaks [x, y] — easting first. Getting this pair backwards is the single most common way
  // to produce a plausible-looking wrong answer, which is why `looksLikeTexas` exists below.
  const [lng, lat] = proj4(def, WGS84, [grid.easting, grid.northing]) as [number, number];
  if (!finite(lat) || !finite(lng)) return null;
  return { lat, lng };
}

/** WGS84 lat/lng → northing/easting in US survey feet, in the given zone. */
export function latLngToGrid(
  at: LatLng,
  zoneKey: TexasStatePlaneZone['key'],
): GridPoint | null {
  if (!finite(at?.lat) || !finite(at?.lng)) return null;
  const def = ZONE_PROJ4[zoneKey];
  if (!def) return null;

  const [easting, northing] = proj4(WGS84, def, [at.lng, at.lat]) as [number, number];
  if (!finite(easting) || !finite(northing)) return null;
  return { northing, easting };
}

/**
 * A generous bounding box around Texas, plus a margin.
 *
 * This is a SANITY check, not a validation: a legitimate point can sit just outside a state line,
 * and a surveyor near Texarkana or El Paso is not doing anything wrong. The box is drawn wide
 * enough that anything failing it is almost certainly one of three real mistakes —
 *
 *   - the wrong zone (lands hundreds of miles away, usually still in the US);
 *   - northing and easting swapped (lands somewhere absurd, often off the planet);
 *   - the file was in metres, or in international feet, or in a different state's system.
 *
 * — rather than a genuine edge case. Callers should WARN on a failure and let somebody look, not
 * silently drop the point.
 */
export const TEXAS_BOUNDS = { minLat: 25.0, maxLat: 37.5, minLng: -107.5, maxLng: -92.5 } as const;

export function looksLikeTexas(at: LatLng | null | undefined): boolean {
  if (!at || !finite(at.lat) || !finite(at.lng)) return false;
  return (
    at.lat >= TEXAS_BOUNDS.minLat && at.lat <= TEXAS_BOUNDS.maxLat &&
    at.lng >= TEXAS_BOUNDS.minLng && at.lng <= TEXAS_BOUNDS.maxLng
  );
}

export interface ZoneGuess {
  zone: TexasStatePlaneZone;
  at: LatLng;
}

/**
 * Which zone would put these coordinates inside Texas?
 *
 * This is a HELP, never an answer. The import dialog uses it to say "this looks like Central" next
 * to a picker somebody still has to set, because more than one zone can place a given northing and
 * easting inside the state — the zones overlap in their plausible ranges, and a point near a zone
 * boundary is ambiguous by construction.
 *
 * Returns every zone that works, in declaration order (north to south). One result is a strong
 * hint. Two or more means the file genuinely does not say, and only the person who shot it knows.
 * Zero means something else is wrong — probably the units or a swap.
 */
export function plausibleZones(grid: GridPoint): ZoneGuess[] {
  const out: ZoneGuess[] = [];
  for (const zone of TEXAS_STATE_PLANE_ZONES) {
    const at = gridToLatLng(grid, zone.key);
    if (at && looksLikeTexas(at)) out.push({ zone, at });
  }
  return out;
}

/** Re-exported so callers need one import for "pick a zone, then project". */
export { TEXAS_STATE_PLANE_ZONES, zoneByKey };
export type { TexasStatePlaneZone };
