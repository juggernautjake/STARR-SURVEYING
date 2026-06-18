// __tests__/weather/weather.test.ts
//
// hub-widget-excellence-15 — weather. Locks the pure helpers behind the
// now-real Open-Meteo endpoint: WMO code → look, forecast → snapshot,
// geocoding hit → coordinates.

import { describe, it, expect } from 'vitest';
import { describeWeather } from '@/lib/weather/wmo';
import { toWeatherSnapshot } from '@/lib/weather/snapshot';
import { firstGeoPoint, DEFAULT_LOCATION } from '@/lib/weather/geocode';

describe('describeWeather (WMO codes)', () => {
  it('maps the common codes to description + icon', () => {
    expect(describeWeather(0)).toEqual({ description: 'Clear sky', icon: '☀️' });
    expect(describeWeather(3).description).toBe('Overcast');
    expect(describeWeather(63).description).toBe('Rain');
    expect(describeWeather(75).description).toBe('Snow');
    expect(describeWeather(95).description).toBe('Thunderstorm');
    expect(describeWeather(96).description).toBe('Thunderstorm with hail');
  });
  it('falls back for unknown codes', () => {
    expect(describeWeather(-1)).toEqual({ description: 'Unknown', icon: '☁️' });
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
    });
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
