// lib/maps/geocode.ts — turning a job's address into a place on the earth.
//
// Owner, 2026-09-18: "if we have stored points at that property … If a job has a specific address or
// latitude/longitude assigned to it, then that should show up when we go the interactive map from
// that job immediately."
//
// ── WHY THIS EXISTS WHEN THE REPO ALREADY HAS A GEOCODER ────────────────────────────────────────
//
// `lib/research/map-image.service.ts` geocodes through Nominatim. That one stays where it is: it
// serves research, it is free, and its results only ever feed a static preview image. It is the
// wrong tool here for two reasons — it appends ", Texas, USA" to any query without a comma, and it
// has no cache, so a map that geocodes on every load would hammer a volunteer-run service that asks
// for one request a second.
//
// This one uses Google, because the address it is resolving CAME from Google Places on the job form
// and resolving it with the same provider is what makes the two agree. Rural Texas addresses — a
// county road with no rooftop match — are also where the free geocoders are weakest, and that is
// most of this firm's work.
//
// ── THE CACHE IS THE JOB ROW ────────────────────────────────────────────────────────────────────
//
// There is no cache table. A geocoded job writes `latitude`/`longitude` onto itself and is never
// looked up again — the columns have existed since the baseline schema and were simply never filled.
// That makes the cache impossible to get out of step with the thing it caches, and it means the
// map's own query is a plain column read rather than a join.
//
// Pure except for `geocodeAddress`, which is the one function that talks to Google. Tested in
// __tests__/maps/geocode.test.ts.
import { resolveServerMapsKey, NO_SERVER_MAPS_KEY_MESSAGE } from './server-key';

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  /** What Google matched, so a wrong answer can be recognised as wrong. */
  formatted: string;
  /**
   * How precisely it landed. `ROOFTOP` is a building; `RANGE_INTERPOLATED` is a guess along a
   * street; `GEOMETRIC_CENTER` and `APPROXIMATE` can be the middle of a road or a whole town.
   */
  precision: string;
}

export type GeocodeResult =
  | { ok: true; hit: GeocodeHit }
  | { ok: false; error: string; retryable: boolean };

/** What the map will fly to. A job carries an address in pieces; Google wants one line. */
export interface JobAddressParts {
  address?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  zip?: string | null;
}

/**
 * One line for the geocoder, or null when there is not enough to bother asking.
 *
 * A street address alone is not enough — "100 County Road 200" exists in most of the 254 counties,
 * and asking Google to pick one produces a confident answer in the wrong place. So something that
 * narrows it (city, ZIP or county) is required, and the state defaults to TX because every job this
 * firm has ever taken is in Texas and an unqualified Texas address geocodes to Ohio often enough to
 * matter.
 */
export function buildGeocodeQuery(parts: JobAddressParts): string | null {
  const street = (parts.address ?? '').trim();
  const city = (parts.city ?? '').trim();
  const zip = (parts.zip ?? '').trim();
  const county = (parts.county ?? '').trim();
  const state = (parts.state ?? '').trim() || 'TX';
  if (!street) return null;
  if (!city && !zip && !county) return null;

  // County is a fallback locality, not an addition: "100 CR 200, Belton, Bell County, TX" narrows
  // less well than the city alone, because Google reads the county as another locality token.
  const locality = city || county;
  return [street, locality, state, zip].filter(Boolean).join(', ');
}

/** Is this specific enough to point a map at a property, rather than at a town? */
export function isUsablePrecision(precision: string): boolean {
  return precision === 'ROOFTOP' || precision === 'RANGE_INTERPOLATED';
}

/** A coordinate pair that is actually on the earth and not the API's idea of "nothing". */
export function isRealCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // 0,0 is in the Gulf of Guinea. It is never a Texas survey, and it is what a failed parse looks
  // like far more often than it is a real answer.
  return !(lat === 0 && lng === 0);
}

interface GoogleGeocodeResponse {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
  }>;
}

/** Google's statuses that are worth trying again, as opposed to ones that will always say the same. */
const RETRYABLE = new Set(['OVER_QUERY_LIMIT', 'UNKNOWN_ERROR']);

/**
 * Ask Google where an address is.
 *
 * Returns a structured refusal rather than throwing: geocoding is best-effort here — a job whose
 * address will not resolve still has to appear in the list, just without a pin.
 */
export async function geocodeAddress(
  query: string,
  opts: { signal?: AbortSignal; env?: Record<string, string | undefined> } = {},
): Promise<GeocodeResult> {
  const { key } = resolveServerMapsKey(opts.env ?? process.env);
  if (!key) return { ok: false, error: NO_SERVER_MAPS_KEY_MESSAGE, retryable: false };
  if (!query.trim()) return { ok: false, error: 'Nothing to geocode.', retryable: false };

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', key);
  // Biased, not restricted: a job just over the state line should still resolve, it should just not
  // win against a Texas match of the same name.
  url.searchParams.set('region', 'us');
  url.searchParams.set('components', 'country:US');

  let res: Response;
  try {
    res = await fetch(url, { signal: opts.signal });
  } catch (err) {
    return { ok: false, error: `Could not reach Google: ${(err as Error).message}`, retryable: true };
  }
  if (!res.ok) return { ok: false, error: `Google answered ${res.status}.`, retryable: res.status >= 500 };

  const body = (await res.json().catch(() => ({}))) as GoogleGeocodeResponse;
  if (body.status !== 'OK') {
    const status = body.status ?? 'NO_STATUS';
    if (status === 'ZERO_RESULTS') return { ok: false, error: 'Google does not recognise that address.', retryable: false };
    return {
      ok: false,
      error: body.error_message ? `${status}: ${body.error_message}` : status,
      retryable: RETRYABLE.has(status),
    };
  }

  const first = (body.results ?? [])[0];
  const at = first?.geometry?.location;
  if (!isRealCoordinate(at?.lat, at?.lng)) {
    return { ok: false, error: 'Google returned no usable coordinates.', retryable: false };
  }

  return {
    ok: true,
    hit: {
      latitude: Number(at!.lat),
      longitude: Number(at!.lng),
      formatted: first?.formatted_address ?? query,
      precision: first?.geometry?.location_type ?? 'UNKNOWN',
    },
  };
}
