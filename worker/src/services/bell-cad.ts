// worker/src/services/bell-cad.ts — Stage 1: CAD Property Identification
// Layer 1A: HTTP with session cookie acquisition (fixes HTTP 415)
// Layer 1B: Playwright browser automation (tries all exact + partial variants)
// Layer 1C: Screenshot + Claude Vision OCR fallback
// Every result is validated against the original search address.

import type { PropertyIdResult, PropertyValidation, NormalizedAddress, AddressVariant, SearchDiagnostics } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── BIS Consultants eSearch Configuration ──────────────────────────────────

interface BisConfig {
  baseUrl: string;
  name: string;
}

// BIS Consultants eSearch — all known counties within 200-mile radius of Bell County
// organized in concentric rings from Belton, TX outward.
export const BIS_CONFIGS: Record<string, BisConfig> = {
  // ── Ring 0: Bell County ──────────────────────────────────────────
  bell:        { baseUrl: 'https://esearch.bellcad.org', name: 'Bell CAD' },
  // ── Ring 1: Adjacent to Bell (~0-30 mi) ──────────────────────────
  coryell:     { baseUrl: 'https://esearch.coryellcad.org', name: 'Coryell CAD' },
  mclennan:    { baseUrl: 'https://esearch.mclennancad.org', name: 'McLennan CAD' },
  falls:       { baseUrl: 'https://esearch.fallscad.net', name: 'Falls CAD' },
  milam:       { baseUrl: 'https://esearch.milamcad.org', name: 'Milam CAD' },
  williamson:  { baseUrl: 'https://esearch.wilcotx.gov', name: 'Williamson CAD' },
  burnet:      { baseUrl: 'https://esearch.burnet-cad.org', name: 'Burnet CAD' },
  lampasas:    { baseUrl: 'https://esearch.lampasascad.org', name: 'Lampasas CAD' },
  // ── Ring 2: (~30-60 mi) ──────────────────────────────────────────
  hamilton:    { baseUrl: 'https://esearch.hamiltoncad.org', name: 'Hamilton CAD' },
  bosque:      { baseUrl: 'https://esearch.bosquecad.com', name: 'Bosque CAD' },
  hill:        { baseUrl: 'https://esearch.hillcad.org', name: 'Hill CAD' },
  limestone:   { baseUrl: 'https://esearch.limestonecad.org', name: 'Limestone CAD' },
  robertson:   { baseUrl: 'https://esearch.robertsoncad.org', name: 'Robertson CAD' },
  lee:         { baseUrl: 'https://esearch.leecad.org', name: 'Lee CAD' },
  bastrop:     { baseUrl: 'https://esearch.bastropcad.org', name: 'Bastrop CAD' },
  san_saba:    { baseUrl: 'https://esearch.sansabacad.org', name: 'San Saba CAD' },
  mills:       { baseUrl: 'https://esearch.millscad.org', name: 'Mills CAD' },
  // ── Ring 3: (~60-100 mi) ─────────────────────────────────────────
  hays:        { baseUrl: 'https://esearch.hayscad.com', name: 'Hays CAD' },
  guadalupe:   { baseUrl: 'https://esearch.guadalupead.org', name: 'Guadalupe CAD' },
  caldwell:    { baseUrl: 'https://esearch.caldwellcad.org', name: 'Caldwell CAD' },
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
  brazos:      { baseUrl: 'https://esearch.brazoscad.org', name: 'Brazos CAD' },
  burleson:    { baseUrl: 'https://esearch.burlesoncad.org', name: 'Burleson CAD' },
  washington:  { baseUrl: 'https://esearch.washingtoncad.org', name: 'Washington CAD' },
  fayette:     { baseUrl: 'https://esearch.fayettecad.org', name: 'Fayette CAD' },
  gonzales:    { baseUrl: 'https://esearch.gonzalescad.org', name: 'Gonzales CAD' },
  comal:       { baseUrl: 'https://esearch.comalcad.org', name: 'Comal CAD' },
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

// ── Layer 1A: HTTP with Session Cookie Acquisition ─────────────────────────

/**
 * Fix for HTTP 415: First load the search page to acquire session cookies,
 * then POST with those cookies attached.
 */
async function searchCadHttp(
  baseUrl: string,
  variants: AddressVariant[],
  logger: PipelineLogger,
  diagnostics: SearchDiagnostics,
): Promise<CadSearchResult[] | null> {
  const exactVariants = variants.filter((v) => !v.isPartial).sort((a, b) => a.priority - b.priority);
  if (exactVariants.length === 0) return null;

  // Step 1: Acquire session cookies by loading the search page
  let sessionCookies: string | null = null;
  const cookieTracker = logger.startAttempt({
    layer: 'Stage1A-Cookie',
    source: 'CAD-HTTP',
    method: 'session-acquisition',
    input: baseUrl,
  });

  try {
    cookieTracker.step(`Fetching search page to acquire session cookies: ${baseUrl}`);
    const pageResponse = await fetch(baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });

    if (pageResponse.ok) {
      cookieTracker.step(`Page loaded: HTTP ${pageResponse.status}`);
      // Extract Set-Cookie headers
      const setCookie = pageResponse.headers.get('set-cookie');
      if (setCookie) {
        // Parse cookie names and values
        sessionCookies = setCookie
          .split(',')
          .map((c) => c.split(';')[0].trim())
          .filter((c) => c.includes('='))
          .join('; ');
        cookieTracker.step(`Acquired session cookies: ${sessionCookies.substring(0, 80)}...`);
      } else {
        cookieTracker.step('No Set-Cookie headers in response');
      }
      cookieTracker({ status: 'success', dataPointsFound: sessionCookies ? 1 : 0, details: `Cookies: ${sessionCookies ? 'acquired' : 'none'}` });
    } else {
      cookieTracker.step(`Page load failed: HTTP ${pageResponse.status}`);
      cookieTracker({ status: 'fail', error: `HTTP ${pageResponse.status}` });
    }
  } catch (err) {
    cookieTracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
  }

  // Step 2: Try each variant with the session cookies
  for (const variant of exactVariants) {
    const tracker = logger.startAttempt({
      layer: 'Stage1A',
      source: 'CAD-HTTP',
      method: 'POST',
      input: `${variant.streetNumber} ${variant.streetName} (${variant.format})`,
    });

    try {
      const keywords = `StreetNumber:${encodeURIComponent(variant.streetNumber)} StreetName:${encodeURIComponent(variant.streetName)}`;
      const url = `${baseUrl}/search/SearchResults?keywords=${keywords}`;
      tracker.step(`POST ${url}`);

      const headers: Record<string, string> = {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      };
      if (sessionCookies) {
        headers['Cookie'] = sessionCookies;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        tracker.step(`HTTP error: ${response.status} ${response.statusText}`);
        tracker({ status: 'fail', error: `HTTP ${response.status} ${response.statusText}`, nextLayer: 'Stage1B' });
        diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      tracker.step(`Response: HTTP ${response.status}, content-type: ${contentType}`);
      if (!contentType.includes('json')) {
        tracker({ status: 'fail', error: `Non-JSON response: ${contentType}`, nextLayer: 'Stage1B' });
        diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });
        continue;
      }

      const data = await response.json() as { resultsList?: CadSearchResult[] } | CadSearchResult[];
      const results = Array.isArray(data) ? data : data.resultsList ?? [];

      diagnostics.variantsTried.push({
        variant,
        resultCount: results.length,
        hitPropertyId: results.length > 0 ? getProp(results[0], 'propertyId', 'PropertyId') : null,
      });

      if (!results.length) {
        tracker.step('Response parsed but contains 0 results');
        tracker({ status: 'fail', error: 'No results', nextLayer: 'Stage1B' });
        continue;
      }

      tracker.step(`Found ${results.length} results. First ID: ${getProp(results[0], 'propertyId', 'PropertyId') ?? 'N/A'}`);
      tracker({ status: 'success', dataPointsFound: results.length, details: `${results.length} results for variant "${variant.format}"` });
      return results;
    } catch (err) {
      tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err), nextLayer: 'Stage1B' });
      diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });
    }
  }

  return null;
}

// ── Layer 1B: Playwright Browser Automation ────────────────────────────────

async function searchCadPlaywright(
  baseUrl: string,
  variants: AddressVariant[],
  inputAddress: NormalizedAddress,
  logger: PipelineLogger,
  diagnostics: SearchDiagnostics,
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

    // Click "By Address" tab
    try {
      const tabSelectors = [
        'text=By Address',
        'a:has-text("Address")',
        '[data-tab="address"]',
        '.tab:has-text("Address")',
        'li:has-text("Address") a',
        '#searchType_address',
      ];
      for (const sel of tabSelectors) {
        try {
          const tab = page.locator(sel).first();
          if (await tab.isVisible({ timeout: 1_500 })) {
            await tab.click();
            await page.waitForTimeout(800);
            break;
          }
        } catch { continue; }
      }
    } catch {
      // Tab might not exist
    }

    // Set up AJAX response interception with promise-based capture
    let capturedResults: CadSearchResult[] = [];
    let resolveCapture: ((results: CadSearchResult[]) => void) | null = null;

    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('SearchResults') || url.includes('searchresults') || url.includes('Search')) {
          const ct = response.headers()['content-type'] ?? '';
          if (ct.includes('json')) {
            const data = await response.json() as { resultsList?: CadSearchResult[] } | CadSearchResult[];
            const results = Array.isArray(data) ? data : data.resultsList ?? [];
            if (results.length > 0) {
              capturedResults = results;
              if (resolveCapture) resolveCapture(results);
            }
          }
        }
      } catch { /* ignore */ }
    });

    // Identify the input fields
    const numFieldSelectors = [
      'input[name*="StreetNumber" i]', 'input[name*="streetnumber" i]',
      'input[id*="streetnum" i]', 'input[id*="StreetNumber" i]',
      'input[placeholder*="number" i]', 'input[placeholder*="Number" i]',
      '#txtStreetNumber', '#StreetNumber',
    ];
    const nameFieldSelectors = [
      'input[name*="StreetName" i]', 'input[name*="streetname" i]',
      'input[id*="streetname" i]', 'input[id*="StreetName" i]',
      'input[placeholder*="name" i]', 'input[placeholder*="Name" i]',
      '#txtStreetName', '#StreetName',
    ];
    const searchBtnSelectors = [
      'button:has-text("Search")', 'input[type="submit"][value*="Search" i]',
      'button[type="submit"]', '.search-btn', '#btnSearch',
      'input[type="submit"]', 'a:has-text("Search")',
    ];

    // Try each variant
    for (const variant of sortedVariants) {
      capturedResults = []; // Reset for each attempt

      try {
        // Clear and fill fields
        await page.evaluate(
          ([num, name, numSels, nameSels]: [string, string, string[], string[]]) => {
            for (const sel of numSels) {
              const el = document.querySelector(sel) as HTMLInputElement | null;
              if (el) {
                el.value = '';
                el.value = num;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
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
                break;
              }
            }
          },
          [variant.streetNumber, variant.streetName, numFieldSelectors, nameFieldSelectors] as [string, string, string[], string[]],
        );

        // Click search
        let searchClicked = false;
        for (const sel of searchBtnSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1_500 })) {
              await btn.click();
              searchClicked = true;
              break;
            }
          } catch { continue; }
        }

        if (!searchClicked) {
          // Fall back to Enter key
          await page.keyboard.press('Enter');
        }

        // Wait for AJAX response with timeout — fixes race condition where
        // capturedResults was checked before the response callback fired
        const capturePromise = new Promise<CadSearchResult[]>((resolve) => {
          resolveCapture = resolve;
          // If results already captured synchronously (unlikely but safe)
          if (capturedResults.length > 0) resolve(capturedResults);
        });

        // Race between AJAX capture, DOM element appearance, and timeout
        try {
          await Promise.race([
            capturePromise,
            page.waitForSelector('table tbody tr, .search-results tr, .result-row, .property-result, .resultsList', { timeout: 12_000 }),
            page.waitForTimeout(12_000),
          ]);
        } catch { /* timeout or selector not found — continue */ }

        // Small settle delay for any late-arriving AJAX
        await page.waitForTimeout(500);
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

          logger.info('Stage1B', `Variant "${variant.format}" found ${capturedResults.length} results via AJAX`);
          break;
        }

        // If AJAX didn't capture, try DOM extraction
        const domResults = await extractResultsFromDOM(page);
        if (domResults.length > 0) {
          capturedResults = domResults;
          diagnostics.variantsTried.push({
            variant,
            resultCount: domResults.length,
            hitPropertyId: getProp(domResults[0], 'propertyId', 'PropertyId'),
          });
          logger.info('Stage1B', `Variant "${variant.format}" found ${domResults.length} results via DOM`);
          break;
        }

        // Check if "no results" message is shown (don't waste time on more variants of same name)
        const noResultsShown = await page.evaluate(() => {
          const body = document.body.textContent?.toLowerCase() ?? '';
          return body.includes('no results') || body.includes('no records found') || body.includes('0 results');
        });

        diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });

        if (noResultsShown && !variant.isPartial) {
          logger.info('Stage1B', `Variant "${variant.format}" returned "no results" — trying next`);
        }

      } catch (err) {
        logger.warn('Stage1B', `Variant "${variant.format}" failed: ${err instanceof Error ? err.message : String(err)}`);
        diagnostics.variantsTried.push({ variant, resultCount: 0, hitPropertyId: null });
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
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err), nextLayer: 'Stage1C' });
    return { results: [], screenshot, validation: null };
  }
}

// ── DOM Extraction Helper ──────────────────────────────────────────────────

async function extractResultsFromDOM(page: import('playwright').Page): Promise<CadSearchResult[]> {
  return page.evaluate(() => {
    const results: Array<Record<string, string | null>> = [];

    // Strategy 1: Table rows
    const tableRows = document.querySelectorAll('table tbody tr');
    if (tableRows.length > 0) {
      tableRows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        const text = row.textContent?.trim() ?? '';
        const links = Array.from(row.querySelectorAll('a[href]'));

        // Try to find property ID from link
        let propertyId: string | null = null;
        for (const link of links) {
          const href = link.getAttribute('href') ?? '';
          const match = href.match(/(?:Id|id|ID|propertyId)=(\w+)/);
          if (match) { propertyId = match[1]; break; }
        }

        // Try text-based extraction
        if (!propertyId) {
          const idMatch = text.match(/(?:Property\s*(?:ID|#)\s*:?\s*)(\d{4,})/i);
          if (idMatch) propertyId = idMatch[1];
        }

        if (propertyId || cells.length >= 2) {
          results.push({
            propertyId: propertyId ?? cells[0]?.textContent?.trim() ?? null,
            ownerName: cells.length > 1 ? cells[1]?.textContent?.trim() ?? null : null,
            address: cells.length > 2 ? cells[2]?.textContent?.trim() ?? null : text.substring(0, 200),
            legalDescription: cells.length > 3 ? cells[3]?.textContent?.trim() ?? null : null,
          });
        }
      });
    }

    // Strategy 2: Result divs/cards
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
      model: 'claude-sonnet-4-5-20250929',
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
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ── Property Detail Enrichment ─────────────────────────────────────────────

async function enrichPropertyDetail(
  baseUrl: string,
  propertyId: string,
  logger: PipelineLogger,
): Promise<{ acreage: number | null; legalDescription: string | null; propertyType: string | null }> {
  const finish = logger.startAttempt({
    layer: 'Stage1-Detail',
    source: 'CAD-Detail',
    method: 'HTTP-GET',
    input: propertyId,
  });

  try {
    const year = new Date().getFullYear();
    const url = `${baseUrl}/Property/View?Id=${propertyId}&year=${year}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      finish({ status: 'fail', error: `HTTP ${response.status}` });
      return { acreage: null, legalDescription: null, propertyType: null };
    }

    const html = await response.text();

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

    // Extract legal description (try multiple patterns)
    let legalDescription: string | null = null;
    const legalPatterns = [
      /(?:Legal\s*Description|Legal\s*Desc\.?)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i,
      /class="[^"]*legal[^"]*"[^>]*>\s*([^<]+)/i,
      /id="[^"]*legal[^"]*"[^>]*>\s*([^<]+)/i,
    ];
    for (const pattern of legalPatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 5) {
        legalDescription = match[1].trim();
        break;
      }
    }

    // Extract property type
    let propertyType: string | null = null;
    const typeMatch = html.match(/(?:Property\s*Type|Prop\s*Type|Type)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);
    if (typeMatch && typeMatch[1].trim().length > 1) {
      propertyType = typeMatch[1].trim();
    }

    const found = (acreage ? 1 : 0) + (legalDescription ? 1 : 0) + (propertyType ? 1 : 0);
    finish({
      status: found > 0 ? 'success' : 'partial',
      dataPointsFound: found,
      details: `Acreage: ${acreage ?? 'N/A'}, Legal: ${legalDescription ? `${legalDescription.length} chars` : 'N/A'}, Type: ${propertyType ?? 'N/A'}`,
    });

    return { acreage, legalDescription, propertyType };
  } catch (err) {
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return { acreage: null, legalDescription: null, propertyType: null };
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

  const candidates = nonUdi.length > 0 ? nonUdi : results;
  if (candidates.length === 0) return null;

  // Score each candidate
  const scored = candidates.map((r) => {
    const validation = validatePropertyResult(r, inputAddress, logger);
    return { result: r, validation };
  });

  // Sort by confidence descending
  scored.sort((a, b) => b.validation.confidence - a.validation.confidence);

  // Log top candidates
  for (let i = 0; i < Math.min(3, scored.length); i++) {
    const { result: r, validation: v } = scored[i];
    logger.info('Stage1-Pick', `  #${i + 1}: ID=${getProp(r, 'propertyId', 'PropertyId')}, confidence=${v.confidence.toFixed(2)}, addr="${getProp(r, 'address', 'Address', 'situsAddress') ?? 'N/A'}"`);
  }

  // Warn if best match has low confidence
  if (scored[0].validation.confidence < 0.5) {
    logger.warn('Stage1-Pick', `Best match confidence is only ${scored[0].validation.confidence.toFixed(2)} — result may not be correct`);
  }

  return scored[0].result;
}

// ── Main Search Function ───────────────────────────────────────────────────

/**
 * Search for a property in a BIS Consultants eSearch CAD system.
 * Tries HTTP → Playwright → Vision OCR in sequence (layered fallback).
 * All results are validated against the original search address.
 */
export async function searchBisCad(
  county: string,
  normalized: NormalizedAddress,
  anthropicApiKey: string,
  logger: PipelineLogger,
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

  // Layer 1A: HTTP POST with session cookies
  const httpResults = await searchCadHttp(config.baseUrl, variants, logger, diagnostics);
  if (httpResults && httpResults.length > 0) {
    const best = pickBestResult(httpResults, normalized, logger);
    if (best) {
      const propId = getProp(best, 'propertyId', 'PropertyId') ?? '';
      const validation = validatePropertyResult(best, normalized, logger);
      validation.multipleResults = httpResults.length > 1;

      // Only accept if validation passes minimum threshold
      if (validation.confidence >= 0.3) {
        const detail = await enrichPropertyDetail(config.baseUrl, propId, logger);
        diagnostics.searchDuration_ms = Date.now() - searchStart;

        return {
          property: {
            propertyId: propId,
            geoId: getProp(best, 'geoId', 'GeoId'),
            ownerName: getProp(best, 'ownerName', 'OwnerName'),
            legalDescription: detail.legalDescription ?? getProp(best, 'legalDescription', 'LegalDescription'),
            acreage: detail.acreage ?? getNumProp(best, 'acreage', 'Acreage'),
            propertyType: detail.propertyType ?? getProp(best, 'propertyType', 'PropertyType'),
            situsAddress: getProp(best, 'address', 'Address', 'situsAddress', 'SitusAddress'),
            source: config.name,
            layer: 'Stage1A',
            matchConfidence: validation.confidence,
            validationNotes: validation.issues,
          },
          diagnostics,
        };
      } else {
        logger.warn('Stage1A', `Best HTTP result rejected — confidence ${validation.confidence.toFixed(2)} below 0.3 threshold`);
      }
    }
  }

  // Layer 1B: Playwright (tries all variants including partials)
  const { results: pwResults, screenshot, validation: pwValidation } = await searchCadPlaywright(
    config.baseUrl, variants, normalized, logger, diagnostics,
  );

  if (pwResults.length > 0) {
    const best = pickBestResult(pwResults, normalized, logger);
    if (best) {
      const propId = getProp(best, 'propertyId', 'PropertyId') ?? '';
      const validation = pwValidation ?? validatePropertyResult(best, normalized, logger);
      validation.multipleResults = pwResults.length > 1;

      if (validation.confidence >= 0.2) {
        const detail = await enrichPropertyDetail(config.baseUrl, propId, logger);
        diagnostics.searchDuration_ms = Date.now() - searchStart;

        return {
          property: {
            propertyId: propId,
            geoId: getProp(best, 'geoId', 'GeoId'),
            ownerName: getProp(best, 'ownerName', 'OwnerName'),
            legalDescription: detail.legalDescription ?? getProp(best, 'legalDescription', 'LegalDescription'),
            acreage: detail.acreage ?? getNumProp(best, 'acreage', 'Acreage'),
            propertyType: detail.propertyType ?? getProp(best, 'propertyType', 'PropertyType'),
            situsAddress: getProp(best, 'address', 'Address', 'situsAddress', 'SitusAddress'),
            source: config.name,
            layer: 'Stage1B',
            matchConfidence: validation.confidence,
            validationNotes: validation.issues,
          },
          diagnostics,
        };
      } else {
        logger.warn('Stage1B', `Best Playwright result rejected — confidence ${validation.confidence.toFixed(2)} below 0.2 threshold`);
      }
    }
  }

  // Layer 1C: Vision OCR from screenshot
  if (screenshot && screenshot.length > 1000) {
    const visionResults = await extractFromScreenshot(screenshot, anthropicApiKey, logger);
    if (visionResults.length > 0) {
      const best = pickBestResult(visionResults, normalized, logger);
      if (best) {
        const propId = getProp(best, 'propertyId', 'PropertyId', 'property_id') ?? '';
        if (propId) {
          const detail = await enrichPropertyDetail(config.baseUrl, propId, logger);
          const validation = validatePropertyResult(best, normalized, logger);
          validation.multipleResults = visionResults.length > 1;
          diagnostics.searchDuration_ms = Date.now() - searchStart;

          return {
            property: {
              propertyId: propId,
              geoId: getProp(best, 'geoId', 'GeoId', 'geo_id'),
              ownerName: getProp(best, 'ownerName', 'OwnerName', 'owner_name'),
              legalDescription: detail.legalDescription ?? getProp(best, 'legalDescription', 'LegalDescription', 'legal_description'),
              acreage: detail.acreage ?? getNumProp(best, 'acreage', 'Acreage'),
              propertyType: detail.propertyType,
              situsAddress: getProp(best, 'address', 'Address', 'situsAddress', 'SitusAddress'),
              source: config.name,
              layer: 'Stage1C',
              matchConfidence: validation.confidence,
              validationNotes: [...validation.issues, 'Property identified via screenshot OCR — lower reliability'],
            },
            diagnostics,
          };
        }
      }
    }
  }

  logger.error('Stage1', `All CAD search layers exhausted — property not found. Tried ${diagnostics.variantsTried.length} variants.`);
  diagnostics.searchDuration_ms = Date.now() - searchStart;
  return { property: null, diagnostics };
}
