// worker/src/services/discovery-engine.ts
// Phase 1: PropertyDiscoveryEngine — 5-step universal Texas property identification.
//
// POST /research/discover → DiscoveryResult
//
// Steps:
//   1. Address normalization & geocoding  (address-utils.ts)
//   2. CAD system detection               (cad-registry.ts + county-fips.ts)
//   3. Property search                    (searchBisCad or TrueAuto HTTP)
//   4. Property detail enrichment         (CAD detail page + subdivision detection)
//   5. Cross-reference & validation       (acreage checks, ID format validation)

import { normalizeAddress } from './address-utils.js';
import { searchBisCad } from './bell-cad.js';
import { getCADConfig, buildDetailUrl } from './cad-registry.js';
import { resolveCounty, countyToFIPS } from '../lib/county-fips.js';
import type { PipelineLogger } from '../lib/logger.js';
import type {
  PropertyIdentity,
  DeedReference,
  DiscoveryResult,
  DiscoverySource,
  CadSystemName,
} from '../types/property-discovery.js';

// ── TrueAutomation configs (mirrored from boundary-fetch.service.ts) ──────────

const TRUEAUTO_BY_COUNTY: Record<string, { cid: number; name: string }> = {
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

// ── Subdivision detection ─────────────────────────────────────────────────────

interface SubdivisionInfo {
  isSubdivision: boolean;
  subdivisionName: string | null;
  lotNumber:       string | null;
  blockNumber:     string | null;
}

/**
 * Parse a CAD legal description for subdivision membership.
 * Examples:
 *   "ASH FAMILY TRUST 12.358 ACRE ADDITION, LOT 1"         → isSubdivision=true
 *   "LOT 3, BLOCK A, SUNRIDGE ESTATES PHASE 2"             → isSubdivision=true
 *   "WILLIAM HARTRICK SURVEY A-488, 12.358 ACRES"          → isSubdivision=false
 */
function detectSubdivision(legalDescription: string | null): SubdivisionInfo {
  if (!legalDescription) {
    return { isSubdivision: false, subdivisionName: null, lotNumber: null, blockNumber: null };
  }

  const desc = legalDescription.trim().toUpperCase();

  // Pattern 1: "LOT X, BLOCK Y, SUBDIVISION NAME"
  const lotBlockSubdivMatch = desc.match(
    /^LOT\s+(\w+)[,\s]+BLOCK\s+(\w+)[,\s]+(.+?)(?:\s+PHASE\s+\d+)?(?:\s*,.*)?$/,
  );
  if (lotBlockSubdivMatch) {
    return {
      isSubdivision:   true,
      lotNumber:       lotBlockSubdivMatch[1],
      blockNumber:     lotBlockSubdivMatch[2],
      subdivisionName: lotBlockSubdivMatch[3].trim(),
    };
  }

  // Pattern 2: "LOT X, SUBDIVISION NAME"
  const lotSubdivMatch = desc.match(/^LOT\s+(\w+)[,\s]+(.+?)(?:\s+PHASE\s+\d+)?(?:\s*,.*)?$/);
  if (lotSubdivMatch) {
    return {
      isSubdivision:   true,
      lotNumber:       lotSubdivMatch[1],
      blockNumber:     null,
      subdivisionName: lotSubdivMatch[2].trim(),
    };
  }

  // Pattern 3: "SUBDIVISION NAME, LOT X"
  const subdivLotMatch = desc.match(/^(.+?),\s*LOT\s+(\w+)/);
  if (subdivLotMatch) {
    return {
      isSubdivision:   true,
      subdivisionName: subdivLotMatch[1].trim(),
      lotNumber:       subdivLotMatch[2],
      blockNumber:     null,
    };
  }

  // Pattern 4: Contains "ADDITION" or "SUBDIVISION" keyword but no lot number
  const additionMatch = desc.match(/^(.+?(?:ADDITION|SUBDIVISION|ESTATES|HEIGHTS|VILLAGE|HILLS|LANDING|RANCH))/i);
  if (additionMatch && !desc.match(/\bSURVEY\b|\bABSTRACT\b|\bA-\d/i)) {
    return {
      isSubdivision:   true,
      subdivisionName: additionMatch[1].trim(),
      lotNumber:       null,
      blockNumber:     null,
    };
  }

  // Abstract/survey pattern — this is a metes-and-bounds parcel, NOT a subdivision
  return { isSubdivision: false, subdivisionName: null, lotNumber: null, blockNumber: null };
}

// ── Abstract/survey extraction ────────────────────────────────────────────────

function extractAbstractSurvey(legalDescription: string | null): string | null {
  if (!legalDescription) return null;

  // "WILLIAM HARTRICK SURVEY, A-488" / "A-488" / "ABSTRACT 488" / "ABS 488"
  const abstractMatch = legalDescription.match(
    /([A-Z\s]+SURVEY[^,]*,?\s*A-\d+|ABSTRACT\s*\d+|ABS\s*\d+|A-\d+)/i,
  );
  return abstractMatch ? abstractMatch[1].trim() : null;
}

// ── Deed reference extraction from CAD HTML ───────────────────────────────────

function extractDeedRefs(html: string): DeedReference[] {
  const refs: DeedReference[] = [];
  const seen = new Set<string>();

  // Instrument numbers: 8-10 digit sequences (e.g. 2023032044, 2010043440)
  const instrMatches = html.matchAll(/\b(20\d{2}\d{5,7}|19\d{2}\d{5,7})\b/g);
  for (const m of instrMatches) {
    const num = m[1];
    if (seen.has(num)) continue;
    seen.add(num);
    // Heuristic: if the instrument number appears near "plat" → type plat, else deed
    const context = html.substring(Math.max(0, m.index! - 80), m.index! + 80).toLowerCase();
    const type: DeedReference['type'] = context.includes('plat') ? 'plat' : 'deed';
    refs.push({ instrumentNumber: num, type, date: null, source: 'cad' });
  }

  // Vol/Page references: "Vol. 465 Pg. 96" / "Volume 465, Page 96"
  const volPgMatches = html.matchAll(/Vol(?:ume)?\.?\s*(\d+)[,\s]+P(?:age|g)\.?\s*(\d+)/gi);
  for (const m of volPgMatches) {
    const key = `VOL${m[1]}-PG${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      instrumentNumber: key,
      type: 'deed',
      date: null,
      source: 'cad',
    });
  }

  return refs;
}

// ── TrueAutomation search helper ──────────────────────────────────────────────

interface TrueAutoHit {
  prop_id?:       string | number;
  owner_name?:    string;
  legal_desc?:    string;
  geo_id?:        string;
  land_acres?:    number | string;
  situs_num?:     string;
  situs_street?:  string;
  situs_city?:    string;
  mailing_addr?:  string;
  mailing_city?:  string;
  mailing_state?: string;
  mailing_zip?:   string;
  market_value?:  number | string;
  abs_name?:      string;
  subdv_name?:    string;
  blk?:           string;
  lot?:           string;
  land_use?:      string;
  deed_vol?:      string;
  deed_pg?:       string;
}

async function trueAutoSearch(
  cid: number,
  addressQuery: string,
  logger: PipelineLogger,
): Promise<TrueAutoHit | null> {
  const url = `${TRUEAUTO_BASE}/search/address?cid=${cid}&q=${encodeURIComponent(addressQuery)}`;
  logger.info('Stage3-TrueAuto', `Searching cid=${cid} for: ${addressQuery}`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':   'STARR-Surveying/1.0 (property-research)',
        'Accept':       'application/json',
        'Referer':      `https://propaccess.trueautomation.com/clientdb/?cid=${cid}`,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) { logger.warn('Stage3-TrueAuto', `HTTP ${res.status}`); return null; }

    const data = await res.json() as { data?: TrueAutoHit[] } | TrueAutoHit[];
    const hits: TrueAutoHit[] = Array.isArray(data) ? data : ((data as { data?: TrueAutoHit[] }).data ?? []);

    if (!hits.length) { logger.info('Stage3-TrueAuto', 'No results'); return null; }

    logger.info('Stage3-TrueAuto', `Found ${hits.length} result(s), using first`);
    return hits[0];
  } catch (err) {
    logger.warn('Stage3-TrueAuto', `Search error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function trueAutoDetail(cid: number, propId: string, logger: PipelineLogger): Promise<TrueAutoHit | null> {
  const url = `${TRUEAUTO_BASE}/properties?cid=${cid}&prop_id=${encodeURIComponent(propId)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'STARR-Surveying/1.0 (property-research)',
        'Accept':     'application/json',
        'Referer':    `https://propaccess.trueautomation.com/clientdb/?cid=${cid}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: TrueAutoHit } | TrueAutoHit;
    return (('data' in data && data.data) ? data.data : data) as TrueAutoHit;
  } catch {
    logger.warn('Stage4-TrueAuto', `Detail fetch failed for propId=${propId}`);
    return null;
  }
}

// ── Related lot discovery for subdivisions ────────────────────────────────────

async function findRelatedLots(
  countyKey: string,
  subdivisionName: string,
  targetPropId: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<string[]> {
  try {
    const { normalizeAddress: na } = await import('./address-utils.js');
    const syntheticAddress = { raw: subdivisionName, canonical: subdivisionName, parsed: { streetNumber: '', streetName: subdivisionName, streetType: '', preDirection: null, postDirection: null, unit: null, city: null, state: 'TX', zip: null }, geocoded: false, source: 'manual' as const, variants: [{ streetNumber: '', streetName: subdivisionName, format: 'name_only', priority: 0, isPartial: true }], lat: null, lon: null, detectedCounty: countyKey, countyFIPS: null };

    // For BIS counties, search by subdivision name as owner/keyword
    const { property: sample } = await searchBisCad(countyKey, syntheticAddress, anthropicApiKey, logger);
    if (!sample) return [];

    // In practice, the BIS API returns all matching accounts; since we searched by
    // subdivision name, all results should be related lots.  We return their IDs.
    // The single `property` from searchBisCad is just the best match; a full lot
    // enumeration requires a raw HTTP search that returns all results.  Return at
    // minimum the already-identified property ID.
    return [sample.propertyId].filter(id => id && id !== targetPropId);
  } catch {
    return [];
  }
}

// ── Main discovery function ───────────────────────────────────────────────────

export interface DiscoveryInput {
  address: string;
  county:  string;
  state:   string;
  /** Skip geocoding if you already have the county confirmed */
  skipGeocode?: boolean;
}

export async function discoverProperty(
  input: DiscoveryInput,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<DiscoveryResult> {
  const t0 = Date.now();
  const sources: DiscoverySource[] = [];
  const errors: string[] = [];
  const timing = { totalMs: 0, stage1_geocode: 0, stage2_cad_detect: 0, stage3_cad_search: 0, stage4_detail_enrich: 0, stage5_validate: 0 };

  // ── Step 1: Geocoding ──────────────────────────────────────────────────────
  const s1 = Date.now();
  logger.info('Discover-S1', `Normalizing address: ${input.address}`);

  let normalized;
  try {
    normalized = await normalizeAddress(input.address, logger);
  } catch (err) {
    errors.push(`Step 1 geocoding failed: ${err instanceof Error ? err.message : String(err)}`);
    timing.totalMs = Date.now() - t0;
    return { status: 'failed', property: null, sources, timing, errors };
  }

  // Use user-supplied county if geocoding didn't detect one
  const effectiveCounty = normalized.detectedCounty ?? input.county;
  timing.stage1_geocode = Date.now() - s1;

  // ── Step 2: CAD system detection ───────────────────────────────────────────
  const s2 = Date.now();
  const countyRecord = resolveCounty(effectiveCounty);
  const countyFIPS   = countyRecord?.fips ?? countyToFIPS(effectiveCounty) ?? '';
  const cadConfig    = getCADConfig(effectiveCounty);
  const countyKey    = countyRecord?.key ?? effectiveCounty.toLowerCase().replace(/\s+/g, '_');
  const cadSystem: CadSystemName = countyRecord?.cadSystem ?? 'texasfile_fallback';

  logger.info('Discover-S2', `County: ${effectiveCounty} | FIPS: ${countyFIPS} | CAD: ${cadSystem}`);
  timing.stage2_cad_detect = Date.now() - s2;

  // ── Step 3: Property search ────────────────────────────────────────────────
  const s3 = Date.now();
  let propertyId: string | null = null;
  let geoId:       string | null = null;
  let ownerName:   string | null = null;
  let legalDesc:   string | null = null;
  let acreage:     number | null = null;
  let situsAddr:   string | null = null;
  let matchConf = 0;

  if (cadSystem === 'bis_consultants') {
    const { property, diagnostics } = await searchBisCad(countyKey, normalized, anthropicApiKey, logger);
    sources.push({
      name:    cadConfig?.name ?? `${effectiveCounty} CAD (BIS eSearch)`,
      url:     cadConfig?.searchUrl ?? `https://esearch.${countyKey}cad.org`,
      method:  'hybrid',
      success: !!property,
    });
    if (property) {
      propertyId = property.propertyId;
      geoId      = property.geoId;
      ownerName  = property.ownerName;
      legalDesc  = property.legalDescription;
      acreage    = property.acreage;
      situsAddr  = property.situsAddress;
      matchConf  = property.matchConfidence;
    } else {
      errors.push(`BIS eSearch returned no results for ${effectiveCounty} County`);
    }
    void diagnostics; // diagnostics stored for debugging; not surfaced in DiscoveryResult
  } else if (cadSystem === 'trueautomation') {
    const taCfg = TRUEAUTO_BY_COUNTY[countyKey];
    if (taCfg) {
      // Try each address variant until we get a hit
      for (const variant of normalized.variants.slice(0, 5)) {
        const query = `${variant.streetNumber} ${variant.streetName}`.trim();
        const hit   = await trueAutoSearch(taCfg.cid, query, logger);
        if (hit) {
          propertyId = String(hit.prop_id ?? '');
          geoId      = hit.geo_id ?? null;
          ownerName  = hit.owner_name ?? null;
          legalDesc  = hit.legal_desc ?? null;
          acreage    = typeof hit.land_acres === 'string' ? parseFloat(hit.land_acres) : (hit.land_acres ?? null);
          situsAddr  = [hit.situs_num, hit.situs_street, hit.situs_city].filter(Boolean).join(' ') || null;
          matchConf  = 0.7;
          break;
        }
      }
      sources.push({
        name:    taCfg.name,
        url:     `${TRUEAUTO_BASE}/search/address?cid=${taCfg.cid}`,
        method:  'api',
        success: !!propertyId,
      });
      if (!propertyId) errors.push(`TrueAutomation (cid=${taCfg.cid}) returned no results`);
    } else {
      errors.push(`No TrueAutomation config for county: ${effectiveCounty}`);
    }
  } else {
    // HCAD, TAD, DCAD, TexasFile fallback — not yet implemented
    errors.push(`CAD system "${cadSystem}" not yet automated for ${effectiveCounty} County. Use TexasFile or manual lookup.`);
  }

  timing.stage3_cad_search = Date.now() - s3;

  if (!propertyId) {
    timing.totalMs = Date.now() - t0;
    return { status: 'failed', property: null, sources, timing, errors };
  }

  // ── Step 4: Property detail enrichment ────────────────────────────────────
  const s4 = Date.now();
  let assessedValue: number | null = null;
  let ownerAddress:  string | null = null;
  let propertyType:  string | null = null;
  let taxYear:       number | null = null;
  let deedRefs: DeedReference[] = [];

  if (cadSystem === 'bis_consultants' && cadConfig) {
    // Fetch the detail page HTML for enrichment
    const detailUrl = buildDetailUrl(cadConfig, propertyId);
    try {
      const res = await fetch(detailUrl, {
        headers: { 'User-Agent': 'STARR-Surveying/1.0', 'Accept': 'text/html' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const html = await res.text();

        // Assessed / market value
        const valMatch = html.match(/(?:Assessed|Market|Appraised)\s*Value\s*:?\s*(?:<[^>]*>)?\s*\$?([\d,]+)/i);
        if (valMatch) assessedValue = parseInt(valMatch[1].replace(/,/g, ''), 10) || null;

        // Tax year
        const yearMatch = html.match(/(?:Tax\s*Year|Year)\s*:?\s*(?:<[^>]*>)?\s*(20\d{2}|19\d{2})/i);
        if (yearMatch) taxYear = parseInt(yearMatch[1], 10);

        // Owner mailing address
        const addrMatch = html.match(/(?:Mailing\s*Address|Owner\s*Address)\s*:?\s*(?:<[^>]*>\s*)*([^<]{5,80})/i);
        if (addrMatch) ownerAddress = addrMatch[1].trim();

        // Property type (override if not from search)
        if (!propertyType) {
          const typeMatch = html.match(/(?:Property\s*Type|Prop\s*Type)\s*:?\s*(?:<[^>]*>\s*)*([^<]{1,40})/i);
          if (typeMatch) propertyType = typeMatch[1].trim();
        }

        deedRefs = extractDeedRefs(html);

        sources.push({ name: 'CAD Property Detail', url: detailUrl, method: 'http', success: true });
      }
    } catch (err) {
      logger.warn('Discover-S4', `Detail fetch error: ${err instanceof Error ? err.message : String(err)}`);
      sources.push({ name: 'CAD Property Detail', url: detailUrl, method: 'http', success: false, error: String(err) });
    }
  } else if (cadSystem === 'trueautomation') {
    const taCfg = TRUEAUTO_BY_COUNTY[countyKey];
    if (taCfg) {
      const detail = await trueAutoDetail(taCfg.cid, propertyId, logger);
      if (detail) {
        ownerName    = ownerName    ?? detail.owner_name  ?? null;
        legalDesc    = legalDesc    ?? detail.legal_desc  ?? null;
        acreage      = acreage      ?? (typeof detail.land_acres === 'string' ? parseFloat(detail.land_acres) : detail.land_acres ?? null);
        ownerAddress = detail.mailing_addr ? [detail.mailing_addr, detail.mailing_city, detail.mailing_state, detail.mailing_zip].filter(Boolean).join(', ') : null;
        assessedValue = typeof detail.market_value === 'string' ? parseInt(detail.market_value, 10) : (detail.market_value ?? null);
        taxYear = new Date().getFullYear();

        // Vol/Page deed reference
        if (detail.deed_vol && detail.deed_pg) {
          deedRefs.push({ instrumentNumber: `VOL${detail.deed_vol}-PG${detail.deed_pg}`, type: 'deed', date: null, source: 'cad' });
        }
      }
    }
  }

  timing.stage4_detail_enrich = Date.now() - s4;

  // ── Step 5: Validation & enrichment ───────────────────────────────────────
  const s5 = Date.now();
  const subdiv = detectSubdivision(legalDesc);
  const abstractSurvey = extractAbstractSurvey(legalDesc);

  // Related lot discovery for subdivisions (best-effort, non-blocking)
  let relatedPropertyIds: string[] = [];
  if (subdiv.isSubdivision && subdiv.subdivisionName && cadSystem === 'bis_consultants') {
    relatedPropertyIds = await findRelatedLots(countyKey, subdiv.subdivisionName, propertyId, anthropicApiKey, logger);
  }

  // Basic validation flags
  const validationErrors: string[] = [];
  if (!acreage) validationErrors.push('Acreage not found in CAD records');
  if (!legalDesc) validationErrors.push('Legal description not found');
  if (matchConf < 0.5) validationErrors.push(`Low address match confidence: ${(matchConf * 100).toFixed(0)}%`);
  errors.push(...validationErrors);

  timing.stage5_validate = Date.now() - s5;
  timing.totalMs = Date.now() - t0;

  const property: PropertyIdentity = {
    propertyId,
    geoId,
    countyFIPS,
    owner:          ownerName,
    ownerAddress,
    legalDescription: legalDesc,
    abstractSurvey,
    acreage,
    assessedValue,
    taxYear:        taxYear ?? new Date().getFullYear(),
    propertyType,
    county:         effectiveCounty,
    state:          input.state,
    situsAddress:   situsAddr,
    cadSystem,
    isSubdivision:  subdiv.isSubdivision,
    subdivisionName: subdiv.subdivisionName,
    totalLots:      relatedPropertyIds.length > 0 ? relatedPropertyIds.length + 1 : null,
    lotNumber:      subdiv.lotNumber,
    blockNumber:    subdiv.blockNumber,
    relatedPropertyIds,
    adjacentOwners: [],
    deedReferences: deedRefs,
  };

  return {
    status:   errors.filter(e => !e.startsWith('Acreage') && !e.startsWith('Legal') && !e.startsWith('Low')).length > 0 ? 'partial' : 'complete',
    property,
    sources,
    timing,
    errors,
  };
}
