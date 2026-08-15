// C17 — two snap types that were offered everywhere and produced nowhere.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `SnapType` has seven members. `findSnapPoint` had a branch for five. The two it did not
// implement, CENTER and PERPENDICULAR, are both offered as tick-boxes in *two* places:
//
//   StatusBar.SNAP_TYPE_INFO      "Snap to the center of a circle, arc, or ellipse."
//                                 "Snap to the perpendicular foot from the cursor to a line / arc."
//   SettingsDialog                "Essential for creating right-angle connections."
//
// Ticking either one wrote it into `settings.snapTypes`, the engine looped past it, and the snap
// never fired — for any drawing, at any zoom, forever. Nothing errored. The box stayed ticked. The
// surveyor concludes the snap is unreliable rather than absent, which is worse, because unreliable
// is a thing you keep trying.
//
// A snap the surveyor cannot see is a snap they do not trust — and a snap that does not exist while
// claiming to is the same problem with the volume up.
//
// ── WHY THESE ARE REAL BEHAVIOURAL TESTS ────────────────────────────────────────────────────────
//
// Unlike C14/C16, the engine is a pure function over plain data. There is no canvas to stand up, so
// these run the actual thing and assert on actual returned points.

import { describe, it, expect, beforeAll } from 'vitest';
import { findSnapPoint } from '@/lib/cad/geometry/snap';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature, FeatureGeometry, FeatureType, Point2D } from '@/lib/cad/types';

let n = 0;
const feature = (type: FeatureType, geometry: FeatureGeometry): Feature => ({
  id: `f${++n}`,
  type,
  geometry,
  layerId: 'L',
  style: { ...DEFAULT_FEATURE_STYLE },
  properties: {},
});

const line = (start: Point2D, end: Point2D) => feature('LINE', { type: 'LINE', start, end });

/** A circle of radius 10 centred at (50, 50). Stored the way this codebase stores one: a POLYGON
 *  carrying parametric `circle` data. */
const circle = () =>
  feature('POLYGON', { type: 'POLYGON', circle: { center: { x: 50, y: 50 }, radius: 10 } });

/** Quarter arc, radius 10 at the origin, sweeping CCW from east (0) to north (π/2). */
const quarterArc = () =>
  feature('ARC', {
    type: 'ARC',
    arc: { center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2, anticlockwise: true },
  });

/** Zoom 1, so `snapRadius` is both pixels and world units and the numbers below stay readable. */
const snap = (
  cursor: Point2D,
  features: Feature[],
  types: Parameters<typeof findSnapPoint>[4],
  fromPoint?: Point2D | null,
) => findSnapPoint(cursor, features, 5, 1, types, 10, fromPoint);

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('CENTER', () => {
  it('snaps to the centre of a circle', () => {
    const r = snap({ x: 52, y: 51 }, [circle()], ['CENTER']);
    expect(r, 'the box was tickable and the branch did not exist').not.toBeNull();
    expect(r!.type).toBe('CENTER');
    expect(r!.point).toEqual({ x: 50, y: 50 });
  });

  it('snaps to the centre of an arc, which is not on the arc', () => {
    // The distinguishing case: an arc's centre is empty space. Any implementation that looked for
    // the nearest point ON the geometry would never find it.
    const r = snap({ x: 1, y: 1 }, [quarterArc()], ['CENTER']);
    expect(r?.point).toEqual({ x: 0, y: 0 });
  });

  it('snaps to the centre of an ellipse', () => {
    const e = feature('POLYGON', {
      type: 'POLYGON',
      ellipse: { center: { x: 4, y: 7 }, radiusX: 20, radiusY: 5, rotation: 0 },
    });
    expect(snap({ x: 4, y: 8 }, [e], ['CENTER'])?.point).toEqual({ x: 4, y: 7 });
  });

  it('offers nothing for a polyline', () => {
    // "Centre of a polyline" is a DIFFERENT osnap (AutoCAD's Geometric Center), and both of this
    // product's own descriptions promise circles, arcs and ellipses. Returning a bounding-box
    // middle here would be inventing a snap the UI never advertised.
    const pl = feature('POLYLINE', {
      type: 'POLYLINE',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    });
    expect(snap({ x: 5, y: 5 }, [pl], ['CENTER'])).toBeNull();
  });

  it('stays silent when the type is not enabled', () => {
    expect(snap({ x: 50, y: 50 }, [circle()], ['ENDPOINT'])).toBeNull();
  });
});

describe('PERPENDICULAR', () => {
  const horizontal = () => line({ x: 0, y: 0 }, { x: 100, y: 0 });

  it('drops the foot from the point already placed, not from the cursor', () => {
    // THE definition of this snap. From (30, 40) the foot onto y=0 is (30, 0). The cursor is at
    // (32, 2) — near that foot but not on it, and its own nearest point on the line is (32, 0).
    // Getting (32, 0) here would mean the implementation quietly became NEAREST.
    const r = snap({ x: 32, y: 2 }, [horizontal()], ['PERPENDICULAR'], { x: 30, y: 40 });
    expect(r).not.toBeNull();
    expect(r!.type).toBe('PERPENDICULAR');
    expect(r!.point).toEqual({ x: 30, y: 0 });
  });

  it('yields nothing with no point placed yet', () => {
    // Perpendicular to *what?* On the first click of a line there is no reference, and guessing one
    // from the cursor would produce a snap that silently means something else.
    expect(snap({ x: 30, y: 2 }, [horizontal()], ['PERPENDICULAR'], null)).toBeNull();
    expect(snap({ x: 30, y: 2 }, [horizontal()], ['PERPENDICULAR'])).toBeNull();
  });

  it('does not fire when the cursor is nowhere near the foot', () => {
    // The foot is at (30, 0); the cursor is 60 units away along the line. The foot exists, but the
    // surveyor is not pointing at it, and a snap that engages anyway drags the click across the
    // screen.
    expect(snap({ x: 90, y: 1 }, [horizontal()], ['PERPENDICULAR'], { x: 30, y: 40 })).toBeNull();
  });

  it('clamps to the segment rather than running off its end', () => {
    // From (200, 40) the foot on the INFINITE line y=0 is (200, 0) — well past the segment, which
    // ends at x=100. A point out there sits on a line that does not exist, which is a worse answer
    // than no snap.
    const r = snap({ x: 200, y: 2 }, [horizontal()], ['PERPENDICULAR'], { x: 200, y: 40 });
    expect(r).toBeNull();
  });

  it('meets a circle along its radius', () => {
    // A radius always crosses its circle at a right angle. From (50, 90) — due north of the centre
    // — the feet are the top and bottom of the circle.
    const r = snap({ x: 50, y: 61 }, [circle()], ['PERPENDICULAR'], { x: 50, y: 90 });
    expect(r?.point.x).toBeCloseTo(50, 6);
    expect(r?.point.y).toBeCloseTo(60, 6);
  });

  it('offers the far side of a circle too', () => {
    // Both crossings are genuine perpendicular feet, and the surveyor picks with the cursor.
    const r = snap({ x: 50, y: 39 }, [circle()], ['PERPENDICULAR'], { x: 50, y: 90 });
    expect(r?.point.y).toBeCloseTo(40, 6);
  });

  it('respects an arc’s span — no foot on the part that was never drawn', () => {
    // The quarter arc covers east→north only. From due SOUTH the two crossings are at −90° and
    // +90°; only the +90° one (0, 10) is on the drawn arc. Snapping to (0, −10) would put the
    // point on empty space where the arc merely would have been.
    const r = snap({ x: 1, y: 9 }, [quarterArc()], ['PERPENDICULAR'], { x: 0, y: -50 });
    expect(r).not.toBeNull();
    expect(near(r!.point.x, 0) && near(r!.point.y, 10)).toBe(true);

    const off = snap({ x: 1, y: -9 }, [quarterArc()], ['PERPENDICULAR'], { x: 0, y: -50 });
    expect(off, 'the south crossing is outside the swept span').toBeNull();
  });
});

describe('priority', () => {
  // NEAREST always succeeds if anything is in range, so any type ordered after it can never win.
  // CENTER and PERPENDICULAR both had to land ahead of it or they would have been implemented and
  // still never seen.
  const horizontal = () => line({ x: 0, y: 0 }, { x: 100, y: 0 });

  it('CENTER beats NEAREST', () => {
    const r = snap({ x: 50, y: 50 }, [circle()], ['NEAREST', 'CENTER']);
    expect(r?.type).toBe('CENTER');
  });

  it('PERPENDICULAR beats NEAREST', () => {
    const r = snap({ x: 30, y: 1 }, [horizontal()], ['NEAREST', 'PERPENDICULAR'], { x: 30, y: 40 });
    expect(r?.type).toBe('PERPENDICULAR');
  });

  it('ENDPOINT still beats both', () => {
    // The exact snaps outrank the derived ones; changing that would move every existing drawing's
    // behaviour, which this slice must not do.
    const r = snap({ x: 0, y: 1 }, [horizontal()], ['PERPENDICULAR', 'ENDPOINT'], { x: 0, y: 40 });
    expect(r?.type).toBe('ENDPOINT');
  });

  it('the default snap set is unchanged by this slice', async () => {
    // CENTER and PERPENDICULAR stay opt-in. Turning them on by default would change what every
    // existing drawing snaps to the next time it is opened.
    const { DEFAULT_DRAWING_SETTINGS } = await import('@/lib/cad/constants');
    expect(DEFAULT_DRAWING_SETTINGS.snapTypes).toEqual([
      'ENDPOINT', 'MIDPOINT', 'INTERSECTION', 'NEAREST',
    ]);
  });
});

describe('every snap type can be named at the cursor', () => {
  it('has a label for all seven, matching the status-bar wording', async () => {
    const { SNAP_TYPE_LABELS } = await import('@/lib/cad/constants');
    // A missing entry renders `undefined` beside the glyph — visibly broken, but only for the one
    // snap type nobody tested, which is how the two missing ENGINE branches survived too.
    expect(Object.values(SNAP_TYPE_LABELS)).toEqual([
      'Endpoint', 'Midpoint', 'Intersection', 'Nearest', 'Center', 'Perpendicular', 'Grid',
    ]);
  });

  it('and the status bar uses the same words', async () => {
    // The same snap must not have two names depending on where you read it.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const bar = readFileSync(join(process.cwd(), 'app/admin/cad/components/StatusBar.tsx'), 'utf8');
    const { SNAP_TYPE_LABELS } = await import('@/lib/cad/constants');
    for (const [type, label] of Object.entries(SNAP_TYPE_LABELS)) {
      expect(bar, `${type} is named differently in the status bar`).toMatch(
        new RegExp(`type:\\s*'${type}',\\s*label:\\s*'${label}'`),
      );
    }
  });
});

// The label itself lives inside the 14k-line canvas component wired to a live PIXI stage; standing
// that up in jsdom would test the harness, not the fix (the lesson C14 recorded). What is worth
// pinning cheaply is that the wiring exists and that the two performance traps are avoided.
describe('the viewport draws the label', () => {
  let code = '';
  beforeAll(async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    code = readFileSync(join(process.cwd(), 'app/admin/cad/components/CanvasViewport.tsx'), 'utf8')
      // Comments stripped: this change's own comments quote the identifiers they describe.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
  });

  it('creates ONE Text at init, not one per frame', () => {
    // renderSnapIndicator runs on every mouse move. A Text built there allocates a texture per
    // frame — the exact shape of the GC pause C3 measured and removed.
    expect(code).toMatch(/const snapLabel = new PIXI\.Text\(/);
    const render = code.slice(code.indexOf('function renderSnapIndicator'));
    expect(render.slice(0, 2500), 'the label must be re-used, not rebuilt').not.toMatch(/new PIXI\.Text/);
  });

  it('reads the name from the shared map rather than re-spelling it', () => {
    expect(code).toMatch(/SNAP_TYPE_LABELS\[snap\.type\]/);
  });

  it('hides the label when nothing is snapped', () => {
    // Otherwise the last snap's name stays floating over the drawing after the cursor leaves it —
    // worse than no label, because it names a snap that is no longer engaged.
    const render = code.slice(code.indexOf('function renderSnapIndicator'));
    expect(render.slice(0, 800)).toMatch(/if \(!snap\)[\s\S]{0,160}visible = false/);
  });

  it('does not re-rasterise text or fill that have not changed', () => {
    const render = code.slice(code.indexOf('function renderSnapIndicator'));
    expect(render.slice(0, 2500)).toMatch(/if \(label\.text !== text\)/);
    expect(render.slice(0, 2500)).toMatch(/if \(label\.style\.fill !== color\)/);
  });

  it('passes the last placed point through as the perpendicular reference', () => {
    // Without this the PERPENDICULAR branch, now implemented, would still never fire from the
    // canvas — an engine feature with no caller, the defect shape this doc keeps finding.
    expect(code).toMatch(/drawingPoints[\s\S]{0,400}pending\[pending\.length - 1\] : null/);
  });
});
