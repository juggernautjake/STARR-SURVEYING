// Geometry core for the "line off a line" tool (perpendicular by default,
// fixed angle off the base line, or absolute azimuth).

import { describe, it, expect } from 'vitest';
import {
  unitVector,
  rotate,
  offsetDirection,
  offsetEndpoint,
  projectedLength,
  cursorSide,
  directionFromAzimuth,
  azimuthOfDirection,
} from '@/lib/cad/geometry/perpendicular-line';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('unitVector', () => {
  it('normalises a direction', () => {
    const v = unitVector({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(v).not.toBeNull();
    expect(close(v!.x, 0.6)).toBe(true);
    expect(close(v!.y, 0.8)).toBe(true);
  });

  it('returns null for coincident points', () => {
    expect(unitVector({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });
});

describe('rotate', () => {
  it('rotates +90° CCW', () => {
    const r = rotate({ x: 1, y: 0 }, 90);
    expect(close(r.x, 0)).toBe(true);
    expect(close(r.y, 1)).toBe(true);
  });

  it('rotates -90° CW', () => {
    const r = rotate({ x: 1, y: 0 }, -90);
    expect(close(r.x, 0)).toBe(true);
    expect(close(r.y, -1)).toBe(true);
  });
});

describe('offsetDirection', () => {
  it('defaults (90°) give a perpendicular to a horizontal base line', () => {
    const base = { x: 1, y: 0 };
    const up = offsetDirection(base, 90, 1);
    const down = offsetDirection(base, 90, -1);
    expect(close(up.x, 0)).toBe(true);
    expect(close(up.y, 1)).toBe(true);
    expect(close(down.x, 0)).toBe(true);
    expect(close(down.y, -1)).toBe(true);
  });

  it('a 45° angle off the base line bisects', () => {
    const d = offsetDirection({ x: 1, y: 0 }, 45, 1);
    expect(close(d.x, Math.SQRT1_2)).toBe(true);
    expect(close(d.y, Math.SQRT1_2)).toBe(true);
  });
});

describe('offsetEndpoint', () => {
  it('extends from the start along the direction by length', () => {
    const end = offsetEndpoint({ x: 10, y: 20 }, { x: 0, y: 1 }, 35);
    expect(close(end.x, 10)).toBe(true);
    expect(close(end.y, 55)).toBe(true);
  });
});

describe('projectedLength', () => {
  it('is the signed projection onto the offset direction', () => {
    const start = { x: 0, y: 0 };
    const dir = { x: 0, y: 1 };
    expect(close(projectedLength(start, dir, { x: 3, y: 12 }), 12)).toBe(true);
    // Cursor behind the start projects negative.
    expect(close(projectedLength(start, dir, { x: 3, y: -4 }), -4)).toBe(true);
  });
});

describe('cursorSide', () => {
  it('reports which side of the base line the cursor is on', () => {
    const start = { x: 0, y: 0 };
    const base = { x: 1, y: 0 }; // pointing +x
    expect(cursorSide(start, base, { x: 0, y: 5 })).toBe(1); // left/up
    expect(cursorSide(start, base, { x: 0, y: -5 })).toBe(-1); // right/down
  });
});

describe('azimuth helpers', () => {
  it('directionFromAzimuth: due east is azimuth 90', () => {
    const d = directionFromAzimuth(90);
    expect(close(d.x, 1)).toBe(true);
    expect(close(d.y, 0)).toBe(true);
  });

  it('directionFromAzimuth: due north is azimuth 0', () => {
    const d = directionFromAzimuth(0);
    expect(close(d.x, 0)).toBe(true);
    expect(close(d.y, 1)).toBe(true);
  });

  it('azimuthOfDirection is the inverse', () => {
    expect(close(azimuthOfDirection({ x: 1, y: 0 }), 90)).toBe(true);
    expect(close(azimuthOfDirection({ x: 0, y: 1 }), 0)).toBe(true);
    expect(close(azimuthOfDirection({ x: -1, y: 0 }), 270)).toBe(true);
  });
});
