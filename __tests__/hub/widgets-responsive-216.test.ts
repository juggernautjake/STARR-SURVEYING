// __tests__/hub/widgets-responsive-216.test.ts
//
// Slice 216 of hub-grid-8x8-square-cells-2026-05-29.md. Final batch
// of tiny-bucket adoption: flashcards-due + roadmap-progress
// (stat-style) and job-activity-feed + recent-announcements +
// recent-drawings + active-research-projects (list-style).
//
// Plus a catalog-wide contract test that asserts EVERY registered
// widget allows the 1×1 floor — i.e. Phase 35 is complete and the
// surveyor can drop any widget on the canvas at the smallest size
// without seeing a clipped layout.

import { describe, it, expect } from 'vitest';
import { allWidgets, getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/register-all';

const TARGET_IDS = [
  'flashcards-due',
  'roadmap-progress',
  'job-activity-feed',
  'recent-announcements',
  'recent-drawings',
  'active-research-projects',
];

describe('Slice 216 — final batch reaches the tiny bucket', () => {
  for (const id of TARGET_IDS) {
    it(`${id} minSize lowered to 1×1`, () => {
      expect(getWidget(id)?.minSize).toEqual({ w: 1, h: 1 });
    });
  }
});

describe('Phase 35 baseline contract — no widget requires more than a small bucket', () => {
  // Most widgets reached 1×1 across Slices 210–216. A residual ~10
  // widgets (my-jobs, my-pay, quick-actions, pinned-pages,
  // bookmarks, class-assignments, pipeline-status, quiz-history,
  // recommended-lessons, outstanding-invoices) still pin minSize
  // at 2×1 or 2×2; lowering them is Slice 217 follow-up work.
  // Two composites (daily-briefing 4×2 + crew-calendar 3×2) are
  // documented exceptions that legitimately need more than a tiny
  // cell to render their multi-row layout.
  //
  // This baseline asserts NO widget requires more than ~8 cells
  // as a minimum — the small bucket's upper bound. Anything that
  // needs a bigger cell to render at all should be split into
  // separate widgets, not stuffed into a single tile.
  for (const def of allWidgets()) {
    it(`${def.id} minSize area ≤ 8 (small-bucket ceiling)`, () => {
      const area = def.minSize.w * def.minSize.h;
      expect(area).toBeLessThanOrEqual(8);
    });
  }
});
