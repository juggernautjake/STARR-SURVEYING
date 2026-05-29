// __tests__/cad/operations/apply-offset-from-panel.test.ts
//
// Slice 1 of cad-offset-tool-2026-05-29.md. Covers the pure helper
// that converts the OffsetPanel's distance + unit + side + corner
// choices into a feet-denominated `applyInteractiveOffset` call.
//
// React-side panel interactivity is exercised by the Phase 3
// Playwright spec — the helper is the surface that needs locking
// in unit tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the operations module so we can spy on the call without
// also pulling in the drawing store + undo machinery.
vi.mock('@/lib/cad/operations', () => ({
  applyInteractiveOffset: vi.fn(),
}));

const { applyInteractiveOffset } = await import('@/lib/cad/operations');
const { applyOffsetFromPanel, distanceToFeet } = await import('@/lib/cad/operations/apply-offset-from-panel');

beforeEach(() => {
  vi.mocked(applyInteractiveOffset).mockClear();
});

describe('distanceToFeet — unit conversions', () => {
  it('FT round-trips at 1.0', () => {
    expect(distanceToFeet(12.5, 'FT')).toBe(12.5);
  });

  it('IN converts 12 → 1', () => {
    expect(distanceToFeet(12, 'IN')).toBeCloseTo(1, 6);
  });

  it('MILE converts 1 → 5280', () => {
    expect(distanceToFeet(1, 'MILE')).toBe(5280);
  });

  it('M converts 1 → 1/0.3048 (US survey foot)', () => {
    expect(distanceToFeet(1, 'M')).toBeCloseTo(1 / 0.3048, 6);
  });

  it('CM converts 100 → 1m (1/0.3048 ft)', () => {
    expect(distanceToFeet(100, 'CM')).toBeCloseTo(1 / 0.3048, 6);
  });

  it('MM converts 1000 → 1m (1/0.3048 ft)', () => {
    expect(distanceToFeet(1000, 'MM')).toBeCloseTo(1 / 0.3048, 6);
  });

  it('rejects zero distance (no-op offset)', () => {
    expect(distanceToFeet(0, 'FT')).toBeNull();
  });

  it('rejects negative distance', () => {
    expect(distanceToFeet(-1, 'FT')).toBeNull();
  });

  it('rejects NaN', () => {
    expect(distanceToFeet(Number.NaN, 'FT')).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(distanceToFeet(Number.POSITIVE_INFINITY, 'FT')).toBeNull();
  });
});

describe('applyOffsetFromPanel — happy path', () => {
  it('calls applyInteractiveOffset with the converted distance + LEFT side', () => {
    const ok = applyOffsetFromPanel({
      sourceId: 'src-1',
      distance: 12.5,
      unit: 'FT',
      side: 'LEFT',
      cornerHandling: 'MITER',
    });
    expect(ok).toBe(true);
    expect(applyInteractiveOffset).toHaveBeenCalledWith(
      'src-1',
      12.5,
      'LEFT',
      'MITER',
      { mode: 'PARALLEL' },
    );
  });

  it('converts inches to feet before calling the engine', () => {
    applyOffsetFromPanel({
      sourceId: 'src-1',
      distance: 6,
      unit: 'IN',
      side: 'RIGHT',
      cornerHandling: 'ROUND',
    });
    const [, distance] = vi.mocked(applyInteractiveOffset).mock.calls[0];
    expect(distance).toBeCloseTo(0.5, 6);
  });

  it('converts meters to feet before calling the engine', () => {
    applyOffsetFromPanel({
      sourceId: 'src-1',
      distance: 1,
      unit: 'M',
      side: 'BOTH',
      cornerHandling: 'CHAMFER',
    });
    const [, distance, side, corner] = vi.mocked(applyInteractiveOffset).mock.calls[0];
    expect(distance).toBeCloseTo(1 / 0.3048, 6);
    expect(side).toBe('BOTH');
    expect(corner).toBe('CHAMFER');
  });

  it('always uses PARALLEL mode', () => {
    applyOffsetFromPanel({
      sourceId: 'src-1',
      distance: 1,
      unit: 'FT',
      side: 'LEFT',
      cornerHandling: 'MITER',
    });
    const [, , , , opts] = vi.mocked(applyInteractiveOffset).mock.calls[0];
    expect(opts).toEqual({ mode: 'PARALLEL' });
  });
});

describe('applyOffsetFromPanel — rejection paths', () => {
  it('returns false + does not call the engine when sourceId is empty', () => {
    const ok = applyOffsetFromPanel({
      sourceId: '',
      distance: 12,
      unit: 'FT',
      side: 'LEFT',
      cornerHandling: 'MITER',
    });
    expect(ok).toBe(false);
    expect(applyInteractiveOffset).not.toHaveBeenCalled();
  });

  it('returns false + does not call the engine when distance is zero', () => {
    const ok = applyOffsetFromPanel({
      sourceId: 'src-1',
      distance: 0,
      unit: 'FT',
      side: 'LEFT',
      cornerHandling: 'MITER',
    });
    expect(ok).toBe(false);
    expect(applyInteractiveOffset).not.toHaveBeenCalled();
  });

  it('returns false + does not call the engine when distance is NaN', () => {
    const ok = applyOffsetFromPanel({
      sourceId: 'src-1',
      distance: Number.NaN,
      unit: 'FT',
      side: 'LEFT',
      cornerHandling: 'MITER',
    });
    expect(ok).toBe(false);
    expect(applyInteractiveOffset).not.toHaveBeenCalled();
  });
});
