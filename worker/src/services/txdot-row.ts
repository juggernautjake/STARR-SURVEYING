// worker/src/services/txdot-row.ts
// TxDOT Right-of-Way Integration — Starr Software Spec v2.0 §11 / Phase 6 §6.5
//
// Method A (preferred — no Playwright): ArcGIS REST API query by geometry.
// Method B stub: RPAM Playwright fallback (full impl in txdot-rpam-client.ts).
//
// Data available: ROW parcels (polygons), ROW width, centerline geometry,
// acquisition dates, CSJ numbers, district, highway classification.
//
// Phase 6 additions:
//   - TXDOT_CENTERLINE_FEATURE_SERVER constant and queryTxDOTCenterlines()
//   - classifyRoad() now delegates to classifyRoadEnhanced() from road-classifier.ts
//   - queryTxDOTRow() sets queryMethod: 'none' when both ArcGIS and RPAM fail
//   - ArcGIS URL validation with clear error message on non-FeatureCollection response

import type { PipelineLogger } from '../lib/logger.js';
import { classifyRoadEnhanced, TXDOT_PREFIXES_MAP } from './road-classifier.js';

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

/**
 * TxDOT Roadway centerline FeatureServer (Phase 6 §6.5.1).
 * Provides multi-vertex paths that reveal road curvature.
 * Attribute fields: RTE_NM, RDBD_TYPE_CD, NBR_LNS, SURF_WD, SHLD_WD_LT, SHLD_WD_RT
 *
 * Note: TXDOT_ROW_FEATURE_SERVER covers ROW parcel polygons.
 * This constant is for the separate roadway centerline layer.
 */
const TXDOT_CENTERLINE_FEATURE_SERVER =
  'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0';

/** Road type prefixes that are TxDOT-maintained — derived from road-classifier.ts */
const TXDOT_PREFIXES = Object.keys(TXDOT_PREFIXES_MAP);

/** Seconds before an ArcGIS REST query times out */
const QUERY_TIMEOUT_S = 20;

// ── Road classification ───────────────────────────────────────────────────────

/**
 * Detect whether a road name indicates TxDOT maintenance.
 * Returns the highway type string (e.g., "FM", "SH") or null.
 *
 * This is a backward-compatible wrapper over classifyRoadEnhanced() from
 * road-classifier.ts. Phase 6 code should use classifyRoadEnhanced() directly.
 *
 * Examples:
 *   "FM 436"         → "FM"
 *   "SH 195"         → "SH"
 *   "Spur 436"       → "SP" (TxDOT spur system code)
 *   "Kent Oakley Rd" → null (county/city road)
 */
export function classifyRoad(roadName: string): TxDOTRoadSummary['hwyType'] | null {
  const classified = classifyRoadEnhanced(roadName);
  if (classified.maintainedBy !== 'txdot') return null;
  // Return the TxDOT system code (e.g., "FM", "SH", "SP", "LP")
  return (classified.highwaySystem ?? 'Unknown') as TxDOTRoadSummary['hwyType'];
}

/**
 * Check if any roads identified in the property research are TxDOT-maintained.
 * Returns road names that should trigger a TxDOT ROW query.
 */
export function getTxDOTRoads(roadNames: string[]): string[] {
  return roadNames.filter(name => classifyRoad(name) !== null);
}

// ── Centerline types (Phase 6 §6.5.1) ────────────────────────────────────────

export interface TxDOTCenterlineFeatureProperties {
  /** Route name (e.g., "FM 436") */
  RTE_NM: string;
  /** Route ID (internal TxDOT code) */
  RTE_ID?: string;
  /** Roadbed type code */
  RDBD_TYPE_CD?: string;
  /** Number of lanes */
  NBR_LNS?: number;
  /** Surface width in feet */
  SURF_WD?: number;
  /** Left shoulder width in feet */
  SHLD_WD_LT?: number;
  /** Right shoulder width in feet */
  SHLD_WD_RT?: number;
  [key: string]: unknown;
}

export interface TxDOTCenterlineFeature {
  type: 'Feature';
  geometry: {
    type: 'MultiLineString' | 'LineString';
    coordinates: number[][][] | number[][];
  } | null;
  properties: TxDOTCenterlineFeatureProperties;
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
 *
 * NOTE: If the ArcGIS service URL has changed (TxDOT occasionally moves services),
 * the response will not be a FeatureCollection. The code logs a clear error so
 * the developer can update TXDOT_ROW_FEATURE_SERVER.
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
    geometry:       `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}`,
    geometryType:   'esriGeometryEnvelope',
    spatialRel:     'esriSpatialRelIntersects',
    inSR:           '4326',         // WGS84 input
    outSR:          '4326',         // WGS84 output
    outFields:      '*',
    returnGeometry: 'true',
    f:              'geojson',
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

    const json = await res.json() as { type?: string; features?: unknown[]; error?: { message?: string } };

    // Detect service URL mismatch (TxDOT occasionally moves ArcGIS services)
    if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
      const errMsg = json.error?.message
        ?? 'Response is not a GeoJSON FeatureCollection — TxDOT service URL may have changed. Update TXDOT_ROW_FEATURE_SERVER.';
      tracker({ status: 'fail', error: errMsg });
      logger.warn('TxDOT-ROW', `ArcGIS ROW service validation failed: ${errMsg}`);
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

/**
 * Query the TxDOT roadway centerline FeatureServer for a given bounding box.
 * Returns multi-vertex polylines — more vertices = more curvature detail.
 * Used by Phase 6 RoadBoundaryResolver to detect straight vs. curved boundaries.
 *
 * NOTE: If the service URL changes, the code logs a clear error message.
 */
export async function queryTxDOTCenterlines(
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  logger: PipelineLogger,
): Promise<TxDOTCenterlineFeature[]> {
  const tracker = logger.startAttempt({
    layer: 'TxDOT-Centerlines',
    source: 'ArcGIS-REST',
    method: 'centerline-server-query',
    input: `bbox ${bounds.minLon.toFixed(5)},${bounds.minLat.toFixed(5)},...`,
  });

  const params = new URLSearchParams({
    geometry:       `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}`,
    geometryType:   'esriGeometryEnvelope',
    spatialRel:     'esriSpatialRelIntersects',
    inSR:           '4326',
    outSR:          '4326',
    outFields:      'RTE_NM,RTE_ID,RDBD_TYPE_CD,NBR_LNS,SURF_WD,SHLD_WD_LT,SHLD_WD_RT',
    returnGeometry: 'true',
    f:              'geojson',
  });

  const url = `${TXDOT_CENTERLINE_FEATURE_SERVER}/query?${params.toString()}`;
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

    const json = await res.json() as { type?: string; features?: unknown[]; error?: { message?: string } };

    if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
      const errMsg = json.error?.message
        ?? 'Centerline response is not a GeoJSON FeatureCollection — TxDOT centerline URL may have changed. Update TXDOT_CENTERLINE_FEATURE_SERVER.';
      tracker({ status: 'fail', error: errMsg });
      logger.warn('TxDOT-Centerlines', `Centerline service validation failed: ${errMsg}`);
      return [];
    }

    const features = json.features as TxDOTCenterlineFeature[];
    tracker({
      status: features.length > 0 ? 'success' : 'partial',
      dataPointsFound: features.length,
      details: `${features.length} centerline feature(s) returned`,
    });

    return features;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tracker({ status: 'fail', error: msg });
    logger.warn('TxDOT-Centerlines', `Centerline ArcGIS query failed: ${msg}`);
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
 * Falls back to Method B (Playwright RPAM via TxDOTRPAMClient) when
 * ArcGIS returns no features. Phase 6 wires in the real RPAM client from
 * txdot-rpam-client.ts via the optional rpamClient parameter.
 * When both methods fail, returns queryMethod: 'none'.
 *
 * @param bounds      WGS84 bounding box with a ~0.005° buffer added by caller
 * @param logger      Pipeline logger
 * @param rpamClient  Optional RPAM client for Playwright fallback (Phase 6)
 */
export async function queryTxDOTRow(
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  logger: PipelineLogger,
  rpamClient?: { navigateToLocation(lat: number, lon: number, outputDir: string): Promise<unknown> } | null,
): Promise<TxDOTRowResult> {
  logger.info('TxDOT-ROW', `Querying ROW data for bbox ${JSON.stringify(bounds)}`);

  const features = await queryTxDOTRowArcGIS(bounds, logger);

  if (features.length > 0) {
    const roads = featuresToRoads(features);
    logger.info('TxDOT-ROW', `Found ${features.length} ROW feature(s) across ${roads.length} road(s)`);
    return {
      queried: true, features, roads, foundROW: true,
      queryMethod: 'arcgis_rest', errorMessage: null,
    };
  }

  // Method B: Playwright RPAM fallback
  if (rpamClient) {
    logger.info('TxDOT-ROW', 'ArcGIS REST returned no features — trying RPAM Playwright fallback');
    try {
      // The center lat/lon is the midpoint of the bounds
      const lat = (bounds.minLat + bounds.maxLat) / 2;
      const lon = (bounds.minLon + bounds.maxLon) / 2;
      await rpamClient.navigateToLocation(lat, lon, '/tmp/txdot_rpam');
      // RPAM data is captured as screenshots; Phase 6 analyzes them separately.
      // Return partial result indicating RPAM was used.
      return {
        queried: true, features: [], roads: [], foundROW: false,
        queryMethod: 'playwright_fallback', errorMessage: null,
      };
    } catch (rpamErr) {
      const msg = rpamErr instanceof Error ? rpamErr.message : String(rpamErr);
      logger.warn('TxDOT-ROW', `RPAM Playwright fallback failed: ${msg}`);
      return {
        queried: true, features: [], roads: [], foundROW: false,
        queryMethod: 'none', errorMessage: `ArcGIS: no features; RPAM: ${msg}`,
      };
    }
  }

  // Both methods unavailable — return no-data result
  logger.info('TxDOT-ROW', 'ArcGIS REST returned no features — no RPAM client provided');
  return {
    queried: true, features: [], roads: [], foundROW: false,
    queryMethod: 'none', errorMessage: null,
  };
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
