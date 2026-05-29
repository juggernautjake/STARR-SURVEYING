// __tests__/hub/widgets/pto-balance.test.ts
//
// Slice 112 — PTO Balance widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  capForBucket,
  formatAccrual,
  formatBalance,
} from '@/lib/hub/widgets/pto-balance';

describe('pto-balance widget — registry', () => {
  it('registers under id "pto-balance" in time-pay category', () => {
    const def = getWidget('pto-balance');
    expect(def).toBeDefined();
    expect(def?.category).toBe('time-pay');
    expect(def?.iconName).toBe('Palmtree');
  });

  it('only internal roles can add it', () => {
    const def = getWidget('pto-balance');
    expect(def?.allowedRoles).toEqual([
      'admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support',
    ]);
  });

  it('default size 4×2, min 2×1, max 8×4', () => {
    const def = getWidget('pto-balance');
    expect(def?.defaultSize).toEqual({ w: 4, h: 2 });
    expect(def?.minSize).toEqual({ w: 2, h: 1 });
    expect(def?.maxSize).toEqual({ w: 8, h: 4 });
  });

  it('default content opts in to history + hours format', () => {
    const def = getWidget('pto-balance');
    const c = def?.defaultContent as { showHistory: boolean; format: string; hoursPerDay: number };
    expect(c.showHistory).toBe(true);
    expect(c.format).toBe('hours');
    expect(c.hoursPerDay).toBe(8);
  });
});

describe('pto-balance — capForBucket', () => {
  it('tiny + small hide history (cap 0)', () => {
    expect(capForBucket('tiny')).toBe(0);
    expect(capForBucket('small')).toBe(0);
  });
  it('medium → 3 history rows', () => { expect(capForBucket('medium')).toBe(3); });
  it('large → 6', () => { expect(capForBucket('large')).toBe(6); });
  it('xlarge → 12', () => { expect(capForBucket('xlarge')).toBe(12); });
});

describe('pto-balance — formatBalance', () => {
  it('hours format always renders Xh with 1 decimal', () => {
    expect(formatBalance(24, 'hours', 8)).toBe('24.0h');
    expect(formatBalance(12.5, 'hours', 8)).toBe('12.5h');
  });

  it('days format divides hours by hoursPerDay', () => {
    expect(formatBalance(24, 'days', 8)).toBe('3.0d');
    expect(formatBalance(40, 'days', 8)).toBe('5.0d');
  });

  it('days format with hoursPerDay=0 falls back to hours', () => {
    expect(formatBalance(24, 'days', 0)).toBe('24.0h');
  });

  it('non-finite numerics render as em-dash', () => {
    expect(formatBalance(Number.NaN, 'hours', 8)).toBe('—');
  });
});

describe('pto-balance — formatAccrual', () => {
  it('biweekly translates to "every 2 weeks"', () => {
    expect(formatAccrual(3.08, 'biweekly', 'hours', 8)).toContain('every 2 weeks');
  });

  it('monthly translates to "per month"', () => {
    expect(formatAccrual(6.67, 'monthly', 'hours', 8)).toContain('per month');
  });

  it('weekly translates to "per week"', () => {
    expect(formatAccrual(1.54, 'weekly', 'hours', 8)).toContain('per week');
  });

  it('unknown period passes through with "per X"', () => {
    expect(formatAccrual(10, 'quarterly', 'hours', 8)).toContain('per quarterly');
  });

  it('days format applies the conversion', () => {
    const out = formatAccrual(8, 'biweekly', 'days', 8);
    expect(out).toContain('1.0d');
  });
});
