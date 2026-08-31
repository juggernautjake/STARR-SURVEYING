// app/admin/research/[projectId]/_sections/traverse-geometry.ts — Phase B1a.
//
// Coordinate geometry for the traverse entry panel: turn a bearing and distance into a point, turn
// an azimuth back into a bearing string, and close a traverse back to its first vertex.
//
// ── THIS IS SURVEYING, AND IT WAS UNTESTED ──────────────────────────────────────────────────────
//
// It lived as three closures inside a 3,300-line component, so nothing could call it and nothing
// did. Every one of these is a convention that is easy to get backwards and impossible to notice
// from the code:
//
//   · **Azimuth is measured from NORTH, clockwise.** So the easting uses `sin` and the northing
//     uses `cos` — the opposite of the maths-class convention where an angle is measured from the
//     x-axis. Swapping them mirrors the whole traverse across the 45° line, which still *looks*
//     like a plausible parcel.
//   · **`Math.atan2(dx, dy)`, in that order.** `atan2` is conventionally `(y, x)`; passing the
//     arguments the usual way round gives an angle from the east axis, and every closing leg comes
//     out rotated 90°.
//   · **Quadrant bearings are not azimuths.** N 30° E is 30°, but S 30° E is 150° — the angle is
//     measured back from south, not continuing round. Getting the subtraction backwards produces
//     bearings that read correctly and point somewhere else.
//
// A wrong closing leg does not throw. It produces a parcel that closes to the wrong corner, and the
// error is a few feet — the size a surveyor might blame on the record rather than the software.

export interface TraversePoint {
  x: number;
  y: number;
}

export interface TraverseLeg {
  azimuth: number;
  distance: number;
}

/**
 * Where a leg from `from` ends up.
 *
 * `x` is easting, `y` is northing, azimuth in degrees from north.
 */
export function advance(from: TraversePoint, leg: TraverseLeg): TraversePoint {
  const rad = (leg.azimuth * Math.PI) / 180;
  return {
    // sin on the EASTING, cos on the NORTHING. See the header — this is the surveying convention,
    // not the trigonometry-class one, and swapping them mirrors the parcel about the 45° line.
    x: from.x + leg.distance * Math.sin(rad),
    y: from.y + leg.distance * Math.cos(rad),
  };
}

/** The leg that would take you from `last` back to `first`. */
export function closingLeg(first: TraversePoint, last: TraversePoint): TraverseLeg {
  const dx = first.x - last.x;
  const dy = first.y - last.y;
  return {
    // `(dx, dy)`, deliberately. `atan2` is normally `(y, x)`; north-referenced azimuth needs the
    // easting first, and the usual order rotates every closing leg by 90°.
    azimuth: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360,
    distance: Math.sqrt(dx * dx + dy * dy),
  };
}

/** Tolerance below which a traverse is already closed, in drawing units. */
export const CLOSED_TOLERANCE = 0.01;

/**
 * Should a closing leg be added at all?
 *
 * Needs at least three vertices — two points are a line, and "closing" them would just retrace the
 * same leg backwards — and must not add a zero-length leg to an already-closed figure.
 */
export function needsClosing(vertices: readonly TraversePoint[]): boolean {
  if (vertices.length < 3) return false;
  const { distance } = closingLeg(vertices[0], vertices[vertices.length - 1]);
  return distance >= CLOSED_TOLERANCE;
}

/**
 * Azimuth (degrees from north) to a quadrant bearing string, in degrees-minutes-seconds.
 *
 * The four quadrants each measure their angle from the nearer of north/south, so the arithmetic
 * differs per quadrant and two of them count backwards. N 30° E is azimuth 30; S 30° E is azimuth
 * **150**, not 210.
 */
export function azimuthToBearing(az: number): string {
  const a = ((az % 360) + 360) % 360;
  let ns: string;
  let ew: string;
  let angle: number;
  if (a <= 90) { ns = 'N'; ew = 'E'; angle = a; }
  else if (a <= 180) { ns = 'S'; ew = 'E'; angle = 180 - a; }
  else if (a <= 270) { ns = 'S'; ew = 'W'; angle = a - 180; }
  else { ns = 'N'; ew = 'W'; angle = 360 - a; }

  const deg = Math.floor(angle);
  const md = (angle - deg) * 60;
  const min = Math.floor(md);
  const sec = Math.round((md - min) * 60);
  return `${ns} ${deg}° ${min}' ${sec}" ${ew}`;
}
