// lib/research/bell-cad-arcgis.service.ts — Bell County CAD ArcGIS REST API integration
//
// Queries the Bell CAD public ArcGIS FeatureServer to retrieve parcel data,
// boundary geometry, abstracts, subdivisions, flood zones, and more.
//
// Primary service URL:
//   https://services7.arcgis.com/EHW2HuuyZNO7DZct/arcgis/rest/services/BellCADWebService/FeatureServer
//
// Layers:
//   0  Parcels          (Polygon)  — owner, legal desc, values, deed info, situs address
//   1  Abstracts         (Polygon)  — original survey abstract boundaries
//   2  City Limits       (Polygon)  — city boundary polygons
//   3  Subdivisions      (Polygon)  — subdivision boundaries with code/description
//   4  School Districts  (Polygon)  — school district boundaries
//   5  Lot Lines         (Polyline) — platted lot line segments with dimensions
//   6  Land Hook         (Polyline) — land hook lines
//   7  Military Boundary (Polyline) — Fort Cavazos boundary
//   8  Streets           (Polyline) — street centerlines with address ranges
//   9  Bell County Boundary (Polygon) — county outline
//  10  Texas Counties    (Polygon)  — all TX county outlines
//
// Spatial Reference: WKID 2277 (NAD83 Texas North Central, US Feet)
// Max Record Count: 2,000 (32,000 without geometry)
// Export Formats: CSV, Shapefile, GeoJSON, KML, GeoPackage, FileGDB, Excel

// ── Constants ────────────────────────────────────────────────────────────────

const BELL_CAD_FEATURE_SERVER =
  'https://services7.arcgis.com/EHW2HuuyZNO7DZct/arcgis/rest/services/BellCADWebService/FeatureServer';

/** Layer IDs in the Bell CAD FeatureServer */
export const BELL_CAD_LAYERS = {
  PARCELS: 0,
  ABSTRACTS: 1,
  CITY_LIMITS: 2,
  SUBDIVISIONS: 3,
  SCHOOL_DISTRICTS: 4,
  LOT_LINES: 5,
  LAND_HOOK: 6,
  MILITARY_BOUNDARY: 7,
  STREETS: 8,
  BELL_COUNTY_BOUNDARY: 9,
  TEXAS_COUNTIES: 10,
} as const;

export type BellCadLayerId = (typeof BELL_CAD_LAYERS)[keyof typeof BELL_CAD_LAYERS];

/** FEMA Flood Hazard Zone layer used in the Bell CAD web map */
const FEMA_FLOOD_LAYER = 'https://hazards.fema.gov/arcgis/rest/services/FIRMette/NFHLREST_FIRMette/MapServer/20';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RECORD_COUNT = 2_000;

// ── Types ────────────────────────────────────────────────────────────────────

/** Raw ArcGIS feature from the REST API */
export interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: ArcGisGeometry;
}

export interface ArcGisGeometry {
  rings?: number[][][];     // polygon rings
  paths?: number[][][];     // polyline paths
  x?: number;               // point x
  y?: number;               // point y
  spatialReference?: { wkid: number; latestWkid?: number };
}

interface ArcGisQueryResponse {
  features?: ArcGisFeature[];
  error?: { code?: number; message?: string; details?: string[] };
  exceededTransferLimit?: boolean;
}

/** Parsed Bell CAD parcel record */
export interface BellCadParcel {
  prop_id: number;
  prop_id_text: string;
  file_as_name: string;
  legal_acreage: number | null;
  hood_cd: string | null;
  school: string | null;
  city: string | null;
  county: string | null;
  legal_desc: string | null;
  legal_desc2: string | null;
  legal_desc3: string | null;
  full_legal_description: string;
  tract_or_lot: string | null;
  abs_subdv_cd: string | null;
  land_val: number | null;
  imprv_val: number | null;
  market: number | null;
  block: string | null;
  map_id: string | null;
  geo_id: string | null;
  situs_num: string | null;
  situs_street_prefx: string | null;
  situs_street: string | null;
  situs_street_sufix: string | null;
  situs_city: string | null;
  situs_state: string | null;
  situs_zip: string | null;
  situs_address: string;
  addr_line1: string | null;
  addr_line2: string | null;
  addr_line3: string | null;
  addr_city: string | null;
  addr_state: string | null;
  zip: string | null;
  mailing_address: string;
  deed_seq: string | null;
  deed_date: string | null;
  volume: string | null;
  page: string | null;
  number: string | null;
  deed_reference: string;
  owner_tax_yr: number | null;
  next_appraisal_dt: string | null;
  geometry: ArcGisGeometry | null;
}

/** Bell CAD abstract record */
export interface BellCadAbstract {
  anum: string | null;
  survey_name: string | null;
  block: string | null;
  survey_number: string | null;
  geometry: ArcGisGeometry | null;
}

/** Bell CAD subdivision record */
export interface BellCadSubdivision {
  code: string | null;
  description: string | null;
  geometry: ArcGisGeometry | null;
}

/** Bell CAD lot line record */
export interface BellCadLotLine {
  plat_dim: string | null;
  metes_bound: string | null;
  user_id: string | null;
  date: string | null;
  geometry: ArcGisGeometry | null;
}

/** FEMA flood zone record */
export interface FemaFloodZone {
  fld_zone: string | null;
  zone_subtype: string | null;
  static_bfe: number | null;
  depth: number | null;
  sfha_tf: string | null;
  geometry: ArcGisGeometry | null;
}

/** Combined parcel context — everything we know about a parcel from all layers */
export interface BellCadParcelContext {
  parcel: BellCadParcel | null;
  abstract: BellCadAbstract | null;
  subdivision: BellCadSubdivision | null;
  lot_lines: BellCadLotLine[];
  city_name: string | null;
  school_district: string | null;
  flood_zones: FemaFloodZone[];
  /** Whether the parcel intersects the military (Fort Cavazos) boundary */
  near_military: boolean;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function makeFetchHeaders(): Record<string, string> {
  return {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0; +https://starrsurveying.com)',
  };
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute an ArcGIS REST query against a specific layer.
 *
 * @param layerUrl Full URL to the layer (e.g. .../FeatureServer/0)
 * @param where    SQL WHERE clause
 * @param opts     Optional overrides for outFields, geometry, etc.
 */
async function queryLayer(
  layerUrl: string,
  where: string,
  opts?: {
    outFields?: string;
    returnGeometry?: boolean;
    resultRecordCount?: number;
    geometryType?: string;
    geometry?: string;
    inSR?: string;
    spatialRel?: string;
    outSR?: string;
  },
): Promise<ArcGisFeature[]> {
  const params = new URLSearchParams({
    where,
    outFields: opts?.outFields ?? '*',
    returnGeometry: String(opts?.returnGeometry ?? true),
    resultRecordCount: String(opts?.resultRecordCount ?? MAX_RECORD_COUNT),
    f: 'json',
  });

  if (opts?.geometryType) params.set('geometryType', opts.geometryType);
  if (opts?.geometry) params.set('geometry', opts.geometry);
  if (opts?.inSR) params.set('inSR', opts.inSR);
  if (opts?.spatialRel) params.set('spatialRel', opts.spatialRel);
  if (opts?.outSR) params.set('outSR', opts.outSR);

  const url = `${layerUrl}/query?${params.toString()}`;
  const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });

  if (!res.ok) {
    throw new Error(`ArcGIS query failed: HTTP ${res.status} at ${layerUrl}`);
  }

  const data = await res.json() as ArcGisQueryResponse;
  if (data.error) {
    throw new Error(`ArcGIS error: ${data.error.message ?? 'unknown'} (code ${data.error.code ?? '?'})`);
  }

  return data.features ?? [];
}

function layerUrl(layerId: BellCadLayerId): string {
  return `${BELL_CAD_FEATURE_SERVER}/${layerId}`;
}

/** Safely read a string attribute */
function str(attrs: Record<string, unknown>, key: string): string | null {
  const v = attrs[key];
  if (v == null || v === '' || v === 'Null' || v === 'NULL') return null;
  return String(v).trim();
}

/** Safely read a numeric attribute */
function num(attrs: Record<string, unknown>, key: string): number | null {
  const v = attrs[key];
  if (v == null || v === '' || v === 'Null') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ── Parcel Queries ───────────────────────────────────────────────────────────

/**
 * Build a sanitized ArcGIS SQL WHERE value.
 * Escapes single quotes and strips dangerous characters.
 */
function safeSql(value: string): string {
  return value
    .replace(/[^A-Za-z0-9 .#\-']/g, ' ')
    .replace(/'/g, "''")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search for parcels by property ID (exact match).
 */
export async function queryParcelByPropId(
  propId: string | number,
  returnGeometry = true,
): Promise<BellCadParcel[]> {
  const where = `prop_id = ${Number(propId)}`;
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.PARCELS), where, {
    returnGeometry,
  });
  return features.map(parseParcelFeature);
}

/**
 * Search for parcels by owner name (LIKE match).
 */
export async function queryParcelByOwner(
  ownerName: string,
  returnGeometry = true,
): Promise<BellCadParcel[]> {
  const safe = safeSql(ownerName);
  if (!safe) return [];
  const where = `UPPER(file_as_name) LIKE UPPER('${safe}%')`;
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.PARCELS), where, {
    returnGeometry,
    resultRecordCount: 25,
  });
  return features.map(parseParcelFeature);
}

/**
 * Search for parcels by situs (property) address.
 * Tries multiple field combinations for maximum recall.
 */
export async function queryParcelByAddress(
  address: string,
  returnGeometry = true,
): Promise<BellCadParcel[]> {
  // Extract street number and name from the address
  const streetOnly = address.split(',')[0]?.trim() ?? address;
  const safe = safeSql(streetOnly);
  if (!safe) return [];

  // Try matching on the combined situs fields
  // The Bell CAD layer stores address components separately:
  //   situs_num (house number), situs_street_prefx (direction), situs_street (name), situs_street_sufix (type)
  const numMatch = safe.match(/^(\d+)\s+(.+)/);
  let where: string;
  if (numMatch) {
    const houseNum = numMatch[1];
    const streetPart = safeSql(numMatch[2]);
    // Match house number AND street name contains the search string
    where = `situs_num = '${houseNum}' AND UPPER(situs_street) LIKE UPPER('%${streetPart}%')`;
  } else {
    // No house number — search street name only
    where = `UPPER(situs_street) LIKE UPPER('%${safe}%')`;
  }

  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.PARCELS), where, {
    returnGeometry,
    resultRecordCount: 25,
  });
  return features.map(parseParcelFeature);
}

/**
 * Search for parcels by geographic point (lat/lon).
 * Finds parcels that contain the given coordinate.
 */
export async function queryParcelByPoint(
  lat: number,
  lon: number,
  returnGeometry = true,
): Promise<BellCadParcel[]> {
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.PARCELS), '1=1', {
    returnGeometry,
    geometryType: 'esriGeometryPoint',
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: 5,
  });
  return features.map(parseParcelFeature);
}

/**
 * Search for parcels by geo_id (geographic ID / map reference).
 */
export async function queryParcelByGeoId(
  geoId: string,
  returnGeometry = true,
): Promise<BellCadParcel[]> {
  const safe = safeSql(geoId);
  if (!safe) return [];
  const where = `UPPER(geo_id) = UPPER('${safe}')`;
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.PARCELS), where, {
    returnGeometry,
  });
  return features.map(parseParcelFeature);
}

// ── Related Layer Queries ────────────────────────────────────────────────────

/**
 * Find the abstract survey that contains a given parcel geometry.
 * Uses a spatial intersect query against the Abstracts layer.
 */
export async function queryAbstractByGeometry(
  parcelGeometry: ArcGisGeometry,
): Promise<BellCadAbstract[]> {
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.ABSTRACTS), '1=1', {
    geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify(parcelGeometry),
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: 10,
  });
  return features.map(f => ({
    anum: str(f.attributes, 'ANUM'),
    survey_name: str(f.attributes, 'L1SURNAM') || str(f.attributes, 'L4SURNAM'),
    block: str(f.attributes, 'L2BLOCK'),
    survey_number: str(f.attributes, 'L3SURNUM'),
    geometry: f.geometry ?? null,
  }));
}

/**
 * Find the abstract survey by abstract number.
 */
export async function queryAbstractByNumber(
  abstractNumber: string,
): Promise<BellCadAbstract[]> {
  const safe = safeSql(abstractNumber);
  if (!safe) return [];
  const where = `UPPER(ANUM) = UPPER('${safe}')`;
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.ABSTRACTS), where);
  return features.map(f => ({
    anum: str(f.attributes, 'ANUM'),
    survey_name: str(f.attributes, 'L1SURNAM') || str(f.attributes, 'L4SURNAM'),
    block: str(f.attributes, 'L2BLOCK'),
    survey_number: str(f.attributes, 'L3SURNUM'),
    geometry: f.geometry ?? null,
  }));
}

/**
 * Find the subdivision that contains a given parcel geometry.
 */
export async function querySubdivisionByGeometry(
  parcelGeometry: ArcGisGeometry,
): Promise<BellCadSubdivision[]> {
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.SUBDIVISIONS), '1=1', {
    geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify(parcelGeometry),
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: 5,
  });
  return features.map(f => ({
    code: str(f.attributes, 'CODE'),
    description: str(f.attributes, 'DESC_'),
    geometry: f.geometry ?? null,
  }));
}

/**
 * Find the subdivision by code.
 */
export async function querySubdivisionByCode(
  code: string,
): Promise<BellCadSubdivision[]> {
  const safe = safeSql(code);
  if (!safe) return [];
  const where = `UPPER(CODE) = UPPER('${safe}')`;
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.SUBDIVISIONS), where);
  return features.map(f => ({
    code: str(f.attributes, 'CODE'),
    description: str(f.attributes, 'DESC_'),
    geometry: f.geometry ?? null,
  }));
}

/**
 * Find lot lines that intersect a given parcel geometry.
 * Returns platted dimensions and metes-and-bounds markers.
 */
export async function queryLotLinesByGeometry(
  parcelGeometry: ArcGisGeometry,
): Promise<BellCadLotLine[]> {
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.LOT_LINES), '1=1', {
    geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify(parcelGeometry),
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: 100,
  });
  return features.map(f => ({
    plat_dim: str(f.attributes, 'PLAT_DIM'),
    metes_bound: str(f.attributes, 'METES_BOUN'),
    user_id: str(f.attributes, 'USER_ID'),
    date: str(f.attributes, 'DATE_'),
    geometry: f.geometry ?? null,
  }));
}

/**
 * Find the city that contains a given parcel geometry.
 */
export async function queryCityByGeometry(
  parcelGeometry: ArcGisGeometry,
): Promise<string | null> {
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.CITY_LIMITS), '1=1', {
    outFields: 'CITY',
    returnGeometry: false,
    geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify(parcelGeometry),
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: 1,
  });
  return features.length > 0 ? str(features[0].attributes, 'CITY') : null;
}

/**
 * Find the school district that contains a given parcel geometry.
 */
export async function querySchoolDistrictByGeometry(
  parcelGeometry: ArcGisGeometry,
): Promise<string | null> {
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.SCHOOL_DISTRICTS), '1=1', {
    outFields: 'NAME',
    returnGeometry: false,
    geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify(parcelGeometry),
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: 1,
  });
  return features.length > 0 ? str(features[0].attributes, 'NAME') : null;
}

/**
 * Check if a parcel intersects the military (Fort Cavazos) boundary.
 */
export async function queryMilitaryIntersection(
  parcelGeometry: ArcGisGeometry,
): Promise<boolean> {
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.MILITARY_BOUNDARY), '1=1', {
    returnGeometry: false,
    geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify(parcelGeometry),
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: 1,
  });
  return features.length > 0;
}

/**
 * Query FEMA flood hazard zones that intersect a given parcel geometry.
 * Uses the FEMA NFHL REST service (not part of Bell CAD, but included in their web map).
 */
export async function queryFloodZoneByGeometry(
  parcelGeometry: ArcGisGeometry,
): Promise<FemaFloodZone[]> {
  try {
    // Convert geometry to WGS84 for FEMA query
    const features = await queryLayer(FEMA_FLOOD_LAYER, '1=1', {
      outFields: 'FLD_ZONE,ZONE_SUBTY,STATIC_BFE,DEPTH,SFHA_TF',
      geometryType: 'esriGeometryPolygon',
      geometry: JSON.stringify(parcelGeometry),
      inSR: '2277',
      spatialRel: 'esriSpatialRelIntersects',
      outSR: '4326',
      resultRecordCount: 10,
    });
    return features.map(f => ({
      fld_zone: str(f.attributes, 'FLD_ZONE'),
      zone_subtype: str(f.attributes, 'ZONE_SUBTY'),
      static_bfe: num(f.attributes, 'STATIC_BFE'),
      depth: num(f.attributes, 'DEPTH'),
      sfha_tf: str(f.attributes, 'SFHA_TF'),
      geometry: f.geometry ?? null,
    }));
  } catch {
    // FEMA service can be slow/unreliable — don't let it break the main query
    return [];
  }
}

/**
 * Query streets near a parcel geometry.
 */
export async function queryStreetsByGeometry(
  parcelGeometry: ArcGisGeometry,
  limit = 20,
): Promise<Array<{ full_name: string | null; road_class: string | null; geometry: ArcGisGeometry | null }>> {
  const features = await queryLayer(layerUrl(BELL_CAD_LAYERS.STREETS), '1=1', {
    outFields: 'FULL_NAME,ROAD_CLASS,RD_NAME,RD_TYPE',
    geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify(parcelGeometry),
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: limit,
  });
  return features.map(f => ({
    full_name: str(f.attributes, 'FULL_NAME'),
    road_class: str(f.attributes, 'ROAD_CLASS'),
    geometry: f.geometry ?? null,
  }));
}

// ── Composite Query ──────────────────────────────────────────────────────────

/**
 * Fetch complete parcel context: parcel data + all related layers.
 * This is the primary entry point for the research pipeline.
 *
 * @param propId      Bell CAD property ID
 * @param includeFlood Whether to query FEMA flood zones (adds ~2s latency)
 */
export async function fetchParcelContext(
  propId: string | number,
  includeFlood = true,
): Promise<BellCadParcelContext> {
  // Step 1: Get the parcel record with geometry
  const parcels = await queryParcelByPropId(propId, true);
  const parcel = parcels[0] ?? null;

  if (!parcel || !parcel.geometry) {
    return {
      parcel,
      abstract: null,
      subdivision: null,
      lot_lines: [],
      city_name: null,
      school_district: null,
      flood_zones: [],
      near_military: false,
    };
  }

  // Step 2: Run spatial queries in parallel against related layers
  const geom = parcel.geometry;

  const [
    abstracts,
    subdivisions,
    lotLines,
    cityName,
    schoolDistrict,
    nearMilitary,
    floodZones,
  ] = await Promise.all([
    queryAbstractByGeometry(geom).catch(() => [] as BellCadAbstract[]),
    querySubdivisionByGeometry(geom).catch(() => [] as BellCadSubdivision[]),
    queryLotLinesByGeometry(geom).catch(() => [] as BellCadLotLine[]),
    queryCityByGeometry(geom).catch(() => null),
    querySchoolDistrictByGeometry(geom).catch(() => null),
    queryMilitaryIntersection(geom).catch(() => false),
    includeFlood ? queryFloodZoneByGeometry(geom).catch(() => [] as FemaFloodZone[]) : Promise.resolve([]),
  ]);

  return {
    parcel,
    abstract: abstracts[0] ?? null,
    subdivision: subdivisions[0] ?? null,
    lot_lines: lotLines,
    city_name: cityName,
    school_district: schoolDistrict,
    flood_zones: floodZones,
    near_military: nearMilitary,
  };
}

/**
 * Search for a parcel using any available identifier, then fetch full context.
 * Tries in order: prop_id → address → owner_name → geo_id
 */
export async function searchAndFetchParcelContext(
  query: {
    prop_id?: string | number;
    address?: string;
    owner_name?: string;
    geo_id?: string;
    lat?: number;
    lon?: number;
  },
  includeFlood = true,
): Promise<{ context: BellCadParcelContext; search_method: string }> {
  let parcels: BellCadParcel[] = [];
  let method = 'none';

  // Try prop_id first (exact match — fastest)
  if (query.prop_id) {
    parcels = await queryParcelByPropId(query.prop_id);
    method = 'prop_id';
  }

  // Try address
  if (parcels.length === 0 && query.address) {
    parcels = await queryParcelByAddress(query.address);
    method = 'address';
  }

  // Try lat/lon point query
  if (parcels.length === 0 && query.lat != null && query.lon != null) {
    parcels = await queryParcelByPoint(query.lat, query.lon);
    method = 'point';
  }

  // Try owner name
  if (parcels.length === 0 && query.owner_name) {
    parcels = await queryParcelByOwner(query.owner_name);
    method = 'owner_name';
  }

  // Try geo_id
  if (parcels.length === 0 && query.geo_id) {
    parcels = await queryParcelByGeoId(query.geo_id);
    method = 'geo_id';
  }

  if (parcels.length === 0) {
    return {
      context: {
        parcel: null,
        abstract: null,
        subdivision: null,
        lot_lines: [],
        city_name: null,
        school_district: null,
        flood_zones: [],
        near_military: false,
      },
      search_method: method,
    };
  }

  // Use the first matching parcel's prop_id to fetch full context
  const context = await fetchParcelContext(parcels[0].prop_id, includeFlood);
  return { context, search_method: method };
}

// ── Export Helpers ────────────────────────────────────────────────────────────

/**
 * Build an export URL for downloading parcel data in a specific format.
 */
export function buildExportUrl(
  where: string,
  format: 'csv' | 'shapefile' | 'geojson' | 'kml' | 'geopackage' | 'filegdb' | 'excel' = 'geojson',
  layerId: BellCadLayerId = BELL_CAD_LAYERS.PARCELS,
): string {
  const formatMap: Record<string, string> = {
    csv: 'CSV',
    shapefile: 'Shapefile',
    geojson: 'GeoJSON',
    kml: 'KML',
    geopackage: 'GeoPackage',
    filegdb: 'FileGDB',
    excel: 'Excel',
  };

  const params = new URLSearchParams({
    where,
    outFields: '*',
    f: formatMap[format] ?? 'GeoJSON',
  });

  return `${BELL_CAD_FEATURE_SERVER}/${layerId}/query?${params.toString()}`;
}

/**
 * Convert Bell CAD parcel geometry rings to GeoJSON polygon coordinates.
 * Bell CAD uses WKID 2277 (NAD83 Texas North Central, US Feet).
 * This returns coordinates in the native projection — use a transform for WGS84.
 */
export function parcelToGeoJSON(parcel: BellCadParcel): { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'Polygon'; coordinates: number[][][] } } | null {
  if (!parcel.geometry?.rings) return null;

  return {
    type: 'Feature',
    properties: {
      prop_id: parcel.prop_id,
      owner: parcel.file_as_name,
      address: parcel.situs_address,
      legal_desc: parcel.full_legal_description,
      acreage: parcel.legal_acreage,
      market_value: parcel.market,
      deed_ref: parcel.deed_reference,
    },
    geometry: {
      type: 'Polygon',
      coordinates: parcel.geometry.rings,
    },
  };
}

// ── Internal Parser ──────────────────────────────────────────────────────────

function parseParcelFeature(feature: ArcGisFeature): BellCadParcel {
  const a = feature.attributes;

  const situsNum = str(a, 'situs_num');
  const situsPrefix = str(a, 'situs_street_prefx');
  const situsStreet = str(a, 'situs_street');
  const situsSuffix = str(a, 'situs_street_sufix');
  const situsCity = str(a, 'situs_city');
  const situsState = str(a, 'situs_state');
  const situsZip = str(a, 'situs_zip');

  const situs = [situsNum, situsPrefix, situsStreet, situsSuffix]
    .filter(Boolean).join(' ');
  const situsAddress = [situs, situsCity, situsState, situsZip]
    .filter(Boolean).join(', ');

  const addrLine1 = str(a, 'addr_line1');
  const addrLine2 = str(a, 'addr_line2');
  const addrLine3 = str(a, 'addr_line3');
  const addrCity = str(a, 'addr_city');
  const addrState = str(a, 'addr_state');
  const zip = str(a, 'zip');
  const mailingAddress = [addrLine1, addrLine2, addrLine3, addrCity, addrState, zip]
    .filter(Boolean).join(', ');

  const legalDesc = str(a, 'legal_desc');
  const legalDesc2 = str(a, 'legal_desc2');
  const legalDesc3 = str(a, 'legal_desc3');
  const fullLegal = [legalDesc, legalDesc2, legalDesc3].filter(Boolean).join(' ');

  const volume = str(a, 'Volume');
  const page = str(a, 'Page');
  const deedNumber = str(a, 'Number');
  const deedRef = [
    volume && `Vol. ${volume}`,
    page && `Pg. ${page}`,
    deedNumber && `#${deedNumber}`,
  ].filter(Boolean).join(', ');

  return {
    prop_id: num(a, 'prop_id') ?? 0,
    prop_id_text: str(a, 'prop_id_text') ?? String(num(a, 'prop_id') ?? ''),
    file_as_name: str(a, 'file_as_name') ?? '',
    legal_acreage: num(a, 'legal_acreage'),
    hood_cd: str(a, 'hood_cd'),
    school: str(a, 'school'),
    city: str(a, 'city'),
    county: str(a, 'county'),
    legal_desc: legalDesc,
    legal_desc2: legalDesc2,
    legal_desc3: legalDesc3,
    full_legal_description: fullLegal,
    tract_or_lot: str(a, 'tract_or_lot'),
    abs_subdv_cd: str(a, 'abs_subdv_cd'),
    land_val: num(a, 'land_val'),
    imprv_val: num(a, 'imprv_val'),
    market: num(a, 'market'),
    block: str(a, 'block'),
    map_id: str(a, 'map_id'),
    geo_id: str(a, 'geo_id'),
    situs_num: situsNum,
    situs_street_prefx: situsPrefix,
    situs_street: situsStreet,
    situs_street_sufix: situsSuffix,
    situs_city: situsCity,
    situs_state: situsState,
    situs_zip: situsZip,
    situs_address: situsAddress,
    addr_line1: addrLine1,
    addr_line2: addrLine2,
    addr_line3: addrLine3,
    addr_city: addrCity,
    addr_state: addrState,
    zip,
    mailing_address: mailingAddress,
    deed_seq: str(a, 'Deed_Seq'),
    deed_date: str(a, 'Deed_Date'),
    volume,
    page,
    number: deedNumber,
    deed_reference: deedRef,
    owner_tax_yr: num(a, 'owner_tax_yr'),
    next_appraisal_dt: str(a, 'next_appraisal_dt'),
    geometry: feature.geometry ?? null,
  };
}
