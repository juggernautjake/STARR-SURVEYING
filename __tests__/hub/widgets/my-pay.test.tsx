// __tests__/hub/widgets/my-pay.test.tsx
//
// Slice 96 — My Pay widget.
//
// Covers the pure formatter + stat helpers, registry round-trip, and
// the privacy mask. Network + session-dependent rendering is exercised
// in the Playwright E2E suite (the widget calls `useSession()` and
// `fetch()`).

import { describe, it, expect } from 'vitest';

import { getWidget } from '@/lib/hub/widget-registry';
import {
  ALL_MY_PAY_STATS,
  capForBucket,
  formatValue,
  isCurrencyStat,
  labelForStat,
  visibleStatsForBucket,
  type MyPayContent,
  type MyPayStat,
} from '@/lib/hub/widgets/my-pay';

describe('my-pay widget — registry', () => {
  it('registers under id "my-pay" in time-pay category', () => {
    const def = getWidget('my-pay');
    expect(def).toBeDefined();
    expect(def?.id).toBe('my-pay');
    expect(def?.category).toBe('time-pay');
    expect(def?.iconName).toBe('Wallet');
  });

  it('only paid roles can add it (admin, developer, field_crew, drawer, tech_support)', () => {
    const def = getWidget('my-pay');
    expect(def?.allowedRoles).toEqual([
      'admin', 'developer', 'field_crew', 'drawer', 'tech_support',
    ]);
  });

  it('default size matches planning doc (4×2, min 2×1, max 12×4)', () => {
    const def = getWidget('my-pay');
    expect(def?.defaultSize).toEqual({ w: 4, h: 2 });
    expect(def?.minSize).toEqual({ w: 2, h: 1 });
    expect(def?.maxSize).toEqual({ w: 12, h: 4 });
  });

  it('default content opts in to color amounts and out of privacy + updated footer', () => {
    const def = getWidget('my-pay');
    const c = def?.defaultContent as MyPayContent;
    expect(c.colorAmounts).toBe(true);
    expect(c.privacy).toBe(false);
    expect(c.showUpdated).toBe(false);
    expect(c.amountStyle).toBe('currency');
    expect(c.stats).toEqual([
      'hourly_rate', 'available_balance', 'total_earned', 'total_withdrawn',
    ]);
  });

  it('exposes a SettingsForm', () => {
    expect(getWidget('my-pay')?.SettingsForm).toBeDefined();
  });
});

describe('my-pay widget — capForBucket', () => {
  it('tiny → 1', () => { expect(capForBucket('tiny')).toBe(1); });
  it('small → 2', () => { expect(capForBucket('small')).toBe(2); });
  it('medium → 4', () => { expect(capForBucket('medium')).toBe(4); });
  it('large → 6', () => { expect(capForBucket('large')).toBe(6); });
  it('xlarge → 6 (no bigger than the catalog)', () => {
    expect(capForBucket('xlarge')).toBe(6);
  });
});

describe('my-pay widget — visibleStatsForBucket', () => {
  const stats: MyPayStat[] = [
    'hourly_rate', 'available_balance', 'total_earned', 'total_withdrawn',
  ];

  it('tiny shows only the first stat', () => {
    expect(visibleStatsForBucket(stats, 'tiny')).toEqual(['hourly_rate']);
  });

  it('small shows the first two stats', () => {
    expect(visibleStatsForBucket(stats, 'small')).toEqual(['hourly_rate', 'available_balance']);
  });

  it('medium shows up to 4 stats', () => {
    expect(visibleStatsForBucket(stats, 'medium')).toEqual(stats);
  });

  it('large / xlarge surface every selected stat', () => {
    expect(visibleStatsForBucket(ALL_MY_PAY_STATS as MyPayStat[], 'large')).toEqual(ALL_MY_PAY_STATS);
    expect(visibleStatsForBucket(ALL_MY_PAY_STATS as MyPayStat[], 'xlarge')).toEqual(ALL_MY_PAY_STATS);
  });

  it('preserves user order when capping', () => {
    const reordered: MyPayStat[] = ['total_earned', 'hourly_rate', 'available_balance'];
    expect(visibleStatsForBucket(reordered, 'small')).toEqual(['total_earned', 'hourly_rate']);
  });
});

describe('my-pay widget — isCurrencyStat', () => {
  it('classifies dollar fields as currency', () => {
    expect(isCurrencyStat('hourly_rate')).toBe(true);
    expect(isCurrencyStat('available_balance')).toBe(true);
    expect(isCurrencyStat('total_earned')).toBe(true);
    expect(isCurrencyStat('total_withdrawn')).toBe(true);
  });

  it('classifies categorical fields as non-currency', () => {
    expect(isCurrencyStat('salary_type')).toBe(false);
    expect(isCurrencyStat('pay_frequency')).toBe(false);
  });
});

describe('my-pay widget — labelForStat', () => {
  it('returns a human-readable label for every stat', () => {
    for (const s of ALL_MY_PAY_STATS) {
      const label = labelForStat(s);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain('_');
    }
  });
});

describe('my-pay widget — formatValue', () => {
  it('hourly_rate always renders as $XX.XX/hr', () => {
    expect(formatValue('hourly_rate', 22.5, 'currency')).toBe('$22.50/hr');
    expect(formatValue('hourly_rate', 35, 'compact')).toBe('$35.00/hr');
  });

  it('currency style: balances render with thousands separator + 2dp', () => {
    expect(formatValue('available_balance', 1234.5, 'currency')).toBe('$1,234.50');
    expect(formatValue('total_earned', 50000, 'currency')).toBe('$50,000.00');
  });

  it('compact style abbreviates ≥1k as $X.Xk', () => {
    expect(formatValue('available_balance', 1234.5, 'compact')).toBe('$1.2k');
    expect(formatValue('total_earned', 50000, 'compact')).toBe('$50.0k');
  });

  it('compact style still renders <1k as full currency', () => {
    expect(formatValue('available_balance', 999.99, 'compact')).toBe('$999.99');
  });

  it('non-currency stats render as their string value', () => {
    expect(formatValue('salary_type', 'hourly', 'currency')).toBe('hourly');
    expect(formatValue('pay_frequency', 'biweekly', 'compact')).toBe('biweekly');
  });

  it('non-finite numeric values fall back to em-dash', () => {
    expect(formatValue('available_balance', Number.NaN, 'currency')).toBe('—');
    expect(formatValue('total_earned', Number.POSITIVE_INFINITY, 'currency')).toBe('—');
  });

  it('accepts numeric strings the API may emit (NUMERIC columns)', () => {
    expect(formatValue('hourly_rate', '22.50' as unknown as number, 'currency')).toBe('$22.50/hr');
  });
});

describe('my-pay widget — ALL_MY_PAY_STATS exhaustiveness', () => {
  it('exposes every stat the widget knows about', () => {
    expect(ALL_MY_PAY_STATS).toEqual([
      'hourly_rate',
      'available_balance',
      'total_earned',
      'total_withdrawn',
      'salary_type',
      'pay_frequency',
    ]);
  });
});
