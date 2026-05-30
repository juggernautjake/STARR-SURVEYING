// __tests__/hub/widget-config-render-utility-family.test.ts
//
// Slice 15c of employee-hub-overhaul-2026-05-30.md. Locks the
// content → render wiring for the final three schema-source widgets:
//   - daily-briefing   (showWeather, showSchedule, maxJobs)
//   - monthly-revenue  (period, showTrend, showComparison)
//   - sun-calculator   (latitude, longitude, units, showTwilight)
//
// Pure-unit assertions on each widget's exported resolvers + helpers
// (buildSunQuery, formatTime, PERIOD_LABEL).

import { describe, it, expect } from 'vitest';
import { getWidgetOptionsEntry } from '@/lib/hub/widget-options';

import * as DailyBriefing  from '@/lib/hub/widgets/daily-briefing';
import * as MonthlyRevenue from '@/lib/hub/widgets/monthly-revenue';
import * as SunCalculator  from '@/lib/hub/widgets/sun-calculator';

function schemaFieldsByKey(widgetId: string): Map<string, { type: string }> {
  const entry = getWidgetOptionsEntry(widgetId);
  if (entry.source !== 'schema') return new Map();
  return new Map(entry.fields.map((f) => [f.key, { type: f.type }]));
}

describe('Slice 15c — daily-briefing', () => {
  it('schema declares showWeather + showSchedule + maxJobs', () => {
    const fields = schemaFieldsByKey('daily-briefing');
    expect(fields.get('showWeather')?.type).toBe('toggle');
    expect(fields.get('showSchedule')?.type).toBe('toggle');
    expect(fields.get('maxJobs')?.type).toBe('number');
  });

  it('toggles default true so the existing 4-section layout is unchanged', () => {
    expect(DailyBriefing.resolveShowWeather({})).toBe(true);
    expect(DailyBriefing.resolveShowSchedule({})).toBe(true);
  });

  it('toggles flip when explicitly set false', () => {
    expect(DailyBriefing.resolveShowWeather({ showWeather: false })).toBe(false);
    expect(DailyBriefing.resolveShowSchedule({ showSchedule: false })).toBe(false);
  });

  it('resolveMaxJobs clamps to [1, 10] then falls back to 3', () => {
    expect(DailyBriefing.resolveMaxJobs({ maxJobs: 5 })).toBe(5);
    expect(DailyBriefing.resolveMaxJobs({ maxJobs: 11 })).toBe(3);
    expect(DailyBriefing.resolveMaxJobs({ maxJobs: 0 })).toBe(3);
    expect(DailyBriefing.resolveMaxJobs({})).toBe(3);
  });
});

describe('Slice 15c — monthly-revenue', () => {
  it('schema declares period + showTrend + showComparison', () => {
    const fields = schemaFieldsByKey('monthly-revenue');
    expect(fields.get('period')?.type).toBe('select');
    expect(fields.get('showTrend')?.type).toBe('toggle');
    expect(fields.get('showComparison')?.type).toBe('toggle');
  });

  it('schema period options match resolver acceptance', () => {
    const entry = getWidgetOptionsEntry('monthly-revenue');
    if (entry.source !== 'schema') return;
    const period = entry.fields.find((f) => f.key === 'period');
    if (!period || period.type !== 'select') return;
    expect(period.options.map((o) => o.value).sort()).toEqual(['month', 'quarter', 'year']);
  });

  it('resolvePeriod passes through known + falls back on bad input', () => {
    expect(MonthlyRevenue.resolvePeriod({ period: 'quarter' })).toBe('quarter');
    expect(MonthlyRevenue.resolvePeriod({ period: 'year' })).toBe('year');
    expect(MonthlyRevenue.resolvePeriod({ period: 'decade' as MonthlyRevenue.RevenuePeriod })).toBe('month');
    expect(MonthlyRevenue.resolvePeriod({})).toBe('month');
  });

  it('PERIOD_LABEL covers every period with ytd + vs strings', () => {
    expect(MonthlyRevenue.PERIOD_LABEL.month).toEqual({ ytd: 'Month-to-date',   vs: 'vs last month' });
    expect(MonthlyRevenue.PERIOD_LABEL.quarter).toEqual({ ytd: 'Quarter-to-date', vs: 'vs last quarter' });
    expect(MonthlyRevenue.PERIOD_LABEL.year).toEqual({ ytd: 'Year-to-date',    vs: 'vs last year' });
  });

  it('showTrend + showComparison default true', () => {
    expect(MonthlyRevenue.resolveShowTrend({})).toBe(true);
    expect(MonthlyRevenue.resolveShowComparison({})).toBe(true);
  });

  it('toggles flip when explicit', () => {
    expect(MonthlyRevenue.resolveShowTrend({ showTrend: false })).toBe(false);
    expect(MonthlyRevenue.resolveShowComparison({ showComparison: false })).toBe(false);
  });
});

describe('Slice 15c — sun-calculator', () => {
  it('schema declares latitude + longitude + units + showTwilight', () => {
    const fields = schemaFieldsByKey('sun-calculator');
    expect(fields.get('latitude')?.type).toBe('text');
    expect(fields.get('longitude')?.type).toBe('text');
    expect(fields.get('units')?.type).toBe('select');
    expect(fields.get('showTwilight')?.type).toBe('toggle');
  });

  it('schema units options match resolver acceptance', () => {
    const entry = getWidgetOptionsEntry('sun-calculator');
    if (entry.source !== 'schema') return;
    const units = entry.fields.find((f) => f.key === 'units');
    if (!units || units.type !== 'select') return;
    expect(units.options.map((o) => o.value).sort()).toEqual(['local', 'utc']);
  });

  it('resolveLatitude / Longitude trim strings, default to empty', () => {
    expect(SunCalculator.resolveLatitude({ latitude: '  43.6150  ' })).toBe('43.6150');
    expect(SunCalculator.resolveLongitude({ longitude: '-116.2023' })).toBe('-116.2023');
    expect(SunCalculator.resolveLatitude({})).toBe('');
    expect(SunCalculator.resolveLongitude({ longitude: 42 as unknown as string })).toBe('');
  });

  it('resolveUnits defaults to "local"; unknown falls back', () => {
    expect(SunCalculator.resolveUnits({ units: 'utc' })).toBe('utc');
    expect(SunCalculator.resolveUnits({ units: 'gmt' as SunCalculator.SunUnits })).toBe('local');
    expect(SunCalculator.resolveUnits({})).toBe('local');
  });

  it('resolveShowTwilight defaults to false', () => {
    expect(SunCalculator.resolveShowTwilight({})).toBe(false);
    expect(SunCalculator.resolveShowTwilight({ showTwilight: true })).toBe(true);
  });

  it('buildSunQuery composes ?lat=&lng= when set, "" otherwise', () => {
    expect(SunCalculator.buildSunQuery('', '')).toBe('');
    expect(SunCalculator.buildSunQuery('43.6', '')).toBe('?lat=43.6');
    expect(SunCalculator.buildSunQuery('', '-116.2')).toBe('?lng=-116.2');
    expect(SunCalculator.buildSunQuery('43.6', '-116.2')).toBe('?lat=43.6&lng=-116.2');
  });

  it('formatTime appends " UTC" only when units=utc', () => {
    expect(SunCalculator.formatTime('6:32 AM', 'local')).toBe('6:32 AM');
    expect(SunCalculator.formatTime('6:32 AM', 'utc')).toBe('6:32 AM UTC');
  });
});
