// lib/weather/snapshot.ts
//
// hub-widget-excellence-15 — weather. Pure mapping from the Open-Meteo
// forecast response into the `WeatherSnapshot` shape the Weather widget
// renders. The endpoint fetches °F-unit data (current + daily hi/lo) and
// passes the parsed JSON + a resolved location label through here.
// Dependency-free → unit-tested in node.
//
// weather-icon-accuracy-2026-06-19 — both the current snapshot + each
// daily row now use `describeWeatherWithContext` so the icon reflects
// the actual probability + wind, not just the raw WMO code.

import { describeWeatherWithContext } from './wmo';

export interface WeatherSnapshot {
  temperature_f: number;
  description: string;
  icon: string;
  high_f: number;
  low_f: number;
  location_label: string;
  /** Slice W5 — daily forecast strip, surfaced by the widget at
   *  large / xlarge sizes. First entry mirrors today's high/low
   *  so the strip reads as "today + next N days." Empty when
   *  the upstream omits the daily block. */
  daily: WeatherDay[];
  /** weather-extras-2026-06-18 — "feels-like" / apparent
   *  temperature in °F. null when Open-Meteo omits it. */
  feels_like_f: number | null;
  /** Relative humidity 0–100 (%). null when omitted. */
  humidity_pct: number | null;
  /** Today's precipitation probability 0–100 (%). Read from
   *  the daily `precipitation_probability_max` array (first
   *  entry); falls back to null when omitted. */
  rain_chance_pct: number | null;
  /** weather-icon-accuracy-2026-06-19 — current sustained wind
   *  in mph. Used by the icon refinement + surfaced as a chip
   *  on the widget when notable. */
  wind_mph: number | null;
}

export interface WeatherDay {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  high_f: number;
  low_f: number;
  description: string;
  icon: string;
  /** weather-extras-2026-06-18 — per-day precipitation
   *  probability 0–100 (%). null when the daily block omits
   *  the precipitation_probability_max array. */
  rain_chance_pct: number | null;
  /** weather-icon-accuracy-2026-06-19 — per-day max wind in mph.
   *  Feeds the per-day icon refinement so a windy day shows
   *  the windy glyph in the strip too. */
  wind_mph: number | null;
}

/** Shape of the bits of the Open-Meteo `/v1/forecast` response we read.
 *  Everything is optional so a partial/garbled payload returns null
 *  rather than throwing. */
export interface OpenMeteoForecast {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    // weather-extras-2026-06-18 — apparent temperature + humidity.
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    // weather-icon-accuracy-2026-06-19 — current sustained wind.
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    // weather-extras-2026-06-18 — daily max precipitation probability.
    precipitation_probability_max?: number[];
    // weather-icon-accuracy-2026-06-19 — daily max wind speed.
    wind_speed_10m_max?: number[];
  };
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
  const high = forecast.daily?.temperature_2m_max?.[0];
  const low = forecast.daily?.temperature_2m_min?.[0];

  // weather-extras-2026-06-18 — surface feels-like / humidity /
  // today's rain chance. Each is independently nullable so a
  // partial Open-Meteo response stays renderable.
  const feels = forecast.current?.apparent_temperature;
  const hum = forecast.current?.relative_humidity_2m;
  const rain0 = forecast.daily?.precipitation_probability_max?.[0];
  // weather-icon-accuracy-2026-06-19 — surface wind for the
  // current snapshot + use it (alongside rain chance) to refine
  // the icon. The current `wind_speed_10m` wins; if absent, fall
  // back to today's daily max so a windy day still elevates the
  // glyph.
  const windCurrent = forecast.current?.wind_speed_10m;
  const windDailyMax = forecast.daily?.wind_speed_10m_max?.[0];
  const wind = typeof windCurrent === 'number' && Number.isFinite(windCurrent)
    ? windCurrent
    : (typeof windDailyMax === 'number' && Number.isFinite(windDailyMax) ? windDailyMax : null);

  const rainPct = typeof rain0 === 'number' && Number.isFinite(rain0) ? clampPct(rain0) : null;
  const look = describeWeatherWithContext(code, {
    rainChancePct: rainPct,
    windMph: wind,
  });

  return {
    temperature_f: temp,
    description: look.description,
    icon: look.icon,
    high_f: typeof high === 'number' ? high : temp,
    low_f: typeof low === 'number' ? low : temp,
    location_label: locationLabel,
    daily: buildDailyForecast(forecast),
    feels_like_f: typeof feels === 'number' && Number.isFinite(feels) ? feels : null,
    humidity_pct: typeof hum === 'number' && Number.isFinite(hum) ? clampPct(hum) : null,
    rain_chance_pct: rainPct,
    wind_mph: wind != null ? Math.round(wind) : null,
  };
}

/** Clamp 0–100 + round to int. Pure helper for percentage fields. */
function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Slice W5 — fold the four daily arrays (time / weather_code /
 *  hi / lo) into a list of WeatherDay rows. Drops entries that
 *  are missing a date or a hi/lo so a partial daily block
 *  doesn't surface garbage in the strip. Cap at 5 so the
 *  widget strip is bounded; the API requests `forecast_days=5`
 *  to match. */
export function buildDailyForecast(forecast: OpenMeteoForecast): WeatherDay[] {
  const times = forecast.daily?.time ?? [];
  const codes = forecast.daily?.weather_code ?? [];
  const highs = forecast.daily?.temperature_2m_max ?? [];
  const lows = forecast.daily?.temperature_2m_min ?? [];
  const rains = forecast.daily?.precipitation_probability_max ?? [];
  const winds = forecast.daily?.wind_speed_10m_max ?? [];
  const out: WeatherDay[] = [];
  const n = Math.min(5, times.length, highs.length, lows.length);
  for (let i = 0; i < n; i++) {
    const date = times[i];
    const hi = highs[i];
    const lo = lows[i];
    if (!date || typeof hi !== 'number' || typeof lo !== 'number') continue;
    const r = rains[i];
    const rainPct = typeof r === 'number' && Number.isFinite(r) ? clampPct(r) : null;
    const w = winds[i];
    const windMph = typeof w === 'number' && Number.isFinite(w) ? w : null;
    // weather-icon-accuracy-2026-06-19 — refine the per-day icon
    // off the per-day probability + wind, not just the WMO code.
    const look = describeWeatherWithContext(
      typeof codes[i] === 'number' ? codes[i] : -1,
      { rainChancePct: rainPct, windMph },
    );
    out.push({
      date,
      high_f: hi,
      low_f: lo,
      description: look.description,
      icon: look.icon,
      rain_chance_pct: rainPct,
      wind_mph: windMph != null ? Math.round(windMph) : null,
    });
  }
  return out;
}

