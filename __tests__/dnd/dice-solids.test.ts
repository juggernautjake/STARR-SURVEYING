// __tests__/dnd/dice-solids.test.ts — the dice are real solids, asserted as such.
//
// THE POINT OF THESE TESTS. The old die shapes were coordinates typed from memory, and the owner's complaint
// ("the d100 and d20 don't look like they should") had no test that could fail — a drawing is not right or
// wrong, only more or less convincing. Real polyhedra, by contrast, have PROPERTIES: they are closed, their
// faces are planar, every normal points outward, and a real die's opposite faces sum to a known number.
//
// So none of these assertions can be satisfied by a table that merely looks plausible, which is exactly why
// they are the right guard. If a future change bends a face or winds one inside-out, that shows up here rather
// than as a die with a dent in it that nobody notices for a month.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { solidFor, faceForValue, STANDARD_DICE, dot, norm, type Solid, type Vec3 } from '@/lib/dnd/dice/solids';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Every die we claim to model, plus a couple of non-standard ones that must still work. */
const ALL = [...STANDARD_DICE, 3, 30] as const;

const EXPECTED_FACES: Record<number, number> = { 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 20: 20, 100: 100 };
// The dice that follow the opposite-faces-sum convention. THE d100 IS NOT ONE OF THEM, and that is a fact about
// the die rather than a gap: a Zocchihedron is not a regular solid, its facets are unequal, and its numbering is
// spread around the ball instead of paired. My first version of this table asserted 101 for it, which is the
// kind of expectation that looks rigorous and is simply about the wrong object.
const OPPOSITE_SUM: Record<number, number> = { 6: 7, 8: 9, 10: 11, 12: 13, 20: 21 };

describe('each die has the face count it is named for', () => {
  for (const sides of STANDARD_DICE) {
    it(`d${sides}`, () => {
      expect(solidFor(sides).faces).toHaveLength(EXPECTED_FACES[sides]);
    });
  }

  it('and a d100 is a hundred-sided ball, not a d10 wearing its name', () => {
    // The specific defect: `dieSides` mapped d100 → 10 and it rendered as a d10.
    const d100 = solidFor(100);
    expect(d100.faces).toHaveLength(100);
    expect(d100.faces.length).not.toBe(solidFor(10).faces.length);
    // Near-spherical: every vertex about the same distance from the centre.
    const radii = d100.verts.map((v) => Math.hypot(...v));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan
      (0.02);
  });
});

describe('every solid is closed', () => {
  // A closed surface has each edge shared by exactly two faces. This catches a missing face, a duplicated one,
  // and a stitching error in the d100's hull — none of which is obvious by eye on a spinning ball.
  for (const sides of ALL) {
    it(`d${sides}`, () => {
      const { faces } = solidFor(sides);
      const seen = new Map<string, number>();
      for (const f of faces)
        for (let i = 0; i < f.length; i++) {
          const a = f[i];
          const b = f[(i + 1) % f.length];
          const k = a < b ? `${a}:${b}` : `${b}:${a}`;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
      const bad = [...seen.entries()].filter(([, n]) => n !== 2);
      expect(bad, `edges not shared by exactly two faces: ${bad.slice(0, 5).map(([k, n]) => `${k}×${n}`)}`).toEqual([]);
    });
  }
});

describe('every face is planar', () => {
  // Only matters for faces with more than three vertices — the d10's kites, the d12's pentagons, the d100's
  // Voronoi cells. A bent face reads as a dent once each face is shaded separately, and the d10's apex height
  // is SOLVED numerically precisely so this holds.
  for (const sides of ALL) {
    it(`d${sides}`, () => {
      const { verts, faces, normals } = solidFor(sides);
      let worst = 0;
      faces.forEach((f, fi) => {
        const origin = verts[f[0]];
        for (const vi of f) worst = Math.max(worst, Math.abs(dot(normals[fi], sub(verts[vi], origin))));
      });
      expect(worst, `worst out-of-plane deviation ${worst}`).toBeLessThan(1e-6);
    });
  }
});

describe('every normal points outward', () => {
  // Winding decides which faces the renderer culls. One inside-out face is a hole in the die.
  for (const sides of ALL) {
    it(`d${sides}`, () => {
      const { verts, faces, normals } = solidFor(sides);
      faces.forEach((f, fi) => {
        const centroid = f.reduce<Vec3>((a, i) => [a[0] + verts[i][0] / f.length, a[1] + verts[i][1] / f.length, a[2] + verts[i][2] / f.length], [0, 0, 0]);
        expect(dot(normals[fi], norm(centroid)), `face ${fi} of d${sides} is wound inward`).toBeGreaterThan(0);
      });
    });
  }
});

describe('numerals match what a real die is printed with', () => {
  for (const sides of STANDARD_DICE) {
    it(`d${sides} carries 1…${sides} exactly once`, () => {
      const { pips } = solidFor(sides);
      expect([...pips].sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1));
    });
  }

  for (const sides of [6, 8, 10, 12, 20]) {
    it(`d${sides} has opposite faces summing to ${OPPOSITE_SUM[sides]}`, () => {
      // The convention every real die of these shapes uses. Derived here by antipodal pairing rather than
      // typed, so it holds for the d100's hundred faces as readily as the d6's six.
      const s = solidFor(sides);
      let pairs = 0;
      s.normals.forEach((n, i) => {
        const j = s.normals.findIndex((m) => dot(n, [-m[0], -m[1], -m[2]] as Vec3) > 0.999);
        if (j >= 0) {
          expect(s.pips[i] + s.pips[j]).toBe(OPPOSITE_SUM[sides]);
          pairs++;
        }
      });
      expect(pairs, `d${sides} should have antipodal faces to pair`).toBe(sides);
    });
  }

  it('the d100 spreads its numbers instead, as the real die does', () => {
    // Neighbouring facets should carry very different values — sequential numbering round a ball is the one
    // thing a Zocchihedron visibly does not do.
    const { pips } = solidFor(100);
    expect([...pips].sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    const consecutive = pips.filter((p, i) => i > 0 && Math.abs(p - pips[i - 1]) === 1).length;
    expect(consecutive).toBeLessThan(10);
  });

  it('a d4 numbers 1–4 without pairing, because its faces are opposite VERTICES', () => {
    // The one solid where the convention does not apply, and a good check that the pairing code recognises
    // when there is nothing to pair rather than inventing partners.
    expect([...solidFor(4).pips].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('any side count works — no die is a special case', () => {
  // Ground rule G3. A fallback that means "give up and draw a rounded square" is how the d100 became a d10.
  for (const sides of [3, 5, 7, 16, 30]) {
    it(`d${sides} is still a real solid`, () => {
      const s = solidFor(sides);
      expect(s.faces.length).toBeGreaterThan(3);
      expect(s.verts.length).toBeGreaterThan(3);
    });
  }
});

describe('the renderer can find the face it has to land', () => {
  it('every value maps to exactly one face', () => {
    for (const sides of STANDARD_DICE) {
      const s = solidFor(sides);
      for (let v = 1; v <= sides; v++) {
        const f = faceForValue(s, v);
        expect(f, `d${sides} has no face for ${v}`).toBeGreaterThanOrEqual(0);
        expect(s.pips[f]).toBe(v);
      }
    }
  });

  it('and an impossible value reports that, rather than guessing', () => {
    expect(faceForValue(solidFor(6), 7)).toBe(-1);
  });
});

describe('solids are memoised', () => {
  it('the same die returns the same object', () => {
    // The d100 builds a convex hull and the d12/d20 find their faces by search; per-frame rebuilding would be
    // the kind of cost that only shows up on a phone.
    expect(solidFor(100)).toBe(solidFor(100));
    expect(solidFor(20)).toBe(solidFor(20));
  });
});

describe('every face is a real face of the solid (ground rule G1)', () => {
  // THE STRONGEST GUARD IN THIS FILE, and it took two attempts to find. My first version grepped the source for
  // typed-out coordinate literals, on the theory that "derived, not typed" is a property of the code. It could
  // not tell a legitimate VERTEX table (which defines the solid) from a face table (which must be derived), and
  // flagged the tetrahedron's four corners.
  //
  // The property is geometric, not textual. A face of a convex solid is a SUPPORTING PLANE: every vertex lies on
  // it or behind it, never in front. That is the definition of a hull face, so this assertion passes only if the
  // faces genuinely belong to the solid its vertices describe — which is exactly what "the d20 doesn't look
  // right" was, expressed as something a test can check. A hand-typed table with one wrong index fails here.
  for (const sides of ALL) {
    it(`d${sides}`, () => {
      const { verts, faces, normals } = solidFor(sides);
      faces.forEach((f, fi) => {
        const plane = dot(normals[fi], verts[f[0]]);
        for (const v of verts) {
          const ahead = dot(normals[fi], v) - plane;
          expect(ahead, `d${sides} face ${fi} has a vertex in front of it — not a face of this solid`).toBeLessThan(1e-6);
        }
      });
    });
  }

  it('and the d10 SOLVES its apex height rather than choosing one', () => {
    // The one parametric solid: its kites are planar at exactly one apex height per equator offset, so an
    // eyeballed height gives subtly bent faces — invisible until each face is lit separately, at which point it
    // reads as a dent in the die.
    //
    // Asserted GEOMETRICALLY, at a tolerance no chosen-by-hand value would clear. My first version of this
    // checked the source for the word "bisection", which is a test of my prose rather than of the die.
    const { verts, faces, normals } = solidFor(10);
    let worst = 0;
    faces.forEach((f, fi) => {
      expect(f).toHaveLength(4); // kites, not triangles — a triangle is planar for free
      for (const vi of f) worst = Math.max(worst, Math.abs(dot(normals[fi], sub(verts[vi], verts[f[0]]))));
    });
    expect(worst, `d10 kites are ${worst} out of plane — the apex height was not solved`).toBeLessThan(1e-9);
  });
});

describe('the solids are usable as data', () => {
  it('face indices are all in range', () => {
    for (const sides of ALL) {
      const s: Solid = solidFor(sides);
      for (const f of s.faces) for (const i of f) expect(i).toBeLessThan(s.verts.length);
    }
  });
});

describe('every die is as tall as it is wide (owner, 2026-07-30)', () => {
  // *"The d10 dice model looks skinny and funny."* It was: measured against every other solid, all of which
  // come out at exactly 1.000, the d10's pole-to-pole height was **2.652×** its equator diameter — a spindle.
  //
  // THE CAUSE IS THE INTERESTING PART. `trapezohedron10` took the equator offset as its free parameter,
  // chosen by taste, and SOLVED the apex height from it — so the proportions were whatever fell out, and what
  // fell out was an apex 2.65× the equator radius. `build()` then normalises every solid to unit
  // circumradius, which for the d10 means dividing by the apex distance: the poles stay at ±1 and the equator
  // shrinks to 0.38. On every other die the circumradius IS the half-width, so normalising is invisible.
  //
  // The fix inverts the free parameter — the aspect is stated and the offset solved to produce it — which is
  // this module's own rule ("the geometry is derived, not typed") applied to the one place it was not.
  for (const sides of STANDARD_DICE) {
    it(`d${sides} is not a spindle`, () => {
      const s = solidFor(sides);
      const span = (i: 0 | 1 | 2) => {
        const vs = s.verts.map((v) => v[i]);
        return Math.max(...vs) - Math.min(...vs);
      };
      const width = Math.max(span(0), span(1));
      const height = span(2);
      // The d100 is a geodesic ball whose hull is very slightly oblate; everything else lands on 1.000.
      expect(height / width, `d${sides} is ${(height / width).toFixed(3)}× as tall as it is wide`).toBeGreaterThan(0.9);
      expect(height / width).toBeLessThan(1.15);
    });
  }

  it('and the d10 is still a genuine trapezohedron, not a bipyramid that fits the numbers', () => {
    // The cheap way to make the aspect right would be to flatten the equator offset to nothing, which turns
    // the kites into triangles and the die into a bipyramid — proportioned correctly and no longer a d10.
    // The zigzag equator is the visual tell, so assert it survives.
    const s = solidFor(10);
    const zs = s.verts.filter((v) => Math.hypot(v[0], v[1]) > 0.1).map((v) => v[2]);
    const zigzag = Math.max(...zs) - Math.min(...zs);
    expect(zigzag, 'the d10 equator is flat — it is a bipyramid, not a trapezohedron').toBeGreaterThan(0.05);
    expect(s.faces.every((f) => f.length === 4), 'a d10 face is not a kite').toBe(true);
  });
});
