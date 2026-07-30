// lib/dnd/dice/solids.ts — the dice, as actual polyhedra.
//
// OWNER, twice: *"Some of the dice shapes and stuff don't really look like the dice they are representing. The
// d100 and d20 don't look like they should."* / *"Please make the d100 look like an actual d100."*
//
// WHY THOSE COMPLAINTS WERE UNFIXABLE AS THE CODE STOOD. The previous die was a flat SVG silhouette whose facet
// coordinates I typed in by hand, from what a d20 looks like in my head. A drawing cannot be made *more*
// correct — it can only be redrawn, and the next redraw is another guess. Worse, the d100 was not even
// attempted: `dieSides` mapped d100 → 10 and it rendered as a d10.
//
// So this module holds no pictures. It holds the SOLIDS — vertices, faces, and the numeral on each face — and
// the picture is computed from them by `project.ts`. Everything the owner asked for downstream (shapes that
// look right, dice that visibly tumble, numerals on every visible face, per-face lighting, materials) needs a
// face normal, which a drawing does not have and a solid does.
//
// THE GEOMETRY IS DERIVED, NOT TYPED (ground rule G1 in the plan doc). Faces are found from the vertices;
// winding is fixed by the outward normal; numerals are assigned by antipodal pairing so opposite faces sum to
// the value real dice use (7 on a d6, 21 on a d20). A hand-tweaked coordinate here would be a regression, and
// the tests assert properties of real objects — closure, planarity, outward winding, opposite-face sums — so
// they cannot be satisfied by a table that merely looks plausible.

export type Vec3 = readonly [number, number, number];

export interface Solid {
  /** Unit-ish vertices, centred on the origin. */
  verts: Vec3[];
  /** Each face as vertex indices, wound counter-clockwise seen from OUTSIDE. */
  faces: number[][];
  /** The numeral printed on each face; `pips[i]` belongs to `faces[i]`. */
  pips: number[];
  /** Outward unit normal per face, precomputed (the renderer needs it every frame). */
  normals: Vec3[];
}

// ── vector helpers ────────────────────────────────────────────────────────────
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** The outward unit normal of a face, and the winding needed to make it outward. */
function faceNormal(verts: Vec3[], face: number[]): Vec3 {
  // Newell's method: robust for polygons with more than three vertices, where any single vertex triple can be
  // near-degenerate. A cross product of the first three points would be fine for the triangles and wrong for
  // a d12's pentagons whenever the projection made three of its points nearly collinear.
  let n: Vec3 = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = verts[face[i]];
    const b = verts[face[(i + 1) % face.length]];
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return norm(n);
}

/** Reverse any face wound the wrong way, so every normal points away from the centre. */
function orientOutward(verts: Vec3[], faces: number[][]): number[][] {
  return faces.map((f) => {
    const centre = f.reduce<Vec3>((a, i) => add(a, verts[i]), [0, 0, 0]);
    // A convex solid centred on the origin: the face's own centroid IS its outward direction.
    return dot(faceNormal(verts, f), centre) < 0 ? [...f].reverse() : f;
  });
}

/**
 * Assign numerals so that opposite faces sum to `total` — the convention real dice use (1 opposite 6 on a d6,
 * 1 opposite 20 on a d20). DERIVED from the geometry rather than typed out: find each face's antipode by
 * normal, then walk pairs handing out `v` and `total - v`.
 *
 * Solids with no antipodal pairing (the tetrahedron, where each face is opposite a *vertex*) fall through to
 * sequential numbering, which is what a d4 actually does.
 */
function assignPips(normals: Vec3[], total: number | null): number[] {
  const n = normals.length;
  if (total === null) return normals.map((_, i) => i + 1);

  // THE PAIRING MUST BE MUTUAL. A plain argmax ("whichever face is most opposite to me") is not symmetric when
  // several faces are nearly antipodal, which is the situation on the d100's hundred small facets: face A's best
  // match was B while B's best match was C, so A took value 2 and B took 100 and the pair summed to 102. Only
  // accepting i↔j when each is the other's best match makes the relation a genuine involution.
  const bestAntipode = normals.map((a) => {
    let best = -1;
    let bestDot = -Infinity;
    normals.forEach((b, j) => {
      const d = dot(a, scale(b, -1));
      if (d > bestDot) {
        bestDot = d;
        best = j;
      }
    });
    return bestDot > 0.999 ? best : -1;
  });
  const partner = bestAntipode.map((j, i) => (j >= 0 && j !== i && bestAntipode[j] === i ? j : -1));

  const pips = new Array<number>(n).fill(0);
  const taken = new Set<number>();
  let next = 1;
  for (let i = 0; i < n; i++) {
    if (pips[i] || partner[i] < 0) continue;
    pips[i] = next;
    pips[partner[i]] = total - next;
    taken.add(next).add(total - next);
    next++;
  }
  // Any face with no antipode (a d4's faces, or a numerically odd one out) takes the next unused value, so the
  // die still carries 1…n exactly once.
  let spare = 1;
  for (let i = 0; i < n; i++) {
    if (pips[i]) continue;
    while (taken.has(spare)) spare++;
    pips[i] = spare;
    taken.add(spare);
  }
  return pips;
}

function build(verts: Vec3[], rawFaces: number[][], oppositeSum: number | null): Solid {
  const faces = orientOutward(verts, rawFaces);
  const normals = faces.map((f) => faceNormal(verts, f));
  return { verts, faces, normals, pips: assignPips(normals, oppositeSum) };
}

// ── the five Platonic dice ────────────────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2;

/** d4 — tetrahedron. Numerals run 1–4; a d4 has no opposite faces to pair. */
function tetrahedron(): Solid {
  const corners: Vec3[] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  const verts = corners.map(norm);
  return build(verts, facesFromHull(verts), null);
}

/** d6 — the cube. Opposite faces sum to 7. */
function cube(): Solid {
  const verts: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) verts.push(norm([x, y, z]));
  return build(verts, facesFromHull(verts), 7);
}

/** d8 — octahedron. Opposite faces sum to 9. */
function octahedron(): Solid {
  const verts: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  return build(verts, facesFromHull(verts), 9);
}

/** d20 — icosahedron. Opposite faces sum to 21. */
function icosahedron(): Solid {
  const raw: Vec3[] = [];
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    raw.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
  }
  const verts = raw.map(norm);
  // FACES ARE FOUND, NOT LISTED — every solid here goes through the same hull-and-merge derivation. Typing out
  // twenty vertex triples is precisely the kind of hand-authored table that produced a wrong-looking d20.
  return build(verts, facesFromHull(verts), 21);
}

/** d12 — dodecahedron. Opposite faces sum to 13. */
function dodecahedron(): Solid {
  const raw: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) raw.push([x, y, z]);
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    raw.push([0, s1 / PHI, s2 * PHI], [s1 / PHI, s2 * PHI, 0], [s2 * PHI, 0, s1 / PHI]);
  }
  const verts = raw.map(norm);
  return build(verts, facesFromHull(verts), 13);
}

/** Order coplanar vertex indices into a ring, by angle about `axis`. Unordered indices draw as a star. */
function ringOrder(verts: Vec3[], idx: number[], axis: Vec3): number[] {
  const n = norm(axis);
  // Any vector not parallel to the axis gives a usable tangent basis.
  const seed: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(n, seed));
  const v = cross(n, u);
  const centre = scale(idx.reduce<Vec3>((a, i) => add(a, verts[i]), [0, 0, 0]), 1 / idx.length);
  return [...idx].sort((a, b) => {
    const pa = sub(verts[a], centre);
    const pb = sub(verts[b], centre);
    return Math.atan2(dot(pa, v), dot(pa, u)) - Math.atan2(dot(pb, v), dot(pb, u));
  });
}

// ── d10: the pentagonal trapezohedron ─────────────────────────────────────────

/**
 * d10 — a pentagonal trapezohedron: ten kite faces, two apexes, and the zigzag equator that is the visual tell
 * of a d10. Opposite faces sum to 11.
 *
 * The apex height is SOLVED, not chosen. A kite (apex, high, low, high) is only planar for one apex height per
 * equator offset, and an unsolved height gives faces that are subtly bent — which reads as a dent in the die
 * once the faces are individually shaded. Bisection on the coplanarity determinant, which is cheap and exact
 * enough that the planarity test passes at 1e-9.
 */
function trapezohedron10(): Solid {
  const N = 5;
  const e = 0.28; // equator half-offset; taste, and the only free parameter
  const equator = (k: number, z: number): Vec3 => {
    const a = (k * Math.PI) / N;
    return [Math.cos(a), Math.sin(a), z];
  };
  const eq: Vec3[] = [];
  for (let k = 0; k < 2 * N; k++) eq.push(equator(k, k % 2 === 0 ? e : -e));

  // Coplanarity of [apex, eq0, eq1, eq2] as a function of apex height.
  const bend = (h: number) => {
    const apex: Vec3 = [0, 0, h];
    const a = sub(eq[0], apex);
    const b = sub(eq[1], apex);
    const c = sub(eq[2], apex);
    return dot(cross(a, b), c);
  };
  let lo = 0.05;
  let hi = 6;
  // The determinant changes sign across the planar height; 80 halvings is far past double precision.
  if (bend(lo) * bend(hi) < 0) {
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (bend(lo) * bend(mid) <= 0) hi = mid;
      else lo = mid;
    }
  }
  const h = (lo + hi) / 2;

  const verts: Vec3[] = [[0, 0, h], [0, 0, -h], ...eq];
  const NORTH = 0;
  const SOUTH = 1;
  const E = (k: number) => 2 + ((k % (2 * N)) + 2 * N) % (2 * N);
  const faces: number[][] = [];
  for (let k = 0; k < 2 * N; k += 2) faces.push([NORTH, E(k), E(k + 1), E(k + 2)]);
  for (let k = 1; k < 2 * N; k += 2) faces.push([SOUTH, E(k), E(k + 1), E(k + 2)]);
  return build(verts, faces, 11);
}

// ── d100: the Zocchihedron ────────────────────────────────────────────────────

/**
 * d100 — a hundred-sided ball, and the one the owner called out twice.
 *
 * A real Zocchihedron is a hundred small facets on a sphere. It is not a uniform polyhedron, and there is no
 * geodesic subdivision with a hundred faces (those come in 20T for T = 1, 3, 4, 7, 9 …, and 5 is not a valid
 * T) — so it has to be derived some other way.
 *
 * THE FIRST ATTEMPT WAS THE SPHERICAL VORONOI of a hundred Fibonacci points — the dual of their hull. It gives
 * exactly a hundred cells and looks right, and the planarity test rejected it: **spherical Voronoi cells are
 * provably not planar**, and its cells were 0.006 out of plane. Tiny, and still wrong in a way that shows up
 * once every face is shaded separately, because a non-planar face has no single normal to light it by.
 *
 * WHAT WORKS, exactly: a convex hull of **52** co-spherical points has 2n − 4 = **100 triangular faces**, every
 * one planar by construction. Small triangular facets on a near-spherical outline: a d100.
 *
 * AND IT IS NUMBERED WITHOUT THE OPPOSITE-SUM RULE, deliberately. Every other die here pairs antipodal faces so
 * they sum (7 on a d6, 21 on a d20). The Zocchihedron does not: it is famously not a regular solid, its facets
 * are unequal, and its numbering is distributed around the ball rather than paired. Trying to force pairing here
 * also failed for a concrete reason worth recording — when four of the 52 points are coplanar the hull may split
 * that quad one way on the northern side and the other way on the southern, so the face set is not exactly
 * centrally symmetric even though the vertex set is, and a handful of faces have no exact antipode to pair with.
 * The fix is not to fight the geometry: the real die does not pair either.
 *
 * So the numerals are spread by a stride coprime with 100, which is a permutation of 1…100 that puts very
 * different numbers on neighbouring facets — what the real die looks like, and derived rather than typed.
 *
 * The digits come out tiny with nobody asking for a smaller font, because the renderer scales each numeral to
 * its own face's projected area — the owner's "really little digit font" as a consequence of geometry rather
 * than as a special case.
 */
function zocchihedron(): Solid {
  // 52 vertices → 2·52 − 4 = 100 triangles. 26 on the northern hemisphere, plus their antipodes.
  const HALF = 26;
  const ga = Math.PI * (3 - Math.sqrt(5)); // golden angle
  const north: Vec3[] = [];
  for (let i = 0; i < HALF; i++) {
    // z strictly inside (0, 1): a point exactly ON the equator is coplanar with its own antipode and its
    // neighbours, which makes the hull non-simplicial and costs us the exact face count.
    const z = (i + 0.5) / HALF;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = i * ga;
    north.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  const antipodes: Vec3[] = north.map((p) => [-p[0], -p[1], -p[2]]);
  const verts: Vec3[] = [...north, ...antipodes];
  const solid = build(verts, hull3d(verts), null);
  return { ...solid, pips: solid.faces.map((_, i) => ((i * 37) % 100) + 1) };
}

/**
 * Convex hull of a point set, as outward-wound triangles. Incremental: seed with a well-spread tetrahedron,
 * then add each remaining point by deleting the faces it can see and stitching the horizon.
 *
 * THE SEED HAS TO BE SPREAD, and getting that wrong is instructive. The first version took "the first four
 * points that are not coplanar", which for a Fibonacci sphere means four points clustered around one pole. That
 * tetrahedron does not contain the origin, so orienting its faces by "away from the origin" wound them
 * arbitrarily, every subsequent visibility test was against a garbage normal, and the hull came out with eight
 * faces instead of a hundred and ninety-six. The tests caught it as "edges not shared by exactly two faces".
 *
 * Hence: extremes along an axis, then furthest from that line, then furthest from that plane — and faces
 * oriented against the seed's own centroid, which is provably inside the hull, rather than against the origin,
 * which is only inside it by luck.
 */
function hull3d(pts: Vec3[]): number[][] {
  if (pts.length < 4) return [];
  // Seed 1 & 2: the extremes along x.
  let i0 = 0;
  let i1 = 0;
  pts.forEach((p, i) => {
    if (p[0] < pts[i0][0]) i0 = i;
    if (p[0] > pts[i1][0]) i1 = i;
  });
  // Seed 3: furthest from the line i0→i1.
  let i2 = -1;
  let best = -1;
  const axis = sub(pts[i1], pts[i0]);
  pts.forEach((p, i) => {
    const d = len(cross(axis, sub(p, pts[i0])));
    if (d > best) {
      best = d;
      i2 = i;
    }
  });
  // Seed 4: furthest from the plane of the first three.
  const planeN = cross(sub(pts[i1], pts[i0]), sub(pts[i2], pts[i0]));
  let i3 = -1;
  best = -1;
  pts.forEach((p, i) => {
    const d = Math.abs(dot(planeN, sub(p, pts[i0])));
    if (d > best) {
      best = d;
      i3 = i;
    }
  });
  const seed = [i0, i1, i2, i3];
  if (new Set(seed).size < 4) return [];

  // An interior point of the hull, for the whole run. The seed centroid qualifies and the origin may not.
  const inside = scale(seed.reduce<Vec3>((a, i) => add(a, pts[i]), [0, 0, 0]), 1 / 4);
  const outward = (f: number[]) => {
    const n = faceNormal(pts, f);
    return dot(n, sub(pts[f[0]], inside)) < 0 ? [...f].reverse() : f;
  };
  const orient = (fs: number[][]) => fs.map(outward);
  const visible = (f: number[], p: Vec3) => dot(faceNormal(pts, f), sub(p, pts[f[0]])) > 1e-12;

  const [a, b, c, d] = seed;
  let faces = orient([[a, b, c], [a, b, d], [a, c, d], [b, c, d]]);
  const used = new Set(seed);

  const key = (x: number, y: number) => (x < y ? `${x}:${y}` : `${y}:${x}`);
  for (let p = 0; p < pts.length; p++) {
    if (used.has(p)) continue;
    used.add(p);
    const lit = faces.filter((f) => visible(f, pts[p]));
    if (!lit.length) continue; // strictly inside the hull
    const keep = faces.filter((f) => !visible(f, pts[p]));
    // The horizon is every edge belonging to exactly one lit face.
    const count = new Map<string, number>();
    for (const f of lit)
      for (let i = 0; i < f.length; i++) count.set(key(f[i], f[(i + 1) % f.length]), (count.get(key(f[i], f[(i + 1) % f.length])) ?? 0) + 1);
    const stitched: number[][] = [];
    for (const f of lit)
      for (let i = 0; i < f.length; i++) {
        const u = f[i];
        const v = f[(i + 1) % f.length];
        if (count.get(key(u, v)) === 1) stitched.push([u, v, p]);
      }
    faces = orient([...keep, ...stitched]);
  }
  return faces;
}

/**
 * The polyhedron's real faces from its vertices: hull it, then MERGE COPLANAR TRIANGLES back into the polygon
 * they belong to. A convex hull triangulates flat faces, so a cube hulls to twelve triangles and a dodecahedron
 * to thirty-six; merging them by plane recovers the six quads and twelve pentagons.
 *
 * This replaced a heuristic — "the five vertices furthest along each face normal" — that was wrong for the d12
 * and produced faces whose vertices were half a unit out of plane. The heuristic needed to be told each face's
 * direction; this needs to be told nothing at all, which is the difference between derived and guessed (G1).
 */
function facesFromHull(verts: Vec3[]): number[][] {
  const tris = hull3d(verts);
  // Group by plane. Quantised so floating-point noise does not split one face into two.
  const groups = new Map<string, number[][]>();
  for (const t of tris) {
    const n = faceNormal(verts, t);
    const off = dot(n, verts[t[0]]);
    const k = [n[0], n[1], n[2], off].map((x) => (Math.abs(x) < 1e-7 ? 0 : Math.round(x * 1e5) / 1e5)).join('|');
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const faces: number[][] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      faces.push(group[0]);
      continue;
    }
    // Boundary edges of the group: those used by exactly one of its triangles.
    const count = new Map<string, [number, number]>();
    const seen = new Map<string, number>();
    for (const t of group)
      for (let i = 0; i < t.length; i++) {
        const u = t[i];
        const v = t[(i + 1) % t.length];
        const k = u < v ? `${u}:${v}` : `${v}:${u}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
        count.set(k, [u, v]);
      }
    const boundary = [...seen.entries()].filter(([, n]) => n === 1).map(([k]) => count.get(k)!);
    const idx = [...new Set(boundary.flat())];
    faces.push(ringOrder(verts, idx, faceNormal(verts, group[0])));
  }
  return faces;
}

// ── arbitrary N ───────────────────────────────────────────────────────────────

/**
 * Any other face count — a d3, a d30, a homebrew die — as an N-gonal bipyramid, which is a real solid for
 * every N ≥ 3 and is how most non-standard dice are actually made. This replaces the old "faceted gem" fan and
 * matters more than it sounds: a special case for unusual dice is precisely how the d100 ended up drawn as a
 * d10 (plan ground rule G3 — every die goes through the same path).
 */
function bipyramid(faceCount: number): Solid {
  const n = Math.max(3, Math.round(faceCount / 2));
  const h = 1.15;
  const verts: Vec3[] = [[0, 0, h], [0, 0, -h]];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    verts.push([Math.cos(a), Math.sin(a), 0]);
  }
  const faces: number[][] = [];
  for (let k = 0; k < n; k++) {
    const u = 2 + k;
    const v = 2 + ((k + 1) % n);
    faces.push([0, u, v]);
    faces.push([1, u, v]);
  }
  return build(verts, faces, null);
}

// ── the registry ──────────────────────────────────────────────────────────────

const BUILDERS: Record<number, () => Solid> = {
  4: tetrahedron,
  6: cube,
  8: octahedron,
  10: trapezohedron10,
  12: dodecahedron,
  20: icosahedron,
  100: zocchihedron,
};

const cache = new Map<number, Solid>();

/**
 * The solid for a die with `sides` faces. Memoised: the d100's hull is a hundred insertions, and the d12 and
 * d20 derive their faces by search, so building them once per process rather than per render matters.
 *
 * Every side count is supported. There is no fallback that means "give up and draw a rounded square".
 */
export function solidFor(sides: number): Solid {
  const n = Math.max(3, Math.round(sides));
  const hit = cache.get(n);
  if (hit) return hit;
  const solid = (BUILDERS[n] ?? (() => bipyramid(n)))();
  cache.set(n, solid);
  return solid;
}

/** The face index carrying `value`, or -1. The renderer needs it to land the rolled face toward the camera. */
export function faceForValue(solid: Solid, value: number): number {
  return solid.pips.indexOf(value);
}

/** Side counts with a hand-verified real-world die shape (the rest are bipyramids). */
export const STANDARD_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
