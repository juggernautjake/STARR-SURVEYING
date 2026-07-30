// __tests__/dnd/map-3d-reachability.test.ts — how much 3D a player can still reach (G2 ratchet).
//
// G2 of the map plan: *"2D HTML only, for now. No 3D, no hybrid, on any display surface. The existing 3D map
// work is retained but not reachable"* — the owner's *"for now just use the 2d version with html to represent
// all of the worlds and stuff. We will work on the 3d and hybrid version later."*
//
// THE GUARD THE PLAN SPECIFIED WOULD NOT HAVE WORKED. M2-1 says "a guard test asserts no `/dnd` route imports
// them". Nothing imports them and nothing ever did: the map subsystem is 7,362 lines of vanilla JS under
// `public/dnd/maps/`, reached through an `<iframe src>` from a 16-line React shell, and the 3D mode is a tab
// *inside* `map-studio.html`. An import-based assertion passes today, unchanged, while a DM clicks a 3D tab
// and `/planet-forge` renders a three.js planet baker. That is the precise shape of a guard that reports
// green forever while the thing it guards against sits on screen.
//
// SO THIS IS A RATCHET, NOT AN ASSERTION OF THE END STATE. 3D IS reachable right now — writing
// `expect(reachable).toEqual([])` today would just be a failing test, and a failing test that everyone knows
// is "expected to fail" is worse than none. Instead the current reachability points are enumerated below.
// Nothing may be ADDED. As G2 is implemented each entry is deleted, and when the list is empty the last test
// here starts enforcing the end state on its own.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAPS_DIR = path.join(ROOT, 'public/dnd/maps');

/**
 * Every way a player or DM can currently reach 3D map rendering. Each entry is a thing to remove, not a thing
 * to keep. DELETE an entry when the surface is genuinely 2D-only; never add one.
 */
const KNOWN_3D_SURFACES = [
  // A `>3D<` tab inside the studio, alongside `>2D<`. 148 references to the 3D machinery in this one file.
  'public/dnd/maps/map-studio.html',
  // The planet baker. Arguably already 2D-in-effect — its OUTPUT is a baked sprite sheet imported as a
  // `.planet3d` file — but it renders a live three.js planet to do it, so the owner sees 3D. Needs a call.
  'public/dnd/maps/planet-3d.html',
  // THE PLAYER CONSOLE, and the one that matters most. Found by this ratchet, not by the manual audit that
  // preceded it: `console.html` loads `vendor/three/three.module.js` and calls into `map3d.js` at three
  // sites. G2 is about what a PLAYER sees, and this is the player's map. First to fix.
  'public/dnd/maps/console.html',
  // Dead scratch: a 24-line FBX loader test with ZERO references anywhere in the repo. It is publicly
  // served at /dnd/maps/_fbxtest.html and pulls three.js from a jsdelivr CDN at runtime — the only
  // external script dependency in the map tree. Should simply be deleted; listed here so it is not
  // forgotten a third time.
  'public/dnd/maps/_fbxtest.html',
] as const;

/** React routes that embed a static map tool by iframe. The real coupling, and what a guard must read. */
function routeIframeSources(): Array<{ route: string; src: string }> {
  const out: Array<{ route: string; src: string }> = [];
  const base = path.join(ROOT, 'app/dnd');
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === 'page.tsx') {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/\/dnd\/maps\/([A-Za-z0-9_-]+\.html)/g)) {
          const route = path.relative(ROOT, p).replace(/\\/g, '/');
          if (!out.some((x) => x.route === route && x.src === m[1])) out.push({ route, src: m[1] });
        }
      }
    }
  }
  return out;
}

describe('the map subsystem is where the audit said it was', () => {
  it('is vanilla HTML under public/, not React — so an import-based guard is the wrong instrument', () => {
    expect(fs.existsSync(MAPS_DIR)).toBe(true);
    const html = fs.readdirSync(MAPS_DIR).filter((f) => f.endsWith('.html'));
    expect(html).toContain('map-studio.html');
    expect(html).toContain('console.html');
  });

  it('is reached by iframe from the React routes', () => {
    const srcs = routeIframeSources();
    expect(srcs.length, 'no route embeds a map tool — did the map routes move?').toBeGreaterThan(0);
    expect(srcs.map((s) => s.src)).toContain('map-studio.html');
  });

  it('nothing imports the 3D engines as modules — true, and exactly why that guard is worthless here', () => {
    // Kept as a live demonstration rather than a comment: this passes, and it would still pass with a 3D tab
    // on screen. It is the control case for why the ratchet below exists.
    const offenders: string[] = [];
    const stack = [path.join(ROOT, 'app/dnd')];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (/\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(p, 'utf8');
          if (/from\s+['"][^'"]*(map3d|planet3d-model|sky2d)['"]/.test(src)) offenders.push(p);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('G2 RATCHET — 3D reachability may only shrink', () => {
  it('every listed 3D surface still exists (delete stale entries)', () => {
    const missing = KNOWN_3D_SURFACES.filter((f) => !fs.existsSync(path.join(ROOT, f)));
    expect(
      missing,
      `listed as a 3D surface but the file is gone — remove it from KNOWN_3D_SURFACES: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('NO NEW 3D SURFACE may appear under public/dnd/maps', () => {
    const suspects = fs
      .readdirSync(MAPS_DIR)
      .filter((f) => f.endsWith('.html'))
      .filter((f) => {
        const src = fs.readFileSync(path.join(MAPS_DIR, f), 'utf8');
        // A file is a 3D surface if it loads three.js or the 3D engine modules — not merely if it says "3D".
        return /vendor\/three|three\.module|map3d\.js|planet3d-model\.js/.test(src);
      })
      .map((f) => `public/dnd/maps/${f}`)
      .filter((f) => !(KNOWN_3D_SURFACES as readonly string[]).includes(f));

    expect(
      suspects,
      `New 3D map surface(s): ${suspects.join(', ')}. G2 holds 2D-only until the owner lifts it — the 3D ` +
        `work is retained but must not be reachable. If this is deliberate, the owner decision goes in the ` +
        `plan first.`,
    ).toEqual([]);
  });

  it('the ratchet only counts down', () => {
    expect(
      KNOWN_3D_SURFACES.length,
      'KNOWN_3D_SURFACES is a list of things to remove, not a place to register new ones.',
    ).toBeLessThanOrEqual(4);
  });

  it('when the list empties, G2 is enforced for real', () => {
    // This is the end state, live from the moment the last entry is deleted — no follow-up test to remember.
    if (KNOWN_3D_SURFACES.length > 0) {
      expect(KNOWN_3D_SURFACES.length).toBeGreaterThan(0); // still migrating; nothing to enforce yet
      return;
    }
    const stillThreeD = fs
      .readdirSync(MAPS_DIR)
      .filter((f) => f.endsWith('.html'))
      .filter((f) => /vendor\/three|three\.module/.test(fs.readFileSync(path.join(MAPS_DIR, f), 'utf8')));
    expect(stillThreeD, 'G2 is complete but a map surface still loads three.js').toEqual([]);
  });
});
