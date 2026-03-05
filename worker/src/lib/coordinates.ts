// worker/src/lib/coordinates.ts
// Coordinate System Transformation — Starr Software Spec v2.0 §16 (Known Issue #9)
//
// Converts between NAD83 Texas Central State Plane (FIPS 4203, US Survey Feet)
// and WGS84 geographic coordinates (decimal degrees lat/lon).
//
// Used by: txdot-row.ts to build WGS84 bounding boxes for the ArcGIS REST query
//          from property coordinates stored in NAD83 Texas Central.
//
// Implementation: Lambert Conformal Conic inverse projection.
// Reference: NOAA Manual NOS NGS 5 (State Plane Coordinate System of 1983)

// ── NAD83 Texas Central (FIPS 4203) projection parameters ────────────────────

const NAD83_TEXAS_CENTRAL = {
  // GRS 80 ellipsoid
  a:  6_378_137.0,         // semi-major axis in meters
  f:  1 / 298.257222101,   // flattening

  // Lambert Conformal Conic parameters
  lat0_deg:  29 + 40/60,               // origin latitude  29°40'N
  lon0_deg:  -(100 + 20/60),           // central meridian 100°20'W
  lat1_deg:  30 + 7/60,                // standard parallel 1  30°07'N
  lat2_deg:  31 + 53/60,               // standard parallel 2  31°53'N
  falseE_ft:  2_296_583.333,           // false easting in US survey feet
  falseN_ft:  9_842_519.685,           // false northing in US survey feet
} as const;

/** US Survey Foot in meters: 1200/3937 (exact) */
const US_SURVEY_FOOT = 1200 / 3937;

function toRad(deg: number): number { return deg * Math.PI / 180; }
function toDeg(rad: number): number { return rad * 180 / Math.PI; }

// ── Lambert Conformal Conic Inverse ──────────────────────────────────────────

/**
 * Convert NAD83 Texas Central State Plane coordinates (US Survey Feet)
 * to WGS84 geographic coordinates (decimal degrees).
 *
 * The NAD83 and WGS84 datums are essentially coincident for US work
 * (difference < 1 meter), so no datum transformation is applied.
 *
 * @param easting_ft   Easting in US survey feet
 * @param northing_ft  Northing in US survey feet
 * @returns            { lat, lon } in decimal degrees (WGS84)
 */
export function nad83TexasCentralToWGS84(
  easting_ft:  number,
  northing_ft: number,
): { lat: number; lon: number } {
  const { a, f, lat0_deg, lon0_deg, lat1_deg, lat2_deg, falseE_ft, falseN_ft } = NAD83_TEXAS_CENTRAL;

  // Convert feet → meters
  const E = easting_ft  * US_SURVEY_FOOT;
  const N = northing_ft * US_SURVEY_FOOT;
  const E0 = falseE_ft  * US_SURVEY_FOOT;
  const N0 = falseN_ft  * US_SURVEY_FOOT;

  // Ellipsoid derived
  const b  = a * (1 - f);
  const e2 = (a * a - b * b) / (a * a);   // first eccentricity squared
  const e  = Math.sqrt(e2);

  const phi1 = toRad(lat1_deg);
  const phi2 = toRad(lat2_deg);
  const phi0 = toRad(lat0_deg);
  const lam0 = toRad(lon0_deg);

  // m and t helpers
  function mVal(phi: number): number {
    const sinp = Math.sin(phi);
    return Math.cos(phi) / Math.sqrt(1 - e2 * sinp * sinp);
  }
  function tVal(phi: number): number {
    const sinp = Math.sin(phi);
    const eSinp = e * sinp;
    return Math.tan(Math.PI / 4 - phi / 2) /
      Math.pow((1 - eSinp) / (1 + eSinp), e / 2);
  }

  const m1 = mVal(phi1);
  const m2 = mVal(phi2);
  const t1 = tVal(phi1);
  const t2 = tVal(phi2);
  const t0 = tVal(phi0);

  const n  = Math.log(m1 / m2) / Math.log(t1 / t2);
  const F  = m1 / (n * Math.pow(t1, n));
  const r0 = a * F * Math.pow(t0, n);

  // Inverse computation
  const x = E - E0;
  const y = N0 - N;  // note: y is measured from the false northing (northing decreases downward)

  // Actually for LCC: E' = E - E0, N' = r0 - (N - N0)
  const xp = E - E0;
  const r_prime = r0 - (N - N0);

  const r_  = Math.sign(n) * Math.sqrt(xp * xp + r_prime * r_prime);
  const t_  = Math.pow(r_ / (a * F), 1 / n);
  const theta_ = Math.atan2(xp, r_prime);

  const lam = theta_ / n + lam0;

  // Iterative latitude computation
  let phi = Math.PI / 2 - 2 * Math.atan(t_);
  for (let i = 0; i < 10; i++) {
    const sinp   = Math.sin(phi);
    const eSinp  = e * sinp;
    const phiNew = Math.PI / 2 - 2 * Math.atan(t_ * Math.pow((1 - eSinp) / (1 + eSinp), e / 2));
    if (Math.abs(phiNew - phi) < 1e-11) break;
    phi = phiNew;
  }

  return { lat: toDeg(phi), lon: toDeg(lam) };
}

/**
 * Convert WGS84 geographic coordinates to NAD83 Texas Central State Plane
 * (US Survey Feet). Inverse of nad83TexasCentralToWGS84.
 *
 * @param lat  Latitude in decimal degrees
 * @param lon  Longitude in decimal degrees (negative for West)
 * @returns    { easting_ft, northing_ft } in US survey feet
 */
export function wgs84ToNad83TexasCentral(
  lat: number,
  lon: number,
): { easting_ft: number; northing_ft: number } {
  const { a, f, lat0_deg, lon0_deg, lat1_deg, lat2_deg, falseE_ft, falseN_ft } = NAD83_TEXAS_CENTRAL;

  const E0 = falseE_ft  * US_SURVEY_FOOT;
  const N0 = falseN_ft  * US_SURVEY_FOOT;

  const b  = a * (1 - f);
  const e2 = (a * a - b * b) / (a * a);
  const e  = Math.sqrt(e2);

  const phi  = toRad(lat);
  const lam  = toRad(lon);
  const phi1 = toRad(lat1_deg);
  const phi2 = toRad(lat2_deg);
  const phi0 = toRad(lat0_deg);
  const lam0 = toRad(lon0_deg);

  function mVal(p: number): number {
    const sinp = Math.sin(p);
    return Math.cos(p) / Math.sqrt(1 - e2 * sinp * sinp);
  }
  function tVal(p: number): number {
    const sinp  = Math.sin(p);
    const eSinp = e * sinp;
    return Math.tan(Math.PI / 4 - p / 2) /
      Math.pow((1 - eSinp) / (1 + eSinp), e / 2);
  }

  const m1 = mVal(phi1); const m2 = mVal(phi2);
  const t1 = tVal(phi1); const t2 = tVal(phi2);
  const t0 = tVal(phi0); const t  = tVal(phi);

  const n  = Math.log(m1 / m2) / Math.log(t1 / t2);
  const F  = m1 / (n * Math.pow(t1, n));
  const r0 = a * F * Math.pow(t0, n);
  const r  = a * F * Math.pow(t, n);

  const theta = n * (lam - lam0);

  const E_m = E0 + r * Math.sin(theta);
  const N_m = N0 + r0 - r * Math.cos(theta);

  return {
    easting_ft:  E_m / US_SURVEY_FOOT,
    northing_ft: N_m / US_SURVEY_FOOT,
  };
}

/**
 * Build a WGS84 bounding box from a NAD83 Texas Central coordinate center.
 * Applies a buffer in US survey feet before converting.
 *
 * @param centerEasting_ft   Center easting in US survey feet
 * @param centerNorthing_ft  Center northing in US survey feet
 * @param buffer_ft          Buffer distance in feet (default 1000ft ≈ 1/5 mile)
 */
export function buildWGS84BoundsFromNAD83(
  centerEasting_ft:  number,
  centerNorthing_ft: number,
  buffer_ft = 1000,
): { minLat: number; minLon: number; maxLat: number; maxLon: number } {
  const sw = nad83TexasCentralToWGS84(centerEasting_ft - buffer_ft, centerNorthing_ft - buffer_ft);
  const ne = nad83TexasCentralToWGS84(centerEasting_ft + buffer_ft, centerNorthing_ft + buffer_ft);

  return {
    minLat: sw.lat, maxLat: ne.lat,
    minLon: sw.lon, maxLon: ne.lon,
  };
}

/**
 * Build a WGS84 bounding box directly from a lat/lon center.
 * Used when NAD83 state plane coordinates are not available.
 */
export function buildWGS84BoundsFromLatLon(
  lat: number,
  lon: number,
  buffer_ft = 1000,
): { minLat: number; minLon: number; maxLat: number; maxLon: number } {
  // 1 degree of latitude ≈ 364,000 ft; 1 degree of longitude ≈ 364,000 × cos(lat) ft
  const bufDegLat = buffer_ft / 364_000;
  const bufDegLon = buffer_ft / (364_000 * Math.cos(toRad(lat)));
  return {
    minLat: lat - bufDegLat, maxLat: lat + bufDegLat,
    minLon: lon - bufDegLon, maxLon: lon + bufDegLon,
  };
}
