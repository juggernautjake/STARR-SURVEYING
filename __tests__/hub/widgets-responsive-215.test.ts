// __tests__/hub/widgets-responsive-215.test.ts
//
// Slice 215 of hub-grid-8x8-square-cells-2026-05-29.md. Tiny
// counter modes applied to 6 equipment + work-status widgets via
// a tokenized batch script.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';

const TARGET_IDS = [
  'equipment-out-today',
  'low-consumables',
  'maintenance-due',
  'vehicles-status',
  'drawings-in-progress',
  'field-data-pending',
];

describe('Slice 215 — equipment + work widgets reach the tiny bucket', () => {
  for (const id of TARGET_IDS) {
    it(`${id} minSize lowered to 1×1`, () => {
      expect(getWidget(id)?.minSize).toEqual({ w: 1, h: 1 });
    });
  }
});

describe('Slice 215 — every touched widget still fits the 8×8 envelope', () => {
  for (const id of TARGET_IDS) {
    it(`${id} maxSize fits 8×8`, () => {
      const def = getWidget(id);
      expect(def?.maxSize.w).toBeLessThanOrEqual(8);
      expect(def?.maxSize.h).toBeLessThanOrEqual(8);
    });
  }
});
