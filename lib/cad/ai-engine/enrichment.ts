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
  /** Override the FEMA NFHL endpoint for testing / mocking. */
  femaEndpoint?: string;
  /** Override the BLM PLSS endpoint for testing / mocking. */
  plssEndpoint?: string;
  /** AbortSignal forwarded to fetch; pipeline-side cancel. */
  signal?: AbortSignal;
}

const DEFAULT_ELEVATION_ENDPOINT = 'https://epqs.nationalmap.gov/v1/json';
// FEMA's National Flood Hazard Layer (NFHL) public ArcGIS
// service. Layer 28 = "Flood Hazard Zones". A point-in-polygon
// query returns the FLD_ZONE attribute + FIRM panel id.
const DEFAULT_FEMA_ENDPOINT =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query';
// BLM's Cadastral PLSS service (layer 2 = "PLSS Section").
// Returns township, range, section, meridian, and abstract
// attributes for the cadastral grid the point falls inside.
const DEFAULT_PLSS_ENDPOINT =
  'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/2/query';

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
      femaFloodZone: null,
      plssSection: null,
      plssTownship: null,
      plssRange: null,
      retrievedAt,
      sources: ['disabled_via_env'],
    });
  }

  let elevationFt: number | null = null;
  let femaFloodZone: string | null = null;
  let plssTownship: string | null = null;
  let plssRange: string | null = null;
  let plssSection: string | null = null;
  if (options.latLon) {
    const { lat, lon } = options.latLon;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      // Fan out the three fetchers in parallel — each one is
      // independently fault-tolerant, so a flaky source can't
      // block the others.
      const [elevation, fema, plss] = await Promise.all([
        safeCall(
          () =>
            fetchElevationFt(
              lat,
              lon,
              options.elevationEndpoint ?? DEFAULT_ELEVATION_ENDPOINT,
              options.signal,
            ),
          'usgs_3dep',
          sourceTags,
        ),
        safeCall(
          () =>
            fetchFemaFloodZone(
              lat,
              lon,
              options.femaEndpoint ?? DEFAULT_FEMA_ENDPOINT,
              options.signal,
            ),
          'fema_nfhl',
          sourceTags,
        ),
        safeCall(
          () =>
            fetchPlssFields(
              lat,
              lon,
              options.plssEndpoint ?? DEFAULT_PLSS_ENDPOINT,
              options.signal,
            ),
          'blm_plss',
          sourceTags,
        ),
      ]);
      elevationFt = elevation;
      femaFloodZone = fema;
      if (plss) {
        plssTownship = plss.township;
        plssRange = plss.range;
        plssSection = plss.section;
      }
    } else {
      sourceTags.push('latlon_invalid');
    }
  } else {
    sourceTags.push('no_latlon_provided');
  }

  // Parcel CAD scaffold remains null — county adapters land in
  // follow-up slices once per-county auth + rate-limit handling
  // ships.
  return makeEnrichmentData({
    elevationFt,
    femaFloodZone,
    plssSection,
    plssTownship,
    plssRange,
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
// FEMA NFHL flood-zone lookup
// ────────────────────────────────────────────────────────────

interface ArcGisFeatureResponse {
  features?: Array<{
    attributes?: Record<string, string | number | null>;
  }>;
}

/**
 * Phase 6 §3081 — point-in-polygon query against FEMA's
 * National Flood Hazard Layer. Returns the `FLD_ZONE`
 * attribute (e.g. "X", "AE", "VE", "0.2 PCT ANNUAL CHANCE
 * FLOOD HAZARD") plus the FIRM panel id when one is found,
 * formatted as `"<zone> (panel <id>)"`. Returns null when the
 * point falls outside every published panel.
 */
async function fetchFemaFloodZone(
  lat: number,
  lon: number,
  endpoint: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = new URL(endpoint);
  url.searchParams.set('geometry', JSON.stringify({ x: lon, y: lat }));
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('outFields', 'FLD_ZONE,FIRM_PAN');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');
  const json = await fetchArcGis(url, signal);
  const attrs = json.features?.[0]?.attributes ?? null;
  if (!attrs) return null;
  const zone = typeof attrs.FLD_ZONE === 'string' ? attrs.FLD_ZONE : null;
  const panel = typeof attrs.FIRM_PAN === 'string' ? attrs.FIRM_PAN : null;
  if (!zone) return null;
  return panel ? `${zone} (panel ${panel})` : zone;
}

// ────────────────────────────────────────────────────────────
// BLM PLSS section / township / range lookup
// ────────────────────────────────────────────────────────────

interface PlssFields {
  township: string | null;
  range: string | null;
  section: string | null;
}

/**
 * Phase 6 §3080 — point-in-polygon query against the BLM's
 * national PLSS cadastral grid. Returns the township, range,
 * and section attribute strings (e.g. `T2N`, `R6W`, `12`).
 * Texas surveys are largely NOT on PLSS — the Republic of
 * Texas predated the PLSS expansion — so a null return is
 * expected for most Starr jobs.
 */
async function fetchPlssFields(
  lat: number,
  lon: number,
  endpoint: string,
  signal?: AbortSignal,
): Promise<PlssFields | null> {
  const url = new URL(endpoint);
  url.searchParams.set('geometry', JSON.stringify({ x: lon, y: lat }));
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('outFields', 'TWNSHPLAB,SECTION_ID,STEWARDID');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');
  const json = await fetchArcGis(url, signal);
  const attrs = json.features?.[0]?.attributes ?? null;
  if (!attrs) return null;
  // TWNSHPLAB packs township + range, e.g. "T2N R6W". Split.
  const rawLabel = typeof attrs.TWNSHPLAB === 'string' ? attrs.TWNSHPLAB : null;
  const section =
    attrs.SECTION_ID != null ? String(attrs.SECTION_ID) : null;
  const labelParts = rawLabel ? rawLabel.trim().split(/\s+/) : [];
  return {
    township: labelParts[0] ?? null,
    range: labelParts[1] ?? null,
    section,
  };
}

async function fetchArcGis(
  url: URL,
  signal?: AbortSignal,
): Promise<ArcGisFeatureResponse> {
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
      throw new Error(`ArcGIS service returned ${res.status}.`);
    }
    return (await res.json()) as ArcGisFeatureResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Wrap a fetcher so any thrown error becomes a `<tag>_error:<msg>`
 * source tag instead of bubbling up. Returns the raw value on
 * success, null on error.
 */
async function safeCall<T>(
  fn: () => Promise<T | null>,
  tag: string,
  sourceTags: string[],
): Promise<T | null> {
  try {
    const out = await fn();
    sourceTags.push(out !== null ? tag : `${tag}_empty`);
    return out;
  } catch (err) {
    sourceTags.push(
      `${tag}_error:` +
        (err instanceof Error ? err.message : 'unknown'),
    );
    return null;
  }
}

function makeEnrichmentData(args: {
  elevationFt: number | null;
  femaFloodZone: string | null;
  plssSection: string | null;
  plssTownship: string | null;
  plssRange: string | null;
  retrievedAt: string;
  sources: string[];
}): EnrichmentData {
  return {
    parcelId: null,
    legalDescription: null,
    acreage: null,
    femaFloodZone: args.femaFloodZone,
    plssSection: args.plssSection,
    plssTownship: args.plssTownship,
    plssRange: args.plssRange,
    elevationFt: args.elevationFt,
    source: args.sources.join(','),
    retrievedAt: args.retrievedAt,
  };
}
