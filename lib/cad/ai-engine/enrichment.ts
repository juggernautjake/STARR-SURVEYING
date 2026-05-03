// lib/cad/ai-engine/enrichment.ts
//
// Phase 6 §27 — Online Data Enrichment. Fetches publicly-
// available context the AI deliberation step uses to inform
// reconciliation, flood-zone notes, PLSS labels, and ROW
// detection. Honors the existing `EnrichmentData` shape on
// AIJobResult so the orchestrator + downstream UI don't need
// to change.
//
// First slice ships:
//   * USGS 3DEP point-elevation lookup (single request,
//     returns NAVD 88 ft for the project centroid).
//   * Fault-tolerant scaffold for the remaining four sources
//     (parcel CAD, PLSS, FEMA flood, TxDOT ROW) — they return
//     null in this slice and land per follow-up batch when
//     the API keys + state-plane → WGS84 conversion are
//     wired.
//
// The function is async and best-effort: HTTP failures are
// swallowed into the `source` string so the pipeline never
// dies on a flaky third-party endpoint. Set
// `ENRICHMENT_DISABLED=1` in the env to skip every fetch
// (useful for isolated unit tests).

import type { EnrichmentData } from './types';

interface FetchOptions {
  /** Approximate project centroid in WGS84. Required for
   *  USGS 3DEP. When null the elevation lookup is skipped. */
  latLon: { lat: number; lon: number } | null;
  /** Override the USGS endpoint for testing / mocking. */
  elevationEndpoint?: string;
  /** AbortSignal forwarded to fetch; pipeline-side cancel. */
  signal?: AbortSignal;
}

const DEFAULT_ELEVATION_ENDPOINT = 'https://epqs.nationalmap.gov/v1/json';

/**
 * Fetch the EnrichmentData payload for the given project.
 * Always resolves with a valid shape — the `source` field
 * captures which sources contributed and which failed so the
 * caller can render an inline status without extra plumbing.
 */
export async function fetchEnrichmentData(
  options: FetchOptions
): Promise<EnrichmentData> {
  const retrievedAt = new Date().toISOString();
  const sourceTags: string[] = [];

  if (process.env.ENRICHMENT_DISABLED === '1') {
    return makeEnrichmentData({
      elevationFt: null,
      retrievedAt,
      sources: ['disabled_via_env'],
    });
  }

  let elevationFt: number | null = null;
  if (options.latLon) {
    const { lat, lon } = options.latLon;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      try {
        elevationFt = await fetchElevationFt(
          lat,
          lon,
          options.elevationEndpoint ?? DEFAULT_ELEVATION_ENDPOINT,
          options.signal
        );
        sourceTags.push('usgs_3dep');
      } catch (err) {
        sourceTags.push(
          'usgs_3dep_error:' +
            (err instanceof Error ? err.message : 'unknown')
        );
      }
    } else {
      sourceTags.push('latlon_invalid');
    }
  } else {
    sourceTags.push('no_latlon_provided');
  }

  // Other sources scaffolded as null for now. They land per
  // follow-up slice once proj4-based state-plane → WGS84
  // conversion + API keys are wired.
  return makeEnrichmentData({
    elevationFt,
    retrievedAt,
    sources: sourceTags,
  });
}

// ────────────────────────────────────────────────────────────
// USGS 3DEP elevation
// ────────────────────────────────────────────────────────────

interface UsgsResponse {
  value?: number | null;
  message?: string;
}

async function fetchElevationFt(
  lat: number,
  lon: number,
  endpoint: string,
  signal?: AbortSignal
): Promise<number | null> {
  const url = new URL(endpoint);
  url.searchParams.set('x', lon.toString());
  url.searchParams.set('y', lat.toString());
  url.searchParams.set('units', 'Feet');
  url.searchParams.set('output', 'json');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  if (signal) signal.addEventListener('abort', () => controller.abort());

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`USGS 3DEP returned ${res.status}.`);
    }
    const json = (await res.json()) as UsgsResponse;
    if (typeof json.value !== 'number' || !Number.isFinite(json.value)) {
      // The USGS endpoint returns -1000000 for no-data.
      return null;
    }
    if (json.value <= -999999) return null;
    return json.value;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makeEnrichmentData(args: {
  elevationFt: number | null;
  retrievedAt: string;
  sources: string[];
}): EnrichmentData {
  return {
    parcelId: null,
    legalDescription: null,
    acreage: null,
    femaFloodZone: null,
    plssSection: null,
    plssTownship: null,
    plssRange: null,
    elevationFt: args.elevationFt,
    source: args.sources.join(','),
    retrievedAt: args.retrievedAt,
  };
}
