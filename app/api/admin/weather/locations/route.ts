// app/api/admin/weather/locations/route.ts
//
// Location search behind the weather surfaces (owner, 2026-08-06: *"we need to be able to see the
// weather in any county or city in the USA"*).
//
// GET /api/admin/weather/locations?q=killeen  → { results: LocationHit[] }
//
// Counties are answered from the bundled Census table without touching the network; cities go to
// Open-Meteo. Both halves are merged and ranked by `lib/weather/location-search.ts`, which is where
// the reasoning lives — this file is transport only.
//
// A geocoder outage degrades to county-only results rather than erroring: 3,222 counties is still a
// usable answer to "where do you want the forecast for", and the widget already knows how to render
// an empty list.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  cityHits,
  isZipQuery,
  mergeLocationResults,
  searchCounties,
  type LocationHit,
  type OpenMeteoGeoResponse,
} from '@/lib/weather/location-search';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FETCH_TIMEOUT_MS = 5000;
const MAX_RESULTS = 10;

async function geocode(query: string): Promise<OpenMeteoGeoResponse | null> {
  try {
    // `countryCode`, NOT `country`. The latter is not a parameter Open-Meteo has: it was accepted
    // and ignored, which is how "Killeen" used to return three towns in Ireland.
    const url =
      `${GEOCODE_URL}?name=${encodeURIComponent(query)}` +
      `&count=${MAX_RESULTS}&countryCode=US&language=en&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as OpenMeteoGeoResponse;
  } catch {
    return null;
  }
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  // Two characters is where a prefix search stops being a scan of the whole country.
  if (q.length < 2) return NextResponse.json({ results: [] as LocationHit[] });

  const zip = isZipQuery(q) ? q : undefined;

  // A ZIP is unambiguous — no point ranking counties against it.
  const [geo, counties] = await Promise.all([
    geocode(q),
    Promise.resolve(zip ? [] : searchCounties(q)),
  ]);

  const cities = geo ? cityHits(geo, { zip }) : [];
  const results = mergeLocationResults(counties, cities, q, MAX_RESULTS);

  return NextResponse.json(
    { results, degraded: geo === null },
    // Location names do not move. Caching keeps a fast typist from generating a request per
    // keystroke against the upstream geocoder.
    { headers: { 'Cache-Control': 'private, max-age=3600' } },
  );
}, { routeName: 'admin/weather/locations' });
