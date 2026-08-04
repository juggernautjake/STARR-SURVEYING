// __tests__/cad/typed-point-creates-a-point.test.ts
//
// CAD_AUDIT Slice S7b — a coordinate typed with the Point tool active actually creates a point.
//
// ── THE BUG THIS PINS ───────────────────────────────────────────────────────────────────────────
//
// Every other draw tool builds its feature out of `drawingPoints`, so typing into the command bar
// already worked for lines, polylines and circles. `DRAW_POINT` does not: it creates its feature
// inside the mouse handler, from the click's own `worldPt`. A typed pair therefore landed in
// `drawingPoints` and **nothing ever consumed it**.
//
// The surveyor typed a known northing and easting, pressed Enter, and the drawing did not change.
// **A silent no-op is the worst shape this can take** — the input was accepted and cleared, so there
// is no error to read and nothing to retry. And typing a coordinate is precisely how a control point
// off a data sheet gets entered, which is the case where clicking is not accurate enough to bother.
//
// S7a fixed the *conversion* (display space → world, N-then-E, origin removed) and left the create
// path open; this is that path.
//
// ── WHY THIS IS A WIRING TEST ───────────────────────────────────────────────────────────────────
//
// The placement itself lives in `CanvasViewport.tsx`, a 15k-line component that mounts PixiJS and
// cannot be rendered in this suite. The arithmetic it depends on (`coordinatesFromDisplay`) has its
// own tests. What was missing was neither — it was the **connection**, and a connection is exactly
// what a silent no-op destroys without failing anything.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coordinatesFromDisplay } from '@/lib/cad/geometry/units';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';

const REPO = join(__dirname, '..', '..');
const commandBar = readFileSync(join(REPO, 'app/admin/cad/components/CommandBar.tsx'), 'utf8');
const viewport = readFileSync(join(REPO, 'app/admin/cad/components/CanvasViewport.tsx'), 'utf8');

describe('S7b — typing a coordinate with the Point tool', () => {
  it('reads the files it is asserting about', () => {
    // Both are real files with real content; a failed read would make every assertion below vacuous.
    expect(commandBar.length).toBeGreaterThan(2000);
    expect(viewport.length).toBeGreaterThan(100_000);
  });

  it('the command bar hands a typed coordinate to the canvas instead of dropping it', () => {
    // The specific regression: `addDrawingPoint` for a tool that never reads `drawingPoints`.
    const coordinateBranch = commandBar.slice(
      commandBar.indexOf("if (parsed.type === 'COORDINATE')"),
      commandBar.indexOf("if (parsed.type === 'DISTANCE')"),
    );
    expect(coordinateBranch.length).toBeGreaterThan(200);
    expect(coordinateBranch).toContain("activeTool === 'DRAW_POINT'");
    expect(coordinateBranch).toContain('cad:placeTypedPoint');
  });

  it('the canvas listens for it, and removes the listener on unmount', () => {
    // A listener added and never removed is a leak; this component mounts PixiJS and is remounted by
    // every route change, so the audit that owns this slice also owns that rule.
    expect(viewport).toContain("window.addEventListener('cad:placeTypedPoint'");
    expect(viewport).toContain("window.removeEventListener('cad:placeTypedPoint'");
  });

  it('places through the SAME function the click uses', () => {
    // The point of extracting `placePointAt` was that a clicked point and a typed point are one
    // operation. Two copies would agree today and drift at the first change — a copy that forgot
    // `withAutoLabels` would yield points with no number or description, which reads as a labelling
    // bug rather than a second code path.
    expect(viewport).toContain('function placePointAt(');
    const helper = viewport.slice(
      viewport.indexOf('function placePointAt('),
      viewport.indexOf('function finishFeature('),
    );
    expect(helper).toContain("createFeature('POINT'");
    expect(helper).toContain('withAutoLabels');
    expect(helper).toContain('addFeature');
    expect(helper).toContain('makeAddFeatureEntry'); // undoable, like the clicked one

    // And the click case must still delegate rather than keep its own copy.
    const clickCase = viewport.slice(
      viewport.indexOf("case 'DRAW_POINT': {"),
      viewport.indexOf("case 'DRAW_FREEHAND': {"),
    );
    expect(clickCase).toContain('placePointAt(worldPt)');
    expect(clickCase, 'the click case re-grew its own copy of the placement').not.toContain(
      "createFeature('POINT'",
    );
  });

  it('tells the surveyor the typed path exists', () => {
    // The old hint said "Click to place a point", which accurately described a tool that ignored
    // what you typed. A capability nobody is told about is not much better than one that is absent.
    const hint = commandBar.slice(commandBar.indexOf("case 'DRAW_POINT':"));
    expect(hint.slice(0, 400)).toMatch(/type the coordinates/i);
  });

  it('the coordinate it places is the one that was read off the screen', () => {
    // S7a's conversion, re-asserted here at the boundary this slice added: on a drawing with a real
    // state-plane origin, typing back the displayed pair must reproduce the same world point. If
    // this ever regresses, the typed path silently places points in the wrong place — which is worse
    // than the no-op it replaced, because the drawing then looks finished.
    const prefs = {
      ...DEFAULT_DISPLAY_PREFERENCES,
      coordMode: 'NE' as const,
      originNorthing: 10_267_400,
      originEasting: 3_120_500,
    };
    // Surveyor reads N 10,267,512.34 / E 3,120,588.21 off the status bar and types it back.
    const world = coordinatesFromDisplay(10_267_512.34, 3_120_588.21, prefs);
    expect(world.y).toBeCloseTo(112.34, 6); // northing → world Y, origin removed
    expect(world.x).toBeCloseTo(88.21, 6);  // easting  → world X
  });
});
