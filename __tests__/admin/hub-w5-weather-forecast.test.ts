// __tests__/admin/hub-w5-weather-forecast.test.ts
//
// Slice W5 — weather widget shows a 5-day forecast at the
// large / xlarge size buckets, matching the user's "the larger
// the widget the more useful info it should show" spec.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildDailyForecast, toWeatherSnapshot } from '@/lib/weather/snapshot';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('buildDailyForecast (pure)', () => {
  it('folds the four daily arrays into a list of WeatherDay rows', () => {
    const out = buildDailyForecast({
      daily: {
        time: ['2026-06-18', '2026-06-19', '2026-06-20'],
        weather_code: [0, 3, 61],
        temperature_2m_max: [95, 92, 88],
        temperature_2m_min: [72, 70, 68],
      },
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ date: '2026-06-18', high_f: 95, low_f: 72, description: 'Clear sky', icon: '☀️' });
    expect(out[2].date).toBe('2026-06-20');
  });

  it('caps the list at 5 even when the upstream returns more days', () => {
    const out = buildDailyForecast({
      daily: {
        time: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'],
        weather_code: [0, 0, 0, 0, 0, 0, 0],
        temperature_2m_max: [1, 2, 3, 4, 5, 6, 7],
        temperature_2m_min: [0, 0, 0, 0, 0, 0, 0],
      },
    });
    expect(out).toHaveLength(5);
  });

  it("drops entries with a missing date or non-numeric hi/lo", () => {
    // Cast through unknown so the bad-shape values land cleanly
    // without the linter pruning the directive.
    const dailyShape = {
      time: ['', 'd2', 'd3'],
      weather_code: [0, 0, 0],
      temperature_2m_max: [Number.NaN, undefined as unknown as number, 90],
      temperature_2m_min: [60, 60, 70],
    };
    const out = buildDailyForecast({ daily: dailyShape });
    // 1st row has no date -> skipped. 2nd has hi=undefined -> skipped.
    // 3rd is valid.
    expect(out.map((d) => d.date)).toEqual(['d3']);
  });

  it('returns an empty array when the upstream omits the daily block', () => {
    expect(buildDailyForecast({})).toEqual([]);
  });
});

describe('toWeatherSnapshot — carries the daily strip', () => {
  it('passes a multi-day strip through', () => {
    const snap = toWeatherSnapshot({
      current: { temperature_2m: 75, weather_code: 0 },
      daily: {
        time: ['2026-06-18', '2026-06-19'],
        weather_code: [0, 3],
        temperature_2m_max: [95, 90],
        temperature_2m_min: [72, 68],
      },
    }, 'Central Texas');
    expect(snap).not.toBeNull();
    expect(snap!.daily).toHaveLength(2);
    expect(snap!.daily[1]).toEqual({ date: '2026-06-19', high_f: 90, low_f: 68, description: 'Overcast', icon: '☁️' });
  });
});

describe('weather widget — large/xlarge forecast strip (W5)', () => {
  const SRC = read('lib/hub/widgets/weather/index.tsx');

  it('declares the WeatherDay shape on the widget side', () => {
    expect(SRC).toMatch(/interface WeatherDay \{ date: string; high_f: number; low_f: number; description: string; icon: string; \}/);
  });

  it('renders the strip only when the bucket is large or xlarge AND the daily array has more than 1 entry', () => {
    expect(SRC).toMatch(/const showForecast = \(bucket === 'large' \|\| bucket === 'xlarge'\) && \(weather\.daily\?\.length \?\? 0\) > 1/);
  });

  it("slices today's row out of the strip so it shows the next 4 days", () => {
    expect(SRC).toMatch(/\(weather\.daily \?\? \[\]\)\.slice\(1, 5\)/);
  });

  it('renders an ul[data-testid="weather-forecast-strip"] for the source-lock', () => {
    expect(SRC).toMatch(/data-testid="weather-forecast-strip"/);
  });
});

describe('weather API — requests 5 days + daily weather_code (W5)', () => {
  const SRC = read('app/api/admin/weather/route.ts');

  it("the forecast URL now asks for forecast_days=5", () => {
    expect(SRC).toMatch(/forecast_days=5/);
  });

  it("the daily block now includes weather_code so the strip can pick an icon per day", () => {
    expect(SRC).toMatch(/daily=weather_code,temperature_2m_max,temperature_2m_min/);
  });
});
