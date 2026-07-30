// __tests__/dnd/dice-projection.test.ts — the die is drawn correctly, and lands on the number it rolled.
//
// THE ONE ASSERTION THAT MATTERS MOST is "a thrown die ends up showing the value it rolled". The store owns the
// answer and the renderer only displays it (plan ground rule G2), so the failure mode is not a wrong total — it
// is a die that says 7 while the headline says 12, which destroys trust in every number on the sheet.
//
// Everything else here guards the things that make a projection look like a solid rather than a shape: back faces
// culled, faces painted far-to-near, numerals inside their own face, shading that follows the light.
import { describe, it, expect } from 'vitest';
import { solidFor, faceForValue, STANDARD_DICE, type Vec3 } from '@/lib/dnd/dice/solids';
import {
  projectSolid,
  orientationFor,
  quatFromAxisAngle,
  quatRotate,
  quatSlerp,
  quatBetween,
  settleTilt,
  QUAT_IDENTITY,
  type Quat,
} from '@/lib/dnd/dice/project';
import { planThrow, throwSeed } from '@/lib/dnd/dice/throw';

const parse = (points: string) => points.split(' ').map((p) => p.split(',').map(Number) as [number, number]);

/** Is a point inside a polygon? Used to check numerals sit on their own face. */
function inside(poly: [number, number][], [x, y]: [number, number]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('a settled die shows the face it landed on', () => {
  for (const sides of STANDARD_DICE) {
    it(`d${sides}: every value lands facing the camera`, () => {
      const solid = solidFor(sides);
      for (let value = 1; value <= sides; value++) {
        const face = faceForValue(solid, value);
        const q = orientationFor(solid, face);
        // DEAD-ON, by owner decision (2026-07-30): "the side that shows the final number is always directly
        // facing the viewer when the roller is over, for all dice". This assertion previously allowed up to
        // `settleTilt` degrees off-axis so neighbouring faces stayed visible; that tilt is now 0, and the
        // tolerance here is numerical rather than aesthetic.
        const n = quatRotate(q, solid.normals[face]);
        expect(n[2], `d${sides} value ${value} is not square-on to the viewer`).toBeGreaterThan(Math.cos(1e-4));
        // And it must be visible and square-on — the face a player reads.
        //
        // NOT "strictly the most camera-facing face", which is how this was written first and which fails on the
        // d100 for a reason about the die rather than about the code: a hundred facets on a ball include some
        // very thin hull triangles whose normals sit within a fraction of a degree of a neighbour's, so
        // "frontmost" is a coin toss between two faces occupying the same spot. The renderer draws the result on
        // the LANDING face explicitly rather than on whichever face wins that toss, so what must hold is that no
        // other face is meaningfully more front-on than the landing face.
        const { faces } = projectSolid(solid, q);
        const landing = faces.find((f) => f.index === face);
        expect(landing, `d${sides} value ${value} was culled from its own landing pose`).toBeDefined();
        const maxFacing = faces.reduce((a, f) => Math.max(a, f.facing), 0);
        expect(maxFacing - landing!.facing, `d${sides} value ${value} is not the face being read`).toBeLessThan(1e-3);
        expect(landing!.pip).toBe(value);
      }
    });
  }
});

describe('a settled die rests square-on (owner, 2026-07-30)', () => {
  // THIS SUITE USED TO ASSERT THE OPPOSITE, and the reversal is a decision rather than a fix.
  //
  // The tilt existed because a die settled exactly square-on can look flat: every neighbour of a cube's front
  // face is precisely edge-on from that angle, so the cull removes all five and a d6 draws one polygon with a
  // number in it. That is a real cost and it is why the tilt was there.
  //
  // The owner asked for the number to face the viewer directly on every die, and the plan's own G6 already
  // settles the conflict: *legibility beats realism, at every conflict*. At the one moment a player reads the
  // result, an unambiguous number wins over a photographic pose.
  it('every die presents its landing face dead-on', () => {
    for (const sides of STANDARD_DICE) {
      const solid = solidFor(sides);
      for (let face = 0; face < solid.faces.length; face++) {
        const n = quatRotate(orientationFor(solid, face), solid.normals[face]);
        const off = (Math.acos(Math.min(1, Math.max(-1, n[2]))) * 180) / Math.PI;
        expect(off, `d${sides} face ${face} rests ${off.toFixed(3)}° off dead-on`).toBeLessThan(0.01);
      }
    }
  });

  it('and the tilt is zero for every die, not merely small for some', () => {
    // A per-die tilt table that happened to contain small numbers would satisfy the assertion above on the
    // dice with many faces while leaving the d4 visibly cocked. The answer is the same for all of them.
    for (const sides of STANDARD_DICE) expect(settleTilt(solidFor(sides).faces.length)).toBe(0);
  });

  it('a die with many faces still draws more than one, because its neighbours are not edge-on', () => {
    // What survives of the old guarantee. On a d20 or a d100 the adjacent facets sit well off the front
    // normal, so square-on still reads as a solid; only the low-face dice go flat, which is the trade the
    // owner accepted.
    for (const sides of [20, 100]) {
      const faces = projectSolid(solidFor(sides), orientationFor(solidFor(sides), 0)).faces;
      expect(faces.length, `a settled d${sides} draws only ${faces.length} face(s)`).toBeGreaterThan(1);
    }
  });
});

describe('a thrown die arrives at its rolled value', () => {
  for (const sides of STANDARD_DICE) {
    it(`d${sides}: the end of the throw is the landing pose, exactly`, () => {
      const solid = solidFor(sides);
      for (const value of [1, Math.ceil(sides / 2), sides]) {
        const face = faceForValue(solid, value);
        const plan = planThrow(throwSeed(1234, 0), solid, face);
        // t = 1 must BE the settled pose — not near it. With animation off this is the only frame drawn.
        expect(plan.at(1)).toEqual(plan.settled);
        const { faces } = projectSolid(solid, plan.at(1));
        const landing = faces.find((f) => f.index === face);
        expect(landing, `d${sides} threw ${value} and culled the face showing it`).toBeDefined();
        const maxFacing = faces.reduce((a, f) => Math.max(a, f.facing), 0);
        expect(maxFacing - landing!.facing, `d${sides} threw ${value} but another face is more front-on`).toBeLessThan(1e-3);
        expect(landing!.pip).toBe(value);
      }
    });
  }

  it('and it genuinely tumbles on the way — several full turns, not a rock', () => {
    const solid = solidFor(20);
    const plan = planThrow(throwSeed(7, 0), solid, 0);
    // Sample the visible-face set over the throw. A die that is really turning over shows many different faces;
    // one that rocks in place shows a handful. This is the difference between "rolling" and "wobbling".
    const seen = new Set<number>();
    for (let i = 0; i <= 40; i++) {
      const front = projectSolid(solid, plan.at(i / 40)).faces.reduce((a, f) => (f.facing > a.facing ? f : a));
      seen.add(front.index);
    }
    expect(seen.size, `only ${seen.size} faces ever came to the front`).toBeGreaterThan(6);
  });

  it('and it slows down, rather than spinning at a constant rate', () => {
    // The part your eye actually reads as "thrown". Rotation covered early should far exceed rotation covered
    // late.
    //
    // MEASURED AS PATH LENGTH, not as the angle between the endpoints — which is how this was written first and
    // why it failed. `2·acos|q₁·q₂|` saturates at π, and the die turns several full revolutions in the first
    // quarter, so comparing endpoint angles compares two numbers that have both wrapped and means nothing. Summing
    // small steps measures how far it actually travelled.
    const solid = solidFor(6);
    const plan = planThrow(throwSeed(99, 0), solid, 3);
    const step = (a: Quat, b: Quat) => {
      const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
      return 2 * Math.acos(Math.min(1, d));
    };
    const travelled = (from: number, to: number) => {
      let total = 0;
      const N = 400;
      for (let i = 0; i < N; i++) {
        total += step(plan.at(from + ((to - from) * i) / N), plan.at(from + ((to - from) * (i + 1)) / N));
      }
      return total;
    };
    expect(travelled(0, 0.25)).toBeGreaterThan(travelled(0.75, 1) * 3);
  });

  it('and the same roll always tumbles the same way', () => {
    // The roller ADOPTS a roll already on screen rather than replaying it (RO-7). A trajectory that re-randomised
    // per mount would make switching roller template look like a fresh roll — the exact bug RO-7 fixed.
    const solid = solidFor(20);
    const a = planThrow(throwSeed(42, 0), solid, 5);
    const b = planThrow(throwSeed(42, 0), solid, 5);
    for (const t of [0, 0.3, 0.7, 1]) expect(a.at(t)).toEqual(b.at(t));
  });

  it('but two dice in one handful tumble differently', () => {
    const solid = solidFor(6);
    const a = planThrow(throwSeed(42, 0), solid, 0);
    const b = planThrow(throwSeed(42, 1), solid, 0);
    expect(a.at(0.4)).not.toEqual(b.at(0.4));
  });
});

describe('back faces are culled', () => {
  for (const sides of STANDARD_DICE) {
    it(`d${sides} draws at most half its faces`, () => {
      // A convex solid never shows more than half its faces at once. Drawing more means the cull is broken and
      // the die is inside-out somewhere.
      const solid = solidFor(sides);
      for (const t of [0, 0.3, 0.66]) {
        const q = quatFromAxisAngle([0.4, 1, 0.2], t * Math.PI * 2);
        const { faces } = projectSolid(solid, q);
        expect(faces.length).toBeLessThanOrEqual(Math.ceil(sides / 2) + 1);
        expect(faces.length).toBeGreaterThan(0);
        for (const f of faces) expect(f.facing).toBeGreaterThan(0);
      }
    });
  }
});

describe('faces paint far-to-near, so nothing needs a z-buffer', () => {
  it('depth is non-decreasing through the list', () => {
    const solid = solidFor(12);
    const { faces } = projectSolid(solid, quatFromAxisAngle([1, 0.6, 0.3], 1.1));
    for (let i = 1; i < faces.length; i++) expect(faces[i].depth).toBeGreaterThanOrEqual(faces[i - 1].depth);
  });
});

describe('numerals sit on their own face', () => {
  // A numeral anchored outside its polygon is how digits end up floating off the edge of a die.
  for (const sides of [6, 10, 12, 20, 100]) {
    it(`d${sides}`, () => {
      const solid = solidFor(sides);
      const { faces } = projectSolid(solid, quatFromAxisAngle([0.3, 1, 0.15], 0.8));
      for (const f of faces) {
        // Only faces turned reasonably toward the viewer carry a legible numeral; near-edge-on ones are
        // slivers where "inside" is not a meaningful test.
        if (f.facing < 0.35) continue;
        expect(inside(parse(f.points), [f.cx, f.cy]), `d${sides} face ${f.index} anchors its numeral outside itself`).toBe(true);
      }
    });
  }
});

describe('the projection stays inside its viewBox', () => {
  it('nothing is drawn outside 0…100 at any orientation', () => {
    // The stroke lives inside the box too, which is why the radius is 44 rather than 50.
    for (const sides of STANDARD_DICE) {
      const solid = solidFor(sides);
      for (let i = 0; i < 12; i++) {
        const q = quatFromAxisAngle([Math.sin(i), Math.cos(i * 1.7), Math.cos(i)], i);
        const p = projectSolid(solid, q);
        for (const [x, y] of parse(p.silhouette)) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(100);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

describe('shading follows the light', () => {
  it('the face pointing at the light is the brightest one', () => {
    const solid = solidFor(20);
    const light: Vec3 = [0, 0, 1]; // straight at the camera
    const { faces } = projectSolid(solid, QUAT_IDENTITY, { light });
    const brightest = faces.reduce((a, f) => (f.shade > a.shade ? f : a));
    // With the light on the view axis, the most camera-facing face must also be the most lit.
    const frontmost = faces.reduce((a, f) => (f.facing > a.facing ? f : a));
    expect(brightest.index).toBe(frontmost.index);
  });

  it('and shading spans light AND dark, so the solid has form', () => {
    // A die whose faces are all the same shade is the flat badge this replaced.
    const { faces } = projectSolid(solidFor(12), quatFromAxisAngle([1, 0.4, 0], 0.7));
    const shades = faces.map((f) => f.shade);
    expect(Math.max(...shades)).toBeGreaterThan(0.04);
    expect(Math.min(...shades)).toBeLessThan(-0.04);
  });

  it('and contrast: 0 gives a flat die, so the effect is attributable', () => {
    const { faces } = projectSolid(solidFor(8), QUAT_IDENTITY, { contrast: 0 });
    for (const f of faces) expect(Math.abs(f.shade)).toBeLessThan(1e-9);
  });
});

describe('numerals scale with their face, which is where the d100 gets tiny digits', () => {
  it("a d100's facets are far smaller than a d6's", () => {
    // The owner asked for "really little digit font" on the d100. It falls out of the geometry: the renderer
    // sizes each numeral to its face's projected area, and a hundred facets are individually small.
    const big = projectSolid(solidFor(6), QUAT_IDENTITY).faces.reduce((a, f) => Math.max(a, f.area), 0);
    const small = projectSolid(solidFor(100), QUAT_IDENTITY).faces.reduce((a, f) => Math.max(a, f.area), 0);
    expect(small).toBeLessThan(big / 4);
  });
});

describe('quaternion helpers behave', () => {
  it('quatBetween rotates one direction onto another', () => {
    const q = quatBetween([1, 0, 0], [0, 0, 1]);
    const v = quatRotate(q, [1, 0, 0]);
    expect(v[2]).toBeCloseTo(1, 6);
  });

  it('and handles the exactly-opposed case rather than dividing by zero', () => {
    // The degenerate input: any perpendicular axis is a valid half turn, but it has to be a real perpendicular.
    const q = quatBetween([0, 0, 1], [0, 0, -1]);
    const v = quatRotate(q, [0, 0, 1]);
    expect(v[2]).toBeCloseTo(-1, 6);
  });

  it('slerp takes the short way round', () => {
    // Without the sign flip a settle can spin most of the way about instead of easing in — visible as the die
    // lurching just before it stops.
    const a: Quat = [0, 0, 0, 1];
    const b: Quat = [0, 0, 0, -1]; // same orientation, opposite sign
    const mid = quatSlerp(a, b, 0.5);
    expect(Math.abs(mid[3])).toBeCloseTo(1, 6);
  });
});
