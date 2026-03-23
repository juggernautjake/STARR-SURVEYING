// lib/research/map-image.service.ts — Location imagery capture
//
// Geocodes a property address and fetches satellite + topo map images from
// USGS National Map (public ArcGIS REST service — no API key required).
// Images are stored in Supabase Storage as project documents so the AI
// analysis phase can apply Claude Vision to extract visible boundary features.
//
// When multiple geocoding candidates are returned (common for ambiguous rural
// addresses), satellite images are captured for each candidate so the AI or
// user can identify the correct location.
//
// USGS National Map ArcGIS services used:
//   Satellite: basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export
//   Topo:      basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export

import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET, ensureStorageBucket } from '@/lib/supabase';
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

// Max geocoding candidates to capture satellite images for
const MAX_CANDIDATES = 3;

// Minimum distance (in degrees, ~1.1km) between candidates to be considered distinct
const MIN_CANDIDATE_DISTANCE_DEG = 0.01;

// Bell CAD FeatureServer for direct parcel geometry lookup
const BELL_CAD_FEATURE_SERVER =
  'https://services7.arcgis.com/EHW2HuuyZNO7DZct/arcgis/rest/services/BellCADWebService/FeatureServer';

/**
 * Fetch a parcel's centroid directly from Bell CAD by property ID.
 * Returns WGS84 coordinates or null if lookup fails.
 */
async function fetchParcelCentroidForCapture(propId: number): Promise<{ lat: number; lon: number } | null> {
  console.log(`[MapImage] fetchParcelCentroidForCapture: prop_id=${propId}`);
  try {
    const params = new URLSearchParams({
      where: `prop_id = ${propId}`,
      outFields: 'PROP_ID',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
    });
    const res = await fetch(`${BELL_CAD_FEATURE_SERVER}/0/query?${params}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) { console.warn(`[MapImage] Parcel centroid query failed: HTTP ${res.status} for prop_id=${propId}`); return null; }
    const data = await res.json();
    const rings: number[][][] | undefined = data?.features?.[0]?.geometry?.rings;
    if (!rings || rings.length === 0 || rings[0].length === 0) { console.warn(`[MapImage] No geometry returned for prop_id=${propId}`); return null; }
    const ring = rings[0];
    let sumLon = 0, sumLat = 0;
    const n = (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
      ? ring.length - 1 : ring.length;
    for (let i = 0; i < n; i++) { sumLon += ring[i][0]; sumLat += ring[i][1]; }
    const result = { lat: sumLat / n, lon: sumLon / n };
    console.log(`[MapImage] Parcel centroid for prop_id=${propId}: ${result.lat.toFixed(6)}, ${result.lon.toFixed(6)} (${n} vertices)`);
    return result;
  } catch (err) {
    console.error(`[MapImage] Parcel centroid error for prop_id=${propId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lon: number;
  display_name: string;
}

export interface GeoCandidate extends GeoPoint {
  /** Nominatim importance score (0–1, higher = more likely correct) */
  importance: number;
  /** OSM place type (e.g. "house", "road", "city") */
  type: string;
  /** Candidate index (1-based) */
  candidateIndex: number;
}

export interface LocationImageResult {
  /** IDs of created research_documents rows (ready for analysis) */
  documentIds: string[];
  /** Best geocoded coordinates if resolution succeeded */
  geocoded: GeoPoint | null;
  /** All geocoding candidates (multiple when location is ambiguous) */
  candidates: GeoCandidate[];
  /** Public URL to the satellite image stored in Supabase (or null on failure) */
  satelliteDocumentId: string | null;
  /** Public URL to the topo map image stored in Supabase (or null on failure) */
  topoDocumentId: string | null;
  /** Static map preview URL safe to embed in the UI without storing */
  previewUrl: string | null;
  /** Whether multiple candidate locations were captured */
  multipleLocations: boolean;
}

// ── Geocoding ────────────────────────────────────────────────────────────────

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  importance: number;
  type: string;
  class: string;
}

/**
 * Geocode an address string to WGS-84 coordinates using Nominatim.
 * Returns up to MAX_CANDIDATES results, filtered to only include
 * geographically distinct locations.
 */
export async function geocodeAddressCandidates(address: string): Promise<GeoCandidate[]> {
  const query = address.includes(',') ? address : `${address}, Texas, USA`;
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(MAX_CANDIDATES + 2), // fetch extra to filter duplicates
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

    if (!res.ok) return [];

    const data = await res.json() as NominatimResult[];
    if (!data || data.length === 0) return [];

    // Filter to geographically distinct candidates
    const candidates: GeoCandidate[] = [];
    for (const item of data) {
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);

      // Skip if too close to an already-selected candidate
      const tooClose = candidates.some(c =>
        Math.abs(c.lat - lat) < MIN_CANDIDATE_DISTANCE_DEG &&
        Math.abs(c.lon - lon) < MIN_CANDIDATE_DISTANCE_DEG
      );
      if (tooClose) continue;

      candidates.push({
        lat,
        lon,
        display_name: item.display_name,
        importance: item.importance ?? 0,
        type: item.type || item.class || 'unknown',
        candidateIndex: candidates.length + 1,
      });

      if (candidates.length >= MAX_CANDIDATES) break;
    }

    return candidates;
  } catch {
    return [];
  }
}

/**
 * Geocode an address string to WGS-84 coordinates using Nominatim.
 * Returns the single best match, or null if the address cannot be resolved.
 * (Backward-compatible wrapper around geocodeAddressCandidates.)
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const candidates = await geocodeAddressCandidates(address);
  if (candidates.length === 0) return null;
  return { lat: candidates[0].lat, lon: candidates[0].lon, display_name: candidates[0].display_name };
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
    await ensureStorageBucket();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(RESEARCH_DOCUMENTS_BUCKET)
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
      .from(RESEARCH_DOCUMENTS_BUCKET)
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
 * Fetch USGS satellite + topo map images for a property and store them as
 * project documents in Supabase Storage.
 *
 * When propId is provided, queries Bell CAD for the parcel centroid directly
 * (no geocoding needed). Otherwise falls back to Nominatim address geocoding.
 *
 * - All images become `research_documents` rows ready for AI vision analysis.
 * - The satellite images use NAIP 1-metre imagery (free, public USGS service).
 * - The topo image uses USGS 7.5-minute quads.
 * - Failures are non-fatal — partial results are returned.
 */
export async function captureLocationImages(
  projectId: string,
  address: string,
  propId?: string | number,
): Promise<LocationImageResult> {
  const result: LocationImageResult = {
    documentIds: [],
    geocoded: null,
    candidates: [],
    satelliteDocumentId: null,
    topoDocumentId: null,
    previewUrl: null,
    multipleLocations: false,
  };

  // Step 1 — Get coordinates: prefer propId lookup, fall back to geocoding
  let primaryLat: number;
  let primaryLon: number;
  let displayName: string = address;

  if (propId) {
    // Direct parcel centroid from Bell CAD — no geocoding ambiguity
    const centroid = await fetchParcelCentroidForCapture(Number(propId));
    if (centroid) {
      primaryLat = centroid.lat;
      primaryLon = centroid.lon;
      displayName = `Property ${propId} — ${address}`;
      console.info(`[MapImage] Using parcel centroid for prop_id=${propId}: ${primaryLat.toFixed(6)}, ${primaryLon.toFixed(6)}`);
    } else {
      // Fall back to geocoding if propId lookup fails
      console.warn(`[MapImage] Parcel centroid lookup failed for prop_id=${propId}, falling back to geocoding`);
      const candidates = await geocodeAddressCandidates(address);
      if (candidates.length === 0) {
        console.info('[MapImage] Geocoding also failed for:', address);
        return result;
      }
      primaryLat = candidates[0].lat;
      primaryLon = candidates[0].lon;
      displayName = candidates[0].display_name;
      result.candidates = candidates;
      result.multipleLocations = candidates.length > 1;
    }
  } else {
    const candidates = await geocodeAddressCandidates(address);
    if (candidates.length === 0) {
      console.info('[MapImage] Geocoding failed for:', address);
      return result;
    }
    primaryLat = candidates[0].lat;
    primaryLon = candidates[0].lon;
    displayName = candidates[0].display_name;
    result.candidates = candidates;
    result.multipleLocations = candidates.length > 1;
  }

  result.geocoded = { lat: primaryLat, lon: primaryLon, display_name: displayName };
  result.previewUrl = buildPreviewUrl(primaryLat, primaryLon);

  // Build candidate list for image capture. If propId was used (no candidates),
  // create a synthetic single-candidate from the parcel centroid.
  const captureLocations: GeoCandidate[] = result.candidates.length > 0
    ? result.candidates
    : [{
        lat: primaryLat, lon: primaryLon, display_name: displayName,
        importance: 1.0, type: 'parcel_centroid', candidateIndex: 1,
      }];

  if (captureLocations.length > 1) {
    console.info(
      `[MapImage] Found ${captureLocations.length} candidate locations for "${address}" — capturing satellite images for each`,
    );
  }

  // Step 2 — Fetch satellite images for ALL candidates in parallel
  const satFetches = captureLocations.map(c => ({
    candidate: c,
    url: buildUSGSExportUrl(c.lat, c.lon, USGS_SATELLITE_SVC),
  }));
  // Also fetch topo for the primary location
  const topoUrl = buildUSGSExportUrl(primaryLat, primaryLon, USGS_TOPO_SVC);

  // Brief pause to let map tile services render before capturing
  await new Promise(r => setTimeout(r, 1_500));

  const fetchPromises: Promise<Buffer | null>[] = [
    ...satFetches.map(f => fetchMapImage(f.url)),
    fetchMapImage(topoUrl),
  ];
  const fetchResults = await Promise.all(fetchPromises);

  const satBuffers = fetchResults.slice(0, captureLocations.length);
  const topoBuffer = fetchResults[captureLocations.length];

  // Step 3 — Store satellite images for each candidate
  for (let i = 0; i < captureLocations.length; i++) {
    const candidate = captureLocations[i];
    const buffer = satBuffers[i];
    if (!buffer) continue;

    const candidateLabel = captureLocations.length > 1
      ? ` (Candidate ${candidate.candidateIndex} of ${captureLocations.length})`
      : '';
    const confidenceNote = captureLocations.length > 1
      ? `\n\nIMPORTANT: This is candidate location ${candidate.candidateIndex} of ${captureLocations.length}.`
        + ` Nominatim importance score: ${candidate.importance.toFixed(3)} (type: ${candidate.type}).`
        + ` Compare all candidate satellite images to determine which shows the correct property.`
        + (i === 0 ? ' This is the highest-confidence candidate.' : '')
      : '';

    const satDesc = [
      `USGS NAIP Satellite Imagery captured for property at: ${address}${candidateLabel}`,
      `\nCoordinates: ${candidate.lat.toFixed(6)}, ${candidate.lon.toFixed(6)}`,
      `\nDisplay name: ${candidate.display_name}`,
      `\nImage covers approximately ±${Math.round(PARCEL_RADIUS_DEG * METERS_PER_DEGREE)}m around the geocoded point.`,
      `\nSource URL: ${satFetches[i].url}`,
      `\nReview this image for: visible boundary features (fence lines, hedgerows, roads, driveways),`,
      ` structures (buildings, sheds, tanks, towers), natural features (creeks, ponds, vegetation),`,
      ` utility corridors (power lines, pipelines), and any other landmarks relevant to the survey.`,
      confidenceNote,
    ].join('');

    const label = `Satellite Imagery — ${address}${candidateLabel}`;
    const satDocId = await storeImageAsDocument(
      projectId,
      buffer,
      label,
      'aerial_photo',
      satFetches[i].url,
      satDesc,
    );

    if (satDocId) {
      result.documentIds.push(satDocId);
      // First candidate's satellite is the primary
      if (i === 0) {
        result.satelliteDocumentId = satDocId;
      }
    }
  }

  // Step 4 — Store topo map image (best candidate only)
  if (topoBuffer) {
    const topoDesc = [
      `USGS Topographic Map captured for property at: ${address}`,
      `\nCoordinates: ${primaryLat.toFixed(6)}, ${primaryLon.toFixed(6)}`,
      `\nDisplay name: ${displayName}`,
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

  if (result.multipleLocations) {
    console.info(
      `[MapImage] Stored ${result.documentIds.length} images for ${captureLocations.length} candidate locations`,
    );
  }

  return result;
}
