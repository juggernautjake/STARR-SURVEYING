// worker/src/research/parcel-geometry.ts — bearings + distances from a GIS parcel ring (plan B/C).
//
// The parcel-lines drawing already labelled each side's LENGTH; the owner also wants the recorded
// BEARING/azimuth beside it. These are GIS parcel-fabric geometry, NOT recorded plat calls — callers
// label them "GIS-computed" so a surveyor never mistakes them for record calls. Bearings use the same
// cos(lat) east-correction the render's length math uses: at Texas latitudes that is accurate to well
// within a degree, which is what a boundary sketch needs (survey-grade State Plane reprojection is a
// deferred item in the plan). Pure functions so the geometry is unit-tested without a browser.

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;

function toMercatorXY(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon * Math.PI) / 180) * EARTH_R_M;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * EARTH_R_M;
  return { x, y };
}

export interface ParcelSegment {
  /** [lon, lat] of the segment's start and end. */
  from: [number, number];
  to: [number, number];
  /** Ground length in feet. */
  lengthFt: number;
  /** Azimuth clockwise from north, degrees in [0, 360). */
  azimuthDeg: number;
  /** Quadrant bearing, e.g. "N45°12′E". */
  bearing: string;
}

/** Ground length in feet between two [lon,lat] points (Mercator, cos-lat corrected). */
export function segmentLengthFt(a: [number, number], b: [number, number]): number {
  const ma = toMercatorXY(a[0], a[1]);
  const mb = toMercatorXY(b[0], b[1]);
  const midLat = (a[1] + b[1]) / 2;
  const scale = Math.cos((midLat * Math.PI) / 180); // Mercator lengths are inflated by 1/cos(lat)
  const metres = Math.hypot(mb.x - ma.x, mb.y - ma.y) * scale;
  return metres * FT_PER_M;
}

/** Azimuth clockwise from north, degrees in [0, 360), from a→b. */
export function segmentAzimuthDeg(a: [number, number], b: [number, number]): number {
  const midLat = (a[1] + b[1]) / 2;
  const east = (b[0] - a[0]) * Math.cos((midLat * Math.PI) / 180);
  const north = b[1] - a[1];
  let deg = (Math.atan2(east, north) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/** Quadrant bearing string (e.g. "N45°12′E") from an azimuth clockwise-from-north. */
export function azimuthToBearing(azimuthDeg: number): string {
  const az = ((azimuthDeg % 360) + 360) % 360;
  let ns: 'N' | 'S', ew: 'E' | 'W', ang: number;
  if (az <= 90) { ns = 'N'; ew = 'E'; ang = az; }
  else if (az <= 180) { ns = 'S'; ew = 'E'; ang = 180 - az; }
  else if (az <= 270) { ns = 'S'; ew = 'W'; ang = az - 180; }
  else { ns = 'N'; ew = 'W'; ang = 360 - az; }
  const d = Math.floor(ang);
  let m = Math.round((ang - d) * 60);
  let dd = d;
  if (m === 60) { m = 0; dd = d + 1; }
  return `${ns}${dd}°${String(m).padStart(2, '0')}′${ew}`;
}

/**
 * Turn a ring of [lon,lat] vertices into its boundary segments (bearing + length each). The ring may
 * be closed (last vertex == first) or open; each consecutive pair becomes one segment.
 */
export function parcelSegments(ring: Array<[number, number]>): ParcelSegment[] {
  const out: ParcelSegment[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const azimuthDeg = segmentAzimuthDeg(a, b);
    out.push({
      from: a,
      to: b,
      lengthFt: segmentLengthFt(a, b),
      azimuthDeg,
      bearing: azimuthToBearing(azimuthDeg),
    });
  }
  return out;
}

/** Sum of segment lengths (feet) — the parcel perimeter. */
export function perimeterFt(ring: Array<[number, number]>): number {
  return parcelSegments(ring).reduce((sum, s) => sum + s.lengthFt, 0);
}
