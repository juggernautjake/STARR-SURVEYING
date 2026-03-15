/**
 * Bell County GIS Scraper
 *
 * Queries Bell CAD's ArcGIS FeatureServer for parcel data using spatial
 * queries, property ID lookups, and owner name searches. This is often
 * more reliable than the eSearch web UI for rural properties.
 *
 * Data source: ArcGIS Online hosted FeatureServer
 * No browser/Playwright needed — pure HTTP REST API.
 */

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';
import { GIS_FIELD_MAP, composeSitusAddress, getField, getNumericField } from '../config/field-maps.js';
import type { ScreenshotCapture } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface GisSearchResult {
  propertyId: string | null;
  ownerName: string | null;
  legalDescription: string | null;
  acreage: number | null;
  situsAddress: string | null;
  mapId: string | null;
  geoId: string | null;
  abstractSubdiv: string | null;
  /** Deed references found in GIS attributes */
  instrumentNumbers: string[];
  deedHistory: GisDeedEntry[];
  /** Parcel boundary polygon as [lon, lat] rings */
  parcelBoundary: number[][][] | null;
  /** Raw GIS attributes for the primary parcel */
  rawAttributes: Record<string, unknown>;
  /** All features found (for multi-parcel properties) */
  allFeatures: GisFeatureSummary[];
  screenshots: ScreenshotCapture[];
  urlsVisited: string[];
}

export interface GisDeedEntry {
  instrumentNumber?: string;
  volume?: string;
  page?: string;
  deedDate?: string;
}

export interface GisFeatureSummary {
  propertyId: string | null;
  ownerName: string | null;
  acreage: number | null;
  instrumentNumber: string | null;
}

export interface GisSearchInput {
  propertyId?: string;
  ownerName?: string;
  lat?: number | null;
  lon?: number | null;
  address?: string;
}

export interface GisScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Search Bell County GIS for parcel data.
 * Tries: property ID → spatial query → owner name.
 */
export async function scrapeBellGis(
  input: GisSearchInput,
  onProgress: (p: GisScraperProgress) => void,
): Promise<GisSearchResult | null> {
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];
  const layerUrl = BELL_ENDPOINTS.gis.parcelLayer;
  const queryUrl = `${layerUrl}${BELL_ENDPOINTS.gis.queryPath}`;

  const progress = (msg: string) => {
    onProgress({ phase: 'GIS', message: msg, timestamp: new Date().toISOString() });
  };

  // ── Approach 1: Property ID Lookup ─────────────────────────────────
  if (input.propertyId) {
    progress(`Querying GIS by property ID: ${input.propertyId}`);

    for (const field of GIS_FIELD_MAP.propertyId) {
      const result = await queryLayer(queryUrl, {
        where: `${field}='${input.propertyId}'`,
        outFields: '*',
        returnGeometry: 'true',
      }, urlsVisited);

      if (result && result.features.length > 0) {
        progress(`Found ${result.features.length} parcel(s) by property ID`);
        return buildResult(result.features, screenshots, urlsVisited);
      }
    }
  }

  // ── Approach 2: Spatial Query (lat/lon) ────────────────────────────
  if (input.lat && input.lon) {
    progress(`Querying GIS by coordinates: ${input.lat.toFixed(5)}, ${input.lon.toFixed(5)}`);

    const delta = 0.0005; // ~55m envelope
    const envelope = `${input.lon - delta},${input.lat - delta},${input.lon + delta},${input.lat + delta}`;

    const result = await queryLayer(queryUrl, {
      geometry: envelope,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outFields: '*',
      returnGeometry: 'true',
    }, urlsVisited);

    if (result && result.features.length > 0) {
      progress(`Found ${result.features.length} parcel(s) by spatial query`);
      return buildResult(result.features, screenshots, urlsVisited);
    }

    // Widen the envelope and retry
    const deltaWide = 0.002; // ~220m
    progress('Widening spatial search envelope...');
    const wideEnvelope = `${input.lon - deltaWide},${input.lat - deltaWide},${input.lon + deltaWide},${input.lat + deltaWide}`;

    const wideResult = await queryLayer(queryUrl, {
      geometry: wideEnvelope,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outFields: '*',
      returnGeometry: 'true',
    }, urlsVisited);

    if (wideResult && wideResult.features.length > 0) {
      progress(`Found ${wideResult.features.length} parcel(s) with widened search`);
      return buildResult(wideResult.features, screenshots, urlsVisited);
    }
  }

  // ── Approach 3: Owner Name Search ──────────────────────────────────
  if (input.ownerName) {
    progress(`Querying GIS by owner name: ${input.ownerName}`);
    const safeName = input.ownerName.replace(/'/g, "''").toUpperCase();

    for (const field of GIS_FIELD_MAP.ownerName) {
      const result = await queryLayer(queryUrl, {
        where: `UPPER(${field}) LIKE '${safeName}%'`,
        outFields: '*',
        returnGeometry: 'true',
      }, urlsVisited);

      if (result && result.features.length > 0 && result.features.length <= 50) {
        progress(`Found ${result.features.length} parcel(s) by owner name`);
        return buildResult(result.features, screenshots, urlsVisited);
      }
    }
  }

  progress('GIS search exhausted — no parcels found');
  return null;
}

/**
 * Find all adjacent parcels to a given parcel boundary.
 * Uses a buffered spatial query around the parcel geometry.
 */
export async function findAdjacentParcels(
  parcelBoundary: number[][][],
  onProgress: (p: GisScraperProgress) => void,
): Promise<GisSearchResult[]> {
  const queryUrl = `${BELL_ENDPOINTS.gis.parcelLayer}${BELL_ENDPOINTS.gis.queryPath}`;
  const urlsVisited: string[] = [];

  // Compute bounding box of the parcel with buffer
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of parcelBoundary) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  // Buffer by ~100m
  const buffer = 0.001;
  const envelope = `${minLon - buffer},${minLat - buffer},${maxLon + buffer},${maxLat + buffer}`;

  onProgress({ phase: 'GIS', message: 'Searching for adjacent parcels...', timestamp: new Date().toISOString() });

  const result = await queryLayer(queryUrl, {
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: '*',
    returnGeometry: 'true',
  }, urlsVisited);

  if (!result || result.features.length === 0) return [];

  onProgress({ phase: 'GIS', message: `Found ${result.features.length} parcels in vicinity`, timestamp: new Date().toISOString() });

  // Group by property ID, each becomes its own result
  const grouped = new Map<string, typeof result.features>();
  for (const feat of result.features) {
    const pid = getField(feat.attributes, [...GIS_FIELD_MAP.propertyId]) ?? 'unknown';
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(feat);
  }

  const adjacentResults: GisSearchResult[] = [];
  for (const [, features] of grouped) {
    adjacentResults.push(buildResult(features, [], urlsVisited));
  }

  return adjacentResults;
}

// ── Internal: ArcGIS REST Query ──────────────────────────────────────

interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: { rings?: number[][][] };
}

interface ArcGisQueryResult {
  features: ArcGisFeature[];
}

async function queryLayer(
  url: string,
  params: Record<string, string>,
  urlsVisited: string[],
): Promise<ArcGisQueryResult | null> {
  const qs = new URLSearchParams({ ...params, f: 'json' }).toString();
  const fullUrl = `${url}?${qs}`;
  urlsVisited.push(fullUrl);

  try {
    const resp = await fetch(fullUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUTS.arcgisQuery),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as ArcGisQueryResult;
    if (!json.features) return null;
    return json;
  } catch {
    return null;
  }
}

// ── Internal: Build Result from Features ─────────────────────────────

function buildResult(
  features: ArcGisFeature[],
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): GisSearchResult {
  const primary = features[0];
  const attrs = primary.attributes;

  // Collect instrument numbers from all features
  const allInstrumentNumbers = new Set<string>();
  const allDeedHistory: GisDeedEntry[] = [];
  const allFeatures: GisFeatureSummary[] = [];

  for (const feat of features) {
    const a = feat.attributes;
    const instrNum = getField(a, [...GIS_FIELD_MAP.instrumentNumber]);
    const volume = getField(a, [...GIS_FIELD_MAP.volume]);
    const page = getField(a, [...GIS_FIELD_MAP.page]);
    const deedDate = getField(a, [...GIS_FIELD_MAP.deedDate]);

    if (instrNum) allInstrumentNumbers.add(instrNum);
    if (instrNum || volume || deedDate) {
      allDeedHistory.push({ instrumentNumber: instrNum ?? undefined, volume: volume ?? undefined, page: page ?? undefined, deedDate: deedDate ?? undefined });
    }

    allFeatures.push({
      propertyId: getField(a, [...GIS_FIELD_MAP.propertyId]),
      ownerName: getField(a, [...GIS_FIELD_MAP.ownerName]),
      acreage: getNumericField(a, [...GIS_FIELD_MAP.acreage]),
      instrumentNumber: instrNum,
    });
  }

  // Concatenate legal_desc and legal_desc2
  const legal1 = getField(attrs, ['legal_desc']) ?? '';
  const legal2 = getField(attrs, ['legal_desc2']) ?? '';
  const legalDesc = [legal1, legal2].filter(Boolean).join(' ') || null;

  return {
    propertyId: getField(attrs, [...GIS_FIELD_MAP.propertyId]),
    ownerName: getField(attrs, [...GIS_FIELD_MAP.ownerName]),
    legalDescription: legalDesc,
    acreage: getNumericField(attrs, [...GIS_FIELD_MAP.acreage]),
    situsAddress: composeSitusAddress(attrs),
    mapId: getField(attrs, [...GIS_FIELD_MAP.mapId]),
    geoId: getField(attrs, [...GIS_FIELD_MAP.geoId]),
    abstractSubdiv: getField(attrs, [...GIS_FIELD_MAP.abstractSubdiv]),
    instrumentNumbers: [...allInstrumentNumbers],
    deedHistory: allDeedHistory,
    parcelBoundary: primary.geometry?.rings ?? null,
    rawAttributes: attrs,
    allFeatures,
    screenshots,
    urlsVisited,
  };
}
