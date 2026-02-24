// lib/research/map-image.service.ts — Location imagery capture
//
// Geocodes a property address and fetches satellite + topo map images from
// USGS National Map (public ArcGIS REST service — no API key required).
// Images are stored in Supabase Storage as project documents so the AI
// analysis phase can apply Claude Vision to extract visible boundary features.
//
// USGS National Map ArcGIS services used:
//   Satellite: basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export
//   Topo:      basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export

import { supabaseAdmin } from '@/lib/supabase';
import type { DocumentType } from '@/types/research';

// ── Constants ────────────────────────────────────────────────────────────────

// Must include a descriptive User-Agent per Nominatim usage policy
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const CONTACT_EMAIL = process.env.BUSINESS_EMAIL || 'info@starr-surveying.com';
const USER_AGENT = `STARR-Surveying/1.0 (Texas RPLS research; contact: ${CONTACT_EMAIL})`;

// USGS National Map public ArcGIS REST export endpoints — no API key needed
const USGS_SATELLITE_SVC = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export';
const USGS_TOPO_SVC      = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export';

// Image dimensions for stored captures (good balance of detail vs file size)
const MAP_WIDTH  = 1024;
const MAP_HEIGHT = 768;

// Half-width in degrees of the bounding box — ~400m radius at Texas latitudes
const PARCEL_RADIUS_DEG = 0.004;

// Approximate meters per degree of latitude (equatorial value; acceptable for Texas)
const METERS_PER_DEGREE = 111_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lon: number;
  display_name: string;
}

export interface LocationImageResult {
  /** IDs of created research_documents rows (ready for analysis) */
  documentIds: string[];
  /** Geocoded coordinates if resolution succeeded */
  geocoded: GeoPoint | null;
  /** Public URL to the satellite image stored in Supabase (or null on failure) */
  satelliteDocumentId: string | null;
  /** Public URL to the topo map image stored in Supabase (or null on failure) */
  topoDocumentId: string | null;
  /** Static map preview URL safe to embed in the UI without storing */
  previewUrl: string | null;
}

// ── Geocoding ────────────────────────────────────────────────────────────────

/**
 * Geocode an address string to WGS-84 coordinates using Nominatim.
 * Returns null if the address cannot be resolved.
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const query = address.includes(',') ? address : `${address}, Texas, USA`;
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'us',
    addressdetails: '0',
  });

  try {
    const res = await fetch(`${NOMINATIM_SEARCH}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) return null;

    const data = await res.json() as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data || data.length === 0) return null;

    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name,
    };
  } catch {
    return null;
  }
}

// ── Static map URL builders ──────────────────────────────────────────────────

/**
 * Build a USGS ArcGIS MapServer export URL for a given coordinate and service.
 * The resulting URL returns a PNG image directly — no API key needed.
 */
function buildUSGSExportUrl(
  lat: number,
  lon: number,
  serviceUrl: string,
  radiusDeg = PARCEL_RADIUS_DEG,
): string {
  const aspect = MAP_HEIGHT / MAP_WIDTH; // 0.75 for 4:3
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

  return `${serviceUrl}?${params}`;
}

/**
 * Return a lightweight preview URL (satellite) suitable for <img src="..."> in the UI.
 * This URL is a direct fetch from USGS — no cost, no key, publicly accessible.
 */
export function buildPreviewUrl(lat: number, lon: number): string {
  // Slightly wider view for the preview thumbnail (1.5× radius)
  return buildUSGSExportUrl(lat, lon, USGS_SATELLITE_SVC, PARCEL_RADIUS_DEG * 1.5);
}

// ── Image fetch ──────────────────────────────────────────────────────────────

async function fetchMapImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null; // USGS returns error JSON when out of bounds

    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

// ── Supabase storage helpers ─────────────────────────────────────────────────

async function storeImageAsDocument(
  projectId: string,
  imageBuffer: Buffer,
  label: string,
  documentType: DocumentType,
  sourceUrl: string,
  additionalText: string,
): Promise<string | null> {
  const filename = `${documentType}_${Date.now()}.png`;
  const storagePath = `${projectId}/map-images/${filename}`;

  try {
    // Skip if an image with the same label already exists for this project
    const { data: existingImage } = await supabaseAdmin
      .from('research_documents')
      .select('id')
      .eq('research_project_id', projectId)
      .eq('document_label', label)
      .eq('source_type', 'property_search')
      .maybeSingle();
    if (existingImage) {
      return existingImage.id;
    }
  } catch { /* non-fatal — proceed with insert */ }

  try {
    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('research-documents')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      console.warn('[MapImage] Storage upload failed:', uploadError.message);
      // Continue — create the DB record without storage_path
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('research-documents')
      .getPublicUrl(storagePath);

    const storageUrl = urlData?.publicUrl || null;

    // Create research_documents row
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
        storage_url: storageUrl,
        processing_status: 'extracted',
        extracted_text: additionalText,
        extracted_text_method: 'map_image_capture',
        recording_info: `Captured from USGS National Map — ${label}`,
      })
      .select('id')
      .single();

    if (docError || !doc) {
      console.warn('[MapImage] DB insert failed:', docError?.message);
      return null;
    }

    return doc.id;
  } catch (err) {
    console.error('[MapImage] Store error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Geocode an address, fetch USGS satellite + topo map images, and store them as
 * project documents in Supabase Storage.
 *
 * - Both images become `research_documents` rows ready for AI vision analysis.
 * - The satellite image uses NAIP 1-metre imagery (free, public USGS service).
 * - The topo image uses USGS 7.5-minute quads.
 * - Failures are non-fatal — partial results are returned.
 */
export async function captureLocationImages(
  projectId: string,
  address: string,
): Promise<LocationImageResult> {
  const result: LocationImageResult = {
    documentIds: [],
    geocoded: null,
    satelliteDocumentId: null,
    topoDocumentId: null,
    previewUrl: null,
  };

  // Step 1 — Geocode
  const geo = await geocodeAddress(address);
  if (!geo) {
    console.info('[MapImage] Geocoding failed for:', address);
    return result;
  }

  result.geocoded = geo;
  result.previewUrl = buildPreviewUrl(geo.lat, geo.lon);

  // Step 2 — Fetch both images in parallel
  const satUrl  = buildUSGSExportUrl(geo.lat, geo.lon, USGS_SATELLITE_SVC);
  const topoUrl = buildUSGSExportUrl(geo.lat, geo.lon, USGS_TOPO_SVC);

  const [satBuffer, topoBuffer] = await Promise.all([
    fetchMapImage(satUrl),
    fetchMapImage(topoUrl),
  ]);

  // Step 3 — Store satellite image
  if (satBuffer) {
    const satDesc = [
      `USGS NAIP Satellite Imagery captured for property at: ${address}`,
      `\nCoordinates: ${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`,
      `\nDisplay name: ${geo.display_name}`,
      `\nImage covers approximately ±${Math.round(PARCEL_RADIUS_DEG * METERS_PER_DEGREE)}m around the geocoded point.`,
      `\nSource URL: ${satUrl}`,
      `\nReview this image for: visible boundary features (fence lines, hedgerows, roads, driveways),`,
      ` structures (buildings, sheds, tanks, towers), natural features (creeks, ponds, vegetation),`,
      ` utility corridors (power lines, pipelines), and any other landmarks relevant to the survey.`,
    ].join('');

    const satDocId = await storeImageAsDocument(
      projectId,
      satBuffer,
      `Satellite Imagery — ${address}`,
      'aerial_photo',
      satUrl,
      satDesc,
    );

    if (satDocId) {
      result.satelliteDocumentId = satDocId;
      result.documentIds.push(satDocId);
    }
  }

  // Step 4 — Store topo map image
  if (topoBuffer) {
    const topoDesc = [
      `USGS Topographic Map captured for property at: ${address}`,
      `\nCoordinates: ${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`,
      `\nDisplay name: ${geo.display_name}`,
      `\nSource URL: ${topoUrl}`,
      `\nReview this image for: contour lines and elevation data, named roads and highways,`,
      ` named watercourses, section lines, township/range grid, benchmark locations,`,
      ` and any labeled landmarks or survey control points visible on the map.`,
    ].join('');

    const topoDocId = await storeImageAsDocument(
      projectId,
      topoBuffer,
      `Topo Map — ${address}`,
      'topo_map',
      topoUrl,
      topoDesc,
    );

    if (topoDocId) {
      result.topoDocumentId = topoDocId;
      result.documentIds.push(topoDocId);
    }
  }

  return result;
}
