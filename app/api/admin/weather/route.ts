// app/api/admin/weather/route.ts
//
// Weather widget endpoint (Slice 141). hub-widget-excellence-15 — this
// was a 204 stub awaiting an API key. Open-Meteo is free + keyless, so
// we now serve REAL data: resolve coordinates (manual ZIP via Open-Meteo
// geocoding, else the Central-Texas default), fetch the current forecast
// in °F, and map it via the pure lib/weather helpers. Any upstream
// failure (e.g. egress blocked) degrades to 204 No Content — the widget
// treats !res.ok as "no data" and shows its graceful empty state, so
// nothing regresses when the network is unavailable.
//
// GET /api/admin/weather?location=auto|manual|active-job&zip=78701
//   → WeatherSnapshot | 204

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { toWeatherSnapshot, type OpenMeteoForecast } from '@/lib/weather/snapshot';
import { DEFAULT_LOCATION, firstGeoPoint, type GeoPoint, type OpenMeteoGeocode } from '@/lib/weather/geocode';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 6000;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Resolve the request's coordinates: a manual ZIP geocodes via
 *  Open-Meteo; everything else uses the Central-Texas default. */
async function resolveLocation(zip: string): Promise<GeoPoint> {
  const trimmed = zip.trim();
  if (!trimmed) return DEFAULT_LOCATION;
  const geo = await fetchJson(
    `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}&count=1&country=US`,
  );
  if (!geo) return DEFAULT_LOCATION;
  return firstGeoPoint(geo as OpenMeteoGeocode, trimmed) ?? DEFAULT_LOCATION;
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const zip = searchParams.get('zip') ?? '';

  const point = await resolveLocation(zip);
  // Slice W5 — request 5 days of daily data + the daily
  // weather_code so the widget's big-size mode can render a
  // forecast strip. The snapshot mapper picks up the daily
  // arrays via `buildDailyForecast`.
  //
  // weather-extras-2026-06-18 — also surface feels-like
  // (`apparent_temperature`), humidity (`relative_humidity_2m`)
  // for the current snapshot, and per-day rain chance
  // (`precipitation_probability_max`) for both the headline
  // and each row in the strip.
  // weather-icon-accuracy-2026-06-19 — also ask for current +
  // daily wind in mph so the snapshot mapper can refine the icon
  // (high wind + mild code → 🌬️) and the widget can surface a
  // wind chip when notable. `windspeed_unit=mph` keeps units in
  // lockstep with the rest of the surface (temps already °F).
  const forecast = await fetchJson(
    `${FORECAST_URL}?latitude=${point.latitude}&longitude=${point.longitude}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max' +
      '&temperature_unit=fahrenheit&windspeed_unit=mph&forecast_days=5&timezone=auto',
  );

  const snapshot = forecast ? toWeatherSnapshot(forecast as OpenMeteoForecast, point.label) : null;
  if (!snapshot) {
    // Upstream unreachable or empty — degrade like the old stub.
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(snapshot);
}, { routeName: 'admin/weather' });
