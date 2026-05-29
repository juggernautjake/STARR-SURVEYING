// __tests__/hub/widgets-responsive-217.test.ts
//
// Slice 217 of hub-grid-8x8-square-cells-2026-05-29.md. Lowers the
// minSize of every remaining widget that has proper bucket logic
// from 2×1 or 2×2 down to 1×1, and adds tiny counter modes to the
// 4 widgets (pipeline-status, quiz-history, recommended-lessons,
// outstanding-invoices) that didn't yet have a tiny render path.
//
// Phase 35 is effectively complete after this slice: every widget
// in the catalog supports a 1×1 cell EXCEPT two documented
// composites (daily-briefing 4×2 + crew-calendar 3×2) whose
// multi-row layouts legitimately need more than a tiny cell.

import { describe, it, expect } from 'vitest';
import { allWidgets, getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';

const NEWLY_TINY = [
  // New tiny counter modes added.
  'pipeline-status',
  'quiz-history',
  'recommended-lessons',
  'outstanding-invoices',
  // minSize lowered (widget already had bucket logic).
  'my-jobs',
  'my-pay',
  'quick-actions',
  'pinned-pages',
  'bookmarks',
  'class-assignments',
];

const DOCUMENTED_EXCEPTIONS = new Set(['daily-briefing', 'crew-calendar']);

describe('Slice 217 — every newly-touched widget reaches 1×1', () => {
  for (const id of NEWLY_TINY) {
    it(`${id} minSize is 1×1`, () => {
      expect(getWidget(id)?.minSize).toEqual({ w: 1, h: 1 });
    });
  }
});

describe('Phase 35 done-when contract — 1×1 across the catalog (with 2 exceptions)', () => {
  // After Slice 217, every widget except the two documented
  // composite exceptions supports a 1×1 cell.
  for (const def of allWidgets()) {
    if (DOCUMENTED_EXCEPTIONS.has(def.id)) {
      it(`${def.id} is a documented composite (skip 1×1)`, () => {
        expect(def.minSize.w * def.minSize.h).toBeGreaterThan(1);
      });
    } else {
      it(`${def.id} supports a 1×1 cell`, () => {
        expect(def.minSize).toEqual({ w: 1, h: 1 });
      });
    }
  }
});
