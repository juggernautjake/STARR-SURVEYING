// lib/research/boundary-fetch.service.ts — Boundary calls retrieval from county CAD records
// Fetches property data from Texas county appraisal district databases (TrueAutomation and others),
// extracts the legal description, and uses AI to parse the metes-and-bounds boundary calls.

import { callAI } from './ai-client';
import type {
  BoundaryFetchRequest,
  BoundaryFetchResult,
  ParsedBoundaryCall,
  PropertyDetails,
} from '@/types/research';

// ── TrueAutomation CAD Config ─────────────────────────────────────────────────

interface TrueAutoConfig {
  cid: number;
  name: string;
}

/** Texas county → TrueAutomation client IDs */
const TRUEAUTO_BY_COUNTY: Record<string, TrueAutoConfig> = {
  bell:       { cid: 14, name: 'Bell County Appraisal District' },
  coryell:    { cid: 18, name: 'Coryell County Appraisal District' },
  mclennan:   { cid: 25, name: 'McLennan County Appraisal District' },
  falls:      { cid: 20, name: 'Falls County Appraisal District' },
  milam:      { cid: 26, name: 'Milam County Appraisal District' },
  lampasas:   { cid: 23, name: 'Lampasas County Appraisal District' },
  travis:     { cid: 13, name: 'Travis County Appraisal District' },
  bastrop:    { cid: 2,  name: 'Bastrop County Appraisal District' },
  robertson:  { cid: 29, name: 'Robertson County Appraisal District' },
  lee:        { cid: 24, name: 'Lee County Appraisal District' },
  burnet:     { cid: 8,  name: 'Burnet County Appraisal District' },
  san_saba:   { cid: 30, name: 'San Saba County Appraisal District' },
  caldwell:   { cid: 9,  name: 'Caldwell County Appraisal District' },
  guadalupe:  { cid: 94, name: 'Guadalupe County Appraisal District' },
  comal:      { cid: 46, name: 'Comal County Appraisal District' },
};

const TRUEAUTO_BASE = 'https://propaccess.trueautomation.com/clientdb/api/v1/app';
const FETCH_TIMEOUT_MS = 30_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCountyKey(county?: string | null): string {
  if (!county) return '';
  return county
    .toLowerCase()
    .replace(/\s+county$/i, '')
    .replace(/\s+/g, '_')
    .trim();
}

function extractCountyFromAddress(address?: string | null): string {
  if (!address) return '';
  const match = address.match(/,\s*([A-Za-z\s]+?)\s*County/i);
  if (match) return match[1].trim().toLowerCase();
  // Common city → county inferences
  const lower = address.toLowerCase();
  if (/\b(temple|belton|killeen|harker heights|nolanville)\b/.test(lower)) return 'bell';
  if (/\b(waco|hewitt|mcgregor|woodway)\b/.test(lower)) return 'mclennan';
  if (/\b(gatesville|copperas cove)\b/.test(lower)) return 'coryell';
  if (/\b(cameron|rockdale)\b/.test(lower)) return 'milam';
  if (/\b(marlin)\b/.test(lower)) return 'falls';
  if (/\b(lampasas)\b/.test(lower)) return 'lampasas';
  if (/\b(austin)\b/.test(lower)) return 'travis';
  return '';
}

function makeFetchHeaders(): Record<string, string> {
  return {
    'Accept': 'application/json, text/html, */*',
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

// ── TrueAutomation API ─────────────────────────────────────────────────────────

interface TrueAutoSearchHit {
  prop_id?: string | number;
  situs_num?: string;
  situs_street?: string;
  situs_city?: string;
  situs_state?: string;
  owner_name?: string;
  legal_desc?: string;
  geo_id?: string;
}

interface TrueAutoPropDetail {
  prop_id?: string | number;
  owner_name?: string;
  mailing_addr?: string;
  mailing_city?: string;
  mailing_state?: string;
  mailing_zip?: string;
  situs_num?: string;
  situs_street?: string;
  situs_city?: string;
  situs_state?: string;
  legal_desc?: string;
  land_acres?: number | string;
  market_value?: number | string;
  land_value?: number | string;
  improvement_value?: number | string;
  deed_vol?: string;
  deed_pg?: string;
  geo_id?: string;
  land_use?: string;
  abs_name?: string;
  subdv_name?: string;
  blk?: string;
  lot?: string;
  [key: string]: unknown;
}

/** Search for a property by address using the TrueAutomation address-search endpoint */
async function trueAutoSearchByAddress(
  cid: number,
  address: string,
  steps: string[],
): Promise<string | null> {
  const url = `${TRUEAUTO_BASE}/search/address?cid=${cid}&q=${encodeURIComponent(address)}`;
  steps.push(`Searching TrueAutomation (cid=${cid}) by address: ${address}`);

  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) {
      steps.push(`Address search returned HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as { data?: TrueAutoSearchHit[] } | TrueAutoSearchHit[];
    const hits: TrueAutoSearchHit[] = Array.isArray(data) ? data : (data?.data ?? []);

    if (hits.length === 0) {
      steps.push('No properties found for this address.');
      return null;
    }

    const propId = String(hits[0].prop_id ?? '');
    steps.push(`Found property ID: ${propId} (${hits[0].situs_num ?? ''} ${hits[0].situs_street ?? ''})`);
    return propId || null;
  } catch (err) {
    steps.push(`Address search error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Fetch full property details from TrueAutomation by property ID */
async function trueAutoFetchDetail(
  cid: number,
  propId: string,
  steps: string[],
): Promise<TrueAutoPropDetail | null> {
  const url = `${TRUEAUTO_BASE}/properties?cid=${cid}&prop_id=${encodeURIComponent(propId)}`;
  steps.push(`Fetching property detail for ID ${propId} from TrueAutomation (cid=${cid})`);

  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) {
      steps.push(`Property detail returned HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as { data?: TrueAutoPropDetail } | TrueAutoPropDetail;
    const detail: TrueAutoPropDetail = ('data' in data && data.data) ? data.data : (data as TrueAutoPropDetail);
    steps.push(`Retrieved property data for ${detail.owner_name ?? 'unknown owner'}`);
    return detail;
  } catch (err) {
    steps.push(`Property detail error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function mapTrueAutoToPropertyDetails(
  detail: TrueAutoPropDetail,
  cadName: string,
  cid: number,
  propId: string,
): PropertyDetails {
  const situsAddr = [detail.situs_num, detail.situs_street, detail.situs_city, detail.situs_state]
    .filter(Boolean).join(' ').trim();
  const mailingAddr = [detail.mailing_addr, detail.mailing_city, detail.mailing_state, detail.mailing_zip]
    .filter(Boolean).join(' ').trim();

  const acreage = detail.land_acres !== undefined
    ? parseFloat(String(detail.land_acres))
    : undefined;
  const marketValue = detail.market_value !== undefined
    ? parseFloat(String(detail.market_value))
    : undefined;
  const landValue = detail.land_value !== undefined
    ? parseFloat(String(detail.land_value))
    : undefined;
  const improvValue = detail.improvement_value !== undefined
    ? parseFloat(String(detail.improvement_value))
    : undefined;

  const deedRef = [detail.deed_vol && `Vol. ${detail.deed_vol}`, detail.deed_pg && `Pg. ${detail.deed_pg}`]
    .filter(Boolean).join(', ');

  const lotBlock = [detail.blk && `Block ${detail.blk}`, detail.lot && `Lot ${detail.lot}`]
    .filter(Boolean).join(', ');

  return {
    owner_name: detail.owner_name || undefined,
    mailing_address: mailingAddr || undefined,
    property_address: situsAddr || undefined,
    legal_description: detail.legal_desc || undefined,
    acreage: !isNaN(acreage as number) ? acreage : undefined,
    land_value: !isNaN(landValue as number) ? landValue : undefined,
    improvement_value: !isNaN(improvValue as number) ? improvValue : undefined,
    total_value: !isNaN(marketValue as number) ? marketValue : undefined,
    land_use: detail.land_use ? String(detail.land_use) : undefined,
    abstract: detail.abs_name ? String(detail.abs_name) : undefined,
    subdivision: detail.subdv_name ? String(detail.subdv_name) : undefined,
    lot_block: lotBlock || undefined,
    deed_reference: deedRef || undefined,
    property_id: propId,
  };
  void cadName; // used by caller for source_name
}

// ── AI Boundary Call Extraction ───────────────────────────────────────────────

interface AIBoundaryResponse {
  point_of_beginning?: string;
  calls?: Array<{
    sequence: number;
    type?: string;
    bearing?: string | null;
    distance?: number | null;
    distance_unit?: string;
    distance_feet?: number | null;
    radius?: number | null;
    arc_length?: number | null;
    delta_angle?: string | null;
    chord_bearing?: string | null;
    chord_distance?: number | null;
    curve_direction?: string | null;
    raw_text?: string;
  }>;
  stated_acreage?: number | null;
  call_count?: number;
  notes?: string;
}

async function extractBoundaryCallsWithAI(
  legalDescription: string,
  steps: string[],
): Promise<{ calls: ParsedBoundaryCall[]; pob: string | undefined; acreage: number | undefined }> {
  steps.push('Sending legal description to AI for boundary call extraction…');

  try {
    const result = await callAI({
      promptKey: 'BOUNDARY_EXTRACTOR',
      userContent: `Extract all boundary calls from the following legal description:\n\n${legalDescription}`,
      maxTokens: 4096,
      maxRetries: 2,
      timeoutMs: 90_000,
    });

    const data = result.response as AIBoundaryResponse;
    if (!Array.isArray(data?.calls)) {
      steps.push('AI returned no boundary calls — legal description may not contain metes-and-bounds.');
      return { calls: [], pob: undefined, acreage: undefined };
    }

    const calls: ParsedBoundaryCall[] = data.calls.map(c => ({
      sequence: c.sequence,
      type: (c.type === 'curve' ? 'curve' : 'line') as 'line' | 'curve',
      bearing: c.bearing ?? undefined,
      distance: c.distance_feet ?? c.distance ?? undefined,
      distance_unit: c.distance_unit ?? 'feet',
      radius: c.radius ?? undefined,
      arc_length: c.arc_length ?? undefined,
      delta_angle: c.delta_angle ?? undefined,
      chord_bearing: c.chord_bearing ?? undefined,
      chord_distance: c.chord_distance ?? undefined,
      curve_direction: (c.curve_direction === 'left' || c.curve_direction === 'right')
        ? c.curve_direction
        : undefined,
      raw_text: c.raw_text ?? undefined,
    }));

    const acreage = data.stated_acreage !== null && data.stated_acreage !== undefined
      ? Number(data.stated_acreage)
      : undefined;

    steps.push(`AI extracted ${calls.length} boundary call(s).${data.notes ? ` Notes: ${data.notes}` : ''}`);

    return {
      calls,
      pob: data.point_of_beginning ?? undefined,
      acreage: !isNaN(acreage as number) ? acreage : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push(`AI extraction error: ${msg}`);
    return { calls: [], pob: undefined, acreage: undefined };
  }
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Fetch boundary calls for a property from the county appraisal district.
 *
 * Strategy:
 *  1. Determine the county key and look up the TrueAutomation CID.
 *  2. If a parcel_id is provided, use it directly; otherwise search by address.
 *  3. Fetch full property detail from TrueAutomation.
 *  4. Run AI to parse the metes-and-bounds calls from the legal description.
 *  5. Return structured result including calls, property info, and a search log.
 */
export async function fetchBoundaryCalls(
  req: BoundaryFetchRequest,
): Promise<BoundaryFetchResult> {
  const steps: string[] = [];

  const countyRaw = req.county ?? extractCountyFromAddress(req.address);
  const countyKey = normalizeCountyKey(countyRaw);

  steps.push(
    `Starting boundary call retrieval for: ${req.address ?? '(no address)'}${countyKey ? `, ${countyKey} county` : ''}${req.parcel_id ? `, parcel_id=${req.parcel_id}` : ''}`,
  );

  // ── Step 1: Resolve TrueAutomation CID ────────────────────────────────────
  const cadConfig = countyKey ? TRUEAUTO_BY_COUNTY[countyKey] : undefined;
  if (!cadConfig) {
    const known = Object.keys(TRUEAUTO_BY_COUNTY).join(', ');
    steps.push(
      `County "${countyRaw || '(unknown)'}" is not in the TrueAutomation integration list. ` +
      `Supported counties: ${known}. Falling back to AI analysis of any provided address.`,
    );
  }

  let propId = req.parcel_id ?? null;
  let propDetail: TrueAutoPropDetail | null = null;

  // ── Step 2: Look up property ID if not provided ────────────────────────────
  if (cadConfig && !propId && req.address) {
    propId = await trueAutoSearchByAddress(cadConfig.cid, req.address, steps);
  }

  // ── Step 3: Fetch property details ────────────────────────────────────────
  if (cadConfig && propId) {
    propDetail = await trueAutoFetchDetail(cadConfig.cid, propId, steps);
  }

  // ── Step 4: Build source URL ───────────────────────────────────────────────
  const sourceUrl = cadConfig && propId
    ? `https://propaccess.trueautomation.com/clientdb/?cid=${cadConfig.cid}&prop_id=${encodeURIComponent(propId)}`
    : cadConfig
      ? `https://propaccess.trueautomation.com/clientdb/?cid=${cadConfig.cid}`
      : undefined;

  const sourceName = cadConfig?.name ?? 'Texas County Appraisal District';

  // ── Step 5: Extract legal description ─────────────────────────────────────
  const legalDesc = propDetail?.legal_desc
    ? String(propDetail.legal_desc)
    : undefined;

  if (!legalDesc) {
    if (propDetail) {
      steps.push('Property record found but no legal description text was returned.');
    } else if (propId) {
      steps.push('Could not retrieve property details from the appraisal district.');
    } else {
      steps.push('No property found. Try providing a parcel ID for a more targeted search.');
    }

    const property = propDetail && cadConfig
      ? mapTrueAutoToPropertyDetails(propDetail, cadConfig.name, cadConfig.cid, propId ?? '')
      : undefined;

    return {
      success: false,
      source_name: sourceName,
      source_url: sourceUrl,
      property_id: propId ?? undefined,
      property,
      error: 'No legal description available to parse boundary calls.',
      search_steps: steps,
    };
  }

  steps.push(`Legal description retrieved (${legalDesc.length} chars).`);

  // ── Step 6: Parse boundary calls with AI ──────────────────────────────────
  const { calls, pob, acreage } = await extractBoundaryCallsWithAI(legalDesc, steps);

  const property = cadConfig
    ? mapTrueAutoToPropertyDetails(propDetail!, cadConfig.name, cadConfig.cid, propId ?? '')
    : { legal_description: legalDesc };

  return {
    success: calls.length > 0,
    source_name: sourceName,
    source_url: sourceUrl,
    property_id: propId ?? undefined,
    property,
    legal_description: legalDesc,
    point_of_beginning: pob,
    boundary_calls: calls,
    call_count: calls.length,
    stated_acreage: acreage ?? (property as PropertyDetails).acreage,
    error: calls.length === 0
      ? 'Legal description was found but no metes-and-bounds calls could be extracted.'
      : undefined,
    search_steps: steps,
  };
}
