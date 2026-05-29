// __tests__/hub/widgets-responsive-214.test.ts
//
// Slice 214 of hub-grid-8x8-square-cells-2026-05-29.md. Adds tiny
// counter modes to 4 more list widgets that previously showed the
// full WidgetEmpty illustration at every size:
// assignments-due, pending-time-off, pending-hours, open-discussions.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { isOverdue } from '@/lib/hub/widgets/assignments-due';
import '@/lib/hub/widgets/register-all';

const TARGET_IDS = ['assignments-due', 'pending-time-off', 'pending-hours', 'open-discussions'];

describe('Slice 214 — list widgets reach the tiny bucket', () => {
  for (const id of TARGET_IDS) {
    it(`${id} minSize lowered to 1×1`, () => {
      expect(getWidget(id)?.minSize).toEqual({ w: 1, h: 1 });
    });
  }
});

describe('Slice 214 — every touched widget still fits the 8×8 envelope', () => {
  for (const id of TARGET_IDS) {
    it(`${id} maxSize fits 8×8`, () => {
      const def = getWidget(id);
      expect(def?.maxSize.w).toBeLessThanOrEqual(8);
      expect(def?.maxSize.h).toBeLessThanOrEqual(8);
    });
  }
});

describe('assignments-due — isOverdue helper (new)', () => {
  it('returns false when due-date is missing', () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
    expect(isOverdue('')).toBe(false);
  });

  it('returns false when due-date is in the future', () => {
    const futureIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    expect(isOverdue(futureIso)).toBe(false);
  });

  it('returns true when due-date is in the past', () => {
    const pastIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    expect(isOverdue(pastIso)).toBe(true);
  });

  it('honors the injected nowMs so the helper is deterministic in tests', () => {
    const fixedNow = Date.parse('2026-06-01T00:00:00Z');
    expect(isOverdue('2026-05-29T00:00:00Z', fixedNow)).toBe(true);
    expect(isOverdue('2026-06-15T00:00:00Z', fixedNow)).toBe(false);
  });

  it('rejects malformed ISO strings gracefully', () => {
    expect(isOverdue('not-a-date')).toBe(false);
  });
});
