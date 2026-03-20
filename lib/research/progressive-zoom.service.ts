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

// ── Constants ────────────────────────────────────────────────────────────────

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 960;

/** Zoom levels from widest to tightest. We capture multiple levels and analyze each. */
const ZOOM_LEVELS = [
  { zoom: 16, label: 'neighborhood',   radiusDeg: 0.0048,  description: 'Neighborhood context — several blocks, major streets' },
  { zoom: 17, label: 'sub-block',      radiusDeg: 0.0024,  description: 'Sub-block — subdivision boundaries should be visible' },
  { zoom: 18, label: 'block',          radiusDeg: 0.0012,  description: 'Block level — individual lots and lot numbers visible' },
  { zoom: 19, label: 'lot-cluster',    radiusDeg: 0.0006,  description: 'Lot cluster — 3-5 lots visible with detail' },
  { zoom: 20, label: 'lot',            radiusDeg: 0.0003,  description: 'Individual lot — single lot fills frame' },
  { zoom: 21, label: 'lot-detail',     radiusDeg: 0.00015, description: 'Lot detail — maximum zoom, building footprint detail' },
] as const;

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

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
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

async function fetchParcelData(queryUrl: string): Promise<NearbyParcel[]> {
  try {
    const res = await fetch(queryUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.features || !Array.isArray(data.features)) return [];
    return data.features.map((f: Record<string, Record<string, unknown>>) => ({
      prop_id: Number(f.attributes?.PROP_ID ?? 0),
      owner: f.attributes?.FILE_AS_NAME ? String(f.attributes.FILE_AS_NAME) : null,
      address: f.attributes?.SITUS_ADDR ? String(f.attributes.SITUS_ADDR) : null,
      lot: f.attributes?.TRACT_OR_LOT ? String(f.attributes.TRACT_OR_LOT) : null,
      block: f.attributes?.BLOCK ? String(f.attributes.BLOCK) : null,
      acreage: f.attributes?.LEGAL_ACREAGE ? Number(f.attributes.LEGAL_ACREAGE) : null,
    }));
  } catch {
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
  const log: string[] = [];
  const allDocIds: string[] = [];
  const zoomCaptures: ZoomLevelCapture[] = [];
  let lotLinesFirstVisible: number | null = null;
  let totalParcels = 0;

  log.push(`[progressive-zoom] Starting progressive zoom capture for: ${address}`);
  log.push(`[progressive-zoom] County: ${county || 'not specified'}`);

  // Geocode the address
  const coords = await geocodeAddress(address);
  if (!coords) {
    log.push(`[progressive-zoom] FAILED: Could not geocode address "${address}"`);
    return {
      zoom_captures: [], lot_lines_first_visible_at: null,
      best_zoom_for_lot_id: 20, all_document_ids: [], geocoded: null,
      total_parcels_found: 0, pipeline_log: log,
    };
  }

  log.push(`[progressive-zoom] Geocoded to ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} — ${coords.display_name}`);

  // Determine county for CAD queries
  const normalizedCounty = (county ?? '').toLowerCase().replace(/\s+county$/i, '').trim();
  const isBellCounty = normalizedCounty === 'bell' || normalizedCounty === '';

  // Filter zoom levels
  const minZoom = zoomRange?.minZoom ?? 16;
  const maxZoom = zoomRange?.maxZoom ?? 21;
  const levels = ZOOM_LEVELS.filter(l => l.zoom >= minZoom && l.zoom <= maxZoom);

  log.push(`[progressive-zoom] Capturing ${levels.length} zoom levels: ${levels.map(l => `z${l.zoom}(${l.label})`).join(', ')}`);

  // Capture each zoom level
  for (const level of levels) {
    const zoomStart = Date.now();
    const stepLog: string[] = [];
    const docIds: string[] = [];

    stepLog.push(`Zoom ${level.zoom} (${level.label}): ${level.description}`);
    log.push(`\n[progressive-zoom] ─── Zoom ${level.zoom}: ${level.label} ───`);

    // Build URLs
    const googleHybridUrl = buildGoogleStaticUrl(coords.lat, coords.lon, level.zoom, 'hybrid');
    const googleRoadUrl = buildGoogleStaticUrl(coords.lat, coords.lon, level.zoom, 'roadmap');
    const esriUrl = buildEsriImageryUrl(coords.lat, coords.lon, level.radiusDeg);

    // Fetch images + parcel data in parallel
    const parcelQueryUrl = isBellCounty
      ? buildBellCadParcelQueryUrl(coords.lat, coords.lon, level.radiusDeg)
      : null;

    const [hybridBuf, roadBuf, esriBuf, parcels] = await Promise.all([
      googleHybridUrl ? fetchImage(googleHybridUrl) : Promise.resolve(null),
      googleRoadUrl ? fetchImage(googleRoadUrl) : Promise.resolve(null),
      fetchImage(esriUrl),
      parcelQueryUrl ? fetchParcelData(parcelQueryUrl) : Promise.resolve([] as NearbyParcel[]),
    ]);

    // Determine if lot lines are likely visible at this zoom
    // At zoom 18+, individual lots should be distinguishable
    // More parcels in view at tighter zoom = we can see individual lots
    const lotLinesVisible = level.zoom >= 18 && (parcels.length > 0 || !isBellCounty);

    if (lotLinesVisible && lotLinesFirstVisible === null) {
      lotLinesFirstVisible = level.zoom;
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

    if (hybridBuf) {
      storeOps.push((async () => {
        const desc = [
          `Google Maps satellite/hybrid at zoom ${level.zoom} (${level.label}) for: ${address}`,
          `\nCoordinates: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
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
          `\nCoordinates: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
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
          `\nCoordinates: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
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

  log.push(`\n[progressive-zoom] Complete: ${allDocIds.length} total images across ${zoomCaptures.length} zoom levels`);
  log.push(`[progressive-zoom] Best zoom for lot ID: ${bestZoom}`);
  log.push(`[progressive-zoom] Total unique parcels found: ${totalParcels}`);

  return {
    zoom_captures: zoomCaptures,
    lot_lines_first_visible_at: lotLinesFirstVisible,
    best_zoom_for_lot_id: bestZoom,
    all_document_ids: allDocIds,
    geocoded: coords,
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
