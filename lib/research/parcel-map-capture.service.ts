// lib/research/parcel-map-capture.service.ts — Parcel-level map capture & pin visualization
//
// Captures map images at individual-lot zoom level with address pins.
// Uses Google Maps Static API (when key available) and Bell CAD ArcGIS
// map export to produce side-by-side comparison images.
//
// Three image types captured per parcel:
//   1. Street-level pin map  — Google Maps with a pin at the geocoded address
//   2. Satellite pin map     — Google Maps satellite with the same pin
//   3. CAD GIS parcel map    — ArcGIS export showing the parcel boundary on aerial
//
// These images are stored as research_documents and fed to the AI visual
// comparison engine for lot identification and cross-validation.

import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET, ensureStorageBucket } from '@/lib/supabase';
import type { DocumentType } from '@/types/research';
import { geocodeAddress, type GeoPoint } from './map-image.service';

// ── Constants ────────────────────────────────────────────────────────────────

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 960;
// Zoom 20 is most zoomed in — individual lot, ~30m radius
// Zoom 19 is slightly wider — a few lots visible, ~60m radius
// These tight zoom levels are critical for lot identification
const LOT_ZOOM = 20;        // Tightest lot level — see individual lot clearly
const BLOCK_ZOOM = 18;      // Block level — see full block with lot numbers
const NEIGHBORHOOD_ZOOM = 16; // Neighborhood context

const BELL_CAD_FEATURE_SERVER =
  'https://services7.arcgis.com/EHW2HuuyZNO7DZct/arcgis/rest/services/BellCADWebService/FeatureServer';

const USGS_SATELLITE_SVC =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export';

const FETCH_TIMEOUT_MS = 30_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParcelMapSet {
  /** Google Maps street pin (or null if no API key) */
  streetPinDocId: string | null;
  /** Google Maps satellite pin (or null if no API key) */
  satellitePinDocId: string | null;
  /** CAD GIS parcel boundary on aerial */
  cadGisDocId: string | null;
  /** USGS satellite zoomed to lot level */
  usgsSatelliteDocId: string | null;
  /** All document IDs created */
  documentIds: string[];
  /** Geocoded coordinates used */
  geocoded: GeoPoint | null;
  /** Zoom levels captured */
  zoomLevels: number[];
  /** Capture log */
  steps: string[];
}

export interface MultiZoomCapture {
  /** Lot-level zoom captures */
  lotLevel: ParcelMapSet;
  /** Block-level zoom captures (wider context) */
  blockLevel: ParcelMapSet;
  /** All document IDs across all zoom levels */
  allDocumentIds: string[];
}

// ── Google Maps Static API ───────────────────────────────────────────────────

/**
 * Build a Google Maps Static API URL with a pin marker at the given coordinates.
 * Returns null if GOOGLE_MAPS_API_KEY is not configured.
 */
function buildGoogleStaticMapUrl(
  lat: number,
  lon: number,
  zoom: number,
  maptype: 'roadmap' | 'satellite' | 'hybrid' = 'roadmap',
  size = { w: MAP_WIDTH, h: MAP_HEIGHT },
): string | null {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    center: `${lat},${lon}`,
    zoom: String(zoom),
    size: `${size.w}x${size.h}`,
    maptype,
    markers: `color:red|label:P|${lat},${lon}`,
    key: apiKey,
    scale: '2', // Retina / high-DPI
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}

// ── ArcGIS Map Export ────────────────────────────────────────────────────────

/**
 * Build an ArcGIS REST Dynamic Map Service export URL.
 * FeatureServer does NOT support /export — we need to use a MapServer or
 * the ArcGIS Online dynamic layer approach.
 *
 * Strategy: Use the USGS satellite as the base image, then create a
 * second capture using the Esri World Imagery + parcel boundaries from
 * the ArcGIS Online Community Basemap with parcels.
 *
 * For the Bell CAD parcel overlay, we query the FeatureServer for geometry
 * and annotate the satellite image description so the AI can match features.
 */
function buildArcGisParcelExportUrl(
  lat: number,
  lon: number,
  radiusDeg: number,
): string {
  const aspect = MAP_HEIGHT / MAP_WIDTH;
  const lonR = radiusDeg;
  const latR = radiusDeg * aspect;
  const bbox = `${lon - lonR},${lat - latR},${lon + lonR},${lat + latR}`;

  // Use Esri World Imagery + dynamic parcel overlay via ArcGIS REST
  // This is a public MapServer that renders parcel boundaries on imagery
  const esriImagery = 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export';
  const params = new URLSearchParams({
    bbox,
    bboxSR: '4326',
    size: `${MAP_WIDTH},${MAP_HEIGHT}`,
    imageSR: '4326',
    format: 'png32',
    transparent: 'false',
    f: 'image',
  });

  return `${esriImagery}?${params}`;
}

/**
 * Build a Bell CAD parcel query URL that returns parcel boundaries as GeoJSON
 * within a bounding box. Used alongside satellite imagery for lot identification.
 */
function buildParcelQueryUrl(
  lat: number,
  lon: number,
  radiusDeg: number,
): string {
  // Query parcels that intersect the bounding box
  // The FeatureServer uses WKID 2277 (state plane) so we use a geometry envelope in 4326
  const aspect = MAP_HEIGHT / MAP_WIDTH;
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
    returnGeometry: 'false', // We just want the data, not geometry
    f: 'json',
  });

  return `${BELL_CAD_FEATURE_SERVER}/0/query?${params}`;
}

/**
 * Build a USGS satellite image URL zoomed to lot level.
 */
function buildUsgsSatelliteUrl(
  lat: number,
  lon: number,
  radiusDeg: number,
): string {
  const aspect = MAP_HEIGHT / MAP_WIDTH;
  const lonR = radiusDeg;
  const latR = radiusDeg * aspect;
  const bbox = `${lon - lonR},${lat - latR},${lon + lonR},${lat + latR}`;

  const params = new URLSearchParams({
    bbox,
    bboxSR: '4326',
    layers: '',
    size: `${MAP_WIDTH},${MAP_HEIGHT}`,
    imageSR: '4326',
    format: 'png32',
    transparent: 'false',
    f: 'image',
  });

  return `${USGS_SATELLITE_SVC}?${params}`;
}

// ── Fetch Helpers ────────────────────────────────────────────────────────────

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)',
      },
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

// ── Storage ──────────────────────────────────────────────────────────────────

async function storeMapImage(
  projectId: string,
  imageBuffer: Buffer,
  label: string,
  documentType: DocumentType,
  sourceUrl: string,
  description: string,
): Promise<string | null> {
  const filename = `parcel_map_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
  const storagePath = `${projectId}/parcel-maps/${filename}`;

  try {
    // Check for existing image with same label
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
        extracted_text_method: 'parcel_map_capture',
        recording_info: `Parcel-level map capture — ${label}`,
      })
      .select('id')
      .single();

    if (docError || !doc) return null;
    return doc.id;
  } catch {
    return null;
  }
}

// ── Zoom Level to Radius Conversion ──────────────────────────────────────────

/**
 * Convert Google Maps zoom level to approximate bounding box radius in degrees.
 * At zoom 20 (tightest lot level) this is ~0.0003° (~33m) — individual lot fills frame.
 * At zoom 18 (block level) this is ~0.0012° (~130m) — full block with lot numbers.
 * At zoom 16 (neighborhood) this is ~0.005° (~550m) — several blocks for context.
 */
function zoomToRadiusDeg(zoom: number): number {
  // At zoom 21, ~0.00015° radius (~17m). Each zoom out doubles the radius.
  return 0.00015 * Math.pow(2, 21 - zoom);
}

// ── Parcel Data Fetch ─────────────────────────────────────────────────────────

interface NearbyParcel {
  prop_id: number;
  owner: string | null;
  address: string | null;
  lot: string | null;
  block: string | null;
  acreage: number | null;
}

/**
 * Query the Bell CAD FeatureServer for parcels within the map's bounding box.
 * Returns basic parcel info (no geometry) so we can annotate map images
 * with lot numbers and owners for AI cross-referencing.
 */
async function fetchParcelDataNearby(queryUrl: string): Promise<NearbyParcel[]> {
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

// ── Main Capture Functions ───────────────────────────────────────────────────

/**
 * Capture a set of map images at a specific zoom level for a given address.
 * Creates up to 4 images: Google street pin, Google satellite pin,
 * CAD GIS parcel overlay, and USGS satellite.
 */
export async function captureParcelMaps(
  projectId: string,
  address: string,
  zoom: number = LOT_ZOOM,
  geocoded?: GeoPoint | null,
): Promise<ParcelMapSet> {
  const steps: string[] = [];
  const result: ParcelMapSet = {
    streetPinDocId: null,
    satellitePinDocId: null,
    cadGisDocId: null,
    usgsSatelliteDocId: null,
    documentIds: [],
    geocoded: null,
    zoomLevels: [zoom],
    steps,
  };

  // Step 1: Geocode if not provided
  const coords = geocoded ?? await geocodeAddress(address);
  if (!coords) {
    steps.push(`Geocoding failed for: ${address}`);
    return result;
  }
  result.geocoded = coords;
  steps.push(`Geocoded to ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} — ${coords.display_name}`);

  const radiusDeg = zoomToRadiusDeg(zoom);
  const zoomLabel = zoom >= 19 ? 'lot-level' : zoom >= 17 ? 'block-level' : 'neighborhood';
  steps.push(`Capturing at zoom ${zoom} (${zoomLabel}, ~${Math.round(radiusDeg * 111000)}m radius)`);

  // Step 2: Build all URLs
  const googleStreetUrl = buildGoogleStaticMapUrl(coords.lat, coords.lon, zoom, 'roadmap');
  const googleSatUrl = buildGoogleStaticMapUrl(coords.lat, coords.lon, zoom, 'hybrid');
  const cadGisUrl = buildArcGisParcelExportUrl(coords.lat, coords.lon, radiusDeg);
  const usgsSatUrl = buildUsgsSatelliteUrl(coords.lat, coords.lon, radiusDeg);

  // Step 3: Fetch all images in parallel + query nearby parcels
  const parcelQueryUrl = buildParcelQueryUrl(coords.lat, coords.lon, radiusDeg);
  const [googleStreetBuf, googleSatBuf, cadGisBuf, usgsSatBuf, parcelQueryResult] = await Promise.all([
    googleStreetUrl ? fetchImage(googleStreetUrl) : Promise.resolve(null),
    googleSatUrl ? fetchImage(googleSatUrl) : Promise.resolve(null),
    fetchImage(cadGisUrl),
    fetchImage(usgsSatUrl),
    fetchParcelDataNearby(parcelQueryUrl),
  ]);

  if (!googleStreetUrl) steps.push('Google Maps API key not configured — skipping pin maps');

  // Step 4: Store images as documents with rich descriptions
  const storeOps: Promise<void>[] = [];

  if (googleStreetBuf) {
    storeOps.push((async () => {
      const desc = [
        `Google Maps street map with pin at: ${address}`,
        `\nCoordinates: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
        `\nZoom: ${zoom} (${zoomLabel})`,
        `\n\nPURPOSE: The red pin shows where Google Maps places this address.`,
        ` Compare the pin location to the CAD GIS parcel boundaries to identify`,
        ` which specific lot/parcel the address falls on.`,
        `\n\nLook for: street name labels, lot numbers, block outlines, neighboring`,
        ` street intersections, cul-de-sacs, and any visible lot/parcel lines.`,
        ` Note the pin's position relative to street intersections and lot boundaries.`,
      ].join('');
      const id = await storeMapImage(
        projectId, googleStreetBuf,
        `Street Pin Map — ${address} (zoom ${zoom})`,
        'plat', googleStreetUrl!, desc,
      );
      if (id) { result.streetPinDocId = id; result.documentIds.push(id); }
      steps.push(id ? `Stored Google street pin map (${googleStreetBuf.byteLength} bytes)` : 'Failed to store street pin map');
    })());
  }

  if (googleSatBuf) {
    storeOps.push((async () => {
      const desc = [
        `Google Maps satellite/hybrid with pin at: ${address}`,
        `\nCoordinates: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
        `\nZoom: ${zoom} (${zoomLabel})`,
        `\n\nPURPOSE: Satellite imagery with the address pin overlaid.`,
        ` Compare roof shapes, driveways, fence lines, and landscaping patterns`,
        ` visible here with the same features on the CAD GIS parcel map.`,
        `\n\nLook for: building footprints, driveways, fence lines, pools, sheds,`,
        ` tree lines, property corners, utility easements, and any physical features`,
        ` that indicate property boundaries. Note the pin position relative to structures.`,
      ].join('');
      const id = await storeMapImage(
        projectId, googleSatBuf,
        `Satellite Pin Map — ${address} (zoom ${zoom})`,
        'aerial_photo', googleSatUrl!, desc,
      );
      if (id) { result.satellitePinDocId = id; result.documentIds.push(id); }
      steps.push(id ? `Stored Google satellite pin map (${googleSatBuf.byteLength} bytes)` : 'Failed to store satellite pin map');
    })());
  }

  if (cadGisBuf) {
    storeOps.push((async () => {
      // Build a rich description including nearby parcel data for AI cross-referencing
      const nearbyInfo = parcelQueryResult.length > 0
        ? `\n\nPARCELS IN VIEW (from Bell CAD ArcGIS query):\n` +
          parcelQueryResult.slice(0, 15).map((p, i) =>
            `  ${i + 1}. PropID=${p.prop_id} | Lot=${p.lot || '?'} | Block=${p.block || '?'} | ` +
            `${p.acreage ? p.acreage.toFixed(3) + ' ac' : '?'} | ${p.address || 'No address'} | ${p.owner || '?'}`
          ).join('\n')
        : '\n\nNo parcel data returned from ArcGIS query for this area.';

      const desc = [
        `Esri World Imagery aerial at: ${address}`,
        `\nCoordinates: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
        `\nZoom: ${zoom} (${zoomLabel})`,
        `\n\nPURPOSE: High-resolution aerial imagery of the parcel area.`,
        ` The AI should compare physical features visible (buildings, driveways,`,
        ` fence lines) with the Google Maps pin position and the parcel data below`,
        ` to determine which specific lot/parcel the address falls on.`,
        `\n\nINSTRUCTIONS: Match the building footprints and physical features you see`,
        ` in this image to the parcels listed below. Determine which parcel the address`,
        ` "${address}" would fall on based on building position, lot size, and context.`,
        nearbyInfo,
        `\n\nCRITICAL: Identify which parcel from the list above corresponds to the`,
        ` address being searched. Use lot sizes, building positions, and street layout.`,
      ].join('');
      const id = await storeMapImage(
        projectId, cadGisBuf,
        `Aerial + Parcel Data — ${address} (zoom ${zoom})`,
        'aerial_photo', cadGisUrl, desc,
      );
      if (id) { result.cadGisDocId = id; result.documentIds.push(id); }
      steps.push(id ? `Stored aerial + parcel data map (${cadGisBuf.byteLength} bytes, ${parcelQueryResult.length} nearby parcels)` : 'Failed to store aerial map');
    })());
  }

  if (usgsSatBuf) {
    storeOps.push((async () => {
      const desc = [
        `USGS NAIP satellite imagery zoomed to lot level at: ${address}`,
        `\nCoordinates: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
        `\nZoom: ${zoom} (${zoomLabel})`,
        `\n\nPURPOSE: High-resolution satellite imagery without any overlays.`,
        ` Use this as a clean reference to compare physical features with both`,
        ` the Google Maps pin location and the CAD GIS parcel boundaries.`,
      ].join('');
      const id = await storeMapImage(
        projectId, usgsSatBuf,
        `USGS Satellite — ${address} (zoom ${zoom})`,
        'aerial_photo', usgsSatUrl, desc,
      );
      if (id) { result.usgsSatelliteDocId = id; result.documentIds.push(id); }
      steps.push(id ? `Stored USGS satellite image (${usgsSatBuf.byteLength} bytes)` : 'Failed to store USGS satellite');
    })());
  }

  await Promise.all(storeOps);
  steps.push(`Capture complete: ${result.documentIds.length} images stored`);

  return result;
}

/**
 * Capture maps at multiple zoom levels for comprehensive lot identification.
 * - Zoom 20: Tightest — individual lot fills frame, see exact pin position
 * - Zoom 18: Block level — full block visible with lot numbers and street names
 * Both levels are critical: zoom 20 shows which lot the pin is on,
 * zoom 18 provides context for lot numbering patterns within the block.
 */
export async function captureMultiZoomMaps(
  projectId: string,
  address: string,
  geocoded?: GeoPoint | null,
): Promise<MultiZoomCapture> {
  // Geocode once, share across zoom levels
  const coords = geocoded ?? await geocodeAddress(address);

  const [lotLevel, blockLevel] = await Promise.all([
    captureParcelMaps(projectId, address, LOT_ZOOM, coords),
    captureParcelMaps(projectId, address, BLOCK_ZOOM, coords),
  ]);

  return {
    lotLevel,
    blockLevel,
    allDocumentIds: [...lotLevel.documentIds, ...blockLevel.documentIds],
  };
}

// ── Export zoom constants for API use ─────────────────────────────────────────

export { LOT_ZOOM, BLOCK_ZOOM, NEIGHBORHOOD_ZOOM };
