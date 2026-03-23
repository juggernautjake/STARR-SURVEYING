// lib/research/gis-progressive-zoom.service.ts — Progressive GIS zoom engine
//
// Most GIS/CAD systems require zooming in to specific levels to see
// individual subdivisions, lots, and parcels. This engine performs
// progressive zoom captures starting from a wide neighborhood view
// and zooming in through block level to individual lot level.
//
// At each zoom level, the engine:
//   1. Captures the map image (satellite, GIS overlay)
//   2. Queries the ArcGIS parcel FeatureServer for visible parcels
//   3. Analyzes whether individual lots/parcels are distinguishable
//   4. If not → zooms in one level and repeats
//   5. If yes → captures the final high-detail image for AI analysis
//
// Zoom levels (Google Maps equivalent):
//   14-15: County/city level — streets visible, no lot lines
//   16:    Neighborhood — major subdivisions visible
//   17:    Sub-neighborhood — subdivision boundaries and street blocks
//   18:    Block level — individual blocks visible, lot lines start appearing
//   19:    Half-block — lot lines clear, some lot numbers visible
//   20:    Individual lot — single lot fills frame, all details visible
//   21:    Max zoom — closest possible, sub-lot detail

import { PipelineLogger } from './pipeline-logger';
import { geocodeAddress, type GeoPoint } from './map-image.service';
import { BELL_CAD_FEATURE_SERVER } from './bell-cad-arcgis.service';
import {
  captureParcelMaps,
  type ParcelMapSet,
  LOT_ZOOM,
  BLOCK_ZOOM,
} from './parcel-map-capture.service';

// ── Parcel Centroid Lookup ───────────────────────────────────────────────────

/**
 * Query Bell CAD for a single parcel's geometry by PROP_ID and compute
 * its centroid in WGS84 (lat/lon). This gives us the exact parcel location
 * instead of relying on geocoded coordinates which can be miles off.
 */
async function fetchParcelCentroid(
  propId: number,
  logger: PipelineLogger,
): Promise<{ lat: number; lon: number } | null> {
  const params = new URLSearchParams({
    where: `prop_id = ${propId}`,
    outFields: 'PROP_ID',
    returnGeometry: 'true',
    outSR: '4326',  // Request geometry in WGS84 lat/lon
    f: 'json',
  });
  const url = `${BELL_CAD_FEATURE_SERVER}/0/query?${params}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn('gis_zoom', `Parcel centroid query failed: HTTP ${res.status} for prop_id=${propId}`);
      return null;
    }
    const data = await res.json();
    const feature = data?.features?.[0];
    const rings: number[][][] | undefined = feature?.geometry?.rings;
    if (!rings || rings.length === 0 || rings[0].length === 0) {
      logger.warn('gis_zoom', `No geometry returned for prop_id=${propId}`);
      return null;
    }

    // Compute centroid of the first ring (outer boundary)
    const ring = rings[0];
    let sumLon = 0, sumLat = 0;
    // Exclude the closing vertex (same as first) if ring is closed
    const n = (ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1])
      ? ring.length - 1
      : ring.length;
    for (let i = 0; i < n; i++) {
      sumLon += ring[i][0];
      sumLat += ring[i][1];
    }
    const centroid = { lat: sumLat / n, lon: sumLon / n };

    logger.info('gis_zoom', `Parcel centroid for prop_id=${propId}: ${centroid.lat.toFixed(6)}, ${centroid.lon.toFixed(6)}`, {
      prop_id: propId, lat: centroid.lat, lon: centroid.lon, ring_vertices: ring.length,
    });
    return centroid;
  } catch (err) {
    logger.error('gis_zoom', `Parcel centroid query error for prop_id=${propId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZoomLevelCapture {
  /** Zoom level used */
  zoom: number;
  /** Approximate radius in meters */
  radius_meters: number;
  /** Number of parcels found at this zoom */
  parcels_found: number;
  /** Whether individual lots are distinguishable */
  lots_visible: boolean;
  /** Whether lot numbers/labels are readable */
  lot_labels_readable: boolean;
  /** Parcel map set captured at this level */
  map_set: ParcelMapSet | null;
  /** Parcel data returned from GIS query */
  parcels: NearbyParcelData[];
  /** Duration of this zoom level capture in ms */
  duration_ms: number;
}

export interface NearbyParcelData {
  prop_id: number;
  owner: string | null;
  address: string | null;
  lot: string | null;
  block: string | null;
  acreage: number | null;
}

export interface ProgressiveZoomResult {
  /** All zoom level captures, from widest to tightest */
  zoom_captures: ZoomLevelCapture[];
  /** The best zoom level for lot-level detail */
  best_lot_zoom: number;
  /** The zoom level where lots first became visible */
  first_lot_visible_zoom: number | null;
  /** All document IDs created across all zoom levels */
  all_document_ids: string[];
  /** Geocoded coordinates */
  geocoded: GeoPoint | null;
  /** Target parcel found at the tightest zoom */
  target_parcel: NearbyParcelData | null;
  /** All adjacent parcels found */
  adjacent_parcels: NearbyParcelData[];
  /** Total duration of all zoom operations */
  total_duration_ms: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Zoom levels to capture, from widest to tightest */
const PROGRESSIVE_ZOOM_LEVELS = [
  { zoom: 16, label: 'neighborhood', radius_m: 550 },
  { zoom: 18, label: 'block', radius_m: 130 },
  { zoom: 19, label: 'half-block', radius_m: 65 },
  { zoom: 20, label: 'lot', radius_m: 33 },
  { zoom: 21, label: 'max-detail', radius_m: 17 },
];

const FETCH_TIMEOUT_MS = 30_000;

// ── Address Match Scoring (simplified for NearbyParcelData) ──────────────────

/**
 * Score how well a parcel address matches the search address.
 * Uses the simplified NearbyParcelData (address string only, no situs components).
 *
 * Returns 0–100 where:
 *   100 = exact match
 *   80+ = house number + street name match
 *   50  = house number match only
 *   <50 = no house number match (almost certainly wrong lot)
 */
function scoreParcelAddress(searchAddress: string, parcelAddress: string | null): number {
  if (!parcelAddress) return 0;

  const normalize = (s: string) =>
    s.toUpperCase().replace(/[.,#\-]/g, '').replace(/\s+/g, ' ').trim();

  const search = normalize(searchAddress);
  const parcel = normalize(parcelAddress);

  if (search === parcel) return 100;

  // Parse house numbers
  const searchMatch = search.match(/^(\d+)\s+(.+)/);
  const parcelMatch = parcel.match(/^(\d+)\s+(.+)/);

  if (!searchMatch) {
    // No house number in search — basic string match
    return parcel.includes(search) || search.includes(parcel) ? 40 : 0;
  }

  const searchNum = searchMatch[1];
  const searchStreet = searchMatch[2];

  // Check house number
  const parcelNum = parcelMatch ? parcelMatch[1] : null;
  if (parcelNum !== searchNum) {
    // House number mismatch — almost certainly wrong lot
    return 5;
  }

  let score = 50; // House number matches

  // Street name comparison
  const parcelStreet = parcelMatch ? parcelMatch[2] : parcel;

  // Normalize common abbreviations
  const abbrevs: [RegExp, string][] = [
    [/\bSTREET\b/g, 'ST'], [/\bDRIVE\b/g, 'DR'], [/\bAVENUE\b/g, 'AVE'],
    [/\bBOULEVARD\b/g, 'BLVD'], [/\bLANE\b/g, 'LN'], [/\bCOURT\b/g, 'CT'],
    [/\bCIRCLE\b/g, 'CIR'], [/\bROAD\b/g, 'RD'], [/\bPLACE\b/g, 'PL'],
    [/\bTRAIL\b/g, 'TRL'], [/\bPARKWAY\b/g, 'PKWY'], [/\bHIGHWAY\b/g, 'HWY'],
    [/\bNORTH\b/g, 'N'], [/\bSOUTH\b/g, 'S'], [/\bEAST\b/g, 'E'], [/\bWEST\b/g, 'W'],
  ];

  let normSearch = searchStreet;
  let normParcel = parcelStreet;
  for (const [re, replacement] of abbrevs) {
    normSearch = normSearch.replace(re, replacement);
    normParcel = normParcel.replace(re, replacement);
  }

  if (normSearch === normParcel) {
    score += 40; // Full street match
  } else if (normParcel.includes(normSearch) || normSearch.includes(normParcel)) {
    score += 25; // Partial street match
  } else {
    // Try core street name only (strip suffix words like ST, DR, AVE)
    const suffixes = /\b(ST|DR|AVE|BLVD|LN|CT|CIR|RD|PL|TRL|PKWY|HWY|WAY)\b/g;
    const coreSearch = normSearch.replace(suffixes, '').trim();
    const coreParcel = normParcel.replace(suffixes, '').trim();
    if (coreSearch === coreParcel || coreParcel.includes(coreSearch) || coreSearch.includes(coreParcel)) {
      score += 20;
    }
  }

  return Math.min(100, score);
}

/**
 * Find the best-matching parcel from a list for a given address.
 * Uses scored matching instead of `.find()` to avoid picking adjacent lots.
 */
function findBestParcelMatch(
  searchAddress: string,
  parcels: NearbyParcelData[],
  logger: PipelineLogger,
): NearbyParcelData | null {
  if (parcels.length === 0) return null;

  const scored = parcels.map(p => ({
    parcel: p,
    score: scoreParcelAddress(searchAddress, p.address),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];

  // Log all scored matches for debugging
  if (scored.length > 1 && best.score >= 50) {
    const topMatches = scored.slice(0, 5).map(s =>
      `  prop_id=${s.parcel.prop_id} "${s.parcel.address}" score=${s.score}`,
    ).join('\n');
    logger.info('gis_zoom', `Address match scores (top ${Math.min(5, scored.length)}):\n${topMatches}`);
  }

  // Require house number match (score >= 50)
  if (best.score < 50) {
    logger.warn('gis_zoom', `No strong address match found (best score=${best.score} for "${best.parcel.address}")`);
    return null;
  }

  // Warn if the top two scores are very close (ambiguous match)
  if (scored.length > 1 && scored[1].score >= 50 && best.score - scored[1].score < 10) {
    logger.warn('gis_zoom',
      `AMBIGUOUS match: "${best.parcel.address}" (score=${best.score}) vs ` +
      `"${scored[1].parcel.address}" (score=${scored[1].score}) — verify manually`,
    );
  }

  return best.parcel;
}

// ── Parcel Query ─────────────────────────────────────────────────────────────

/**
 * Query the Bell CAD FeatureServer for parcels within a bounding box.
 */
async function queryParcelsAtZoom(
  lat: number,
  lon: number,
  zoom: number,
  logger: PipelineLogger,
): Promise<NearbyParcelData[]> {
  const radiusDeg = 0.00015 * Math.pow(2, 21 - zoom);
  const aspect = 960 / 1280;
  const lonR = radiusDeg;
  const latR = radiusDeg * aspect;

  const envelope = JSON.stringify({
    xmin: lon - lonR,
    ymin: lat - latR,
    xmax: lon + lonR,
    ymax: lat + latR,
    spatialReference: { wkid: 4326 },
  });

  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'PROP_ID,FILE_AS_NAME,SITUS_ADDR,TRACT_OR_LOT,BLOCK,LEGAL_ACREAGE',
    returnGeometry: 'false',
    f: 'json',
  });

  const url = `${BELL_CAD_FEATURE_SERVER}/0/query?${params}`;

  logger.debug('gis_zoom', `Querying parcels at zoom ${zoom} — radius ${(radiusDeg * 111000).toFixed(0)}m`, {
    zoom, lat, lon, radius_deg: radiusDeg,
  });

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.warn('gis_zoom', `Parcel query failed at zoom ${zoom}: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (!data.features || !Array.isArray(data.features)) {
      logger.warn('gis_zoom', `No features returned at zoom ${zoom}`);
      return [];
    }

    const parcels: NearbyParcelData[] = data.features.map((f: Record<string, Record<string, unknown>>) => ({
      prop_id: Number(f.attributes?.PROP_ID ?? 0),
      owner: f.attributes?.FILE_AS_NAME ? String(f.attributes.FILE_AS_NAME) : null,
      address: f.attributes?.SITUS_ADDR ? String(f.attributes.SITUS_ADDR) : null,
      lot: f.attributes?.TRACT_OR_LOT ? String(f.attributes.TRACT_OR_LOT) : null,
      block: f.attributes?.BLOCK ? String(f.attributes.BLOCK) : null,
      acreage: f.attributes?.LEGAL_ACREAGE ? Number(f.attributes.LEGAL_ACREAGE) : null,
    }));

    logger.info('gis_zoom', `Zoom ${zoom}: found ${parcels.length} parcels`, {
      parcels_count: parcels.length,
      zoom,
      has_lot_data: parcels.some(p => p.lot != null),
      has_address_data: parcels.some(p => p.address != null),
    });

    return parcels;
  } catch (err) {
    logger.error('gis_zoom', `Parcel query error at zoom ${zoom}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Determine if individual lots are visible at this zoom level.
 * Lots are considered visible if we get parcel data back that includes
 * lot numbers, and the count is reasonable for the zoom level.
 */
function assessLotVisibility(
  parcels: NearbyParcelData[],
  zoom: number,
  logger?: PipelineLogger,
): { lots_visible: boolean; lot_labels_readable: boolean; reason: string } {
  logger?.debug('gis_zoom', `Assessing lot visibility at zoom ${zoom} with ${parcels.length} parcels`);

  if (parcels.length === 0) {
    logger?.debug('gis_zoom', `Zoom ${zoom}: No parcels — lot visibility FALSE`);
    return { lots_visible: false, lot_labels_readable: false, reason: 'No parcels returned' };
  }

  const withLots = parcels.filter(p => p.lot != null && p.lot !== '');
  const withAddresses = parcels.filter(p => p.address != null && p.address !== '');
  logger?.debug('gis_zoom', `Zoom ${zoom} parcel breakdown: ${withLots.length} with lots, ${withAddresses.length} with addresses, ${parcels.length} total`, {
    with_lots: withLots.length, with_addresses: withAddresses.length, total: parcels.length,
    sample_lots: withLots.slice(0, 3).map(p => ({ prop_id: p.prop_id, lot: p.lot, block: p.block })),
  });

  // At neighborhood zoom (16), we expect many parcels but individual lots may not be distinguishable
  if (zoom <= 16) {
    if (parcels.length > 50) {
      const result = { lots_visible: false, lot_labels_readable: false, reason: `Too many parcels (${parcels.length}) at zoom ${zoom} — lots not individually distinguishable` };
      logger?.info('gis_zoom', `Zoom ${zoom} assessment: ${result.reason}`, { ...result, zoom });
      return result;
    }
  }

  // At block zoom (18), we should see individual lots starting to appear
  if (zoom >= 18 && withLots.length > 0) {
    const lotRatio = withLots.length / parcels.length;
    logger?.debug('gis_zoom', `Zoom ${zoom} lot ratio: ${(lotRatio * 100).toFixed(1)}% (${withLots.length}/${parcels.length})`, { lot_ratio: lotRatio });
    if (lotRatio >= 0.5) {
      const result = {
        lots_visible: true,
        lot_labels_readable: zoom >= 19,
        reason: `${withLots.length}/${parcels.length} parcels have lot data at zoom ${zoom}`,
      };
      logger?.info('gis_zoom', `Zoom ${zoom} assessment: LOTS VISIBLE — ${result.reason}, labels ${result.lot_labels_readable ? 'READABLE' : 'not readable'}`, { ...result, zoom, lot_ratio: lotRatio });
      return result;
    }
  }

  // At lot zoom (20+), we should definitely see individual lots
  if (zoom >= 20 && parcels.length > 0 && parcels.length <= 20) {
    const result = {
      lots_visible: true,
      lot_labels_readable: true,
      reason: `${parcels.length} parcels visible at lot-level zoom ${zoom}`,
    };
    logger?.info('gis_zoom', `Zoom ${zoom} assessment: LOT-LEVEL DETAIL — ${result.reason}`, { ...result, zoom });
    return result;
  }

  // Default assessment
  const result = {
    lots_visible: withLots.length > 0 && parcels.length <= 30,
    lot_labels_readable: withLots.length > 0 && zoom >= 19,
    reason: `${withLots.length} lots among ${parcels.length} parcels at zoom ${zoom}`,
  };
  logger?.info('gis_zoom', `Zoom ${zoom} assessment (default): lots_visible=${result.lots_visible}, labels_readable=${result.lot_labels_readable} — ${result.reason}`, { ...result, zoom });
  return result;
}

// ── Main Progressive Zoom Function ───────────────────────────────────────────

/**
 * Perform progressive zoom capture from neighborhood level down to lot level.
 * At each zoom level:
 *   1. Query ArcGIS for parcel data visible at this scale
 *   2. Assess whether individual lots are distinguishable
 *   3. Capture map images at key zoom levels (block and lot)
 *   4. Find the target parcel matching the search address
 *
 * Images are only captured at block (18) and lot (20) zoom levels to avoid
 * excessive API calls. Parcel data queries are run at all levels.
 */
export async function progressiveZoomCapture(
  projectId: string,
  address: string,
  logger: PipelineLogger,
  county?: string,
): Promise<ProgressiveZoomResult> {
  const totalStart = Date.now();
  logger.startPhase('gis_zoom', `Progressive zoom capture for: ${address}`);

  const result: ProgressiveZoomResult = {
    zoom_captures: [],
    best_lot_zoom: LOT_ZOOM,
    first_lot_visible_zoom: null,
    all_document_ids: [],
    geocoded: null,
    target_parcel: null,
    adjacent_parcels: [],
    total_duration_ms: 0,
  };

  // Step 1: Geocode
  logger.info('gis_zoom', `Geocoding address: ${address}`);
  const geocoded = await geocodeAddress(address);
  if (!geocoded) {
    logger.error('gis_zoom', `Geocoding failed for: ${address}`);
    result.total_duration_ms = Date.now() - totalStart;
    return result;
  }
  result.geocoded = geocoded;
  logger.info('gis_zoom', `Geocoded to ${geocoded.lat.toFixed(6)}, ${geocoded.lon.toFixed(6)}`, {
    lat: geocoded.lat, lon: geocoded.lon, display_name: geocoded.display_name,
  });

  // Mutable center — starts at geocoded location, re-centers on actual
  // parcel centroid once we find the target parcel.
  let centerLat = geocoded.lat;
  let centerLon = geocoded.lon;
  let recentered = false;

  // Step 2: Progressive zoom — query parcels at each level
  for (const level of PROGRESSIVE_ZOOM_LEVELS) {
    const zoomStart = Date.now();

    const parcels = await queryParcelsAtZoom(centerLat, centerLon, level.zoom, logger);
    const visibility = assessLotVisibility(parcels, level.zoom, logger);

    logger.info('gis_zoom', `Zoom ${level.zoom} (${level.label}): ${parcels.length} parcels, lots_visible=${visibility.lots_visible}`, {
      zoom: level.zoom,
      parcels_count: parcels.length,
      lots_visible: visibility.lots_visible,
      lot_labels_readable: visibility.lot_labels_readable,
      reason: visibility.reason,
    });

    if (visibility.lots_visible && result.first_lot_visible_zoom === null) {
      result.first_lot_visible_zoom = level.zoom;
      logger.info('gis_zoom', `First lot visibility at zoom ${level.zoom}`);
    }

    // Capture map images only at key zoom levels (block + lot)
    // Use the current center (which may have been corrected to parcel centroid)
    const captureCoords: GeoPoint = { lat: centerLat, lon: centerLon, display_name: geocoded.display_name };
    let mapSet: ParcelMapSet | null = null;
    if (level.zoom === BLOCK_ZOOM || level.zoom === LOT_ZOOM) {
      try {
        logger.info('gis_zoom', `Capturing map images at zoom ${level.zoom} (${level.label})`);
        mapSet = await captureParcelMaps(projectId, address, level.zoom, captureCoords, county);
        result.all_document_ids.push(...mapSet.documentIds);
        logger.info('gis_zoom', `Captured ${mapSet.documentIds.length} images at zoom ${level.zoom}`, {
          document_ids: mapSet.documentIds,
          steps: mapSet.steps,
        });
      } catch (err) {
        logger.error('gis_zoom', `Map capture failed at zoom ${level.zoom}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const capture: ZoomLevelCapture = {
      zoom: level.zoom,
      radius_meters: level.radius_m,
      parcels_found: parcels.length,
      lots_visible: visibility.lots_visible,
      lot_labels_readable: visibility.lot_labels_readable,
      map_set: mapSet,
      parcels,
      duration_ms: Date.now() - zoomStart,
    };

    result.zoom_captures.push(capture);

    // Find target parcel (matching address) — use scored matching to avoid
    // picking an adjacent lot that happens to substring-match.
    if (!result.target_parcel) {
      const target = findBestParcelMatch(address, parcels, logger);

      if (target) {
        result.target_parcel = target;
        logger.match('gis_zoom', `Found target parcel at zoom ${level.zoom}: prop_id=${target.prop_id}, lot=${target.lot}, block=${target.block}`, {
          prop_id: target.prop_id,
          address: target.address,
          lot: target.lot,
          block: target.block,
          acreage: target.acreage,
        });

        // ── Re-center on actual parcel coordinates ──
        // Nominatim geocoding can be miles off for rural addresses.
        // Query Bell CAD for the parcel's actual geometry and compute
        // the centroid so all remaining zoom levels + map captures
        // are centered on the real property location.
        if (!recentered) {
          const centroid = await fetchParcelCentroid(target.prop_id, logger);
          if (centroid) {
            const offsetLat = Math.abs(centroid.lat - centerLat);
            const offsetLon = Math.abs(centroid.lon - centerLon);
            const offsetMiles = Math.sqrt(
              Math.pow(offsetLat * 69, 2) + Math.pow(offsetLon * 54.6, 2),
            );
            logger.info('gis_zoom',
              `RE-CENTERING: geocoded was ${offsetMiles.toFixed(2)} miles from parcel centroid — ` +
              `moving from (${centerLat.toFixed(6)}, ${centerLon.toFixed(6)}) → ` +
              `(${centroid.lat.toFixed(6)}, ${centroid.lon.toFixed(6)})`, {
                geocoded_lat: centerLat, geocoded_lon: centerLon,
                parcel_lat: centroid.lat, parcel_lon: centroid.lon,
                offset_miles: offsetMiles, prop_id: target.prop_id,
              },
            );
            centerLat = centroid.lat;
            centerLon = centroid.lon;
            recentered = true;
            // Update result so callers get the corrected coordinates
            result.geocoded = { lat: centroid.lat, lon: centroid.lon, display_name: geocoded.display_name };
          }
        }

        // Collect adjacent parcels (same block, different lot)
        if (target.block) {
          result.adjacent_parcels = parcels.filter(p =>
            p.prop_id !== target.prop_id &&
            p.block === target.block,
          );
          logger.info('gis_zoom', `Found ${result.adjacent_parcels.length} adjacent parcels in block ${target.block}`);
        }
      }
    }
  }

  // Determine best zoom level for lot detail
  const lotVisibleCaptures = result.zoom_captures.filter(c => c.lots_visible);
  if (lotVisibleCaptures.length > 0) {
    // Pick the tightest zoom where lots are visible and readable
    const readable = lotVisibleCaptures.filter(c => c.lot_labels_readable);
    result.best_lot_zoom = readable.length > 0
      ? readable[readable.length - 1].zoom
      : lotVisibleCaptures[lotVisibleCaptures.length - 1].zoom;
  }

  result.total_duration_ms = Date.now() - totalStart;
  logger.endPhase('gis_zoom', `Progressive zoom complete: ${result.zoom_captures.length} levels, best lot zoom=${result.best_lot_zoom}, target parcel ${result.target_parcel ? 'found' : 'NOT found'}`);

  logger.info('gis_zoom', 'Progressive zoom summary', {
    zoom_levels_captured: result.zoom_captures.length,
    best_lot_zoom: result.best_lot_zoom,
    first_lot_visible_zoom: result.first_lot_visible_zoom,
    target_found: !!result.target_parcel,
    adjacent_count: result.adjacent_parcels.length,
    total_documents: result.all_document_ids.length,
    total_duration_ms: result.total_duration_ms,
  });

  return result;
}

/**
 * Capture additional zoom level if the initial captures didn't
 * resolve lot details. Called when the ZOOM_DEEPER trigger fires.
 */
export async function captureAdditionalZoom(
  projectId: string,
  address: string,
  currentBestZoom: number,
  geocoded: GeoPoint,
  logger: PipelineLogger,
  county?: string,
): Promise<{ map_set: ParcelMapSet | null; parcels: NearbyParcelData[]; new_zoom: number }> {
  const nextZoom = Math.min(currentBestZoom + 1, 21);
  logger.info('gis_zoom', `Capturing additional zoom level ${nextZoom} (upgrading from ${currentBestZoom})`);

  const parcels = await queryParcelsAtZoom(geocoded.lat, geocoded.lon, nextZoom, logger);

  let mapSet: ParcelMapSet | null = null;
  try {
    mapSet = await captureParcelMaps(projectId, address, nextZoom, geocoded, county);
    logger.info('gis_zoom', `Additional zoom ${nextZoom}: ${mapSet.documentIds.length} images, ${parcels.length} parcels`);
  } catch (err) {
    logger.error('gis_zoom', `Additional zoom capture failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { map_set: mapSet, parcels, new_zoom: nextZoom };
}
