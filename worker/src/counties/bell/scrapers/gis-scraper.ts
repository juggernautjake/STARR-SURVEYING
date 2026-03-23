/**
 * Bell County GIS Scraper
 *
 * Queries Bell CAD's ArcGIS FeatureServer for parcel data using spatial
 * queries, property ID lookups, and owner name searches. This is often
 * more reliable than the eSearch web UI for rural properties.
 *
 * Data source: ArcGIS Online hosted FeatureServer
 * No browser/Playwright needed — pure HTTP REST API.
 */

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';
import { GIS_FIELD_MAP, composeSitusAddress, getField, getNumericField } from '../config/field-maps.js';
import type { ScreenshotCapture } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface GisSearchResult {
  propertyId: string | null;
  ownerName: string | null;
  legalDescription: string | null;
  acreage: number | null;
  situsAddress: string | null;
  mapId: string | null;
  geoId: string | null;
  abstractSubdiv: string | null;
  /** Deed references found in GIS attributes */
  instrumentNumbers: string[];
  deedHistory: GisDeedEntry[];
  /** Parcel boundary polygon as [lon, lat] rings */
  parcelBoundary: number[][][] | null;
  /** Raw GIS attributes for the primary parcel */
  rawAttributes: Record<string, unknown>;
  /** All features found (for multi-parcel properties) */
  allFeatures: GisFeatureSummary[];
  screenshots: ScreenshotCapture[];
  urlsVisited: string[];
}

export interface GisDeedEntry {
  instrumentNumber?: string;
  volume?: string;
  page?: string;
  deedDate?: string;
}

export interface GisFeatureSummary {
  propertyId: string | null;
  ownerName: string | null;
  acreage: number | null;
  instrumentNumber: string | null;
  situsAddress: string | null;
  legalDescription: string | null;
}

export interface GisSearchInput {
  propertyId?: string;
  ownerName?: string;
  lat?: number | null;
  lon?: number | null;
  address?: string;
}

export interface GisScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Search Bell County GIS for parcel data.
 * Tries: property ID → spatial query → owner name.
 */
export async function scrapeBellGis(
  input: GisSearchInput,
  onProgress: (p: GisScraperProgress) => void,
): Promise<GisSearchResult | null> {
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];
  const layerUrl = BELL_ENDPOINTS.gis.parcelLayer;
  const queryUrl = `${layerUrl}${BELL_ENDPOINTS.gis.queryPath}`;

  const progress = (msg: string) => {
    onProgress({ phase: 'GIS', message: msg, timestamp: new Date().toISOString() });
  };

  // ── Approach 1: Property ID Lookup ─────────────────────────────────
  if (input.propertyId) {
    progress(`Querying GIS by property ID: ${input.propertyId}`);

    for (const field of GIS_FIELD_MAP.propertyId) {
      const result = await queryLayer(queryUrl, {
        where: `${field}='${input.propertyId}'`,
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
      }, urlsVisited);

      if (result && result.features.length > 0) {
        progress(`Found ${result.features.length} parcel(s) by property ID`);
        return buildResult(result.features, screenshots, urlsVisited);
      }
    }
  }

  // ── Approach 1B: Situs Address Query ─────────────────────────────
  // Query GIS directly by situs_num + situs_street fields. This is the most
  // reliable way to find the exact lot when the CAD eSearch fails, because
  // it matches the property's indexed address components directly.
  if (input.address) {
    const addrClean = input.address.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    const addrParts = addrClean.split(' ');
    let situsNum: string | null = null;
    let streetStartIdx = 0;

    if (/^\d+$/.test(addrParts[0])) {
      situsNum = addrParts[0];
      streetStartIdx = 1;
    }

    // Skip directional prefix for the street query
    const dirs = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST'];
    if (streetStartIdx < addrParts.length && dirs.includes(addrParts[streetStartIdx])) {
      streetStartIdx++;
    }

    // Strip city/state/zip from street name
    const cities = ['BELTON', 'KILLEEN', 'TEMPLE', 'SALADO', 'NOLANVILLE', 'TROY', 'HOLLAND', 'ROGERS', 'MOODY', 'HARKER', 'HEIGHTS', 'COPPERAS', 'COVE'];
    const streetParts = addrParts.slice(streetStartIdx).filter(w =>
      w.length > 1 && !/^(TX|TEXAS|\d{5}(-\d{4})?)$/.test(w) && !cities.includes(w)
    );
    const streetName = streetParts.join(' ');

    if (situsNum && streetName) {
      // Try FM road variants for street name matching
      const fmMatch = streetName.match(/^(FM|CR|SH|RR|US|IH|HWY)\s*(\d+)$/);
      const streetVariants = [streetName];
      if (fmMatch) {
        const pfx = fmMatch[1];
        const num = fmMatch[2];
        streetVariants.push(`${pfx} ${num}`, `${pfx}${num}`, num, `FARM TO MARKET ${num}`, `FM RD ${num}`);
      }
      // Deduplicate
      const uniqueVariants = [...new Set(streetVariants)];

      for (const street of uniqueVariants) {
        progress(`Querying GIS by situs address: ${situsNum} ${street}`);
        // Use LIKE for street to handle suffixes and partial matches
        const where = `situs_num='${situsNum}' AND UPPER(situs_street) LIKE '%${street.replace(/'/g, "''")}%'`;
        const result = await queryLayer(queryUrl, {
          where,
          outFields: '*',
          returnGeometry: 'true',
          outSR: '4326',
        }, urlsVisited);

        if (result && result.features.length > 0) {
          progress(`Found ${result.features.length} parcel(s) by situs address query`);
          return buildResult(result.features, screenshots, urlsVisited);
        }
      }
    }
  }

  // ── Approach 2: Spatial Query (lat/lon) ────────────────────────────
  if (input.lat && input.lon) {
    progress(`Querying GIS by coordinates: ${input.lat.toFixed(5)}, ${input.lon.toFixed(5)}`);

    const delta = 0.0005; // ~55m envelope
    const envelope = `${input.lon - delta},${input.lat - delta},${input.lon + delta},${input.lat + delta}`;

    const result = await queryLayer(queryUrl, {
      geometry: envelope,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outSR: '4326',
      outFields: '*',
      returnGeometry: 'true',
    }, urlsVisited);

    if (result && result.features.length > 0) {
      progress(`Found ${result.features.length} parcel(s) by spatial query`);
      const sorted = rankFeaturesByAddress(result.features, input.address, progress, { lat: input.lat, lon: input.lon });
      return buildResult(sorted, screenshots, urlsVisited);
    }

    // Widen the envelope and retry
    const deltaWide = 0.002; // ~220m
    progress('Widening spatial search envelope...');
    const wideEnvelope = `${input.lon - deltaWide},${input.lat - deltaWide},${input.lon + deltaWide},${input.lat + deltaWide}`;

    const wideResult = await queryLayer(queryUrl, {
      geometry: wideEnvelope,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outSR: '4326',
      outFields: '*',
      returnGeometry: 'true',
    }, urlsVisited);

    if (wideResult && wideResult.features.length > 0) {
      progress(`Found ${wideResult.features.length} parcel(s) with widened search`);
      const sorted = rankFeaturesByAddress(wideResult.features, input.address, progress, { lat: input.lat, lon: input.lon });
      return buildResult(sorted, screenshots, urlsVisited);
    }
  }

  // ── Approach 3: Owner Name Search ──────────────────────────────────
  if (input.ownerName) {
    progress(`Querying GIS by owner name: ${input.ownerName}`);
    const safeName = input.ownerName.replace(/'/g, "''").toUpperCase();

    for (const field of GIS_FIELD_MAP.ownerName) {
      const result = await queryLayer(queryUrl, {
        where: `UPPER(${field}) LIKE '${safeName}%'`,
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
      }, urlsVisited);

      if (result && result.features.length > 0 && result.features.length <= 50) {
        progress(`Found ${result.features.length} parcel(s) by owner name`);
        return buildResult(result.features, screenshots, urlsVisited);
      }
    }
  }

  progress('GIS search exhausted — no parcels found');
  return null;
}

/**
 * Find all adjacent parcels to a given parcel boundary.
 * Uses a buffered spatial query around the parcel geometry.
 */
export async function findAdjacentParcels(
  parcelBoundary: number[][][],
  onProgress: (p: GisScraperProgress) => void,
): Promise<GisSearchResult[]> {
  const queryUrl = `${BELL_ENDPOINTS.gis.parcelLayer}${BELL_ENDPOINTS.gis.queryPath}`;
  const urlsVisited: string[] = [];

  // Compute bounding box of the parcel with buffer
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of parcelBoundary) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  // Buffer by ~100m
  const buffer = 0.001;
  const envelope = `${minLon - buffer},${minLat - buffer},${maxLon + buffer},${maxLat + buffer}`;

  onProgress({ phase: 'GIS', message: 'Searching for adjacent parcels...', timestamp: new Date().toISOString() });

  const result = await queryLayer(queryUrl, {
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outSR: '4326',
    outFields: '*',
    returnGeometry: 'true',
  }, urlsVisited);

  if (!result || result.features.length === 0) return [];

  onProgress({ phase: 'GIS', message: `Found ${result.features.length} parcels in vicinity`, timestamp: new Date().toISOString() });

  // Group by property ID, each becomes its own result
  const grouped = new Map<string, typeof result.features>();
  for (const feat of result.features) {
    const pid = getField(feat.attributes, [...GIS_FIELD_MAP.propertyId]) ?? 'unknown';
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(feat);
  }

  const adjacentResults: GisSearchResult[] = [];
  for (const [, features] of grouped) {
    adjacentResults.push(buildResult(features, [], urlsVisited));
  }

  return adjacentResults;
}

// ── Internal: ArcGIS REST Query ──────────────────────────────────────

interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: { rings?: number[][][] };
}

interface ArcGisQueryResult {
  features: ArcGisFeature[];
}

async function queryLayer(
  url: string,
  params: Record<string, string>,
  urlsVisited: string[],
): Promise<ArcGisQueryResult | null> {
  const qs = new URLSearchParams({ ...params, f: 'json' }).toString();
  const fullUrl = `${url}?${qs}`;
  urlsVisited.push(fullUrl);

  try {
    const resp = await fetch(fullUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUTS.arcgisQuery),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as ArcGisQueryResult;
    if (!json.features) return null;
    return json;
  } catch {
    return null;
  }
}

// ── Internal: Rank Features by Address Match ─────────────────────────

/**
 * Ray-casting point-in-polygon test.
 * Returns true if point (px, py) is inside the polygon defined by ring
 * (array of [x, y] coordinate pairs).
 */
function pointInPolygon(px: number, py: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Compute the centroid of a polygon ring.
 * Returns [lon, lat] — simple average of vertices.
 */
function polygonCentroid(ring: number[][]): [number, number] {
  let sumX = 0, sumY = 0;
  // Skip last point if it duplicates the first (closed ring)
  const n = (ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1])
    ? ring.length - 1
    : ring.length;
  for (let i = 0; i < n; i++) {
    sumX += ring[i][0];
    sumY += ring[i][1];
  }
  return [sumX / n, sumY / n];
}

/**
 * Squared distance between two [lon, lat] points (for comparison only).
 */
function distSq(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * When a spatial query returns multiple parcels, rank them by how well
 * their situs address matches the input address AND how close they are
 * to the geocoded search point.
 *
 * Scoring priority (highest to lowest):
 *   1. Point-in-polygon: if the geocoded lat/lon falls INSIDE a parcel's
 *      polygon, that parcel gets +50 (decisive win over address-only ties)
 *   2. Street number match: +10 exact, +5 substring
 *   3. Street name words: +2 each
 *   4. Direction match: +1
 *   5. Centroid proximity: tie-breaker — closer parcel wins
 */
function rankFeaturesByAddress(
  features: ArcGisFeature[],
  inputAddress: string | undefined,
  progress: (msg: string) => void,
  searchPoint?: { lat: number; lon: number },
): ArcGisFeature[] {
  if (features.length <= 1) return features;

  // Parse address components
  let inputNum: string | null = null;
  let inputDir: string | null = null;
  let streetWords: string[] = [];

  if (inputAddress) {
    const upper = inputAddress.toUpperCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = upper.split(' ');
    let idx = 0;
    if (/^\d+$/.test(parts[0])) { inputNum = parts[0]; idx = 1; }
    const dirs = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
    if (idx < parts.length && dirs.includes(parts[idx])) { inputDir = parts[idx]; idx++; }
    streetWords = parts.slice(idx).filter(w =>
      w.length > 1 && !/^(TX|TEXAS|\d{5})$/.test(w) &&
      !/^(BELTON|KILLEEN|TEMPLE|SALADO|NOLANVILLE|TROY|HOLLAND|ROGERS|MOODY)$/.test(w)
    );
  }

  const scored = features.map((feat, origIdx) => {
    const situs = composeSitusAddress(feat.attributes)?.toUpperCase() ?? '';
    const pid = getField(feat.attributes, [...GIS_FIELD_MAP.propertyId]) ?? '?';
    let score = 0;

    // ── Point-in-polygon: does the geocoded point fall inside this parcel?
    // This is the STRONGEST signal — if the address geocodes to a point
    // inside parcel 524312 but not 524311, 524312 must be the correct one.
    let containsPoint = false;
    if (searchPoint && feat.geometry?.rings) {
      for (const ring of feat.geometry.rings) {
        if (pointInPolygon(searchPoint.lon, searchPoint.lat, ring)) {
          containsPoint = true;
          score += 50;
          break;
        }
      }
    }

    // ── Address scoring (same as before)
    if (inputNum) {
      const situsNum = getField(feat.attributes, [...GIS_FIELD_MAP.situsNumber]);
      if (situsNum === inputNum) {
        score += 10;
      } else if (situs.includes(inputNum)) {
        score += 5;
      }
    }
    for (const word of streetWords) {
      if (situs.includes(word)) score += 2;
    }
    if (inputDir) {
      const situsPfx = getField(feat.attributes, [...GIS_FIELD_MAP.situsStreetPrefx])?.toUpperCase();
      if (situsPfx === inputDir || situs.includes(inputDir)) score += 1;
    }

    // Compute centroid distance for tie-breaking (lower = better)
    let centroidDist = Infinity;
    if (searchPoint && feat.geometry?.rings && feat.geometry.rings.length > 0) {
      const centroid = polygonCentroid(feat.geometry.rings[0]);
      centroidDist = distSq([searchPoint.lon, searchPoint.lat], centroid);
    }

    return { feat, score, origIdx, pid, containsPoint, centroidDist, situs };
  });

  // Sort: score descending → centroid distance ascending → original order
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.centroidDist !== b.centroidDist) return a.centroidDist - b.centroidDist;
    return a.origIdx - b.origIdx;
  });

  // Log ranking details for debugging
  if (scored.length > 1) {
    const best = scored[0];
    const runners = scored.slice(1);
    const tiedOnAddress = runners.filter(r => r.score === best.score && !best.containsPoint);

    if (best.containsPoint) {
      progress(`Parcel selection: ${best.pid} contains geocoded point — selected with confidence (score: ${best.score})`);
    } else if (tiedOnAddress.length > 0) {
      progress(`Parcel selection: ${best.pid} selected by centroid proximity (score: ${best.score}, same as ${tiedOnAddress.map(t => t.pid).join(', ')})`);
      progress(`  Note: multiple parcels share address — using closest centroid to geocoded point as tie-breaker`);
    } else {
      progress(`Address match: selected parcel ${best.pid} (situs: "${best.situs}", score: ${best.score}) over ${runners.length} other parcel(s)`);
    }

    // Log all candidates for transparency
    for (const s of scored) {
      const flags = [
        s.containsPoint ? 'CONTAINS_POINT' : '',
        `dist=${s.centroidDist < Infinity ? s.centroidDist.toFixed(8) : '?'}`,
      ].filter(Boolean).join(', ');
      progress(`  Parcel ${s.pid}: score=${s.score} [${flags}] situs="${s.situs}"`);
    }
  }

  return scored.map(s => s.feat);
}

// ── Internal: Build Result from Features ─────────────────────────────

function buildResult(
  features: ArcGisFeature[],
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): GisSearchResult {
  const primary = features[0];
  const attrs = primary.attributes;

  // Only collect instrument numbers from the PRIMARY parcel (features[0]).
  // Collecting from all spatial query results causes unrelated instruments
  // from neighboring parcels to pollute the research pipeline.
  const allInstrumentNumbers = new Set<string>();
  const allDeedHistory: GisDeedEntry[] = [];
  const allFeatures: GisFeatureSummary[] = [];

  // Primary parcel instruments
  const primaryInstr = getField(attrs, [...GIS_FIELD_MAP.instrumentNumber]);
  const primaryVol = getField(attrs, [...GIS_FIELD_MAP.volume]);
  const primaryPage = getField(attrs, [...GIS_FIELD_MAP.page]);
  const primaryDeedDate = getField(attrs, [...GIS_FIELD_MAP.deedDate]);
  if (primaryInstr) allInstrumentNumbers.add(primaryInstr);
  if (primaryInstr || primaryVol || primaryDeedDate) {
    allDeedHistory.push({ instrumentNumber: primaryInstr ?? undefined, volume: primaryVol ?? undefined, page: primaryPage ?? undefined, deedDate: primaryDeedDate ?? undefined });
  }

  // Build feature summaries from all features (for context), but DON'T
  // add their instruments to the lookup set
  for (const feat of features) {
    const a = feat.attributes;
    const featInstr = getField(a, [...GIS_FIELD_MAP.instrumentNumber]);

    const featLegal1 = getField(a, ['legal_desc']) ?? '';
    const featLegal2 = getField(a, ['legal_desc2']) ?? '';
    const featLegal = [featLegal1, featLegal2].filter(Boolean).join(' ') || null;

    allFeatures.push({
      propertyId: getField(a, [...GIS_FIELD_MAP.propertyId]),
      ownerName: getField(a, [...GIS_FIELD_MAP.ownerName]),
      acreage: getNumericField(a, [...GIS_FIELD_MAP.acreage]),
      instrumentNumber: featInstr,
      situsAddress: composeSitusAddress(a),
      legalDescription: featLegal,
    });
  }

  // Concatenate legal_desc and legal_desc2
  const legal1 = getField(attrs, ['legal_desc']) ?? '';
  const legal2 = getField(attrs, ['legal_desc2']) ?? '';
  const legalDesc = [legal1, legal2].filter(Boolean).join(' ') || null;

  return {
    propertyId: getField(attrs, [...GIS_FIELD_MAP.propertyId]),
    ownerName: getField(attrs, [...GIS_FIELD_MAP.ownerName]),
    legalDescription: legalDesc,
    acreage: getNumericField(attrs, [...GIS_FIELD_MAP.acreage]),
    situsAddress: composeSitusAddress(attrs),
    mapId: getField(attrs, [...GIS_FIELD_MAP.mapId]),
    geoId: getField(attrs, [...GIS_FIELD_MAP.geoId]),
    abstractSubdiv: getField(attrs, [...GIS_FIELD_MAP.abstractSubdiv]),
    instrumentNumbers: [...allInstrumentNumbers],
    deedHistory: allDeedHistory,
    parcelBoundary: primary.geometry?.rings ?? null,
    rawAttributes: attrs,
    allFeatures,
    screenshots,
    urlsVisited,
  };
}

// ── Sibling Lot Discovery ────────────────────────────────────────────

/**
 * After finding the target parcel, discover all sibling lots in the same
 * subdivision. This gives the address-lot resolver a full set of candidates
 * to compare situs addresses against, which is critical for identifying
 * which lot number corresponds to a specific street address.
 *
 * Uses a spatial query with a buffer around the target parcel to find
 * neighboring parcels, then filters to only those in the same subdivision
 * (by checking abs_subdv_cd or legal description similarity).
 */
export async function discoverSiblingLots(
  parcelBoundary: number[][][] | null,
  targetPropertyId: string | null,
  targetLegalDesc: string | null,
  onProgress: (p: GisScraperProgress) => void,
): Promise<GisFeatureSummary[]> {
  if (!parcelBoundary || parcelBoundary.length === 0) return [];

  const progress = (msg: string) => {
    onProgress({ phase: 'GIS', message: msg, timestamp: new Date().toISOString() });
  };

  const queryUrl = `${BELL_ENDPOINTS.gis.parcelLayer}${BELL_ENDPOINTS.gis.queryPath}`;
  const urlsVisited: string[] = [];

  // Compute bounding box of target parcel with generous buffer (~200m)
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of parcelBoundary) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  const buffer = 0.002; // ~220m buffer to capture entire subdivision
  const envelope = `${minLon - buffer},${minLat - buffer},${maxLon + buffer},${maxLat + buffer}`;

  progress('Discovering sibling lots in subdivision area...');

  const result = await queryLayer(queryUrl, {
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'prop_id_text,file_as_name,legal_acreage,legal_desc,legal_desc2,situs_num,situs_street_prefx,situs_street,situs_street_sufix,situs_city,situs_state,situs_zip,abs_subdv_cd',
    returnGeometry: 'false',
    f: 'json',
  }, urlsVisited);

  if (!result || result.features.length === 0) {
    progress('No sibling lots found in spatial query');
    return [];
  }

  // Extract subdivision code from target's legal description to filter siblings
  const targetSubdivCode = targetLegalDesc
    ? extractSubdivCodeFromLegal(targetLegalDesc)
    : null;

  const siblings: GisFeatureSummary[] = [];

  for (const feat of result.features) {
    const a = feat.attributes;
    const pid = getField(a, [...GIS_FIELD_MAP.propertyId]);

    // Skip the target parcel itself
    if (pid && pid === targetPropertyId) continue;

    const legal1 = getField(a, ['legal_desc']) ?? '';
    const legal2 = getField(a, ['legal_desc2']) ?? '';
    const legal = [legal1, legal2].filter(Boolean).join(' ') || null;

    // Filter to same subdivision: check abs_subdv_cd or legal description prefix
    if (targetSubdivCode) {
      const featSubdivCode = getField(a, ['abs_subdv_cd']);
      const featLegalSubdiv = legal ? extractSubdivCodeFromLegal(legal) : null;

      if (featSubdivCode !== targetSubdivCode && featLegalSubdiv !== targetSubdivCode) {
        continue; // Different subdivision — skip
      }
    }

    // Build situs address from components
    const situsNum = getField(a, ['situs_num']);
    const situsPrefix = getField(a, ['situs_street_prefx']);
    const situsStreet = getField(a, ['situs_street']);
    const situsSuffix = getField(a, ['situs_street_sufix']);
    const situsCity = getField(a, ['situs_city']);
    const situsState = getField(a, ['situs_state']);
    const situsZip = getField(a, ['situs_zip']);
    const situs = [situsNum, situsPrefix, situsStreet, situsSuffix]
      .filter(Boolean).join(' ')
      + (situsCity ? `, ${situsCity}` : '')
      + (situsState ? `, ${situsState}` : '')
      + (situsZip ? ` ${situsZip}` : '');

    siblings.push({
      propertyId: pid,
      ownerName: getField(a, [...GIS_FIELD_MAP.ownerName]),
      acreage: getNumericField(a, [...GIS_FIELD_MAP.acreage]),
      instrumentNumber: getField(a, [...GIS_FIELD_MAP.instrumentNumber]),
      situsAddress: situs.trim() || null,
      legalDescription: legal,
    });
  }

  progress(`Found ${siblings.length} sibling lot(s) in subdivision`);
  return siblings;
}

/** Extract subdivision identifier from legal description text */
function extractSubdivCodeFromLegal(legal: string): string | null {
  const upper = legal.toUpperCase();
  // Match "BLOCK X, LOT Y, SUBDIVISION_NAME" pattern
  const m = upper.match(/\b(?:BLOCK\s+\w+\s*,?\s*LOT\s+\w+\s*,?\s*)(.+?)(?:\s+PHASE|\s+SECTION|\s*$)/);
  if (m) return m[1].replace(/[,\s]+$/, '').trim();
  // Match just the subdivision/addition name
  const m2 = upper.match(/([A-Z][A-Z\s&.']+?)\s+(?:ADDITION|SUBDIVISION|ESTATES|SUBD?\.?|ADD\.?)\b/);
  if (m2) return m2[1].trim();
  return null;
}
