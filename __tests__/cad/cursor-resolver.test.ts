// __tests__/cad/cursor-resolver.test.ts
//
// `resolveCursor()` decides the mouse-pointer style on every frame of
// the CAD canvas. It's intentionally store-free so it's drivable
// from unit tests directly. A regression here means the surveyor sees
// the wrong cursor (or worse, the right cursor only sometimes) — both
// trust-damaging because cursor state is how the user knows what the
// next click will do.

import { describe, it, expect } from 'vitest';
import { resolveCursor, type CursorContext } from '@/lib/cad/cursors/manager';

const ctx = (overrides: Partial<CursorContext> & { tool: CursorContext['tool'] }): CursorContext => ({
  ...overrides,
});

describe('resolveCursor — priority overrides (top of the cascade)', () => {
  it('notAllowed wins over everything', () => {
    expect(resolveCursor(ctx({ tool: 'PAN', notAllowed: true, isWaiting: true, isAIChatMode: true })))
      .toBe('NOT_ALLOWED');
  });

  it('isWaiting wins over isAIChatMode + tool', () => {
    expect(resolveCursor(ctx({ tool: 'SELECT', isWaiting: true, isAIChatMode: true })))
      .toBe('WAIT');
  });

  it('isAIChatMode wins over tool-based default', () => {
    expect(resolveCursor(ctx({ tool: 'SELECT', isAIChatMode: true })))
      .toBe('AI_CHAT');
  });
});

describe('resolveCursor — PAN tool', () => {
  it('GRAB when not dragging', () => {
    expect(resolveCursor(ctx({ tool: 'PAN' }))).toBe('GRAB');
  });

  it('GRABBING when dragging', () => {
    expect(resolveCursor(ctx({ tool: 'PAN', isDragging: true }))).toBe('GRABBING');
  });
});

describe('resolveCursor — SELECT tool', () => {
  it('DEFAULT with nothing under the cursor', () => {
    expect(resolveCursor(ctx({ tool: 'SELECT' }))).toBe('DEFAULT');
  });

  it('MOVE when hovering a feature', () => {
    expect(resolveCursor(ctx({ tool: 'SELECT', hoverFeature: true }))).toBe('MOVE');
  });

  it('MOVE when dragging a feature', () => {
    expect(resolveCursor(ctx({ tool: 'SELECT', isDragging: true, hoverFeature: true }))).toBe('MOVE');
  });

  it('resize cursor when on a grip', () => {
    // 0° → E_W (horizontal grip)
    expect(resolveCursor(ctx({ tool: 'SELECT', isGripHover: true, gripAngleDeg: 0 })))
      .toBe('RESIZE_E_W');
    // 90° → N_S
    expect(resolveCursor(ctx({ tool: 'SELECT', isGripHover: true, gripAngleDeg: 90 })))
      .toBe('RESIZE_N_S');
    // 45° → NE_SW
    expect(resolveCursor(ctx({ tool: 'SELECT', isGripHover: true, gripAngleDeg: 45 })))
      .toBe('RESIZE_NE_SW');
    // 135° → NW_SE
    expect(resolveCursor(ctx({ tool: 'SELECT', isGripHover: true, gripAngleDeg: 135 })))
      .toBe('RESIZE_NW_SE');
  });

  it('grip cursor is symmetric across 180° (a horizontal grip at 180° is still E_W)', () => {
    expect(resolveCursor(ctx({ tool: 'SELECT', isGripHover: true, gripAngleDeg: 180 })))
      .toBe('RESIZE_E_W');
    expect(resolveCursor(ctx({ tool: 'SELECT', isGripHover: true, gripAngleDeg: 360 })))
      .toBe('RESIZE_E_W');
  });

  it('handles negative grip angles', () => {
    // -45° → 135° after normalisation → NW_SE
    expect(resolveCursor(ctx({ tool: 'SELECT', isGripHover: true, gripAngleDeg: -45 })))
      .toBe('RESIZE_NW_SE');
  });

  it('isGripHover without gripAngleDeg falls through to non-grip behaviour', () => {
    // No angle → ignore the grip flag and fall back to plain SELECT logic.
    expect(resolveCursor(ctx({ tool: 'SELECT', isGripHover: true, gripAngleDeg: null })))
      .toBe('DEFAULT');
  });
});

describe('resolveCursor — DRAW_* tools use snap-aware cursors', () => {
  it('DRAW_LINE with no snap → CROSSHAIR', () => {
    expect(resolveCursor(ctx({ tool: 'DRAW_LINE' }))).toBe('CROSSHAIR');
  });

  it('DRAW_LINE with ENDPOINT snap', () => {
    expect(resolveCursor(ctx({ tool: 'DRAW_LINE', snapType: 'ENDPOINT' })))
      .toBe('DRAW_ENDPOINT');
  });

  it('DRAW_POLYLINE with MIDPOINT snap', () => {
    expect(resolveCursor(ctx({ tool: 'DRAW_POLYLINE', snapType: 'MIDPOINT' })))
      .toBe('DRAW_MIDPOINT');
  });

  it('DRAW_ARC with INTERSECTION snap', () => {
    expect(resolveCursor(ctx({ tool: 'DRAW_ARC', snapType: 'INTERSECTION' })))
      .toBe('DRAW_INTERSECT');
  });

  it('NEAREST and GRID snaps both render CROSSHAIR_SNAP', () => {
    expect(resolveCursor(ctx({ tool: 'DRAW_LINE', snapType: 'NEAREST' })))
      .toBe('CROSSHAIR_SNAP');
    expect(resolveCursor(ctx({ tool: 'DRAW_LINE', snapType: 'GRID' })))
      .toBe('CROSSHAIR_SNAP');
  });
});

describe('resolveCursor — transform tools', () => {
  it('MOVE → MOVE / GRABBING', () => {
    expect(resolveCursor(ctx({ tool: 'MOVE' }))).toBe('MOVE');
    expect(resolveCursor(ctx({ tool: 'MOVE', isDragging: true }))).toBe('GRABBING');
  });

  it('COPY → MOVE / GRABBING (mirrors MOVE)', () => {
    expect(resolveCursor(ctx({ tool: 'COPY' }))).toBe('MOVE');
    expect(resolveCursor(ctx({ tool: 'COPY', isDragging: true }))).toBe('GRABBING');
  });

  it('ROTATE / SCALE have dedicated cursors', () => {
    expect(resolveCursor(ctx({ tool: 'ROTATE' }))).toBe('ROTATE');
    expect(resolveCursor(ctx({ tool: 'SCALE' }))).toBe('SCALE');
  });
});

describe('resolveCursor — edit tools', () => {
  it('TRIM / EXTEND / ERASE have their own cursors', () => {
    expect(resolveCursor(ctx({ tool: 'TRIM' }))).toBe('TRIM');
    expect(resolveCursor(ctx({ tool: 'EXTEND' }))).toBe('EXTEND');
    expect(resolveCursor(ctx({ tool: 'ERASE' }))).toBe('ERASE');
  });

  it('OFFSET / PERPENDICULAR / DRAW_TEXT have dedicated cursors', () => {
    expect(resolveCursor(ctx({ tool: 'OFFSET' }))).toBe('OFFSET');
    expect(resolveCursor(ctx({ tool: 'PERPENDICULAR' }))).toBe('DRAW_PERPENDICULAR');
    expect(resolveCursor(ctx({ tool: 'DRAW_TEXT' }))).toBe('TEXT');
  });

  it('measurement tools render MEASURE', () => {
    expect(resolveCursor(ctx({ tool: 'MEASURE_AREA' }))).toBe('MEASURE');
    expect(resolveCursor(ctx({ tool: 'INVERSE' }))).toBe('MEASURE');
    expect(resolveCursor(ctx({ tool: 'DIM' }))).toBe('MEASURE');
  });
});
