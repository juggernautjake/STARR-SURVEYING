// lib/weather/snapshot.ts
//
// hub-widget-excellence-15 — weather. Pure mapping from the Open-Meteo
// forecast response into the `WeatherSnapshot` shape the Weather widget
// renders. The endpoint fetches °F-unit data (current + daily hi/lo) and
// passes the parsed JSON + a resolved location label through here.
// Dependency-free → unit-tested in node.

import { describeWeather } from './wmo';

export interface WeatherSnapshot {
  temperature_f: number;
  description: string;
  icon: string;
  high_f: number;
  low_f: number;
  location_label: string;
}

/** Shape of the bits of the Open-Meteo `/v1/forecast` response we read.
 *  Everything is optional so a partial/garbled payload returns null
 *  rather than throwing. */
export interface OpenMeteoForecast {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
}

/**
 * Build a WeatherSnapshot from an Open-Meteo forecast payload. Returns
 * null when the essential current-temperature field is missing (the
 * endpoint then answers 204 and the widget shows its graceful empty
 * state). High/low fall back to the current temp when the daily block is
 * absent.
 */
export function toWeatherSnapshot(
  forecast: OpenMeteoForecast,
  locationLabel: string,
): WeatherSnapshot | null {
  const temp = forecast.current?.temperature_2m;
  if (typeof temp !== 'number' || Number.isNaN(temp)) return null;

  const code = forecast.current?.weather_code ?? -1;
  const look = describeWeather(code);
  const high = forecast.daily?.temperature_2m_max?.[0];
  const low = forecast.daily?.temperature_2m_min?.[0];

  return {
    temperature_f: temp,
    description: look.description,
    icon: look.icon,
    high_f: typeof high === 'number' ? high : temp,
    low_f: typeof low === 'number' ? low : temp,
    location_label: locationLabel,
  };
}
