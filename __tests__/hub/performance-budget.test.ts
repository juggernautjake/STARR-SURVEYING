import { describe, it, expect } from 'vitest';
import {
  HIGH_TRAFFIC_WIDGET_IDS,
  PERFORMANCE_BUDGET_LIMIT,
  highTrafficWidgetCount,
  wouldExceedBudget,
} from '@/lib/hub/performance-budget';
import type { WidgetInstance } from '@/lib/hub/types';

function w(type: string, id = `w_${type}`): WidgetInstance {
  return { id, type, x: 0, y: 0, w: 6, h: 2 };
}

describe('performance-budget', () => {
  it('catalogues many widget ids as high-traffic', () => {
    expect(HIGH_TRAFFIC_WIDGET_IDS.has('my-jobs')).toBe(true);
    expect(HIGH_TRAFFIC_WIDGET_IDS.has('pinned-pages')).toBe(false);
    expect(HIGH_TRAFFIC_WIDGET_IDS.has('quick-actions')).toBe(false);
  });

  it('counts only high-traffic widgets', () => {
    const layout = [w('my-jobs'), w('pinned-pages'), w('my-pay'), w('quick-actions')];
    expect(highTrafficWidgetCount(layout)).toBe(2);
  });

  it('wouldExceedBudget returns false at the limit when not exceeded', () => {
    const layout: WidgetInstance[] = Array.from({ length: 7 }).map((_, i) => w('my-jobs', `w${i}`));
    expect(wouldExceedBudget(layout, 'my-pay')).toBe(false);
  });

  it('wouldExceedBudget returns true at limit when adding another high-traffic', () => {
    const layout: WidgetInstance[] = Array.from({ length: PERFORMANCE_BUDGET_LIMIT }).map((_, i) => w('my-jobs', `w${i}`));
    expect(wouldExceedBudget(layout, 'my-pay')).toBe(true);
  });

  it('wouldExceedBudget returns false when adding a non-high-traffic widget', () => {
    const layout: WidgetInstance[] = Array.from({ length: 12 }).map((_, i) => w('my-jobs', `w${i}`));
    expect(wouldExceedBudget(layout, 'pinned-pages')).toBe(false);
  });
});
