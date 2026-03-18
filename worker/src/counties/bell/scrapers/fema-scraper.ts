/**
 * Bell County FEMA Flood Zone Scraper
 *
 * Queries FEMA's National Flood Hazard Layer (NFHL) ArcGIS REST API
 * to determine flood zone designation for a property. Also captures
 * a screenshot of the FEMA flood map.
 *
 * Data source: FEMA NFHL MapServer (public, no auth required)
 */

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';
import type { ScreenshotCapture, FemaFloodInfo } from '../types/research-result.js';
import { computeConfidence, SOURCE_RELIABILITY } from '../types/confidence.js';

// ── Types ────────────────────────────────────────────────────────────

export interface FemaSearchInput {
  lat: number;
  lon: number;
}

export interface FemaScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Query FEMA NFHL for flood zone information at the given coordinates.
 */
export async function scrapeBellFema(
  input: FemaSearchInput,
  onProgress: (p: FemaScraperProgress) => void,
): Promise<{ result: FemaFloodInfo | null; screenshots: ScreenshotCapture[]; urlsVisited: string[] }> {
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];

  const progress = (msg: string) => {
    onProgress({ phase: 'FEMA', message: msg, timestamp: new Date().toISOString() });
  };

  progress(`Querying FEMA flood zones at ${input.lat.toFixed(5)}, ${input.lon.toFixed(5)}`);

  // ── Query Flood Hazard Areas (Layer 28) ────────────────────────────
  // Try point query first, then fall back to envelope query with small buffer
  let floodResult = await queryFemaLayer(
    BELL_ENDPOINTS.fema.floodZonesLayer,
    input.lat,
    input.lon,
    urlsVisited,
  );

  if (!floodResult) {
    // Retry with a small envelope buffer (~100m) — point queries can miss
    // properties near flood zone boundaries
    progress('FEMA point query returned no data — retrying with buffer...');
    floodResult = await queryFemaLayerEnvelope(
      BELL_ENDPOINTS.fema.floodZonesLayer,
      input.lat,
      input.lon,
      0.001, // ~110m buffer
      urlsVisited,
    );
  }

  if (!floodResult) {
    progress('FEMA query returned no flood zone data — property may be in Zone X (unmapped/minimal flood risk)');
    // Return Zone X as default when no data found (most of Bell County is Zone X)
    const defaultResult: FemaFloodInfo = {
      floodZone: 'X (No data)',
      zoneSubtype: null,
      inSFHA: false,
      firmPanel: null,
      effectiveDate: null,
      mapScreenshot: null,
      sourceUrl: `https://msc.fema.gov/portal/search?AddressQuery=${input.lat},${input.lon}`,
      confidence: computeConfidence({
        sourceReliability: SOURCE_RELIABILITY['fema-nfhl'],
        dataUsefulness: 10,
        crossValidation: 0,
        sourceName: 'FEMA NFHL (no data at coordinates)',
        validatedBy: [],
        contradictedBy: [],
      }),
    };
    return { result: defaultResult, screenshots, urlsVisited };
  }

  // ── Query FIRM Panel (Layer 3) ─────────────────────────────────────
  const firmResult = await queryFemaLayer(
    BELL_ENDPOINTS.fema.firmPanelsLayer,
    input.lat,
    input.lon,
    urlsVisited,
  );

  const floodZone = String(floodResult.FLD_ZONE ?? 'UNKNOWN');
  const zoneSubtype = floodResult.ZONE_SUBTY ? String(floodResult.ZONE_SUBTY) : null;
  const inSFHA = String(floodResult.SFHA_TF ?? '').toUpperCase() === 'T';
  const firmPanel = firmResult ? String(firmResult.FIRM_PAN ?? '') : null;
  const effectiveDate = firmResult ? String(firmResult.EFF_DATE ?? '') : null;

  progress(`Flood zone: ${floodZone}${inSFHA ? ' (IN Special Flood Hazard Area)' : ''}`);

  const result: FemaFloodInfo = {
    floodZone,
    zoneSubtype,
    inSFHA,
    firmPanel,
    effectiveDate,
    mapScreenshot: null, // Will be captured by screenshot-collector
    sourceUrl: `https://msc.fema.gov/portal/search?AddressQuery=${input.lat},${input.lon}`,
    confidence: computeConfidence({
      sourceReliability: SOURCE_RELIABILITY['fema-nfhl'],
      dataUsefulness: 20, // Flood zone is useful but doesn't help with boundary
      crossValidation: 5, // Single authoritative source
      sourceName: 'FEMA NFHL',
      validatedBy: [],
      contradictedBy: [],
    }),
  };

  return { result, screenshots, urlsVisited };
}

// ── Internal: FEMA ArcGIS Query ──────────────────────────────────────

async function queryFemaLayer(
  layerNumber: number,
  lat: number,
  lon: number,
  urlsVisited: string[],
): Promise<Record<string, unknown> | null> {
  const baseUrl = `${BELL_ENDPOINTS.fema.mapServer}/${layerNumber}/query`;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });

  const fullUrl = `${baseUrl}?${params.toString()}`;
  urlsVisited.push(fullUrl);

  try {
    const resp = await fetch(fullUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUTS.arcgisQuery),
    });

    if (!resp.ok) return null;
    const data = await resp.json() as { features?: Array<{ attributes: Record<string, unknown> }> };

    if (data.features && data.features.length > 0) {
      return data.features[0].attributes;
    }
  } catch (err) {
    console.warn(
      `[fema-scraper] FEMA layer ${layerNumber} query failed: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return null;
}

/**
 * Query FEMA using an envelope (bounding box) instead of a point.
 * Used as fallback when point query returns no results.
 */
async function queryFemaLayerEnvelope(
  layerNumber: number,
  lat: number,
  lon: number,
  bufferDeg: number,
  urlsVisited: string[],
): Promise<Record<string, unknown> | null> {
  const baseUrl = `${BELL_ENDPOINTS.fema.mapServer}/${layerNumber}/query`;
  const envelope = `${lon - bufferDeg},${lat - bufferDeg},${lon + bufferDeg},${lat + bufferDeg}`;
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });

  const fullUrl = `${baseUrl}?${params.toString()}`;
  urlsVisited.push(fullUrl);

  try {
    const resp = await fetch(fullUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUTS.arcgisQuery),
    });

    if (!resp.ok) return null;
    const data = await resp.json() as { features?: Array<{ attributes: Record<string, unknown> }> };

    if (data.features && data.features.length > 0) {
      return data.features[0].attributes;
    }
  } catch (err) {
    console.warn(
      `[fema-scraper] FEMA envelope query for layer ${layerNumber} failed: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return null;
}
