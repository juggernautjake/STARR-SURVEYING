// worker/src/research/google-geocode.ts — the geocoder of last resort, for the addresses that
// matter most here.
//
// ── THE RUN THAT LOST ITS IMAGERY TO A MISSING COORDINATE ───────────────────────────────────────
//
// Measured 2026-09-03, on a Bell County run for 11780 FM 2484:
//
//     geocode → Nominatim (192ms) fail — No results
//     geocode → Census   (553ms) fail — No matches
//     ✗ Geocoder returned no result — FEMA/TxDOT spatial queries will be skipped
//     [1377s] Direct map screenshots skipped — no property ID or coordinates
//
// That last line is the cost. The aerial, satellite and GIS captures the owner wants FIRST in the
// run order are all gated on having a location, and the run never obtained one. The imagery stage
// did not fail — it was skipped, silently, three-quarters of an hour in.
//
// Verified independently: Nominatim genuinely returns `[]` for that address. Google returns it
// immediately:
//
//     11780 FM2484, Salado, TX 76571   @ 30.9971703, -97.626234
//
// Rural Texas is exactly where the free geocoders are weakest — FM and RM roads, unincorporated
// addresses, ranch roads — and it is exactly the work this business does.
//
// ── WHY IT IS THIRD AND NOT FIRST ───────────────────────────────────────────────────────────────
//
// Nominatim and Census are free; Google bills per call. Putting Google first would spend money on
// every run to fix the minority of addresses the free ones miss. Third means it costs nothing on
// the addresses that already work and rescues the ones that do not.
//
// ── THE KEY MUST NOT BE THE BROWSER'S ───────────────────────────────────────────────────────────
//
// `lib/maps/server-key.ts` in the app documents this at length and the worker's own lot-correlator
// follows it: a server-side call must use `GOOGLE_MAPS_SERVER_KEY` (or `GOOGLE_MAPS_API_KEY`), NOT
// `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. The public key is restricted by HTTP referrer, a server sends
// no referrer, and Google refuses it with a message about referrer restrictions that reads like a
// Google problem rather than a configuration one. Falling back to the public key would convert a
// clear "not configured" into a confusing permission error — and put a billed API behind a key that
// ships to every visitor in the page source.

/** Variable names accepted for a server-side maps key, in priority order. Mirrors
 *  `SERVER_MAPS_KEY_VARS` in the app's `lib/maps/server-key.ts` — two names because two parts of
 *  this codebase named the same idea differently and both are in use. */
export const SERVER_MAPS_KEY_VARS = ['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY'] as const;

export interface GoogleGeocodeResult {
  lat: number;
  lon: number;
  /** Google's canonical form of the address, e.g. "11780 FM2484, Salado, TX 76571, USA". */
  formattedAddress: string;
  /** The county Google places it in, without the word "County". Null when it does not say. */
  county: string | null;
  /** The city, which for a rural parcel is often not the one the operator typed. */
  city: string | null;
  zip: string | null;
  /** ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE — how precise this is. */
  locationType: string | null;
}

export interface GoogleGeocodeOutcome {
  result: GoogleGeocodeResult | null;
  /** A sentence for the run log. Never "no results" when nothing was asked. */
  statement: string;
  /** True when a key was present and the request was actually made. */
  attempted: boolean;
}

function serverKey(env: NodeJS.ProcessEnv): string | null {
  for (const name of SERVER_MAPS_KEY_VARS) {
    const v = (env[name] ?? '').trim();
    if (v) return v;
  }
  return null;
}

function componentOf(components: unknown, type: string, short = false): string | null {
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    const types = (c as { types?: unknown }).types;
    if (Array.isArray(types) && types.includes(type)) {
      const val = short
        ? (c as { short_name?: unknown }).short_name
        : (c as { long_name?: unknown }).long_name;
      return typeof val === 'string' && val.trim() ? val.trim() : null;
    }
  }
  return null;
}

/**
 * Geocode with Google, as the last resort after the free providers.
 *
 * Never throws. A geocoder that is down must not fail a run that has already found a property —
 * the caller gets `result: null` and a statement explaining which of the two situations it is,
 * because "no key configured" and "Google has never heard of this address" call for entirely
 * different responses and had been reported identically as "geocoding failed".
 */
export async function geocodeWithGoogle(
  address: string,
  opts: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<GoogleGeocodeOutcome> {
  const env = opts.env ?? process.env;
  const doFetch = opts.fetchImpl ?? fetch;
  const query = (address ?? '').trim();

  if (!query) {
    return { result: null, attempted: false, statement: 'No address was supplied, so Google was not asked.' };
  }

  const key = serverKey(env);
  if (!key) {
    return {
      result: null,
      attempted: false,
      statement:
        `Google geocoding was not attempted: no server maps key is configured. Set ` +
        `${SERVER_MAPS_KEY_VARS[0]} to a key WITHOUT an HTTP-referrer restriction — the public ` +
        `browser key cannot be used from a server, because a server sends no referrer.`,
    };
  }

  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?address=' +
    encodeURIComponent(query) +
    '&components=country:US&key=' +
    encodeURIComponent(key);

  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
    if (!res.ok) {
      return { result: null, attempted: true, statement: `Google geocoding returned HTTP ${res.status}.` };
    }

    const body = (await res.json()) as {
      status?: string;
      error_message?: string;
      results?: Array<Record<string, unknown>>;
    };

    // ZERO_RESULTS is a finding about the ADDRESS. Anything else is a finding about US — a key
    // without the Geocoding API enabled, a referrer-restricted key, a billing lapse. Reporting them
    // the same way is what let "the geocoders could not find it" stand for six hours in place of
    // "our key is misconfigured".
    if (body.status === 'ZERO_RESULTS') {
      return {
        result: null,
        attempted: true,
        statement: `Google has no match for "${query}". All three geocoders agree the address is not findable as written.`,
      };
    }
    if (body.status !== 'OK') {
      return {
        result: null,
        attempted: true,
        statement:
          `Google geocoding was refused (${body.status ?? 'unknown status'})` +
          `${body.error_message ? `: ${body.error_message}` : ''}. That is a problem with our key or ` +
          `project, NOT with the address.`,
      };
    }

    const first = (body.results ?? [])[0];
    if (!first) {
      return { result: null, attempted: true, statement: 'Google reported OK but returned no results.' };
    }

    const geometry = first.geometry as { location?: { lat?: unknown; lng?: unknown }; location_type?: unknown } | undefined;
    const lat = Number(geometry?.location?.lat);
    const lon = Number(geometry?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { result: null, attempted: true, statement: 'Google returned a result with no usable coordinates.' };
    }

    const components = first.address_components;
    const countyRaw = componentOf(components, 'administrative_area_level_2');
    const county = countyRaw ? countyRaw.replace(/\s+County$/i, '').trim() : null;

    return {
      attempted: true,
      result: {
        lat,
        lon,
        formattedAddress: typeof first.formatted_address === 'string' ? first.formatted_address : query,
        county,
        city: componentOf(components, 'locality') ?? componentOf(components, 'sublocality'),
        zip: componentOf(components, 'postal_code'),
        locationType: typeof geometry?.location_type === 'string' ? geometry.location_type : null,
      },
      statement:
        `Google resolved "${query}" to ${typeof first.formatted_address === 'string' ? first.formatted_address : query} ` +
        `at ${lat.toFixed(6)}, ${lon.toFixed(6)}` +
        `${geometry?.location_type ? ` (${String(geometry.location_type).toLowerCase().replace(/_/g, ' ')})` : ''}. ` +
        `The free geocoders had found nothing.`,
    };
  } catch (err) {
    return {
      result: null,
      attempted: true,
      statement: `Google geocoding failed to complete: ${err instanceof Error ? err.message : String(err)}.`,
    };
  }
}
