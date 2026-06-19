// __tests__/weather/severity.test.ts
//
// weather-severity-2026-06-19 — locks the per-day severity engine,
// the hover tooltip builder, the freezing-precipitation icons, the
// snapshot mapper's new daily fields, the API request additions, and
// the widget's per-card tooltip + severity badge.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { describeWeather } from '@/lib/weather/wmo';
import {
  buildDayTooltip,
  computeDaySeverity,
  formatDayName,
  HEAT_WAVE_HIGH_F,
  HEAT_WAVE_FEELS_F,
  HARD_FREEZE_LOW_F,
  FREEZE_LOW_F,
  HIGH_WIND_SUSTAINED_MPH,
  HIGH_WIND_GUST_MPH,
} from '@/lib/weather/severity';
import { toWeatherSnapshot } from '@/lib/weather/snapshot';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('describeWeather — freezing precipitation icons', () => {
  it('splits freezing drizzle (56/57) out of the plain drizzle band', () => {
    expect(describeWeather(56)).toEqual({ description: 'Freezing drizzle', icon: '🧊' });
    expect(describeWeather(57)).toEqual({ description: 'Freezing drizzle', icon: '🧊' });
  });

  it('splits freezing rain (66/67) out of the plain rain band', () => {
    expect(describeWeather(66)).toEqual({ description: 'Freezing rain', icon: '🧊' });
    expect(describeWeather(67)).toEqual({ description: 'Freezing rain', icon: '🧊' });
  });

  it('non-freezing drizzle / rain bands stay unchanged', () => {
    expect(describeWeather(51).icon).toBe('🌦️');
    expect(describeWeather(55).icon).toBe('🌦️');
    expect(describeWeather(61).icon).toBe('🌧️');
    expect(describeWeather(65).icon).toBe('🌧️');
  });

  it('splits heavy snow + snow grains for clearer copy', () => {
    expect(describeWeather(75)).toEqual({ description: 'Heavy snow', icon: '❄️' });
    expect(describeWeather(77)).toEqual({ description: 'Snow grains', icon: '🌨️' });
    expect(describeWeather(71).description).toBe('Snow');
    expect(describeWeather(73).description).toBe('Snow');
  });
});

describe('computeDaySeverity thresholds publish canonical numbers', () => {
  it('exposes the documented thresholds', () => {
    expect(HEAT_WAVE_HIGH_F).toBe(100);
    expect(HEAT_WAVE_FEELS_F).toBe(105);
    expect(HARD_FREEZE_LOW_F).toBe(20);
    expect(FREEZE_LOW_F).toBe(32);
    expect(HIGH_WIND_SUSTAINED_MPH).toBe(40);
    expect(HIGH_WIND_GUST_MPH).toBe(50);
  });
});

describe('computeDaySeverity (priority order)', () => {
  it('tornado risk wins when severe storm + high gusts', () => {
    const s = computeDaySeverity({ code: 96, high_f: 80, low_f: 60, wind_gust_mph: 60 });
    expect(s?.kind).toBe('tornado_risk');
    expect(s?.icon).toBe('🌪️');
  });

  it('severe storm without high gusts → severe_storm (not tornado)', () => {
    expect(computeDaySeverity({ code: 95 })?.kind).toBe('severe_storm');
  });

  it('ice warning fires on a freezing precip code regardless of probability', () => {
    expect(computeDaySeverity({ code: 66, rain_chance_pct: 4 })?.kind).toBe('ice_warning');
  });

  it('ice warning fires on a sub-freezing low + meaningful rain chance', () => {
    const s = computeDaySeverity({ code: 3, low_f: 28, rain_chance_pct: 40 });
    expect(s?.kind).toBe('ice_warning');
  });

  it('low rain chance + cold low does NOT trigger ice', () => {
    expect(computeDaySeverity({ code: 3, low_f: 28, rain_chance_pct: 10 })?.kind).not.toBe('ice_warning');
  });

  it('hard freeze at 20°F and below', () => {
    expect(computeDaySeverity({ low_f: 20 })?.kind).toBe('hard_freeze');
    expect(computeDaySeverity({ low_f: 5 })?.icon).toBe('🥶');
  });

  it('regular freeze warning between 21 and 32', () => {
    expect(computeDaySeverity({ low_f: 30 })?.kind).toBe('freeze');
    expect(computeDaySeverity({ low_f: 33 })).toBeNull();
  });

  it('high wind on sustained ≥ 40 mph OR gusts ≥ 50 mph', () => {
    expect(computeDaySeverity({ code: 3, wind_mph: 42 })?.kind).toBe('high_wind');
    expect(computeDaySeverity({ code: 3, wind_gust_mph: 55 })?.kind).toBe('high_wind');
    expect(computeDaySeverity({ code: 3, wind_mph: 30, wind_gust_mph: 40 })).toBeNull();
  });

  it('heat wave on air ≥ 100°F OR feels-like ≥ 105°F', () => {
    expect(computeDaySeverity({ code: 0, high_f: 102 })?.kind).toBe('heat_wave');
    expect(computeDaySeverity({ code: 0, high_f: 90, feels_like_max_f: 108 })?.kind).toBe('heat_wave');
    expect(computeDaySeverity({ code: 0, high_f: 95, feels_like_max_f: 99 })).toBeNull();
  });

  it('returns null for a benign mid-summer day', () => {
    expect(computeDaySeverity({
      code: 2, high_f: 85, low_f: 65,
      feels_like_max_f: 88, humidity_max_pct: 55,
      rain_chance_pct: 15, wind_mph: 10, wind_gust_mph: 18,
    })).toBeNull();
  });
});

describe('formatDayName + buildDayTooltip (pure)', () => {
  it('formatDayName produces the weekday from a YYYY-MM-DD', () => {
    // 2026-06-19 is a Friday (UTC).
    expect(formatDayName('2026-06-19')).toBe('Friday');
    expect(formatDayName('not-a-date')).toBe('not-a-date');
    expect(formatDayName('')).toBe('');
  });

  it('multi-line tooltip carries weekday + description + temps + humidity + rain + wind', () => {
    const t = buildDayTooltip({
      date: '2026-06-19',
      description: 'Partly cloudy',
      code: 2,
      high_f: 88,
      low_f: 72,
      feels_like_max_f: 92,
      humidity_max_pct: 60,
      rain_chance_pct: 12,
      wind_mph: 8,
      wind_gust_mph: 18,
    });
    expect(t).toContain('Friday — Partly cloudy');
    expect(t).toContain('H 88° / L 72° (feels like 92°)');
    expect(t).toContain('60% humidity · 12% chance of rain');
    expect(t).toContain('Wind 8 mph (gusts 18)');
    // Benign day → no severity line.
    expect(t).not.toContain('⚠');
  });

  it('severity line is appended when applicable', () => {
    const t = buildDayTooltip({
      date: '2026-07-04',
      description: 'Clear sky',
      code: 0,
      high_f: 104,
      low_f: 80,
      feels_like_max_f: 110,
      humidity_max_pct: 70,
      rain_chance_pct: 0,
      wind_mph: 8,
      wind_gust_mph: 12,
    });
    expect(t).toContain('⚠ Heat wave');
    expect(t.toLowerCase()).toContain('hydrate');
  });

  it('gracefully omits missing rows', () => {
    const t = buildDayTooltip({ date: '2026-06-19', description: 'Sunny', code: 0, high_f: 80, low_f: 60 });
    expect(t).toContain('H 80° / L 60°');
    expect(t).not.toContain('humidity');
    expect(t).not.toContain('Wind');
  });
});

describe('toWeatherSnapshot folds the new daily severity fields through', () => {
  it('surfaces gusts + feels-like + humidity on each daily row', () => {
    const snap = toWeatherSnapshot({
      current: { temperature_2m: 95, weather_code: 0 },
      daily: {
        time: ['2026-07-04'],
        weather_code: [0],
        temperature_2m_max: [104],
        temperature_2m_min: [80],
        precipitation_probability_max: [0],
        wind_speed_10m_max: [10.2],
        wind_gusts_10m_max: [17.6],
        apparent_temperature_max: [108.4],
        apparent_temperature_min: [82.1],
        relative_humidity_2m_max: [72.5],
      },
    }, 'Houston');
    const day = snap!.daily[0];
    expect(day.code).toBe(0);
    expect(day.wind_mph).toBe(10);
    expect(day.wind_gust_mph).toBe(18);
    expect(day.feels_like_max_f).toBe(108.4);
    expect(day.feels_like_min_f).toBe(82.1);
    expect(day.humidity_max_pct).toBe(73);
  });

  it('per-day icon picks up the freezing-precip glyph', () => {
    const snap = toWeatherSnapshot({
      current: { temperature_2m: 30, weather_code: 67 },
      daily: {
        time: ['2026-12-21'],
        weather_code: [67],
        temperature_2m_max: [34],
        temperature_2m_min: [22],
        precipitation_probability_max: [90],
      },
    }, 'Dallas');
    expect(snap!.daily[0].icon).toBe('🧊');
    expect(snap!.daily[0].description).toBe('Freezing rain');
  });
});

describe('weather API requests the severity-relevant daily fields', () => {
  const SRC = read('app/api/admin/weather/route.ts');

  it('daily block now requests wind_gusts_10m_max', () => {
    expect(SRC).toMatch(/wind_gusts_10m_max/);
  });

  it('daily block now requests apparent_temperature_max + _min', () => {
    expect(SRC).toMatch(/apparent_temperature_max/);
    expect(SRC).toMatch(/apparent_temperature_min/);
  });

  it('daily block now requests relative_humidity_2m_max', () => {
    expect(SRC).toMatch(/relative_humidity_2m_max/);
  });
});

describe('weather widget renders the per-day tooltip + severity badge', () => {
  const SRC = read('lib/hub/widgets/weather/index.tsx');

  it('imports the severity helpers', () => {
    expect(SRC).toMatch(/import \{ buildDayTooltip, computeDaySeverity \} from '@\/lib\/weather\/severity'/);
  });

  it('every daily card has a tooltip title with the full forecast text', () => {
    // Match the `title={tooltip}` attribute on the <li>.
    expect(SRC).toMatch(/title={tooltip}/);
    expect(SRC).toMatch(/aria-label={tooltip}/);
  });

  it('each daily card is keyboard-focusable so the tooltip is reachable', () => {
    expect(SRC).toMatch(/tabIndex={0}/);
  });

  it('severity badge renders with a per-kind testid + the canonical icon', () => {
    expect(SRC).toMatch(/data-testid={`weather-day-severity-\$\{severity\.kind\}`}/);
  });

  it('cards with a severity expose the kind via data-severity so styling can react', () => {
    expect(SRC).toMatch(/data-severity={severity\?\.kind \?\? ''}/);
  });
});
