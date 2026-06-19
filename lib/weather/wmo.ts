// lib/weather/wmo.ts
//
// hub-widget-excellence-15 — weather. Pure mapping of WMO weather codes
// (the World Meteorological Organization code Open-Meteo returns in
// `current.weather_code`) to a short description + an emoji icon for the
// widget. Dependency-free → unit-tested in node.
//
// weather-icon-accuracy-2026-06-19 — `describeWeatherWithContext` adds
// a second pass that cross-checks the WMO code against the actual
// precipitation probability + wind speed. Open-Meteo's daily
// `weather_code` reports the most representative condition, so a low-
// probability "rain showers" code (~4%) still rendered as 🌦️ even when
// the day was clearly cloudy or windy. This refinement:
//   - downgrades precipitation codes when the rain_chance is below
//     thresholds (<25% → "what you actually see", <50% → "possible
//     showers")
//   - elevates a "Windy" icon when the wind is high AND the underlying
//     condition is otherwise mild
//
// Ref: https://open-meteo.com/en/docs (WMO Weather interpretation codes).

export interface WeatherLook {
  description: string;
  icon: string;
}

/** Map a WMO weather code to a human description + emoji. Unknown codes
 *  fall back to a neutral "Unknown" cloud so the widget still renders. */
export function describeWeather(code: number): WeatherLook {
  switch (true) {
    case code === 0:
      return { description: 'Clear sky', icon: '☀️' };
    case code === 1:
      return { description: 'Mainly clear', icon: '🌤️' };
    case code === 2:
      return { description: 'Partly cloudy', icon: '⛅' };
    case code === 3:
      return { description: 'Overcast', icon: '☁️' };
    case code === 45 || code === 48:
      return { description: 'Fog', icon: '🌫️' };
    // weather-severity-2026-06-19 — freezing drizzle / rain split
    // out of the plain drizzle / rain bands so the office sees the
    // ice glyph + the severity engine can fire an ice warning.
    case code === 56 || code === 57:
      return { description: 'Freezing drizzle', icon: '🧊' };
    case code === 66 || code === 67:
      return { description: 'Freezing rain', icon: '🧊' };
    case code >= 51 && code <= 55:
      return { description: 'Drizzle', icon: '🌦️' };
    case code >= 61 && code <= 65:
      return { description: 'Rain', icon: '🌧️' };
    // Snow grains is code 77 — separate so the tooltip can name it.
    case code === 77:
      return { description: 'Snow grains', icon: '🌨️' };
    case code === 75:
      return { description: 'Heavy snow', icon: '❄️' };
    case code >= 71 && code <= 73:
      return { description: 'Snow', icon: '🌨️' };
    case code >= 80 && code <= 82:
      return { description: 'Rain showers', icon: '🌦️' };
    case code === 85 || code === 86:
      return { description: 'Snow showers', icon: '🌨️' };
    case code === 95:
      return { description: 'Thunderstorm', icon: '⛈️' };
    case code === 96 || code === 99:
      return { description: 'Thunderstorm with hail', icon: '⛈️' };
    default:
      return { description: 'Unknown', icon: '☁️' };
  }
}

/** Context the refinement helper reads. Everything is optional — the
 *  helper degrades to the raw `describeWeather` result when nothing
 *  useful is in scope. */
export interface WeatherContext {
  /** Daily / current precipitation probability, 0–100. */
  rainChancePct?: number | null;
  /** Wind speed in mph (sustained, not gust). */
  windMph?: number | null;
}

/** When the rain chance is below this, a precipitation WMO code is
 *  treated as "the model overshot" and the icon downgrades to a
 *  mostly-clear / cloudy look. 25% matches the National Weather
 *  Service's "slight chance" cutoff. */
export const RAIN_LIKELY_THRESHOLD_PCT = 25;

/** Between LIKELY and SUBSTANTIAL is the "possible showers" band — the
 *  icon stays as the showers glyph (🌦️) but the description softens. */
export const RAIN_SUBSTANTIAL_THRESHOLD_PCT = 50;

/** Sustained wind above this surfaces a windy icon when the underlying
 *  WMO code is otherwise mild (clear / partly cloudy / overcast).
 *  Matches NWS "wind advisory" sustained-wind threshold. */
export const WIND_NOTABLE_MPH = 20;

/** Above this (mid-tier wind advisory), wind takes precedence even
 *  over the "cloudy" look. */
export const WIND_DOMINANT_MPH = 30;

// weather-severity-2026-06-19 — freezing precip codes (56, 57, 66,
// 67) are deliberately EXCLUDED here. The forecast wouldn't issue
// freezing precip casually, so the icon should stay 🧊 even at low
// probability — the severity engine fires an ice warning regardless.
const PRECIP_CODES = new Set<number>();
for (let c = 51; c <= 55; c += 1) PRECIP_CODES.add(c);
for (let c = 61; c <= 65; c += 1) PRECIP_CODES.add(c);
for (let c = 80; c <= 82; c += 1) PRECIP_CODES.add(c);

const MILD_CODES = new Set<number>([0, 1, 2, 3]);

/** Pure helper — refine the icon + description against the actual
 *  forecast probability and wind. See file header for the full
 *  rationale.
 *
 *  The function is intentionally conservative: snow, fog, thunder,
 *  and hail codes always win regardless of probability (those codes
 *  imply a forecast confidence Open-Meteo wouldn't issue lightly).
 *  Only the rain / drizzle / showers band gets downgraded. */
export function describeWeatherWithContext(code: number, ctx: WeatherContext = {}): WeatherLook {
  const rain = typeof ctx.rainChancePct === 'number' && Number.isFinite(ctx.rainChancePct) ? ctx.rainChancePct : null;
  const wind = typeof ctx.windMph === 'number' && Number.isFinite(ctx.windMph) ? ctx.windMph : null;

  // 1. Precipitation downgrade — code says rain but it's not actually
  //    likely. Pick the icon that matches what you'd actually see.
  //    Compute into `refined` so the wind pass can react to it.
  let refined: WeatherLook = describeWeather(code);
  let downgradedFromPrecip = false;
  if (PRECIP_CODES.has(code) && rain !== null) {
    if (rain < RAIN_LIKELY_THRESHOLD_PCT) {
      // Drizzle codes (51-57) → mostly clear; light shower codes
      // (80-82) → partly cloudy; steady rain codes (61-67) →
      // overcast. Matches what a person looking out the window
      // would say.
      if (code >= 51 && code <= 57) refined = { description: 'Mainly clear', icon: '🌤️' };
      else if (code >= 80 && code <= 82) refined = { description: 'Partly cloudy', icon: '⛅' };
      else refined = { description: 'Cloudy', icon: '☁️' };
      downgradedFromPrecip = true;
    } else if (rain < RAIN_SUBSTANTIAL_THRESHOLD_PCT) {
      // Real chance of rain but not a lock — "possible showers"
      // reads more honestly than "Rain". Keep the 🌦️ glyph.
      refined = { description: 'Possible showers', icon: '🌦️' };
    }
    // 50%+ probability → refined stays = base.
  }

  // 2. Wind elevation — high wind + mild result → windy.
  //    Dominant: wind ≥ WIND_DOMINANT_MPH on a mild OR rain-
  //    downgraded look. Notable: wind ≥ WIND_NOTABLE_MPH on a
  //    clear-sky code (codes 0/1) is the "Windy + clear" combo.
  if (wind !== null) {
    const refinedIsMild =
      MILD_CODES.has(code) ||
      refined.description === 'Mainly clear' ||
      downgradedFromPrecip;
    if (wind >= WIND_DOMINANT_MPH && refinedIsMild) {
      return { description: 'Windy', icon: '🌬️' };
    }
    if (wind >= WIND_NOTABLE_MPH && (code === 0 || code === 1)) {
      return { description: 'Windy + clear', icon: '🌬️' };
    }
  }

  return refined;
}

