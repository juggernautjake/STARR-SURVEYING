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
import {
  captureParcelMaps,
  type ParcelMapSet,
  LOT_ZOOM,
  BLOCK_ZOOM,
} from './parcel-map-capture.service';

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

const BELL_CAD_FEATURE_SERVER =
  'https://services7.arcgis.com/EHW2HuuyZNO7DZct/arcgis/rest/services/BellCADWebService/FeatureServer';

const FETCH_TIMEOUT_MS = 30_000;

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
): { lots_visible: boolean; lot_labels_readable: boolean; reason: string } {
  if (parcels.length === 0) {
    return { lots_visible: false, lot_labels_readable: false, reason: 'No parcels returned' };
  }

  const withLots = parcels.filter(p => p.lot != null && p.lot !== '');
  const withAddresses = parcels.filter(p => p.address != null && p.address !== '');

  // At neighborhood zoom (16), we expect many parcels but individual lots may not be distinguishable
  if (zoom <= 16) {
    if (parcels.length > 50) {
      return { lots_visible: false, lot_labels_readable: false, reason: `Too many parcels (${parcels.length}) at zoom ${zoom} — lots not individually distinguishable` };
    }
  }

  // At block zoom (18), we should see individual lots starting to appear
  if (zoom >= 18 && withLots.length > 0) {
    const lotRatio = withLots.length / parcels.length;
    if (lotRatio >= 0.5) {
      return {
        lots_visible: true,
        lot_labels_readable: zoom >= 19,
        reason: `${withLots.length}/${parcels.length} parcels have lot data at zoom ${zoom}`,
      };
    }
  }

  // At lot zoom (20+), we should definitely see individual lots
  if (zoom >= 20 && parcels.length > 0 && parcels.length <= 20) {
    return {
      lots_visible: true,
      lot_labels_readable: true,
      reason: `${parcels.length} parcels visible at lot-level zoom ${zoom}`,
    };
  }

  // Default assessment
  return {
    lots_visible: withLots.length > 0 && parcels.length <= 30,
    lot_labels_readable: withLots.length > 0 && zoom >= 19,
    reason: `${withLots.length} lots among ${parcels.length} parcels at zoom ${zoom}`,
  };
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
  const coords = await geocodeAddress(address);
  if (!coords) {
    logger.error('gis_zoom', `Geocoding failed for: ${address}`);
    result.total_duration_ms = Date.now() - totalStart;
    return result;
  }
  result.geocoded = coords;
  logger.info('gis_zoom', `Geocoded to ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`, {
    lat: coords.lat, lon: coords.lon, display_name: coords.display_name,
  });

  // Step 2: Progressive zoom — query parcels at each level
  for (const level of PROGRESSIVE_ZOOM_LEVELS) {
    const zoomStart = Date.now();

    const parcels = await queryParcelsAtZoom(coords.lat, coords.lon, level.zoom, logger);
    const visibility = assessLotVisibility(parcels, level.zoom);

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
    let mapSet: ParcelMapSet | null = null;
    if (level.zoom === BLOCK_ZOOM || level.zoom === LOT_ZOOM) {
      try {
        logger.info('gis_zoom', `Capturing map images at zoom ${level.zoom} (${level.label})`);
        mapSet = await captureParcelMaps(projectId, address, level.zoom, coords, county);
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

    // Find target parcel (matching address)
    if (!result.target_parcel) {
      const normalizedAddress = address.toUpperCase().replace(/[.,#]/g, '').trim();
      const target = parcels.find(p => {
        if (!p.address) return false;
        const pAddr = p.address.toUpperCase().replace(/[.,#]/g, '').trim();
        return pAddr === normalizedAddress || pAddr.includes(normalizedAddress) || normalizedAddress.includes(pAddr);
      });

      if (target) {
        result.target_parcel = target;
        logger.match('gis_zoom', `Found target parcel at zoom ${level.zoom}: prop_id=${target.prop_id}, lot=${target.lot}, block=${target.block}`, {
          prop_id: target.prop_id,
          address: target.address,
          lot: target.lot,
          block: target.block,
          acreage: target.acreage,
        });

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
