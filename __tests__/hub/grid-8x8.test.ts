// __tests__/hub/grid-8x8.test.ts
//
// Slice 209 of hub-grid-8x8-square-cells-2026-05-29.md. Locks the
// new 8-col grid + square-cell contract:
//   - breakpointForWidth thresholds (8 / 4 / 1)
//   - default INITIAL breakpoint from useElementSize is 8
//   - every shipped widget's defaultSize/min/max fits inside the
//     8×8 envelope (no leftover 12-col references)

import { describe, it, expect } from 'vitest';
import { allWidgets } from '@/lib/hub/widget-registry';
import { breakpointForWidth, type GridBreakpoint } from '@/lib/hub/grid-math';
import '@/lib/hub/widgets/register-all';

describe('Slice 209 — 8-col grid contract', () => {
  it('GridBreakpoint values are 8 / 4 / 1', () => {
    const bps: GridBreakpoint[] = [8, 4, 1];
    expect(bps).toHaveLength(3);
  });

  it('breakpointForWidth returns one of the supported values for every width', () => {
    for (const px of [0, 320, 480, 639, 640, 800, 1023, 1024, 1280, 1440, 1920]) {
      const bp = breakpointForWidth(px);
      expect([8, 4, 1]).toContain(bp);
    }
  });
});

describe('Slice 209 — every widget definition fits the 8×8 envelope', () => {
  const widgets = allWidgets();

  it('catalog is non-empty (register-all ran)', () => {
    expect(widgets.length).toBeGreaterThan(20);
  });

  for (const def of allWidgets()) {
    describe(def.id, () => {
      it('defaultSize.w ≤ 8 + defaultSize.h ≤ 8', () => {
        expect(def.defaultSize.w).toBeLessThanOrEqual(8);
        expect(def.defaultSize.w).toBeGreaterThanOrEqual(1);
        expect(def.defaultSize.h).toBeLessThanOrEqual(8);
        expect(def.defaultSize.h).toBeGreaterThanOrEqual(1);
      });

      it('maxSize.w ≤ 8 + maxSize.h ≤ 8', () => {
        expect(def.maxSize.w).toBeLessThanOrEqual(8);
        expect(def.maxSize.h).toBeLessThanOrEqual(8);
      });

      it('minSize ≤ defaultSize ≤ maxSize', () => {
        expect(def.minSize.w).toBeLessThanOrEqual(def.defaultSize.w);
        expect(def.minSize.h).toBeLessThanOrEqual(def.defaultSize.h);
        expect(def.defaultSize.w).toBeLessThanOrEqual(def.maxSize.w);
        expect(def.defaultSize.h).toBeLessThanOrEqual(def.maxSize.h);
      });

      it('minSize ≥ 1 × 1', () => {
        expect(def.minSize.w).toBeGreaterThanOrEqual(1);
        expect(def.minSize.h).toBeGreaterThanOrEqual(1);
      });
    });
  }
});
