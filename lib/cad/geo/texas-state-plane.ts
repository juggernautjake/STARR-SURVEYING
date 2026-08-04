// lib/cad/geo/texas-state-plane.ts — CAD_AUDIT Slice S16.
//
// One source of truth for the Texas State Plane zones.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
// EPSG:2277 was hardcoded in five places as the coordinate system for everything this software
// exports — the GeoJSON writer's `crs` member, the LandXML `<CoordinateSystem epsgCode>`, the
// Traverse PC bundle's README, the Orbit sync source CRS — and it was *described differently* in
// two of them. `lib/research/bell-cad-arcgis.service.ts` called WKID 2277 "NAD83 Texas **North
// Central**"; the CAD writers called it "Texas **Central**". They cannot both be right, and the CAD
// writers are: **2277 is Central. North Central is 2276.**
//
// That is not a comment typo with no consequences. The zone is stamped into files handed to clients
// and to other surveyors' software, and a receiving system that trusts the label will re-project
// from the wrong zone — putting the parcel some thousands of feet from where it belongs, with no
// error message anywhere, because every number involved is individually plausible.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
// **It does not re-project.** There is no projection library in this repo and adding one is a real
// decision, not a side effect of tidying a constant. Coordinates already flow through the editor
// untouched at their native state-plane values — which is the correct architecture for a firm
// working within one zone — so what was missing was never the maths. It was the *declaration*: the
// ability to say which zone a drawing is in, instead of assuming Central everywhere.
//
// **It does not compute a combined scale factor or convergence angle.** Both need the geodetic
// position and an ellipsoid model. They are recorded as an open question in the audit doc rather
// than approximated here, because a grid distance labelled as a ground distance is exactly the kind
// of confident wrong answer this codebase's rules exist to prevent.

/** A NAD83 Texas State Plane zone, in US survey feet — the units every Texas survey uses. */
export interface TexasStatePlaneZone {
  /** EPSG code for NAD83 / Texas <zone> (ftUS). Also the ArcGIS WKID. */
  epsg: number;
  /** Short key used in drawing settings and UI. */
  key: 'NORTH' | 'NORTH_CENTRAL' | 'CENTRAL' | 'SOUTH_CENTRAL' | 'SOUTH';
  /** Human-readable zone name, exactly as it should appear on a plat or in an export. */
  name: string;
  /** The full label for a `coordinateSystem` metadata field. */
  label: string;
  /** SPCS zone number, as it appears in NGS publications and most instrument firmware. */
  fipsZone: number;
}

/**
 * The five Texas zones, NAD83, US survey feet.
 *
 * The NAD27 equivalents (EPSG 32037–32041) are deliberately absent: an old deed may be *referenced*
 * to NAD27, but this software does not convert between datums, and offering NAD27 here would imply
 * it does. A NAD27 basis belongs in the survey notes as a stated fact about the record.
 */
export const TEXAS_STATE_PLANE_ZONES: readonly TexasStatePlaneZone[] = [
  { epsg: 2275, key: 'NORTH',         name: 'Texas North',         fipsZone: 4201, label: 'NAD83 / Texas State Plane North (US ft) — EPSG:2275' },
  { epsg: 2276, key: 'NORTH_CENTRAL', name: 'Texas North Central', fipsZone: 4202, label: 'NAD83 / Texas State Plane North Central (US ft) — EPSG:2276' },
  { epsg: 2277, key: 'CENTRAL',       name: 'Texas Central',       fipsZone: 4203, label: 'NAD83 / Texas State Plane Central (US ft) — EPSG:2277' },
  { epsg: 2278, key: 'SOUTH_CENTRAL', name: 'Texas South Central', fipsZone: 4204, label: 'NAD83 / Texas State Plane South Central (US ft) — EPSG:2278' },
  { epsg: 2279, key: 'SOUTH',         name: 'Texas South',         fipsZone: 4205, label: 'NAD83 / Texas State Plane South (US ft) — EPSG:2279' },
];

/**
 * The zone assumed when a drawing does not declare one.
 *
 * Central, because that is where this firm works and because it is what every existing export
 * already stamped — changing the effective default while consolidating the constant would silently
 * relabel files that were previously correct.
 */
export const DEFAULT_TEXAS_ZONE_KEY: TexasStatePlaneZone['key'] = 'CENTRAL';

export function zoneByKey(key: string | null | undefined): TexasStatePlaneZone {
  return TEXAS_STATE_PLANE_ZONES.find((z) => z.key === key)
    ?? TEXAS_STATE_PLANE_ZONES.find((z) => z.key === DEFAULT_TEXAS_ZONE_KEY)!;
}

/** Look a zone up by EPSG/WKID. Returns `null` for an unknown code rather than guessing — a code we
 *  do not recognise is not a Texas zone, and defaulting it to Central is how the mislabel above
 *  would happen again. */
export function zoneByEpsg(epsg: number | null | undefined): TexasStatePlaneZone | null {
  return TEXAS_STATE_PLANE_ZONES.find((z) => z.epsg === epsg) ?? null;
}

/** The OGC URN form used in GeoJSON's `crs` member. */
export function crsUrn(zone: TexasStatePlaneZone): string {
  return `urn:ogc:def:crs:EPSG::${zone.epsg}`;
}
