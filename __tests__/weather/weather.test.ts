// __tests__/weather/weather.test.ts
//
// hub-widget-excellence-15 — weather. Locks the pure helpers behind the
// now-real Open-Meteo endpoint: WMO code → look, forecast → snapshot,
// geocoding hit → coordinates.

import { describe, it, expect } from 'vitest';
import {
  describeWeather,
  describeWeatherWithContext,
  RAIN_LIKELY_THRESHOLD_PCT,
  RAIN_SUBSTANTIAL_THRESHOLD_PCT,
  WIND_NOTABLE_MPH,
  WIND_DOMINANT_MPH,
} from '@/lib/weather/wmo';
import { toWeatherSnapshot } from '@/lib/weather/snapshot';
import { firstGeoPoint, DEFAULT_LOCATION } from '@/lib/weather/geocode';

describe('describeWeather (WMO codes)', () => {
  it('maps the common codes to description + icon', () => {
    expect(describeWeather(0)).toEqual({ description: 'Clear sky', icon: '☀️' });
    expect(describeWeather(3).description).toBe('Overcast');
    expect(describeWeather(63).description).toBe('Rain');
    // weather-severity-2026-06-19 — 71-73 stay generic "Snow",
    // 75 splits to "Heavy snow", 77 to "Snow grains".
    expect(describeWeather(71).description).toBe('Snow');
    expect(describeWeather(75).description).toBe('Heavy snow');
    expect(describeWeather(95).description).toBe('Thunderstorm');
    expect(describeWeather(96).description).toBe('Thunderstorm with hail');
  });
  it('falls back for unknown codes', () => {
    expect(describeWeather(-1)).toEqual({ description: 'Unknown', icon: '☁️' });
  });
});

// weather-icon-accuracy-2026-06-19 — refinement against probability + wind.
describe('describeWeatherWithContext (icon accuracy)', () => {
  it('publishes the canonical thresholds', () => {
    expect(RAIN_LIKELY_THRESHOLD_PCT).toBe(25);
    expect(RAIN_SUBSTANTIAL_THRESHOLD_PCT).toBe(50);
    expect(WIND_NOTABLE_MPH).toBe(20);
    expect(WIND_DOMINANT_MPH).toBe(30);
  });

  it('downgrades a low-probability rain showers code to partly cloudy', () => {
    // 4% chance of "Slight rain showers" (80) — exactly the bug
    // the user reported.
    expect(describeWeatherWithContext(80, { rainChancePct: 4 }))
      .toEqual({ description: 'Partly cloudy', icon: '⛅' });
  });

  it('downgrades a low-probability drizzle code to mainly clear', () => {
    expect(describeWeatherWithContext(51, { rainChancePct: 10 }))
      .toEqual({ description: 'Mainly clear', icon: '🌤️' });
  });

  it('downgrades a low-probability steady-rain code to cloudy', () => {
    expect(describeWeatherWithContext(63, { rainChancePct: 15 }))
      .toEqual({ description: 'Cloudy', icon: '☁️' });
  });

  it('shows "Possible showers" at the medium probability band', () => {
    expect(describeWeatherWithContext(80, { rainChancePct: 35 }))
      .toEqual({ description: 'Possible showers', icon: '🌦️' });
  });

  it('keeps the original rain icon at high probability', () => {
    expect(describeWeatherWithContext(63, { rainChancePct: 80 }).icon).toBe('🌧️');
  });

  it('never downgrades snow / fog / thunder (those codes are decisive)', () => {
    // 71 stays generic "Snow"; 75 is now "Heavy snow" per the
    // P22 split — both retain their snow glyph regardless of rain%.
    expect(describeWeatherWithContext(71, { rainChancePct: 5 }).description).toBe('Snow');
    expect(describeWeatherWithContext(75, { rainChancePct: 5 }).description).toBe('Heavy snow');
    expect(describeWeatherWithContext(45, { rainChancePct: 5 }).description).toBe('Fog');
    expect(describeWeatherWithContext(95, { rainChancePct: 5 }).description).toBe('Thunderstorm');
    expect(describeWeatherWithContext(96, { rainChancePct: 5 }).description).toBe('Thunderstorm with hail');
  });

  it('elevates high wind + cloudy code to windy', () => {
    expect(describeWeatherWithContext(3, { windMph: 35 }))
      .toEqual({ description: 'Windy', icon: '🌬️' });
  });

  it('elevates high wind + partly cloudy code to windy', () => {
    expect(describeWeatherWithContext(2, { windMph: 30 }).icon).toBe('🌬️');
  });

  it('shows "Windy + clear" at notable wind with a clear-sky code', () => {
    expect(describeWeatherWithContext(0, { windMph: 22 })).toEqual({
      description: 'Windy + clear',
      icon: '🌬️',
    });
  });

  it('keeps a calm clear day clear (no false windy elevation)', () => {
    expect(describeWeatherWithContext(0, { windMph: 5 }).icon).toBe('☀️');
    expect(describeWeatherWithContext(0, {}).icon).toBe('☀️');
  });

  it('null / missing context leaves the base look unchanged', () => {
    expect(describeWeatherWithContext(80, {}).icon).toBe('🌦️');
    expect(describeWeatherWithContext(80, { rainChancePct: null }).icon).toBe('🌦️');
  });

  it('windy applies after the rain downgrade — low-rain + high-wind cloudy day → windy', () => {
    // Code says rain showers (80), but probability is 4% AND
    // wind is 30 mph. First the rain code downgrades to partly
    // cloudy; then wind elevates it to windy.
    expect(describeWeatherWithContext(80, { rainChancePct: 4, windMph: 35 }).icon).toBe('🌬️');
  });
});

describe('toWeatherSnapshot', () => {
  const forecast = {
    current: { temperature_2m: 71.7, weather_code: 0 },
    daily: { temperature_2m_max: [90], temperature_2m_min: [71] },
  };

  it('maps an Open-Meteo forecast into the widget snapshot', () => {
    // Slice W5 added `daily` — the fixture has a one-day daily
    // block with no `time` so buildDailyForecast returns [].
    expect(toWeatherSnapshot(forecast, 'Central Texas')).toEqual({
      temperature_f: 71.7,
      description: 'Clear sky',
      icon: '☀️',
      high_f: 90,
      low_f: 71,
      location_label: 'Central Texas',
      daily: [],
      // weather-extras-2026-06-18 — all three extras null when
      // the fixture doesn't carry the corresponding fields.
      feels_like_f: null,
      humidity_pct: null,
      rain_chance_pct: null,
      // weather-icon-accuracy-2026-06-19 — wind null when omitted.
      wind_mph: null,
    });
  });

  it('weather-icon-accuracy-2026-06-19 — refines a low-rain showers code to partly cloudy in the snapshot', () => {
    const partlyCloudyDay = {
      current: { temperature_2m: 78, weather_code: 80 },
      daily: {
        time: ['2026-06-19'],
        weather_code: [80],
        temperature_2m_max: [88],
        temperature_2m_min: [70],
        precipitation_probability_max: [4],
      },
    };
    const snap = toWeatherSnapshot(partlyCloudyDay, 'Austin');
    expect(snap?.icon).toBe('⛅');
    expect(snap?.description).toBe('Partly cloudy');
    expect(snap?.daily[0].icon).toBe('⛅');
    expect(snap?.daily[0].rain_chance_pct).toBe(4);
  });

  it('weather-icon-accuracy-2026-06-19 — surfaces wind_mph + elevates the icon when wind is high', () => {
    const windyDay = {
      current: { temperature_2m: 65, weather_code: 3, wind_speed_10m: 32.4 },
      daily: {
        time: ['2026-06-19'],
        weather_code: [3],
        temperature_2m_max: [70],
        temperature_2m_min: [55],
        wind_speed_10m_max: [38.9],
      },
    };
    const snap = toWeatherSnapshot(windyDay, 'Cheyenne');
    expect(snap?.icon).toBe('🌬️');
    expect(snap?.description).toBe('Windy');
    expect(snap?.wind_mph).toBe(32); // current rounded
    expect(snap?.daily[0].wind_mph).toBe(39); // daily max rounded
    expect(snap?.daily[0].icon).toBe('🌬️');
  });

  it('weather-extras-2026-06-18 — surfaces feels-like / humidity / rain chance when present', () => {
    const full = {
      current: {
        temperature_2m: 80,
        weather_code: 0,
        apparent_temperature: 84.4,
        relative_humidity_2m: 62.7,
      },
      daily: {
        time: ['2026-06-18'],
        weather_code: [0],
        temperature_2m_max: [95],
        temperature_2m_min: [72],
        precipitation_probability_max: [40.6],
      },
    };
    const snap = toWeatherSnapshot(full, 'Austin');
    expect(snap).toMatchObject({
      feels_like_f: 84.4,
      // clamped + rounded to int.
      humidity_pct: 63,
      rain_chance_pct: 41,
    });
    expect(snap!.daily[0].rain_chance_pct).toBe(41);
    // weather-icon-accuracy-2026-06-19 — 41% rain on a "Slight rain
    // showers" code (no, this fixture has code=0). Either way the
    // wind is unset → wind_mph is null.
    expect(snap!.wind_mph).toBeNull();
    expect(snap!.daily[0].wind_mph).toBeNull();
  });

  it('falls back hi/lo to the current temp when the daily block is missing', () => {
    const snap = toWeatherSnapshot({ current: { temperature_2m: 60, weather_code: 2 } }, 'X');
    expect(snap).toMatchObject({ temperature_f: 60, high_f: 60, low_f: 60, description: 'Partly cloudy' });
  });

  it('returns null when the current temperature is absent (endpoint then 204s)', () => {
    expect(toWeatherSnapshot({}, 'X')).toBeNull();
    expect(toWeatherSnapshot({ current: {} }, 'X')).toBeNull();
  });
});

describe('firstGeoPoint', () => {
  it('picks the first hit with coordinates + labels it with the ZIP', () => {
    const geo = { results: [{ latitude: 30.27, longitude: -97.74, name: 'Austin', admin1: 'Texas', postcodes: ['78701'] }] };
    expect(firstGeoPoint(geo, '78701')).toEqual({ latitude: 30.27, longitude: -97.74, label: 'Austin, Texas 78701' });
  });
  it('returns null when no hit carries coordinates', () => {
    expect(firstGeoPoint({ results: [{ name: 'Nowhere' }] }, '00000')).toBeNull();
    expect(firstGeoPoint({}, '00000')).toBeNull();
  });
  it('exposes a Central-Texas default', () => {
    expect(DEFAULT_LOCATION).toMatchObject({ latitude: 31.0698, longitude: -97.3536, label: 'Central Texas' });
  });
});
