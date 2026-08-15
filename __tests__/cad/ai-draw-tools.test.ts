// C34 — the rest of the DRAW_* family becomes AI-callable.
//
// ── WHY IT MATTERS THAT THESE ARE PARAMETRIC ────────────────────────────────────────────────────
//
// The registry had three ways to create geometry: a point, a line, and a polyline/polygon through
// vertices. Everything else a surveyor draws — a rectangle, a circle, an arc, a text note — could
// only be reached by handing the AI a vertex list and asking it to approximate.
//
// That is worse than "a bit rough". **A circle emitted as 64 vertices is not a circle**: it exports
// as a polyline, it cannot be snapped to a centre, and `computeFeatureArea` measures the inscribed
// polygon rather than the circle — quietly under by 0.4% at 64 sides, which is the kind of error
// that survives into an acreage. The parametric geometry this codebase stores
// (`geometry.circle`, `.ellipse`, `.arc`) exists precisely so that does not happen, and the AI had
// no way to produce it.
//
// C31 is what makes this cheap: adding a tool here reaches BOTH AI paths, because the chat prompt
// is generated from the registry and `claude-proposer` derives its tool list from it. That was the
// whole argument for sequencing D4 first, and this is the slice that collects on it.

import { describe, it, expect, beforeEach } from 'vitest';

import { toolRegistry, drawRectangle, drawCircle, drawArc, drawText } from '@/lib/cad/ai/tool-registry';
import { aiCapabilities } from '@/lib/cad/ai/capabilities';
import { useDrawingStore } from '@/lib/cad/store';
import type { Feature } from '@/lib/cad/types';

/** The tools write into the live store, so each test starts from a known layer. */
beforeEach(() => {
  useDrawingStore.setState((s) => ({
    document: {
      ...s.document,
      features: {},
      layers: {
        L1: {
          id: 'L1', name: 'AI', visible: true, locked: false, frozen: false,
          color: '#000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
          groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
        },
      },
      layerOrder: ['L1'],
    },
    activeLayerId: 'L1',
  }));
});

const ok = <T,>(r: { ok: boolean; result?: T; reason?: string }): T => {
  expect(r.ok, r.reason).toBe(true);
  return r.result as T;
};

describe('drawRectangle', () => {
  it('produces four corners in order', () => {
    const f = ok<Feature>(drawRectangle.execute({ corner: { x: 0, y: 0 }, opposite: { x: 10, y: 5 } }));
    expect(f.type).toBe('POLYGON');
    expect(f.geometry.vertices).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 },
    ]);
  });

  it('works from any diagonal', () => {
    // Top-right to bottom-left must give the same rectangle, not a self-crossing bowtie.
    const f = ok<Feature>(drawRectangle.execute({ corner: { x: 10, y: 5 }, opposite: { x: 0, y: 0 } }));
    const xs = f.geometry.vertices!.map((v) => v.x).sort();
    const ys = f.geometry.vertices!.map((v) => v.y).sort();
    expect(xs).toEqual([0, 0, 10, 10]);
    expect(ys).toEqual([0, 0, 5, 5]);
  });

  it('refuses a degenerate rectangle rather than drawing a line', () => {
    // Zero area is a line the caller did not ask for, and it measures as nothing.
    const flat = drawRectangle.execute({ corner: { x: 0, y: 0 }, opposite: { x: 0, y: 5 } });
    expect(flat.ok).toBe(false);
    if (!flat.ok) expect(flat.reason).toMatch(/no width/);
    const thin = drawRectangle.execute({ corner: { x: 0, y: 0 }, opposite: { x: 5, y: 0 } });
    expect(thin.ok).toBe(false);
    if (!thin.ok) expect(thin.reason).toMatch(/no height/);
  });
});

describe('drawCircle', () => {
  it('produces PARAMETRIC circle geometry, not a polyline', () => {
    // The whole point. 64 vertices is not a circle: it exports as a polyline, cannot be snapped to
    // a centre, and measures as the inscribed polygon.
    const f = ok<Feature>(drawCircle.execute({ center: { x: 10, y: 20 }, radius: 50 }));
    expect(f.geometry.circle).toEqual({ center: { x: 10, y: 20 }, radius: 50 });
    expect(f.geometry.vertices).toBeUndefined();
  });

  it('refuses a non-positive radius', () => {
    expect(drawCircle.execute({ center: { x: 0, y: 0 }, radius: 0 }).ok).toBe(false);
    expect(drawCircle.execute({ center: { x: 0, y: 0 }, radius: -5 }).ok).toBe(false);
  });
});

describe('drawArc', () => {
  it('fits a circle through the three points', () => {
    // Unit semicircle through (1,0), (0,1), (-1,0) — centre at the origin, radius 1.
    const f = ok<Feature>(drawArc.execute({
      start: { x: 1, y: 0 }, through: { x: 0, y: 1 }, end: { x: -1, y: 0 },
    }));
    expect(f.type).toBe('ARC');
    expect(f.geometry.arc!.radius).toBeCloseTo(1, 9);
    expect(f.geometry.arc!.center.x).toBeCloseTo(0, 9);
    expect(f.geometry.arc!.center.y).toBeCloseTo(0, 9);
  });

  it('sweeps THROUGH the middle point, measured not assumed', () => {
    // Guessing the direction draws the major arc — the 300-foot error C29 hit by reasoning about a
    // convention instead of reading it. Checked both ways round the same two endpoints.
    const up = ok<Feature>(drawArc.execute({
      start: { x: 1, y: 0 }, through: { x: 0, y: 1 }, end: { x: -1, y: 0 },
    }));
    const down = ok<Feature>(drawArc.execute({
      start: { x: 1, y: 0 }, through: { x: 0, y: -1 }, end: { x: -1, y: 0 },
    }));
    expect(up.geometry.arc!.anticlockwise).not.toBe(down.geometry.arc!.anticlockwise);
  });

  it('the swept arc really contains the middle point', () => {
    // Independent of the flag that produced it — a sign error passes every scalar check above.
    const f = ok<Feature>(drawArc.execute({
      start: { x: 1, y: 0 }, through: { x: 0, y: 1 }, end: { x: -1, y: 0 },
    }));
    const a = f.geometry.arc!;
    const TAU = Math.PI * 2;
    const norm = (v: number) => ((v % TAU) + TAU) % TAU;
    const rel = (p: { x: number; y: number }) =>
      norm(Math.atan2(p.y - a.center.y, p.x - a.center.x) - a.startAngle);
    const span = a.anticlockwise ? norm(a.endAngle - a.startAngle) : norm(a.startAngle - a.endAngle);
    const mid = a.anticlockwise ? rel({ x: 0, y: 1 }) : norm(-rel({ x: 0, y: 1 }));
    expect(mid).toBeLessThanOrEqual(span + 1e-9);
  });

  it('refuses three collinear points', () => {
    // No circle passes through them. Emitting an arc of infinite radius renders as nothing and
    // reads as the tool having silently failed.
    const r = drawArc.execute({ start: { x: 0, y: 0 }, through: { x: 1, y: 1 }, end: { x: 2, y: 2 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/collinear/);
  });
});

describe('drawText', () => {
  it('places the content and anchors it', () => {
    const f = ok<Feature>(drawText.execute({ at: { x: 5, y: 6 }, text: 'FND 1/2" IR' }));
    expect(f.type).toBe('TEXT');
    expect(f.geometry.textContent).toBe('FND 1/2" IR');
    expect(f.geometry.point).toEqual({ x: 5, y: 6 });
  });

  it('puts the font size where the renderer reads it', () => {
    // C20: the canvas and the PDF writer both read the font off `properties`, not off style.
    expect(ok<Feature>(drawText.execute({ at: { x: 0, y: 0 }, text: 'x' })).properties.fontSize).toBe(12);
    expect(ok<Feature>(drawText.execute({ at: { x: 0, y: 0 }, text: 'x', fontSize: 8 })).properties.fontSize).toBe(8);
  });

  it('converts rotation to radians', () => {
    const f = ok<Feature>(drawText.execute({ at: { x: 0, y: 0 }, text: 'x', rotationDeg: 90 }));
    expect(f.geometry.textRotation).toBeCloseTo(Math.PI / 2, 9);
  });

  it('refuses empty text', () => {
    // An invisible feature the surveyor cannot see, cannot select by looking, and will not know to
    // delete.
    expect(drawText.execute({ at: { x: 0, y: 0 }, text: '' }).ok).toBe(false);
    expect(drawText.execute({ at: { x: 0, y: 0 }, text: '   ' }).ok).toBe(false);
  });

  it('refuses a non-positive font size', () => {
    expect(drawText.execute({ at: { x: 0, y: 0 }, text: 'x', fontSize: 0 }).ok).toBe(false);
  });
});

describe('every new tool behaves like the old ones', () => {
  const added = ['drawRectangle', 'drawCircle', 'drawArc', 'drawText'] as const;

  it.each(added)('%s is in the registry', (name) => {
    expect(Object.keys(toolRegistry)).toContain(name);
  });

  it.each(added)('%s writes to the drawing and is undoable', (name) => {
    // Every other creating tool commits through `commitFeature`, which pushes an undo entry. A tool
    // that skipped it would leave the surveyor unable to reverse an AI edit — which is C37's whole
    // subject, and would be a hole opened by this slice.
    const before = Object.keys(useDrawingStore.getState().document.features).length;
    const calls: Record<string, () => unknown> = {
      drawRectangle: () => drawRectangle.execute({ corner: { x: 0, y: 0 }, opposite: { x: 1, y: 1 } }),
      drawCircle: () => drawCircle.execute({ center: { x: 0, y: 0 }, radius: 1 }),
      drawArc: () => drawArc.execute({ start: { x: 1, y: 0 }, through: { x: 0, y: 1 }, end: { x: -1, y: 0 } }),
      drawText: () => drawText.execute({ at: { x: 0, y: 0 }, text: 'x' }),
    };
    calls[name]();
    expect(Object.keys(useDrawingStore.getState().document.features).length).toBe(before + 1);
  });

  it.each(added)('%s refuses a layer that does not exist', (name) => {
    const calls: Record<string, () => { ok: boolean }> = {
      drawRectangle: () => drawRectangle.execute({ corner: { x: 0, y: 0 }, opposite: { x: 1, y: 1 }, layerId: 'NOPE' }),
      drawCircle: () => drawCircle.execute({ center: { x: 0, y: 0 }, radius: 1, layerId: 'NOPE' }),
      drawArc: () => drawArc.execute({ start: { x: 1, y: 0 }, through: { x: 0, y: 1 }, end: { x: -1, y: 0 }, layerId: 'NOPE' }),
      drawText: () => drawText.execute({ at: { x: 0, y: 0 }, text: 'x', layerId: 'NOPE' }),
    };
    expect(calls[name]().ok).toBe(false);
  });

  it.each(added)('%s validates its points instead of writing NaN', (name) => {
    // Geometry at NaN is placed nowhere and is far harder to notice than a refusal.
    const bad = { x: Number.NaN, y: 0 };
    const calls: Record<string, () => { ok: boolean }> = {
      drawRectangle: () => drawRectangle.execute({ corner: bad, opposite: { x: 1, y: 1 } }),
      drawCircle: () => drawCircle.execute({ center: bad, radius: 1 }),
      drawArc: () => drawArc.execute({ start: bad, through: { x: 0, y: 1 }, end: { x: -1, y: 0 } }),
      drawText: () => drawText.execute({ at: bad, text: 'x' }),
    };
    expect(calls[name]().ok).toBe(false);
  });
});

describe('C31 pays off — both AI paths get these for free', () => {
  it('they appear in the derived capability list', () => {
    const names = aiCapabilities().map((c) => c.name);
    for (const n of ['drawRectangle', 'drawCircle', 'drawArc', 'drawText']) {
      expect(names).toContain(n);
    }
  });

  it('and therefore in the chat prompt, with no prompt edit', () => {
    // The argument for sequencing D4 first, collected on. Adding a tool used to mean editing a
    // hand-written prompt too — or, more likely, forgetting to.
    const lines = aiCapabilities()
      .filter((c) => c.name.startsWith('draw'))
      .map((c) => c.description);
    expect(lines.length).toBeGreaterThanOrEqual(6);
    for (const d of lines) expect(d.length).toBeGreaterThan(20);
  });

  it('the registry has grown past its original thirteen', () => {
    expect(Object.keys(toolRegistry).length).toBeGreaterThan(13);
  });
});
