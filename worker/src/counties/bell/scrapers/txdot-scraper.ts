/**
 * Bell County TxDOT Right-of-Way Scraper
 *
 * Queries TxDOT's ArcGIS REST API for right-of-way parcels and
 * roadway centerline data near the property. Determines ROW width,
 * CSJ numbers, and highway classification.
 *
 * Data source: TxDOT ArcGIS FeatureServer (public, no auth required)
 */

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints';
import type { ScreenshotCapture, TxDotRowInfo } from '../types/research-result';
import { computeConfidence, SOURCE_RELIABILITY } from '../types/confidence';

// ── Types ────────────────────────────────────────────────────────────

export interface TxDotSearchInput {
  lat: number;
  lon: number;
  /** Buffer radius in degrees (~1 degree = 111km) */
  bufferDeg?: number;
}

export interface TxDotScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Query TxDOT for ROW information near the property.
 */
export async function scrapeBellTxDot(
  input: TxDotSearchInput,
  onProgress: (p: TxDotScraperProgress) => void,
): Promise<{ result: TxDotRowInfo | null; screenshots: ScreenshotCapture[]; urlsVisited: string[] }> {
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];
  const buffer = input.bufferDeg ?? 0.003; // ~330m default

  const progress = (msg: string) => {
    onProgress({ phase: 'TxDOT', message: msg, timestamp: new Date().toISOString() });
  };

  progress(`Querying TxDOT ROW near ${input.lat.toFixed(5)}, ${input.lon.toFixed(5)}`);

  // ── Query ROW Parcels ──────────────────────────────────────────────
  const envelope = `${input.lon - buffer},${input.lat - buffer},${input.lon + buffer},${input.lat + buffer}`;

  const rowResult = await queryTxDotLayer(
    `${BELL_ENDPOINTS.txdot.rowParcels}/query`,
    envelope,
    urlsVisited,
  );

  // ── Query Roadway Centerlines ──────────────────────────────────────
  const roadResult = await queryTxDotLayer(
    `${BELL_ENDPOINTS.txdot.roadways}/query`,
    envelope,
    urlsVisited,
  );

  if (!rowResult && !roadResult) {
    progress('No TxDOT ROW data found near property');
    return { result: null, screenshots, urlsVisited };
  }

  // Extract ROW data
  const rowWidth = rowResult ? extractNumeric(rowResult, ['ROW_WIDTH', 'ROW_WID', 'WIDTH']) : null;
  const csjNumber = rowResult ? extractString(rowResult, ['CSJ', 'CSJ_NUM', 'CONTROL_SECT_JOB']) : null;
  const highwayName = roadResult ? extractString(roadResult, ['RTE_NM', 'ROUTE_NAME', 'HWY_NAME', 'RDBD_RTE_ID']) : null;
  const highwayClass = roadResult ? extractString(roadResult, ['FUNC_CLASS', 'HWY_CLASS', 'RDBD_TYPE']) : null;
  const district = roadResult ? extractString(roadResult, ['DIST_NM', 'DISTRICT', 'DIST_NAME']) : null;
  const acqDate = rowResult ? extractString(rowResult, ['ACQ_DATE', 'ACQUISITION_DATE']) : null;

  const hasData = rowWidth !== null || csjNumber !== null || highwayName !== null;

  if (hasData) {
    progress(`TxDOT ROW found: ${highwayName ?? 'unnamed'}, width=${rowWidth ?? 'unknown'}ft`);
  } else {
    progress('TxDOT query returned features but no ROW data extracted');
  }

  const result: TxDotRowInfo = {
    rowWidth,
    csjNumber,
    highwayName,
    highwayClass,
    district,
    acquisitionDate: acqDate,
    mapScreenshot: null, // Will be captured by screenshot-collector
    sourceUrl: `https://gis-txdot.opendata.arcgis.com/`,
    confidence: computeConfidence({
      sourceReliability: SOURCE_RELIABILITY['txdot'],
      dataUsefulness: rowWidth !== null ? 25 : 10,
      crossValidation: 5,
      sourceName: 'TxDOT',
      validatedBy: [],
      contradictedBy: [],
    }),
  };

  return { result, screenshots, urlsVisited };
}

// ── Internal: TxDOT ArcGIS Query ─────────────────────────────────────

async function queryTxDotLayer(
  url: string,
  envelope: string,
  urlsVisited: string[],
): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });

  const fullUrl = `${url}?${params.toString()}`;
  urlsVisited.push(fullUrl);

  try {
    const resp = await fetch(fullUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUTS.arcgisQuery),
    });

    if (!resp.ok) return null;
    const data = await resp.json() as { features?: Array<{ attributes: Record<string, unknown> }> };

    if (data.features && data.features.length > 0) {
      return data.features[0].attributes;
    }
  } catch {
    // TxDOT service may be temporarily unavailable
  }

  return null;
}

// ── Internal: Attribute Extraction ───────────────────────────────────

function extractString(attrs: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = attrs[k];
    if (v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== 'null') {
      return String(v).trim();
    }
  }
  return null;
}

function extractNumeric(attrs: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/,/g, ''));
      if (!isNaN(n)) return n;
    }
  }
  return null;
}
