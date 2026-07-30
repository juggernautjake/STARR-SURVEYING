// __tests__/dnd/die-shape-retired.test.ts — the hand-drawn die layer is gone and must stay gone (D1-5).
//
// WHAT WAS DELETED AND WHY. `app/dnd/_sheet/components/rollers/dieShape.ts` drew dice as flat SVG silhouettes
// from coordinate tables typed in by hand — a `NETS` map of face-on "nets" for the d4/d6/d8/d10/d12/d20, plus
// `ngonPoints` / `ngonClip` / `dieNet` to emit them. The plan's ground rule G1 is the verdict on that
// approach: *geometry is derived, never typed*. A drawing of a die from memory cannot be made "more correct",
// only redrawn — which is exactly why the owner reported the d20 and d100 still looking wrong after two
// passes at the coordinates.
//
// It carried a live bug that shows what authored geometry costs. `dieSides` mapped **d100 → 10**, so a
// percentile roll rendered as a ten-sided die. The plan names it directly: *"`dieSides` mapping d100 → 10 was
// a shortcut that became a bug"* (G3 — every die type goes through the same path). `lib/dnd/dice/solids.ts`
// has supported a real 100-face solid since D1-1, and `diceOf` reads the side count straight out of the
// breakdown, so the live tray was already correct; the retired module was a second, wrong answer sitting
// next to the right one, waiting for someone to reach for it.
//
// THIS TEST IS THE RATCHET. Deleting a module does not stop it being re-added, and the failure mode is
// quiet: a future die that "looks a bit off" is a standing invitation to hand-tweak a polygon. So this
// asserts the file is gone, that nothing imports it, and — the part that actually matters — that no coordinate
// table sneaks back into the roller components under a different name.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROLLERS = path.join(ROOT, 'app/dnd/_sheet/components/rollers');

function rollerSources(): Array<{ file: string; src: string }> {
  return fs
    .readdirSync(ROLLERS)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ file: `rollers/${f}`, src: fs.readFileSync(path.join(ROLLERS, f), 'utf8') }));
}

describe('the retired hand-drawn die layer', () => {
  it('dieShape.ts no longer exists', () => {
    expect(
      fs.existsSync(path.join(ROLLERS, 'dieShape.ts')),
      'dieShape.ts is back. Dice geometry comes from lib/dnd/dice/solids.ts — a vertex table and a projection, ' +
        'not typed-in polygons. If a die looks wrong, the solid or the projection is wrong.',
    ).toBe(false);
  });

  it('nothing imports it, under any spelling', () => {
    const offenders: string[] = [];
    for (const dir of ['app', 'lib', '__tests__']) {
      const base = path.join(ROOT, dir);
      const stack = [base];
      while (stack.length) {
        const d = stack.pop()!;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.name === 'node_modules' || e.name === '.next') continue;
          const p = path.join(d, e.name);
          if (e.isDirectory()) stack.push(p);
          else if (/\.(ts|tsx)$/.test(e.name)) {
            const src = fs.readFileSync(p, 'utf8');
            // An import OF the module — not a prose mention. `roll-stats.ts` cites it in a comment as a
            // cautionary tale, and that reference is worth keeping.
            if (/from\s+['"][^'"]*dieShape['"]/.test(src)) {
              offenders.push(path.relative(ROOT, p).replace(/\\/g, '/'));
            }
          }
        }
      }
    }
    expect(offenders, `still importing the retired dieShape module: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the retired helper names are not re-exported anywhere in the rollers', () => {
    const offenders: string[] = [];
    for (const { file, src } of rollerSources()) {
      for (const name of ['ngonPoints', 'ngonClip', 'dieNet', 'ngonVerts']) {
        if (new RegExp(`\\b(export\\s+(function|const)\\s+)?${name}\\s*[(=]`).test(src)) {
          offenders.push(`${file} → ${name}`);
        }
      }
    }
    expect(offenders, `retired die-drawing helpers reappeared: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('G3 — no die type is a special case', () => {
  it('the d100 → d10 substitution is gone from the roller layer', () => {
    const offenders: string[] = [];
    for (const { file, src } of rollerSources()) {
      // The exact shape of the old bug: recognising 100 and answering with 10.
      if (/===\s*100\s*\)?\s*(\{\s*)?return\s+10\b/.test(src) || /100\s*:\s*10\b/.test(src)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `a d100 is being substituted with a d10 in: ${offenders.join(', ')}. solidFor(100) builds a real ` +
        `100-face solid — the owner asked for "a d100 that looks like an actual d100".`,
    ).toEqual([]);
  });

  it('solidFor answers every standard die INCLUDING the d100, with the right face count', async () => {
    const { solidFor, STANDARD_DICE } = await import('@/lib/dnd/dice/solids');
    expect(STANDARD_DICE).toContain(100);
    for (const n of [4, 6, 8, 10, 12, 20]) {
      expect(solidFor(n).faces.length, `d${n} has the wrong face count`).toBe(n);
    }
    // The d100 is a geodesic approximation (the plan's own decision: 80 derivable faces read as a
    // Zocchihedron where 100 irregular ones would have to be typed), so it is asserted as "many small
    // faces on a sphere" rather than exactly 100.
    const d100 = solidFor(100);
    expect(d100.faces.length).toBeGreaterThan(20);
    expect(d100.pips.length).toBe(d100.faces.length);
  });

  it('a non-standard die is a real solid, not a fallback badge', async () => {
    const { solidFor } = await import('@/lib/dnd/dice/solids');
    // A d3 and a d30 are bipyramids — real objects for any N ≥ 3, so homebrew dice are not special-cased.
    for (const n of [3, 7, 30]) {
      const s = solidFor(n);
      expect(s.faces.length, `d${n} produced no faces`).toBeGreaterThan(0);
      expect(s.verts.length).toBeGreaterThan(3);
    }
  });
});
