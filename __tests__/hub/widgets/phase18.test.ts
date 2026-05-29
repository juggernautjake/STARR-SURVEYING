import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import '@/lib/hub/widgets/weather';
import '@/lib/hub/widgets/mileage-tracker';
import '@/lib/hub/widgets/sun-calculator';
import '@/lib/hub/widgets/streak-counter';
import '@/lib/hub/widgets/daily-briefing';

describe('phase 18 — operational + nice-to-have widgets', () => {
  it('weather is universal personal', () => {
    expect(getWidget('weather')?.allowedRoles).toEqual([]);
    expect(getWidget('weather')?.category).toBe('personal');
  });
  it('mileage-tracker is operational', () => {
    expect(getWidget('mileage-tracker')?.category).toBe('operational');
  });
  it('sun-calculator is universal personal', () => {
    expect(getWidget('sun-calculator')?.allowedRoles).toEqual([]);
  });
  it('streak-counter is learning, student-or-teacher', () => {
    const def = getWidget('streak-counter');
    expect(def?.category).toBe('learning');
    expect(def?.allowedRoles).toContain('student');
  });
  it('daily-briefing is a wide personal composite', () => {
    const def = getWidget('daily-briefing');
    expect(def?.category).toBe('personal');
    expect(def?.defaultSize).toEqual({ w: 8, h: 3 });
  });
});
