// lib/sun/response.ts
//
// hub-widget-excellence-15 — sun-calculator endpoint shaping. Resolves
// the request's coordinates (a pinned lat/lng, else the Central-Texas
// default that mirrors the rest of the app) and builds the widget's
// `{ sunrise, sunset, daylight_hours, location_label }` payload from the
// pure sunrise computation. Times are ISO-8601 UTC so the widget can
// format them in either the surveyor's local zone or UTC.
// Dependency-free → unit-tested in node.

import { computeSunTimes } from './calc';

export interface SunResponse {
  /** ISO-8601 UTC, or null on a polar night. */
  sunrise: string | null;
  /** ISO-8601 UTC, or null on a polar day. */
  sunset: string | null;
  daylight_hours: number;
  location_label: string;
}

export interface SunPoint {
  latitude: number;
  longitude: number;
  label: string;
}

// Central Texas — STARR's region (mirrors property-search.service).
export const DEFAULT_SUN_LOCATION: SunPoint = {
  latitude: 31.0698,
  longitude: -97.3536,
  label: 'Central Texas',
};

function parseCoord(v: string | null, max: number): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

const roundCoord = (n: number): string => (Math.round(n * 10000) / 10000).toString();

/** Resolve the `?lat=&lng=` params into a point, falling back to the
 *  Central-Texas default when either is missing or out of range. */
export function resolveSunPoint(latParam: string | null, lngParam: string | null): SunPoint {
  const lat = parseCoord(latParam, 90);
  const lng = parseCoord(lngParam, 180);
  if (lat === null || lng === null) return { ...DEFAULT_SUN_LOCATION };
  return { latitude: lat, longitude: lng, label: `${roundCoord(lat)}, ${roundCoord(lng)}` };
}

/** Build the widget payload for a point + date. */
export function buildSunResponse(point: SunPoint, date: Date): SunResponse {
  const t = computeSunTimes(point.latitude, point.longitude, date);
  return {
    sunrise: t.sunrise ? t.sunrise.toISOString() : null,
    sunset: t.sunset ? t.sunset.toISOString() : null,
    daylight_hours: Math.round(t.daylightHours * 100) / 100,
    location_label: point.label,
  };
}
