// __tests__/hub/widgets-responsive-213.test.ts
//
// Slice 213 of hub-grid-8x8-square-cells-2026-05-29.md. Adds
// tiny-bucket counter modes to 4 more list/stat widgets that
// previously showed the full WidgetEmpty illustration at any size.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';

const TARGET_IDS = ['weather', 'mentions-inbox', 'messages', 'recent-activity'];

describe('Slice 213 — communication widgets reach the tiny bucket', () => {
  for (const id of TARGET_IDS) {
    it(`${id} minSize lowered to 1×1`, () => {
      expect(getWidget(id)?.minSize).toEqual({ w: 1, h: 1 });
    });
  }
});

describe('Slice 213 — every touched widget still fits the 8×8 envelope', () => {
  for (const id of TARGET_IDS) {
    it(`${id} maxSize fits 8×8`, () => {
      const def = getWidget(id);
      expect(def?.maxSize.w).toBeLessThanOrEqual(8);
      expect(def?.maxSize.h).toBeLessThanOrEqual(8);
    });
  }
});

describe('Slice 213 — defaultSize is still a sensible non-tiny anchor', () => {
  // The tiny mode is the user's choice — the seeded layout should
  // still drop the widget at a size that shows the full content.
  for (const id of TARGET_IDS) {
    it(`${id} default size lands in small or larger bucket`, () => {
      const def = getWidget(id);
      const area = (def?.defaultSize.w ?? 0) * (def?.defaultSize.h ?? 0);
      expect(area).toBeGreaterThan(2);
    });
  }
});
