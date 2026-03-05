// worker/src/services/txdot-row.ts
// TxDOT Right-of-Way Integration — Starr Software Spec v2.0 §11
//
// Method A (preferred — no Playwright): ArcGIS REST API query by geometry.
// Method B stub: RPAM Playwright fallback (returns null; full impl deferred).
//
// Data available: ROW parcels (polygons), ROW width, centerline geometry,
// acquisition dates, CSJ numbers, district, highway classification.

import type { PipelineLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TxDOTRowFeatureProperties {
  /** Control-Section-Job number (e.g., "0436-04-042") */
  CSJ?: string;
  /** Highway name as TxDOT classifies it (e.g., "FM 436") */
  HWY?: string;
  /** ROW width in feet */
  ROW_WIDTH?: number | null;
  /** Date TxDOT acquired this parcel */
  ACQUISITION_DATE?: string | null;
  /** Deed reference for the acquisition */
  DEED_REF?: string | null;
  /** TxDOT district name */
  DISTRICT?: string | null;
  /** Highway type code (FM, SH, IH, US, SL, BS, Spur, PR, RM, RE) */
  HWY_TYPE?: string | null;
  /** Any additional attributes returned by the service */
  [key: string]: unknown;
}

export interface TxDOTRowFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  } | null;
  properties: TxDOTRowFeatureProperties;
}

export interface TxDOTRoadSummary {
  name: string;
  hwyType: 'FM' | 'SH' | 'US' | 'IH' | 'SL' | 'BS' | 'Spur' | 'RM' | 'RE' | 'PR' | 'Unknown';
  csjNumbers: string[];
  estimatedRowWidth_ft: number | null;
  district: string | null;
  acquisitionDates: string[];
  deedReferences: string[];
  /** True when TxDOT data resolves the "straight vs curved" boundary question */
  hasCenterlineGeometry: boolean;
}

export interface TxDOTRowResult {
  queried: boolean;
  features: TxDOTRowFeature[];
  roads: TxDOTRoadSummary[];
  /** True if any ROW features intersect the query bounds */
  foundROW: boolean;
  queryMethod: 'arcgis_rest' | 'playwright_fallback' | 'none';
  errorMessage: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TXDOT_ROW_FEATURE_SERVER =
  'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_ROW/FeatureServer/0';

/** Road type prefixes that are TxDOT-maintained */
const TXDOT_PREFIXES = ['FM', 'RM', 'SH', 'US', 'IH', 'SL', 'BS', 'SPUR', 'PR', 'RE'];

/** Seconds before the ArcGIS REST query times out */
const QUERY_TIMEOUT_S = 20;

// ── Road classification ───────────────────────────────────────────────────────

/**
 * Detect whether a road name indicates TxDOT maintenance.
 * Returns the highway type or null if it's a county/private road.
 *
 * Examples:
 *   "FM 436"        → "FM"
 *   "SH 195"        → "SH"
 *   "Kent Oakley Rd" → null (county road)
 */
export function classifyRoad(roadName: string): TxDOTRoadSummary['hwyType'] | null {
  const upper = roadName.toUpperCase().replace(/[.\-]/g, ' ').trim();

  for (const prefix of TXDOT_PREFIXES) {
    if (upper.startsWith(prefix + ' ') || upper === prefix) {
      return prefix as TxDOTRoadSummary['hwyType'];
    }
  }

  return null;  // county road or private road
}

/**
 * Check if any roads identified in the property research are TxDOT-maintained.
 * Returns road names that should trigger a TxDOT ROW query.
 */
export function getTxDOTRoads(roadNames: string[]): string[] {
  return roadNames.filter(name => classifyRoad(name) !== null);
}

// ── Method A: ArcGIS REST API ─────────────────────────────────────────────────

/**
 * Query the TxDOT ROW FeatureServer for parcels that intersect the given
 * bounding box. Coordinates must be in WGS84 (lat/lon).
 *
 * The spec recommends converting from NAD83 Texas Central to WGS84 first.
 * For Bell County, the offset is small (~0.0001°) and can be ignored for
 * bounding-box queries. Use the property's approximate lat/lon center with
 * a 0.01° buffer (roughly 1,000m in central Texas).
 */
async function queryTxDOTRowArcGIS(
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  logger: PipelineLogger,
): Promise<TxDOTRowFeature[]> {
  const tracker = logger.startAttempt({
    layer: 'TxDOT-ROW',
    source: 'ArcGIS-REST',
    method: 'feature-server-query',
    input: `bbox ${bounds.minLon.toFixed(5)},${bounds.minLat.toFixed(5)},${bounds.maxLon.toFixed(5)},${bounds.maxLat.toFixed(5)}`,
  });

  const params = new URLSearchParams({
    geometry:     `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}`,
    geometryType: 'esriGeometryEnvelope',
    spatialRel:   'esriSpatialRelIntersects',
    inSR:         '4326',         // WGS84 input
    outSR:        '4326',         // WGS84 output
    outFields:    '*',
    returnGeometry: 'true',
    f:            'geojson',
  });

  const url = `${TXDOT_ROW_FEATURE_SERVER}/query?${params.toString()}`;
  tracker.step(`GET ${url}`);

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(QUERY_TIMEOUT_S * 1000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      tracker({ status: 'fail', error: `HTTP ${res.status}: ${res.statusText}` });
      return [];
    }

    const json = await res.json() as { type?: string; features?: unknown[] };

    if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
      tracker({ status: 'fail', error: 'Response is not a GeoJSON FeatureCollection' });
      return [];
    }

    const features = json.features as TxDOTRowFeature[];
    tracker({
      status: features.length > 0 ? 'success' : 'partial',
      dataPointsFound: features.length,
      details: `${features.length} ROW feature(s) returned`,
    });

    return features;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tracker({ status: 'fail', error: msg });
    logger.warn('TxDOT-ROW', `ArcGIS REST query failed: ${msg}`);
    return [];
  }
}

// ── Feature → road summary conversion ────────────────────────────────────────

function featuresToRoads(features: TxDOTRowFeature[]): TxDOTRoadSummary[] {
  // Group by highway name (HWY field)
  const byHwy = new Map<string, TxDOTRowFeature[]>();

  for (const f of features) {
    const hwy = String(f.properties.HWY ?? 'Unknown').trim();
    const existing = byHwy.get(hwy) ?? [];
    existing.push(f);
    byHwy.set(hwy, existing);
  }

  const roads: TxDOTRoadSummary[] = [];

  for (const [hwyName, hwyFeatures] of byHwy) {
    const props     = hwyFeatures.map(f => f.properties);
    const csjSet    = new Set(props.map(p => p.CSJ).filter(Boolean) as string[]);
    const dateSet   = new Set(props.map(p => p.ACQUISITION_DATE).filter(Boolean) as string[]);
    const deedSet   = new Set(props.map(p => p.DEED_REF).filter(Boolean) as string[]);
    const widths    = props.map(p => p.ROW_WIDTH).filter((w): w is number => typeof w === 'number' && w > 0);
    const district  = props.find(p => p.DISTRICT)?.DISTRICT ?? null;
    const hwyTypeRaw = props.find(p => p.HWY_TYPE)?.HWY_TYPE ?? null;

    // Determine HWY type from name or type field
    const detectedType = classifyRoad(hwyName);
    const hwyType = (
      hwyTypeRaw && TXDOT_PREFIXES.includes(String(hwyTypeRaw).toUpperCase())
        ? String(hwyTypeRaw).toUpperCase()
        : (detectedType ?? 'Unknown')
    ) as TxDOTRoadSummary['hwyType'];

    roads.push({
      name:                hwyName,
      hwyType,
      csjNumbers:          Array.from(csjSet),
      estimatedRowWidth_ft: widths.length > 0 ? Math.max(...widths) : null,
      district:            typeof district === 'string' ? district : null,
      acquisitionDates:    Array.from(dateSet),
      deedReferences:      Array.from(deedSet),
      hasCenterlineGeometry: hwyFeatures.some(f => f.geometry !== null),
    });
  }

  return roads;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Query TxDOT ROW data for a property bounding box.
 *
 * Uses Method A (ArcGIS REST API) by default.
 * Falls back to Method B (Playwright RPAM) stub — returns empty result
 * (full Playwright RPAM implementation deferred to a future phase).
 *
 * @param bounds    WGS84 bounding box with a ~0.005° buffer added by caller
 * @param logger    Pipeline logger
 */
export async function queryTxDOTRow(
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  logger: PipelineLogger,
): Promise<TxDOTRowResult> {
  logger.info('TxDOT-ROW', `Querying ROW data for bbox ${JSON.stringify(bounds)}`);

  const features = await queryTxDOTRowArcGIS(bounds, logger);

  if (features.length > 0) {
    const roads = featuresToRoads(features);
    logger.info('TxDOT-ROW', `Found ${features.length} ROW feature(s) across ${roads.length} road(s)`);
    return { queried: true, features, roads, foundROW: true, queryMethod: 'arcgis_rest', errorMessage: null };
  }

  // Method B stub — Playwright RPAM fallback not yet implemented
  logger.info('TxDOT-ROW', 'ArcGIS REST returned no features — Playwright RPAM fallback not yet implemented');
  return { queried: true, features: [], roads: [], foundROW: false, queryMethod: 'arcgis_rest', errorMessage: null };
}

/**
 * Helper: build a bounding box from a latitude/longitude center point.
 * Uses a 0.005° buffer (~550m in central Texas) which covers typical
 * parcels from 1–200 acres.
 */
export function buildBoundsFromCenter(
  lat: number,
  lon: number,
  bufferDeg = 0.005,
): { minLat: number; minLon: number; maxLat: number; maxLon: number } {
  return {
    minLat: lat - bufferDeg,
    maxLat: lat + bufferDeg,
    minLon: lon - bufferDeg,
    maxLon: lon + bufferDeg,
  };
}
