// lib/weather/severity.ts
//
// weather-severity-2026-06-19 — pure helpers for computing per-day
// severity warnings + building the hover tooltip text.
//
// Severity types match common NWS thresholds so the icons + copy
// read like what the office is used to hearing on the radio:
//   - heat_wave    high ≥ 100°F OR feels-like max ≥ 105°F
//   - hard_freeze  low ≤ 20°F
//   - freeze       low ≤ 32°F (but above hard_freeze)
//   - ice_warning  freezing precip code OR (sub-freezing low AND
//                  decent precip chance)
//   - high_wind    sustained ≥ 40 mph OR gusts ≥ 50 mph
//   - tornado_risk severe-storm code (95/96/99) + gusts ≥ 50 mph
//
// Dependency-free → unit-tested in node.

import { describeWeather, RAIN_LIKELY_THRESHOLD_PCT } from './wmo';

export type WeatherSeverityKind =
  | 'heat_wave'
  | 'hard_freeze'
  | 'freeze'
  | 'ice_warning'
  | 'high_wind'
  | 'tornado_risk'
  | 'severe_storm';

export interface WeatherSeverity {
  kind: WeatherSeverityKind;
  /** Short human label for the badge ("Heat wave"). */
  label: string;
  /** Emoji shown in the corner of the daily card. */
  icon: string;
  /** One-line plain-English advice for the tooltip. */
  advice: string;
}

/** Thresholds the helpers compare against. Exported so the spec can
 *  source-lock them + the widget can reference them when surfacing
 *  the chip-level warnings. */
export const HEAT_WAVE_HIGH_F = 100;
export const HEAT_WAVE_FEELS_F = 105;
export const HARD_FREEZE_LOW_F = 20;
export const FREEZE_LOW_F = 32;
export const ICE_RAIN_PCT = 30;
export const HIGH_WIND_SUSTAINED_MPH = 40;
export const HIGH_WIND_GUST_MPH = 50;

/** Severity-relevant fields the helper reads from a WeatherDay /
 *  the current snapshot. Every field is optional so a partial
 *  Open-Meteo payload still produces a sensible answer. */
export interface DayLike {
  code?: number | null;
  high_f?: number | null;
  low_f?: number | null;
  feels_like_max_f?: number | null;
  feels_like_min_f?: number | null;
  humidity_max_pct?: number | null;
  rain_chance_pct?: number | null;
  wind_mph?: number | null;
  wind_gust_mph?: number | null;
}

const FREEZING_PRECIP_CODES = new Set<number>([56, 57, 66, 67]);
const SNOW_CODES = new Set<number>([71, 72, 73, 75, 77, 85, 86]);
const SEVERE_STORM_CODES = new Set<number>([95, 96, 99]);

/** Pure helper — pick the single most-severe warning that applies
 *  to the day. Returns null when nothing notable is happening. The
 *  order below is the priority (life-safety first, comfort last). */
export function computeDaySeverity(day: DayLike): WeatherSeverity | null {
  const code = typeof day.code === 'number' ? day.code : -1;
  const high = numOrNull(day.high_f);
  const low = numOrNull(day.low_f);
  const feelsMax = numOrNull(day.feels_like_max_f);
  const wind = numOrNull(day.wind_mph);
  const gust = numOrNull(day.wind_gust_mph);
  const rain = numOrNull(day.rain_chance_pct);

  // weather-severity-thunder-gate-2026-06-21 — Open-Meteo's daily code
  // emits thunderstorm (95 / 96 / 99) on summer afternoons even when
  // the actual rain probability is 0–10% ("could pop up" wins the
  // dominant-code coin flip). The icon downgrade in
  // describeWeatherWithContext already strips the ⛈️ glyph below the
  // RAIN_LIKELY_THRESHOLD_PCT; the severity engine needs the same
  // gate or the corner badge keeps firing on a 0% rain day. When rain
  // is set AND below the threshold, fall through to the rest of the
  // checks (cold / wind / heat still apply).
  const thunderRainLikely = rain === null || rain >= RAIN_LIKELY_THRESHOLD_PCT;

  // Tornado risk first — life-safety. Severe storm + strong gusts.
  // Still requires a real rain chance; without one Open-Meteo is just
  // guessing and the gust check is a separate high_wind path below.
  if (SEVERE_STORM_CODES.has(code) && thunderRainLikely && gust !== null && gust >= HIGH_WIND_GUST_MPH) {
    return {
      kind: 'tornado_risk',
      label: 'Tornado / severe storm risk',
      icon: '🌪️',
      advice: 'Severe thunderstorms with damaging gusts. Watch local alerts and take shelter if a warning fires.',
    };
  }
  if (SEVERE_STORM_CODES.has(code) && thunderRainLikely) {
    return {
      kind: 'severe_storm',
      label: 'Severe thunderstorm',
      icon: '⛈️',
      advice: 'Thunderstorms expected. Plan for delays + keep crews off elevated work.',
    };
  }

  // Ice — driving + crew safety.
  if (FREEZING_PRECIP_CODES.has(code)) {
    return {
      kind: 'ice_warning',
      label: 'Ice warning',
      icon: '🧊',
      advice: 'Freezing precipitation expected. Roads may glaze — delay travel + reschedule field work.',
    };
  }
  if (low !== null && low <= FREEZE_LOW_F && rain !== null && rain >= ICE_RAIN_PCT) {
    return {
      kind: 'ice_warning',
      label: 'Possible ice on roads',
      icon: '🧊',
      advice: 'Wet roads + a sub-freezing low. Black ice possible at dawn — start the day late if you can.',
    };
  }

  // Cold extremes.
  if (low !== null && low <= HARD_FREEZE_LOW_F) {
    return {
      kind: 'hard_freeze',
      label: 'Hard freeze',
      icon: '🥶',
      advice: 'Hard freeze overnight. Cover outdoor faucets + bring sensitive gear indoors.',
    };
  }
  if (low !== null && low <= FREEZE_LOW_F) {
    return {
      kind: 'freeze',
      label: 'Freeze warning',
      icon: '🥶',
      advice: 'Overnight low at or below freezing. Wrap exposed pipes; dress crews in layers.',
    };
  }

  // High wind — equipment + crew safety.
  if ((wind !== null && wind >= HIGH_WIND_SUSTAINED_MPH) || (gust !== null && gust >= HIGH_WIND_GUST_MPH)) {
    return {
      kind: 'high_wind',
      label: 'High wind',
      icon: '💨',
      advice: 'Strong wind expected. Skip aerial work, secure tripods + papers, watch for downed limbs.',
    };
  }

  // Heat — slow burn but real.
  if ((high !== null && high >= HEAT_WAVE_HIGH_F) || (feelsMax !== null && feelsMax >= HEAT_WAVE_FEELS_F)) {
    return {
      kind: 'heat_wave',
      label: 'Heat wave',
      icon: '♨️',
      advice: 'Dangerous heat. Schedule field work for the morning, hydrate often, watch for heat exhaustion.',
    };
  }

  return null;
}

function numOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Pure helper — turn an ISO date like "2026-06-19" into a friendly
 *  weekday name. Returns the input verbatim when parsing fails so
 *  the widget never renders "Invalid Date". */
export function formatDayName(iso: string): string {
  if (!iso) return '';
  // Parse as UTC midnight so the weekday isn't shifted by the
  // viewer's TZ.
  const parts = iso.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return iso;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return iso;
  return DAY_NAMES[date.getUTCDay()] ?? iso;
}

export interface TooltipInput extends DayLike {
  date: string;
  description: string;
}

/** Pure helper — build the multi-line tooltip text the widget puts
 *  in `title=` and renders in the rich hover popover. Lines:
 *
 *    <Weekday> — <description>
 *    H <high>° / L <low>° (feels like <feels>°)
 *    <humidity>% humidity · <rain>% chance of rain
 *    Wind <wind> mph (gusts <gust>)
 *    ⚠ <severity advice>
 *
 *  Lines whose data is missing are skipped silently so the tooltip
 *  stays clean on partial payloads. */
export function buildDayTooltip(input: TooltipInput): string {
  const lines: string[] = [];
  const day = formatDayName(input.date) || input.date;
  lines.push(`${day} — ${input.description}`);

  // Temperatures (always rendered when at least one is known).
  const hi = numOrNull(input.high_f);
  const lo = numOrNull(input.low_f);
  const feels = numOrNull(input.feels_like_max_f);
  if (hi !== null || lo !== null) {
    let tempLine = '';
    if (hi !== null) tempLine += `H ${Math.round(hi)}°`;
    if (hi !== null && lo !== null) tempLine += ' / ';
    if (lo !== null) tempLine += `L ${Math.round(lo)}°`;
    if (feels !== null) tempLine += ` (feels like ${Math.round(feels)}°)`;
    lines.push(tempLine);
  }

  // Humidity + rain chance on one line.
  const hum = numOrNull(input.humidity_max_pct);
  const rain = numOrNull(input.rain_chance_pct);
  if (hum !== null || rain !== null) {
    const parts: string[] = [];
    if (hum !== null) parts.push(`${Math.round(hum)}% humidity`);
    if (rain !== null) parts.push(`${Math.round(rain)}% chance of rain`);
    lines.push(parts.join(' · '));
  }

  // Wind + gusts.
  const wind = numOrNull(input.wind_mph);
  const gust = numOrNull(input.wind_gust_mph);
  if (wind !== null || gust !== null) {
    let windLine = '';
    if (wind !== null) windLine += `Wind ${Math.round(wind)} mph`;
    if (wind !== null && gust !== null) windLine += ' ';
    if (gust !== null) windLine += `(gusts ${Math.round(gust)})`;
    lines.push(windLine);
  }

  // Severity advice (last line so it's visually distinct).
  const severity = computeDaySeverity(input);
  if (severity) {
    lines.push(`⚠ ${severity.label}: ${severity.advice}`);
  } else {
    // Tag the underlying WMO category so the office knows we
    // actually understood the day even when nothing's severe.
    const look = describeWeather(typeof input.code === 'number' ? input.code : -1);
    if (look.description && !lines[0].includes(look.description)) {
      // No-op when description already comes from the same source.
    }
  }

  return lines.join('\n');
}
