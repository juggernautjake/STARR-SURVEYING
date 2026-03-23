// lib/research/progressive-zoom.service.ts — Progressive zoom capture for lot-level extraction
//
// Captures map imagery at progressively tighter zoom levels, from neighborhood
// context down to individual lot detail. At each zoom level, we:
//   1. Capture Google Maps (street + satellite) with address pin
//   2. Capture Esri World Imagery aerial
//   3. Query nearby parcels from CAD (Bell County if applicable)
//   4. Analyze each capture to determine if lot/parcel lines are visible
//   5. If not visible, zoom in further until individual lots are clear
//
// GIS/CAD systems typically require zooming to a specific level before
// individual subdivision and lot lines become visible. This service
// automatically drills down to find that level.

import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET, ensureStorageBucket } from '@/lib/supabase';
import type { DocumentType } from '@/types/research';
import { geocodeAddress, type GeoPoint } from './map-image.service';
import { PipelineLogger } from './pipeline-logger';

// ── Parcel Centroid Lookup ───────────────────────────────────────────────────

/**
 * Given a list of parcels and an address, find the best-matching parcel
 * by house number + street name. Returns the parcel or null.
 */
function findBestMatch(
  searchAddress: string,
  parcels: NearbyParcel[],
): NearbyParcel | null {
  if (parcels.length === 0) return null;

  const normalize = (s: string) =>
    s.toUpperCase().replace(/[.,#\-]/g, '').replace(/\s+/g, ' ').trim();
  const search = normalize(searchAddress);
  const searchMatch = search.match(/^(\d+)\s+(.+)/);
  if (!searchMatch) return null;

  const searchNum = searchMatch[1];
  let best: NearbyParcel | null = null;
  let bestScore = 0;

  for (const p of parcels) {
    if (!p.address) continue;
    const parcel = normalize(p.address);
    const parcelMatch = parcel.match(/^(\d+)\s+(.+)/);
    if (!parcelMatch || parcelMatch[1] !== searchNum) continue;
    // House number matches — score by street similarity
    const score = parcel.includes(searchMatch[2]) || searchMatch[2].includes(parcel) ? 90 : 50;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}

/** Parcel location derived from actual CAD geometry */
interface ParcelLocationInfo {
  lat: number;
  lon: number;
  /** Approximate extent in meters */
  extentMeters: { latSpan: number; lonSpan: number };
}

/**
 * Query Bell CAD for a parcel's actual geometry centroid + extent in WGS84.
 * This corrects for geocoding offsets that can be miles off, and gives us
 * the parcel's real size so we can compute appropriate zoom levels.
 */
async function fetchParcelCentroidWgs84(
  propId: number,
  logger: PipelineLogger,
): Promise<ParcelLocationInfo | null> {
  const params = new URLSearchParams({
    where: `prop_id = ${propId}`,
    outFields: 'PROP_ID',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });
  const url = `${BELL_CAD_FEATURE_SERVER}/0/query?${params}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rings: number[][][] | undefined = data?.features?.[0]?.geometry?.rings;
    if (!rings || rings.length === 0 || rings[0].length === 0) return null;

    const ring = rings[0];
    let sumLon = 0, sumLat = 0;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    const n = (ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1])
      ? ring.length - 1
      : ring.length;
    for (let i = 0; i < n; i++) {
      const lon = ring[i][0], lat = ring[i][1];
      sumLon += lon; sumLat += lat;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    }
    const result: ParcelLocationInfo = {
      lat: sumLat / n, lon: sumLon / n,
      extentMeters: {
        latSpan: (maxLat - minLat) * 111_000,
        lonSpan: (maxLon - minLon) * 96_500,
      },
    };
    logger.info('gis_zoom',
      `Parcel centroid for prop_id=${propId}: ${result.lat.toFixed(6)}, ${result.lon.toFixed(6)} ` +
      `(extent: ${result.extentMeters.latSpan.toFixed(0)}m x ${result.extentMeters.lonSpan.toFixed(0)}m)`);
    return result;
  } catch {
    return null;
  }
}

/**
 * Compute a fit zoom level from parcel extent. Returns the Google Maps zoom
 * where the parcel fills ~60% of the frame.
 */
function computeFitZoom(extentMeters: { latSpan: number; lonSpan: number }): number {
  const maxExtentM = Math.max(extentMeters.latSpan, extentMeters.lonSpan);
  const fitPow = maxExtentM / 20;
  return Math.max(12, Math.min(21, Math.round(21 - Math.log2(Math.max(fitPow, 1)))));
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 960;

/** Default zoom levels (subdivision-sized lots). Overridden when we know parcel extent. */
const DEFAULT_ZOOM_LEVELS = [
  { zoom: 16, label: 'neighborhood',   radiusDeg: 0.0048,  description: 'Neighborhood context — several blocks, major streets' },
  { zoom: 17, label: 'sub-block',      radiusDeg: 0.0024,  description: 'Sub-block — subdivision boundaries should be visible' },
  { zoom: 18, label: 'block',          radiusDeg: 0.0012,  description: 'Block level — individual lots and lot numbers visible' },
  { zoom: 19, label: 'lot-cluster',    radiusDeg: 0.0006,  description: 'Lot cluster — 3-5 lots visible with detail' },
  { zoom: 20, label: 'lot',            radiusDeg: 0.0003,  description: 'Individual lot — single lot fills frame' },
  { zoom: 21, label: 'lot-detail',     radiusDeg: 0.00015, description: 'Lot detail — maximum zoom, building footprint detail' },
];

/**
 * Compute zoom levels tailored to a specific parcel size.
 * For large rural tracts, produces much wider zoom levels than the defaults.
 */
function computeZoomLevelsFromExtent(
  extentMeters: { latSpan: number; lonSpan: number },
  logger: PipelineLogger,
) {
  const fitZ = computeFitZoom(extentMeters);
  const zooms = [
    Math.max(12, fitZ - 3),
    Math.max(12, fitZ - 1),
    fitZ,
    Math.min(21, fitZ + 1),
  ].filter((z, i, a) => i === 0 || z !== a[i - 1]); // dedupe

  const levels = zooms.map(z => ({
    zoom: z,
    label: z < fitZ ? 'context' : z === fitZ ? 'parcel-fit' : 'detail',
    radiusDeg: 0.00015 * Math.pow(2, 21 - z),
    description: z < fitZ ? 'Wide context for surrounding area' : z === fitZ ? 'Parcel fills frame' : 'Close-up detail',
  }));

  const maxExtentM = Math.max(extentMeters.latSpan, extentMeters.lonSpan);
  logger.info('gis_zoom',
    `Parcel extent: ${maxExtentM.toFixed(0)}m → fit zoom=${fitZ}, ` +
    `capturing: ${levels.map(l => `z${l.zoom}(${l.label})`).join(', ')}`, {
      parcel_extent_m: maxExtentM, fit_zoom: fitZ, zoom_levels: zooms,
    },
  );
  return levels;
}

const BELL_CAD_FEATURE_SERVER =
  'https://services7.arcgis.com/EHW2HuuyZNO7DZct/arcgis/rest/services/BellCADWebService/FeatureServer';

const FETCH_TIMEOUT_MS = 30_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZoomLevelCapture {
  zoom: number;
  label: string;
  description: string;
  radiusDeg: number;
  /** Captured image document IDs */
  document_ids: string[];
  /** Parcel data found at this zoom level */
  parcels_in_view: NearbyParcel[];
  /** Whether lot/parcel boundaries appear visible at this zoom */
  lot_lines_likely_visible: boolean;
  /** Capture log */
  steps: string[];
}

export interface ProgressiveZoomResult {
  /** All zoom level captures (from wide to tight) */
  zoom_captures: ZoomLevelCapture[];
  /** Which zoom level first showed clear lot lines */
  lot_lines_first_visible_at: number | null;
  /** Best zoom level for lot identification (tightest with clear lines) */
  best_zoom_for_lot_id: number;
  /** All document IDs created across all zoom levels */
  all_document_ids: string[];
  /** Geocoded coordinates */
  geocoded: GeoPoint | null;
  /** Total parcels discovered */
  total_parcels_found: number;
  /** Overall log */
  pipeline_log: string[];
}

interface NearbyParcel {
  prop_id: number;
  owner: string | null;
  address: string | null;
  lot: string | null;
  block: string | null;
  acreage: number | null;
}

// ── Image Fetching ──────────────────────────────────────────────────────────

async function fetchImage(url: string, logger?: PipelineLogger, label?: string): Promise<Buffer | null> {
  const start = Date.now();
  const shortUrl = url.substring(0, 120);
  try {
    logger?.debug('map_capture', `Fetching image: ${label ?? shortUrl}`, { url: shortUrl });
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger?.warn('map_capture', `Image fetch failed: HTTP ${res.status} for ${label ?? shortUrl}`, { status: res.status, url: shortUrl });
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) {
      logger?.warn('map_capture', `Non-image content-type "${ct}" for ${label ?? shortUrl}`, { content_type: ct });
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const elapsed = Date.now() - start;
    logger?.debug('map_capture', `Fetched image: ${label ?? shortUrl} — ${buf.byteLength} bytes in ${elapsed}ms`, {
      bytes: buf.byteLength, elapsed_ms: elapsed, content_type: ct,
    });
    return buf;
  } catch (err) {
    const elapsed = Date.now() - start;
    logger?.error('map_capture', `Image fetch error for ${label ?? shortUrl} after ${elapsed}ms: ${err instanceof Error ? err.message : String(err)}`, {
      elapsed_ms: elapsed, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ── URL Builders ────────────────────────────────────────────────────────────

function buildGoogleStaticUrl(
  lat: number, lon: number, zoom: number,
  maptype: 'roadmap' | 'hybrid',
): string | null {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const params = new URLSearchParams({
    center: `${lat},${lon}`,
    zoom: String(zoom),
    size: `${MAP_WIDTH}x${MAP_HEIGHT}`,
    maptype,
    markers: `color:red|label:P|${lat},${lon}`,
    key: apiKey,
    scale: '2',
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}

function buildEsriImageryUrl(lat: number, lon: number, radiusDeg: number): string {
  const aspect = MAP_HEIGHT / MAP_WIDTH;
  const bbox = `${lon - radiusDeg},${lat - radiusDeg * aspect},${lon + radiusDeg},${lat + radiusDeg * aspect}`;
  const params = new URLSearchParams({
    bbox, bboxSR: '4326', size: `${MAP_WIDTH},${MAP_HEIGHT}`,
    imageSR: '4326', format: 'png32', transparent: 'false', f: 'image',
  });
  return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?${params}`;
}

function buildBellCadParcelQueryUrl(lat: number, lon: number, radiusDeg: number): string {
  const aspect = MAP_HEIGHT / MAP_WIDTH;
  const envelope = JSON.stringify({
    xmin: lon - radiusDeg, ymin: lat - radiusDeg * aspect,
    xmax: lon + radiusDeg, ymax: lat + radiusDeg * aspect,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    geometry: envelope, geometryType: 'esriGeometryEnvelope',
    inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'PROP_ID,FILE_AS_NAME,SITUS_ADDR,TRACT_OR_LOT,BLOCK,LEGAL_ACREAGE',
    returnGeometry: 'false', f: 'json',
  });
  return `${BELL_CAD_FEATURE_SERVER}/0/query?${params}`;
}

async function fetchParcelData(queryUrl: string, logger?: PipelineLogger, zoom?: number): Promise<NearbyParcel[]> {
  const start = Date.now();
  const zoomLabel = zoom != null ? `zoom=${zoom}` : 'unknown-zoom';
  try {
    logger?.debug('gis_zoom', `Querying parcel data at ${zoomLabel}`, { url: queryUrl.substring(0, 150) });
    const res = await fetch(queryUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger?.warn('gis_zoom', `Parcel query failed at ${zoomLabel}: HTTP ${res.status}`, { status: res.status });
      return [];
    }
    const data = await res.json();
    if (!data.features || !Array.isArray(data.features)) {
      logger?.warn('gis_zoom', `No features array in parcel response at ${zoomLabel}`, { response_keys: Object.keys(data) });
      return [];
    }
    const parcels = data.features.map((f: Record<string, Record<string, unknown>>) => ({
      prop_id: Number(f.attributes?.PROP_ID ?? 0),
      owner: f.attributes?.FILE_AS_NAME ? String(f.attributes.FILE_AS_NAME) : null,
      address: f.attributes?.SITUS_ADDR ? String(f.attributes.SITUS_ADDR) : null,
      lot: f.attributes?.TRACT_OR_LOT ? String(f.attributes.TRACT_OR_LOT) : null,
      block: f.attributes?.BLOCK ? String(f.attributes.BLOCK) : null,
      acreage: f.attributes?.LEGAL_ACREAGE ? Number(f.attributes.LEGAL_ACREAGE) : null,
    }));
    const elapsed = Date.now() - start;
    const withLots = parcels.filter((p: NearbyParcel) => p.lot != null).length;
    const withAddresses = parcels.filter((p: NearbyParcel) => p.address != null).length;
    logger?.info('gis_zoom', `Parcel query at ${zoomLabel}: ${parcels.length} parcels (${withLots} with lot data, ${withAddresses} with addresses) in ${elapsed}ms`, {
      parcels_count: parcels.length, with_lots: withLots, with_addresses: withAddresses, elapsed_ms: elapsed,
    });
    return parcels;
  } catch (err) {
    const elapsed = Date.now() - start;
    logger?.error('gis_zoom', `Parcel query error at ${zoomLabel} after ${elapsed}ms: ${err instanceof Error ? err.message : String(err)}`, {
      elapsed_ms: elapsed, error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ── Image Storage ───────────────────────────────────────────────────────────

async function storeZoomImage(
  projectId: string,
  imageBuffer: Buffer,
  label: string,
  documentType: DocumentType,
  sourceUrl: string,
  description: string,
): Promise<string | null> {
  const filename = `progressive_zoom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
  const storagePath = `${projectId}/progressive-zoom/${filename}`;

  try {
    // Check for existing
    const { data: existing } = await supabaseAdmin
      .from('research_documents')
      .select('id')
      .eq('research_project_id', projectId)
      .eq('document_label', label)
      .eq('source_type', 'property_search')
      .maybeSingle();
    if (existing) return existing.id;
  } catch { /* proceed */ }

  try {
    await ensureStorageBucket();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(RESEARCH_DOCUMENTS_BUCKET)
      .upload(storagePath, imageBuffer, { contentType: 'image/png', upsert: false });

    const { data: urlData } = supabaseAdmin.storage
      .from(RESEARCH_DOCUMENTS_BUCKET)
      .getPublicUrl(storagePath);

    const { data: doc, error: docError } = await supabaseAdmin
      .from('research_documents')
      .insert({
        research_project_id: projectId,
        source_type: 'property_search',
        document_type: documentType,
        document_label: label,
        source_url: sourceUrl,
        original_filename: filename,
        file_type: 'png',
        file_size_bytes: imageBuffer.byteLength,
        storage_path: uploadError ? null : storagePath,
        storage_url: urlData?.publicUrl || null,
        processing_status: 'extracted',
        extracted_text: description,
        extracted_text_method: 'progressive_zoom_capture',
        recording_info: `Progressive zoom capture — ${label}`,
      })
      .select('id')
      .single();

    if (docError || !doc) return null;
    return doc.id;
  } catch {
    return null;
  }
}

// ── Progressive Zoom Capture ────────────────────────────────────────────────

/**
 * Capture imagery at progressively tighter zoom levels.
 *
 * Strategy:
 * 1. Start at neighborhood level (zoom 16) for context
 * 2. Zoom in through block (18) and lot (20) levels
 * 3. At each level, capture Google Maps pin + Esri aerial
 * 4. Query nearby parcels to annotate images
 * 5. More parcels in view at tighter zooms = we're at lot level
 *
 * @param projectId - Research project ID
 * @param address - Property address to locate
 * @param county - County name for CAD query scoping
 * @param zoomRange - Which zoom levels to capture (default: all)
 */
export async function captureProgressiveZoom(
  projectId: string,
  address: string,
  county?: string,
  zoomRange?: { minZoom?: number; maxZoom?: number },
): Promise<ProgressiveZoomResult> {
  const logger = new PipelineLogger(projectId);
  const log: string[] = [];
  const allDocIds: string[] = [];
  const zoomCaptures: ZoomLevelCapture[] = [];
  let lotLinesFirstVisible: number | null = null;
  let totalParcels = 0;

  logger.startPhase('gis_zoom', `Progressive zoom capture starting for: ${address}`);
  logger.info('gis_zoom', `Configuration — county: ${county || 'not specified'}, zoomRange: ${zoomRange ? `${zoomRange.minZoom ?? 16}-${zoomRange.maxZoom ?? 21}` : '16-21 (full)'}`, {
    address, county: county || null, min_zoom: zoomRange?.minZoom ?? 16, max_zoom: zoomRange?.maxZoom ?? 21,
  });
  log.push(`[progressive-zoom] Starting progressive zoom capture for: ${address}`);
  log.push(`[progressive-zoom] County: ${county || 'not specified'}`);

  // Geocode the address
  logger.info('geocode', `Geocoding address: "${address}"`);
  const geocodeStart = Date.now();
  const coords = await geocodeAddress(address);
  const geocodeDuration = Date.now() - geocodeStart;
  if (!coords) {
    logger.error('geocode', `Geocoding FAILED for "${address}" after ${geocodeDuration}ms — aborting progressive zoom`, {
      address, elapsed_ms: geocodeDuration,
    });
    log.push(`[progressive-zoom] FAILED: Could not geocode address "${address}"`);
    return {
      zoom_captures: [], lot_lines_first_visible_at: null,
      best_zoom_for_lot_id: 20, all_document_ids: [], geocoded: null,
      total_parcels_found: 0, pipeline_log: log,
    };
  }

  logger.info('geocode', `Geocoded "${address}" to ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} in ${geocodeDuration}ms`, {
    lat: coords.lat, lon: coords.lon, display_name: coords.display_name, elapsed_ms: geocodeDuration,
  });
  log.push(`[progressive-zoom] Geocoded to ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} — ${coords.display_name}`);

  // Mutable center — starts at geocoded location, re-centers on actual
  // parcel centroid once we find a matching parcel in the CAD data.
  let centerLat = coords.lat;
  let centerLon = coords.lon;
  let recentered = false;

  // Determine county for CAD queries
  const normalizedCounty = (county ?? '').toLowerCase().replace(/\s+county$/i, '').trim();
  const isBellCounty = normalizedCounty === 'bell' || normalizedCounty === '';

  // Initial wide search to find the target parcel and compute appropriate zoom levels
  let levels: typeof DEFAULT_ZOOM_LEVELS;
  if (isBellCounty) {
    logger.info('gis_zoom', 'Initial wide parcel search at zoom 16 to determine parcel size');
    const initialParcels = await fetchParcelData(
      buildBellCadParcelQueryUrl(centerLat, centerLon, 0.0048), logger, 16,
    );
    const target = findBestMatch(address, initialParcels);
    if (target) {
      const parcelLoc = await fetchParcelCentroidWgs84(target.prop_id, logger);
      if (parcelLoc) {
        const offsetMiles = Math.sqrt(
          Math.pow((parcelLoc.lat - centerLat) * 69, 2) +
          Math.pow((parcelLoc.lon - centerLon) * 54.6, 2),
        );
        logger.info('gis_zoom',
          `RE-CENTERING: geocoded was ${offsetMiles.toFixed(2)} miles off — ` +
          `moving to parcel centroid (${parcelLoc.lat.toFixed(6)}, ${parcelLoc.lon.toFixed(6)})`, {
            offset_miles: offsetMiles, prop_id: target.prop_id,
          },
        );
        log.push(`[progressive-zoom] RE-CENTERED: ${offsetMiles.toFixed(2)} miles from geocoded to parcel centroid`);
        centerLat = parcelLoc.lat;
        centerLon = parcelLoc.lon;
        recentered = true;
        levels = computeZoomLevelsFromExtent(parcelLoc.extentMeters, logger);
      } else {
        levels = DEFAULT_ZOOM_LEVELS;
      }
    } else {
      logger.warn('gis_zoom', 'Target parcel not found in initial search — using default zoom levels');
      levels = DEFAULT_ZOOM_LEVELS;
    }
  } else {
    levels = DEFAULT_ZOOM_LEVELS;
  }

  // Filter zoom levels if caller specified a range
  const minZoom = zoomRange?.minZoom ?? 0;
  const maxZoom = zoomRange?.maxZoom ?? 21;
  const filteredLevels = levels.filter(l => l.zoom >= minZoom && l.zoom <= maxZoom);

  logger.info('gis_zoom', `Capturing ${filteredLevels.length} zoom levels: ${filteredLevels.map(l => `z${l.zoom}(${l.label})`).join(', ')}`, {
    zoom_levels: filteredLevels.map(l => l.zoom), level_labels: filteredLevels.map(l => l.label),
  });
  log.push(`[progressive-zoom] Capturing ${filteredLevels.length} zoom levels: ${filteredLevels.map(l => `z${l.zoom}(${l.label})`).join(', ')}`);

  // Capture each zoom level
  for (const level of filteredLevels) {
    const zoomStart = Date.now();
    const stepLog: string[] = [];
    const docIds: string[] = [];

    logger.info('gis_zoom', `──── ZOOM LEVEL ${level.zoom} (${level.label}) ────`, {
      zoom: level.zoom, label: level.label, description: level.description,
      radius_deg: level.radiusDeg, radius_meters: Math.round(level.radiusDeg * 111000),
    });
    stepLog.push(`Zoom ${level.zoom} (${level.label}): ${level.description}`);
    log.push(`\n[progressive-zoom] ─── Zoom ${level.zoom}: ${level.label} ───`);

    // Build URLs using current center (may be corrected from parcel centroid)
    const googleHybridUrl = buildGoogleStaticUrl(centerLat, centerLon, level.zoom, 'hybrid');
    const googleRoadUrl = buildGoogleStaticUrl(centerLat, centerLon, level.zoom, 'roadmap');
    const esriUrl = buildEsriImageryUrl(centerLat, centerLon, level.radiusDeg);

    logger.debug('gis_zoom', `URL construction for zoom ${level.zoom}`, {
      has_google_hybrid: !!googleHybridUrl,
      has_google_road: !!googleRoadUrl,
      esri_url: esriUrl.substring(0, 100),
      has_google_api_key: !!(process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    });

    // Fetch images + parcel data in parallel (using current center)
    const parcelQueryUrl = isBellCounty
      ? buildBellCadParcelQueryUrl(centerLat, centerLon, level.radiusDeg)
      : null;

    logger.debug('gis_zoom', `Starting parallel fetch: images + parcel query at zoom ${level.zoom}`, {
      is_bell_county: isBellCounty, has_parcel_query: !!parcelQueryUrl,
    });

    // Brief pause to let map tile services render at the new zoom level
    await new Promise(r => setTimeout(r, 1_500));

    const fetchStart = Date.now();
    const [hybridBuf, roadBuf, esriBuf, parcels] = await Promise.all([
      googleHybridUrl ? fetchImage(googleHybridUrl, logger, `Google Hybrid z${level.zoom}`) : Promise.resolve(null),
      googleRoadUrl ? fetchImage(googleRoadUrl, logger, `Google Road z${level.zoom}`) : Promise.resolve(null),
      fetchImage(esriUrl, logger, `Esri Aerial z${level.zoom}`),
      parcelQueryUrl ? fetchParcelData(parcelQueryUrl, logger, level.zoom) : Promise.resolve([] as NearbyParcel[]),
    ]);
    const fetchElapsed = Date.now() - fetchStart;

    logger.info('gis_zoom', `Parallel fetch complete for zoom ${level.zoom} in ${fetchElapsed}ms`, {
      hybrid_bytes: hybridBuf?.byteLength ?? 0,
      road_bytes: roadBuf?.byteLength ?? 0,
      esri_bytes: esriBuf?.byteLength ?? 0,
      parcels_count: parcels.length,
      fetch_duration_ms: fetchElapsed,
    });

    // Determine if lot lines are likely visible at this zoom
    // At zoom 18+, individual lots should be distinguishable
    // More parcels in view at tighter zoom = we can see individual lots
    const lotLinesVisible = level.zoom >= 18 && (parcels.length > 0 || !isBellCounty);

    logger.info('gis_zoom', `Lot visibility at zoom ${level.zoom}: ${lotLinesVisible ? 'VISIBLE' : 'NOT VISIBLE'} — ${parcels.length} parcels, zoom >= 18: ${level.zoom >= 18}`, {
      lot_lines_visible: lotLinesVisible, parcels_count: parcels.length, zoom: level.zoom,
      parcels_with_lot_data: parcels.filter(p => p.lot != null).length,
      parcels_with_address: parcels.filter(p => p.address != null).length,
    });

    if (lotLinesVisible && lotLinesFirstVisible === null) {
      lotLinesFirstVisible = level.zoom;
      logger.info('gis_zoom', `MILESTONE: Lot lines first visible at zoom ${level.zoom}`, { first_visible_zoom: level.zoom });
      log.push(`[progressive-zoom] Lot lines first visible at zoom ${level.zoom}`);
    }

    // Build parcel annotation for descriptions
    const parcelAnnotation = parcels.length > 0
      ? `\n\nPARCELS IN VIEW (${parcels.length} from ${isBellCounty ? 'Bell CAD' : 'CAD'} query):\n` +
        parcels.slice(0, 20).map((p, i) =>
          `  ${i + 1}. PropID=${p.prop_id} | Lot=${p.lot || '?'} | Block=${p.block || '?'} | ${p.acreage ? p.acreage.toFixed(3) + ' ac' : '?'} | ${p.address || 'No address'} | ${p.owner || '?'}`
        ).join('\n')
      : '\n\nNo parcel data available at this zoom level.';

    totalParcels = Math.max(totalParcels, parcels.length);

    // Store captures
    const storeOps: Promise<void>[] = [];

    logger.debug('gis_zoom', `Storing images for zoom ${level.zoom}: hybrid=${!!hybridBuf}, road=${!!roadBuf}, esri=${!!esriBuf}`);

    if (hybridBuf) {
      storeOps.push((async () => {
        const desc = [
          `Google Maps satellite/hybrid at zoom ${level.zoom} (${level.label}) for: ${address}`,
          `\nCoordinates: ${centerLat.toFixed(6)}, ${centerLon.toFixed(6)}`,
          `\nRadius: ~${Math.round(level.radiusDeg * 111000)}m`,
          `\n\nPURPOSE: Satellite imagery with address pin at zoom ${level.zoom}.`,
          ` At this zoom level (${level.description}), look for:`,
          level.zoom <= 17
            ? ` subdivision boundaries, major streets, neighborhood layout.`
            : level.zoom <= 19
            ? ` individual lot boundaries, lot numbers, block outlines, street names.`
            : ` individual lot detail, building footprints, fence lines, driveways.`,
          parcelAnnotation,
        ].join('');
        const id = await storeZoomImage(
          projectId, hybridBuf,
          `Progressive Zoom — Satellite z${level.zoom} (${level.label}) — ${address}`,
          'aerial_photo', googleHybridUrl!, desc,
        );
        if (id) { docIds.push(id); allDocIds.push(id); }
        stepLog.push(id ? `Stored satellite image (${hybridBuf.byteLength} bytes)` : 'Failed to store satellite');
      })());
    }

    if (roadBuf) {
      storeOps.push((async () => {
        const desc = [
          `Google Maps roadmap at zoom ${level.zoom} (${level.label}) for: ${address}`,
          `\nCoordinates: ${centerLat.toFixed(6)}, ${centerLon.toFixed(6)}`,
          `\nRadius: ~${Math.round(level.radiusDeg * 111000)}m`,
          `\n\nPURPOSE: Street map with pin showing address location at zoom ${level.zoom}.`,
          ` The RED PIN marks where Google Maps places this address.`,
          ` Compare pin position to lot boundaries to determine which lot the address is on.`,
          parcelAnnotation,
        ].join('');
        const id = await storeZoomImage(
          projectId, roadBuf,
          `Progressive Zoom — Street z${level.zoom} (${level.label}) — ${address}`,
          'plat', googleRoadUrl!, desc,
        );
        if (id) { docIds.push(id); allDocIds.push(id); }
        stepLog.push(id ? `Stored street map (${roadBuf.byteLength} bytes)` : 'Failed to store street map');
      })());
    }

    if (esriBuf) {
      storeOps.push((async () => {
        const desc = [
          `Esri World Imagery at zoom ${level.zoom} (${level.label}) for: ${address}`,
          `\nCoordinates: ${centerLat.toFixed(6)}, ${centerLon.toFixed(6)}`,
          `\nRadius: ~${Math.round(level.radiusDeg * 111000)}m`,
          `\n\nPURPOSE: High-res aerial imagery without overlays for clean feature comparison.`,
          parcelAnnotation,
        ].join('');
        const id = await storeZoomImage(
          projectId, esriBuf,
          `Progressive Zoom — Esri Aerial z${level.zoom} (${level.label}) — ${address}`,
          'aerial_photo', esriUrl, desc,
        );
        if (id) { docIds.push(id); allDocIds.push(id); }
        stepLog.push(id ? `Stored Esri aerial (${esriBuf.byteLength} bytes)` : 'Failed to store Esri aerial');
      })());
    }

    await Promise.all(storeOps);

    const duration = Date.now() - zoomStart;
    logger.info('gis_zoom', `Zoom ${level.zoom} COMPLETE: ${docIds.length} images stored, ${parcels.length} parcels found in ${duration}ms`, {
      zoom: level.zoom, label: level.label, images_stored: docIds.length,
      parcels_count: parcels.length, lot_lines_visible: lotLinesVisible,
      duration_ms: duration, document_ids: docIds,
    });
    stepLog.push(`Captured ${docIds.length} images, ${parcels.length} parcels in ${duration}ms`);
    log.push(`[progressive-zoom] z${level.zoom}: ${docIds.length} images, ${parcels.length} parcels, ${duration}ms`);

    zoomCaptures.push({
      zoom: level.zoom,
      label: level.label,
      description: level.description,
      radiusDeg: level.radiusDeg,
      document_ids: docIds,
      parcels_in_view: parcels,
      lot_lines_likely_visible: lotLinesVisible,
      steps: stepLog,
    });
  }

  // Determine best zoom for lot identification
  // Prefer zoom 19-20 (lot cluster to individual lot) as the sweet spot
  const bestZoom = lotLinesFirstVisible
    ? Math.min(lotLinesFirstVisible + 2, 21) // Go 2 levels tighter than first visible
    : 20; // Default to zoom 20 if we couldn't determine

  const totalDuration = logger.endPhase('gis_zoom', `Progressive zoom capture complete for: ${address}`);

  logger.info('gis_zoom', 'Progressive zoom FINAL SUMMARY', {
    address,
    county: county || null,
    total_images: allDocIds.length,
    zoom_levels_captured: zoomCaptures.length,
    best_zoom_for_lot_id: bestZoom,
    lot_lines_first_visible_at: lotLinesFirstVisible,
    total_parcels_found: totalParcels,
    total_duration_ms: totalDuration,
    geocoded_lat: centerLat,
    geocoded_lon: centerLon,
    recentered_from_parcel: recentered,
    zoom_level_summary: zoomCaptures.map(z => ({
      zoom: z.zoom, label: z.label, images: z.document_ids.length,
      parcels: z.parcels_in_view.length, lot_lines: z.lot_lines_likely_visible,
    })),
  });

  log.push(`\n[progressive-zoom] Complete: ${allDocIds.length} total images across ${zoomCaptures.length} zoom levels`);
  log.push(`[progressive-zoom] Best zoom for lot ID: ${bestZoom}`);
  log.push(`[progressive-zoom] Total unique parcels found: ${totalParcels}`);

  // Append structured log entries to the pipeline log for API consumers
  for (const entry of logger.getSteps()) {
    log.push(entry);
  }

  return {
    zoom_captures: zoomCaptures,
    lot_lines_first_visible_at: lotLinesFirstVisible,
    best_zoom_for_lot_id: bestZoom,
    all_document_ids: allDocIds,
    geocoded: recentered
      ? { lat: centerLat, lon: centerLon, display_name: coords.display_name }
      : coords,
    total_parcels_found: totalParcels,
    pipeline_log: log,
  };
}

/**
 * Capture a focused zoom series at the lot level only (zooms 19-21).
 * Use this when you already know where the lot is and want maximum detail.
 */
export async function captureLotDetailZoom(
  projectId: string,
  address: string,
  county?: string,
): Promise<ProgressiveZoomResult> {
  return captureProgressiveZoom(projectId, address, county, {
    minZoom: 19,
    maxZoom: 21,
  });
}

/**
 * Capture the full progressive zoom series (zooms 16-21).
 * Use this for initial lot identification when you need context.
 */
export async function captureFullProgressiveZoom(
  projectId: string,
  address: string,
  county?: string,
): Promise<ProgressiveZoomResult> {
  return captureProgressiveZoom(projectId, address, county, {
    minZoom: 16,
    maxZoom: 21,
  });
}
