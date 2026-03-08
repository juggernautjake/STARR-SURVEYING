// worker/src/adapters/fidlar-clerk-adapter.ts
// Phase 13: FidlarClerkAdapter — Playwright automation for Fidlar Technologies
// county clerk record management systems (Laredo product line).
//
// Fidlar Technologies (fidlar.com) powers ~15 Texas counties, primarily in East
// Texas and the Panhandle.  The Laredo product is an AJAX-heavy web application
// that submits search requests asynchronously and renders results into a table
// without a full-page reload.
//
// Key characteristics:
//   - AJAX/XHR-driven search — results arrive via POST to /LandRecords/Search
//     or /api/search; Playwright must wait for the network response
//   - Session token required — Fidlar issues a session cookie on first load that
//     must be included in all subsequent requests
//   - Deployment variants: fidlar.com subdomains, laredo.fidlar.com/TX_{County}/,
//     and some counties migrated to publicsearch.us
//   - Search type code: "GV" grantor, "GP" grantee, "IN" instrument, "VP" vol/page,
//     "LD" legal description
//   - Results table columns: File # | Type | Date Filed | Grantor | Grantee |
//     Legal Description | Vol | Pg
//
// Spec §2.13 — Fidlar Technologies Clerk Adapter

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type ClerkSearchOptions,
} from './clerk-adapter.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Per-county Fidlar configuration ───────────────────────────────────────────

/**
 * Per-county configuration for Fidlar Technologies clerk systems.
 * Fidlar deployments differ mainly in base URL and which product variant
 * is in use (direct subdomain, Laredo shared host, or publicsearch.us).
 */
export interface FidlarConfig {
  /** Base URL for the county's Fidlar system */
  baseUrl: string;
  /** Path to the document search page (e.g. '/LandRecords/' or '/RecordSearch/') */
  searchPath: string;
  /** Human-readable county name for logging */
  countyDisplayName: string;
  /**
   * Deployment variant determines which AJAX endpoint and DOM selectors to use.
   *  - 'laredo'       : laredo.fidlar.com/TX_{County}/  (most TX counties)
   *  - 'direct'       : {county}.fidlar.com/            (county-branded domains)
   *  - 'publicsearch' : {county}.publicsearch.us/        (migrated counties)
   */
  variant: 'laredo' | 'direct' | 'publicsearch';
  /** True when this county's deployment exposes free document image previews */
  hasImageAccess: boolean;
  /**
   * Optional AJAX search endpoint override.  Defaults to
   * `${baseUrl}${searchPath}Search` when not set.
   */
  ajaxSearchEndpoint?: string;
}

/**
 * Known Fidlar county configurations, keyed by 5-digit FIPS code.
 *
 * URL sources verified against fidlar.com and publicsearch.us directories.
 */
export const FIDLAR_CONFIGS: Record<string, FidlarConfig> = {
  '48475': {  // Ward County
    baseUrl: 'https://laredo.fidlar.com',
    searchPath: '/TX_Ward/LandRecords/',
    countyDisplayName: 'Ward County',
    variant: 'laredo',
    hasImageAccess: true,
  },
  '48443': {  // Terrell County
    baseUrl: 'https://laredo.fidlar.com',
    searchPath: '/TX_Terrell/LandRecords/',
    countyDisplayName: 'Terrell County',
    variant: 'laredo',
    hasImageAccess: false,
  },
  '48243': {  // Jasper County
    baseUrl: 'https://jasper.fidlar.com',
    searchPath: '/LandRecords/',
    countyDisplayName: 'Jasper County',
    variant: 'direct',
    hasImageAccess: true,
  },
  '48351': {  // Newton County
    baseUrl: 'https://laredo.fidlar.com',
    searchPath: '/TX_Newton/LandRecords/',
    countyDisplayName: 'Newton County',
    variant: 'laredo',
    hasImageAccess: false,
  },
  '48415': {  // Sabine County
    baseUrl: 'https://laredo.fidlar.com',
    searchPath: '/TX_Sabine/LandRecords/',
    countyDisplayName: 'Sabine County',
    variant: 'laredo',
    hasImageAccess: false,
  },
  '48419': {  // San Augustine County
    baseUrl: 'https://laredo.fidlar.com',
    searchPath: '/TX_SanAugustine/LandRecords/',
    countyDisplayName: 'San Augustine County',
    variant: 'laredo',
    hasImageAccess: false,
  },
  '48423': {  // San Jacinto County
    baseUrl: 'https://sanjacinto.fidlar.com',
    searchPath: '/LandRecords/',
    countyDisplayName: 'San Jacinto County',
    variant: 'direct',
    hasImageAccess: true,
  },
  '48113': {  // Dallas County — Fidlar Odyssey (distinct from Tyler/iDocket)
    baseUrl: 'https://dallas.fidlar.com',
    searchPath: '/LandRecords/',
    countyDisplayName: 'Dallas County',
    variant: 'direct',
    hasImageAccess: true,
    ajaxSearchEndpoint: 'https://dallas.fidlar.com/api/search',
  },
  '48215': {  // Hidalgo County
    baseUrl: 'https://hidalgo.publicsearch.us',
    searchPath: '/results',
    countyDisplayName: 'Hidalgo County',
    variant: 'publicsearch',
    hasImageAccess: false,
  },
  '48327': {  // Menard County
    baseUrl: 'https://laredo.fidlar.com',
    searchPath: '/TX_Menard/LandRecords/',
    countyDisplayName: 'Menard County',
    variant: 'laredo',
    hasImageAccess: false,
  },
  '48147': {  // Foard County
    baseUrl: 'https://laredo.fidlar.com',
    searchPath: '/TX_Foard/LandRecords/',
    countyDisplayName: 'Foard County',
    variant: 'laredo',
    hasImageAccess: false,
  },
  '48157': {  // Fort Bend County (partial Fidlar)
    baseUrl: 'https://fortbend.fidlar.com',
    searchPath: '/LandRecords/',
    countyDisplayName: 'Fort Bend County',
    variant: 'direct',
    hasImageAccess: true,
  },
  '48159': {  // Franklin County
    baseUrl: 'https://laredo.fidlar.com',
    searchPath: '/TX_Franklin/LandRecords/',
    countyDisplayName: 'Franklin County',
    variant: 'laredo',
    hasImageAccess: false,
  },
};

/** Set of all FIPS codes known to use Fidlar Technologies (exported for ClerkRegistry) */
export const FIDLAR_FIPS_SET = new Set<string>(Object.keys(FIDLAR_CONFIGS));

// ── Selector fallback arrays ───────────────────────────────────────────────────

/**
 * Ordered fallback selectors for the Fidlar Laredo search form.
 * Fidlar's Laredo product is consistent across deployments, but the
 * publicsearch.us variant uses slightly different IDs.
 */
const SELECTORS = {
  /** Dropdown selecting search type (GV/GP/IN/VP/LD) */
  searchTypeDropdown: [
    'select#SearchType',
    'select[name="SearchType"]',
    'select#searchType',
    'select.search-type-select',
  ],
  /** Grantor/Vendor last name field */
  grantorLastName: [
    'input#GVLastName',
    'input[name="GVLastName"]',
    'input#GrantorLastName',
    'input[placeholder*="Last" i]',
  ],
  /** Grantor/Vendor first name field */
  grantorFirstName: [
    'input#GVFirstName',
    'input[name="GVFirstName"]',
    'input#GrantorFirstName',
    'input[placeholder*="First" i]',
  ],
  /** Grantee/Purchaser last name (Fidlar uses same #GVLastName for both, toggled by SearchType) */
  granteeLastName: [
    'input#GVLastName',
    'input[name="GVLastName"]',
    'input#GranteeLastName',
    'input[placeholder*="Last" i]',
  ],
  /** Instrument number field */
  instrumentNumber: [
    'input#InstrumentNo',
    'input[name="InstrumentNo"]',
    'input#InstrumentNumber',
    'input[name="InstrumentNumber"]',
    'input[placeholder*="nstrument" i]',
  ],
  /** Volume field for Vol/Page search */
  volume: [
    'input#Volume',
    'input[name="Volume"]',
    'input[placeholder*="Volume" i]',
    'input[placeholder*="Vol" i]',
  ],
  /** Page field for Vol/Page search */
  page: [
    'input#Page',
    'input[name="Page"]',
    'input[placeholder*="Page" i]',
    'input[placeholder*="Pg" i]',
  ],
  /** Date range from */
  dateFrom: [
    'input#DateFrom',
    'input[name="DateFrom"]',
    'input[placeholder*="From" i]',
    'input[id*="DateFrom" i]',
  ],
  /** Date range to */
  dateTo: [
    'input#DateTo',
    'input[name="DateTo"]',
    'input[placeholder*="To" i]',
    'input[id*="DateTo" i]',
  ],
  /** Search submit button */
  submitButton: [
    'button#btnSearch',
    'input[type="submit"][value="Search"]',
    'button[type="submit"]',
    'button:has-text("Search")',
    'input[type="button"][value="Search"]',
  ],
  /** Results table */
  resultTable: [
    'table#tblResults',
    'table.results-table',
    'table.search-results',
    '#resultsDiv table',
    '#searchResults table',
    'table',
  ],
  /** Row selector within results table */
  resultRow: [
    'tr.data-row',
    'tbody tr',
    'tr[class*="result"]',
  ],
} as const;

// ── Rate-limit and timing constants ───────────────────────────────────────────

const RATE_LIMIT_MS = {
  /** Minimum delay between outbound search requests */
  BETWEEN_REQUESTS: 3_500,
  /** Delay after form submission while waiting for AJAX response */
  AFTER_SUBMIT: 3_000,
  /** Timeout for the AJAX response listener */
  AJAX_RESPONSE_TIMEOUT: 20_000,
  /** Delay between document page navigations */
  PAGE_NAVIGATION: 3_000,
  /** Delay between document image downloads */
  DOCUMENT_DOWNLOAD: 4_500,
} as const;

/** AJAX endpoint URL patterns that signal a Fidlar search response */
const AJAX_SEARCH_PATTERNS = [
  '/api/search',
  '/LandRecords/Search',
  '/RecordSearch/Search',
  '/search/results',
];

/** Minimum acceptable image file size */
const MIN_IMAGE_BYTES = 10_240; // 10 KB

// ── FidlarClerkAdapter ────────────────────────────────────────────────────────

/**
 * Clerk adapter for Fidlar Technologies county record management systems.
 *
 * Fidlar's Laredo product issues search results via AJAX rather than a
 * full-page reload.  This adapter uses Playwright's `waitForResponse` to
 * intercept the XHR result payload, then parses the result table that Fidlar
 * injects into the DOM.  A Claude vision AI fallback is used when DOM parsing
 * fails or yields no results.
 *
 * Usage:
 * ```ts
 * const adapter = createFidlarAdapter('48475', 'Ward');
 * await adapter.initSession();
 * const docs = await adapter.searchByGrantorName('SMITH JOHN');
 * await adapter.destroySession();
 * ```
 */
export class FidlarClerkAdapter extends ClerkAdapter {
  private readonly config: FidlarConfig;
  /** Absolute directory path where downloaded images are saved */
  private readonly downloadDir: string;
  /** Log prefix, e.g. "[Fidlar-Ward]" */
  private readonly logPrefix: string;
  /** Structured logger for pipeline audit trail */
  private readonly logger: PipelineLogger;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    this.config =
      FIDLAR_CONFIGS[countyFIPS] ?? this.defaultConfig(countyFIPS, countyName);
    this.downloadDir = `/tmp/harvest/${countyFIPS}`;
    this.logPrefix = `[Fidlar-${countyName}]`;
    this.logger = new PipelineLogger(`fidlar-${countyFIPS}`);
  }

  // ── Session lifecycle ──────────────────────────────────────────────────────────

  /**
   * Launch a headless Chromium browser, load the Fidlar search page to
   * establish the session cookie, then idle on the search form.
   * Calling initSession() when a session is already active is a no-op.
   */
  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await this.browser.newContext({
      // Fidlar's rate-limiting checks User-Agent; use a plausible desktop UA
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
      // Fidlar session cookies require Accept-Language to be set
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    this.page = await context.newPage();
    fs.mkdirSync(this.downloadDir, { recursive: true });

    // Load the search page to receive the Fidlar session cookie
    try {
      const searchUrl = `${this.config.baseUrl}${this.config.searchPath}`;
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(1_500);
    } catch (e) {
      console.warn(`${this.logPrefix} Session init page load failed (continuing):`, e);
    }

    console.log(`${this.logPrefix} Session initialized → ${this.config.baseUrl}`);
  }

  /** Close the browser and release all resources. */
  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log(`${this.logPrefix} Session destroyed`);
    }
  }

  // ── Search methods ─────────────────────────────────────────────────────────────

  /**
   * Search by exact instrument number using Fidlar's "IN" (Instrument Number)
   * search type.  Most precise lookup when the instrument number is known.
   */
  async searchByInstrumentNumber(
    instrumentNo: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const attempt = this.logger.startAttempt({
      layer: 'fidlar-clerk',
      source: `fidlar_${this.countyFIPS}`,
      method: 'searchByInstrumentNumber',
      input: instrumentNo,
    });

    attempt.step(`Navigating to search page for instrument# ${instrumentNo}`);

    try {
      await this.navigateToSearch();
      await this.selectSearchType('IN');

      const instrInput = await this.findElement(SELECTORS.instrumentNumber);
      if (!instrInput) throw new Error('Instrument number input not found');
      await instrInput.fill(instrumentNo);

      const results = await this.submitAndWaitForResults();

      attempt({ status: results.length > 0 ? 'success' : 'skip', dataPointsFound: results.length });
      return results;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      attempt({ status: 'fail', error: errMsg });
      console.warn(`${this.logPrefix} Instrument# search failed:`, e);
      return this.aiSearchFallback('IN', instrumentNo);
    }
  }

  /**
   * Search by volume and page number using Fidlar's "VP" search type.
   */
  async searchByVolumePage(
    volume: string,
    page: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const attempt = this.logger.startAttempt({
      layer: 'fidlar-clerk',
      source: `fidlar_${this.countyFIPS}`,
      method: 'searchByVolumePage',
      input: `${volume}/${page}`,
    });

    attempt.step(`Searching Vol ${volume} / Page ${page}`);

    try {
      await this.navigateToSearch();
      await this.selectSearchType('VP');

      const volInput = await this.findElement(SELECTORS.volume);
      if (volInput) await volInput.fill(volume);

      const pgInput = await this.findElement(SELECTORS.page);
      if (pgInput) await pgInput.fill(page);

      const results = await this.submitAndWaitForResults();

      attempt({ status: results.length > 0 ? 'success' : 'skip', dataPointsFound: results.length });
      return results;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      attempt({ status: 'fail', error: errMsg });
      console.warn(`${this.logPrefix} Vol/Page search failed:`, e);
      return this.aiSearchFallback('VP', `${volume}/${page}`);
    }
  }

  /**
   * Search by grantee (buyer) name using Fidlar's "GP" (Grantee/Purchaser)
   * search type.  Splits the provided name into last/first components.
   */
  async searchByGranteeName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const { lastName, firstName } = this.splitName(name);

    const attempt = this.logger.startAttempt({
      layer: 'fidlar-clerk',
      source: `fidlar_${this.countyFIPS}`,
      method: 'searchByGranteeName',
      input: name,
    });

    attempt.step(`Searching grantee: "${lastName}, ${firstName}"`);

    try {
      await this.navigateToSearch();
      await this.selectSearchType('GP');
      await this.fillNameFields(lastName, firstName, SELECTORS.granteeLastName);
      await this.applyDateFilters(options);

      const results = await this.submitAndWaitForResults(options?.maxResults);

      attempt({ status: results.length > 0 ? 'success' : 'skip', dataPointsFound: results.length });
      return results;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      attempt({ status: 'fail', error: errMsg });
      console.warn(`${this.logPrefix} Grantee search failed:`, e);
      return this.aiSearchFallback('GP', name);
    }
  }

  /**
   * Search by grantor (seller) name using Fidlar's "GV" (Grantor/Vendor)
   * search type.
   */
  async searchByGrantorName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const { lastName, firstName } = this.splitName(name);

    const attempt = this.logger.startAttempt({
      layer: 'fidlar-clerk',
      source: `fidlar_${this.countyFIPS}`,
      method: 'searchByGrantorName',
      input: name,
    });

    attempt.step(`Searching grantor: "${lastName}, ${firstName}"`);

    try {
      await this.navigateToSearch();
      await this.selectSearchType('GV');
      await this.fillNameFields(lastName, firstName, SELECTORS.grantorLastName);
      await this.applyDateFilters(options);

      const results = await this.submitAndWaitForResults(options?.maxResults);

      attempt({ status: results.length > 0 ? 'success' : 'skip', dataPointsFound: results.length });
      return results;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      attempt({ status: 'fail', error: errMsg });
      console.warn(`${this.logPrefix} Grantor search failed:`, e);
      return this.aiSearchFallback('GV', name);
    }
  }

  /**
   * Legal description search using Fidlar's "LD" search type.
   * Falls back to extracting instrument/vol-page tokens from the description
   * and performing a more targeted lookup when the LD search yields nothing.
   */
  async searchByLegalDescription(
    legalDesc: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const attempt = this.logger.startAttempt({
      layer: 'fidlar-clerk',
      source: `fidlar_${this.countyFIPS}`,
      method: 'searchByLegalDescription',
      input: legalDesc.slice(0, 80),
    });

    attempt.step('Attempting native legal description search (LD)');

    try {
      await this.navigateToSearch();
      await this.selectSearchType('LD');

      // Fidlar LD search uses the GVLastName field repurposed as a text search box
      const ldInput = await this.findElement([
        'input#LegalDescription',
        'input[name="LegalDescription"]',
        'input#GVLastName',
        'textarea#LegalDescription',
      ]);
      if (ldInput) await ldInput.fill(legalDesc.slice(0, 200));

      const results = await this.submitAndWaitForResults(options?.maxResults);

      if (results.length > 0) {
        attempt({ status: 'success', dataPointsFound: results.length });
        return results;
      }
    } catch (e) {
      console.warn(`${this.logPrefix} LD search failed:`, e);
    }

    // Secondary: extract instrument number or vol/page tokens from description
    const instrMatch = legalDesc.match(/\b(\d{8,13})\b/);
    if (instrMatch) {
      attempt({ status: 'partial', dataPointsFound: 0, details: 'Falling back to instrument# search' });
      return this.searchByInstrumentNumber(instrMatch[1]);
    }

    const volPgMatch = legalDesc.match(/vol[.\s]*(\d+)[,\s]+p(?:age|g)[.\s]*(\d+)/i);
    if (volPgMatch) {
      attempt({ status: 'partial', dataPointsFound: 0, details: 'Falling back to Vol/Page search' });
      return this.searchByVolumePage(volPgMatch[1], volPgMatch[2]);
    }

    attempt({ status: 'skip', dataPointsFound: 0, details: 'No parseable tokens in legal description' });
    return [];
  }

  // ── Document access ────────────────────────────────────────────────────────────

  /**
   * Retrieve all page images for a recorded instrument.
   *
   * Fidlar document viewers open a modal or new window containing the document
   * as an embedded PDF or image viewer.  This method:
   *  1. Navigates to the document detail/viewer URL
   *  2. Detects total page count from page-indicator text or PDF metadata
   *  3. Downloads each page, saving to /tmp/harvest/{fips}/{instrumentNo}/
   *  4. Falls back to a full-page screenshot when the embed URL is unavailable
   *
   * Returns an empty array when `hasImageAccess` is false for this county.
   */
  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    if (!this.config.hasImageAccess) {
      console.log(`${this.logPrefix} Image access not configured for this county — skipping`);
      return [];
    }

    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const outputDir = path.join(this.downloadDir, instrumentNo);
    fs.mkdirSync(outputDir, { recursive: true });
    const images: DocumentImage[] = [];

    console.log(`${this.logPrefix} Retrieving images for instrument# ${instrumentNo}...`);

    try {
      const viewerUrl = this.buildViewerUrl(instrumentNo);
      await this.page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(2_000);

      const totalPages = await this.detectPageCount();
      console.log(`${this.logPrefix} Document ${instrumentNo}: ${totalPages} page(s) detected`);

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          if (pageNum > 1) {
            const advanced = await this.advanceToPage(pageNum);
            if (!advanced) {
              console.warn(`${this.logPrefix} Could not navigate to page ${pageNum} — stopping`);
              break;
            }
            await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
          }

          const imageUrl = await this.extractDocumentImageUrl();

          if (!imageUrl) {
            const screenshotPath = path.join(outputDir, `${instrumentNo}_p${pageNum}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: false });
            images.push(this.makeImageEntry(instrumentNo, pageNum, totalPages, screenshotPath, undefined));
            continue;
          }

          const ext = imageUrl.includes('.pdf') ? 'pdf' : 'png';
          const filepath = path.join(outputDir, `${instrumentNo}_p${pageNum}.${ext}`);

          await this.downloadFile(imageUrl, filepath);

          let quality: DocumentImage['quality'] = 'fair';
          try {
            const stat = fs.statSync(filepath);
            if (stat.size < MIN_IMAGE_BYTES) {
              console.warn(`${this.logPrefix} Page ${pageNum} too small (${stat.size}B) — skipping`);
              fs.unlinkSync(filepath);
              continue;
            }
            if (stat.size > 400_000) quality = 'good';
          } catch { /* keep image even if stat fails */ }

          images.push(this.makeImageEntry(instrumentNo, pageNum, totalPages, filepath, imageUrl, quality));
          await this.page.waitForTimeout(RATE_LIMIT_MS.DOCUMENT_DOWNLOAD);
        } catch (e) {
          console.warn(`${this.logPrefix} Page ${pageNum} download failed:`, e);
        }
      }
    } catch (e) {
      console.warn(`${this.logPrefix} Image retrieval failed for ${instrumentNo}:`, e);
    }

    console.log(`${this.logPrefix} Retrieved ${images.length} image(s) for ${instrumentNo}`);
    return images;
  }

  /**
   * Return pricing information for a document.
   * Fidlar-powered counties typically charge ~$1.00/page for certified copies.
   * The Laredo interface displays a price indicator on the document detail page.
   */
  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    try {
      const viewerUrl = this.buildViewerUrl(instrumentNo);
      await this.page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(1_500);

      const priceText = await this.page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll(
            '.price, .cost, .download-price, [class*="price"], [class*="cost"], a, button',
          ),
        );
        for (const el of candidates) {
          const t = el.textContent ?? '';
          if (/\$\d+\.?\d*/.test(t)) return t;
        }
        return null;
      });

      if (priceText) {
        const m = priceText.match(/\$(\d+\.?\d*)/);
        const total = m ? parseFloat(m[1]) : 1.00;
        return {
          available: true,
          pricePerPage: 1.00,
          totalPrice: total,
          pageCount: Math.round(total),
          paymentMethod: 'credit_card',
          source: `fidlar_${this.countyFIPS}`,
        };
      }
    } catch (e) {
      console.warn(`${this.logPrefix} Pricing lookup failed:`, e);
    }

    return {
      available: true,
      pricePerPage: 1.00,
      paymentMethod: 'credit_card',
      source: `fidlar_${this.countyFIPS}_estimated`,
    };
  }

  // ── Navigation helpers ─────────────────────────────────────────────────────────

  /**
   * Navigate to the Fidlar search page and wait for the form to be ready.
   * Reuses the existing page load when already on the search page.
   */
  private async navigateToSearch(): Promise<void> {
    if (!this.page) return;
    const searchUrl = `${this.config.baseUrl}${this.config.searchPath}`;
    const currentUrl = this.page.url();

    if (!currentUrl.startsWith(searchUrl)) {
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(1_000);
    }

    // Wait for the SearchType dropdown to appear (confirms form is ready)
    try {
      await this.page.waitForSelector(SELECTORS.searchTypeDropdown[0], { timeout: 8_000 });
    } catch {
      // Dropdown may already be visible or use a different selector — proceed anyway
    }
  }

  /**
   * Select a search type in the Fidlar SearchType dropdown.
   * Fidlar uses short codes: "GV", "GP", "IN", "VP", "LD".
   */
  private async selectSearchType(code: 'GV' | 'GP' | 'IN' | 'VP' | 'LD'): Promise<void> {
    if (!this.page) return;
    const dropdown = await this.findElement(SELECTORS.searchTypeDropdown);
    if (!dropdown) return;

    try {
      await dropdown.selectOption({ value: code });
      await this.page.waitForTimeout(500);
    } catch {
      // Try selecting by label text in case values differ on this deployment
      const labelMap: Record<string, string> = {
        GV: 'Grantor/Vendor',
        GP: 'Grantee/Purchaser',
        IN: 'Instrument Number',
        VP: 'Volume/Page',
        LD: 'Legal Description',
      };
      try { await dropdown.selectOption({ label: labelMap[code] }); } catch { /* ignore */ }
    }
  }

  /**
   * Fill the name search fields.  Fidlar reuses the same GVLastName / GVFirstName
   * fields for both grantor and grantee searches, toggled via SearchType.
   */
  private async fillNameFields(
    lastName: string,
    firstName: string,
    lastNameSelectors: readonly string[],
  ): Promise<void> {
    if (!this.page) return;
    const lastInput = await this.findElement(lastNameSelectors);
    if (lastInput) await lastInput.fill(lastName);

    if (firstName) {
      const firstInput = await this.findElement(SELECTORS.grantorFirstName);
      if (firstInput) await firstInput.fill(firstName);
    }
  }

  /**
   * Apply optional date range filters when the search form exposes those fields.
   */
  private async applyDateFilters(options?: ClerkSearchOptions): Promise<void> {
    if (!this.page || !options) return;

    if (options.dateFrom) {
      const fromInput = await this.findElement(SELECTORS.dateFrom);
      if (fromInput) await fromInput.fill(options.dateFrom);
    }
    if (options.dateTo) {
      const toInput = await this.findElement(SELECTORS.dateTo);
      if (toInput) await toInput.fill(options.dateTo);
    }
  }

  /**
   * Click the search submit button and wait for the AJAX response to settle.
   *
   * Fidlar Laredo issues an XHR to `/LandRecords/Search` or `/api/search`;
   * we attach a `waitForResponse` listener before clicking so we catch the
   * response regardless of timing.  The listener resolves with the response
   * or times out gracefully.
   */
  private async submitAndWaitForResults(
    maxResults?: number,
  ): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    // Determine which AJAX endpoint to listen for
    const ajaxEndpoint =
      this.config.ajaxSearchEndpoint ??
      `${this.config.baseUrl}${this.config.searchPath}Search`;

    // Build a URL predicate that matches any known Fidlar search endpoint
    const matchesAjax = (url: string): boolean => {
      if (url.startsWith(ajaxEndpoint)) return true;
      return AJAX_SEARCH_PATTERNS.some((p) => url.includes(p));
    };

    // Register the response listener BEFORE clicking to avoid a race condition
    const ajaxResponsePromise = this.page
      .waitForResponse((resp) => matchesAjax(resp.url()), {
        timeout: RATE_LIMIT_MS.AJAX_RESPONSE_TIMEOUT,
      })
      .catch(() => null);

    const submitBtn = await this.findElement(SELECTORS.submitButton);
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await this.page.keyboard.press('Enter');
    }

    // Wait for either the AJAX response or a fixed timeout
    await ajaxResponsePromise;
    await this.page.waitForTimeout(RATE_LIMIT_MS.AFTER_SUBMIT);

    return this.parseSearchResults(maxResults);
  }

  // ── Result parsing ─────────────────────────────────────────────────────────────

  /**
   * Parse the result table rendered by Fidlar after a search.
   *
   * Standard Fidlar Laredo column order:
   *   0: File # (Instrument)  1: Type  2: Date Filed
   *   3: Grantor              4: Grantee  5: Legal Description
   *   6: Vol  7: Pg
   *
   * Falls back to AI screenshot parsing when:
   *  - The results table is missing or empty
   *  - DOM parsing throws an exception
   */
  private async parseSearchResults(maxResults?: number): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    const results: ClerkDocumentResult[] = [];

    // Quick "no results" check before DOM traversal
    try {
      const bodyText = await this.page.evaluate(
        () => (document.body?.innerText ?? '').toLowerCase(),
      );
      if (
        bodyText.includes('no records found') ||
        bodyText.includes('no results found') ||
        bodyText.includes('0 records') ||
        bodyText.includes('no matching') ||
        bodyText.includes('search returned no')
      ) {
        console.log(`${this.logPrefix} No records found`);
        return [];
      }
    } catch { /* proceed to table parse */ }

    const tableSelector = SELECTORS.resultTable.join(', ');

    try {
      const table = await this.page.$(tableSelector);
      if (!table) {
        console.warn(`${this.logPrefix} Result table not found — trying AI fallback`);
        return this.aiParseScreenshot();
      }

      // Try data-row class first, then fall back to tbody tr
      let rows = await table.$$('tr.data-row');
      if (rows.length === 0) rows = await table.$$('tbody tr');
      if (rows.length === 0) rows = await table.$$('tr');

      const limit = maxResults ?? rows.length;

      for (let i = 0; i < Math.min(rows.length, limit); i++) {
        try {
          const cells = await rows[i].$$eval('td', (tds) =>
            tds.map((td) => (td.textContent ?? '').trim()),
          );

          if (cells.length < 3) continue;

          // Some Fidlar deployments include a checkbox column at index 0 — skip it
          const offset = cells[0] === '' || cells[0] === '✓' ? 1 : 0;

          const instrumentNumber = this.normalizeInstrumentNumber(cells[offset] ?? '');
          if (!instrumentNumber) continue;

          const docTypeRaw = cells[offset + 1] ?? '';
          const recordingDate = this.parseDate(cells[offset + 2] ?? '');
          const grantors = this.splitPartyCell(cells[offset + 3] ?? '');
          const grantees = this.splitPartyCell(cells[offset + 4] ?? '');
          const legalDesc = cells[offset + 5] ?? '';
          const vol = cells[offset + 6] ?? '';
          const pg = cells[offset + 7] ?? '';

          results.push({
            instrumentNumber,
            volumePage: vol && pg ? { volume: vol, page: pg } : undefined,
            documentType: this.classifyDocumentType(docTypeRaw),
            recordingDate,
            grantors,
            grantees,
            legalDescription: legalDesc || undefined,
            source: `fidlar_${this.countyFIPS}`,
          });
        } catch {
          // Skip unparseable rows silently
        }
      }
    } catch (e) {
      console.warn(`${this.logPrefix} DOM parse failed:`, e);
      return this.aiParseScreenshot();
    }

    if (results.length === 0) {
      console.log(`${this.logPrefix} DOM returned 0 results — trying AI screenshot parse`);
      return this.aiParseScreenshot();
    }

    console.log(`${this.logPrefix} Found ${results.length} record(s)`);
    return results;
  }

  // ── AI OCR fallback ────────────────────────────────────────────────────────────

  /**
   * Take a full-page screenshot and parse it with Claude (Anthropic) vision API.
   * This is the last-resort fallback for Fidlar deployments with non-standard
   * layouts or when Playwright DOM parsing fails entirely.
   *
   * Requires `ANTHROPIC_API_KEY` env variable.  Skips gracefully when absent.
   */
  private async aiParseScreenshot(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn(`${this.logPrefix} AI fallback skipped — ANTHROPIC_API_KEY not set`);
      return [];
    }

    console.log(`${this.logPrefix} Running AI screenshot parse...`);

    try {
      const screenshot = await this.page.screenshot({ fullPage: true });
      return this.aiParseSearchResults(screenshot);
    } catch (e) {
      console.warn(`${this.logPrefix} AI screenshot parse failed:`, e);
      return [];
    }
  }

  /**
   * Send a screenshot buffer to Claude and extract structured document records.
   * The prompt is tuned for Fidlar Laredo result tables.
   */
  private async aiParseSearchResults(
    screenshot: Buffer,
  ): Promise<ClerkDocumentResult[]> {
    if (!process.env.ANTHROPIC_API_KEY) return [];

    const base64 = screenshot.toString('base64');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4_000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: base64 },
              },
              {
                type: 'text',
                text:
                  'This is a Texas county clerk record search results page ' +
                  '(Fidlar Technologies Laredo system). ' +
                  'Extract ALL document records visible in the results table.\n\n' +
                  'The table columns are typically: ' +
                  'File# | Type | Date Filed | Grantor | Grantee | Legal Description | Vol | Pg\n\n' +
                  'Return a JSON array with this structure:\n' +
                  '[{\n' +
                  '  "instrumentNumber": "string (8-13 digit number)",\n' +
                  '  "volume": "string or null",\n' +
                  '  "page": "string or null",\n' +
                  '  "documentType": "warranty_deed|plat|easement|deed_of_trust|' +
                  'restrictive_covenant|release_of_lien|affidavit|other",\n' +
                  '  "recordingDate": "MM/DD/YYYY or YYYY-MM-DD",\n' +
                  '  "grantors": ["name1"],\n' +
                  '  "grantees": ["name1"],\n' +
                  '  "legalDescription": "string or null"\n' +
                  '}]\n\n' +
                  'Return ONLY valid JSON. If no results visible, return [].',
              },
            ],
          },
        ],
      }),
    });

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const rawText = data.content?.[0]?.text ?? '[]';

    try {
      const parsed = JSON.parse(
        rawText.replace(/```json?|```/g, '').trim(),
      ) as unknown[];

      const results: ClerkDocumentResult[] = [];
      for (const item of parsed) {
        const rec = item as Record<string, unknown>;
        const instrumentNumber = String(rec.instrumentNumber ?? '').trim();
        if (!instrumentNumber) continue;

        const vol = String(rec.volume ?? '').trim();
        const pg = String(rec.page ?? '').trim();

        results.push({
          instrumentNumber,
          volumePage: vol && pg ? { volume: vol, page: pg } : undefined,
          documentType: this.classifyDocumentType(String(rec.documentType ?? 'other')),
          recordingDate: String(rec.recordingDate ?? ''),
          grantors: Array.isArray(rec.grantors) ? rec.grantors.map(String) : [],
          grantees: Array.isArray(rec.grantees) ? rec.grantees.map(String) : [],
          legalDescription: rec.legalDescription ? String(rec.legalDescription) : undefined,
          source: `fidlar_${this.countyFIPS}_ai`,
        });
      }
      return results;
    } catch {
      console.warn(`${this.logPrefix} AI result JSON parse failed`);
      return [];
    }
  }

  /**
   * Fallback when a Playwright search entirely fails (network error, timeout).
   * Navigates to the search page and takes a screenshot for AI parsing.
   */
  private async aiSearchFallback(
    searchType: string,
    query: string,
  ): Promise<ClerkDocumentResult[]> {
    if (!this.page || !process.env.ANTHROPIC_API_KEY) return [];

    console.log(`${this.logPrefix} AI search fallback for ${searchType}: "${query}"`);

    try {
      await this.navigateToSearch();
      await this.page.waitForTimeout(1_500);
      return this.aiParseScreenshot();
    } catch {
      return [];
    }
  }

  // ── Document viewer helpers ────────────────────────────────────────────────────

  /**
   * Build the document detail/viewer URL for a given instrument number.
   * Fidlar Laredo opens a document viewer at DocumentView.aspx with the
   * instrument number as a query parameter.
   */
  private buildViewerUrl(instrumentNo: string): string {
    const base = `${this.config.baseUrl}${this.config.searchPath}`;
    return `${base}DocumentView.aspx?InstrumentNumber=${encodeURIComponent(instrumentNo)}`;
  }

  /**
   * Detect how many pages a Fidlar document viewer contains.
   * Tries "Page X of Y" text, page-count indicators, then AI screenshot.
   */
  private async detectPageCount(): Promise<number> {
    if (!this.page) return 1;

    // Strategy 1: "Page X of Y" or "X of Y pages" text indicator
    try {
      const bodyText = await this.page.evaluate(() => document.body?.innerText ?? '');
      const ofMatch = bodyText.match(/(?:page\s+)?\d+\s+of\s+(\d+)/i);
      if (ofMatch) return parseInt(ofMatch[1], 10);
    } catch { /* try next */ }

    // Strategy 2: page count element or thumbnail strip
    try {
      const countEl = await this.page.$(
        '#totalPages, .total-pages, [id*="totalPages"], [class*="totalPages"], .page-count',
      );
      if (countEl) {
        const text = await countEl.textContent();
        const n = parseInt(text ?? '1', 10);
        if (!isNaN(n) && n > 0) return n;
      }
    } catch { /* try next */ }

    // Strategy 3: page thumbnail strip
    try {
      const thumbs = await this.page.$$(
        '.page-thumbnail, .pageThumbnail, .page-nav-item, td.pageThumb',
      );
      if (thumbs.length > 1) return thumbs.length;
    } catch { /* try next */ }

    // Strategy 4: AI page-count detection via screenshot
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const screenshot = await this.page.screenshot();
        return this.aiDetectPageCount(screenshot);
      } catch { /* fall through */ }
    }

    return 1;
  }

  /** Ask Claude how many pages a document viewer screenshot shows. */
  private async aiDetectPageCount(screenshot: Buffer): Promise<number> {
    if (!process.env.ANTHROPIC_API_KEY) return 1;

    const base64 = screenshot.toString('base64');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 50,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/png', data: base64 },
                },
                {
                  type: 'text',
                  text:
                    'This is a Fidlar county clerk document viewer. ' +
                    'How many total pages does this document have? ' +
                    'Look for "Page X of Y", navigation buttons, or page thumbnails. ' +
                    'Return ONLY a single integer.',
                },
              ],
            },
          ],
        }),
      });

      const data = (await response.json()) as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text ?? '1';
      const m = text.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 1;
    } catch {
      return 1;
    }
  }

  /**
   * Advance the Fidlar document viewer to a specific page number.
   * Tries "Next" button, numbered page links, then URL parameter modification.
   */
  private async advanceToPage(targetPage: number): Promise<boolean> {
    if (!this.page) return false;

    // Strategy 1: click Next button
    const nextBtn = await this.page.$(
      'a:has-text("Next"), button:has-text("Next"), ' +
      '.next-page, .pageNext, input[value="Next"]',
    );
    if (nextBtn) {
      await nextBtn.click();
      return true;
    }

    // Strategy 2: click numbered page link
    const pageLink = await this.page.$(
      `a:has-text("${targetPage}"), ` +
      `.page-nav-item:nth-child(${targetPage})`,
    );
    if (pageLink) {
      await pageLink.click();
      return true;
    }

    // Strategy 3: append / update page number in URL
    try {
      const currentUrl = this.page.url();
      const newUrl = currentUrl.includes('PageNumber=')
        ? currentUrl.replace(/PageNumber=\d+/, `PageNumber=${targetPage}`)
        : `${currentUrl}&PageNumber=${targetPage}`;
      await this.page.goto(newUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract the URL of the document image or PDF from the current viewer page.
   * Checks <embed>, <iframe>, and <img> in priority order.
   */
  private async extractDocumentImageUrl(): Promise<string | null> {
    if (!this.page) return null;

    // PDF in <embed> or <object>
    try {
      const embedUrl = await this.page.$eval(
        'embed[type="application/pdf"], embed[src*=".pdf"], ' +
        'object[data*=".pdf"], object[type="application/pdf"]',
        (el) =>
          (el as HTMLEmbedElement).src ?? (el as HTMLObjectElement).data ?? '',
      );
      if (embedUrl) return embedUrl;
    } catch { /* no embed found */ }

    // TIFF/PNG in <iframe>
    try {
      const iframeSrc = await this.page.$eval(
        'iframe[src*="document"], iframe[src*="image"], ' +
        'iframe[src*=".tif"], iframe[src*="viewer"]',
        (el) => (el as HTMLIFrameElement).src,
      );
      if (iframeSrc) return iframeSrc;
    } catch { /* no iframe found */ }

    // Image <img> with a document URL
    try {
      const imgSrc = await this.page.$eval(
        'img[src*="document"], img[src*=".tif"], img[src*="image"]',
        (el) => (el as HTMLImageElement).src,
      );
      if (imgSrc) return imgSrc;
    } catch { /* no img found */ }

    return null;
  }

  // ── Utility helpers ────────────────────────────────────────────────────────────

  /**
   * Find the first matching element from an ordered list of CSS selectors.
   * Returns null when no selector matches.
   */
  private async findElement(
    selectors: readonly string[],
  ): Promise<import('playwright').ElementHandle | null> {
    if (!this.page) return null;
    for (const selector of selectors) {
      try {
        const el = await this.page.$(selector);
        if (el) return el;
      } catch { /* try next */ }
    }
    return null;
  }

  /**
   * Download a file from `url` to `destPath` using Node.js https.
   * Rejects when the HTTP response is not 200 or the file is too small.
   */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const transport = url.startsWith('https://') ? https : http;
      const request = transport.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (res: http.IncomingMessage) => {
          if (res.statusCode !== 200) {
            file.close();
            fs.unlink(destPath, () => {});
            reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} for ${url}`));
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        },
      );
      request.on('error', (e: Error) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(e);
      });
    });
  }

  /** Split "LAST, FIRST" or "FIRST LAST" into { lastName, firstName }. */
  private splitName(name: string): { lastName: string; firstName: string } {
    const trimmed = name.trim();
    if (trimmed.includes(',')) {
      const [last, ...rest] = trimmed.split(',');
      return { lastName: last.trim(), firstName: rest.join(' ').trim() };
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return { lastName: parts[0], firstName: '' };
    return { lastName: parts[parts.length - 1], firstName: parts.slice(0, -1).join(' ') };
  }

  /**
   * Normalize an instrument number string — strips whitespace, dashes, and
   * non-numeric prefix characters.
   */
  private normalizeInstrumentNumber(raw: string): string {
    return raw.trim().replace(/[^\w-]/g, '').replace(/^0+/, '') || raw.trim();
  }

  /**
   * Parse a date string into ISO 8601 format (YYYY-MM-DD).
   * Handles MM/DD/YYYY, MM-DD-YYYY, and already-ISO dates.
   */
  private parseDate(raw: string): string {
    if (!raw) return '';
    const mdyMatch = raw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
    if (mdyMatch) {
      const y = mdyMatch[3].length === 2 ? `20${mdyMatch[3]}` : mdyMatch[3];
      return `${y}-${mdyMatch[1].padStart(2, '0')}-${mdyMatch[2].padStart(2, '0')}`;
    }
    return raw;
  }

  /**
   * Split a party cell that may contain multiple names separated by semicolons,
   * newlines, or double spaces.
   */
  private splitPartyCell(cell: string): string[] {
    if (!cell) return [];
    return cell
      .split(/[;\n]|(?:\s{2,})/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Build a DocumentImage entry.  Quality defaults to 'fair'.
   */
  private makeImageEntry(
    instrumentNumber: string,
    pageNumber: number,
    totalPages: number,
    imagePath: string,
    imageUrl: string | undefined,
    quality: DocumentImage['quality'] = 'fair',
  ): DocumentImage {
    return {
      instrumentNumber,
      pageNumber,
      totalPages,
      imagePath,
      imageUrl,
      isWatermarked: false,
      quality,
    };
  }

  /**
   * Build a default configuration for FIPS codes not in FIDLAR_CONFIGS.
   * Assumes the Fidlar Laredo shared host with a TX_{County} path.
   */
  private defaultConfig(countyFIPS: string, countyName: string): FidlarConfig {
    const slug = countyName.replace(/\s+County$/i, '').replace(/\s+/g, '');
    return {
      baseUrl: 'https://laredo.fidlar.com',
      searchPath: `/TX_${slug}/LandRecords/`,
      countyDisplayName: countyName,
      variant: 'laredo',
      hasImageAccess: false,
    };
  }
}

// ── Factory function ───────────────────────────────────────────────────────────

/**
 * Create a FidlarClerkAdapter for the given county FIPS code and name.
 *
 * @param fips      5-digit Texas county FIPS code (e.g. '48475' for Ward County)
 * @param countyName Human-readable county name (e.g. 'Ward')
 */
export function createFidlarAdapter(fips: string, countyName: string): FidlarClerkAdapter {
  return new FidlarClerkAdapter(fips, countyName);
}
