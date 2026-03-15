// worker/src/sources/txdot-roadways-client.ts
// TxDOT Roadways FeatureServer — ArcGIS REST client for roadway centerlines.
//
// Confirmed live as of March 2026:
//   https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer
//   Layer 0: TxDOT Roadways (esriGeometryPolyline)
//   Max Record Count: 2000 | Update: Monthly | Spatial Ref: 102100 (Web Mercator)
//
// This client is distinct from txdot-row.ts (which queries ROW parcel polygons).
// This client queries roadway centerlines — functional class, ROW width, surface type.
//
// Bell County bounding box (WGS84): -98.17, 30.69, -97.10, 31.34
// Bell County FIPS: 48027

import { retryWithBackoff } from '../infra/resilience.js';

// ── Constants ────────────────────────────────────────────────────────────────

const TXDOT_ROADWAYS_URL =
  'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0/query';

const TXDOT_FUNCTIONAL_CLASS_URL =
  'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Functional_Classification/FeatureServer/0/query';

// Bell County bounding box for bbox queries (WGS84 degrees)
export const BELL_COUNTY_BBOX: [number, number, number, number] = [-98.17, 30.69, -97.10, 31.34];

// Max records per ArcGIS REST query
const MAX_RECORDS_PER_QUERY = 2000;

// Approximate conversion: 1 geographic degree ≈ 69 statute miles (latitude).
// This is a rough estimate only — longitude degrees vary by latitude.
// Suitable for display/sorting purposes, not survey-grade distance computation.
const DEGREES_TO_MILES_APPROX = 69;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Functional classification codes used by TxDOT (FHWA standard).
 * Higher numbers = lower classification (rural minor collector, etc.)
 */
export type FunctionalClass =
  | 'Interstate'
  | 'Principal Arterial - Other Freeways & Expressways'
  | 'Principal Arterial - Other'
  | 'Minor Arterial'
  | 'Major Collector'
  | 'Minor Collector'
  | 'Local'
  | 'Unknown';

/** A single roadway segment from the TxDOT Roadways FeatureServer */
export interface TxDOTRoadway {
  /** Route name (e.g., "IH0035-S", "FM0436") */
  routeName: string;
  /** County name (e.g., "Bell") */
  countyName: string;
  /** Functional classification */
  functionalClass: FunctionalClass;
  /** Right-of-way width in feet (0 if unknown) */
  rowWidthFeet: number;
  /** Surface type (e.g., "Concrete", "Asphalt", "Gravel") */
  surfaceType: string;
  /** Road segment geometry as WGS84 coordinate pairs [[lon, lat], ...] */
  geometry: [number, number][] | null;
  /** Length of segment in miles */
  lengthMiles: number | null;
}

/** Result from a TxDOT Roadways query */
export interface TxDOTRoadwaysResult {
  roadways: TxDOTRoadway[];
  /** Total features returned */
  featureCount: number;
  /** Whether the query hit the 2000-record limit (more may exist) */
  maxRecordsHit: boolean;
  /** Bounding box or centroid used for the query */
  queryArea: {
    type: 'bbox' | 'point';
    coordinates: number[];
  };
  /** ISO timestamp */
  fetchedAt: string;
  error?: string;
}

// ── TxDOT Roadways Client ─────────────────────────────────────────────────────

/**
 * Client for the TxDOT Roadways FeatureServer (ArcGIS REST).
 *
 * Queries roadway centerlines including functional class, ROW width,
 * and surface type.  Useful for:
 *   • Identifying road type adjacent to a survey parcel
 *   • Determining ROW width for boundary calculations
 *   • Cross-referencing with TxDOT ROW Hub polygon data
 *
 * No authentication required — this is a public ArcGIS service.
 */
export class TxDOTRoadwaysClient {

  /**
   * Query roadways within a bounding box (WGS84 degrees).
   *
   * @param bbox [minLon, minLat, maxLon, maxLat]
   * @param resultOffset For pagination (0-based)
   */
  async queryByBbox(
    bbox: [number, number, number, number] = BELL_COUNTY_BBOX,
    resultOffset = 0,
  ): Promise<TxDOTRoadwaysResult> {
    const fetchedAt = new Date().toISOString();

    const params = new URLSearchParams({
      where: '1=1',
      geometry: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      outSR: '4326',
      outFields: 'RTE_NM,CNTY_NM,FUNC_CLS,ROW_WIDTH,SURF_TYPE,Shape__Length',
      returnGeometry: 'true',
      resultRecordCount: String(MAX_RECORDS_PER_QUERY),
      resultOffset: String(resultOffset),
      f: 'json',
    });

    try {
      const response = await retryWithBackoff(
        async () => {
          const res = await fetch(`${TXDOT_ROADWAYS_URL}?${params}`, {
            signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
        { maxAttempts: 3, baseDelayMs: 2_000 },
      );

      const features = Array.isArray(response?.features) ? response.features : [];
      const roadways = features.map((f: unknown) => this.parseFeature(f)).filter(
        (r: TxDOTRoadway | null): r is TxDOTRoadway => r !== null,
      );

      return {
        roadways,
        featureCount: roadways.length,
        maxRecordsHit: roadways.length >= MAX_RECORDS_PER_QUERY,
        queryArea: { type: 'bbox', coordinates: [...bbox] },
        fetchedAt,
      };
    } catch (err) {
      return {
        roadways: [],
        featureCount: 0,
        maxRecordsHit: false,
        queryArea: { type: 'bbox', coordinates: [...bbox] },
        fetchedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Query roadways near a centroid point (search radius in feet).
   *
   * @param centroid [longitude, latitude] WGS84
   * @param radiusFeet Search radius (default 1320 ft = 0.25 mi)
   */
  async queryByCentroid(
    centroid: [number, number],
    radiusFeet = 1320,
  ): Promise<TxDOTRoadwaysResult> {
    const fetchedAt = new Date().toISOString();

    const params = new URLSearchParams({
      geometry: JSON.stringify({ x: centroid[0], y: centroid[1], spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(radiusFeet),
      units: 'esriSRUnit_Foot',
      inSR: '4326',
      outSR: '4326',
      outFields: 'RTE_NM,CNTY_NM,FUNC_CLS,ROW_WIDTH,SURF_TYPE,Shape__Length',
      returnGeometry: 'true',
      resultRecordCount: String(MAX_RECORDS_PER_QUERY),
      f: 'json',
    });

    try {
      const response = await retryWithBackoff(
        async () => {
          const res = await fetch(`${TXDOT_ROADWAYS_URL}?${params}`, {
            signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
        { maxAttempts: 3, baseDelayMs: 2_000 },
      );

      const features = Array.isArray(response?.features) ? response.features : [];
      const roadways = features.map((f: unknown) => this.parseFeature(f)).filter(
        (r: TxDOTRoadway | null): r is TxDOTRoadway => r !== null,
      );

      return {
        roadways,
        featureCount: roadways.length,
        maxRecordsHit: roadways.length >= MAX_RECORDS_PER_QUERY,
        queryArea: { type: 'point', coordinates: [...centroid] },
        fetchedAt,
      };
    } catch (err) {
      return {
        roadways: [],
        featureCount: 0,
        maxRecordsHit: false,
        queryArea: { type: 'point', coordinates: [...centroid] },
        fetchedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get all roadways for Bell County (full county bbox query with pagination).
   *
   * Makes multiple requests if the result count hits the 2000-record limit.
   * Returns all roadways found up to `maxRecords`.
   */
  async queryBellCounty(maxRecords = 10_000): Promise<TxDOTRoadwaysResult> {
    const fetchedAt = new Date().toISOString();
    const allRoadways: TxDOTRoadway[] = [];
    let offset = 0;
    let totalError: string | undefined;

    while (allRoadways.length < maxRecords) {
      const page = await this.queryByBbox(BELL_COUNTY_BBOX, offset);
      if (page.error) {
        totalError = page.error;
        break;
      }
      allRoadways.push(...page.roadways);
      if (!page.maxRecordsHit) break; // no more pages
      offset += MAX_RECORDS_PER_QUERY;
      await new Promise((resolve) => setTimeout(resolve, 1_000)); // politeness delay
    }

    return {
      roadways: allRoadways,
      featureCount: allRoadways.length,
      maxRecordsHit: allRoadways.length >= maxRecords,
      queryArea: { type: 'bbox', coordinates: [...BELL_COUNTY_BBOX] },
      fetchedAt,
      ...(totalError ? { error: totalError } : {}),
    };
  }

  /**
   * Determine the most likely functional class label for a given numeric code.
   * TxDOT uses FHWA functional classification system (1–7 for urban/rural variants).
   */
  parseFunctionalClass(rawValue: unknown): FunctionalClass {
    const val = String(rawValue ?? '').toLowerCase();
    if (val.includes('interstate') || val === '1' || val === '11') return 'Interstate';
    if (val.includes('freeway') || val.includes('expressway') || val === '2' || val === '12')
      return 'Principal Arterial - Other Freeways & Expressways';
    // Check for 'minor arterial' BEFORE the generic 'arterial' to avoid false positives
    if (val.includes('minor arterial') || val === '4' || val === '16') return 'Minor Arterial';
    // Check for 'minor collector' BEFORE generic 'collector'
    if (val.includes('minor collector') || val === '6' || val === '18') return 'Minor Collector';
    if (val.includes('major collector') || val === '5' || val === '17') return 'Major Collector';
    if (val.includes('principal') || val.includes('arterial') || val === '3' || val === '14')
      return 'Principal Arterial - Other';
    if (val.includes('local') || val === '7' || val === '19') return 'Local';
    return 'Unknown';
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private parseFeature(f: unknown): TxDOTRoadway | null {
    if (!f || typeof f !== 'object') return null;
    const feature = f as { attributes?: Record<string, unknown>; geometry?: { paths?: number[][][] } };
    const a = feature.attributes ?? {};

    // Extract geometry paths (polyline) → flatten to first path
    let geometry: [number, number][] | null = null;
    if (feature.geometry?.paths?.length) {
      const firstPath = feature.geometry.paths[0];
      geometry = firstPath.map((pt) => [pt[0], pt[1]] as [number, number]);
    }

    // Compute approximate length in miles from path coordinates
    let lengthMiles: number | null = null;
    const rawLength = a['Shape__Length'];
    if (typeof rawLength === 'number' && rawLength > 0) {
      // Shape__Length is in the output spatial reference units (degrees for outSR=4326).
      lengthMiles = rawLength * DEGREES_TO_MILES_APPROX;
    }

    return {
      routeName: String(a['RTE_NM'] ?? a['rte_nm'] ?? ''),
      countyName: String(a['CNTY_NM'] ?? a['cnty_nm'] ?? ''),
      functionalClass: this.parseFunctionalClass(a['FUNC_CLS'] ?? a['func_cls']),
      rowWidthFeet: Number(a['ROW_WIDTH'] ?? a['row_width'] ?? 0),
      surfaceType: String(a['SURF_TYPE'] ?? a['surf_type'] ?? ''),
      geometry,
      lengthMiles,
    };
  }
}
