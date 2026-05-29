// __tests__/hub/widgets-responsive-212.test.ts
//
// Slice 212 of hub-grid-8x8-square-cells-2026-05-29.md. The three
// remaining stat widgets that had NO sizeBucket awareness at all
// (streak-counter, mileage-tracker, sun-calculator) now use the
// shared stat-bucket helpers + a 1×1-reachable tiny mode.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { periodLabel } from '@/lib/hub/widgets/mileage-tracker';
import '@/lib/hub/widgets/register-all';

describe('Slice 212 — stat-card widgets reach the tiny bucket', () => {
  it('streak-counter minSize lowered to 1×1', () => {
    expect(getWidget('streak-counter')?.minSize).toEqual({ w: 1, h: 1 });
  });
  it('mileage-tracker minSize lowered to 1×1', () => {
    expect(getWidget('mileage-tracker')?.minSize).toEqual({ w: 1, h: 1 });
  });
  it('sun-calculator minSize lowered to 1×1', () => {
    expect(getWidget('sun-calculator')?.minSize).toEqual({ w: 1, h: 1 });
  });
});

describe('mileage-tracker — periodLabel', () => {
  it('renders short labels for the tiny-mode footer', () => {
    expect(periodLabel('today')).toBe('today');
    expect(periodLabel('week')).toBe('this wk');
    expect(periodLabel('month')).toBe('this mo');
  });
});

describe('Slice 212 — every widget that took the shared helpers caps at 8×8', () => {
  for (const id of ['streak-counter', 'mileage-tracker', 'sun-calculator']) {
    it(`${id} maxSize stays within the 8×8 envelope`, () => {
      const def = getWidget(id);
      expect(def?.maxSize.w).toBeLessThanOrEqual(8);
      expect(def?.maxSize.h).toBeLessThanOrEqual(8);
    });
  }
});
