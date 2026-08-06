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

/** Resolve the request's coordinates.
 *
 *  ── PRECEDENCE, AND WHY COORDINATES COME FIRST (2026-08-06) ───────────────────────────────────
 *
 *  Owner: *"we need to be able to see the weather in any county or city in the USA."*
 *
 *  This used to take a ZIP and nothing else, so anywhere without one — a county, an unincorporated
 *  work site — was unreachable, and the answer to every such request was Central Texas. The search
 *  UI resolves a place to a point BEFORE calling here (see /api/admin/weather/locations), so the
 *  caller already knows the exact coordinates and the name the user picked. Passing those through
 *  is both more precise and one fewer round trip.
 *
 *  `zip=` still works: saved widget layouts and bookmarked `/admin/weather?zip=` URLs predate the
 *  search and must keep resolving. Its geocode is fixed too — see the `countryCode` note below. */
async function resolveLocation(params: URLSearchParams): Promise<GeoPoint> {
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (
    Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
    // (0,0) is the Gulf of Guinea and is what an empty form posts. Treat it as "unset" rather than
    // forecasting for open ocean.
    !(lat === 0 && lon === 0)
  ) {
    const label = (params.get('label') ?? '').trim();
    return { latitude: lat, longitude: lon, label: label || `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
  }

  const zip = (params.get('zip') ?? '').trim();
  if (!zip) return DEFAULT_LOCATION;
  // `countryCode`, NOT `country` — the old `&country=US` here was not a real parameter and was
  // silently ignored, so `zip=78701` could resolve to Conflans-Sainte-Honorine, France (measured
  // 2026-08-06). `firstGeoPoint` now also drops non-US hits.
  const geo = await fetchJson(
    `${GEOCODE_URL}?name=${encodeURIComponent(zip)}&count=5&countryCode=US`,
  );
  if (!geo) return DEFAULT_LOCATION;
  return firstGeoPoint(geo as OpenMeteoGeocode, zip) ?? DEFAULT_LOCATION;
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const point = await resolveLocation(searchParams);
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
  //
  // weather-severity-2026-06-19 — also request the daily
  // apparent-temperature max/min, max humidity, and wind gusts so
  // the per-day tooltip can show feels-like / humidity and the
  // severity engine can fire heat-wave / high-wind / tornado-risk
  // warnings.
  // weather-night-icons-2026-06-20 — also ask for `is_day` so the
  // current snapshot can render moon variants at night.
  const forecast = await fetchJson(
    `${FORECAST_URL}?latitude=${point.latitude}&longitude=${point.longitude}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      ',wind_speed_10m_max,wind_gusts_10m_max,apparent_temperature_max,apparent_temperature_min,relative_humidity_2m_max' +
      '&temperature_unit=fahrenheit&windspeed_unit=mph&forecast_days=5&timezone=auto',
  );

  const snapshot = forecast ? toWeatherSnapshot(forecast as OpenMeteoForecast, point.label) : null;
  if (!snapshot) {
    // Upstream unreachable or empty — degrade like the old stub.
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(snapshot);
}, { routeName: 'admin/weather' });
