// lib/dnd/dice/project.ts — turn a rotated solid into the polygons to draw.
//
// Pure, no DOM, no React: rotate the vertices, throw away the faces pointing away from the viewer, flatten what
// is left, and work out how much light each face catches. That last part is the whole reason the dice are solids
// now rather than drawings — a face has a normal, so it can be lit, and lighting is what makes a shape read as an
// object instead of an outline.
//
// ORTHOGRAPHIC, DELIBERATELY. A perspective projection of a die at this size (about 108px) differs from an
// orthographic one by roughly a pixel, and buys a divide-by-depth per vertex per frame plus a class of bug where
// a face near the silhouette flips inside out. Real dice photographed at arm's length look orthographic anyway.
//
// COORDINATES ARE SVG's: a 0…100 viewBox, y increasing DOWNWARD. The flip happens once, here, at projection —
// doing it anywhere else means some code thinks up is up and some thinks it is down, which is the sort of thing
// that reads as "the die's lighting is upside down" and takes an hour to find.
import { type Solid, type Vec3, dot, norm } from './solids';

/** A rotation, as a unit quaternion [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const [x, y, z] = norm(axis);
  const h = angle / 2;
  const s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  // t = 2 * (q_vec × v); v' = v + qw * t + q_vec × t
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Shortest-arc rotation taking `from` to `to`. Used to land a chosen face toward the camera. */
export function quatBetween(from: Vec3, to: Vec3): Quat {
  const a = norm(from);
  const b = norm(to);
  const d = dot(a, b);
  if (d > 0.999999) return QUAT_IDENTITY;
  if (d < -0.999999) {
    // Exactly opposed: any perpendicular axis gives a valid half turn, but it has to be a real perpendicular.
    const axis: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const perp: Vec3 = [
      a[1] * axis[2] - a[2] * axis[1],
      a[2] * axis[0] - a[0] * axis[2],
      a[0] * axis[1] - a[1] * axis[0],
    ];
    return quatFromAxisAngle(perp, Math.PI);
  }
  const axis: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q: Quat = [axis[0], axis[1], axis[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  // Take the short way round. Without this a settle can spin the die most of the way about instead of easing in.
  if (d < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    d = -d;
  }
  if (d > 0.9995) {
    const out: Quat = [
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ];
    const l = Math.hypot(...out) || 1;
    return [out[0] / l, out[1] / l, out[2] / l, out[3] / l];
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, d)));
  const s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s;
  const wb = Math.sin(t * theta) / s;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

export interface ProjectedFace {
  /** SVG `points` for this face, in the 0…100 viewBox. */
  points: string;
  /** Signed light: > 0 lightens the body fill, < 0 darkens it. Roughly −0.42…+0.34. */
  shade: number;
  /** How square-on the face is: 1 facing the camera, 0 edge-on. Numerals fade out as this drops. */
  facing: number;
  /** Where the numeral goes, in viewBox units. */
  cx: number;
  cy: number;
  /** Projected area, viewBox units². Numerals scale with it, which is what makes a d100's digits tiny. */
  area: number;
  /** The numeral on this face. */
  pip: number;
  /** Index into `solid.faces`, so a caller can single out the landing face. */
  index: number;
  /** View-space z of the face centre. Only used to sort; exposed because sorting is the caller's business too. */
  depth: number;
}

export interface Projection {
  /** Far-to-near, so painting them in order gives correct occlusion without a z-buffer. */
  faces: ProjectedFace[];
  /** The die's outline: convex hull of the visible projected vertices. */
  silhouette: string;
}

export interface ProjectOptions {
  /** Radius in viewBox units. 44 leaves room for the edge stroke inside a 0…100 box. */
  radius?: number;
  /** Direction light arrives FROM, in view space (y up, z toward viewer). */
  light?: Vec3;
  /** Shading strength. 0 gives a flat die. */
  contrast?: number;
}

const DEFAULT_LIGHT: Vec3 = [-0.35, 0.72, 0.6];

/**
 * Project a solid under rotation `q`.
 *
 * Back faces are culled by the sign of the rotated normal's z. That single test is what makes the die read as
 * solid while it turns: faces rotate away, disappear at the silhouette, and others come round — motion nothing
 * about a flat drawing can imitate.
 */
export function projectSolid(solid: Solid, q: Quat, opts: ProjectOptions = {}): Projection {
  const radius = opts.radius ?? 44;
  const light = norm(opts.light ?? DEFAULT_LIGHT);
  const contrast = opts.contrast ?? 0.38;

  const rotated = solid.verts.map((v) => quatRotate(q, v));
  // Screen space: centre 50,50, y flipped for SVG.
  const px = rotated.map((v): [number, number] => [50 + v[0] * radius, 50 - v[1] * radius]);

  const faces: ProjectedFace[] = [];
  const onOutline: [number, number][] = [];

  solid.faces.forEach((face, index) => {
    const n = quatRotate(q, solid.normals[index]);
    // Facing the camera (+z toward the viewer). The small epsilon drops faces exactly edge-on, which would
    // otherwise render as a zero-area sliver and flicker.
    if (n[2] <= 0.015) return;

    const pts = face.map((i) => px[i]);
    for (const p of pts) onOutline.push(p);

    // Shoelace, in SVG coordinates — hence the negation, since y is flipped and the sign would come out inverted.
    let twiceArea = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      twiceArea += x1 * y2 - x2 * y1;
    }
    const area = Math.abs(twiceArea) / 2;

    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const depth = face.reduce((a, i) => a + rotated[i][2], 0) / face.length;

    // Lambert, then re-centred so a mid-lit face sits at zero. The renderer paints positive as white and
    // negative as black over the themed body, so shading composes on any skin (plan ground rule G4).
    const lambert = Math.max(0, dot(n, light));
    faces.push({
      points: pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' '),
      shade: round((lambert - 0.52) * contrast * 2),
      facing: round(n[2]),
      cx: round(cx),
      cy: round(cy),
      area: round(area),
      pip: solid.pips[index],
      index,
      depth,
    });
  });

  // Far to near: painting in this order gives correct occlusion with no z-buffer. Convex solids make this
  // exact rather than an approximation — no two faces of a convex body can interleave in depth.
  faces.sort((a, b) => a.depth - b.depth);

  return { faces, silhouette: hull2d(onOutline).map(([x, y]) => `${round(x)},${round(y)}`).join(' ') };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** 2D convex hull (monotone chain) — the die's outline, from the visible vertices. */
function hull2d(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const pt of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], pt) <= 0) out.pop();
      out.push(pt);
    }
    return out;
  };
  const lower = half(p);
  const upper = half([...p].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * How far off dead-on a settled die rests, in radians.
 *
 * A DIE SETTLED EXACTLY SQUARE-ON LOOKS FLAT, and this is the difference between "a solid at rest" and "a shape".
 * Viewed precisely along a face normal, a cube shows one face and culls the other five — every neighbour is
 * exactly edge-on — so the beautiful faceted solid renders as a plain rotated square with a number in it. Which is
 * roughly what the previous flat-SVG die looked like, i.e. the whole exercise wasted at the one moment the player
 * is actually looking.
 *
 * Tilting a little shows the landing face plus the two or three turning away from it, which is how a die looks in
 * any photograph of one. The tilt has to SHRINK as faces get smaller, though: neighbouring facets are ~41° apart
 * on a d20 but only ~20° apart on the hundred-sided ball, and a tilt approaching half that spacing would let a
 * neighbour become more camera-facing than the face that was actually rolled.
 */
export function settleTilt(faceCount: number): number {
  // A TETRAHEDRON NEEDS MORE THAN THE REST, and the number comes straight from its geometry: the angle between
  // two of its face normals is arccos(−1/3) ≈ 109.5°, so at a 16° tilt every neighbour is still past edge-on and
  // culled — the d4 was the one die that stayed flat. Above 19.5° a second face appears; 25° shows two clearly
  // while leaving the landing face overwhelmingly dominant.
  if (faceCount <= 4) return (25 * Math.PI) / 180;
  if (faceCount <= 12) return (16 * Math.PI) / 180;
  if (faceCount <= 20) return (13 * Math.PI) / 180;
  if (faceCount <= 40) return (7 * Math.PI) / 180;
  return (4 * Math.PI) / 180;
}

/**
 * The rotation that presents `face` to the camera — where a thrown die has to end up.
 *
 * Not quite square-on: see `settleTilt`. The landing face remains by a wide margin the most camera-facing one, so
 * it is unambiguously the number that was rolled.
 */
export function orientationFor(solid: Solid, face: number, spinAboutZ = 0): Quat {
  const toCamera = quatBetween(solid.normals[face], [0, 0, 1]);
  const tiltAngle = settleTilt(solid.faces.length);

  // THE DIE TIPS TOWARD ITS NEAREST NEIGHBOURING FACE, rather than in some fixed direction — and that is not a
  // refinement, it is what makes the tilt work at all. A fixed tilt direction can tip AWAY from every neighbour:
  // on a tetrahedron the three neighbours sit 109.5° from the front face and 120° apart in azimuth, so a tilt
  // pointing between two of them lifts neither into view and the d4 renders flat no matter how far it leans.
  // Choosing the axis from the geometry guarantees a second face appears on every solid.
  let bestZ = -Infinity;
  let dir: [number, number] = [1, 0];
  solid.normals.forEach((n, i) => {
    if (i === face) return;
    const r = quatRotate(toCamera, n);
    const h = Math.hypot(r[0], r[1]);
    if (h < 1e-9) return;
    if (r[2] > bestZ) {
      bestZ = r[2];
      dir = [r[0] / h, r[1] / h];
    }
  });
  // Rotating about (dirY, −dirX, 0) swings `dir` toward the camera — see the Rodrigues check: for dir = +X the
  // axis is −Y, and +X rotates to +Z.
  const rest = quatMul(quatFromAxisAngle([dir[1], -dir[0], 0], tiltAngle), toCamera);
  // The spin about the view axis keeps two rolls of the same number from looking like a replay.
  return spinAboutZ ? quatMul(quatFromAxisAngle([0, 0, 1], spinAboutZ), rest) : rest;
}
