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
    expect(out[0]).toEqual({
      date: '2026-06-18', high_f: 95, low_f: 72,
      description: 'Clear sky', icon: '☀️',
      // weather-extras-2026-06-18 — rain chance null when the
      // upstream omits precipitation_probability_max.
      rain_chance_pct: null,
      // weather-icon-accuracy-2026-06-19 — wind null when the
      // upstream omits wind_speed_10m_max.
      wind_mph: null,
    });
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
    expect(snap!.daily[1]).toEqual({
      date: '2026-06-19', high_f: 90, low_f: 68,
      description: 'Overcast', icon: '☁️',
      rain_chance_pct: null,
      // weather-icon-accuracy-2026-06-19 — wind null when the
      // upstream omits wind_speed_10m_max.
      wind_mph: null,
    });
  });
});

describe('weather widget — forecast strip threshold (W5 + weather-extras-2026-06-18)', () => {
  const SRC = read('lib/hub/widgets/weather/index.tsx');

  it('declares the WeatherDay shape on the widget side', () => {
    // weather-extras-2026-06-18 — multi-line shape now carries
    // the optional rain_chance_pct field. Match across lines.
    expect(SRC).toMatch(/interface WeatherDay \{[\s\S]*?rain_chance_pct\?: number \| null;[\s\S]*?\}/);
  });

  it('renders the strip at medium / large / xlarge once we have more than one day', () => {
    expect(SRC).toMatch(/const showForecast =\s*\n\s*\(bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'\)/);
    expect(SRC).toMatch(/&& \(weather\.daily\?\.length \?\? 0\) > 1/);
  });

  it("slices today's row out of the strip so it shows the next 4 days", () => {
    expect(SRC).toMatch(/\(weather\.daily \?\? \[\]\)\.slice\(1, 5\)/);
  });

  it('renders an ul[data-testid="weather-forecast-strip"] for the source-lock', () => {
    expect(SRC).toMatch(/data-testid="weather-forecast-strip"/);
  });

  it('weather-icon-accuracy-2026-06-19 — wind chip surfaces when wind ≥ chip threshold', () => {
    expect(SRC).toMatch(/data-testid="weather-extra-wind"/);
    expect(SRC).toMatch(/WIND_CHIP_THRESHOLD_MPH/);
  });

  it('weather-icon-accuracy-2026-06-19 — WeatherDay + WeatherSnapshot shapes carry wind_mph', () => {
    expect(SRC).toMatch(/interface WeatherDay \{[\s\S]*?wind_mph\?: number \| null;[\s\S]*?\}/);
    expect(SRC).toMatch(/interface WeatherSnapshot \{[\s\S]*?wind_mph\?: number \| null;[\s\S]*?\}/);
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

  it("weather-extras-2026-06-18 — daily block also requests precipitation_probability_max", () => {
    expect(SRC).toMatch(/daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max/);
  });

  it('weather-extras-2026-06-18 — current snapshot also fetches feels-like + humidity', () => {
    expect(SRC).toMatch(/current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code/);
  });

  it('weather-icon-accuracy-2026-06-19 — current snapshot also fetches wind_speed_10m', () => {
    expect(SRC).toMatch(/current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m/);
  });

  it('weather-icon-accuracy-2026-06-19 — daily block also requests wind_speed_10m_max', () => {
    expect(SRC).toMatch(/daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max/);
  });

  it('weather-icon-accuracy-2026-06-19 — explicitly asks for windspeed_unit=mph', () => {
    expect(SRC).toMatch(/windspeed_unit=mph/);
  });
});
