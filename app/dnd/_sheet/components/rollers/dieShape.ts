// dieShape — the digital die's SHAPE follows the die being rolled (D-4).
//
// The owner: "right now it's just a rounded square that spins for every roll; a d20 should be a 20-sided
// shape." This derives how many sides the shape should have from the active roll, and builds a CSS
// clip-path for a regular N-gon. A d20 check → a 20-gon; 1d8 damage → an octagon; a mixed pool (2d6+1d4)
// is ambiguous, so it returns null and the roller keeps its neutral rounded shape.

/** Standard die faces we can shape. d100 reads as a 10-sided (a d10 percentile). */
const STD_FACES = [4, 6, 8, 10, 12, 20];

/** The die's side-count for the SHAPE, or null when ambiguous. Reads `isD20` first (the common case:
 *  every check/save/attack), then the die notation in the breakdown (`1d8[5] + 3`), then a single-die
 *  min/max fallback. */
export function dieSides(roll: {
  isD20?: boolean;
  min?: number;
  max?: number;
  entry?: { breakdown?: string };
}): number | null {
  if (roll.isD20) return 20;
  // Match the die notation `NdM` (or `dM`) — e.g. `1d8[5]`, `2d6`, `d12`. A leading `\b` would miss `1d8`
  // (no word boundary between the digit and the `d`), so allow an optional count in front of the `d`.
  const m = /\d*d(\d+)/i.exec(roll.entry?.breakdown ?? '');
  if (m) {
    const n = Number(m[1]);
    if (STD_FACES.includes(n)) return n;
    if (n === 100) return 10;
  }
  if (roll.min === 1 && typeof roll.max === 'number' && STD_FACES.includes(roll.max)) return roll.max;
  return null;
}

/** A CSS `clip-path` for a regular N-gon inscribed in the element (vertex at the top), so the die reads
 *  as an N-sided shape. Clamped to 3…20 sides. */
export function ngonClip(sides: number): string {
  const n = Math.max(3, Math.min(20, Math.round(sides)));
  return `polygon(${ngonVerts(n, 50).map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;
}

/** SVG `<polygon points>` for a regular N-gon in a 0…100 viewBox (vertex at top), inset from the edge so
 *  the STROKE (the die's visible edge) is never clipped by the viewBox. Used to draw the die as a real
 *  SVG polygon — a CSS border on a clip-path'd box gets sliced up and doesn't outline the shape, which
 *  is why the earlier clip-path die had no clean edge. */
export function ngonPoints(sides: number, inset = 6): string {
  const n = Math.max(3, Math.min(20, Math.round(sides)));
  return ngonVerts(n, 50 - inset).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

// ─────────────────────────────────────────────── the die as a SOLID, not an outline (D-4 follow-up)
//
// THE SILHOUETTE ALONE READ AS A FLAT BADGE. Matching the polygon's side count to the die was the right
// first move, but a stroked N-gon with a numeral in it looks like a sticker, not a die. What makes a die
// read as a die in a still image is the FACETING: a real d20 photographed face-on shows one triangle
// facing you, three around it, and three more turning away, each catching the light differently. The
// silhouette is the least of it — the shading is what says "solid object".
//
// So each standard die gets its real face-on NET: the polygon you see, divided into the faces you'd
// actually see, each with a shade. `shade` is signed light, not a colour: positive lightens, negative
// darkens, and the renderer paints it as white or black at that alpha OVER the themed body fill. That is
// deliberate — a facet palette in teal would fight every skin it is not, whereas light and shadow
// compose correctly over any body colour, on any of the four systems and every theme.
//
// The light is up and slightly left throughout, which is why the top facets are positive and the bottom
// ones negative. Consistency matters more than realism here: dice that disagree about where the light is
// look like clip art.

export interface DieFacet {
  /** SVG `points` for this visible face. */
  points: string;
  /** Signed light: > 0 lightens the body fill, < 0 darkens it. Roughly −0.36…+0.30. */
  shade: number;
}

export interface DieNet {
  /** The outer polygon — the die's edge, stroked by the renderer. */
  silhouette: string;
  /** The visible faces, painted in order over the body. */
  facets: DieFacet[];
}

const pts = (...v: Array<[number, number]>) => v.map(([x, y]) => `${x},${y}`).join(' ');

/** Hand-authored face-on nets for the dice that have an iconic silhouette. */
const NETS: Record<number, () => DieNet> = {
  // d4 — a tetrahedron read face-on: one triangle, split by the three edges running back to the hidden vertex.
  4: () => ({
    silhouette: pts([50, 8], [89, 76], [11, 76]),
    facets: [
      { points: pts([50, 8], [89, 76], [50, 53]), shade: 0.16 },
      { points: pts([50, 8], [11, 76], [50, 53]), shade: -0.18 },
      { points: pts([11, 76], [89, 76], [50, 53]), shade: -0.34 },
    ],
  }),
  // d6 — the cube, isometric: the one shape everybody already reads as a die. Three rhombi at the centre.
  6: () => ({
    silhouette: pts([50, 6], [88, 28], [88, 72], [50, 94], [12, 72], [12, 28]),
    facets: [
      { points: pts([50, 6], [88, 28], [50, 50], [12, 28]), shade: 0.22 },
      { points: pts([88, 28], [88, 72], [50, 94], [50, 50]), shade: -0.14 },
      { points: pts([12, 28], [50, 50], [50, 94], [12, 72]), shade: -0.32 },
    ],
  }),
  // d8 — an octahedron on its vertex: a diamond quartered into the four faces you can see.
  8: () => ({
    silhouette: pts([50, 5], [93, 50], [50, 95], [7, 50]),
    facets: [
      { points: pts([50, 5], [93, 50], [50, 50]), shade: 0.24 },
      { points: pts([50, 5], [7, 50], [50, 50]), shade: 0.1 },
      { points: pts([93, 50], [50, 95], [50, 50]), shade: -0.16 },
      { points: pts([7, 50], [50, 95], [50, 50]), shade: -0.34 },
    ],
  }),
  // d10 — the pentagonal trapezohedron: two apexes, a kite either side of each, and the barrel edges
  // between. The zigzag equator is the tell that it is a d10 and not a d8.
  10: () => ({
    silhouette: pts([50, 4], [93, 37], [93, 63], [50, 96], [7, 63], [7, 37]),
    facets: [
      { points: pts([50, 4], [93, 37], [50, 50]), shade: 0.26 },
      { points: pts([50, 4], [7, 37], [50, 50]), shade: 0.12 },
      { points: pts([93, 37], [93, 63], [50, 50]), shade: -0.1 },
      { points: pts([7, 37], [7, 63], [50, 50]), shade: -0.2 },
      { points: pts([93, 63], [50, 96], [50, 50]), shade: -0.26 },
      { points: pts([7, 63], [50, 96], [50, 50]), shade: -0.36 },
    ],
  }),
  // d12 — a dodecahedron face-on: decagon silhouette, the face you're looking at dead centre, five more
  // ringing it. Each outer pentagon shares two vertices with the centre face and three with the edge.
  12: () => {
    const d = ring(10, 45, -90);
    const p = ring(5, 22, -90);
    const shades = [0.2, -0.06, -0.3, -0.22, 0.06];
    return {
      silhouette: pts(...d),
      facets: [
        { points: pts(...p), shade: 0.14 },
        ...shades.map((shade, i) => ({
          points: pts(p[i], d[(2 * i) % 10], d[(2 * i + 1) % 10], d[(2 * i + 2) % 10], p[(i + 1) % 5]),
          shade,
        })),
      ],
    };
  },
  // d20 — the icosahedron everyone pictures: hexagonal silhouette, a triangle facing you, three facets
  // turning away at the corners, three quads bridging them.
  20: () => {
    const d = ring(6, 45, 0);
    const t = ring(3, 26, -90);
    return {
      silhouette: pts(...d),
      facets: [
        { points: pts(t[0], t[1], t[2]), shade: 0.2 },
        { points: pts(d[4], d[5], t[0]), shade: 0.3 },
        { points: pts(t[0], d[5], d[0], t[1]), shade: 0.04 },
        { points: pts(t[2], d[3], d[4], t[0]), shade: -0.06 },
        { points: pts(d[0], d[1], t[1]), shade: -0.18 },
        { points: pts(d[3], d[2], t[2]), shade: -0.3 },
        { points: pts(t[1], d[1], d[2], t[2]), shade: -0.36 },
      ],
    };
  },
};

/** Vertices of a regular N-gon, first at `startDeg` (−90 = top), clockwise in SVG's y-down space. */
function ring(n: number, radius: number, startDeg: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (startDeg * Math.PI) / 180 + (i * 2 * Math.PI) / n;
    out.push([r2(50 + radius * Math.cos(a)), r2(50 + radius * Math.sin(a))]);
  }
  return out;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The die as a shaded solid. Any side count works: the five standard dice get their real face-on net,
 *  anything else (a d3, a d30, a homebrew die) gets a faceted gem — a fan of triangles lit from the same
 *  direction, which still reads as a cut solid rather than a flat badge. */
export function dieNet(sides: number): DieNet {
  const n = Math.max(3, Math.min(20, Math.round(sides)));
  const exact = NETS[n];
  if (exact) return exact();
  const v = ring(n, 45, -90);
  return {
    silhouette: pts(...v),
    facets: v.map((vertex, i) => {
      const next = v[(i + 1) % n];
      // Light from up-and-left: a facet's shade follows how far its outward normal turns toward it.
      const mid = Math.atan2((vertex[1] + next[1]) / 2 - 50, (vertex[0] + next[0]) / 2 - 50);
      return { points: pts(vertex, next, [50, 50]), shade: r2(-0.3 * Math.sin(mid - Math.PI / 6)) };
    }),
  };
}

/** The [x,y] vertices of a regular N-gon centred at 50,50 with the given radius, first vertex at top. */
function ngonVerts(n: number, radius: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push([50 + radius * Math.cos(a), 50 + radius * Math.sin(a)]);
  }
  return out;
}
