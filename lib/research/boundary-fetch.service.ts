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

// ── esearch CAD Portal Config ─────────────────────────────────────────────────
// Harris Govern / Tyler Technologies eSearch portals used by several Texas CADs.
// These expose an HTTP search API in addition to the TrueAutomation JSON API.

interface EsearchConfig {
  /** Base URL of the eSearch portal (no trailing slash) */
  baseUrl: string;
  /** Display name */
  name: string;
}

const ESEARCH_BY_COUNTY: Record<string, EsearchConfig> = {
  bell:       { baseUrl: 'https://esearch.bellcad.org',  name: 'Bell CAD e-Search' },
  hays:       { baseUrl: 'https://esearch.hayscad.com',  name: 'Hays CAD e-Search' },
  williamson: { baseUrl: 'https://esearch.wcad.org',      name: 'Williamson CAD e-Search' },
};

// ── Bell County GIS ArcGIS REST Config ───────────────────────────────────────
// Bell County publishes parcel data via an ArcGIS REST feature service.
// The PROP_ID field in this layer maps directly to the Bell CAD property ID.

interface ArcGisConfig {
  /** Full URL to the FeatureServer or MapServer layer endpoint (no trailing slash) */
  layerUrl: string;
  /** Alternate layer URLs to try when the primary fails */
  fallbackLayerUrls?: string[];
  /** Field name that holds the CAD property ID */
  propIdField: string;
  /** Fields to try for situs address matching — ordered by preference */
  addressFields: string[];
  /** Display name */
  name: string;
}

const ARCGIS_BY_COUNTY: Record<string, ArcGisConfig> = {
  bell: {
    layerUrl: 'https://gis.co.bell.tx.us/arcgis/rest/services/Parcels/MapServer/0',
    fallbackLayerUrls: [
      'https://gis.co.bell.tx.us/arcgis/rest/services/Parcels/FeatureServer/0',
      'https://gis.co.bell.tx.us/arcgis/rest/services/Parcels/MapServer/1',
      'https://gis.co.bell.tx.us/arcgis/rest/services/BellCounty_Parcels/FeatureServer/0',
      'https://gis.co.bell.tx.us/arcgis/rest/services/Property/MapServer/0',
      // National Esri parcel fallback (publicly accessible Living Atlas layer)
      'https://services2.arcgis.com/FiaFA0dzneJZiblf/arcgis/rest/services/ParcelPublicView/FeatureServer/0',
    ],
    propIdField: 'PROP_ID',
    addressFields: ['SITUS_ADDRESS', 'SITUS_ADDR', 'ADDRESS', 'FULL_ADDRESS', 'SITE_ADDR', 'SITEADDRESS'],
    name: 'Bell County GIS Parcel Layer',
  },
};

// ── publicsearch.us County Clerk Portal Config ────────────────────────────────
// Many Texas counties use the Tyler Technologies / Kofile publicsearch.us platform
// for online access to recorded deeds, plats, and instruments.
// Deed search URL: https://{subdomain}/results?search=index,fullText&q={propertyId}

const PUBLICSEARCH_BY_COUNTY: Record<string, string> = {
  bell:       'bell.tx.publicsearch.us',
  coryell:    'coryell.tx.publicsearch.us',
  mclennan:   'mclennan.tx.publicsearch.us',
  falls:      'falls.tx.publicsearch.us',
  milam:      'milam.tx.publicsearch.us',
  lampasas:   'lampasas.tx.publicsearch.us',
  travis:     'travis.tx.publicsearch.us',
  williamson: 'williamson.tx.publicsearch.us',
  bastrop:    'bastrop.tx.publicsearch.us',
  hays:       'hays.tx.publicsearch.us',
  brazos:     'brazos.tx.publicsearch.us',
  burleson:   'burleson.tx.publicsearch.us',
  robertson:  'robertson.tx.publicsearch.us',
  lee:        'lee.tx.publicsearch.us',
  burnet:     'burnet.tx.publicsearch.us',
  llano:      'llano.tx.publicsearch.us',
  hill:       'hill.tx.publicsearch.us',
  limestone:  'limestone.tx.publicsearch.us',
  bosque:     'bosque.tx.publicsearch.us',
  hamilton:   'hamilton.tx.publicsearch.us',
  leon:       'leon.tx.publicsearch.us',
  blanco:     'blanco.tx.publicsearch.us',
  caldwell:   'caldwell.tx.publicsearch.us',
  comal:      'comal.tx.publicsearch.us',
  guadalupe:  'guadalupe.tx.publicsearch.us',
  brown:      'brown.tx.publicsearch.us',
  comanche:   'comanche.tx.publicsearch.us',
  erath:      'erath.tx.publicsearch.us',
  hood:       'hood.tx.publicsearch.us',
  johnson:    'johnson.tx.publicsearch.us',
  ellis:      'ellis.tx.publicsearch.us',
  grimes:     'grimes.tx.publicsearch.us',
  washington: 'washington.tx.publicsearch.us',
  fayette:    'fayette.tx.publicsearch.us',
};

// ── URL Builders ──────────────────────────────────────────────────────────────

/**
 * Build the direct CAD property view URL.
 * For Bell County: esearch.bellcad.org/Property/View/{id}?year={year}
 * For TrueAutomation counties: propaccess.trueautomation.com/clientdb/?cid={cid}&prop_id={id}
 */
function buildCadPropertyUrl(countyKey: string, propId: string, cadConfig?: TrueAutoConfig): string | undefined {
  const esearch = ESEARCH_BY_COUNTY[countyKey];
  if (esearch) {
    const year = new Date().getFullYear();
    return `${esearch.baseUrl}/Property/View/${encodeURIComponent(propId)}?year=${year}`;
  }
  if (cadConfig) {
    return `https://propaccess.trueautomation.com/clientdb/?cid=${cadConfig.cid}&prop_id=${encodeURIComponent(propId)}`;
  }
  return undefined;
}

/**
 * Build the county clerk deed-search URL pre-loaded with the property ID.
 * Falls back to an address-based search when no property ID is available.
 * Uses the publicsearch.us platform where available.
 */
function buildDeedSearchUrl(countyKey: string, propId: string): string | undefined {
  const subdomain = PUBLICSEARCH_BY_COUNTY[countyKey];
  if (!subdomain) return undefined;
  return `https://${subdomain}/results?search=index,fullText&q=${encodeURIComponent(propId)}`;
}

/**
 * Build a county clerk deed-search URL using an address query (no property ID needed).
 * Useful when property ID resolution fails but the county clerk portal is known.
 */
function buildDeedSearchUrlByAddress(countyKey: string, _address: string): string | undefined {
  const subdomain = PUBLICSEARCH_BY_COUNTY[countyKey];
  if (!subdomain) return undefined;
  // _address is kept in the signature for API compatibility; the address-based full-text search
  // in the publicsearch.us SPA does not reliably load results without a property ID.
  // Return the portal homepage so the researcher can search manually once a property ID is known.
  return `https://${subdomain}/`;
}

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

// ── Address Normalization Helpers ─────────────────────────────────────────────

/**
 * Strip city/state/ZIP suffix and remove periods from abbreviations.
 * "2512 S. 5th Street Temple, Texas 76504" → "2512 S 5th Street"
 */
function normalizeStreetAddress(address: string): string {
  return address
    .split(',')[0]         // drop city, state, ZIP (everything after first comma)
    .replace(/\./g, '')    // remove periods (S. → S, St. → St)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Regex matching trailing street-type words that eSearch portals often omit. */
const STREET_TYPE_RE = /\s+(?:DR(?:IVE)?|RD|ROAD|ST(?:REET)?|AVE(?:NUE)?|BLVD|BOULEVARD|LN|LANE|CT|COURT|PL(?:ACE)?|PKWY|PARKWAY|HWY|HIGHWAY|FWY|FREEWAY|CIR(?:CLE)?|SQ(?:UARE)?|WAY|TRL|TRAIL|CV|COVE|LOOP|PASS|RUN|EXPY)\.?$/i;

/**
 * Strip trailing street-type word from a street name so that
 * "Waggoner Dr" → "Waggoner" and "5th Street" → "5th".
 * Improves recall on eSearch portals that index the base name only.
 */
export function stripStreetTypeSuffix(name: string): string {
  return name.replace(STREET_TYPE_RE, '').trim();
}

/**
 * Extract CAD property IDs from an eSearch portal HTML page by scanning
 * all `/Property/View/{id}` hyperlinks in the markup.
 * Returns IDs in the order they appear, de-duplicated.
 */
export function extractPropertyIdsFromEsearchHtml(html: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /\/Property\/View\/(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids;
}

/** Ordinal number → word lookup used for address variants */
const ORDINAL_WORDS: Record<number, string> = {
  1: 'FIRST', 2: 'SECOND', 3: 'THIRD', 4: 'FOURTH', 5: 'FIFTH',
  6: 'SIXTH', 7: 'SEVENTH', 8: 'EIGHTH', 9: 'NINTH', 10: 'TENTH',
  11: 'ELEVENTH', 12: 'TWELFTH', 13: 'THIRTEENTH', 14: 'FOURTEENTH',
  15: 'FIFTEENTH', 16: 'SIXTEENTH', 17: 'SEVENTEENTH', 18: 'EIGHTEENTH',
  19: 'NINETEENTH', 20: 'TWENTIETH',
  21: 'TWENTY-FIRST', 22: 'TWENTY-SECOND', 23: 'TWENTY-THIRD', 24: 'TWENTY-FOURTH',
  25: 'TWENTY-FIFTH', 26: 'TWENTY-SIXTH', 27: 'TWENTY-SEVENTH', 28: 'TWENTY-EIGHTH',
  29: 'TWENTY-NINTH', 30: 'THIRTIETH',
  31: 'THIRTY-FIRST', 32: 'THIRTY-SECOND', 33: 'THIRTY-THIRD', 34: 'THIRTY-FOURTH',
  35: 'THIRTY-FIFTH', 36: 'THIRTY-SIXTH', 37: 'THIRTY-SEVENTH', 38: 'THIRTY-EIGHTH',
  39: 'THIRTY-NINTH', 40: 'FORTIETH',
  41: 'FORTY-FIRST', 42: 'FORTY-SECOND', 43: 'FORTY-THIRD', 44: 'FORTY-FOURTH',
  45: 'FORTY-FIFTH', 46: 'FORTY-SIXTH', 47: 'FORTY-SEVENTH', 48: 'FORTY-EIGHTH',
  49: 'FORTY-NINTH', 50: 'FIFTIETH',
};

// ── Address Variant Generator ─────────────────────────────────────────────────
//
// Generates up to 6 alternate address formats to maximize the chance of a
// successful lookup when the original address string doesn't match the CAD record.
// Returns the original address first, followed by progressively simplified variants.

const STREET_ABBR_EXPANSIONS: [RegExp, string][] = [
  [/\bST\b/,    'STREET'],
  [/\bAVE\b/,   'AVENUE'],
  [/\bDR\b/,    'DRIVE'],
  [/\bBLVD\b/,  'BOULEVARD'],
  [/\bRD\b/,    'ROAD'],
  [/\bLN\b/,    'LANE'],
  [/\bCT\b/,    'COURT'],
  [/\bPL\b/,    'PLACE'],
  [/\bTRL\b/,   'TRAIL'],
  [/\bPKWY\b/,  'PARKWAY'],
  [/\bHWY\b/,   'HIGHWAY'],
  [/\bFWY\b/,   'FREEWAY'],
  [/\bCIR\b/,   'CIRCLE'],
  [/\bSQ\b/,    'SQUARE'],
];

export function generateAddressVariants(address: string): string[] {
  const seen = new Set<string>();
  const variants: string[] = [];

  function add(v: string) {
    const normalized = v.trim().replace(/\s+/g, ' ');
    if (normalized && !seen.has(normalized.toUpperCase())) {
      seen.add(normalized.toUpperCase());
      variants.push(normalized);
    }
  }

  add(address); // Original always first

  const upper = address.toUpperCase().trim();

  // Variant: strip unit/suite/apt designators
  const noUnit = upper
    .replace(/\b(STE|SUITE|APT|UNIT|BLDG|BUILDING|FLOOR|FL|RM|ROOM|#)\s*[\w-]+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  add(noUnit);

  // Variant: street number + street name only (drop city, state, ZIP)
  const streetOnly = upper.split(',')[0]?.trim() ?? '';
  add(streetOnly);
  const streetOnlyNoUnit = noUnit.split(',')[0]?.trim() ?? '';
  add(streetOnlyNoUnit);

  // Variant: expand common street-type abbreviation
  for (const [abbr, full] of STREET_ABBR_EXPANSIONS) {
    if (abbr.test(upper)) {
      add(upper.replace(abbr, full));
      // Also try the street-only form with the expansion
      add(streetOnly.replace(abbr, full));
      break; // only expand the first match to avoid explosion
    }
  }

  // Variant: drop directional prefix after number (e.g., "2512 S 5TH ST" → "2512 5TH ST")
  const noDir = upper.replace(/^(\d+)\s+[NSEW]\s+/, '$1 ');
  add(noDir);
  add(noDir.split(',')[0]?.trim() ?? '');

  // Variant: no-periods, street-only (critical for TrueAutomation which rejects "S.")
  const noPeriods = upper.replace(/\./g, '').replace(/\s+/g, ' ').trim();
  add(noPeriods);
  add(noPeriods.split(',')[0]?.trim() ?? '');

  // Variant: ordinal number → word form (e.g., "5TH" → "FIFTH")
  const ordReplaced = streetOnly.replace(/\b(\d{1,2})(ST|ND|RD|TH)\b/gi, (_m, n) => {
    return ORDINAL_WORDS[Number(n)] ?? _m;
  });
  if (ordReplaced !== streetOnly) {
    add(ordReplaced);
    add(ordReplaced.replace(/^(\d+)\s+[NSEW]\s+/i, '$1 ').trim());
  }

  return variants.slice(0, 10);
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
    const detail = (('data' in data && data.data) ? data.data : data) as TrueAutoPropDetail;
    steps.push(`Retrieved property data for ${detail.owner_name ?? 'unknown owner'}`);
    return detail;
  } catch (err) {
    steps.push(`Property detail error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function mapTrueAutoToPropertyDetails(
  detail: TrueAutoPropDetail,
  _cadName: string,
  _cid: number,
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
}

// ── Additional TrueAutomation Search Methods ──────────────────────────────────

/** Method 3: TrueAutomation owner-name search */
async function trueAutoSearchByOwner(
  cid: number,
  ownerName: string,
  steps: string[],
): Promise<string | null> {
  const url = `${TRUEAUTO_BASE}/search/owner?cid=${cid}&q=${encodeURIComponent(ownerName)}`;
  steps.push(`[Method 3] TrueAutomation owner search (cid=${cid}): "${ownerName}"`);
  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) { steps.push(`Owner search returned HTTP ${res.status}`); return null; }
    const data = await res.json() as { data?: TrueAutoSearchHit[] } | TrueAutoSearchHit[];
    const hits: TrueAutoSearchHit[] = Array.isArray(data) ? data : (data?.data ?? []);
    if (hits.length === 0) { steps.push('No properties found for this owner name.'); return null; }
    const propId = String(hits[0].prop_id ?? '');
    steps.push(`[Method 3] Found property ID ${propId} for owner "${hits[0].owner_name ?? ownerName}"`);
    return propId || null;
  } catch (err) {
    steps.push(`[Method 3] Owner search error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Method 4a: TrueAutomation geographic-ID search */
async function trueAutoSearchByGeoId(
  cid: number,
  geoId: string,
  steps: string[],
): Promise<string | null> {
  const url = `${TRUEAUTO_BASE}/search/geoid?cid=${cid}&q=${encodeURIComponent(geoId)}`;
  steps.push(`[Method 4a] TrueAutomation geo-ID search (cid=${cid}): "${geoId}"`);
  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) { steps.push(`Geo-ID search returned HTTP ${res.status}`); return null; }
    const data = await res.json() as { data?: TrueAutoSearchHit[] } | TrueAutoSearchHit[];
    const hits: TrueAutoSearchHit[] = Array.isArray(data) ? data : (data?.data ?? []);
    if (hits.length === 0) { steps.push('No properties found for this geographic ID.'); return null; }
    const propId = String(hits[0].prop_id ?? '');
    steps.push(`[Method 4a] Found property ID ${propId} for geo-ID "${geoId}"`);
    return propId || null;
  } catch (err) {
    steps.push(`[Method 4a] Geo-ID search error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Method 4b: TrueAutomation account-number search (direct prop_id lookup) */
async function trueAutoSearchByAccount(
  cid: number,
  account: string,
  steps: string[],
): Promise<string | null> {
  const url = `${TRUEAUTO_BASE}/search/account?cid=${cid}&q=${encodeURIComponent(account)}`;
  steps.push(`[Method 4b] TrueAutomation account search (cid=${cid}): "${account}"`);
  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) { steps.push(`Account search returned HTTP ${res.status}`); return null; }
    const data = await res.json() as { data?: TrueAutoSearchHit[] } | TrueAutoSearchHit[];
    const hits: TrueAutoSearchHit[] = Array.isArray(data) ? data : (data?.data ?? []);
    if (hits.length === 0) { steps.push('No properties found for this account number.'); return null; }
    const propId = String(hits[0].prop_id ?? '');
    steps.push(`[Method 4b] Found property ID ${propId} for account "${account}"`);
    return propId || null;
  } catch (err) {
    steps.push(`[Method 4b] Account search error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Method 5: eSearch CAD Portal HTTP Query ───────────────────────────────────
//
// The Harris Govern / Tyler Technologies eSearch CAD portals (esearch.bellcad.org,
// esearch.hayscad.com, esearch.wcad.org) expose a search endpoint. We try several
// known API patterns for these portals since the exact path varies by version.

interface EsearchHit {
  prop_id?: string | number;
  PropertyId?: string | number;
  propertyId?: string | number;
  Id?: string | number;
  id?: string | number;
  AccountNum?: string;
  SitusAddress?: string;
  OwnerName?: string;
  [key: string]: unknown;
}

/** Extract an array of hit objects from any of the eSearch portal's known response envelopes. */
function extractEsearchHits(data: unknown): EsearchHit[] {
  if (Array.isArray(data)) return data as EsearchHit[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d?.Results)) return d.Results as EsearchHit[];
  if (Array.isArray(d?.data))    return d.data    as EsearchHit[];
  return [];
}

async function searchEsearchPortal(
  req: BoundaryFetchRequest,
  countyKey: string,
  steps: string[],
): Promise<string | null> {
  const config = ESEARCH_BY_COUNTY[countyKey];
  if (!config) return null;

  const queries: Array<{ label: string; q: string; type: string }> = [];
  if (req.address)    queries.push({ label: 'address',    q: req.address,    type: 'address' });
  if (req.owner_name) queries.push({ label: 'owner name', q: req.owner_name, type: 'owner'   });
  if (req.parcel_id)  queries.push({ label: 'account',    q: req.parcel_id,  type: 'account'  });

  // Add stripped address variants: strip city/state and remove periods
  if (req.address) {
    const streetOnly = normalizeStreetAddress(req.address);
    if (streetOnly.toUpperCase() !== (req.address.toUpperCase())) {
      queries.push({ label: 'normalized street-only address', q: streetOnly, type: 'address' });
    }
    // Without directional prefix (e.g., "2512 S 5TH ST" → "2512 5TH ST")
    const noDir = streetOnly.replace(/^(\d+)\s+[NSEW]\s+/i, '$1 ').trim();
    if (noDir !== streetOnly) {
      queries.push({ label: 'no-directional address', q: noDir, type: 'address' });
    }
    // House number only (wide match — filter by street on client)
    const houseNum = streetOnly.match(/^(\d+)/)?.[1];
    if (houseNum) {
      queries.push({ label: 'house-number-only', q: houseNum, type: 'address' });
    }
  }

  if (queries.length === 0) return null;

  // Try multiple known eSearch endpoint patterns in parallel per query
  for (const { label, q, type } of queries) {
    steps.push(`[Method 5] Querying ${config.name} for ${label}: "${q}"`);

    // Endpoint candidates — different platform versions use different paths
    const year = new Date().getFullYear();
    const endpoints = [
      `${config.baseUrl}/Property/GetSearchResults?q=${encodeURIComponent(q)}&type=${type}&year=${year}&resultLimit=10`,
      `${config.baseUrl}/api/v1/properties/search?q=${encodeURIComponent(q)}&searchType=${type}`,
      `${config.baseUrl}/Search/GetSearchData?searchValue=${encodeURIComponent(q)}&searchType=${type}&year=${year}`,
      `${config.baseUrl}/Property/QuickSearch?q=${encodeURIComponent(q)}&type=${type}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetchWithTimeout(url, {
          headers: { ...makeFetchHeaders(), 'Accept': 'application/json' },
        });
        if (!res.ok) continue;

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) continue;

        const hits = extractEsearchHits(await res.json());
        if (hits.length === 0) continue;

        // Extract property ID from any common field name
        const raw = hits[0].prop_id ?? hits[0].PropertyId ?? hits[0].propertyId
          ?? hits[0].Id ?? hits[0].id ?? hits[0].AccountNum;
        const propId = raw != null ? String(raw) : '';
        if (propId) {
          steps.push(`[Method 5] ${config.name} returned property ID: ${propId}`);
          return propId;
        }
      } catch {
        // Silently try next endpoint
      }
    }
  }

  // ── Method 5b: StreetNumber / StreetName keyword search (HTML endpoint) ────
  // Bell CAD and other Tyler-Technologies eSearch portals expose a keyword-based
  // search at /search/result?keywords=StreetNumber:X%20StreetName:Y that returns
  // an HTML page.  Stripping the street-type suffix (Dr, Drive, Rd …) from the
  // street name significantly improves recall — e.g. "Waggoner" returns results
  // where "Waggoner Dr" returns none.
  if (req.address) {
    const streetOnly = normalizeStreetAddress(req.address).toUpperCase();
    const houseNumMatch = streetOnly.match(/^(\d+)\s+(.+)$/);
    if (houseNumMatch) {
      const houseNum = houseNumMatch[1];
      const fullStreetName = houseNumMatch[2].trim();
      const baseStreetName = stripStreetTypeSuffix(fullStreetName);

      // Try base-name first (most permissive), then full name as a fallback
      const streetNameCandidates = [baseStreetName];
      if (baseStreetName !== fullStreetName) streetNameCandidates.push(fullStreetName);

      for (const streetName of streetNameCandidates) {
        // Trailing space after the street name matches the portal's expected keyword format
        // (confirmed working URL: keywords=StreetNumber:3424%20StreetName:Waggoner%20).
        const keywords = `StreetNumber:${houseNum} StreetName:${streetName} `;
        const url = `${config.baseUrl}/search/result?keywords=${encodeURIComponent(keywords)}`;
        steps.push(`[Method 5] Querying ${config.name} via keyword search: "${keywords.trim()}"`);
        try {
          const res = await fetchWithTimeout(url, {
            headers: { ...makeFetchHeaders(), 'Accept': 'text/html,application/xhtml+xml,*/*' },
          });
          if (!res.ok) continue;
          const html = await res.text();
          const ids = extractPropertyIdsFromEsearchHtml(html);
          if (ids.length > 0) {
            steps.push(`[Method 5] ${config.name} keyword search found ${ids.length} result(s) — using property ID: ${ids[0]}`);
            return ids[0];
          }
        } catch {
          // Try next candidate
        }
      }
    }
  }

  steps.push(`[Method 5] ${config.name} did not return a property ID.`);
  return null;
}

// ── Method 6: ArcGIS REST Parcel Feature Query ────────────────────────────────
//
// Query the county's public ArcGIS parcel layer by address string.
// The PROP_ID attribute in this layer is the CAD property ID.

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
}

interface ArcGisQueryResponse {
  features?: ArcGisFeature[];
  error?: { message?: string };
}

async function searchArcGisParcel(
  req: BoundaryFetchRequest,
  countyKey: string,
  steps: string[],
): Promise<string | null> {
  const config = ARCGIS_BY_COUNTY[countyKey];
  if (!config) return null;
  if (!req.address && !req.owner_name) return null;

  steps.push(`[Method 6] Querying ${config.name} for property ID`);

  // Try each address-field name the layer might use.
  // Sanitize the street string: keep only alphanumeric, spaces, hyphens, and periods.
  // This prevents any SQL injection via the address field before it is interpolated
  // into the ArcGIS WHERE clause (field names are from the trusted config object).
  const queries: string[] = [];
  if (req.address) {
    const streetOnly = (req.address.split(',')[0] ?? req.address).trim();
    const safe = streetOnly.replace(/[^A-Za-z0-9 .#-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (safe) {
      for (const field of config.addressFields) {
        queries.push(`UPPER(${field}) LIKE UPPER('${safe.replace(/'/g, "''")}%')`);
      }
    }
  }
  if (queries.length === 0) return null;

  const allLayerUrls = [config.layerUrl, ...(config.fallbackLayerUrls ?? [])];

  for (const whereClause of queries) {
    for (const layerUrl of allLayerUrls) {
      const url =
        `${layerUrl}/query` +
        `?where=${encodeURIComponent(whereClause)}` +
        `&outFields=${encodeURIComponent([config.propIdField, ...config.addressFields, 'OWNER_NAME', 'OWN_NAME'].join(','))}` +
        `&returnGeometry=false&resultRecordCount=5&f=json`;

      try {
        const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
        if (!res.ok) { steps.push(`[Method 6] ArcGIS ${layerUrl} returned HTTP ${res.status}`); continue; }

        const data = await res.json() as ArcGisQueryResponse;
        if (data.error) { steps.push(`[Method 6] ArcGIS error at ${layerUrl}: ${data.error.message ?? 'unknown'}`); continue; }

        const features = data.features ?? [];
        if (features.length === 0) { steps.push(`[Method 6] ${layerUrl}: no matching features.`); continue; }

        const attrs = features[0].attributes ?? {};
        const rawId = attrs[config.propIdField];
        const propId = rawId != null ? String(rawId).trim() : '';

        if (propId) {
          const addrAttr = config.addressFields.map(f => attrs[f]).find(v => v != null);
          steps.push(`[Method 6] ArcGIS parcel layer found property ID ${propId}${addrAttr ? ` at "${addrAttr}"` : ''} (layer: ${layerUrl})`);
          return propId;
        }
      } catch (err) {
        steps.push(`[Method 6] ArcGIS query error at ${layerUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return null;
}

// ── Method 7: Geocoding + Coordinate-Based Parcel Lookup ─────────────────────
//
// Step 7a: Geocode the address using Nominatim (free, no key required).
// Step 7b: Query the county parcel layer with the resulting lat/lon point.

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
}

async function geocodeWithNominatim(
  address: string,
  steps: string[],
): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us&addressdetails=0`;
  steps.push(`[Method 7a] Geocoding address via Nominatim: "${address}"`);
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        // Nominatim usage policy requires a descriptive User-Agent and contact info
        'User-Agent': 'STARR-Surveying/1.0 (Texas land survey research tool; contact@starrsurveying.com)',
        'Referer': 'https://starrsurveying.com',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) { steps.push(`[Method 7a] Nominatim returned HTTP ${res.status}`); return null; }
    const data = await res.json() as NominatimResult[];
    if (!Array.isArray(data) || data.length === 0) {
      steps.push('[Method 7a] Nominatim returned no results for this address.');
      return null;
    }
    const lat = parseFloat(data[0].lat ?? '');
    const lon = parseFloat(data[0].lon ?? '');
    if (isNaN(lat) || isNaN(lon)) return null;
    steps.push(`[Method 7a] Geocoded to ${lat.toFixed(5)}, ${lon.toFixed(5)} (${data[0].display_name ?? ''})`);
    return { lat, lon };
  } catch (err) {
    steps.push(`[Method 7a] Geocoding error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Census Bureau Geocoder (Method 7c) ────────────────────────────────────────
// Free, no API key required, highly reliable for US street addresses.
// Used as a parallel fallback alongside Nominatim.

interface CensusGeocodeResult {
  result?: {
    addressMatches?: Array<{
      matchedAddress?: string;
      coordinates?: { x?: number; y?: number };
    }>;
  };
}

async function geocodeWithCensus(
  address: string,
  steps: string[],
): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress` +
    `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  steps.push(`[Method 7c] Census Bureau geocoding: "${address}"`);
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'STARR-Surveying/1.0 (Texas land survey; contact@starrsurveying.com)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) { steps.push(`[Method 7c] Census geocoder HTTP ${res.status}`); return null; }
    const data = await res.json() as CensusGeocodeResult;
    const match = data?.result?.addressMatches?.[0];
    const lat = match?.coordinates?.y;
    const lon = match?.coordinates?.x;
    if (!lat || !lon) { steps.push('[Method 7c] Census geocoder: no match.'); return null; }
    steps.push(`[Method 7c] Census geocoded: ${lat.toFixed(5)}, ${lon.toFixed(5)} (${match?.matchedAddress ?? ''})`);
    return { lat, lon };
  } catch (err) {
    steps.push(`[Method 7c] Census geocoder error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function queryArcGisParcelByPoint(
  lat: number,
  lon: number,
  countyKey: string,
  steps: string[],
): Promise<string | null> {
  const config = ARCGIS_BY_COUNTY[countyKey];
  if (!config) return null;

  steps.push(`[Method 7b] Querying ${config.name} at ${lat.toFixed(5)}, ${lon.toFixed(5)}`);

  const geom = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
  const url =
    `${config.layerUrl}/query` +
    `?geometry=${encodeURIComponent(geom)}` +
    `&geometryType=esriGeometryPoint` +
    `&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=${encodeURIComponent([config.propIdField, ...config.addressFields].join(','))}` +
    `&returnGeometry=false&f=json`;

  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) { steps.push(`[Method 7b] ArcGIS point query returned HTTP ${res.status}`); return null; }
    const data = await res.json() as ArcGisQueryResponse;
    if (data.error || !data.features?.length) return null;
    const attrs = data.features[0].attributes ?? {};
    const rawId = attrs[config.propIdField];
    const propId = rawId != null ? String(rawId).trim() : '';
    if (propId) {
      steps.push(`[Method 7b] Coordinate query found property ID: ${propId}`);
      return propId;
    }
    return null;
  } catch (err) {
    steps.push(`[Method 7b] ArcGIS point query error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Method 7d: Nominatim Structured Geocoding ─────────────────────────────────
// Sends street, city, and state as separate parameters — more reliable than a
// single-line query for addresses that Nominatim's parser might mis-tokenize.

async function geocodeWithNominatimStructured(
  address: string,
  steps: string[],
): Promise<{ lat: number; lon: number } | null> {
  const parts = address.split(',').map(p => p.trim());
  const street = normalizeStreetAddress(parts[0] || address);
  const cityRaw = parts[1]?.replace(/\s+\w{2}\s*\d{5}.*$/, '').trim() || '';
  const city = cityRaw.replace(/\s+TX$/i, '').trim();

  const url = `https://nominatim.openstreetmap.org/search` +
    `?street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}` +
    `&state=Texas&country=us&format=json&limit=3&addressdetails=0`;

  steps.push(`[Method 7d] Nominatim structured query: street="${street}" city="${city}"`);
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'STARR-Surveying/1.0 (Texas land survey; contact@starrsurveying.com)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) { steps.push(`[Method 7d] HTTP ${res.status}`); return null; }
    const data = await res.json() as NominatimResult[];
    if (!Array.isArray(data) || data.length === 0) {
      steps.push('[Method 7d] Nominatim structured: no results.');
      return null;
    }
    const lat = parseFloat(data[0].lat ?? '');
    const lon = parseFloat(data[0].lon ?? '');
    if (isNaN(lat) || isNaN(lon)) return null;
    steps.push(`[Method 7d] Structured geocode: ${lat.toFixed(5)}, ${lon.toFixed(5)} (${data[0].display_name ?? ''})`);
    return { lat, lon };
  } catch (err) {
    steps.push(`[Method 7d] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Method 7e: Google Maps Geocoding API ──────────────────────────────────────
// Requires GOOGLE_MAPS_API_KEY environment variable.
// Often the most accurate geocoder for US street addresses.

async function geocodeWithGoogle(
  address: string,
  steps: string[],
): Promise<{ lat: number; lon: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    steps.push('[Method 7e] Google Geocoding skipped — GOOGLE_MAPS_API_KEY not configured.');
    return null;
  }
  steps.push(`[Method 7e] Google Maps Geocoding: "${address}"`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}&components=country:US|administrative_area:TX&key=${apiKey}`;
  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) { steps.push(`[Method 7e] HTTP ${res.status}`); return null; }
    const data = await res.json() as {
      status: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }>;
    };
    if (data.status !== 'OK' || !data.results?.length) {
      steps.push(`[Method 7e] Google Geocoding status: ${data.status}`);
      return null;
    }
    const loc = data.results[0].geometry?.location;
    if (!loc) return null;
    steps.push(`[Method 7e] Google geocoded: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (${data.results[0].formatted_address ?? ''})`);
    return { lat: loc.lat, lon: loc.lng };
  } catch (err) {
    steps.push(`[Method 7e] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Method 7f: MapBox Geocoding API ──────────────────────────────────────────
// Requires MAPBOX_ACCESS_TOKEN environment variable.
// Uses a proximity hint centered on Central Texas for better local precision.

async function geocodeWithMapBox(
  address: string,
  steps: string[],
): Promise<{ lat: number; lon: number } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    steps.push('[Method 7f] MapBox Geocoding skipped — MAPBOX_ACCESS_TOKEN not configured.');
    return null;
  }
  steps.push(`[Method 7f] MapBox Geocoding: "${address}"`);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
    `?country=us&proximity=-97.35,31.07&types=address&limit=1&access_token=${token}`;
  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) { steps.push(`[Method 7f] HTTP ${res.status}`); return null; }
    const data = await res.json() as { features?: Array<{ center?: [number, number]; place_name?: string }> };
    const feat = data?.features?.[0];
    if (!feat?.center) { steps.push('[Method 7f] MapBox: no results.'); return null; }
    const [lon, lat] = feat.center;
    steps.push(`[Method 7f] MapBox geocoded: ${lat.toFixed(5)}, ${lon.toFixed(5)} (${feat.place_name ?? ''})`);
    return { lat, lon };
  } catch (err) {
    steps.push(`[Method 7f] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Method 10: OpenStreetMap Overpass API ─────────────────────────────────────
// Free, no API key. Queries the OSM graph for nodes/ways matching address tags
// within a county bounding box. Useful when geocoders fail on non-standard addresses.

interface OverpassResponse {
  elements?: Array<{
    type: string;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }>;
}

async function geocodeWithOverpass(
  address: string,
  countyKey: string,
  steps: string[],
): Promise<{ lat: number; lon: number } | null> {
  const streetPart = normalizeStreetAddress(address);
  const houseNum = streetPart.match(/^(\d+)/)?.[1] ?? '';
  // Strip house number and leading directional to get the street name core
  const streetName = streetPart
    .replace(/^\d+\s+/, '')
    .replace(/^[NSEW]\s+/i, '')
    .replace(/\s+(ST|AVE|DR|RD|BLVD|LN|CT|PL|TRL|WAY|PKWY|HWY)\s*$/i, '')
    .trim();

  if (!houseNum || !streetName) {
    steps.push('[Method 10] Overpass: could not parse address components; skipping.');
    return null;
  }

  // Sanitize: only allow alphanumeric, spaces, hyphens, and apostrophes in query strings
  // to prevent Overpass query injection from user-supplied address data.
  const safeHouseNum = houseNum.replace(/[^0-9]/g, '');
  const safeStreetName = streetName.replace(/[^A-Za-z0-9 '-]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!safeHouseNum || !safeStreetName) {
    steps.push('[Method 10] Overpass: address sanitization removed all content; skipping.');
    return null;
  }

  // Approximate bounding boxes per county
  const COUNTY_BBOX: Record<string, string> = {
    bell:      '30.85,-97.75,31.40,-97.05',
    coryell:   '31.05,-97.98,31.60,-97.45',
    mclennan:  '31.35,-97.43,31.82,-96.89',
    falls:     '31.05,-96.98,31.45,-96.60',
    milam:     '30.65,-97.25,31.10,-96.65',
    lampasas:  '30.85,-98.45,31.30,-97.85',
  };
  const bbox = COUNTY_BBOX[countyKey] ?? '30.0,-98.5,31.5,-96.5';

  const query = `[out:json][timeout:15];(\n` +
    `  node["addr:housenumber"="${safeHouseNum}"]["addr:street"~"${safeStreetName}",i](${bbox});\n` +
    `  way["addr:housenumber"="${safeHouseNum}"]["addr:street"~"${safeStreetName}",i](${bbox});\n` +
    `);out center 1;`;

  steps.push(`[Method 10] OpenStreetMap Overpass: housenumber="${safeHouseNum}", street~"${safeStreetName}" in bbox ${bbox}`);
  try {
    const res = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...makeFetchHeaders() },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) { steps.push(`[Method 10] Overpass HTTP ${res.status}`); return null; }
    const data = await res.json() as OverpassResponse;
    const el = data?.elements?.[0];
    if (!el) { steps.push('[Method 10] Overpass: no matching address nodes found.'); return null; }
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon) { steps.push('[Method 10] Overpass: element found but no coordinates.'); return null; }
    steps.push(`[Method 10] Overpass geocoded: ${lat.toFixed(5)}, ${lon.toFixed(5)} (tags: ${JSON.stringify(el.tags ?? {})})`);
    return { lat, lon };
  } catch (err) {
    steps.push(`[Method 10] Overpass error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Method 11: TrueAutomation broad street-name search ───────────────────────
// Searches by street name only (no house number), then filters results client-side
// by house number. Handles cases where the full address string is rejected by TA.

async function trueAutoSearchByStreetName(
  cid: number,
  address: string,
  steps: string[],
): Promise<string | null> {
  const streetPart = normalizeStreetAddress(address);
  const houseNum = streetPart.match(/^(\d+)/)?.[1] ?? '';
  // Street name: remove number + directional prefix, keep street type
  const streetName = streetPart.replace(/^\d+\s+[NSEW]?\s*/i, '').trim();

  if (!streetName) {
    steps.push('[Method 11] TrueAuto broad search: could not extract street name.');
    return null;
  }

  steps.push(`[Method 11] TrueAutomation broad street search (cid=${cid}): "${streetName}"`);
  const url = `${TRUEAUTO_BASE}/search/address?cid=${cid}&q=${encodeURIComponent(streetName)}`;
  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) { steps.push(`[Method 11] HTTP ${res.status}`); return null; }
    const data = await res.json() as { data?: TrueAutoSearchHit[] } | TrueAutoSearchHit[];
    const hits: TrueAutoSearchHit[] = Array.isArray(data) ? data : (data?.data ?? []);

    if (hits.length === 0) {
      steps.push(`[Method 11] No properties found on street "${streetName}".`);
      return null;
    }

    steps.push(`[Method 11] Found ${hits.length} properties on "${streetName}" — scanning for house number "${houseNum}".`);

    if (houseNum) {
      const match = hits.find(h => String(h.situs_num ?? '').trim() === houseNum);
      if (match) {
        const propId = String(match.prop_id ?? '');
        steps.push(`[Method 11] Matched house number ${houseNum}: property ID ${propId} (${match.situs_num} ${match.situs_street})`);
        return propId || null;
      }
      steps.push(`[Method 11] No exact match for house number ${houseNum} among ${hits.length} results.`);
    }
    return null;
  } catch (err) {
    steps.push(`[Method 11] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Method 12: Esri ArcGIS Online National Parcel Service ────────────────────
// Fallback for any county when county-specific ArcGIS fails.
// Uses the publicly accessible national parcel dataset hosted on ArcGIS Online.

const NATIONAL_PARCEL_LAYER = 'https://services2.arcgis.com/FiaFA0dzneJZiblf/arcgis/rest/services/ParcelPublicView/FeatureServer/0';

async function queryNationalParcelByPoint(
  lat: number,
  lon: number,
  steps: string[],
): Promise<string | null> {
  steps.push(`[Method 12] Esri national parcel service point query at ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  const geom = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
  const url =
    `${NATIONAL_PARCEL_LAYER}/query` +
    `?geometry=${encodeURIComponent(geom)}` +
    `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=APN,PARCELNUMB,PARCEL_ID,PROP_ID,OWNER,SITEADDRESS,ADDR_NUMBER,ADDR_STREETNAME` +
    `&returnGeometry=false&f=json`;
  try {
    const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
    if (!res.ok) { steps.push(`[Method 12] National parcel HTTP ${res.status}`); return null; }
    const data = await res.json() as ArcGisQueryResponse;
    if (data.error) { steps.push(`[Method 12] National parcel error: ${data.error.message ?? 'unknown'}`); return null; }
    const features = data.features ?? [];
    if (!features.length) { steps.push('[Method 12] National parcel: no parcel at these coordinates.'); return null; }
    const attrs = features[0].attributes ?? {};
    // Try common parcel ID field names
    const raw = attrs['APN'] ?? attrs['PARCELNUMB'] ?? attrs['PARCEL_ID'] ?? attrs['PROP_ID'];
    const propId = raw != null ? String(raw).trim() : '';
    if (propId) {
      steps.push(`[Method 12] National parcel found ID: ${propId} (address: ${attrs['SITEADDRESS'] ?? attrs['ADDR_NUMBER'] ?? '?'})`);
      return propId;
    }
    steps.push('[Method 12] National parcel: feature found but no ID field populated.');
    return null;
  } catch (err) {
    steps.push(`[Method 12] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Method 8: AI-Assisted Property ID Resolution ─────────────────────────────
//
// Last resort: ask the AI to reason about the available information and suggest
// the most likely property ID. The AI can cross-reference address patterns with
// known CAD ID formats and infer from partial information.

interface AIPropertyIdResponse {
  property_id?: string | null;
  confidence?: number;
  reasoning?: string;
  suggested_search_steps?: string[];
}

async function resolvePropertyIdWithAI(
  req: BoundaryFetchRequest,
  countyKey: string,
  steps: string[],
): Promise<string | null> {
  steps.push('[Method 8] Attempting AI-assisted property ID resolution…');

  const context: string[] = [];
  if (req.address)    context.push(`Address: ${req.address}`);
  if (req.owner_name) context.push(`Owner Name: ${req.owner_name}`);
  if (req.county)     context.push(`County: ${req.county}`);
  if (req.parcel_id)  context.push(`Partial ID hint: ${req.parcel_id}`);
  context.push(`County key: ${countyKey}`);

  try {
    const result = await callAI({
      promptKey: 'PROPERTY_RESEARCHER',
      userContent:
        `All automated property ID lookup methods have failed for this property. ` +
        `Based on the following information, can you determine or infer the Texas CAD property ID?\n\n` +
        context.join('\n') +
        `\n\nReturn JSON: { "property_id": "string or null", "confidence": 0-100, "reasoning": "...", "suggested_search_steps": ["..."] }`,
      maxTokens: 512,
      maxRetries: 1,
      timeoutMs: 30_000,
    });

    const data = result.response as AIPropertyIdResponse;
    if (data?.property_id && typeof data.property_id === 'string' && data.property_id.trim()) {
      const propId = data.property_id.trim();
      steps.push(
        `[Method 8] AI suggested property ID: ${propId} ` +
        `(confidence ${data.confidence ?? '?'}%) — ${data.reasoning ?? ''}`,
      );
      if (data.suggested_search_steps?.length) {
        for (const s of data.suggested_search_steps) steps.push(`[Method 8] AI tip: ${s}`);
      }
      return propId;
    }

    if (data?.suggested_search_steps?.length) {
      steps.push('[Method 8] AI could not determine property ID but suggests:');
      for (const s of data.suggested_search_steps) steps.push(`  • ${s}`);
    } else {
      steps.push('[Method 8] AI was unable to determine the property ID from available information.');
    }
  } catch (err) {
    steps.push(`[Method 8] AI resolution error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return null;
}

// ── ATTOM Data Solutions API (Method 4c) ─────────────────────────────────────
// Covers all US properties. Requires ATTOM_API_KEY env var.
// https://api.gateway.attomdata.com

interface AttomProperty {
  identifier?: { attomId?: number; fips?: string; apn?: string };
  lot?: { lotnum?: string };
  summary?: { legalDescription?: string; propclass?: string };
  address?: { oneLine?: string };
}

async function searchAttomData(
  req: BoundaryFetchRequest,
  steps: string[],
): Promise<{ propId: string | null; legalDesc?: string }> {
  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey || !req.address) return { propId: null };

  const parts = req.address.split(',');
  const street = parts[0]?.trim() ?? req.address;
  const cityState = parts.slice(1).join(',').trim() ||
    (req.county ? `${req.county} County, TX` : 'TX');

  steps.push(`[ATTOM] Querying ATTOM Data API: "${street}, ${cityState}"`);
  const url = `https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/basicprofile` +
    `?address1=${encodeURIComponent(street)}&address2=${encodeURIComponent(cityState)}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json', 'apikey': apiKey },
    });
    if (!res.ok) { steps.push(`[ATTOM] HTTP ${res.status}`); return { propId: null }; }
    const data = await res.json() as { property?: AttomProperty[] };
    const prop = data?.property?.[0];
    if (!prop) { steps.push('[ATTOM] No property found.'); return { propId: null }; }
    const apn = prop.identifier?.apn ?? prop.lot?.lotnum ?? null;
    const legalDesc = prop.summary?.legalDescription ?? undefined;
    if (apn) steps.push(`[ATTOM] Found APN: ${apn} for "${prop.address?.oneLine ?? req.address}"`);
    return { propId: apn ? String(apn) : null, legalDesc };
  } catch (err) {
    steps.push(`[ATTOM] Error: ${err instanceof Error ? err.message : String(err)}`);
    return { propId: null };
  }
}

// ── Regrid Parcel API (Method 4d) ─────────────────────────────────────────────
// Nationwide parcel data. Requires REGRID_TOKEN env var (free tier available).
// https://regrid.com/api

interface RegridParcel {
  parcelnumb?: string;
  parcelnumb_no_formatting?: string;
  owner?: string;
  saddno?: string; saddstr?: string; scity?: string; state2?: string;
  legaldesc?: string;
  ll_gisacre?: number;
  [key: string]: unknown;
}

async function searchRegridApi(
  req: BoundaryFetchRequest,
  steps: string[],
): Promise<{ propId: string | null; legalDesc?: string }> {
  const token = process.env.REGRID_TOKEN;
  if (!token || !req.address) return { propId: null };

  steps.push(`[Regrid] Querying Regrid Parcel API: "${req.address}"`);
  const url = `https://app.regrid.com/api/v2/parcels/search` +
    `?query=${encodeURIComponent(req.address)}&token=${token}&limit=1&return_custom=false`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json', ...makeFetchHeaders() },
    });
    if (!res.ok) { steps.push(`[Regrid] HTTP ${res.status}`); return { propId: null }; }
    const data = await res.json() as { parcels?: { features?: Array<{ properties?: RegridParcel }> } };
    const parcel = data?.parcels?.features?.[0]?.properties;
    if (!parcel) { steps.push('[Regrid] No parcel found.'); return { propId: null }; }
    const parcelNum = parcel.parcelnumb ?? parcel.parcelnumb_no_formatting ?? null;
    if (parcelNum) steps.push(`[Regrid] Found parcel: ${parcelNum}`);
    return { propId: parcelNum ? String(parcelNum) : null, legalDesc: parcel.legaldesc ?? undefined };
  } catch (err) {
    steps.push(`[Regrid] Error: ${err instanceof Error ? err.message : String(err)}`);
    return { propId: null };
  }
}

// ── Tavily Search API (Method 9) ──────────────────────────────────────────────
// Returns full web content — far more reliable than HTML scraping.
// Requires TAVILY_API_KEY env var (free tier: 1000 req/month at tavily.com).
// Falls back to county CAD URL pattern guessing if no API key is configured.

interface TavilyResult { title?: string; url?: string; content?: string }
interface TavilyResponse { answer?: string; results?: TavilyResult[] }

/** Try common Texas CAD URL patterns for the county when no search API key is available. */
async function tryCountyCadPatterns(
  req: BoundaryFetchRequest,
  countyKey: string,
  steps: string[],
): Promise<string | null> {
  if (!countyKey || !req.address) return null;
  const patterns = [
    `https://${countyKey}cad.org/search/?q=${encodeURIComponent(req.address)}`,
    `https://www.${countyKey}cad.net/search/?q=${encodeURIComponent(req.address)}`,
    `https://esearch.${countyKey}cad.org/Property/GetSearchResults?q=${encodeURIComponent(req.address)}&type=address&resultLimit=5`,
  ];
  for (const url of patterns) {
    steps.push(`[Method 9b] Trying county CAD URL pattern: ${url}`);
    try {
      const res = await fetchWithTimeout(url, { headers: makeFetchHeaders() });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const hits = extractEsearchHits(await res.json());
        const raw = hits[0]?.prop_id ?? hits[0]?.PropertyId ?? hits[0]?.AccountNum;
        if (raw) { steps.push(`[Method 9b] Pattern matched property ID: ${raw}`); return String(raw); }
      }
    } catch { /* try next */ }
  }
  return null;
}

async function tavilySearchPropertyId(
  req: BoundaryFetchRequest,
  countyKey: string,
  steps: string[],
): Promise<string | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return tryCountyCadPatterns(req, countyKey, steps);

  const queryParts: string[] = [];
  if (req.address) queryParts.push(`"${req.address}"`);
  queryParts.push(`${req.county ?? countyKey} County Texas property appraisal district parcel record`);
  const query = queryParts.join(' ');
  steps.push(`[Method 9] Tavily web search: "${query}"`);

  try {
    const res = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey, query, search_depth: 'advanced',
        include_answer: true, include_raw_content: false, max_results: 5,
      }),
    });
    if (!res.ok) { steps.push(`[Method 9] Tavily HTTP ${res.status}`); return null; }
    const data = await res.json() as TavilyResponse;

    const contents: string[] = [];
    if (data.answer) contents.push(`Search Answer: ${data.answer}`);
    for (const r of (data.results ?? []).slice(0, 3)) {
      if (r.content) contents.push(`[${r.url ?? ''}]\n${r.content.substring(0, 1500)}`);
    }
    if (!contents.length) { steps.push('[Method 9] Tavily returned no content.'); return null; }

    const result = await callAI({
      promptKey: 'PROPERTY_RESEARCHER',
      userContent:
        `Extract the Texas CAD property ID or parcel number from these web search results.\n` +
        `Address: ${req.address ?? '(unknown)'}\nCounty: ${req.county ?? countyKey}\n\n` +
        `SEARCH RESULTS:\n${contents.join('\n\n---\n\n')}\n\n` +
        `Return JSON: { "property_id": "string or null", "confidence": 0-100, "evidence": "one sentence" }`,
      maxTokens: 512, maxRetries: 1, timeoutMs: 30_000,
    });
    const aiData = result.response as { property_id?: string | null; confidence?: number; evidence?: string };
    if (aiData?.property_id?.trim()) {
      steps.push(`[Method 9] AI found property ID: ${aiData.property_id} (confidence: ${aiData.confidence ?? '?'}%) — ${aiData.evidence ?? ''}`);
      return aiData.property_id.trim();
    }
    steps.push('[Method 9] Search did not yield a property ID.');
    return null;
  } catch (err) {
    steps.push(`[Method 9] Tavily error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Traverse Closure Check ────────────────────────────────────────────────────

import type { ClosureCheckResult } from '@/types/research';

/** Parse a quadrant bearing string to a clockwise azimuth in decimal degrees. */
function parseBearingToAzimuth(bearing: string): number | null {
  const m = bearing.trim().match(
    /^([NS])\s*(\d+(?:\.\d+)?)[°\s]+(\d+(?:\.\d+)?)?['\s]*(\d+(?:\.\d+)?)?"?\s*([EW])$/i,
  );
  if (!m) return null;
  const [, ns, deg, min, sec, ew] = m;
  const decimal = Number(deg) + (Number(min ?? 0) / 60) + (Number(sec ?? 0) / 3600);
  if (decimal > 90) return null; // invalid bearing angle
  const NS = ns.toUpperCase(), EW = ew.toUpperCase();
  if (NS === 'N' && EW === 'E') return decimal;
  if (NS === 'S' && EW === 'E') return 180 - decimal;
  if (NS === 'S' && EW === 'W') return 180 + decimal;
  return 360 - decimal; // NW
}

/** Convert a distance to feet from its stated unit. */
function toFeet(distance: number, unit: string): number {
  const u = (unit ?? 'feet').toLowerCase().trim();
  if (u === 'vara' || u === 'varas')  return distance * (100 / 36); // 1 vara = 33.333… in = 2.7778 ft
  if (u === 'chain' || u === 'chains') return distance * 66;
  if (u === 'link'  || u === 'links')  return distance * 0.66;
  if (u === 'rod'   || u === 'rods')   return distance * 16.5;
  if (u === 'meter' || u === 'meters' || u === 'm') return distance * 3.28084;
  return distance; // feet (default)
}

/**
 * Mathematical traverse closure check.
 * Traverses all line calls, sums ΔX/ΔY, computes closure error and area.
 */
function runClosureCheck(
  calls: ParsedBoundaryCall[],
  statedAcreage?: number,
): ClosureCheckResult {
  const usable = calls.filter(
    c => c.type === 'line' && c.bearing && c.distance != null && c.distance > 0,
  );

  if (usable.length < 3) {
    return {
      checked: false, closes: false, closure_error_ft: null, closure_precision: null,
      area_computed_acres: null, total_traverse_ft: null, calls_used: usable.length,
      quality: 'unchecked',
      warning: `Need ≥3 usable line calls for closure check; got ${usable.length}.`,
    };
  }

  let sumDX = 0, sumDY = 0, totalFt = 0;
  const pts: [number, number][] = [[0, 0]];

  for (const c of usable) {
    const az = parseBearingToAzimuth(c.bearing!);
    if (az === null) continue;
    const dist = toFeet(c.distance!, c.distance_unit ?? 'feet');
    const rad = (az * Math.PI) / 180;
    const dX = dist * Math.sin(rad);
    const dY = dist * Math.cos(rad);
    sumDX += dX; sumDY += dY; totalFt += dist;
    pts.push([pts[pts.length - 1][0] + dX, pts[pts.length - 1][1] + dY]);
  }

  const errorFt = Math.sqrt(sumDX ** 2 + sumDY ** 2);
  const precision = totalFt > 0 && errorFt > 0 ? Math.round(totalFt / errorFt) : null;

  // Shoelace formula for area
  let area = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  const areaAcres = Math.abs(area) / 2 / 43560;

  let quality: ClosureCheckResult['quality'];
  if (!precision)                  quality = 'unchecked';
  else if (precision >= 10_000)    quality = 'excellent';
  else if (precision >= 5_000)     quality = 'good';
  else if (precision >= 1_000)     quality = 'marginal';
  else                             quality = 'poor';

  const closes = precision !== null && precision >= 1_000;
  let warning: string | undefined;
  if (!closes && precision !== null) {
    warning = `Traverse does not close — error: ${errorFt.toFixed(3)} ft (1:${precision.toLocaleString()}).`;
    if (statedAcreage && areaAcres > 0) {
      const diff = Math.abs(areaAcres - statedAcreage);
      if (diff > statedAcreage * 0.05) {
        warning += ` Computed area ${areaAcres.toFixed(3)} ac differs from stated ${statedAcreage} ac by ${diff.toFixed(3)} ac.`;
      }
    }
  }

  return {
    checked: true, closes,
    closure_error_ft: Math.round(errorFt * 1000) / 1000,
    closure_precision: precision ? `1:${precision.toLocaleString()}` : null,
    area_computed_acres: Math.round(areaAcres * 10000) / 10000,
    total_traverse_ft: Math.round(totalFt * 100) / 100,
    calls_used: usable.length, quality, warning,
  };
}

// ── Property ID Resolution Orchestrator ───────────────────────────────────────
//
// Runs all resolution methods in priority order and returns on first success.
// Methods run sequentially so that each failure's step-log entry is captured before
// the next method is tried. Parallel execution would obscure which method succeeded.

async function resolvePropertyId(
  req: BoundaryFetchRequest,
  countyKey: string,
  cadConfig: TrueAutoConfig | undefined,
  steps: string[],
  out?: { lat?: number; lon?: number },
): Promise<string | null> {
  // ── Method 1: TrueAutomation address search ────────────────────────────────
  // Use a normalized (no-periods, street-only) address as primary — TrueAutomation
  // rejects city/state suffixes and dotted abbreviations like "S." more reliably.
  if (cadConfig && req.address) {
    steps.push('[Method 1] TrueAutomation address search (primary)');
    const normalized = normalizeStreetAddress(req.address);
    const normalizedChanged = normalized !== normalizeStreetAddress(req.address.split(',')[0]) ||
      normalized !== req.address.trim();
    if (normalizedChanged) steps.push(`[Method 1] Cleaned address for TrueAutomation: "${normalized}"`);
    const id = await trueAutoSearchByAddress(cadConfig.cid, normalized, steps);
    if (id) return id;
    // Also try with the original address in case the normalized version lost useful info
    if (normalizedChanged) {
      const id2 = await trueAutoSearchByAddress(cadConfig.cid, req.address, steps);
      if (id2) return id2;
    }
  }

  // ── Method 2: TrueAutomation address variants ──────────────────────────────
  // Try alternate address formats in case the original didn't match.
  if (cadConfig && req.address) {
    const variants = generateAddressVariants(req.address).slice(1); // skip original (tried in Method 1)
    if (variants.length > 0) {
      steps.push(`[Method 2] Trying ${variants.length} address variant(s) on TrueAutomation`);
      for (const variant of variants) {
        const id = await trueAutoSearchByAddress(cadConfig.cid, variant, steps);
        if (id) return id;
      }
    }
  }

  // ── Method 3: TrueAutomation owner-name search ────────────────────────────
  if (cadConfig && req.owner_name) {
    const id = await trueAutoSearchByOwner(cadConfig.cid, req.owner_name, steps);
    if (id) return id;
  }

  // ── Method 4a/4b: TrueAutomation geo-id / account search ─────────────────
  // The parcel_id field may hold a GIS geographic ID or a CAD account number
  // rather than the TrueAutomation prop_id. Try both dedicated endpoints.
  if (cadConfig && req.parcel_id) {
    const idFromGeo = await trueAutoSearchByGeoId(cadConfig.cid, req.parcel_id, steps);
    if (idFromGeo) return idFromGeo;
    const idFromAcct = await trueAutoSearchByAccount(cadConfig.cid, req.parcel_id, steps);
    if (idFromAcct) return idFromAcct;
  }

  // ── Method 4c: ATTOM Data API (all US properties) ─────────────────────────
  if (process.env.ATTOM_API_KEY) {
    const { propId: attomId } = await searchAttomData(req, steps);
    if (attomId) return attomId;
  }

  // ── Method 4d: Regrid Parcel API (nationwide parcel data) ─────────────────
  if (process.env.REGRID_TOKEN) {
    const { propId: regridId } = await searchRegridApi(req, steps);
    if (regridId) return regridId;
  }

  // ── Method 5: eSearch CAD portal HTTP query ────────────────────────────────
  const esearchId = await searchEsearchPortal(req, countyKey, steps);
  if (esearchId) return esearchId;

  // ── Method 6: ArcGIS REST parcel feature query by address ─────────────────
  const arcGisId = await searchArcGisParcel(req, countyKey, steps);
  if (arcGisId) return arcGisId;

  // ── Method 7: Geocode address → coordinate-based parcel lookup ────────────
  // Runs Nominatim, Census Bureau, Nominatim structured, Google, and MapBox in
  // parallel for maximum coverage. Whichever returns coordinates first is used
  // for the ArcGIS point-in-polygon parcel lookup.
  if (req.address) {
    steps.push('[Method 7] Running geocoders in parallel (Nominatim, Census, structured, Google, MapBox)…');
    const [nominatimCoords, censusCoords, structuredCoords, googleCoords, mapBoxCoords] = await Promise.all([
      geocodeWithNominatim(req.address, steps),
      geocodeWithCensus(req.address, steps),
      geocodeWithNominatimStructured(req.address, steps),
      geocodeWithGoogle(req.address, steps),
      geocodeWithMapBox(req.address, steps),
    ]);

    const coords = nominatimCoords ?? censusCoords ?? structuredCoords ?? googleCoords ?? mapBoxCoords;

    if (coords) {
      // Save coordinates for the caller to surface in the result
      if (out) { out.lat = coords.lat; out.lon = coords.lon; }

      // Method 7b: County-specific ArcGIS parcel layer (point in polygon)
      const pointId = await queryArcGisParcelByPoint(coords.lat, coords.lon, countyKey, steps);
      if (pointId) return pointId;

      // Method 12: National parcel fallback when county-specific layer fails
      const nationalId = await queryNationalParcelByPoint(coords.lat, coords.lon, steps);
      if (nationalId) return nationalId;
    }

    // Try address variants if all geocoders failed
    if (!coords) {
      steps.push('[Method 7] All geocoders failed — trying address variants for geocoding.');
      for (const variant of generateAddressVariants(req.address).slice(1, 4)) {
        const [vNom, vCen] = await Promise.all([
          geocodeWithNominatim(variant, steps),
          geocodeWithCensus(variant, steps),
        ]);
        const vCoords = vNom ?? vCen;
        if (vCoords) {
          if (out && !out.lat) { out.lat = vCoords.lat; out.lon = vCoords.lon; }
          const varPointId = await queryArcGisParcelByPoint(vCoords.lat, vCoords.lon, countyKey, steps);
          if (varPointId) return varPointId;
          const varNatId = await queryNationalParcelByPoint(vCoords.lat, vCoords.lon, steps);
          if (varNatId) return varNatId;
          break;
        }
      }
    }
  }

  // ── Method 8: AI-assisted resolution ──────────────────────────────────────
  const aiId = await resolvePropertyIdWithAI(req, countyKey, steps);
  if (aiId) return aiId;

  // ── Method 9: Web search engine + AI page analysis (brute force) ──────────
  const searchId = await tavilySearchPropertyId(req, countyKey, steps);
  if (searchId) return searchId;

  // ── Method 10: OpenStreetMap Overpass API ──────────────────────────────────
  if (req.address) {
    const overpassCoords = await geocodeWithOverpass(req.address, countyKey, steps);
    if (overpassCoords) {
      if (out && !out.lat) { out.lat = overpassCoords.lat; out.lon = overpassCoords.lon; }
      const ovPointId = await queryArcGisParcelByPoint(overpassCoords.lat, overpassCoords.lon, countyKey, steps);
      if (ovPointId) return ovPointId;
      const ovNatId = await queryNationalParcelByPoint(overpassCoords.lat, overpassCoords.lon, steps);
      if (ovNatId) return ovNatId;
    }
  }

  // ── Method 11: TrueAutomation broad street-name search ────────────────────
  if (cadConfig && req.address) {
    const streetId = await trueAutoSearchByStreetName(cadConfig.cid, req.address, steps);
    if (streetId) return streetId;
  }

  steps.push('All property ID resolution methods exhausted — could not determine property ID.');
  return null;
}

interface AIBoundaryResponse {
  point_of_beginning?: string;
  description_type?: string;
  datum?: string;
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
    monument_at_end?: string | null;
    confidence?: number | null;
    raw_text?: string;
  }>;
  stated_acreage?: number | null;
  call_count?: number;
  notes?: string;
  references?: Array<{
    type?: string;
    volume?: string;
    page?: string;
    instrument?: string;
    county?: string;
    description?: string;
  }>;
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
      confidence: typeof c.confidence === 'number' ? c.confidence : null,
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
 * Property ID resolution uses 8 methods in cascade (short-circuits on first success):
 *  1. TrueAutomation address search (primary — fastest for supported counties)
 *  2. TrueAutomation address variants (alternate formats / abbreviation expansions)
 *  3. TrueAutomation owner-name search
 *  4. TrueAutomation geo-ID / account-number search
 *  5. County eSearch CAD portal HTTP query (Bell/Hays/Williamson CAD portals)
 *  6. ArcGIS REST parcel feature-layer query by address string
 *  7. Nominatim geocoding + ArcGIS point-in-polygon parcel lookup
 *  8. AI-assisted property ID inference (last resort)
 *
 * Once the property ID is found:
 *  - Retrieves full property detail and legal description from TrueAutomation
 *  - Runs AI to parse metes-and-bounds boundary calls
 *  - Returns structured result with direct CAD URL, deed-search URL, and step log
 */
export async function fetchBoundaryCalls(
  req: BoundaryFetchRequest,
): Promise<BoundaryFetchResult> {
  const steps: string[] = [];

  const countyRaw = req.county ?? extractCountyFromAddress(req.address);
  const countyKey = normalizeCountyKey(countyRaw);

  steps.push(
    `Starting boundary call retrieval for: ${req.address ?? '(no address)'}` +
    `${countyKey ? `, ${countyKey} county` : ''}` +
    `${req.parcel_id ? `, parcel_id=${req.parcel_id}` : ''}`,
  );

  // ── Step 1: Resolve TrueAutomation CID ────────────────────────────────────
  const cadConfig = countyKey ? TRUEAUTO_BY_COUNTY[countyKey] : undefined;
  if (!cadConfig) {
    const known = Object.keys(TRUEAUTO_BY_COUNTY).join(', ');
    steps.push(
      `County "${countyRaw || '(unknown)'}" is not in the TrueAutomation integration list. ` +
      `Supported counties: ${known}. Will still attempt eSearch, ArcGIS, geocoding, and AI methods.`,
    );
  }

  // ── Step 2: Resolve property ID via all available methods ─────────────────
  let propId: string | null = req.parcel_id ?? null;
  const geocodedOut: { lat?: number; lon?: number } = {};

  if (!propId) {
    propId = await resolvePropertyId(req, countyKey, cadConfig, steps, geocodedOut);
    if (propId) {
      steps.push(`[PROPERTY ID FOUND] ✓ Resolved CAD property ID: ${propId} (via automated lookup)`);
    }
  } else {
    steps.push(`[PROPERTY ID] Using provided property ID: ${propId}`);
  }

  // ── Step 2b: Verify retrieved property matches the requested address ───────
  // When a property ID was resolved automatically, cross-check that the retrieved
  // situs address actually corresponds to the address we were asked about.
  // A mismatch usually means the CAD system returned a nearby or unrelated parcel.
  // Store the detail here so Step 3 can reuse it without a second API call.
  let verifiedPropDetail: TrueAutoPropDetail | null = null;
  if (propId && req.address && cadConfig) {
    const requestedStreet = (req.address.split(',')[0] ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const requestedNum = requestedStreet.match(/^\d+/)?.[0] ?? '';

    const verifyDetail = await trueAutoFetchDetail(cadConfig.cid, propId, steps);
    if (verifyDetail) {
      const situsNum = String(verifyDetail.situs_num ?? '').trim();
      const situsStreet = String(verifyDetail.situs_street ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const situsAddr = `${situsNum} ${situsStreet}`.trim();

      // If the house number is available and doesn't match, this is likely the wrong parcel
      if (requestedNum && situsNum && situsNum !== requestedNum) {
        steps.push(
          `[Verify] ⚠️ Property ID ${propId} has situs address "${situsAddr}" but requested "${requestedStreet}". ` +
          `House number mismatch (${situsNum} ≠ ${requestedNum}) — discarding and retrying without this ID.`,
        );
        propId = null;
      } else {
        steps.push(`[Verify] ✓ Property ID ${propId} confirmed: situs address "${situsAddr}" matches "${requestedStreet}".`);
        verifiedPropDetail = verifyDetail; // cache for Step 3
      }
    }
  }

  // ── Step 3: Fetch property details from TrueAutomation ────────────────────
  let propDetail: TrueAutoPropDetail | null = verifiedPropDetail; // reuse if already fetched
  if (!propDetail && cadConfig && propId) {
    propDetail = await trueAutoFetchDetail(cadConfig.cid, propId, steps);
  }

  // ── Step 4: Build output URLs ──────────────────────────────────────────────
  // source_url   → TrueAutomation direct property record
  // cad_property_url → CAD esearch direct property view (preferred for Bell County)
  // deed_search_url  → county clerk publicsearch.us with property ID pre-filled
  // For counties with an eSearch portal (e.g. Bell CAD), prefer that over TrueAutomation
  // because the raw TrueAutomation base URL (no prop_id) returns a 504 Gateway Timeout.
  const esearchFallback = ESEARCH_BY_COUNTY[countyKey];
  const sourceUrl = cadConfig && propId
    ? `https://propaccess.trueautomation.com/clientdb/?cid=${cadConfig.cid}&prop_id=${encodeURIComponent(propId)}`
    : esearchFallback
      ? `${esearchFallback.baseUrl}/`
      : cadConfig
        ? `https://propaccess.trueautomation.com/clientdb/?cid=${cadConfig.cid}`
        : undefined;

  const cadPropertyUrl = propId ? buildCadPropertyUrl(countyKey, propId, cadConfig) : undefined;
  const deedSearchUrl  = propId
    ? buildDeedSearchUrl(countyKey, propId)
    : (req.address ? buildDeedSearchUrlByAddress(countyKey, req.address) : undefined);

  if (cadPropertyUrl) steps.push(`CAD property URL: ${cadPropertyUrl}`);
  if (deedSearchUrl)  steps.push(`Deed search URL (county clerk): ${deedSearchUrl}`);

  const sourceName = cadConfig?.name ?? 'Texas County Appraisal District';

  // ── Step 5: Extract legal description ─────────────────────────────────────
  let legalDesc = propDetail?.legal_desc ? String(propDetail.legal_desc) : undefined;

  // If TrueAutomation didn't return a legal description, try ATTOM and Regrid directly.
  // These APIs return the legal description directly from their property records.
  if (!legalDesc && process.env.ATTOM_API_KEY && req.address) {
    steps.push('TrueAutomation had no legal description — trying ATTOM Data API…');
    const { legalDesc: attomLegal } = await searchAttomData(req, steps);
    if (attomLegal) { legalDesc = attomLegal; steps.push('Legal description obtained from ATTOM Data.'); }
  }
  if (!legalDesc && process.env.REGRID_TOKEN && req.address) {
    steps.push('Trying Regrid Parcel API for legal description…');
    const { legalDesc: regridLegal } = await searchRegridApi(req, steps);
    if (regridLegal) { legalDesc = regridLegal; steps.push('Legal description obtained from Regrid.'); }
  }

  // ── Step 5b: Fetch eSearch property view HTML for richer legal description ──
  // The TrueAutomation JSON API often returns abbreviated lot/block descriptions.
  // The eSearch property view HTML page shows the CAD's full text including the
  // plat Cabinet/Slide recording reference needed to look up the subdivision plat.
  if (propId) {
    const esearchConf = ESEARCH_BY_COUNTY[countyKey];
    if (esearchConf) {
      const hasMetesAndBounds = !!legalDesc &&
        (/\bthence\b/i.test(legalDesc) || /[NS]\s*\d+[°\s]/i.test(legalDesc));
      if (!legalDesc || !hasMetesAndBounds) {
        const year = new Date().getFullYear();
        const viewUrl = `${esearchConf.baseUrl}/Property/View/${encodeURIComponent(propId)}?year=${year}`;
        steps.push(`[Step 5b] Fetching property view HTML: ${viewUrl}`);
        try {
          const viewRes = await fetchWithTimeout(viewUrl, {
            headers: { ...makeFetchHeaders(), Accept: 'text/html' },
          });
          if (viewRes.ok) {
            const html = await viewRes.text();
            // Extract text from HTML — preserve some structure by converting
            // common block elements to newlines (dl/dt/dd structure is important
            // for Bell CAD eSearch which uses definition lists for property data)
            const pageText = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<\/?(dt|dd|th|td|tr|li|p|div|section|h[1-6])\b[^>]*>/gi, ' \n')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
              .replace(/[ \t]+/g, ' ')
              .replace(/\n{3,}/g, '\n\n')
              .trim();

            if (pageText.length > 200) {
              // Patterns for "Legal Description" section on Bell CAD eSearch property detail pages.
              // Bell CAD eSearch (Tyler Technologies ASP.NET MVC) uses a dl/dt/dd structure:
              //   <dt>Legal Description</dt><dd>LT 1 BLK 1 BELTON HEIGHTS AMENDED 2ND ADDITION CAB A SLD 45 PLAT RECORDS</dd>
              // After HTML stripping this becomes: "Legal Description LT 1 BLK 1 ..."
              const ldPatterns = [
                // Pattern 1: "Legal Description" label followed by content, stopping at next known field
                /[Ll]egal\s+[Dd]esc(?:ription)?\s*([A-Z0-9][A-Z0-9\s,./#()\-]{9,2000}?)(?=\s{2,}|\b(?:OWNER|SITUS|MARKET VALUE|DEED\s+VOL|GEO\s+ID|YEAR\s+BUILT|LAND\s+USE|EXEMPTION|STATE\s+CODE|TOTAL\s+VALUE|APPRAISED|TAXABLE)\b)/i,
                // Pattern 2: colon-separated
                /[Ll]egal\s+[Dd]esc(?:ription)?\s*:\s*(.{10,2000}?)(?=\s{2,}|\b(?:OWNER|SITUS|MARKET|DEED\s+VOL)\b)/i,
                // Pattern 3: generous fallback — take anything after the label up to a double newline
                /[Ll]egal\s+[Dd]esc(?:ription)?[\s:]+(.{10,})/i,
              ];
              for (const pat of ldPatterns) {
                const m = pageText.match(pat);
                const mCapture = m?.[1]?.trim();
                if (mCapture && mCapture.length > 20) {
                  const extracted = mCapture;
                  if (!legalDesc || extracted.length > legalDesc.length) {
                    legalDesc = extracted;
                    steps.push(`[Step 5b] Legal description from eSearch HTML (${legalDesc.length} chars): "${legalDesc.substring(0, 120)}${legalDesc.length > 120 ? '…' : ''}"`);
                  }
                  break;
                }
              }

              // If still no legal desc, store the full page text so the AI can find what it needs
              if (!legalDesc && pageText.length > 300) {
                legalDesc = pageText.substring(0, 6000);
                steps.push(`[Step 5b] Using eSearch page text (${pageText.length} chars) as legal description source`);
              }

              // Also try to extract deed reference and other key fields from the page
              if (propDetail) {
                if (!propDetail.deed_vol) {
                  const deedVolMatch = pageText.match(/[Dd]eed\s+[Vv]ol(?:ume)?\s*[:\s]+(\w+)[^\n]{0,40}?[Dd]eed\s+[Pp](?:age|g)\.?\s*[:\s]+(\w+)/);
                  if (deedVolMatch) {
                    (propDetail as Record<string, unknown>).deed_vol = deedVolMatch[1];
                    (propDetail as Record<string, unknown>).deed_pg  = deedVolMatch[2];
                    steps.push(`[Step 5b] Deed reference from eSearch HTML: Vol. ${deedVolMatch[1]}, Pg. ${deedVolMatch[2]}`);
                  }
                }
                // Also look for Cabinet/Slide plat reference in the legal desc text
                if (legalDesc) {
                  const cabMatch = legalDesc.match(/[Cc]ab(?:inet)?\.?\s*([A-Z0-9]+)[,\s]+[Ss]l(?:i(?:de)?)?\.?\s*([0-9A-Z]+)/);
                  if (cabMatch) {
                    (propDetail as Record<string, unknown>).plat_cabinet = cabMatch[1];
                    (propDetail as Record<string, unknown>).plat_slide   = cabMatch[2];
                    steps.push(`[Step 5b] Plat reference from legal desc: Cabinet ${cabMatch[1]}, Slide ${cabMatch[2]}`);
                  }
                }
                // Extract owner name if not already known
                if (!propDetail.owner_name) {
                  const ownerMatch = pageText.match(/[Oo]wner(?:\s+[Nn]ame)?\s*\n?\s*([A-Z][A-Z\s,.'&-]{2,80}?)(?=\n)/);
                  if (ownerMatch?.[1]?.trim()) {
                    (propDetail as Record<string, unknown>).owner_name = ownerMatch[1].trim();
                    steps.push(`[Step 5b] Owner from eSearch HTML: ${ownerMatch[1].trim()}`);
                  }
                }
                // Extract geo_id / GEO ID (Bell CAD uses this as an alternate parcel key)
                if (!propDetail.geo_id) {
                  const geoMatch = pageText.match(/[Gg]eo(?:\s+[Ii][Dd])?\s*\n?\s*([A-Z0-9][A-Z0-9-]{2,40}?)(?=\n|\s{2})/);
                  if (geoMatch?.[1]?.trim()) {
                    (propDetail as Record<string, unknown>).geo_id = geoMatch[1].trim();
                    steps.push(`[Step 5b] Geo ID from eSearch HTML: ${geoMatch[1].trim()}`);
                  }
                }
              }
            }
          } else {
            steps.push(`[Step 5b] eSearch view returned HTTP ${viewRes.status}`);
          }
        } catch (err) {
          steps.push(`[Step 5b] eSearch view fetch error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  if (!legalDesc) {
    if (propDetail) {
      steps.push('Property record found but no legal description text was returned.');
    } else if (propId) {
      steps.push('Could not retrieve property details from the appraisal district.');
    } else {
      steps.push('No property found. Provide a parcel ID, owner name, or a more specific address.');
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
      cad_property_url: cadPropertyUrl,
      deed_search_url: deedSearchUrl,
      geocoded_lat: geocodedOut.lat,
      geocoded_lon: geocodedOut.lon,
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

  const statedAcreage = acreage ?? (property as PropertyDetails).acreage;
  const closureCheck = calls.length >= 3 ? runClosureCheck(calls, statedAcreage) : undefined;
  if (closureCheck) {
    steps.push(
      `Closure check: ${closureCheck.quality.toUpperCase()} — ` +
      `error ${closureCheck.closure_error_ft ?? '?'} ft (${closureCheck.closure_precision ?? 'n/a'}) — ` +
      `computed area ${closureCheck.area_computed_acres ?? '?'} acres.`,
    );
  }

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
    stated_acreage: statedAcreage,
    closure_check: closureCheck,
    cad_property_url: cadPropertyUrl,
    deed_search_url: deedSearchUrl,
    geocoded_lat: geocodedOut.lat,
    geocoded_lon: geocodedOut.lon,
    error: calls.length === 0
      ? 'Legal description was found but no metes-and-bounds calls could be extracted.'
      : undefined,
    search_steps: steps,
  };
}
