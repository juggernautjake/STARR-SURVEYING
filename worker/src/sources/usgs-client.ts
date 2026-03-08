// worker/src/sources/usgs-client.ts — Phase 13 Module A
// USGS National Map / 3DEP Elevation client.
// Retrieves topographic contour lines, elevation data, and hydrography for a
// property location from the USGS National Map ArcGIS REST services.
//
// Spec §13.3 — USGS National Map Integration
//
// Data sources:
//   - 3DEP Elevation (1/3 arc-second, ~10m resolution): epqs point queries
//   - Contour lines: USGS National Contours ArcGIS FeatureServer
//   - National Hydrography Dataset (NHD): streams, rivers, water bodies
//   - NLCD Land Cover: land cover classification (21-class)

import { retryWithBackoff } from '../infra/resilience.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** Point elevation from USGS 3DEP */
export interface ElevationPoint {
  latitude: number;
  longitude: number;
  elevation_ft: number;
  elevation_m: number;
  data_source: '3DEP_1_3' | '3DEP_1' | '3DEP_2' | 'NED' | 'unknown';
  units: 'Feet' | 'Meters';
}

/** Contour line feature */
export interface ContourLine {
  elevation_ft: number;
  is_index: boolean;   // Index contours are labeled (every 5th contour)
  geometry_wkt?: string;
}

/** NHD water feature */
export interface WaterFeature {
  feature_type: 'stream' | 'river' | 'lake' | 'reservoir' | 'wetland' | 'canal' | 'ditch' | 'other';
  name: string | null;
  ftype: number;   // NHD feature type code
  fcode: number;   // NHD feature code
  permanent_id: string;
  reach_code?: string;
  gnis_name?: string | null;
}

/** Land cover classification from NLCD */
export interface LandCoverResult {
  dominant_class: number;
  dominant_class_label: string;
  imperviousness_pct?: number;   // 0-100, from NLCD Impervious Surface
}

/** Full topographic result for a property */
export interface TopoResult {
  project_id: string;
  query_lat: number;
  query_lon: number;
  query_radius_m: number;
  elevation: ElevationPoint | null;
  contours: ContourLine[];
  water_features: WaterFeature[];
  land_cover: LandCoverResult | null;
  slope_pct: number | null;    // Estimated slope from neighboring elevation points
  aspect_deg: number | null;   // Aspect (direction of steepest descent) 0-360
  elevation_range_ft: number | null; // Max - min elevation within radius
  queried_at: string;
  errors: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

// 3DEP Elevation Point Query Service
const USGS_EPQS_URL = 'https://epqs.nationalmap.gov/v1/json';

// National Contours (approximate URL - needs live verification)
const USGS_CONTOURS_URL =
  'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/1/query';

// NHD Flowline / Waterbody (NHDPlus HR)
const USGS_NHD_FLOWLINE_URL =
  'https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/2/query';
const USGS_NHD_WATERBODY_URL =
  'https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/4/query';

// NLCD Land Cover
const USGS_NLCD_URL =
  'https://www.mrlc.gov/geoserver/wcs';

/** Number of extra elevation points sampled for slope calculation */
const SLOPE_SAMPLE_OFFSET_DEG = 0.0001; // ~11 meters at Texas latitudes

// ── NLCD class code → human-readable label ──────────────────────────────────

const NLCD_LABELS: Record<number, string> = {
  11: 'Open Water',
  12: 'Perennial Ice/Snow',
  21: 'Developed, Open Space',
  22: 'Developed, Low Intensity',
  23: 'Developed, Medium Intensity',
  24: 'Developed, High Intensity',
  31: 'Barren Land (Rock/Sand/Clay)',
  41: 'Deciduous Forest',
  42: 'Evergreen Forest',
  43: 'Mixed Forest',
  52: 'Shrub/Scrub',
  71: 'Grassland/Herbaceous',
  81: 'Pasture/Hay',
  82: 'Cultivated Crops',
  90: 'Woody Wetlands',
  95: 'Emergent Herbaceous Wetlands',
};

// ── NHD FType → feature_type label ──────────────────────────────────────────

function nhdFTypeToLabel(
  ftype: number,
): WaterFeature['feature_type'] {
  if (ftype === 460 || ftype === 558) return 'stream';
  if (ftype === 428 || ftype === 420) return 'river';
  if (ftype === 390)                   return 'lake';
  if (ftype === 436)                   return 'reservoir';
  if (ftype === 466)                   return 'wetland';
  if (ftype === 336)                   return 'canal';
  if (ftype === 362)                   return 'ditch';
  return 'other';
}

// ── USGS Client ──────────────────────────────────────────────────────────────

export class USGSClient {
  private retryCount = 3;
  private retryDelay = 1500;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Fetch a complete topographic dataset for a coordinate and search radius.
   *
   * @param projectId  Research project correlation ID
   * @param lat        Latitude in decimal degrees (WGS84)
   * @param lon        Longitude in decimal degrees (WGS84)
   * @param radiusM    Search radius in metres (default 200m ≈ 656ft)
   */
  async getTopoData(
    projectId: string,
    lat: number,
    lon: number,
    radiusM = 200,
  ): Promise<TopoResult> {
    const result: TopoResult = {
      project_id: projectId,
      query_lat: lat,
      query_lon: lon,
      query_radius_m: radiusM,
      elevation: null,
      contours: [],
      water_features: [],
      land_cover: null,
      slope_pct: null,
      aspect_deg: null,
      elevation_range_ft: null,
      queried_at: new Date().toISOString(),
      errors: [],
    };

    await Promise.allSettled([
      this.fetchElevation(lat, lon).then(e => { result.elevation = e; }).catch(err => {
        result.errors.push(`elevation: ${String(err)}`);
      }),
      this.fetchContours(lat, lon, radiusM).then(c => { result.contours = c; }).catch(err => {
        result.errors.push(`contours: ${String(err)}`);
      }),
      this.fetchWaterFeatures(lat, lon, radiusM).then(w => { result.water_features = w; }).catch(err => {
        result.errors.push(`water_features: ${String(err)}`);
      }),
    ]);

    // Compute slope from neighboring elevation points (best-effort)
    if (result.elevation) {
      try {
        const [northEl, eastEl] = await Promise.all([
          this.fetchElevation(lat + SLOPE_SAMPLE_OFFSET_DEG, lon),
          this.fetchElevation(lat, lon + SLOPE_SAMPLE_OFFSET_DEG),
        ]);
        result.slope_pct = computeSlope(result.elevation.elevation_m, northEl.elevation_m, eastEl.elevation_m);
        result.aspect_deg = computeAspect(northEl.elevation_m - result.elevation.elevation_m,
          eastEl.elevation_m - result.elevation.elevation_m);
      } catch {
        // non-fatal — slope/aspect remain null
      }
    }

    // Compute elevation range from contours
    if (result.contours.length >= 2) {
      const elevs = result.contours.map(c => c.elevation_ft);
      result.elevation_range_ft = Math.max(...elevs) - Math.min(...elevs);
    }

    return result;
  }

  // ── Point Elevation ────────────────────────────────────────────────────────

  async fetchElevation(lat: number, lon: number): Promise<ElevationPoint> {
    const url = new URL(USGS_EPQS_URL);
    url.searchParams.set('x', String(lon));
    url.searchParams.set('y', String(lat));
    url.searchParams.set('units', 'Feet');
    url.searchParams.set('includeDate', 'false');

    const json = await retryWithBackoff(
      () => fetchJSON(url.toString()),
      { maxAttempts: this.retryCount, baseDelayMs: this.retryDelay },
    );

    const el = parseFloat(String(json?.value ?? json?.elevation ?? ''));
    if (isNaN(el)) {
      throw new Error(`USGS EPQS returned non-numeric elevation: ${JSON.stringify(json)}`);
    }

    return {
      latitude: lat,
      longitude: lon,
      elevation_ft: el,
      elevation_m: feetToMeters(el),
      data_source: (json?.data_source ?? 'unknown') as ElevationPoint['data_source'],
      units: 'Feet',
    };
  }

  // ── Contour Lines ──────────────────────────────────────────────────────────

  async fetchContours(lat: number, lon: number, radiusM: number): Promise<ContourLine[]> {
    const body = buildArcGISQueryParams({
      geometry: JSON.stringify({ x: lon, y: lat }),
      geometryType: 'esriGeometryPoint',
      distance: String(radiusM),
      units: 'esriSRUnit_Meter',
      inSR: '4326',
      outFields: 'ContourElevation,ContourType',
      f: 'json',
    });

    const json = await retryWithBackoff(
      () => fetchJSONPost(USGS_CONTOURS_URL, body),
      { maxAttempts: this.retryCount, baseDelayMs: this.retryDelay },
    );

    const features: Array<Record<string, unknown>> = (json as Record<string, unknown> | null)?.features as Array<Record<string, unknown>> ?? [];
    return features.map(f => {
      const attrs = (f.attributes ?? {}) as Record<string, unknown>;
      const elev = Number(attrs['ContourElevation'] ?? attrs['Contour'] ?? 0);
      const ctype = String(attrs['ContourType'] ?? '');
      return {
        elevation_ft: elev,
        is_index: ctype === '2' || ctype === 'Index',
      };
    });
  }

  // ── NHD Water Features ─────────────────────────────────────────────────────

  async fetchWaterFeatures(lat: number, lon: number, radiusM: number): Promise<WaterFeature[]> {
    const geom = JSON.stringify({ x: lon, y: lat });
    const baseParams: Record<string, string> = {
      geometry: geom,
      geometryType: 'esriGeometryPoint',
      distance: String(radiusM),
      units: 'esriSRUnit_Meter',
      inSR: '4326',
      outFields: 'GNIS_Name,FType,FCode,Permanent_Identifier,ReachCode',
      f: 'json',
    };

    const [flowlineJson, waterbodyJson] = await Promise.allSettled([
      retryWithBackoff(() => fetchJSONPost(USGS_NHD_FLOWLINE_URL, buildArcGISQueryParams(baseParams)), { maxAttempts: this.retryCount, baseDelayMs: this.retryDelay }),
      retryWithBackoff(() => fetchJSONPost(USGS_NHD_WATERBODY_URL, buildArcGISQueryParams(baseParams)), { maxAttempts: this.retryCount, baseDelayMs: this.retryDelay }),
    ]);

    const features: WaterFeature[] = [];

    if (flowlineJson.status === 'fulfilled') {
      for (const f of (flowlineJson.value?.features ?? []) as Array<Record<string, unknown>>) {
        const a = (f.attributes ?? {}) as Record<string, unknown>;
        features.push({
          feature_type: nhdFTypeToLabel(Number(a['FType'] ?? 0)),
          name: (a['GNIS_Name'] as string | null) ?? null,
          ftype: Number(a['FType'] ?? 0),
          fcode: Number(a['FCode'] ?? 0),
          permanent_id: String(a['Permanent_Identifier'] ?? ''),
          reach_code: (a['ReachCode'] as string) ?? undefined,
          gnis_name: (a['GNIS_Name'] as string | null) ?? null,
        });
      }
    }

    if (waterbodyJson.status === 'fulfilled') {
      for (const f of (waterbodyJson.value?.features ?? []) as Array<Record<string, unknown>>) {
        const a = (f.attributes ?? {}) as Record<string, unknown>;
        const ft = Number(a['FType'] ?? 0);
        features.push({
          feature_type: ft === 436 ? 'reservoir' : 'lake',
          name: (a['GNIS_Name'] as string | null) ?? null,
          ftype: ft,
          fcode: Number(a['FCode'] ?? 0),
          permanent_id: String(a['Permanent_Identifier'] ?? ''),
          gnis_name: (a['GNIS_Name'] as string | null) ?? null,
        });
      }
    }

    return features;
  }
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

function feetToMeters(ft: number): number {
  return ft * 0.3048;
}

/**
 * Estimate slope percentage from three elevation samples (centre, north, east).
 * Uses first-order finite difference: sqrt(dZ/dx² + dZ/dy²) / cell_size * 100
 * Cell size ≈ 11m at 0.0001° latitude increment.
 */
function computeSlope(centreM: number, northM: number, eastM: number): number {
  const cellM = SLOPE_SAMPLE_OFFSET_DEG * 111_000; // degrees → metres (~11m)
  const dZdx = (eastM - centreM) / cellM;
  const dZdy = (northM - centreM) / cellM;
  return Math.sqrt(dZdx * dZdx + dZdy * dZdy) * 100;
}

/**
 * Compute aspect in degrees (0° = North, clockwise).
 * dNorth = elevation difference heading north; dEast = east.
 */
function computeAspect(dNorth: number, dEast: number): number {
  const rad = Math.atan2(-dEast, dNorth);
  const deg = (rad * 180) / Math.PI;
  return (deg + 360) % 360;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchJSON(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`USGS HTTP ${res.status} for ${url}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function fetchJSONPost(
  url: string,
  body: URLSearchParams,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`USGS HTTP ${res.status} for ${url}`);
  return res.json() as Promise<Record<string, unknown>>;
}

function buildArcGISQueryParams(params: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams({
    returnGeometry: 'false',
    returnDistinctValues: 'false',
    ...params,
  });
  return p;
}

export const NLCD_CLASS_LABELS = NLCD_LABELS;
export { nhdFTypeToLabel, computeSlope, computeAspect };
