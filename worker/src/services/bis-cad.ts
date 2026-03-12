// worker/src/services/bis-cad.ts — Stage 1: CAD Property Identification
// Layer 1A: HTTP with session cookie acquisition (fixes HTTP 415)
// Layer 1B: Playwright browser automation (tries all exact + partial variants)
// Layer 1C: Screenshot + Claude Vision OCR fallback
// Every result is validated against the original search address.

import type { PropertyIdResult, PropertyValidation, NormalizedAddress, AddressVariant, SearchDiagnostics, DeedHistoryEntry } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';
import { getGlobalAiTracker } from '../lib/ai-usage-tracker.js';
import { normalizeAddress } from './address-utils.js';

// ── BIS Consultants eSearch Configuration ──────────────────────────────────

interface BisConfig {
  baseUrl: string;
  name: string;
  /** BIS GIS viewer base URL — https://gis.bisclient.com/{county}cad/ */
  gisBaseUrl?: string;
  /**
   * Direct ArcGIS parcel layer query URLs (FeatureServer or MapServer).
   * When provided, searchBisGis queries these directly instead of probing
   * common service/layer combinations under gisBaseUrl.
   * First entry is primary; rest are fallbacks.
   */
  gisParcelLayerUrls?: string[];
}

// BIS Consultants eSearch — all known counties within 200-mile radius of Bell County
// organized in concentric rings from Belton, TX outward.
export const BIS_CONFIGS: Record<string, BisConfig> = {
  // ── Ring 0: Bell County ──────────────────────────────────────────
  bell:        { baseUrl: 'https://esearch.bellcad.org',          name: 'Bell CAD',            gisBaseUrl: 'https://gis.bisclient.com/bellcad/', gisParcelLayerUrls: [
    'https://utility.arcgis.com/usrsvcs/servers/6efa79e05bde4b98851880b45f63ea52/rest/services/BellCADWebService/FeatureServer/0',
  ] },
  // ── Ring 1: Adjacent to Bell (~0-30 mi) ──────────────────────────
  coryell:     { baseUrl: 'https://esearch.coryellcad.org',       name: 'Coryell CAD',         gisBaseUrl: 'https://gis.bisclient.com/coryellcad/' },
  mclennan:    { baseUrl: 'https://esearch.mclennancad.org',      name: 'McLennan CAD',        gisBaseUrl: 'https://gis.bisclient.com/mclennancad/' },
  falls:       { baseUrl: 'https://esearch.fallscad.net',         name: 'Falls CAD',           gisBaseUrl: 'https://gis.bisclient.com/fallscad/' },
  milam:       { baseUrl: 'https://esearch.milamcad.org',         name: 'Milam CAD',           gisBaseUrl: 'https://gis.bisclient.com/milamcad/' },
  williamson:  { baseUrl: 'https://esearch.wilcotx.gov',          name: 'Williamson CAD',      gisBaseUrl: 'https://gis.bisclient.com/wilcotx/' },
  burnet:      { baseUrl: 'https://esearch.burnet-cad.org',       name: 'Burnet CAD',          gisBaseUrl: 'https://gis.bisclient.com/burnetcad/' },
  lampasas:    { baseUrl: 'https://esearch.lampasascad.org',      name: 'Lampasas CAD',        gisBaseUrl: 'https://gis.bisclient.com/lampasascad/' },
  // ── Ring 2: (~30-60 mi) ──────────────────────────────────────────
  hamilton:    { baseUrl: 'https://esearch.hamiltoncad.org',      name: 'Hamilton CAD',        gisBaseUrl: 'https://gis.bisclient.com/hamiltoncad/' },
  bosque:      { baseUrl: 'https://esearch.bosquecad.com', name: 'Bosque CAD' },
  hill:        { baseUrl: 'https://esearch.hillcad.org',          name: 'Hill CAD',            gisBaseUrl: 'https://gis.bisclient.com/hillcad/' },
  limestone:   { baseUrl: 'https://esearch.limestonecad.org',     name: 'Limestone CAD',       gisBaseUrl: 'https://gis.bisclient.com/limestonecad/' },
  robertson:   { baseUrl: 'https://esearch.robertsoncad.org', name: 'Robertson CAD' },
  lee:         { baseUrl: 'https://esearch.leecad.org', name: 'Lee CAD' },
  bastrop:     { baseUrl: 'https://esearch.bastropcad.org',       name: 'Bastrop CAD',         gisBaseUrl: 'https://gis.bisclient.com/bastropcad/' },
  san_saba:    { baseUrl: 'https://esearch.sansabacad.org', name: 'San Saba CAD' },
  mills:       { baseUrl: 'https://esearch.millscad.org', name: 'Mills CAD' },
  // ── Ring 3: (~60-100 mi) ─────────────────────────────────────────
  hays:        { baseUrl: 'https://esearch.hayscad.com',          name: 'Hays CAD',            gisBaseUrl: 'https://gis.bisclient.com/hayscad/' },
  guadalupe:   { baseUrl: 'https://esearch.guadalupead.org',      name: 'Guadalupe CAD',       gisBaseUrl: 'https://gis.bisclient.com/guadalupecad/' },
  caldwell:    { baseUrl: 'https://esearch.caldwellcad.org',      name: 'Caldwell CAD',        gisBaseUrl: 'https://gis.bisclient.com/caldwellcad/' },
  blanco:      { baseUrl: 'https://esearch.blancocad.org', name: 'Blanco CAD' },
  llano:       { baseUrl: 'https://esearch.llanocad.net', name: 'Llano CAD' },
  mason:       { baseUrl: 'https://esearch.masoncad.org', name: 'Mason CAD' },
  mcculloch:   { baseUrl: 'https://esearch.mccullochcad.org', name: 'McCulloch CAD' },
  brown:       { baseUrl: 'https://esearch.browncad.org', name: 'Brown CAD' },
  comanche:    { baseUrl: 'https://esearch.comanchecad.org', name: 'Comanche CAD' },
  erath:       { baseUrl: 'https://esearch.erath-cad.com', name: 'Erath CAD' },
  somervell:   { baseUrl: 'https://esearch.somervellcad.net', name: 'Somervell CAD' },
  johnson:     { baseUrl: 'https://esearch.johnsoncad.com', name: 'Johnson CAD' },
  ellis:       { baseUrl: 'https://esearch.elliscad.com', name: 'Ellis CAD' },
  navarro:     { baseUrl: 'https://esearch.navarrocad.com', name: 'Navarro CAD' },
  freestone:   { baseUrl: 'https://esearch.freestonecad.org', name: 'Freestone CAD' },
  leon:        { baseUrl: 'https://esearch.leoncad.org', name: 'Leon CAD' },
  madison:     { baseUrl: 'https://esearch.madisoncad.org', name: 'Madison CAD' },
  brazos:      { baseUrl: 'https://esearch.brazoscad.org',        name: 'Brazos CAD',          gisBaseUrl: 'https://gis.bisclient.com/brazoscad/' },
  burleson:    { baseUrl: 'https://esearch.burlesoncad.org', name: 'Burleson CAD' },
  washington:  { baseUrl: 'https://esearch.washingtoncad.org', name: 'Washington CAD' },
  fayette:     { baseUrl: 'https://esearch.fayettecad.org', name: 'Fayette CAD' },
  gonzales:    { baseUrl: 'https://esearch.gonzalescad.org', name: 'Gonzales CAD' },
  comal:       { baseUrl: 'https://esearch.comalcad.org',         name: 'Comal CAD',           gisBaseUrl: 'https://gis.bisclient.com/comalcad/' },
  // ── Ring 4: (~100-140 mi) ────────────────────────────────────────
  hood:        { baseUrl: 'https://esearch.hoodcad.org', name: 'Hood CAD' },
  palo_pinto:  { baseUrl: 'https://esearch.palopintocad.org', name: 'Palo Pinto CAD' },
  eastland:    { baseUrl: 'https://esearch.eastlandcad.com', name: 'Eastland CAD' },
  stephens:    { baseUrl: 'https://esearch.stephenscad.com', name: 'Stephens CAD' },
  coleman:     { baseUrl: 'https://esearch.colemancad.org', name: 'Coleman CAD' },
  callahan:    { baseUrl: 'https://esearch.callahancad.org', name: 'Callahan CAD' },
  concho:      { baseUrl: 'https://esearch.conchocad.org', name: 'Concho CAD' },
  menard:      { baseUrl: 'https://esearch.menardcad.org', name: 'Menard CAD' },
  kimble:      { baseUrl: 'https://esearch.kimblecad.org', name: 'Kimble CAD' },
  gillespie:   { baseUrl: 'https://esearch.gillespiecad.org', name: 'Gillespie CAD' },
  kerr:        { baseUrl: 'https://esearch.kerrcad.org', name: 'Kerr CAD' },
  kendall:     { baseUrl: 'https://esearch.kendallcad.org', name: 'Kendall CAD' },
  bandera:     { baseUrl: 'https://esearch.banderacad.org', name: 'Bandera CAD' },
  bexar:       { baseUrl: 'https://esearch.bcad.org', name: 'Bexar CAD' },
  medina:      { baseUrl: 'https://esearch.medinacad.org', name: 'Medina CAD' },
  wilson:      { baseUrl: 'https://esearch.wilson-cad.org', name: 'Wilson CAD' },
  lavaca:      { baseUrl: 'https://esearch.lavacacad.com', name: 'Lavaca CAD' },
  colorado:    { baseUrl: 'https://esearch.coloradocad.org', name: 'Colorado CAD' },
  austin:      { baseUrl: 'https://esearch.austincad.org', name: 'Austin County CAD' },
  waller:      { baseUrl: 'https://esearch.waller-cad.org', name: 'Waller CAD' },
  grimes:      { baseUrl: 'https://esearch.grimescad.org', name: 'Grimes CAD' },
  walker:      { baseUrl: 'https://esearch.walkercad.org', name: 'Walker CAD' },
  houston:     { baseUrl: 'https://esearch.houstoncad.org', name: 'Houston County CAD' },
  anderson:    { baseUrl: 'https://esearch.andersoncad.org', name: 'Anderson CAD' },
  henderson:   { baseUrl: 'https://esearch.henderson-cad.org', name: 'Henderson CAD' },
  kaufman:     { baseUrl: 'https://esearch.kaufman-cad.org', name: 'Kaufman CAD' },
  // ── Ring 5: (~140-175 mi) ────────────────────────────────────────
  parker:      { baseUrl: 'https://esearch.parkercad.org', name: 'Parker CAD' },
  wise:        { baseUrl: 'https://esearch.wise-cad.com', name: 'Wise CAD' },
  collin:      { baseUrl: 'https://esearch.collincad.org', name: 'Collin CAD' },
  hunt:        { baseUrl: 'https://esearch.hunt-cad.org', name: 'Hunt CAD' },
  van_zandt:   { baseUrl: 'https://esearch.vanzandtcad.org', name: 'Van Zandt CAD' },
  taylor:      { baseUrl: 'https://esearch.taylor-cad.org', name: 'Taylor CAD' },
  runnels:     { baseUrl: 'https://esearch.runnelscad.org', name: 'Runnels CAD' },
  nolan:       { baseUrl: 'https://esearch.nolancad.org', name: 'Nolan CAD' },
  coke:        { baseUrl: 'https://esearch.cokecad.org', name: 'Coke CAD' },
  tom_green:   { baseUrl: 'https://esearch.tomgreencad.org', name: 'Tom Green CAD' },
  real:        { baseUrl: 'https://esearch.realcad.org', name: 'Real CAD' },
  edwards:     { baseUrl: 'https://esearch.edwardscad.org', name: 'Edwards CAD' },
  atascosa:    { baseUrl: 'https://esearch.atascosacad.com', name: 'Atascosa CAD' },
  karnes:      { baseUrl: 'https://esearch.karnescad.org', name: 'Karnes CAD' },
  dewitt:      { baseUrl: 'https://esearch.dewittcad.org', name: 'DeWitt CAD' },
  victoria:    { baseUrl: 'https://esearch.victoriacad.org', name: 'Victoria CAD' },
  montgomery:  { baseUrl: 'https://esearch.mcad-tx.org', name: 'Montgomery CAD' },
  liberty:     { baseUrl: 'https://esearch.libertycad.com', name: 'Liberty CAD' },
  fort_bend:   { baseUrl: 'https://esearch.fbcad.org', name: 'Fort Bend CAD' },
  brazoria:    { baseUrl: 'https://esearch.brazoriacad.org', name: 'Brazoria CAD' },
  galveston:   { baseUrl: 'https://esearch.galvestoncad.org', name: 'Galveston CAD' },
  // ── Ring 6: (~175-200 mi) ────────────────────────────────────────
  jack:        { baseUrl: 'https://esearch.jackcad.org', name: 'Jack CAD' },
  young:       { baseUrl: 'https://esearch.youngcad.org', name: 'Young CAD' },
  shackelford: { baseUrl: 'https://esearch.shackelfordcad.org', name: 'Shackelford CAD' },
  jones:       { baseUrl: 'https://esearch.jonescad.org', name: 'Jones CAD' },
  grayson:     { baseUrl: 'https://esearch.graysonappraisal.org', name: 'Grayson CAD' },
  uvalde:      { baseUrl: 'https://esearch.uvaldecad.org', name: 'Uvalde CAD' },
  goliad:      { baseUrl: 'https://esearch.goliadcad.org', name: 'Goliad CAD' },
  matagorda:   { baseUrl: 'https://esearch.matagorda-cad.org', name: 'Matagorda CAD' },
  calhoun:     { baseUrl: 'https://esearch.calhouncad.org', name: 'Calhoun CAD' },
  jackson:     { baseUrl: 'https://esearch.jacksoncad.org', name: 'Jackson CAD' },
  wharton:     { baseUrl: 'https://esearch.whartoncad.org', name: 'Wharton CAD' },
  san_jacinto: { baseUrl: 'https://esearch.sanjacintocad.org', name: 'San Jacinto CAD' },
  trinity:     { baseUrl: 'https://esearch.trinitycad.org', name: 'Trinity CAD' },
  angelina:    { baseUrl: 'https://esearch.angelinacad.org', name: 'Angelina CAD' },
  nacogdoches: { baseUrl: 'https://esearch.nacocad.org', name: 'Nacogdoches CAD' },
  cherokee:    { baseUrl: 'https://esearch.cherokeecad.org', name: 'Cherokee CAD' },
  smith:       { baseUrl: 'https://esearch.smithcad.org', name: 'Smith CAD' },
};

// ── Types ──────────────────────────────────────────────────────────────────

interface CadSearchResult {
  propertyId?: string;
  PropertyId?: string;
  ownerName?: string;
  OwnerName?: string;
  legalDescription?: string;
  LegalDescription?: string;
  geoId?: string;
  GeoId?: string;
  address?: string;
  Address?: string;
  isUDI?: boolean;
  IsUDI?: boolean;
  acreage?: number;
  Acreage?: number;
  propertyType?: string;
  PropertyType?: string;
  situsAddress?: string;
  SitusAddress?: string;
  ownerId?: string;
  OwnerId?: string;
  mapId?: string;
  MapId?: string;
  year?: string;
  Year?: string;
}

function getProp(result: CadSearchResult, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = (result as Record<string, unknown>)[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return null;
}

function getNumProp(result: CadSearchResult, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = (result as Record<string, unknown>)[key];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace(/,/g, ''));
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

// ── Property Result Validation ─────────────────────────────────────────────

/**
 * Validate a CAD result against the original search address.
 * Returns a confidence score and list of issues.
 */
function validatePropertyResult(
  result: CadSearchResult,
  inputAddress: NormalizedAddress,
  logger: PipelineLogger,
): PropertyValidation {
  const issues: string[] = [];

  const resultAddress = getProp(result, 'address', 'Address', 'situsAddress', 'SitusAddress') ?? '';
  const resultOwner = getProp(result, 'ownerName', 'OwnerName') ?? '';
  const resultAcreage = getNumProp(result, 'acreage', 'Acreage');

  // Street number match
  const inputNum = inputAddress.parsed.streetNumber;
  const resultHasNum = resultAddress.includes(inputNum);
  const streetNumberMatch = inputNum ? resultHasNum : true;
  if (!streetNumberMatch) {
    issues.push(`Street number mismatch: input "${inputNum}" not found in "${resultAddress}"`);
  }

  // Street name match (fuzzy — check if any key words overlap)
  const inputStreet = inputAddress.parsed.streetName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const resultStreet = resultAddress.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const inputWords = new Set(inputStreet.split(/\s+/).filter((w) => w.length > 1));
  const resultWords = new Set(resultStreet.split(/\s+/).filter((w) => w.length > 1));
  let wordOverlap = 0;
  for (const w of inputWords) {
    if (resultWords.has(w)) wordOverlap++;
  }
  const streetNameMatch = inputWords.size > 0 ? wordOverlap >= Math.ceil(inputWords.size * 0.5) : true;
  if (!streetNameMatch) {
    issues.push(`Street name mismatch: input "${inputAddress.parsed.streetName}" vs result "${resultAddress}"`);
  }

  // City match
  const inputCity = inputAddress.parsed.city?.toLowerCase();
  const resultHasCity = inputCity ? resultAddress.toLowerCase().includes(inputCity) : null;
  const cityMatch = resultHasCity;
  if (inputCity && !resultHasCity) {
    // Not necessarily an issue — CAD often omits city from situs address
  }

  // Acreage reasonableness
  let acreageReasonable: boolean | null = null;
  if (resultAcreage !== null) {
    acreageReasonable = resultAcreage > 0 && resultAcreage < 100_000;
    if (!acreageReasonable) {
      issues.push(`Acreage seems unreasonable: ${resultAcreage} acres`);
    }
  }

  // Owner name validity
  const ownerNameValid = resultOwner.length >= 2 && !resultOwner.match(/^[\d\s]+$/);
  if (!ownerNameValid && resultOwner) {
    issues.push(`Owner name appears invalid: "${resultOwner}"`);
  }

  // Compute overall confidence
  let confidence = 1.0;
  if (!streetNumberMatch) confidence -= 0.4;
  if (!streetNameMatch) confidence -= 0.35;
  if (inputCity && !resultHasCity) confidence -= 0.05;
  if (!ownerNameValid) confidence -= 0.1;
  if (acreageReasonable === false) confidence -= 0.1;
  confidence = Math.max(0, Math.min(1, confidence));

  if (issues.length > 0) {
    logger.info('Stage1-Validate', `Validation: confidence=${confidence.toFixed(2)}, issues: ${issues.join('; ')}`);
  }

  return {
    streetNumberMatch,
    streetNameMatch,
    cityMatch,
    acreageReasonable,
    ownerNameValid,
    multipleResults: false, // set by caller
    confidence,
    issues,
  };
}

// ── Error Classification ──────────────────────────────────────────────────

type ErrorCategory =
  | 'timeout'          // Network or server timeout
  | 'http_status'      // Non-2xx HTTP response
  | 'html_structure'   // HTML parsing failed or unexpected DOM structure
  | 'body_parsing'     // JSON/HTML body could not be parsed
  | 'session_token'    // Session token acquisition or validation failed
  | 'recaptcha'        // reCAPTCHA blocking the request
  | 'network'          // DNS, connection reset, SSL errors
  | 'ai_api'           // AI/Anthropic API error
  | 'runtime'          // Code-level error (null ref, type error, etc.)
  | 'unknown';

function classifyError(err: unknown): { category: ErrorCategory; detail: string } {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted'))
      return { category: 'timeout', detail: err.message };
    if (msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('fetch failed') || msg.includes('ssl') || msg.includes('certificate'))
      return { category: 'network', detail: err.message };
    if (msg.includes('credit') || msg.includes('billing') || msg.includes('rate_limit') || msg.includes('overloaded'))
      return { category: 'ai_api', detail: err.message };
    if (msg.includes('json') || msg.includes('unexpected token') || msg.includes('parse'))
      return { category: 'body_parsing', detail: err.message };
    if (msg.includes('null') || msg.includes('undefined') || msg.includes('cannot read'))
      return { category: 'runtime', detail: err.message };
    return { category: 'unknown', detail: err.message };
  }
  return { category: 'unknown', detail: String(err) };
}

// ── Layer 1A: HTTP with BIS eSearch API (GET-based keyword search) ────────

/**
 * BIS eSearch sites (2025+) use a GET-based search flow:
 *   1. GET /search/shouldUseRecaptcha → { shouldUseRecaptcha: bool }
 *   2. GET /search/requestSessionToken → { searchSessionToken: "..." }
 *   3. GET /search/result?keywords=StreetNumber:N StreetName:S&searchSessionToken=T
 *
 * The /search/result endpoint returns an HTML page with results rendered server-side.
 * We parse the HTML to extract property data.
 *
 * If reCAPTCHA is required, this path won't work — fall through to Playwright.
 */
async function searchCadHttp(
  baseUrl: string,
  variants: AddressVariant[],
  logger: PipelineLogger,
  diagnostics: SearchDiagnostics,
): Promise<CadSearchResult[] | null> {
  const exactVariants = variants.filter((v) => !v.isPartial).sort((a, b) => a.priority - b.priority);
  if (exactVariants.length === 0) return null;

  // Step 1: Check if reCAPTCHA is required (skip HTTP path entirely if so)
  const recaptchaTracker = logger.startAttempt({
    layer: 'Stage1A-Recaptcha',
    source: 'CAD-HTTP',
    method: 'recaptcha-check',
    input: baseUrl,
  });

  try {
    const recaptchaResp = await fetch(`${baseUrl}/search/shouldUseRecaptcha`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (recaptchaResp.ok) {
      const recaptchaData = await recaptchaResp.json() as { shouldUseRecaptcha?: boolean };
      if (recaptchaData.shouldUseRecaptcha === true) {
        recaptchaTracker({ status: 'fail', error: 'reCAPTCHA required — HTTP path cannot solve captcha', nextLayer: 'Stage1B' });
        logger.warn('Stage1A', 'BIS site requires reCAPTCHA Enterprise — skipping HTTP path, falling through to Playwright');
        return null;
      }
      recaptchaTracker({ status: 'success', details: 'reCAPTCHA NOT required — proceeding with HTTP' });
    } else {
      recaptchaTracker.step(`reCAPTCHA check returned HTTP ${recaptchaResp.status} — assuming not required`);
      recaptchaTracker({ status: 'partial', details: `HTTP ${recaptchaResp.status} — proceeding anyway` });
    }
  } catch (err) {
    const { category, detail } = classifyError(err);
    recaptchaTracker({ status: 'fail', error: `[${category}] ${detail}` });
    // If we can't even reach the server, no point trying variants
    if (category === 'network' || category === 'timeout') {
      logger.warn('Stage1A', `Cannot reach ${baseUrl} — [${category}] ${detail}`);
      return null;
    }
  }

  // Step 2: Acquire session token
  let sessionToken: string | null = null;
  let sessionCookies: string | null = null;

  const tokenTracker = logger.startAttempt({
    layer: 'Stage1A-Token',
    source: 'CAD-HTTP',
    method: 'session-token',
    input: baseUrl,
  });

  try {
    // First load homepage to acquire cookies
    tokenTracker.step('Loading homepage for session cookies');
    const pageResponse = await fetch(baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });

    if (pageResponse.ok) {
      const setCookie = pageResponse.headers.get('set-cookie');
      if (setCookie) {
        sessionCookies = setCookie
          .split(',')
          .map((c) => c.split(';')[0].trim())
          .filter((c) => c.includes('='))
          .join('; ');
        tokenTracker.step(`Acquired cookies: ${sessionCookies.substring(0, 80)}...`);
      }
    } else {
      tokenTracker.step(`Homepage returned HTTP ${pageResponse.status}`);
    }

    // Request session token
    tokenTracker.step('Requesting search session token');
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${baseUrl}/`,
    };
    if (sessionCookies) headers['Cookie'] = sessionCookies;

    const tokenResp = await fetch(`${baseUrl}/search/requestSessionToken`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });

    if (tokenResp.ok) {
      const tokenData = await tokenResp.json() as { searchSessionToken?: string };
      sessionToken = tokenData.searchSessionToken ?? null;
      if (sessionToken) {
        tokenTracker.step(`Got session token: ${sessionToken.substring(0, 30)}...`);
        tokenTracker({ status: 'success', details: 'Session token acquired' });
      } else {
        tokenTracker({ status: 'fail', error: '[body_parsing] Token response missing searchSessionToken field' });
      }
    } else {
      tokenTracker({ status: 'fail', error: `[http_status] Token endpoint returned HTTP ${tokenResp.status}` });
    }
  } catch (err) {
    const { category, detail } = classifyError(err);
    tokenTracker({ status: 'fail', error: `[${category}] ${detail}` });
  }

  if (!sessionToken) {
    logger.warn('Stage1A', 'Failed to acquire session token — cannot perform HTTP search');
    return null;
  }

  // Step 3: Try each variant with GET /search/result?keywords=...&searchSessionToken=...
  for (const variant of exactVariants) {
    const tracker = logger.startAttempt({
      layer: 'Stage1A',
      source: 'CAD-HTTP',
      method: 'GET-keyword-search',
      input: `${variant.streetNumber} ${variant.streetName} (${variant.format})`,
    });

    try {
      // Build keyword string in BIS format: StreetNumber:N StreetName:S PropertyType:Real
      // PropertyType:Real filters out Personal/Mineral/Auto records at the API level,
      // preventing the pipeline from picking business personal property records
      // (e.g., ID 498826 "STARR SURVEYING" business equipment) over real land records.
      const namePart = variant.streetName.includes(' ')
        ? `StreetName:"${variant.streetName}"`
        : `StreetName:${variant.streetName}`;
      const keywords = `StreetNumber:${variant.streetNumber} ${namePart} PropertyType:Real`;
      const encodedKeywords = encodeURIComponent(keywords);
      const encodedToken = encodeURIComponent(sessionToken);
      // The search results endpoint is /search/result — the same URL the browser
      // navigates to after form submission. /search/SearchResults was a legacy AJAX
      // path that now returns the search home page instead of results.
      const url = `${baseUrl}/search/result?keywords=${encodedKeywords}&searchSessionToken=${encodedToken}`;

      tracker.step(`GET ${url.substring(0, 120)}...`);

      // Accept JSON or HTML (the /search/result endpoint may return either).
      // Do NOT include Content-Type on a GET request — BIS returns HTTP 415 if it's present.
      // Do NOT send X-Requested-With — /search/result is a full-page response, not an AJAX endpoint.
      const headers: Record<string, string> = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': `${baseUrl}/`,
      };
      if (sessionCookies) headers['Cookie'] = sessionCookies;

      const response = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });

      tracker.step(`Response: HTTP ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const isTokenError = body.includes('token validation') || body.includes('forbidden');
        const isRecaptcha = body.includes('recaptcha') || body.includes('captcha');
        const category: ErrorCategory = isTokenError ? 'session_token' : isRecaptcha ? 'recaptcha' : 'http_status';
        tracker.step(`[${category}] Response body (first 200 chars): ${body.substring(0, 200)}`);
        tracker({ status: 'fail', error: `[${category}] HTTP ${response.status}: ${body.substring(0, 100)}`, nextLayer: 'Stage1B' });
        diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });

        // If token validation failed, don't try more variants — token is bad
        if (isTokenError) {
          logger.warn('Stage1A', 'Session token rejected — stopping HTTP attempts');
          break;
        }
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      tracker.step(`Content-Type: ${contentType}`);

      // Try JSON first — some BIS deployments return structured JSON from /search/result.
      if (contentType.includes('json')) {
        const data = await response.json() as
          | { resultsList?: CadSearchResult[]; results?: CadSearchResult[]; data?: CadSearchResult[] }
          | CadSearchResult[];
        const results = Array.isArray(data)
          ? data
          : (data.resultsList ?? data.results ?? data.data ?? []);
        tracker.step(`[body_parsing] Parsed JSON: ${results.length} results`);

        diagnostics.variantsTried.push({
          variant,
          resultCount: results.length,
          hitPropertyId: results.length > 0 ? getProp(results[0], 'propertyId', 'PropertyId') : null,
        });

        if (results.length > 0) {
          tracker({ status: 'success', dataPointsFound: results.length, details: `${results.length} JSON results` });
          return results;
        }
        tracker({ status: 'fail', error: '[body_parsing] JSON response contained 0 results' });
        continue;
      }

      // Parse HTML results page
      if (contentType.includes('html')) {
        const html = await response.text();
        tracker.step(`[html_structure] Received ${html.length} chars of HTML`);

        // Detect transient server-side data outages BEFORE parsing results.
        // BIS eSearch returns HTTP 200 with an error message (not an HTTP error code)
        // when its backend data source is temporarily unavailable.  Without this check
        // the pipeline interprets the page as "no results" and burns through all
        // remaining variants needlessly.
        const transientError = /temporary\s+data\s+access\s+issue|experiencing\s+a\s+delay\s+accessing\s+third[- ]party\s+data|please\s+wait.*try\s+again/i.test(html);
        if (transientError) {
          tracker.step('[html_structure] Detected transient data access outage — server data unavailable');
          tracker({ status: 'fail', error: '[html_structure] CAD backend data temporarily unavailable — aborting remaining variants' });
          diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });
          diagnostics.cadSiteError = 'The county appraisal website is experiencing a temporary data access issue. The search could not be completed — results may exist but the database was unavailable.';
          // Stop trying more variants — the issue is server-side, not address-related.
          logger.warn('Stage1A', 'CAD backend reporting temporary data access issue — stopping HTTP search (will retry in Stage1B)');
          break;
        }

        const results = parseHtmlSearchResults(html, tracker);
        diagnostics.variantsTried.push({
          variant,
          resultCount: results.length,
          hitPropertyId: results.length > 0 ? getProp(results[0], 'propertyId', 'PropertyId') : null,
        });

        if (results.length > 0) {
          tracker({ status: 'success', dataPointsFound: results.length, details: `${results.length} results from HTML` });
          return results;
        }

        // Check for "no results" message
        const noResults = /no\s+results?\s+found|0\s+results|no\s+records?\s+found/i.test(html);
        tracker.step(noResults ? '[html_structure] Page says "no results"' : '[html_structure] No results found in HTML and no "no results" message');
        tracker({ status: 'fail', error: noResults ? 'No results (server confirmed)' : '[html_structure] Could not extract results from HTML' });
        continue;
      }

      // Unexpected content type
      tracker({ status: 'fail', error: `[body_parsing] Unexpected content-type: ${contentType}` });
      diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });

    } catch (err) {
      const { category, detail } = classifyError(err);
      tracker({ status: 'fail', error: `[${category}] ${detail}`, nextLayer: 'Stage1B' });
      diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });

      // Network/timeout errors won't resolve with different variants.
      // Mark the site as unreachable so the pipeline can log this clearly
      // and continue with alternative sources (clerk, plat repo, etc.).
      if (category === 'network' || category === 'timeout') {
        logger.warn('Stage1A', `[${category}] ${detail} — site unreachable, stopping HTTP attempts`);
        diagnostics.cadSiteError = `The county appraisal website appears to be unreachable (${category}): ${detail}`;
        diagnostics.siteUnreachable = true;
        break;
      }
    }
  }

  return null;
}

/**
 * Parse BIS eSearch HTML results page to extract property records.
 * The results page renders a table with property rows.
 */
function parseHtmlSearchResults(
  html: string,
  tracker: { step: (msg: string) => void },
): CadSearchResult[] {
  const results: CadSearchResult[] = [];

  // Strategy 0: BIS eSearch 2024+ — rows use onclick="redirectToPropertyDetails(...)" with
  // class-named cells instead of anchor hrefs. Capture groups:
  //   [1] propertyId  [2] year  [3] ownerId  [4] inner row HTML
  const onclickPattern = /<tr[^>]*onclick=["']redirectToPropertyDetails\s*\(\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'[^)]*\)["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let onclickMatch;
  while ((onclickMatch = onclickPattern.exec(html)) !== null) {
    const propertyId = onclickMatch[1];
    const year = onclickMatch[2];
    const ownerId = onclickMatch[3];
    const rowHtml = onclickMatch[4];

    const getCell = (cls: string): string | null => {
      const m = new RegExp(`<td[^>]*class=["'][^"']*${cls}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, 'i').exec(rowHtml);
      return m ? m[1].replace(/<[^>]*>/g, '').trim() || null : null;
    };

    results.push({
      propertyId,
      year,
      ownerId,
      propertyType: getCell('_propertyType'),
      ownerName: getCell('_ownerName'),
      geoId: getCell('_geoId'),
      address: getCell('_address'),
      legalDescription: getCell('_legalDescription'),
    } as CadSearchResult);
  }

  if (results.length > 0) {
    tracker.step(`[html_structure] Strategy 0: Found ${results.length} rows via redirectToPropertyDetails onclick`);
    return results;
  }

  // Strategy 1: Find table rows with property links
  // BIS results pages use <tr> elements with <a href="/Property/View?Id=XXXX">
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const linkPattern = /\/Property\/View\?(?:Id|id)=([^"&\s]+)/i;

  let rowMatch;
  let rowCount = 0;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    rowCount++;
    const rowHtml = rowMatch[1];
    const linkMatch = linkPattern.exec(rowHtml);
    if (!linkMatch) continue;

    const propertyId = linkMatch[1];

    // Extract cell contents
    const cells: string[] = [];
    let cellMatch;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    results.push({
      propertyId,
      ownerName: cells[1] ?? null,
      address: cells[2] ?? null,
      legalDescription: cells[3] ?? null,
    } as CadSearchResult);
  }

  tracker.step(`[html_structure] Strategy 1: Scanned ${rowCount} <tr> elements, found ${results.length} with property links`);

  // Strategy 2: Broader link-based extraction if table parsing found nothing
  if (results.length === 0) {
    const allLinks = html.matchAll(/\/Property\/View\?(?:Id|id)=([^"&\s]+)/gi);
    const seenIds = new Set<string>();
    for (const m of allLinks) {
      if (!seenIds.has(m[1])) {
        seenIds.add(m[1]);
        results.push({ propertyId: m[1] } as CadSearchResult);
      }
    }
    tracker.step(`[html_structure] Strategy 2: Fallback link scan found ${results.length} unique property IDs`);
  }

  return results;
}

// ── Layer 1B: Playwright Browser Automation ────────────────────────────────

async function searchCadPlaywright(
  baseUrl: string,
  variants: AddressVariant[],
  inputAddress: NormalizedAddress,
  logger: PipelineLogger,
  diagnostics: SearchDiagnostics,
  options?: { ownerName?: string; propertyId?: string; ownerId?: string },
): Promise<{ results: CadSearchResult[]; screenshot: Buffer | null; validation: PropertyValidation | null }> {
  // Sort: exact variants first, then partials
  const sortedVariants = [...variants].sort((a, b) => {
    if (a.isPartial !== b.isPartial) return a.isPartial ? 1 : -1;
    return a.priority - b.priority;
  });

  const finish = logger.startAttempt({
    layer: 'Stage1B',
    source: 'CAD-Playwright',
    method: 'browser-automation',
    input: `${sortedVariants.length} variants (${sortedVariants.filter((v) => !v.isPartial).length} exact, ${sortedVariants.filter((v) => v.isPartial).length} partial)`,
  });

  let browser = null;
  let screenshot: Buffer | null = null;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15_000);

    // Navigate to the search page
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // "By Address" tab selectors — defined here so they can be reused when
    // navigating back to the search form between variants.
    const tabSelectors = [
      '#home-page-tabs a:has-text("Address")',
      '#home-page-tabs li:has-text("Address") a',
      'a[href*="address" i][data-bs-toggle="tab"]',
      'a[href*="address" i][data-toggle="tab"]',
      'a[data-bs-target*="address" i]',
      'a[data-target*="address" i]',
      'text=By Address',
      'a:has-text("By Address")',
      'a:has-text("Address")',
      '[data-tab="address"]',
      '.tab:has-text("Address")',
      'li:has-text("Address") a',
      '#searchType_address',
    ];

    // Helper: click the "By Address" tab on the current page (if present).
    const clickAddressTab = async () => {
      for (const sel of tabSelectors) {
        try {
          const tab = page.locator(sel).first();
          if (await tab.isVisible({ timeout: 2_000 })) {
            await tab.click();
            await page.waitForTimeout(800);
            return;
          }
        } catch { continue; }
      }
    };

    // Click "By Address" tab — BIS v2.0 uses Bootstrap tabs inside #home-page-tabs
    try { await clickAddressTab(); } catch { /* Tab might not exist */ }

    // Set up response interception for AJAX-based results (legacy BIS sites)
    // AND navigation interception for newer BIS sites that redirect to /search/result
    let capturedResults: CadSearchResult[] = [];
    let resolveCapture: ((results: CadSearchResult[]) => void) | null = null;

    page.on('response', async (response) => {
      try {
        const url = response.url();
        // Match both old (/SearchResults, /search/SearchResults) and new (/search/result) endpoints
        if (url.includes('SearchResults') || url.includes('searchresults') || url.includes('/search/result') || url.includes('/Search/')) {
          const ct = response.headers()['content-type'] ?? '';
          if (ct.includes('json')) {
            const data = await response.json() as { resultsList?: CadSearchResult[] } | CadSearchResult[];
            const results = Array.isArray(data) ? data : data.resultsList ?? [];
            if (results.length > 0) {
              capturedResults = results;
              finish.step?.(`[response_intercept] Captured ${results.length} JSON results from ${url.substring(0, 80)}`);
              if (resolveCapture) resolveCapture(results);
            }
          }
        }
      } catch { /* ignore */ }
    });

    // Identify the input fields
    const numFieldSelectors = [
      '#StreetNumber', '#txtStreetNumber',
      'input[name*="StreetNumber" i]', 'input[name*="streetnumber" i]',
      'input[id*="streetnum" i]', 'input[id*="StreetNumber" i]',
      'input[placeholder*="number" i]', 'input[placeholder*="Number" i]',
    ];
    const nameFieldSelectors = [
      '#StreetName', '#txtStreetName',
      'input[name*="StreetName" i]', 'input[name*="streetname" i]',
      'input[id*="streetname" i]', 'input[id*="StreetName" i]',
      'input[placeholder*="name" i]', 'input[placeholder*="Name" i]',
    ];
    // BIS v2.0 uses onclick="AdvancedSearch();" — include input[type="button"] and onclick selectors
    const searchBtnSelectors = [
      'input[type="button"][value*="Search" i]',
      'button:has-text("Search")', 'input[type="submit"][value*="Search" i]',
      'button[type="submit"]', '.search-btn', '#btnSearch',
      '[onclick*="AdvancedSearch"]', '[onclick*="Search()"]',
      'input[type="submit"]', 'a:has-text("Search")',
    ];

    // Try each variant
    for (const variant of sortedVariants) {
      capturedResults = []; // Reset for each attempt

      try {
        // If a previous variant navigated to results, go back to the search form
        // so the address fields are available to fill in.
        if (page.url().includes('/search/result') || !page.url().startsWith(baseUrl)) {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          try { await clickAddressTab(); } catch { /* ignore */ }
        }

        // Clear and fill fields, returning which selectors matched
        const fieldsFilled = await page.evaluate(
          ([num, name, numSels, nameSels]: [string, string, string[], string[]]) => {
            let numFilled = false;
            let nameFilled = false;
            for (const sel of numSels) {
              const el = document.querySelector(sel) as HTMLInputElement | null;
              if (el) {
                el.value = '';
                el.value = num;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                numFilled = true;
                break;
              }
            }
            for (const sel of nameSels) {
              const el = document.querySelector(sel) as HTMLInputElement | null;
              if (el) {
                el.value = '';
                el.value = name;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.focus();
                nameFilled = true;
                break;
              }
            }
            return { numFilled, nameFilled };
          },
          [variant.streetNumber, variant.streetName, numFieldSelectors, nameFieldSelectors] as [string, string, string[], string[]],
        );

        if (!fieldsFilled.numFilled && !fieldsFilled.nameFilled) {
          // Neither field was found — page may not be showing the address tab yet; skip this variant
          finish.step?.('[runtime] Address fields not found in DOM — skipping variant');
          diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });
          continue;
        }

        if (!fieldsFilled.numFilled || !fieldsFilled.nameFilled) {
          finish.step?.(`[runtime] Field fill partial: numFilled=${fieldsFilled.numFilled}, nameFilled=${fieldsFilled.nameFilled}`);
        }

        // Set PropertyType dropdown to "Real" to exclude personal/mineral/auto/mobile-home records.
        // The BIS search form has a select2 #PropertyType dropdown. Setting the underlying
        // <select> value and dispatching a change event is the most reliable approach.
        await page.evaluate(() => {
          const sel = document.getElementById('PropertyType') as HTMLSelectElement | null;
          if (sel && sel.options.length > 0) {
            sel.value = 'Real';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }).catch(() => { /* non-fatal if element not present */ });

        // Click search button
        let searchClicked = false;
        for (const sel of searchBtnSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1_500 })) {
              await btn.click();
              searchClicked = true;
              finish.step?.(`[runtime] Search button clicked via selector: ${sel}`);
              break;
            }
          } catch { continue; }
        }

        if (!searchClicked) {
          // Try calling AdvancedSearch() / Search() directly (BIS v2.0 onclick="AdvancedSearch();")
          try {
            const called = await page.evaluate(() => {
              const w = window as unknown as Record<string, unknown>;
              if (typeof w.AdvancedSearch === 'function') {
                (w.AdvancedSearch as () => void)();
                return 'AdvancedSearch';
              }
              if (typeof w.Search === 'function') {
                (w.Search as () => void)();
                return 'Search';
              }
              return null;
            });
            if (called) {
              searchClicked = true;
              finish.step?.(`[runtime] Called window.${called}() via JavaScript`);
            }
          } catch { /* ignore */ }
        }

        if (!searchClicked) {
          // Last resort: name field was focused in evaluate above — press Enter
          finish.step?.(`[runtime] No search button found — pressing Enter (name field filled: ${fieldsFilled.nameFilled})`);
          await page.keyboard.press('Enter');
        }

        // Wait for AJAX response with timeout — fixes race condition where
        // capturedResults was checked before the response callback fired
        const capturePromise = new Promise<CadSearchResult[]>((resolve) => {
          resolveCapture = resolve;
          // If results already captured synchronously (unlikely but safe)
          if (capturedResults.length > 0) resolve(capturedResults);
        });

        // BIS eSearch 2025+ navigates to /search/result (window.location.href),
        // so we also need to watch for page navigation, not just AJAX responses.
        const navigationPromise = page.waitForURL('**/search/result**', { timeout: 15_000 })
          .then(() => {
            finish.step?.(`[runtime] Page navigated to results URL: ${page.url()}`);
            return 'navigated' as const;
          })
          .catch(() => 'no-navigation' as const);

        // Race between AJAX capture, page navigation, DOM element appearance, and timeout
        try {
          const raceResult = await Promise.race([
            capturePromise.then(() => 'ajax-captured' as const),
            navigationPromise,
            page.waitForSelector('table tbody tr, .search-results tr, .result-row, .property-result, .resultsList', { timeout: 15_000 }).then(() => 'dom-found' as const),
            page.waitForTimeout(15_000).then(() => 'timeout' as const),
          ]);
          finish.step?.(`[runtime] Search wait resolved via: ${raceResult}`);
        } catch { /* timeout or selector not found — continue */ }

        // After navigation to /search/result, explicitly wait for property result rows
        // to appear. BIS eSearch may render results asynchronously after navigation,
        // so we give the page up to 8 additional seconds to populate the results table.
        if (capturedResults.length === 0 && page.url().includes('/search/result')) {
          try {
            await page.waitForSelector(
              'tr[onclick*="redirectToPropertyDetails"], a[href*="/Property/View"], #ctl00_ContentPlaceHolder1_GridViewSearchResults tr',
              { timeout: 8_000 },
            );
            finish.step?.('[runtime] Result rows appeared after navigation settle');
          } catch {
            finish.step?.('[runtime] No result rows appeared within 8s of navigation');
          }
        }

        // Small settle delay for any late-arriving content
        await page.waitForTimeout(1000);
        resolveCapture = null;

        if (capturedResults.length > 0) {
          diagnostics.variantsTried.push({
            variant,
            resultCount: capturedResults.length,
            hitPropertyId: getProp(capturedResults[0], 'propertyId', 'PropertyId'),
          });

          if (variant.isPartial) {
            diagnostics.partialSearches.push({
              query: variant.query ?? `${variant.streetNumber} ${variant.streetName}`,
              resultCount: capturedResults.length,
            });
          }

          logger.info('Stage1B', `Variant "${variant.format}" found ${capturedResults.length} results via AJAX intercept`);
          break;
        }

        // If AJAX didn't capture, try DOM extraction (works for both old and new BIS sites)
        finish.step?.(`[html_structure] Attempting DOM extraction from current page: ${page.url()}`);
        const domResults = await extractResultsFromDOM(page);
        if (domResults.length > 0) {
          capturedResults = domResults;
          diagnostics.variantsTried.push({
            variant,
            resultCount: domResults.length,
            hitPropertyId: getProp(domResults[0], 'propertyId', 'PropertyId'),
          });
          logger.info('Stage1B', `Variant "${variant.format}" found ${domResults.length} results via DOM extraction`);
          break;
        }

        // Log current page state for debugging
        const pageState = await page.evaluate(() => {
          const body = document.body;
          const text = body?.textContent ?? '';
          return {
            url: window.location.href,
            title: document.title,
            bodyLength: text.length,
            hasTable: !!document.querySelector('table'),
            tableRowCount: document.querySelectorAll('table tbody tr').length,
            hasPropertyLinks: !!document.querySelector('a[href*="/Property/View"]'),
            propertyLinkCount: document.querySelectorAll('a[href*="/Property/View"]').length,
            noResultsVisible: /no\s+results?|0\s+results|no\s+records?\s+found/i.test(text),
            accessDenied: /access\s+denied|forbidden|token\s+validation/i.test(text),
            transientDataError: /temporary\s+data\s+access\s+issue|experiencing\s+a\s+delay\s+accessing\s+third[- ]?party\s+data/i.test(text),
          };
        });

        finish.step?.(`[html_structure] Page state: url=${pageState.url}, title="${pageState.title}", bodyLen=${pageState.bodyLength}, table=${pageState.hasTable}, rows=${pageState.tableRowCount}, propLinks=${pageState.propertyLinkCount}, noResults=${pageState.noResultsVisible}, denied=${pageState.accessDenied}`);

        diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });

        // Detect transient backend outage — stop wasting time on more variants
        if (pageState.transientDataError) {
          logger.warn('Stage1B', 'CAD backend reporting temporary data access issue — aborting Playwright search');
          diagnostics.cadSiteError = 'The county appraisal website is experiencing a temporary data access issue. The search could not be completed — results may exist but the database was unavailable.';
          break;
        }

        if (pageState.noResultsVisible && !variant.isPartial) {
          logger.info('Stage1B', `Variant "${variant.format}" returned "no results" — trying next`);
        } else if (pageState.accessDenied) {
          logger.warn('Stage1B', `[session_token] Variant "${variant.format}" got "access denied" — session/token may be invalid`);
        }

      } catch (err) {
        logger.warn('Stage1B', `Variant "${variant.format}" failed: ${err instanceof Error ? err.message : String(err)}`);
        diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });
      }
    }

    // Owner name fallback: if address variants found nothing, try By Owner tab
    if (capturedResults.length === 0 && options?.ownerName) {
      finish.step?.(`[runtime] Address search exhausted — trying owner name: "${options.ownerName}"`);
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const ownerTabSelectors = [
          '[data-filter="search-owner"]',
          'a[href*="search-owner"]',
          'text=By Owner',
          'a:has-text("By Owner")',
          'a:has-text("Owner")',
          '[data-tab="owner"]',
        ];
        for (const sel of ownerTabSelectors) {
          try {
            const tab = page.locator(sel).first();
            if (await tab.isVisible({ timeout: 2_000 })) {
              await tab.click();
              await page.waitForTimeout(800);
              break;
            }
          } catch { continue; }
        }

        const ownerFilled = await page.evaluate((name: string) => {
          const input = document.querySelector('#OwnerName') as HTMLInputElement | null
            ?? Array.from(document.querySelectorAll('input[type="text"]')).find((el) => {
              const id = (el as HTMLInputElement).id?.toLowerCase() ?? '';
              const nm = (el as HTMLInputElement).name?.toLowerCase() ?? '';
              const ph = (el as HTMLInputElement).placeholder?.toLowerCase() ?? '';
              return id.includes('owner') || nm.includes('owner') || ph.includes('owner') || ph.includes('last name');
            }) as HTMLInputElement | null;
          if (input) {
            input.value = name;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }, options.ownerName);

        if (ownerFilled) {
          // Click search or call AdvancedSearch()
          let clicked = false;
          for (const sel of searchBtnSelectors) {
            try {
              const btn = page.locator(sel).first();
              if (await btn.isVisible({ timeout: 1_500 })) {
                await btn.click();
                clicked = true;
                break;
              }
            } catch { continue; }
          }
          if (!clicked) {
            await page.evaluate(() => {
              const w = window as unknown as Record<string, unknown>;
              if (typeof w.AdvancedSearch === 'function') (w.AdvancedSearch as () => void)();
              else if (typeof w.Search === 'function') (w.Search as () => void)();
            }).catch(() => { /* ignore */ });
          }

          await Promise.race([
            page.waitForSelector('table tbody tr, .search-results tr, .resultsList', { timeout: 10_000 }).then(() => 'dom'),
            page.waitForURL('**/search/result**', { timeout: 10_000 }).then(() => 'nav'),
            page.waitForTimeout(10_000).then(() => 'timeout'),
          ]).catch(() => { /* ignore */ });
          await page.waitForTimeout(800);

          const ownerDomResults = await extractResultsFromDOM(page);
          if (ownerDomResults.length > 0) {
            capturedResults = ownerDomResults;
            finish.step?.(`[runtime] Owner name search found ${ownerDomResults.length} results`);
          }
        }
      } catch (ownerErr) {
        finish.step?.(`[runtime] Owner name search failed: ${ownerErr instanceof Error ? ownerErr.message : String(ownerErr)}`);
      }
    }

    // Property ID fallback: if still nothing, try By ID tab
    if (capturedResults.length === 0 && options?.propertyId) {
      finish.step?.(`[runtime] Trying property ID search: ${options.propertyId}`);
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const idTabSelectors = [
          '[data-filter="search-id"]',
          'a[href*="search-id"]',
          'text=By ID',
          'a:has-text("By ID")',
          '[data-tab="id"]',
        ];
        for (const sel of idTabSelectors) {
          try {
            const tab = page.locator(sel).first();
            if (await tab.isVisible({ timeout: 2_000 })) {
              await tab.click();
              await page.waitForTimeout(800);
              break;
            }
          } catch { continue; }
        }

        const idFilled = await page.evaluate((pid: string) => {
          const input = document.querySelector('#PropertyId') as HTMLInputElement | null
            ?? document.querySelector('input[name*="PropertyId" i]') as HTMLInputElement | null;
          if (input) {
            input.value = pid;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }, options.propertyId);

        if (idFilled) {
          let clicked = false;
          for (const sel of searchBtnSelectors) {
            try {
              const btn = page.locator(sel).first();
              if (await btn.isVisible({ timeout: 1_500 })) {
                await btn.click();
                clicked = true;
                break;
              }
            } catch { continue; }
          }
          if (!clicked) {
            await page.evaluate(() => {
              const w = window as unknown as Record<string, unknown>;
              if (typeof w.AdvancedSearch === 'function') (w.AdvancedSearch as () => void)();
              else if (typeof w.Search === 'function') (w.Search as () => void)();
            }).catch(() => { /* ignore */ });
          }

          await Promise.race([
            page.waitForSelector('table tbody tr, .search-results tr, .resultsList', { timeout: 10_000 }).then(() => 'dom'),
            page.waitForURL('**/search/result**', { timeout: 10_000 }).then(() => 'nav'),
            page.waitForTimeout(10_000).then(() => 'timeout'),
          ]).catch(() => { /* ignore */ });
          await page.waitForTimeout(800);

          const idDomResults = await extractResultsFromDOM(page);
          if (idDomResults.length > 0) {
            capturedResults = idDomResults;
            finish.step?.(`[runtime] Property ID search found ${idDomResults.length} results`);
          }
        }
      } catch (idErr) {
        finish.step?.(`[runtime] Property ID search failed: ${idErr instanceof Error ? idErr.message : String(idErr)}`);
      }
    }

    // Take screenshot for Vision OCR fallback
    try {
      screenshot = await page.screenshot({ fullPage: true }) as Buffer;
    } catch {
      logger.warn('Stage1B', 'Failed to take screenshot');
    }

    await browser.close();
    browser = null;

    // Validate best result
    let validation: PropertyValidation | null = null;
    if (capturedResults.length > 0) {
      const best = pickBestResult(capturedResults, inputAddress, logger);
      if (best) {
        validation = validatePropertyResult(best, inputAddress, logger);
        validation.multipleResults = capturedResults.length > 1;
      }

      finish({
        status: 'success',
        dataPointsFound: capturedResults.length,
        details: `${capturedResults.length} results, validation: ${validation?.confidence.toFixed(2) ?? 'N/A'}`,
      });
    } else {
      finish({ status: 'fail', error: `No results from ${sortedVariants.length} variants`, nextLayer: 'Stage1C' });
    }

    return { results: capturedResults, screenshot, validation };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const { category } = classifyError(err);

    // When the site is unreachable (network/timeout) or the browser launch itself
    // fails, mark the CAD as down and capture whatever screenshot we can.
    // The pipeline will continue with alternative sources (clerk, plat repo, etc.).
    if (category === 'network' || category === 'timeout') {
      diagnostics.cadSiteError =
        `The county appraisal website appears to be unreachable (${category}): ${errMsg}`;
      diagnostics.siteUnreachable = true;

      // Attempt to screenshot the browser's error page — useful for diagnostics
      // even when the target site is down (the browser renders a net error page).
      if (browser && !screenshot) {
        try {
          const errContext = await browser.newContext();
          const errPage = await errContext.newPage();
          await errPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 })
            .catch(() => { /* ignore navigation failure — page shows error */ });
          screenshot = await errPage.screenshot({ fullPage: true }) as Buffer;
          await errContext.close().catch(() => {});
        } catch {
          // Screenshot of the error page is optional — don't let it block progress
        }
      }
    }

    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    finish({ status: 'fail', error: errMsg, nextLayer: 'Stage1C' });
    return { results: [], screenshot, validation: null };
  }
}

// ── DOM Extraction Helper ──────────────────────────────────────────────────

async function extractResultsFromDOM(page: import('playwright').Page): Promise<CadSearchResult[]> {
  return page.evaluate(() => {
    const results: Array<Record<string, string | null>> = [];

    // Strategy 0: BIS eSearch 2024+ — rows use onclick="redirectToPropertyDetails(...)" with
    // class-named cells. Capture groups: [1] propertyId  [2] year  [3] ownerId
    const allRows = document.querySelectorAll('tr[onclick]');
    allRows.forEach((row) => {
      const onclick = row.getAttribute('onclick') ?? '';
      // Capture groups: [1] propertyId  [2] year  [3] ownerId
      const match = onclick.match(/redirectToPropertyDetails\s*\(\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/);
      if (!match) return;
      const propertyId = match[1];
      const year = match[2];
      const ownerId = match[3];

      const getClassCell = (cls: string): string | null => {
        const el = row.querySelector(`td.${cls}, td[class*="${cls}"]`) as HTMLElement | null;
        return el?.textContent?.trim() || null;
      };

      results.push({
        propertyId,
        year,
        ownerId,
        propertyType: getClassCell('_propertyType'),
        ownerName: getClassCell('_ownerName'),
        geoId: getClassCell('_geoId'),
        address: getClassCell('_address'),
        legalDescription: getClassCell('_legalDescription'),
      });
    });

    if (results.length > 0) return results as CadSearchResult[];

    // Strategy 1: Links to /Property/View?Id=... (most reliable across all BIS versions)
    const propertyLinks = document.querySelectorAll('a[href*="/Property/View"]');
    if (propertyLinks.length > 0) {
      const seenIds = new Set<string>();
      propertyLinks.forEach((link) => {
        const href = link.getAttribute('href') ?? '';
        const idMatch = href.match(/[?&](?:Id|id|ID)=([^&\s]+)/);
        if (!idMatch || seenIds.has(idMatch[1])) return;
        seenIds.add(idMatch[1]);

        // Walk up to find the table row or parent container
        const row = link.closest('tr') ?? link.closest('[class*="result"]') ?? link.parentElement;
        const cells = row ? Array.from(row.querySelectorAll('td')) : [];
        const text = row?.textContent?.trim() ?? link.textContent?.trim() ?? '';

        // Bell CAD uses class-named cells: ._propertyType, ._ownerName, ._address, ._legalDescription
        const typeCellByClass = row?.querySelector('td._propertyType, td[class*="_propertyType"]') as HTMLTableCellElement | null;
        const ownerCellByClass = row?.querySelector('td._ownerName, td[class*="_ownerName"]') as HTMLTableCellElement | null;
        const addrCellByClass = row?.querySelector('td._address, td[class*="_address"]') as HTMLTableCellElement | null;
        const legalCellByClass = row?.querySelector('td._legalDescription, td[class*="_legalDescription"]') as HTMLTableCellElement | null;

        results.push({
          propertyId: idMatch[1],
          propertyType: typeCellByClass?.textContent?.trim() ?? null,
          ownerName: ownerCellByClass?.textContent?.trim() ?? (cells.length > 1 ? cells[1]?.textContent?.trim() ?? null : null),
          address: addrCellByClass?.textContent?.trim() ?? (cells.length > 2 ? cells[2]?.textContent?.trim() ?? null : text.substring(0, 200)),
          legalDescription: legalCellByClass?.textContent?.trim() ?? (cells.length > 3 ? cells[3]?.textContent?.trim() ?? null : null),
        });
      });
    }

    // Strategy 2: Table rows that contain a recognised property ID link.
    // Only rows where a link with an explicit ID parameter is present are included —
    // this prevents navigation/toolbar rows (e.g. "Cart", "Close") from being
    // mistaken for property results.
    if (results.length === 0) {
      const tableRows = document.querySelectorAll('table tbody tr');
      tableRows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        const text = row.textContent?.trim() ?? '';
        const links = Array.from(row.querySelectorAll('a[href]'));

        let propertyId: string | null = null;
        for (const link of links) {
          const href = link.getAttribute('href') ?? '';
          const match = href.match(/(?:Id|id|ID|propertyId)=(\w+)/);
          if (match) { propertyId = match[1]; break; }
        }

        if (!propertyId) {
          const idMatch = text.match(/(?:Property\s*(?:ID|#)\s*:?\s*)(\d{4,})/i);
          if (idMatch) propertyId = idMatch[1];
        }

        // Extract propertyType from class-named cell if present
        const typeCellByClass = row.querySelector('td._propertyType, td[class*="_propertyType"]') as HTMLTableCellElement | null;

        // Only add rows where a real property ID was found via a link or explicit
        // "Property ID:" label. Rows that merely have ≥2 cells can be navigation
        // elements and must not be included.
        if (propertyId) {
          results.push({
            propertyId,
            propertyType: typeCellByClass?.textContent?.trim() ?? null,
            ownerName: cells.length > 1 ? cells[1]?.textContent?.trim() ?? null : null,
            address: cells.length > 2 ? cells[2]?.textContent?.trim() ?? null : text.substring(0, 200),
            legalDescription: cells.length > 3 ? cells[3]?.textContent?.trim() ?? null : null,
          });
        }
      });
    }

    // Strategy 3: Result divs/cards
    if (results.length === 0) {
      const cards = document.querySelectorAll('.result-item, .property-result, .search-result-item, [class*="result"]');
      cards.forEach((card) => {
        const text = card.textContent?.trim() ?? '';
        const link = card.querySelector('a[href]');
        const href = link?.getAttribute('href') ?? '';
        const idMatch = href.match(/(?:Id|id|propertyId)=(\w+)/) ?? text.match(/(\d{5,})/);

        if (idMatch) {
          results.push({
            propertyId: idMatch[1],
            ownerName: null,
            address: text.substring(0, 200),
          });
        }
      });
    }

    return results as CadSearchResult[];
  }) as Promise<CadSearchResult[]>;
}

// ── Layer 1C: Vision OCR Fallback ──────────────────────────────────────────

async function extractFromScreenshot(
  screenshot: Buffer,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<CadSearchResult[]> {
  const finish = logger.startAttempt({
    layer: 'Stage1C',
    source: 'CAD-Vision',
    method: 'screenshot-ocr',
    input: `screenshot (${(screenshot.length / 1024).toFixed(0)} KB)`,
  });

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') },
            },
            {
              type: 'text',
              text: `This is a screenshot of a Texas county appraisal district (CAD) search results page.

Extract ALL property information visible. For EACH property row, extract:
- propertyId (the numeric or alphanumeric property ID / account number)
- geoId (geographic ID, if visible)
- ownerName
- legalDescription
- situsAddress (the physical address)
- acreage (if visible)
- propertyType (if visible: real, personal, mineral, etc.)

CRITICAL: Extract EVERY visible result, not just the first one.
Return ONLY valid JSON array, no markdown. If NO results visible, return [].`,
            },
          ],
        },
      ],
    });

    const text = response.content.find((c) => c.type === 'text');
    if (!text || text.type !== 'text') {
      finish({ status: 'fail', error: 'No text in Vision response' });
      return [];
    }

    const cleaned = text.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed: CadSearchResult[];

    try {
      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) parsed = [];
    } catch {
      finish({ status: 'fail', error: 'Failed to parse Vision JSON' });
      return [];
    }

    finish({ status: parsed.length > 0 ? 'success' : 'fail', dataPointsFound: parsed.length });
    return parsed;
  } catch (err) {
    // Capture full error detail including any HTTP status from Anthropic API errors
    const status = (err != null && typeof err === 'object') ? (err as Record<string, unknown>)['status'] : undefined;
    const detail = err instanceof Error
      ? (status != null ? `HTTP ${status}: ${err.message}` : err.message)
      : String(err);
    finish({ status: 'fail', error: detail });
    return [];
  }
}

// ── Property Detail Enrichment ─────────────────────────────────────────────

async function enrichPropertyDetail(
  baseUrl: string,
  propertyId: string,
  logger: PipelineLogger,
  ownerId?: string,
): Promise<{
  acreage: number | null;
  legalDescription: string | null;
  propertyType: string | null;
  instrumentNumbers: string[];
  ownerId: string | null;
  ownerName: string | null;
  mailingAddress: string | null;
  situsAddress: string | null;
  geoId: string | null;
  mapId: string | null;
  deedHistory: DeedHistoryEntry[];
}> {
  const finish = logger.startAttempt({
    layer: 'Stage1-Detail',
    source: 'CAD-Detail',
    method: 'HTTP-GET',
    input: propertyId,
  });

  const empty: {
    acreage: number | null;
    legalDescription: string | null;
    propertyType: string | null;
    instrumentNumbers: string[];
    ownerId: string | null;
    ownerName: string | null;
    mailingAddress: string | null;
    situsAddress: string | null;
    geoId: string | null;
    mapId: string | null;
    deedHistory: DeedHistoryEntry[];
  } = {
    acreage: null, legalDescription: null, propertyType: null, instrumentNumbers: [],
    ownerId: null, ownerName: null, mailingAddress: null, situsAddress: null,
    geoId: null, mapId: null, deedHistory: [],
  };

  /**
   * Parse the Bell CAD detail page HTML to extract acreage, legal description,
   * property type, and deed history instrument numbers.
   *
   * The Bell CAD detail page URL uses a PATH parameter, not a query param:
   *   CORRECT:   /Property/View/{id}?year={year}
   *   INCORRECT: /Property/View?Id={id}&year={year}   ← returns 404
   *
   * The page is server-side rendered (not an SPA), so plain HTTP GET works once
   * the correct URL is used.
   */
  function parseDetailHtml(html: string): {
    acreage: number | null;
    legalDescription: string | null;
    propertyType: string | null;
    instrumentNumbers: string[];
    ownerId: string | null;
    ownerName: string | null;
    mailingAddress: string | null;
    situsAddress: string | null;
    geoId: string | null;
    mapId: string | null;
    deedHistory: DeedHistoryEntry[];
  } {
    // Extract acreage (try multiple patterns)
    let acreage: number | null = null;
    const acreagePatterns = [
      /(?:Acreage|Land\s*Area|Total\s*Acres?|Land\s*Size)\s*:?\s*(?:<[^>]*>)?\s*([\d,.]+)/i,
      /(?:Acres?)\s*:?\s*(?:<[^>]*>)?\s*([\d,.]+)/i,
      /([\d,.]+)\s*(?:acres?|ac)\b/i,
    ];
    for (const pattern of acreagePatterns) {
      const match = html.match(pattern);
      if (match) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) { acreage = val; break; }
      }
    }

    // Extract legal description — BIS eSearch detail pages use labeled table rows.
    // IMPORTANT: the disclaimer text ("Legal descriptions and acreage amounts are for
    // Appraisal District use only...") must NOT be returned even if it matches the label.
    let legalDescription: string | null = null;

    // Strategy 1: BIS table-row pattern — <td>Legal Description</td><td>VALUE</td>
    const bisTableMatch = html.match(
      /<td[^>]*>\s*Legal\s*(?:Description|Descriptions|Desc\.?)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    );
    if (bisTableMatch) {
      const rawValue = bisTableMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (rawValue.length > 5 && !/appraisal district|should be verified|legal purpose/i.test(rawValue)) {
        legalDescription = rawValue;
      }
    }

    // Strategy 2: Generic label + value patterns (filter out disclaimer matches)
    if (!legalDescription) {
      const legalPatterns = [
        /(?:Legal\s*Description|Legal\s*Desc\.?)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i,
        /class="[^"]*legal[^"]*"[^>]*>\s*([^<]+)/i,
        /id="[^"]*legal[^"]*"[^>]*>\s*([^<]+)/i,
      ];
      for (const pattern of legalPatterns) {
        const match = html.match(pattern);
        if (match && match[1].trim().length > 5) {
          const candidate = match[1].trim();
          if (/appraisal district|should be verified|legal purpose/i.test(candidate)) continue;
          legalDescription = candidate;
          break;
        }
      }
    }

    // Extract property type — look for Bell CAD's <th>Type:</th><td>R</td> pattern first,
    // then fall back to a generic label match.
    let propertyType: string | null = null;
    // Bell CAD detail page: <th>Type:</th><td>P</td> or <td>R</td>
    const typeRowMatch = html.match(/<th[^>]*>\s*Type:\s*<\/th>\s*<td[^>]*>([^<]+)<\/td>/i);
    if (typeRowMatch && typeRowMatch[1].trim().length > 0) {
      propertyType = typeRowMatch[1].trim();
    }
    if (!propertyType) {
      const typeMatch = html.match(/(?:Property\s*Type|Prop(?:erty)?\s*Type)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);
      if (typeMatch && typeMatch[1].trim().length > 1) {
        propertyType = typeMatch[1]
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
          .trim();
      }
    }

    // Extract deed history instrument numbers.
    // Bell CAD detail page has a "Property Deed History" panel with a table:
    //   Deed Date | Type | Description | Grantor | Grantee | Volume | Page | Number
    // The "Number" column (index 7) contains the instrument number (e.g., "2010043440").
    // Personal property records (Type:P) have an empty deed history table.
    const seen = new Set<string>();
    const instrumentNumbers: string[] = [];
    const deedHistory: DeedHistoryEntry[] = [];
    // Find the deed history table section
    const deedHistoryMatch = html.match(/Property\s+Deed\s+History[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
    if (deedHistoryMatch) {
      const tbodyHtml = deedHistoryMatch[1];
      const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      while ((rowMatch = rowPattern.exec(tbodyHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cellTexts: string[] = [];
        let cellMatch;
        while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
          cellTexts.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
        }
        if (cellTexts.length >= 1) {
          const instrNum = cellTexts.length >= 8 ? cellTexts[7].replace(/\s+/g, '') : '';
          // All DeedHistoryEntry fields are optional; cells not present remain undefined.
          // Instrument numbers require all 8 columns to be valid.
          const entry: DeedHistoryEntry = {
            deedDate: cellTexts[0] || undefined,
            type: cellTexts[1] || undefined,
            description: cellTexts[2] || undefined,
            grantor: cellTexts[3] || undefined,
            grantee: cellTexts[4] || undefined,
            volume: cellTexts[5] || undefined,
            page: cellTexts[6] || undefined,
            instrumentNumber: instrNum || undefined,
          };
          deedHistory.push(entry);
          // Column 7 (0-indexed) = "Number" = instrument number
          if (/^\d{7,12}$/.test(instrNum) && !seen.has(instrNum)) {
            seen.add(instrNum);
            instrumentNumbers.push(instrNum);
          }
        }
      }
    }

    // Extract owner ID: <th>Owner ID:</th><td colspan="3">882692</td>
    let ownerIdVal: string | null = null;
    const ownerIdMatch = html.match(/<th[^>]*>\s*Owner\s*ID:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (ownerIdMatch) {
      ownerIdVal = ownerIdMatch[1].replace(/<[^>]*>/g, '').trim() || null;
    }

    // Extract owner name: <th>Name:</th><td colspan="3">STARR SURVEYING</td>
    let ownerNameVal: string | null = null;
    const ownerNameMatch = html.match(/<th[^>]*>\s*Name:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (ownerNameMatch) {
      ownerNameVal = ownerNameMatch[1].replace(/<[^>]*>/g, '').trim() || null;
    }

    // Extract mailing address: <th>Mailing Address:</th><td>...<br>...<br>...</td>
    let mailingAddress: string | null = null;
    const mailingMatch = html.match(/<th[^>]*>\s*Mailing\s*Address:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (mailingMatch) {
      mailingAddress = mailingMatch[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim() || null;
    }

    // Extract situs address: <th>Situs Address:</th><td colspan="3">3779 FM 436\nBELTON, TX 76513</td>
    let situsAddressVal: string | null = null;
    const situsMatch = html.match(/<th[^>]*>\s*Situs\s*Address:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (situsMatch) {
      situsAddressVal = situsMatch[1]
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim() || null;
    }

    // Extract geographic ID: appears in same row as Property ID
    // <tr><th>Property ID:</th><td>498826</td><td><strong> Geographic ID: </strong> VALUE</td></tr>
    let geoIdVal: string | null = null;
    const geoIdMatch = html.match(/<strong[^>]*>\s*Geographic\s*ID:\s*<\/strong>\s*([^<\n]*)/i);
    if (geoIdMatch) {
      geoIdVal = geoIdMatch[1].trim() || null;
    }
    if (!geoIdVal) {
      const geoIdAlt = html.match(/<th[^>]*>\s*Geographic\s*ID:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
      if (geoIdAlt) geoIdVal = geoIdAlt[1].replace(/<[^>]*>/g, '').trim() || null;
    }

    // Extract map ID: <th>Map ID:</th><td>61B01</td>
    let mapIdVal: string | null = null;
    const mapIdMatch = html.match(/<th[^>]*>\s*Map\s*ID:\s*<\/th>\s*<td[^>]*>([^<]+)<\/td>/i);
    if (mapIdMatch) {
      mapIdVal = mapIdMatch[1].trim() || null;
    }

    return {
      acreage, legalDescription, propertyType, instrumentNumbers, deedHistory,
      ownerId: ownerIdVal, ownerName: ownerNameVal, mailingAddress,
      situsAddress: situsAddressVal, geoId: geoIdVal, mapId: mapIdVal,
    };
  }

  try {
    const year = new Date().getFullYear();
    // CRITICAL: Bell CAD uses path parameter, not query string — /Property/View/{id}?year={year}
    // Optionally append ownerId if known, for more precise lookup.
    const url = ownerId
      ? `${baseUrl}/Property/View/${propertyId}?year=${year}&ownerId=${encodeURIComponent(ownerId)}`
      : `${baseUrl}/Property/View/${propertyId}?year=${year}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      finish({ status: 'fail', error: `HTTP ${response.status}` });
      return empty;
    }

    const html = await response.text();
    const result = parseDetailHtml(html);

    const found = (result.acreage ? 1 : 0) + (result.legalDescription ? 1 : 0) + (result.propertyType ? 1 : 0) + (result.instrumentNumbers.length > 0 ? 1 : 0);
    finish({
      status: found > 0 ? 'success' : 'partial',
      dataPointsFound: found,
      details: `Acreage: ${result.acreage ?? 'N/A'}, Legal: ${result.legalDescription ? `${result.legalDescription.length} chars` : 'N/A'}, Type: ${result.propertyType ?? 'N/A'}, Instruments: [${result.instrumentNumbers.join(', ')}], Owner: ${result.ownerName ?? 'N/A'}, MapId: ${result.mapId ?? 'N/A'}`,
    });

    return result;
  } catch (err) {
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return empty;
  }
}

// ── Pick Best Result ───────────────────────────────────────────────────────

/**
 * From a list of CAD results, pick the best one.
 * Filters out UDI records, validates against input, scores by match quality.
 */
function pickBestResult(
  results: CadSearchResult[],
  inputAddress: NormalizedAddress,
  logger: PipelineLogger,
): CadSearchResult | null {
  // Filter out UDI records (Undivided Interest — not real property results)
  const nonUdi = results.filter((r) => {
    const isUdi = (r as Record<string, unknown>).isUDI ?? (r as Record<string, unknown>).IsUDI;
    // Explicitly check for true/truthy — undefined/null means NOT a UDI
    return isUdi !== true && isUdi !== 'true' && isUdi !== 1;
  });

  let candidates = nonUdi.length > 0 ? nonUdi : results;
  if (candidates.length === 0) return null;

  // Prefer Real property (Type R) over Personal/Mineral/Auto/Mobile-Home.
  // This prevents business personal property records (e.g., Bell CAD ID 498826
  // "STARR SURVEYING" Type:P — $8,500 of surveying equipment) from being
  // chosen instead of the actual land records at the same address.
  const realOnly = candidates.filter((r) => {
    const rawType = (getProp(r, 'propertyType', 'PropertyType') ?? '').trim().toUpperCase();
    return !rawType || rawType === 'R' || rawType === 'REAL';
  });
  if (realOnly.length > 0) {
    if (realOnly.length < candidates.length) {
      logger.info('Stage1-Pick', `Filtered ${candidates.length - realOnly.length} non-Real record(s) — keeping ${realOnly.length} Real property result(s)`);
    }
    candidates = realOnly;
  } else {
    // All results are non-Real (e.g. all Personal) — log a warning and proceed
    const types = candidates.map((r) => getProp(r, 'propertyType', 'PropertyType') ?? '?').join(', ');
    logger.warn('Stage1-Pick', `No Type:R (Real) results found — all ${candidates.length} result(s) are non-Real (types: ${types}). Pipeline may pick the wrong record.`);
  }

  // Score each candidate
  const scored = candidates.map((r) => {
    const validation = validatePropertyResult(r, inputAddress, logger);
    return { result: r, validation };
  });

  // Sort by confidence descending
  scored.sort((a, b) => b.validation.confidence - a.validation.confidence);

  // Log top candidates (include property type for clarity)
  for (let i = 0; i < Math.min(3, scored.length); i++) {
    const { result: r, validation: v } = scored[i];
    const pType = getProp(r, 'propertyType', 'PropertyType') ?? '?';
    logger.info('Stage1-Pick', `  #${i + 1}: ID=${getProp(r, 'propertyId', 'PropertyId')}, Type=${pType}, confidence=${v.confidence.toFixed(2)}, addr="${getProp(r, 'address', 'Address', 'situsAddress') ?? 'N/A'}"`);
  }

  // Warn if best match has low confidence
  if (scored[0].validation.confidence < 0.5) {
    logger.warn('Stage1-Pick', `Best match confidence is only ${scored[0].validation.confidence.toFixed(2)} — result may not be correct`);
  }

  return scored[0].result;
}

// ── Layer 1D: AI-Generated Address Variants ─────────────────────────────────

/**
 * When all deterministic address variants fail, ask Claude to generate
 * additional plausible search formats for a Texas address.
 *
 * This catches edge cases the regex-based system can't anticipate:
 * - Local road nicknames
 * - County-specific formatting quirks
 * - Unusual abbreviation patterns
 * - Historical road name changes
 */
async function generateAiAddressVariants(
  rawAddress: string,
  parsed: { streetNumber: string; streetName: string; streetType: string; city: string | null },
  alreadyTried: AddressVariant[],
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<AddressVariant[]> {
  const tracker = logger.startAttempt({
    layer: 'Stage1D',
    source: 'Claude',
    method: 'ai-variant-generation',
    input: rawAddress,
  });

  try {
    const triedList = alreadyTried
      .filter((v) => !v.isPartial)
      .map((v) => `"${v.streetNumber}" + "${v.streetName}"`)
      .join(', ');

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `I'm searching a Texas county CAD (Central Appraisal District) database for a property at this address:

"${rawAddress}"

The CAD search takes a StreetNumber and StreetName. I already tried these combinations and all returned 0 results:
${triedList}

Generate additional StreetName variants that the CAD system might use to index this address. Consider:
- Texas road naming conventions (FM, SH, CR, RM, RR, US, IH roads)
- Whether directionals (N/S/E/W) should be included, excluded, or moved
- Whether road type prefixes should be abbreviated differently
- Whether the CAD might store the road name in a completely different format
- Whether there are common local naming variations

Return ONLY a JSON array of objects with "streetNumber" and "streetName" fields.
Example: [{"streetNumber":"3779","streetName":"FM 436"},{"streetNumber":"3779","streetName":"FARM MARKET 436"}]

Important: Do NOT repeat variants already tried. Only return NEW variants not in the list above.`,
      }],
    });

    const text = response.content.find((c) => c.type === 'text');
    if (!text || text.type !== 'text') {
      tracker({ status: 'fail', error: 'No response from Claude' });
      return [];
    }

    const cleaned = text.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const aiResults = JSON.parse(cleaned) as Array<{ streetNumber: string; streetName: string }>;

    if (!Array.isArray(aiResults) || aiResults.length === 0) {
      tracker({ status: 'fail', error: 'Empty or invalid AI response' });
      return [];
    }

    // Convert to AddressVariant format, dedup against already-tried
    const triedKeys = new Set(
      alreadyTried.map((v) => `${v.streetNumber}|${v.streetName}`.toLowerCase()),
    );

    const newVariants: AddressVariant[] = [];
    let priority = 50; // Start after deterministic variants

    for (const item of aiResults) {
      if (!item.streetNumber || !item.streetName) continue;
      const key = `${item.streetNumber}|${item.streetName}`.toLowerCase();
      if (triedKeys.has(key)) continue;
      triedKeys.add(key);

      newVariants.push({
        streetNumber: item.streetNumber,
        streetName: item.streetName,
        format: `ai-variant-${newVariants.length + 1}`,
        query: `${item.streetNumber} ${item.streetName}`,
        priority: priority++,
        isPartial: false,
      });
    }

    tracker({
      status: newVariants.length > 0 ? 'success' : 'fail',
      dataPointsFound: newVariants.length,
      details: `AI generated ${aiResults.length} variants, ${newVariants.length} novel after dedup`,
    });

    return newVariants;
  } catch (err) {
    tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ── Main Search Function ───────────────────────────────────────────────────

/**
 * Perform a single keyword search against the BIS eSearch API.
 * Handles reCAPTCHA check, session token acquisition, and one GET request.
 * Used for owner-name and property-ID keyword searches.
 */
async function searchCadHttpRawKeyword(
  baseUrl: string,
  keywords: string,
  label: string,
  logger: PipelineLogger,
): Promise<CadSearchResult[] | null> {
  const tracker = logger.startAttempt({
    layer: 'Stage1A-Keyword',
    source: 'CAD-HTTP',
    method: 'GET-keyword-search',
    input: `${label}: ${keywords.substring(0, 80)}`,
  });

  try {
    // Check reCAPTCHA requirement
    const recaptchaResp = await fetch(`${baseUrl}/search/shouldUseRecaptcha`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);

    if (recaptchaResp?.ok) {
      const data = await recaptchaResp.json().catch(() => ({})) as { shouldUseRecaptcha?: boolean };
      if (data.shouldUseRecaptcha === true) {
        tracker({ status: 'fail', error: 'reCAPTCHA required', nextLayer: 'Stage1B' });
        return null;
      }
    }

    // Acquire session cookies + token
    let sessionCookies: string | null = null;
    let sessionToken: string | null = null;

    const pageResp = await fetch(baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (pageResp?.ok) {
      const setCookie = pageResp.headers.get('set-cookie');
      if (setCookie) {
        sessionCookies = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter((c) => c.includes('=')).join('; ');
      }
    }

    const tokenHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${baseUrl}/`,
    };
    if (sessionCookies) tokenHeaders['Cookie'] = sessionCookies;

    const tokenResp = await fetch(`${baseUrl}/search/requestSessionToken`, {
      headers: tokenHeaders,
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);

    if (tokenResp?.ok) {
      const tokenData = await tokenResp.json().catch(() => ({})) as { searchSessionToken?: string };
      sessionToken = tokenData.searchSessionToken ?? null;
    }

    if (!sessionToken) {
      tracker({ status: 'fail', error: 'Failed to acquire session token' });
      return null;
    }

    // Perform the search
    const searchHeaders: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': `${baseUrl}/`,
    };
    if (sessionCookies) searchHeaders['Cookie'] = sessionCookies;

    const url = `${baseUrl}/search/result?keywords=${encodeURIComponent(keywords)}&searchSessionToken=${encodeURIComponent(sessionToken)}`;
    tracker.step(`GET ${url.substring(0, 120)}...`);

    const response = await fetch(url, {
      headers: searchHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      tracker({ status: 'fail', error: `HTTP ${response.status}` });
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      const data = await response.json() as
        | { resultsList?: CadSearchResult[]; results?: CadSearchResult[]; data?: CadSearchResult[] }
        | CadSearchResult[];
      const results = Array.isArray(data) ? data : (data.resultsList ?? data.results ?? data.data ?? []);
      tracker({ status: results.length > 0 ? 'success' : 'fail', dataPointsFound: results.length, details: `${results.length} JSON results` });
      return results.length > 0 ? results : null;
    }

    if (contentType.includes('html')) {
      const html = await response.text();
      const results = parseHtmlSearchResults(html, tracker);
      tracker({ status: results.length > 0 ? 'success' : 'fail', dataPointsFound: results.length, details: `${results.length} results from HTML` });
      return results.length > 0 ? results : null;
    }

    tracker({ status: 'fail', error: `Unexpected content-type: ${contentType}` });
    return null;
  } catch (err) {
    tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Search for a property in a BIS Consultants eSearch CAD system.
 * Tries HTTP → Playwright → Vision OCR → AI variants in sequence (layered fallback).
 * All results are validated against the original search address.
 */
export async function searchBisCad(
  county: string,
  normalized: NormalizedAddress,
  anthropicApiKey: string,
  logger: PipelineLogger,
  options?: {
    ownerName?: string;
    propertyId?: string;
    ownerId?: string;
  },
): Promise<{ property: PropertyIdResult | null; diagnostics: SearchDiagnostics }> {
  const config = BIS_CONFIGS[county.toLowerCase()];
  const diagnostics: SearchDiagnostics = {
    variantsGenerated: normalized.variants,
    variantsTried: [],
    partialSearches: [],
    searchDuration_ms: 0,
  };
  const searchStart = Date.now();

  if (!config) {
    logger.warn('Stage1', `No BIS config for county: ${county}. Known counties: ${Object.keys(BIS_CONFIGS).join(', ')}`);
    diagnostics.searchDuration_ms = Date.now() - searchStart;
    return { property: null, diagnostics };
  }

  const { variants } = normalized;
  if (!variants.length) {
    logger.warn('Stage1', 'No address variants to search');
    diagnostics.searchDuration_ms = Date.now() - searchStart;
    return { property: null, diagnostics };
  }

  logger.info('Stage1', `Searching ${config.name} with ${variants.length} variants (${variants.filter((v) => !v.isPartial).length} exact, ${variants.filter((v) => v.isPartial).length} partial)`);

  // Helper to build a PropertyIdResult from a detail + search result
  const buildResult = (
    propId: string,
    detail: Awaited<ReturnType<typeof enrichPropertyDetail>>,
    best: CadSearchResult,
    layer: string,
    confidence: number,
    notes: string[],
  ): PropertyIdResult => ({
    propertyId: propId,
    geoId: detail.geoId ?? getProp(best, 'geoId', 'GeoId'),
    ownerName: detail.ownerName ?? getProp(best, 'ownerName', 'OwnerName'),
    legalDescription: detail.legalDescription ?? getProp(best, 'legalDescription', 'LegalDescription'),
    acreage: detail.acreage ?? getNumProp(best, 'acreage', 'Acreage'),
    propertyType: detail.propertyType ?? getProp(best, 'propertyType', 'PropertyType'),
    situsAddress: detail.situsAddress ?? getProp(best, 'address', 'Address', 'situsAddress', 'SitusAddress'),
    source: config.name,
    layer,
    matchConfidence: confidence,
    validationNotes: notes,
    instrumentNumbers: detail.instrumentNumbers.length > 0 ? detail.instrumentNumbers : undefined,
    ownerId: detail.ownerId ?? getProp(best, 'ownerId', 'OwnerId') ?? undefined,
    mapId: detail.mapId ?? undefined,
    mailingAddress: detail.mailingAddress ?? undefined,
    deedHistory: detail.deedHistory.length > 0 ? detail.deedHistory : undefined,
  });

  // Layer 1A-0: Direct property ID lookup (fastest path — no search needed)
  if (options?.propertyId) {
    logger.info('Stage1A-0', `Direct property ID lookup: ${options.propertyId}`);
    const detail = await enrichPropertyDetail(config.baseUrl, options.propertyId, logger, options.ownerId);
    if (detail.ownerName || detail.legalDescription) {
      diagnostics.searchDuration_ms = Date.now() - searchStart;
      return {
        property: {
          propertyId: options.propertyId,
          geoId: detail.geoId,
          ownerName: detail.ownerName,
          legalDescription: detail.legalDescription,
          acreage: detail.acreage,
          propertyType: detail.propertyType,
          situsAddress: detail.situsAddress,
          source: config.name,
          layer: 'Stage1A-0',
          matchConfidence: 1.0,
          validationNotes: ['Direct property ID lookup — exact match'],
          instrumentNumbers: detail.instrumentNumbers.length > 0 ? detail.instrumentNumbers : undefined,
          ownerId: detail.ownerId ?? options.ownerId,
          mapId: detail.mapId ?? undefined,
          mailingAddress: detail.mailingAddress ?? undefined,
          deedHistory: detail.deedHistory.length > 0 ? detail.deedHistory : undefined,
        },
        diagnostics,
      };
    }

    // Layer 1A-1: Property ID keyword search (fallback if direct fetch failed)
    logger.info('Stage1A-1', `Direct fetch failed — trying keyword search for property ID: ${options.propertyId}`);
    const pidQuery = `PropertyId:${options.propertyId}`;
    const pidResults = await searchCadHttpRawKeyword(config.baseUrl, pidQuery, 'PropertyId', logger);
    if (pidResults && pidResults.length > 0) {
      const best = pidResults[0];
      const pid = getProp(best, 'propertyId', 'PropertyId') ?? options.propertyId;
      const pid_ownerId = getProp(best, 'ownerId', 'OwnerId') ?? options.ownerId;
      const detailPid = await enrichPropertyDetail(config.baseUrl, pid, logger, pid_ownerId ?? undefined);
      diagnostics.searchDuration_ms = Date.now() - searchStart;
      return {
        property: buildResult(pid, detailPid, best, 'Stage1A-1', 1.0, ['Property ID keyword search — exact match']),
        diagnostics,
      };
    }
  }

  // Layer 1A: HTTP GET with session token (BIS eSearch keyword search)
  const httpResults = await searchCadHttp(config.baseUrl, variants, logger, diagnostics);
  if (httpResults && httpResults.length > 0) {
    const best = pickBestResult(httpResults, normalized, logger);
    if (best) {
      const propId = getProp(best, 'propertyId', 'PropertyId') ?? '';
      const validation = validatePropertyResult(best, normalized, logger);
      validation.multipleResults = httpResults.length > 1;

      // Only accept if validation passes minimum threshold
      if (validation.confidence >= 0.3) {
        const bestOwnerId = getProp(best, 'ownerId', 'OwnerId') ?? undefined;
        const detail = await enrichPropertyDetail(config.baseUrl, propId, logger, bestOwnerId);
        diagnostics.searchDuration_ms = Date.now() - searchStart;

        return {
          property: buildResult(propId, detail, best, 'Stage1A', validation.confidence, validation.issues),
          diagnostics,
        };
      } else {
        logger.warn('Stage1A', `Best HTTP result rejected — confidence ${validation.confidence.toFixed(2)} below 0.3 threshold`);
      }
    }
  }

  // Layer 1B: Playwright (tries all variants including partials, plus owner/id fallback)
  const { results: pwResults, screenshot, validation: pwValidation } = await searchCadPlaywright(
    config.baseUrl, variants, normalized, logger, diagnostics, options,
  );

  if (pwResults.length > 0) {
    const best = pickBestResult(pwResults, normalized, logger);
    if (best) {
      const propId = getProp(best, 'propertyId', 'PropertyId') ?? '';
      const validation = pwValidation ?? validatePropertyResult(best, normalized, logger);
      validation.multipleResults = pwResults.length > 1;

      if (validation.confidence >= 0.2) {
        const bestOwnerId = getProp(best, 'ownerId', 'OwnerId') ?? undefined;
        const detail = await enrichPropertyDetail(config.baseUrl, propId, logger, bestOwnerId);
        diagnostics.searchDuration_ms = Date.now() - searchStart;

        return {
          property: buildResult(propId, detail, best, 'Stage1B', validation.confidence, validation.issues),
          diagnostics,
        };
      } else {
        logger.warn('Stage1B', `Best Playwright result rejected — confidence ${validation.confidence.toFixed(2)} below 0.2 threshold`);
      }
    }
  }

  // Layer 1C: Vision OCR from screenshot (check circuit breaker first)
  const aiTracker1C = getGlobalAiTracker();
  const { allowed: aiAllowed1C, reason: aiBlockReason1C } = aiTracker1C.canMakeCall();

  if (screenshot && screenshot.length > 1000 && aiAllowed1C) {
    const visionResults = await extractFromScreenshot(screenshot, anthropicApiKey, logger);

    // Record usage for circuit breaker
    aiTracker1C.record({
      service: 'vision-ocr',
      address: normalized.raw,
      success: visionResults.length > 0,
      inputTokens: 2000, // Vision calls use more tokens
      outputTokens: 1000,
    });

    if (visionResults.length > 0) {
      const best = pickBestResult(visionResults, normalized, logger);
      if (best) {
        const propId = getProp(best, 'propertyId', 'PropertyId', 'property_id') ?? '';
        if (propId) {
          const bestOwnerId = getProp(best, 'ownerId', 'OwnerId') ?? undefined;
          const detail = await enrichPropertyDetail(config.baseUrl, propId, logger, bestOwnerId);
          const validation = validatePropertyResult(best, normalized, logger);
          validation.multipleResults = visionResults.length > 1;
          diagnostics.searchDuration_ms = Date.now() - searchStart;

          return {
            property: buildResult(propId, detail, best, 'Stage1C', validation.confidence, [
              ...validation.issues, 'Property identified via screenshot OCR — lower reliability',
            ]),
            diagnostics,
          };
        }
      }
    }
  } else if (screenshot && screenshot.length > 1000 && !aiAllowed1C) {
    logger.warn('Stage1C', `[ai_api] Vision OCR skipped — circuit breaker: ${aiBlockReason1C}`);
  }

  // Layer 1D: AI-generated address variants (last resort before giving up)
  // When all deterministic variants fail, ask Claude to brainstorm additional
  // formats that a CAD system might use to index this address.
  const aiTracker = getGlobalAiTracker();
  const { allowed: aiAllowed, reason: aiBlockReason } = aiTracker.canMakeCall();

  if (anthropicApiKey && aiAllowed) {
    const aiVariants = await generateAiAddressVariants(
      normalized.raw,
      normalized.parsed,
      diagnostics.variantsTried.map((v) => v.variant),
      anthropicApiKey,
      logger,
    );

    aiTracker.record({
      service: 'variant-generation',
      address: normalized.raw,
      success: aiVariants.length > 0,
      inputTokens: 500,
      outputTokens: 300,
    });

    if (aiVariants.length > 0) {
      logger.info('Stage1D', `AI generated ${aiVariants.length} additional address variants — retrying HTTP search`);

      const aiHttpResults = await searchCadHttp(config.baseUrl, aiVariants, logger, diagnostics);
      if (aiHttpResults && aiHttpResults.length > 0) {
        const best = pickBestResult(aiHttpResults, normalized, logger);
        if (best) {
          const propId = getProp(best, 'propertyId', 'PropertyId') ?? '';
          const validation = validatePropertyResult(best, normalized, logger);
          validation.multipleResults = aiHttpResults.length > 1;

          if (validation.confidence >= 0.2) {
            const bestOwnerId = getProp(best, 'ownerId', 'OwnerId') ?? undefined;
            const detail = await enrichPropertyDetail(config.baseUrl, propId, logger, bestOwnerId);
            diagnostics.searchDuration_ms = Date.now() - searchStart;

            return {
              property: buildResult(propId, detail, best, 'Stage1D', validation.confidence, [
                ...validation.issues, 'Found via AI-generated address variant',
              ]),
              diagnostics,
            };
          }
        }
      }
    }
  } else if (anthropicApiKey && !aiAllowed) {
    logger.warn('Stage1D', `AI variant fallback skipped — circuit breaker: ${aiBlockReason}`);
  }

  // Layer 1A-Broad: Street-number-only search (broadened query without street name).
  // When all named variants fail, the property may be indexed with a completely
  // different street name in the CAD (e.g., rural tracts listed by abstract only).
  // A broad search by street number alone can surface the correct record.
  {
    const streetNum = normalized.parsed.streetNumber;
    if (streetNum) {
      logger.info('Stage1A-Broad', `All named variants failed — trying street-number-only search: "${streetNum}"`);
      const broadQuery = `StreetNumber:${streetNum} PropertyType:Real`;
      const broadResults = await searchCadHttpRawKeyword(config.baseUrl, broadQuery, 'StreetNumber-only', logger);
      if (broadResults && broadResults.length > 0 && broadResults.length <= 20) {
        // Only proceed if results are reasonably scoped (not hundreds of matches)
        const best = pickBestResult(broadResults, normalized, logger);
        if (best) {
          const propId = getProp(best, 'propertyId', 'PropertyId') ?? '';
          const validation = validatePropertyResult(best, normalized, logger);
          // Accept with slightly lower threshold since this is a broad search
          if (validation.confidence >= 0.25 && propId) {
            const bestOwnerId = getProp(best, 'ownerId', 'OwnerId') ?? undefined;
            const detail = await enrichPropertyDetail(config.baseUrl, propId, logger, bestOwnerId);
            diagnostics.searchDuration_ms = Date.now() - searchStart;
            return {
              property: buildResult(propId, detail, best, 'Stage1A-Broad', validation.confidence, [
                ...validation.issues, 'Found via broadened street-number-only search',
              ]),
              diagnostics,
            };
          }
        }
      }
    }
  }

  // Layer 1A-StreetOnly: Street-name-only search (no street number).
  // Some rural properties (especially FM/CR roads) are indexed without a situs number
  // in Bell CAD. Search by street name alone with a small result cap.
  {
    const streetName = normalized.parsed.streetName;
    if (streetName && streetName.length >= 3) {
      logger.info('Stage1A-StreetOnly', `Trying street-name-only search: "${streetName}"`);
      const namePart = streetName.includes(' ')
        ? `StreetName:"${streetName}"`
        : `StreetName:${streetName}`;
      const streetOnlyQuery = `${namePart} PropertyType:Real`;
      const streetOnlyResults = await searchCadHttpRawKeyword(config.baseUrl, streetOnlyQuery, 'StreetName-only', logger);
      if (streetOnlyResults && streetOnlyResults.length > 0 && streetOnlyResults.length <= 30) {
        const best = pickBestResult(streetOnlyResults, normalized, logger);
        if (best) {
          const propId = getProp(best, 'propertyId', 'PropertyId') ?? '';
          const validation = validatePropertyResult(best, normalized, logger);
          if (validation.confidence >= 0.2 && propId) {
            const bestOwnerId = getProp(best, 'ownerId', 'OwnerId') ?? undefined;
            const detail = await enrichPropertyDetail(config.baseUrl, propId, logger, bestOwnerId);
            diagnostics.searchDuration_ms = Date.now() - searchStart;
            return {
              property: buildResult(propId, detail, best, 'Stage1A-StreetOnly', validation.confidence, [
                ...validation.issues, 'Found via street-name-only search (no situs number)',
              ]),
              diagnostics,
            };
          }
        }
      }
    }
  }

  // Layer 1A-2: Owner name HTTP search (after all address variants exhausted)
  if (options?.ownerName) {
    logger.info('Stage1A-2', `All address layers failed — trying owner name HTTP search: "${options.ownerName}"`);
    // Try a few name formats: as-is, uppercase, and "LAST, FIRST" if it looks like "FIRST LAST"
    const nameVariants: string[] = [options.ownerName, options.ownerName.toUpperCase()];
    const parts = options.ownerName.trim().split(/\s+/);
    if (parts.length >= 2 && !options.ownerName.includes(',')) {
      nameVariants.push(`${parts[parts.length - 1].toUpperCase()}, ${parts.slice(0, -1).join(' ').toUpperCase()}`);
    }

    for (const nameVariant of nameVariants) {
      const ownerQuery = `OwnerName:"${nameVariant}"`;
      const ownerResults = await searchCadHttpRawKeyword(config.baseUrl, ownerQuery, 'OwnerName', logger);
      if (ownerResults && ownerResults.length > 0) {
        const best = pickBestResult(ownerResults, normalized, logger);
        if (best) {
          const propId = getProp(best, 'propertyId', 'PropertyId') ?? '';
          if (propId) {
            const bestOwnerId = getProp(best, 'ownerId', 'OwnerId') ?? undefined;
            const detail = await enrichPropertyDetail(config.baseUrl, propId, logger, bestOwnerId);
            diagnostics.searchDuration_ms = Date.now() - searchStart;
            return {
              property: buildResult(propId, detail, best, 'Stage1A-2', 0.6, [
                `Found via owner name search: "${nameVariant}"`,
              ]),
              diagnostics,
            };
          }
        }
      }
    }
  }

  // Layer 1E: BIS GIS ArcGIS REST API (additional enrichment / last resort)
  if (config.gisBaseUrl || config.gisParcelLayerUrls?.length) {
    const gisResult = await searchBisGis(config.gisBaseUrl ?? '', logger, {
      propertyId: options?.propertyId,
      address: normalized.raw,
      ownerName: options?.ownerName,
      lat: normalized.lat,
      lon: normalized.lon,
      directLayerUrls: config.gisParcelLayerUrls,
    });
    if (gisResult?.propertyId || gisResult?.ownerName) {
      const instrNums = gisResult.instrumentNumbers ?? [];
      const deedHist = (gisResult.deedHistory ?? []).map(d => ({
        deedDate: d.deedDate,
        volume: d.volume,
        page: d.page,
        instrumentNumber: d.instrumentNumber,
      }));
      logger.info('Stage1E', `GIS lookup returned data — propertyId=${gisResult.propertyId ?? 'n/a'}, owner="${gisResult.ownerName ?? 'n/a'}", instruments=[${instrNums.join(',')}]`);
      diagnostics.searchDuration_ms = Date.now() - searchStart;
      return {
        property: {
          propertyId: gisResult.propertyId ?? '',
          geoId: null,
          source: 'Stage1E',
          layer: 'Stage1E',
          matchConfidence: 0.5,
          ownerName: gisResult.ownerName ?? null,
          legalDescription: gisResult.legalDescription ?? null,
          acreage: gisResult.acreage ?? null,
          propertyType: null,
          situsAddress: gisResult.situsAddress ?? null,
          mapId: gisResult.mapId,
          instrumentNumbers: instrNums.length > 0 ? instrNums : undefined,
          deedHistory: deedHist.length > 0 ? deedHist : undefined,
          validationNotes: ['GIS-only result — not confirmed via eSearch'],
        } as PropertyIdResult,
        diagnostics,
      };
    }
  }

  logger.error('Stage1', `All CAD search layers exhausted — property not found. Tried ${diagnostics.variantsTried.length} variants.`);
  diagnostics.searchDuration_ms = Date.now() - searchStart;

  // Preserve any screenshot from Stage 1B/1C in diagnostics so the pipeline
  // can surface it for AI analysis and the admin dashboard.
  if (screenshot && screenshot.length > 0 && !diagnostics.failureScreenshotBase64) {
    diagnostics.failureScreenshotBase64 = screenshot.toString('base64');
  }

  return { property: null, diagnostics };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP WRAPPER — used by the new pipeline.ts orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simplified CAD lookup for Bell County.
 * Normalizes the address, then searches Bell CAD via searchBisCad().
 * Returns the best matching property or null if not found.
 */
export async function lookupBisCad(
  address: string,
  logger: PipelineLogger,
): Promise<PropertyIdResult | null> {
  const normalized = await normalizeAddress(address, logger);
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const { property } = await searchBisCad('bell', normalized, apiKey, logger);
  return property;
}

// ─────────────────────────────────────────────────────────────────────────────
// BIS GIS — ArcGIS REST API integration (Phase 17)
// ─────────────────────────────────────────────────────────────────────────────

export interface GisPropertyData {
  propertyId?: string;
  ownerName?: string;
  legalDescription?: string;
  acreage?: number;
  situsAddress?: string;
  abstractName?: string;
  subdivision?: string;
  mapId?: string;
  /** Parcel boundary ring coordinates [lon, lat] pairs */
  parcelRings?: number[][][];
  /** Raw attribute record for any additional fields */
  rawAttributes?: Record<string, unknown>;
  /** Deed instrument numbers found in GIS attributes */
  instrumentNumbers?: string[];
  /** Deed history entries from GIS (date, volume, page, instrument) */
  deedHistory?: Array<{
    deedDate?: string;
    volume?: string;
    page?: string;
    instrumentNumber?: string;
  }>;
}

const FIELD_ALIASES: Record<string, string[]> = {
  propertyId:       ['PROP_ID', 'PropertyID', 'PROPERTY_ID', 'ACCT_NUM', 'CAD_ID', 'ID', 'OBJECTID',
                      'prop_id', 'prop_id_text'],
  ownerName:        ['OWNER_NAME', 'OwnerName', 'OWNER', 'OWN_NAME', 'OWNERNAME',
                      'file_as_name', 'owner_name'],
  legalDescription: ['LEGAL_DESC', 'LegalDesc', 'LEGAL', 'LEGAL_DESCRIPTION', 'LEGAL_DESCR',
                      'legal_desc'],
  acreage:          ['ACREAGE', 'Acreage', 'ACRES', 'LAND_ACRES', 'TOT_ACRES', 'AREA_ACRES',
                      'legal_acreage'],
  situsAddress:     ['SITUS_ADDR', 'SitusAddr', 'ADDRESS', 'PROP_ADDR', 'SITE_ADDR', 'ADDR',
                      'situs_addr'],
  abstractName:     ['ABSTRACT', 'AbstractName', 'ABS_NAME', 'ABST_NAME',
                      'abs_subdv_cd'],
  subdivision:      ['SUBDIVISION', 'Subdivision', 'SUB_NAME', 'SUBDIV',
                      'abs_subdv_cd'],
  mapId:            ['MAP_ID', 'MapID', 'MAPID', 'MAP_SHEET', 'GEO_ID',
                      'map_id', 'geo_id'],
};

function extractGisField(
  attrs: Record<string, unknown>,
  field: string,
): string | undefined {
  for (const alias of FIELD_ALIASES[field] ?? []) {
    const v = attrs[alias];
    if (v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== 'null') {
      return String(v).trim();
    }
  }
  return undefined;
}

function extractGisNumField(
  attrs: Record<string, unknown>,
  field: string,
): number | undefined {
  for (const alias of FIELD_ALIASES[field] ?? []) {
    const v = attrs[alias];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/,/g, ''));
      if (!isNaN(n)) return n;
    }
  }
  return undefined;
}

function buildGisPropertyData(attrs: Record<string, unknown>, geometry?: unknown): GisPropertyData {
  const result: GisPropertyData = {
    rawAttributes: attrs,
  };
  result.propertyId      = extractGisField(attrs, 'propertyId');
  result.ownerName       = extractGisField(attrs, 'ownerName');
  result.legalDescription = extractGisField(attrs, 'legalDescription');
  result.acreage         = extractGisNumField(attrs, 'acreage');
  result.situsAddress    = extractGisField(attrs, 'situsAddress');
  result.abstractName    = extractGisField(attrs, 'abstractName');
  result.subdivision     = extractGisField(attrs, 'subdivision');
  result.mapId           = extractGisField(attrs, 'mapId');

  // ── Compose situs address from component fields (Bell CAD style) ───
  if (!result.situsAddress) {
    const parts = [
      attrs['situs_num'],
      attrs['situs_street_prefx'],
      attrs['situs_street'],
      attrs['situs_street_sufix'],
    ].filter(p => p !== undefined && p !== null && String(p).trim() !== '');
    const streetLine = parts.map(p => String(p).trim()).join(' ');
    const cityStateZip = [
      attrs['situs_city'],
      attrs['situs_state'],
      attrs['situs_zip'],
    ].filter(p => p !== undefined && p !== null && String(p).trim() !== '');
    if (streetLine) {
      result.situsAddress = cityStateZip.length > 0
        ? `${streetLine}, ${cityStateZip.map(p => String(p).trim()).join(' ')}`
        : streetLine;
    }
  }

  // ── Extract deed data (instrument numbers, volume/page) ────────────
  const instrNum = attrs['Number'] ?? attrs['number'] ?? attrs['INSTRUMENT_NUM'] ?? attrs['instrument_num'];
  const deedDate = attrs['Deed_Date'] ?? attrs['deed_date'] ?? attrs['DEED_DATE'];
  const volume   = attrs['Volume'] ?? attrs['volume'] ?? attrs['VOLUME'];
  const page     = attrs['Page'] ?? attrs['page'] ?? attrs['PAGE'];

  if (instrNum || volume || deedDate) {
    const entry: { deedDate?: string; volume?: string; page?: string; instrumentNumber?: string } = {};
    if (deedDate) entry.deedDate = String(deedDate).trim();
    if (volume && String(volume).trim()) entry.volume = String(volume).trim();
    if (page && String(page).trim()) entry.page = String(page).trim();
    if (instrNum && String(instrNum).trim()) entry.instrumentNumber = String(instrNum).trim();
    result.deedHistory = [entry];
    if (entry.instrumentNumber) {
      result.instrumentNumbers = [entry.instrumentNumber];
    }
  }

  if (geometry && typeof geometry === 'object') {
    const geo = geometry as Record<string, unknown>;
    const rings = geo['rings'];
    if (Array.isArray(rings)) {
      result.parcelRings = rings as number[][][];
    }
  }
  return result;
}

interface ArcGisFeatureSet {
  features?: Array<{ attributes: Record<string, unknown>; geometry?: unknown }>;
}

async function queryArcGisLayer(
  url: string,
  params: Record<string, string>,
  logger: PipelineLogger,
): Promise<ArcGisFeatureSet | null> {
  const qs = new URLSearchParams({ ...params, f: 'json' }).toString();
  const fullUrl = `${url}?${qs}`;
  try {
    const resp = await fetch(fullUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as ArcGisFeatureSet;
    return json;
  } catch (err) {
    logger.warn('Stage1E', `ArcGIS query failed: ${fullUrl} — ${String(err)}`);
    return null;
  }
}

/**
 * Query the BIS GIS ArcGIS REST API to retrieve property data.
 * Tries property ID lookup, then geocode-based spatial query, then owner name search.
 * Does not require Playwright — uses the ArcGIS HTTP REST API directly.
 */
export async function searchBisGis(
  gisBaseUrl: string,
  logger: PipelineLogger,
  options: {
    propertyId?: string;
    address?: string;
    ownerName?: string;
    /** Pre-geocoded coordinates (from Census/Nominatim) — used for spatial
     *  queries when the GIS geocoder is unavailable or returns no results. */
    lat?: number | null;
    lon?: number | null;
    /** Direct ArcGIS layer URLs (FeatureServer/MapServer) — skip service discovery. */
    directLayerUrls?: string[];
  },
): Promise<GisPropertyData | null> {
  const base = gisBaseUrl.endsWith('/') ? gisBaseUrl : `${gisBaseUrl}/`;
  const arcgisBase = `${base}arcgis/rest/services/`;

  const COMMON_SERVICES = ['Parcels', 'ParcelData', 'Cadastral', 'PropertyData'];
  const COMMON_LAYERS = [0, 1, 2];
  const PROP_ID_FIELDS = FIELD_ALIASES.propertyId;

  // ── Direct Layer URLs (preferred path — skips service/layer probing) ───────
  if (options.directLayerUrls?.length) {
    for (const layerUrl of options.directLayerUrls) {
      const queryUrl = layerUrl.endsWith('/query') ? layerUrl : `${layerUrl}/query`;

      // Try property ID query
      if (options.propertyId) {
        for (const field of PROP_ID_FIELDS) {
          const fs = await queryArcGisLayer(queryUrl, {
            where: `${field}='${options.propertyId}'`,
            outFields: '*',
            returnGeometry: 'true',
          }, logger);
          if (fs?.features && fs.features.length > 0) {
            logger.info('Stage1E', `GIS: found via property ID (direct layer) field ${field}`);
            return buildGisPropertyData(fs.features[0].attributes, fs.features[0].geometry);
          }
        }
      }

      // Try spatial query with pre-geocoded coordinates
      if (options.lat && options.lon) {
        logger.info('Stage1E', `GIS: spatial query on direct layer using coords (${options.lat.toFixed(5)}, ${options.lon.toFixed(5)})`);
        const delta = 0.0005;
        const envelope = `${options.lon - delta},${options.lat - delta},${options.lon + delta},${options.lat + delta}`;
        const fs = await queryArcGisLayer(queryUrl, {
          geometry: envelope,
          geometryType: 'esriGeometryEnvelope',
          spatialRel: 'esriSpatialRelIntersects',
          inSR: '4326',
          outFields: '*',
          returnGeometry: 'true',
        }, logger);
        if (fs?.features && fs.features.length > 0) {
          logger.info('Stage1E', `GIS: found via spatial query on direct layer (${fs.features.length} feature(s))`);
          const primary = buildGisPropertyData(fs.features[0].attributes, fs.features[0].geometry);
          // Merge instrument numbers & deed history from all features
          if (fs.features.length > 1) {
            const allInstr = new Set(primary.instrumentNumbers ?? []);
            const allDeed = [...(primary.deedHistory ?? [])];
            for (let i = 1; i < fs.features.length; i++) {
              const extra = buildGisPropertyData(fs.features[i].attributes);
              for (const n of extra.instrumentNumbers ?? []) allInstr.add(n);
              allDeed.push(...(extra.deedHistory ?? []));
            }
            primary.instrumentNumbers = [...allInstr];
            primary.deedHistory = allDeed;
          }
          return primary;
        }
      }

      // Try owner name query
      if (options.ownerName) {
        const safeName = options.ownerName.replace(/'/g, "''");
        for (const field of FIELD_ALIASES.ownerName) {
          const fs = await queryArcGisLayer(queryUrl, {
            where: `${field} LIKE '${safeName}%'`,
            outFields: '*',
            returnGeometry: 'true',
          }, logger);
          if (fs?.features && fs.features.length > 0) {
            logger.info('Stage1E', `GIS: found via owner name on direct layer field ${field}`);
            return buildGisPropertyData(fs.features[0].attributes, fs.features[0].geometry);
          }
        }
      }
    }
  }

  // ── Approach A: Query by Property ID ────────────────────────────────────
  if (options.propertyId) {
    logger.info('Stage1E', `GIS: querying by property ID "${options.propertyId}"`);
    for (const svc of COMMON_SERVICES) {
      for (const layer of COMMON_LAYERS) {
        for (const field of PROP_ID_FIELDS) {
          const layerUrl = `${arcgisBase}${svc}/MapServer/${layer}/query`;
          const fs = await queryArcGisLayer(layerUrl, {
            where: `${field}='${options.propertyId}'`,
            outFields: '*',
            returnGeometry: 'true',
          }, logger);
          if (fs?.features && fs.features.length > 0) {
            const feat = fs.features[0];
            logger.info('Stage1E', `GIS: found via property ID in ${svc}/layer ${layer} field ${field}`);
            return buildGisPropertyData(feat.attributes, feat.geometry);
          }
        }
      }
    }
  }

  // ── Approach B: Geocode address → spatial query ───────────────────────────
  if (options.address) {
    logger.info('Stage1E', `GIS: geocoding address "${options.address}"`);
    const geocodeUrl = `${base}arcgis/rest/services/Locators/Composite_Locator/GeocodeServer/findAddressCandidates`;
    const geocodeResult = await queryArcGisLayer(geocodeUrl, {
      SingleLine: options.address,
      outFields: '*',
      maxLocations: '3',
    }, logger) as (ArcGisFeatureSet & { candidates?: Array<{ location: { x: number; y: number }; score: number }> }) | null;

    const candidates = geocodeResult && 'candidates' in geocodeResult
      ? (geocodeResult as { candidates?: Array<{ location: { x: number; y: number }; score: number }> }).candidates
      : undefined;

    if (candidates && candidates.length > 0) {
      const best = candidates[0];
      const { x, y } = best.location;
      const delta = 0.0005;
      const envelope = `${x - delta},${y - delta},${x + delta},${y + delta}`;

      for (const svc of COMMON_SERVICES) {
        for (const layer of COMMON_LAYERS) {
          const layerUrl = `${arcgisBase}${svc}/MapServer/${layer}/query`;
          const fs = await queryArcGisLayer(layerUrl, {
            geometry: envelope,
            geometryType: 'esriGeometryEnvelope',
            spatialRel: 'esriSpatialRelIntersects',
            outFields: '*',
            returnGeometry: 'true',
          }, logger);
          if (fs?.features && fs.features.length > 0) {
            logger.info('Stage1E', `GIS: found via geocode spatial query in ${svc}/layer ${layer}`);
            return buildGisPropertyData(fs.features[0].attributes, fs.features[0].geometry);
          }
        }
      }
    }
  }

  // ── Approach B2: Spatial query using pre-geocoded coordinates ────────────
  // When the GIS geocoder is unavailable (404) or returns no candidates,
  // fall back to Census/Nominatim coordinates if available.
  if (options.lat && options.lon) {
    logger.info('Stage1E', `GIS: spatial query using pre-geocoded coords (${options.lat.toFixed(5)}, ${options.lon.toFixed(5)})`);
    const delta = 0.0005;
    const envelope = `${options.lon - delta},${options.lat - delta},${options.lon + delta},${options.lat + delta}`;

    for (const svc of COMMON_SERVICES) {
      for (const layer of COMMON_LAYERS) {
        const layerUrl = `${arcgisBase}${svc}/MapServer/${layer}/query`;
        const fs = await queryArcGisLayer(layerUrl, {
          geometry: envelope,
          geometryType: 'esriGeometryEnvelope',
          spatialRel: 'esriSpatialRelIntersects',
          inSR: '4326',
          outFields: '*',
          returnGeometry: 'true',
        }, logger);
        if (fs?.features && fs.features.length > 0) {
          logger.info('Stage1E', `GIS: found via pre-geocoded spatial query in ${svc}/layer ${layer}`);
          return buildGisPropertyData(fs.features[0].attributes, fs.features[0].geometry);
        }
      }
    }
  }

  // ── Approach C: Query by owner name ─────────────────────────────────────
  if (options.ownerName) {
    logger.info('Stage1E', `GIS: querying by owner name "${options.ownerName}"`);
    const safeName = options.ownerName.replace(/'/g, "''");
    for (const svc of COMMON_SERVICES) {
      for (const layer of COMMON_LAYERS) {
        for (const field of FIELD_ALIASES.ownerName) {
          const layerUrl = `${arcgisBase}${svc}/MapServer/${layer}/query`;
          const fs = await queryArcGisLayer(layerUrl, {
            where: `${field} LIKE '${safeName}%'`,
            outFields: '*',
            returnGeometry: 'true',
          }, logger);
          if (fs?.features && fs.features.length > 0) {
            logger.info('Stage1E', `GIS: found via owner name in ${svc}/layer ${layer} field ${field}`);
            return buildGisPropertyData(fs.features[0].attributes, fs.features[0].geometry);
          }
        }
      }
    }
  }

  logger.info('Stage1E', 'GIS: no results found across all query approaches');
  return null;
}
