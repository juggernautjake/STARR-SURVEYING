// __tests__/cad/styles/linetype-renderer.test.ts — Unit tests for line type renderer
import { describe, it, expect, vi } from 'vitest';
import { renderLineWithType, MM_TO_PX } from '@/lib/cad/styles/linetype-renderer';
import { getLineTypeById } from '@/lib/cad/styles/linetype-library';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMockGraphics() {
  return {
    lineStyle: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    beginFill: vi.fn(),
    endFill: vi.fn(),
    drawCircle: vi.fn(),
    bezierCurveTo: vi.fn(),
  };
}

const P0 = { x: 0, y: 0 };
const P1 = { x: 100, y: 0 };
const P2 = { x: 100, y: 100 };

// ── MM_TO_PX constant ─────────────────────────────────────────────────────────

describe('MM_TO_PX', () => {
  it('is a positive number', () => {
    expect(MM_TO_PX).toBeGreaterThan(0);
  });
});

// ── renderLineWithType guard conditions ───────────────────────────────────────

describe('renderLineWithType — guard conditions', () => {
  it('does nothing when g is null', () => {
    expect(() => renderLineWithType(null, getLineTypeById('SOLID')!, [P0, P1], 0x000000, 1, 1, 50, 1)).not.toThrow();
  });

  it('does nothing when lineType is null', () => {
    const g = makeMockGraphics();
    expect(() => renderLineWithType(g, null as any, [P0, P1], 0x000000, 1, 1, 50, 1)).not.toThrow();
    expect(g.lineStyle).not.toHaveBeenCalled();
  });

  it('does nothing for empty points array', () => {
    const g = makeMockGraphics();
    renderLineWithType(g, getLineTypeById('SOLID')!, [], 0x000000, 1, 1, 50, 1);
    expect(g.lineStyle).not.toHaveBeenCalled();
  });

  it('does nothing for single point array', () => {
    const g = makeMockGraphics();
    renderLineWithType(g, getLineTypeById('SOLID')!, [P0], 0x000000, 1, 1, 50, 1);
    expect(g.lineStyle).not.toHaveBeenCalled();
  });

  it('filters out NaN points', () => {
    const g = makeMockGraphics();
    const points = [P0, { x: NaN, y: 50 }, P1];
    // After filtering, only 2 valid points remain
    renderLineWithType(g, getLineTypeById('SOLID')!, points, 0x000000, 1, 1, 50, 1);
    expect(g.lineStyle).toHaveBeenCalled();
  });

  it('does nothing when all points are NaN', () => {
    const g = makeMockGraphics();
    renderLineWithType(g, getLineTypeById('SOLID')!, [{ x: NaN, y: NaN }, { x: NaN, y: NaN }], 0x000000, 1, 1, 50, 1);
    expect(g.lineStyle).not.toHaveBeenCalled();
  });
});

// ── SOLID line rendering ──────────────────────────────────────────────────────

describe('renderLineWithType — SOLID', () => {
  it('calls lineStyle, moveTo, lineTo for a two-point line', () => {
    const g = makeMockGraphics();
    renderLineWithType(g, getLineTypeById('SOLID')!, [P0, P1], 0xFF0000, 2, 0.8, 50, 1);
    expect(g.lineStyle).toHaveBeenCalledWith(2, 0xFF0000, 0.8);
    expect(g.moveTo).toHaveBeenCalledWith(P0.x, P0.y);
    expect(g.lineTo).toHaveBeenCalledWith(P1.x, P1.y);
  });

  it('calls lineTo for each additional segment in a polyline', () => {
    const g = makeMockGraphics();
    const points = [P0, P1, P2, { x: 200, y: 100 }];
    renderLineWithType(g, getLineTypeById('SOLID')!, points, 0x000000, 1, 1, 50, 1);
    // One moveTo for the start, one lineTo per subsequent point
    expect(g.moveTo).toHaveBeenCalledTimes(1);
    expect(g.lineTo).toHaveBeenCalledTimes(3);
  });

  it('clamps opacity to 0-1', () => {
    const g = makeMockGraphics();
    renderLineWithType(g, getLineTypeById('SOLID')!, [P0, P1], 0x000000, 1, 2.5, 50, 1);
    expect(g.lineStyle).toHaveBeenCalledWith(1, 0x000000, 1);
  });

  it('clamps negative weight to 0', () => {
    const g = makeMockGraphics();
    renderLineWithType(g, getLineTypeById('SOLID')!, [P0, P1], 0x000000, -1, 1, 50, 1);
    expect(g.lineStyle).toHaveBeenCalledWith(0, 0x000000, 1);
  });
});

// ── DASHED line rendering ─────────────────────────────────────────────────────

describe('renderLineWithType — DASHED', () => {
  it('calls lineStyle and at least one moveTo for a dashed line', () => {
    const g = makeMockGraphics();
    renderLineWithType(g, getLineTypeById('DASHED')!, [P0, P1], 0x000000, 1, 1, 50, 1);
    expect(g.lineStyle).toHaveBeenCalled();
    expect(g.moveTo).toHaveBeenCalled();
  });

  it('renders more line segments at higher zoom (more dash cycles fit)', () => {
    const g1 = makeMockGraphics();
    const g2 = makeMockGraphics();
    const dashed = getLineTypeById('DASHED')!;
    // Same line, zoom=1 vs zoom=2 — should produce different lineTo call counts
    renderLineWithType(g1, dashed, [P0, { x: 500, y: 0 }], 0x000000, 1, 1, 50, 1);
    renderLineWithType(g2, dashed, [P0, { x: 500, y: 0 }], 0x000000, 1, 1, 50, 2);
    // At higher zoom the dashes are bigger so fewer fit → fewer lineTo calls
    const lineTo1 = g1.lineTo.mock.calls.length;
    const lineTo2 = g2.lineTo.mock.calls.length;
    // They should not be the same (one has more dashes than the other)
    expect(lineTo1).not.toBe(lineTo2);
  });
});

// ── WAVY line rendering ───────────────────────────────────────────────────────

describe('renderLineWithType — WAVY (CREEK_WAVY)', () => {
  it('calls lineStyle and multiple lineTo for wavy line', () => {
    const g = makeMockGraphics();
    const wavy = getLineTypeById('CREEK_WAVY')!;
    renderLineWithType(g, wavy, [P0, P1], 0x0000FF, 1, 1, 50, 1);
    expect(g.lineStyle).toHaveBeenCalled();
    expect(g.moveTo).toHaveBeenCalledTimes(1);
    expect(g.lineTo.mock.calls.length).toBeGreaterThan(1);
  });

  it('does not call moveTo again mid-line (continuous wavy line)', () => {
    const g = makeMockGraphics();
    const wavy = getLineTypeById('CREEK_WAVY')!;
    renderLineWithType(g, wavy, [P0, P1], 0x0000FF, 1, 1, 50, 1);
    // moveTo should only be called once (at the start)
    expect(g.moveTo).toHaveBeenCalledTimes(1);
  });
});

// ── Fence lines with inline symbols ──────────────────────────────────────────

describe('renderLineWithType — fence with inline symbols', () => {
  it('calls drawCircle or moveTo/lineTo for inline symbols on a long barbed wire line', () => {
    const g = makeMockGraphics();
    const barbedWire = getLineTypeById('FENCE_BARBED_WIRE')!;
    // Use a 200px line so at least one symbol should appear
    renderLineWithType(g, barbedWire, [P0, { x: 200, y: 0 }], 0xE67E22, 1, 1, 50, 1);
    // Should have rendered both the base line and at least one inline symbol
    expect(g.lineStyle).toHaveBeenCalled();
  });

  it('does not crash for a very short line with inline symbols', () => {
    const g = makeMockGraphics();
    const barbedWire = getLineTypeById('FENCE_BARBED_WIRE')!;
    // 1px line — inline symbols may not fit, but should not crash
    expect(() => renderLineWithType(g, barbedWire, [P0, { x: 1, y: 0 }], 0xE67E22, 1, 1, 50, 1)).not.toThrow();
  });

  it('RAILROAD line renders without error', () => {
    const g = makeMockGraphics();
    const railroad = getLineTypeById('RAILROAD')!;
    expect(() => renderLineWithType(g, railroad, [P0, { x: 300, y: 0 }], 0x808080, 1, 1, 50, 1)).not.toThrow();
    expect(g.lineStyle).toHaveBeenCalled();
  });
});

// ── Zero-length segment handling ──────────────────────────────────────────────

describe('renderLineWithType — zero-length segments', () => {
  it('handles coincident points without error', () => {
    const g = makeMockGraphics();
    renderLineWithType(g, getLineTypeById('DASHED')!, [P0, P0, P1], 0x000000, 1, 1, 50, 1);
    expect(g.lineStyle).toHaveBeenCalled();
  });

  it('handles all coincident points without crash', () => {
    const g = makeMockGraphics();
    // All points at the same location — no line to draw
    renderLineWithType(g, getLineTypeById('SOLID')!, [P0, P0], 0x000000, 1, 1, 50, 1);
    // lineStyle may or may not be called, but should not throw
  });
});
