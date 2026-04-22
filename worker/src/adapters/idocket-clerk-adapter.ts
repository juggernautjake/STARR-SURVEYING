// worker/src/adapters/idocket-clerk-adapter.ts
// Phase 13: IDocketClerkAdapter — Playwright automation for iDocket county clerk
// record management systems.
//
// iDocket (idocket.com) is the third most common Texas county clerk system,
// powering ~20 counties across the state.
//
// Key characteristics:
//   - React SPA — all searches happen client-side; DOM changes without full reload
//   - Public/guest mode provides free access to index records (no auth required)
//   - Results paginated at 20 per page
//   - URL pattern: https://idocket.com/TX/{CountyName}/
//   - Strict rate limiting enforced server-side (~5 s between requests)
//   - Document images require subscriber account; index data is free
//
// Spec §2.12 — iDocket Clerk Adapter

import { acquireBrowser } from '../lib/browser-factory.js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type ClerkSearchOptions,
} from './clerk-adapter.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Per-county iDocket configuration ─────────────────────────────────────────

/**
 * Per-county configuration for iDocket systems.
 * All Texas iDocket counties share the same SPA at idocket.com but each county
 * has its own path segment used in the URL.
 */
export interface IDocketConfig {
  /** Full base URL including county segment, e.g. "https://idocket.com/TX/Collin" */
  baseUrl: string;
  /** County name segment used in the URL path (e.g. "Collin") */
  countySlug: string;
  /** Human-readable county name for logging */
  countyDisplayName: string;
  /**
   * Whether this county provides free image previews to guest users.
   * Most iDocket counties require a paid subscriber account for images.
   */
  hasGuestImageAccess: boolean;
  /**
   * Optional override for the result container selector when a county's
   * deployment differs from the standard grid/table layout.
   */
  resultContainerSelector?: string;
}

// ── FIPS → county URL slug mapping ───────────────────────────────────────────

/**
 * Maps FIPS codes to the county name segment used in the iDocket URL path.
 * e.g. '48085' → 'Collin'  →  https://idocket.com/TX/Collin/
 */
export const IDOCKET_COUNTY_NAMES: Record<string, string> = {
  '48085': 'Collin',
  '48121': 'Denton',
  '48149': 'Freestone',
  '48227': 'Howard',
  '48293': 'Limestone',
  '48363': 'PaloPinto',
  '48401': 'Rockwall',
  '48113': 'Dallas',
  '48019': 'Bandera',
  '48023': 'Baylor',
  '48045': 'Briscoe',
  '48059': 'Callahan',
  '48153': 'Garza',
  '48189': 'Hale',
  '48211': 'Haskell',
  '48263': 'Kent',
  '48291': 'Liberty',
  '48303': 'Lynn',
};

/** Known iDocket county configurations keyed by 5-digit FIPS code. */
export const IDOCKET_CONFIGS: Record<string, IDocketConfig> = {
  '48085': {
    baseUrl: 'https://idocket.com/TX/Collin',
    countySlug: 'Collin',
    countyDisplayName: 'Collin County',
    hasGuestImageAccess: false,
  },
  '48121': {
    baseUrl: 'https://idocket.com/TX/Denton',
    countySlug: 'Denton',
    countyDisplayName: 'Denton County',
    hasGuestImageAccess: false,
  },
  '48149': {
    baseUrl: 'https://idocket.com/TX/Freestone',
    countySlug: 'Freestone',
    countyDisplayName: 'Freestone County',
    hasGuestImageAccess: false,
  },
  '48227': {
    baseUrl: 'https://idocket.com/TX/Howard',
    countySlug: 'Howard',
    countyDisplayName: 'Howard County',
    hasGuestImageAccess: false,
  },
  '48293': {
    baseUrl: 'https://idocket.com/TX/Limestone',
    countySlug: 'Limestone',
    countyDisplayName: 'Limestone County',
    hasGuestImageAccess: false,
  },
  '48363': {
    baseUrl: 'https://idocket.com/TX/PaloPinto',
    countySlug: 'PaloPinto',
    countyDisplayName: 'Palo Pinto County',
    hasGuestImageAccess: false,
  },
  '48401': {
    baseUrl: 'https://idocket.com/TX/Rockwall',
    countySlug: 'Rockwall',
    countyDisplayName: 'Rockwall County',
    hasGuestImageAccess: false,
  },
  '48113': {
    baseUrl: 'https://idocket.com/TX/Dallas',
    countySlug: 'Dallas',
    countyDisplayName: 'Dallas County',
    hasGuestImageAccess: false,
  },
  '48019': {
    baseUrl: 'https://idocket.com/TX/Bandera',
    countySlug: 'Bandera',
    countyDisplayName: 'Bandera County',
    hasGuestImageAccess: false,
  },
  '48023': {
    baseUrl: 'https://idocket.com/TX/Baylor',
    countySlug: 'Baylor',
    countyDisplayName: 'Baylor County',
    hasGuestImageAccess: false,
  },
  '48045': {
    baseUrl: 'https://idocket.com/TX/Briscoe',
    countySlug: 'Briscoe',
    countyDisplayName: 'Briscoe County',
    hasGuestImageAccess: false,
  },
  '48059': {
    baseUrl: 'https://idocket.com/TX/Callahan',
    countySlug: 'Callahan',
    countyDisplayName: 'Callahan County',
    hasGuestImageAccess: false,
  },
  '48153': {
    baseUrl: 'https://idocket.com/TX/Garza',
    countySlug: 'Garza',
    countyDisplayName: 'Garza County',
    hasGuestImageAccess: false,
  },
  '48189': {
    baseUrl: 'https://idocket.com/TX/Hale',
    countySlug: 'Hale',
    countyDisplayName: 'Hale County',
    hasGuestImageAccess: false,
  },
  '48211': {
    baseUrl: 'https://idocket.com/TX/Haskell',
    countySlug: 'Haskell',
    countyDisplayName: 'Haskell County',
    hasGuestImageAccess: false,
  },
  '48263': {
    baseUrl: 'https://idocket.com/TX/Kent',
    countySlug: 'Kent',
    countyDisplayName: 'Kent County',
    hasGuestImageAccess: false,
  },
  '48291': {
    baseUrl: 'https://idocket.com/TX/Liberty',
    countySlug: 'Liberty',
    countyDisplayName: 'Liberty County',
    hasGuestImageAccess: false,
  },
  '48303': {
    baseUrl: 'https://idocket.com/TX/Lynn',
    countySlug: 'Lynn',
    countyDisplayName: 'Lynn County',
    hasGuestImageAccess: false,
  },
};

/** Set of all FIPS codes known to use iDocket (exported for ClerkRegistry) */
export const IDOCKET_FIPS_SET = new Set<string>(Object.keys(IDOCKET_CONFIGS));

// ── Selector fallback arrays ───────────────────────────────────────────────────

/**
 * Ordered fallback selectors for iDocket's React SPA interface.
 * The SPA sometimes renders slightly different element structures depending on
 * the county configuration and the current SPA version; always try primary first.
 */
const SELECTORS = {
  /** Main search text input */
  searchInput: [
    'input[placeholder="Search records..."]',
    'input#search-input',
    'input[type="search"]',
    'input[data-testid="search-input"]',
    'input.search-field',
    'input[name="search"]',
    'input[placeholder*="Search" i]',
  ],
  /** "Grantor/Grantee" search type tab or button */
  grantorGranteeTab: [
    'button:has-text("Grantor/Grantee")',
    'button:has-text("Name")',
    '[data-tab="name"]',
    '[data-testid="tab-name"]',
    '.tab-grantor-grantee',
    'a:has-text("Grantor/Grantee")',
  ],
  /** "Instrument #" search type tab */
  instrumentTab: [
    'button:has-text("Instrument")',
    'button:has-text("Instrument #")',
    '[data-tab="instrument"]',
    '[data-testid="tab-instrument"]',
    '.tab-instrument',
    'a:has-text("Instrument")',
  ],
  /** "Volume/Page" search type tab */
  volumePageTab: [
    'button:has-text("Volume/Page")',
    'button:has-text("Vol/Page")',
    '[data-tab="volume"]',
    '[data-testid="tab-volume"]',
    '.tab-volume-page',
    'a:has-text("Volume")',
  ],
  /** Volume input (Volume/Page search mode) */
  volumeInput: [
    'input#volume',
    'input[name="volume"]',
    'input[placeholder*="Volume" i]',
    'input[data-testid="volume-input"]',
    'input.volume-field',
  ],
  /** Page input (Volume/Page search mode) */
  pageInput: [
    'input#page',
    'input[name="page"]',
    'input[placeholder*="Page" i]',
    'input[data-testid="page-input"]',
    'input.page-field',
  ],
  /** Date-from range picker */
  dateFrom: [
    'input[data-testid="date-from"]',
    'input[name="dateFrom"]',
    'input[placeholder*="From" i]',
    'input[aria-label*="from" i]',
    '.date-range-from input',
  ],
  /** Date-to range picker */
  dateTo: [
    'input[data-testid="date-to"]',
    'input[name="dateTo"]',
    'input[placeholder*="To" i]',
    'input[aria-label*="to" i]',
    '.date-range-to input',
  ],
  /** Search submit button */
  submitButton: [
    'button[type="submit"]',
    'button:has-text("Search")',
    '[data-testid="search-button"]',
    'button.search-btn',
    'input[type="submit"]',
  ],
  /** Result rows — iDocket renders results as table rows or card divs */
  resultRows: [
    'tr.record-row',
    'div.record-item',
    'div[data-testid="record"]',
    'table tbody tr',
    '[class*="result-row"]',
    '[class*="record-row"]',
    '.results-grid > div',
    '[data-record]',
  ],
  /** Pagination — "next page" button */
  paginationNext: [
    'button[aria-label="Next page"]',
    'button:has-text("Next")',
    '.pagination-next',
    '[data-testid="pagination-next"]',
    '.next-page',
    'a:has-text("›")',
    'a:has-text("Next")',
  ],
  /** Container that holds all search results */
  resultsContainer: [
    '[data-testid="results-container"]',
    '.results-container',
    '.search-results',
    '#search-results',
    '.results-grid',
    'table.results-table',
    '#resultsPanel',
  ],
  /** "No results" indicator text areas */
  noResultsIndicators: [
    '.no-results',
    '[data-testid="no-results"]',
    '.empty-state',
  ],
} as const;

// ── Rate-limit delays ──────────────────────────────────────────────────────────

const RATE_LIMIT_MS = {
  /** Minimum delay between outbound search requests — iDocket is strict */
  BETWEEN_REQUESTS: 5_000,
  /** Delay after SPA navigation / tab switch before interacting */
  SPA_SETTLE:       2_000,
  /** Delay after form submission before parsing results */
  AFTER_SUBMIT:     3_500,
  /** Delay between page navigations in paginated results */
  PAGE_NAVIGATION:  3_000,
  /** Delay between individual document image downloads */
  DOCUMENT_DOWNLOAD: 5_000,
} as const;

/** Results per page returned by iDocket */
const RESULTS_PER_PAGE = 20;

/** Minimum acceptable image file size — below this is a broken/blank placeholder */
const MIN_IMAGE_BYTES = 10_240; // 10 KB

// ── IDocketClerkAdapter ───────────────────────────────────────────────────────

/**
 * Clerk adapter for iDocket county record management systems.
 *
 * iDocket is a React SPA; all searches require Playwright to drive the
 * browser.  After each form submission the adapter waits for network idle
 * before parsing.  Pagination is handled automatically up to `maxResults`.
 * When DOM parsing fails, Claude vision AI is used as a fallback.
 *
 * Usage:
 * ```ts
 * const adapter = createIDocketAdapter('48085', 'Collin');
 * await adapter.initSession();
 * const docs = await adapter.searchByGrantorName('SMITH JOHN');
 * await adapter.destroySession();
 * ```
 */
export class IDocketClerkAdapter extends ClerkAdapter {
  private readonly config: IDocketConfig;
  /** Absolute directory path where downloaded images are saved */
  private readonly downloadDir: string;
  /** Log prefix, e.g. "[iDocket-Collin]" */
  private readonly logPrefix: string;
  private readonly logger: PipelineLogger;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    this.config =
      IDOCKET_CONFIGS[countyFIPS] ?? this.defaultConfig(countyFIPS, countyName);
    this.downloadDir = `/tmp/harvest/${countyFIPS}`;
    this.logPrefix = `[iDocket-${countyName}]`;
    this.logger = new PipelineLogger(`idocket-${countyFIPS}`);
  }

  // ── Session lifecycle ──────────────────────────────────────────────────────────

  /**
   * Launch a headless Chromium browser and navigate to the iDocket search page.
   * iDocket's SPA is loaded as a guest — no credentials are required for
   * public record index searches.
   * Calling initSession() when a session is already active is a no-op.
   */
  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await acquireBrowser({
      adapterId: 'idocket-clerk',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        'KHTML, like Gecko Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
    });

    this.page = await context.newPage();
    fs.mkdirSync(this.downloadDir, { recursive: true });

    // Warm-up navigation to the county's iDocket landing page
    try {
      await this.page.goto(`${this.config.baseUrl}/`, {
        waitUntil: 'networkidle',
        timeout: 45_000,
      });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SPA_SETTLE);
    } catch {
      // Non-fatal — the SPA may still be interactive even if networkidle times out
    }

    this.logger.info('session', `${this.logPrefix} Session initialized → ${this.config.baseUrl}`);
  }

  /** Close the browser and release all resources. */
  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.logger.info('session', `${this.logPrefix} Session destroyed`);
    }
  }

  // ── Search methods ─────────────────────────────────────────────────────────────

  /**
   * Search by exact instrument number (most precise; preferred when available).
   * Switches to the "Instrument #" tab, enters the number, and submits.
   */
  async searchByInstrumentNumber(
    instrumentNo: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const attempt = this.logger.startAttempt({
      layer: 'clerk-search',
      source: `idocket_${this.countyFIPS}`,
      method: 'searchByInstrumentNumber',
      input: instrumentNo,
    });

    try {
      attempt.step(`Navigating to search page for instrument# ${instrumentNo}`);
      await this.navigateToSearchPage();

      attempt.step('Selecting Instrument # tab');
      await this.clickTab(SELECTORS.instrumentTab);
      await this.page.waitForTimeout(RATE_LIMIT_MS.SPA_SETTLE);

      attempt.step('Filling instrument number input');
      const searchInput = await this.findElement(SELECTORS.searchInput);
      if (searchInput) {
        await searchInput.fill(instrumentNo);
      } else {
        // Some iDocket deployments use a dedicated instrument field
        const instrInput = await this.page.$('input[name="instrumentNumber"], input#instrumentNo');
        if (instrInput) await instrInput.fill(instrumentNo);
      }

      attempt.step('Submitting search and waiting for results');
      await this.submitAndWait();

      const results = await this.parseAllPages(20);

      attempt({ status: results.length > 0 ? 'success' : 'skip', dataPointsFound: results.length });
      return results;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.warn('clerk-search', `${this.logPrefix} Instrument# search failed: ${errMsg}`);
      attempt({ status: 'fail', error: errMsg });
      return this.aiSearchFallback('InstrumentNumber', instrumentNo);
    }
  }

  /**
   * Search by volume and page number.
   * Switches to the "Volume/Page" tab, fills both fields, and submits.
   */
  async searchByVolumePage(
    volume: string,
    pg: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const attempt = this.logger.startAttempt({
      layer: 'clerk-search',
      source: `idocket_${this.countyFIPS}`,
      method: 'searchByVolumePage',
      input: `${volume}/${pg}`,
    });

    try {
      attempt.step(`Navigating to search page for Vol ${volume} / Pg ${pg}`);
      await this.navigateToSearchPage();

      attempt.step('Selecting Volume/Page tab');
      await this.clickTab(SELECTORS.volumePageTab);
      await this.page.waitForTimeout(RATE_LIMIT_MS.SPA_SETTLE);

      attempt.step('Filling volume and page inputs');
      const volInput = await this.findElement(SELECTORS.volumeInput);
      if (volInput) await volInput.fill(volume);

      const pageInput = await this.findElement(SELECTORS.pageInput);
      if (pageInput) await pageInput.fill(pg);

      attempt.step('Submitting search and waiting for results');
      await this.submitAndWait();

      const results = await this.parseAllPages(5);

      attempt({ status: results.length > 0 ? 'success' : 'skip', dataPointsFound: results.length });
      return results;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.warn('clerk-search', `${this.logPrefix} Vol/Page search failed: ${errMsg}`);
      attempt({ status: 'fail', error: errMsg });
      return this.aiSearchFallback('VolumePage', `${volume}/${pg}`);
    }
  }

  /**
   * Search by grantee (buyer / new owner) name.
   * Switches to the "Grantor/Grantee" tab, enters the name, and submits.
   * Applies optional date range and document type filters when provided.
   */
  async searchByGranteeName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const cleanName = this.cleanSearchName(name);
    const attempt = this.logger.startAttempt({
      layer: 'clerk-search',
      source: `idocket_${this.countyFIPS}`,
      method: 'searchByGranteeName',
      input: cleanName,
    });

    try {
      attempt.step(`Navigating to search page for grantee: "${cleanName}"`);
      await this.navigateToSearchPage();

      attempt.step('Selecting Grantor/Grantee tab');
      await this.clickTab(SELECTORS.grantorGranteeTab);
      await this.page.waitForTimeout(RATE_LIMIT_MS.SPA_SETTLE);

      attempt.step('Filling name input');
      await this.fillNameSearch(cleanName);

      if (options) {
        attempt.step('Applying search filters');
        await this.applySearchFilters(options);
      }

      attempt.step('Submitting search and waiting for results');
      await this.submitAndWait();

      const maxResults = options?.maxResults ?? RESULTS_PER_PAGE * 3;
      const results = await this.parseAllPages(maxResults);

      attempt({ status: results.length > 0 ? 'success' : 'skip', dataPointsFound: results.length });
      return results;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.warn('clerk-search', `${this.logPrefix} Grantee search failed: ${errMsg}`);
      attempt({ status: 'fail', error: errMsg });
      return this.aiSearchFallback('Grantee', cleanName);
    }
  }

  /**
   * Search by grantor (seller / previous owner) name.
   * iDocket's Grantor/Grantee tab searches both roles simultaneously;
   * results are returned and labeled with their actual role from the record.
   */
  async searchByGrantorName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const cleanName = this.cleanSearchName(name);
    const attempt = this.logger.startAttempt({
      layer: 'clerk-search',
      source: `idocket_${this.countyFIPS}`,
      method: 'searchByGrantorName',
      input: cleanName,
    });

    try {
      attempt.step(`Navigating to search page for grantor: "${cleanName}"`);
      await this.navigateToSearchPage();

      attempt.step('Selecting Grantor/Grantee tab');
      await this.clickTab(SELECTORS.grantorGranteeTab);
      await this.page.waitForTimeout(RATE_LIMIT_MS.SPA_SETTLE);

      attempt.step('Filling name input');
      await this.fillNameSearch(cleanName);

      if (options) {
        attempt.step('Applying search filters');
        await this.applySearchFilters(options);
      }

      attempt.step('Submitting search and waiting for results');
      await this.submitAndWait();

      const maxResults = options?.maxResults ?? RESULTS_PER_PAGE * 3;
      const results = await this.parseAllPages(maxResults);

      attempt({ status: results.length > 0 ? 'success' : 'skip', dataPointsFound: results.length });
      return results;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.warn('clerk-search', `${this.logPrefix} Grantor search failed: ${errMsg}`);
      attempt({ status: 'fail', error: errMsg });
      return this.aiSearchFallback('Grantor', cleanName);
    }
  }

  /**
   * Legal description full-text search is not natively supported by iDocket.
   * This method attempts to extract instrument number or volume/page tokens
   * from the description and delegates to those search methods.
   * Falls back to an AI screenshot parse when no parseable tokens are found.
   */
  async searchByLegalDescription(
    legalDesc: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    this.logger.warn(
      'clerk-search',
      `${this.logPrefix} Native legal-description search not supported — ` +
      `attempting token extraction fallback`,
    );

    // Extract an instrument number token (8-13 digits)
    const instrMatch = legalDesc.match(/\b(\d{8,13})\b/);
    if (instrMatch) {
      return this.searchByInstrumentNumber(instrMatch[1]);
    }

    // Extract volume/page pattern (e.g. "Vol. 42, Pg. 117")
    const volPgMatch = legalDesc.match(
      /vol[.\s]*(\d+)[,\s]+p(?:age|g)[.\s]*(\d+)/i,
    );
    if (volPgMatch) {
      return this.searchByVolumePage(volPgMatch[1], volPgMatch[2]);
    }

    // Extract any name-like token after "recorded by" or similar
    const nameMatch = legalDesc.match(/(?:recorded by|grantor[:\s]+)([A-Z\s,'-]{5,40})/i);
    if (nameMatch) {
      return this.searchByGrantorName(nameMatch[1].trim(), options);
    }

    return [];
  }

  // ── Document access ────────────────────────────────────────────────────────────

  /**
   * Retrieve page images for a recorded instrument.
   *
   * iDocket image access typically requires a subscriber account.
   * In guest mode the adapter:
   *  1. Navigates to the document detail URL
   *  2. Attempts to locate and download any preview image
   *  3. Falls back to a viewport screenshot when no image URL is available
   *
   * Returns an empty array for counties where `hasGuestImageAccess` is false.
   */
  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const outputDir = path.join(this.downloadDir, instrumentNo);
    fs.mkdirSync(outputDir, { recursive: true });
    const images: DocumentImage[] = [];

    this.logger.info(
      'image-retrieval',
      `${this.logPrefix} Retrieving images for instrument# ${instrumentNo}`,
    );

    try {
      // iDocket document viewer URL pattern
      const viewerUrl =
        `${this.config.baseUrl}/document/${encodeURIComponent(instrumentNo)}`;

      await this.page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 45_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SPA_SETTLE);

      // Detect total page count
      const totalPages = await this.detectPageCount();
      this.logger.info(
        'image-retrieval',
        `${this.logPrefix} Document ${instrumentNo}: ${totalPages} page(s) detected`,
      );

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          if (pageNum > 1) {
            const advanced = await this.advanceToPage(pageNum);
            if (!advanced) {
              this.logger.warn(
                'image-retrieval',
                `${this.logPrefix} Could not navigate to page ${pageNum} — stopping`,
              );
              break;
            }
            await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
          }

          const imageUrl = await this.extractDocumentImageUrl();

          if (!imageUrl) {
            // Fallback: screenshot the viewer viewport
            const screenshotPath = path.join(
              outputDir,
              `${instrumentNo}_p${pageNum}.png`,
            );
            await this.page.screenshot({ path: screenshotPath, fullPage: false });
            images.push(
              this.makeImageEntry(
                instrumentNo, pageNum, totalPages, screenshotPath, undefined,
              ),
            );
            continue;
          }

          const ext = imageUrl.includes('.pdf') ? 'pdf' : 'png';
          const filename = `${instrumentNo}_p${pageNum}.${ext}`;
          const filepath = path.join(outputDir, filename);

          await this.downloadFile(imageUrl, filepath);

          let quality: DocumentImage['quality'] = 'fair';
          try {
            const stat = fs.statSync(filepath);
            if (stat.size < MIN_IMAGE_BYTES) {
              this.logger.warn(
                'image-retrieval',
                `${this.logPrefix} Page ${pageNum} file too small (${stat.size}B) — skipping`,
              );
              fs.unlinkSync(filepath);
              continue;
            }
            if (stat.size > 400_000) quality = 'good';
          } catch { /* keep image even if stat fails */ }

          images.push(
            this.makeImageEntry(instrumentNo, pageNum, totalPages, filepath, imageUrl, quality),
          );
          await this.page.waitForTimeout(RATE_LIMIT_MS.DOCUMENT_DOWNLOAD);
        } catch (e) {
          this.logger.warn(
            'image-retrieval',
            `${this.logPrefix} Page ${pageNum} download failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } catch (e) {
      this.logger.error(
        'image-retrieval',
        `${this.logPrefix} Image retrieval failed for ${instrumentNo}`,
        e,
      );
    }

    this.logger.info(
      'image-retrieval',
      `${this.logPrefix} Retrieved ${images.length} image(s) for ${instrumentNo}`,
    );
    return images;
  }

  /**
   * Return pricing information for a document.
   * iDocket charges a per-page fee for certified-copy downloads via subscriber
   * account.  Guest-mode pricing is estimated from the standard Texas schedule.
   */
  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    try {
      const viewerUrl =
        `${this.config.baseUrl}/document/${encodeURIComponent(instrumentNo)}`;

      await this.page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 45_000 });
      await this.page.waitForTimeout(1_500);

      // Look for an explicit price indicator near any purchase / download button
      const priceText = await this.page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll(
            'button, a, .price, .cost, [data-testid*="price"], [class*="price"]',
          ),
        );
        for (const el of els) {
          const t = el.textContent ?? '';
          if (/\$\d+\.?\d*/.test(t)) return t;
        }
        return null;
      });

      if (priceText) {
        const priceMatch = priceText.match(/\$(\d+\.?\d*)/);
        const total = priceMatch ? parseFloat(priceMatch[1]) : 1.00;
        return {
          available: true,
          pricePerPage: 1.00,
          totalPrice: total,
          pageCount: Math.round(total),
          paymentMethod: 'subscription',
          source: `idocket_${this.countyFIPS}`,
        };
      }
    } catch (e) {
      this.logger.warn(
        'pricing',
        `${this.logPrefix} Pricing lookup failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // Standard iDocket subscriber pricing
    return {
      available: true,
      pricePerPage: 1.00,
      paymentMethod: 'subscription',
      source: `idocket_${this.countyFIPS}_estimated`,
    };
  }

  // ── SPA navigation helpers ─────────────────────────────────────────────────────

  /**
   * Navigate to the county's iDocket search page.
   * Waits for the React SPA to mount before returning.
   */
  private async navigateToSearchPage(): Promise<void> {
    if (!this.page) return;

    const searchUrl = `${this.config.baseUrl}/`;
    const currentUrl = this.page.url();

    // Avoid full navigation if we're already on the correct page
    if (!currentUrl.startsWith(this.config.baseUrl)) {
      await this.page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SPA_SETTLE);
    }

    // Wait for the search input to appear — this confirms the SPA has mounted
    try {
      await this.page.waitForSelector(
        SELECTORS.searchInput.join(', '),
        { timeout: 15_000 },
      );
    } catch {
      this.logger.warn(
        'clerk-search',
        `${this.logPrefix} Search input not found after SPA load — page may not be ready`,
      );
    }
  }

  /**
   * Click the first tab / button found from the provided selector list.
   * Silently skips when none of the selectors match (single-tab county).
   */
  private async clickTab(selectors: readonly string[]): Promise<void> {
    if (!this.page) return;
    for (const selector of selectors) {
      try {
        const el = await this.page.$(selector);
        if (el) {
          await el.click();
          return;
        }
      } catch { /* try next */ }
    }
  }

  /**
   * Fill the name search field with the supplied query string.
   * Tries the generic search input first, then a dedicated name field.
   */
  private async fillNameSearch(name: string): Promise<void> {
    if (!this.page) return;

    const input = await this.findElement(SELECTORS.searchInput);
    if (input) {
      await input.fill(name);
      return;
    }

    // Fallback: look for a dedicated "name" input that may appear after tab switch
    const nameInput = await this.page.$(
      'input[name="name"], input[placeholder*="Name" i], input#grantor-grantee',
    );
    if (nameInput) await nameInput.fill(name);
  }

  /**
   * Apply optional date-range filters to the search form.
   */
  private async applySearchFilters(options: ClerkSearchOptions): Promise<void> {
    if (!this.page) return;

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
   * Click the submit / search button and wait for the SPA to load results.
   * Uses `waitForLoadState('networkidle')` because iDocket is a React SPA and
   * results are fetched asynchronously after form submission.
   */
  private async submitAndWait(): Promise<void> {
    if (!this.page) return;

    const submitBtn = await this.findElement(SELECTORS.submitButton);
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await this.page.keyboard.press('Enter');
    }

    // Wait for the network to settle and the results container to appear
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 30_000 });
    } catch {
      // networkidle may time out on slow connections — fall through to DOM parse
    }

    await this.page.waitForTimeout(RATE_LIMIT_MS.AFTER_SUBMIT);

    // Additionally wait for results or no-results element
    try {
      await this.page.waitForSelector(
        [
          ...SELECTORS.resultsContainer,
          ...SELECTORS.noResultsIndicators,
          ...SELECTORS.resultRows,
        ].join(', '),
        { timeout: 15_000 },
      );
    } catch {
      // Results may still be parseable even without a matching selector
    }
  }

  // ── Result parsing ─────────────────────────────────────────────────────────────

  /**
   * Parse search results across multiple pages up to `maxResults`.
   * iDocket shows 20 results per page; the method advances the paginator
   * automatically until the result cap or the last page is reached.
   */
  private async parseAllPages(maxResults: number): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    const allResults: ClerkDocumentResult[] = [];
    let pageNum = 1;

    while (allResults.length < maxResults) {
      const pageResults = await this.parseCurrentPage();
      allResults.push(...pageResults);

      this.logger.info(
        'clerk-search',
        `${this.logPrefix} Page ${pageNum}: ${pageResults.length} record(s) ` +
        `(${allResults.length} total)`,
      );

      // Stop if this page returned fewer than a full page of results
      if (pageResults.length < RESULTS_PER_PAGE) break;

      // Attempt to advance to next page
      const advanced = await this.advancePaginator();
      if (!advanced) break;

      pageNum++;
      await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);

      // Wait for next-page content to load
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 20_000 });
      } catch { /* continue */ }
    }

    this.logger.info(
      'clerk-search',
      `${this.logPrefix} Search complete: ${allResults.length} total record(s)`,
    );
    return allResults;
  }

  /**
   * Parse the currently-visible search result page.
   *
   * iDocket SPA renders results as either:
   *   A) A table: <tr> rows with cells for instrument#, type, date, parties
   *   B) Card divs: <div class="record-item"> with labeled child elements
   *
   * Falls back to AI screenshot parse when DOM traversal yields 0 results
   * and the page body contains content that looks like records.
   */
  private async parseCurrentPage(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    // Check for "no results" state first
    try {
      const bodyText = await this.page.evaluate(
        () => (document.body?.innerText ?? '').toLowerCase(),
      );
      if (
        bodyText.includes('no records found') ||
        bodyText.includes('no results found') ||
        bodyText.includes('0 records') ||
        bodyText.includes('no matching records') ||
        bodyText.includes('no documents found')
      ) {
        this.logger.info('clerk-search', `${this.logPrefix} No records found on this page`);
        return [];
      }
    } catch { /* proceed to DOM parse */ }

    // Strategy A: table-style result rows
    const tableResults = await this.parseTableResults();
    if (tableResults.length > 0) return tableResults;

    // Strategy B: card/div-style result items
    const cardResults = await this.parseCardResults();
    if (cardResults.length > 0) return cardResults;

    // Strategy C: AI screenshot fallback
    this.logger.info(
      'clerk-search',
      `${this.logPrefix} DOM parse returned 0 results — trying AI screenshot parse`,
    );
    return this.aiParseScreenshot();
  }

  /**
   * Parse results from a standard HTML table layout.
   * iDocket table column order (common layout):
   *   0: Instrument # | 1: Type | 2: Date | 3: Grantor | 4: Grantee | 5: Vol | 6: Page | 7: Description
   */
  private async parseTableResults(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    const results: ClerkDocumentResult[] = [];

    try {
      const rows = await this.page.$$(SELECTORS.resultRows.join(', '));
      if (rows.length === 0) return [];

      for (const row of rows) {
        try {
          const cells = await row.$$eval(
            'td, [class*="cell"], [data-col]',
            (els) => els.map((el) => (el.textContent ?? '').trim()),
          );

          if (cells.length < 3) {
            // Might be a single-string row — try plain text
            const text = await row.innerText().catch(() => '');
            const parsed = this.parseRowText(text);
            if (parsed) results.push(parsed);
            continue;
          }

          const result = this.buildResultFromCells(cells);
          if (result) results.push(result);
        } catch { /* skip unparseable rows */ }
      }
    } catch (e) {
      this.logger.warn(
        'clerk-search',
        `${this.logPrefix} Table DOM parse failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return results;
  }

  /**
   * Parse results from a card/div-based layout used in some iDocket deployments.
   * Each card contains labeled spans/divs for each field.
   */
  private async parseCardResults(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    const results: ClerkDocumentResult[] = [];

    try {
      const cards = await this.page.$$(
        'div.record-item, div[data-testid="record"], div[data-record], ' +
        '[class*="record-card"], [class*="result-card"]',
      );
      if (cards.length === 0) return [];

      for (const card of cards) {
        try {
          const text = await card.innerText();
          const parsed = this.parseRowText(text);
          if (parsed) results.push(parsed);
        } catch { /* skip */ }
      }
    } catch (e) {
      this.logger.warn(
        'clerk-search',
        `${this.logPrefix} Card DOM parse failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return results;
  }

  /**
   * Build a ClerkDocumentResult from an ordered array of cell strings
   * using the standard iDocket column layout.
   */
  private buildResultFromCells(cells: string[]): ClerkDocumentResult | null {
    // Normalize: instrument number is expected in the first cell
    const instrumentNumber = this.normalizeInstrumentNumber(cells[0] ?? '');
    if (!instrumentNumber) return null;

    // Try to determine which columns hold which fields by scanning content
    let docTypeRaw = '';
    let recordingDate = '';
    let grantors: string[] = [];
    let grantees: string[] = [];
    let vol = '';
    let pg = '';
    let description = '';

    for (let i = 1; i < cells.length; i++) {
      const cell = cells[i].trim();
      if (!cell) continue;

      if (!recordingDate && this.looksLikeDate(cell)) {
        recordingDate = this.parseDate(cell);
        continue;
      }

      if (!docTypeRaw && this.looksLikeDocType(cell)) {
        docTypeRaw = cell;
        continue;
      }

      if (!vol && /^vol(?:ume)?[\s.]*\d+/i.test(cell)) {
        const m = cell.match(/(\d+)/);
        if (m) vol = m[1];
        continue;
      }

      if (!pg && /^p(?:age|g)?[\s.]*\d+/i.test(cell)) {
        const m = cell.match(/(\d+)/);
        if (m) pg = m[1];
        continue;
      }

      if (this.looksLikeName(cell)) {
        if (grantors.length === 0) {
          grantors.push(cell);
        } else if (grantees.length === 0) {
          grantees.push(cell);
        }
        continue;
      }

      if (cell.length > 20 && !description) {
        description = cell;
      }
    }

    return {
      instrumentNumber,
      volumePage: vol && pg ? { volume: vol, page: pg } : undefined,
      documentType: docTypeRaw ? this.classifyDocumentType(docTypeRaw) : 'other',
      recordingDate,
      grantors,
      grantees,
      legalDescription: description || undefined,
      source: `idocket_${this.countyFIPS}`,
    };
  }

  /**
   * Parse a result from a single line / block of text (e.g. a card's innerText).
   * Uses regex heuristics to extract the structured fields.
   */
  private parseRowText(text: string): ClerkDocumentResult | null {
    const instrMatch = text.match(/\b(\d{8,13})\b/);
    if (!instrMatch) return null;

    const instrumentNumber = instrMatch[1];
    const recordingDate = this.extractDateFromText(text);
    const docTypeRaw = this.extractDocTypeFromText(text);
    const { grantors, grantees } = this.extractPartiesFromText(text, instrumentNumber);
    const volPgMatch = text.match(/vol[.\s]*(\d+)[,\s]+p(?:age|g)?[.\s]*(\d+)/i);

    return {
      instrumentNumber,
      volumePage: volPgMatch
        ? { volume: volPgMatch[1], page: volPgMatch[2] }
        : undefined,
      documentType: docTypeRaw ? this.classifyDocumentType(docTypeRaw) : 'other',
      recordingDate,
      grantors,
      grantees,
      source: `idocket_${this.countyFIPS}`,
    };
  }

  // ── Pagination ─────────────────────────────────────────────────────────────────

  /**
   * Advance the results paginator to the next page.
   * Returns true when navigation was triggered, false when no next-page
   * control exists (i.e. we are on the last page).
   */
  private async advancePaginator(): Promise<boolean> {
    if (!this.page) return false;

    for (const selector of SELECTORS.paginationNext) {
      try {
        const btn = await this.page.$(selector);
        if (!btn) continue;

        // Check the button is not disabled
        const isDisabled = await btn.evaluate(
          (el) =>
            (el as HTMLButtonElement).disabled ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.classList.contains('disabled'),
        );
        if (isDisabled) return false;

        await btn.click();
        return true;
      } catch { /* try next */ }
    }

    return false;
  }

  // ── AI OCR fallback ────────────────────────────────────────────────────────────

  /**
   * Take a full-page screenshot and parse it with Claude (Anthropic) vision.
   * This is the last-resort fallback for counties with non-standard SPA layouts
   * or when Playwright DOM parsing yields zero results.
   *
   * Requires `ANTHROPIC_API_KEY` env variable.  Skips gracefully when absent.
   */
  private async aiParseScreenshot(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    if (!process.env.ANTHROPIC_API_KEY) {
      this.logger.warn(
        'ai-fallback',
        `${this.logPrefix} AI fallback skipped — ANTHROPIC_API_KEY not set`,
      );
      return [];
    }

    this.logger.info('ai-fallback', `${this.logPrefix} Running AI screenshot parse...`);

    try {
      const screenshot = await this.page.screenshot({ fullPage: true });
      return this.aiParseSearchResults(screenshot);
    } catch (e) {
      this.logger.warn(
        'ai-fallback',
        `${this.logPrefix} AI screenshot capture failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return [];
    }
  }

  /**
   * Send a screenshot buffer to Claude and extract structured document records.
   * The prompt is tuned for iDocket-style result grids and card layouts.
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
                  '(iDocket system — idocket.com). ' +
                  'Extract ALL document records visible in the results grid or table.\n\n' +
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
                  'Return ONLY valid JSON. If no results are visible, return [].',
              },
            ],
          },
        ],
      }),
    });

    const data =
      (await response.json()) as { content?: Array<{ text?: string }> };
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
          documentType: this.classifyDocumentType(
            String(rec.documentType ?? 'other'),
          ),
          recordingDate: String(rec.recordingDate ?? ''),
          grantors: Array.isArray(rec.grantors) ? rec.grantors.map(String) : [],
          grantees: Array.isArray(rec.grantees) ? rec.grantees.map(String) : [],
          legalDescription:
            rec.legalDescription ? String(rec.legalDescription) : undefined,
          source: `idocket_${this.countyFIPS}_ai`,
        });
      }

      this.logger.info(
        'ai-fallback',
        `${this.logPrefix} AI parse extracted ${results.length} record(s)`,
      );
      return results;
    } catch {
      this.logger.warn('ai-fallback', `${this.logPrefix} AI result JSON parse failed`);
      return [];
    }
  }

  /**
   * Navigate to the search page and run an AI screenshot parse when Playwright
   * automation fails entirely (network error, timeout, SPA crash, etc.).
   */
  private async aiSearchFallback(
    searchType: string,
    query: string,
  ): Promise<ClerkDocumentResult[]> {
    if (!this.page || !process.env.ANTHROPIC_API_KEY) return [];

    this.logger.info(
      'ai-fallback',
      `${this.logPrefix} AI search fallback for ${searchType}: "${query}"`,
    );

    try {
      await this.page.goto(`${this.config.baseUrl}/`, {
        waitUntil: 'networkidle',
        timeout: 45_000,
      });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SPA_SETTLE);
      return this.aiParseScreenshot();
    } catch {
      return [];
    }
  }

  // ── Document image helpers ─────────────────────────────────────────────────────

  /**
   * Detect how many pages a document viewer contains.
   * Tries "Page X of Y" text, thumbnail strip count, then AI screenshot,
   * falling back to 1.
   */
  private async detectPageCount(): Promise<number> {
    if (!this.page) return 1;

    // Strategy 1: "Page X of Y" or "X of Y pages" indicator
    try {
      const bodyText = await this.page.evaluate(
        () => document.body?.innerText ?? '',
      );
      const ofMatch = bodyText.match(/(?:page\s+)?\d+\s+of\s+(\d+)/i);
      if (ofMatch) return parseInt(ofMatch[1], 10);

      const pagesMatch = bodyText.match(/(\d+)\s+pages?/i);
      if (pagesMatch) return parseInt(pagesMatch[1], 10);
    } catch { /* try next */ }

    // Strategy 2: thumbnail strip or page-navigation list items
    try {
      const thumbs = await this.page.$$(
        '.page-thumbnail, .page-nav-item, [data-page-number], ' +
        '.pageThumbnail, td.pageThumb, [class*="page-thumb"]',
      );
      if (thumbs.length > 1) return thumbs.length;
    } catch { /* try next */ }

    // Strategy 3: page indicator via data attributes
    try {
      const totalAttr = await this.page.$eval(
        '[data-total-pages], [data-page-count]',
        (el) => el.getAttribute('data-total-pages') ?? el.getAttribute('data-page-count'),
      );
      if (totalAttr) {
        const n = parseInt(totalAttr, 10);
        if (n > 0) return n;
      }
    } catch { /* fall through */ }

    // Strategy 4: AI page-count detection via screenshot
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const screenshot = await this.page.screenshot();
        return this.aiDetectPageCount(screenshot);
      } catch { /* fall through */ }
    }

    return 1;
  }

  /**
   * Ask Claude how many pages a document viewer screenshot shows.
   * Returns 1 on failure.
   */
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
                    'This is a county clerk document viewer (iDocket system). ' +
                    'How many total pages does this document have? ' +
                    'Look for "Page X of Y" text, navigation buttons, or page thumbnails. ' +
                    'Return ONLY a single integer.',
                },
              ],
            },
          ],
        }),
      });

      const data =
        (await response.json()) as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text ?? '1';
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 1;
    } catch {
      return 1;
    }
  }

  /**
   * Advance the document viewer to a specific page number.
   * Tries "Next" button, numbered page links, then URL parameter.
   * Returns true when navigation appears to have succeeded.
   */
  private async advanceToPage(targetPage: number): Promise<boolean> {
    if (!this.page) return false;

    // Strategy 1: click "Next page" button
    const nextBtn = await this.page.$(
      'button[aria-label="Next page"], button:has-text("Next"), ' +
      '.next-page, [data-testid="page-next"], input[value="Next"]',
    );
    if (nextBtn) {
      await nextBtn.click();
      return true;
    }

    // Strategy 2: click numbered page link
    const pageLink = await this.page.$(
      `a:has-text("${targetPage}"), ` +
      `button:has-text("${targetPage}"), ` +
      `[data-page="${targetPage}"]`,
    );
    if (pageLink) {
      await pageLink.click();
      return true;
    }

    // Strategy 3: append page number to current URL
    try {
      const currentUrl = this.page.url();
      const newUrl = currentUrl.includes('page=')
        ? currentUrl.replace(/page=\d+/, `page=${targetPage}`)
        : `${currentUrl}${currentUrl.includes('?') ? '&' : '?'}page=${targetPage}`;
      await this.page.goto(newUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract the URL of the document image or PDF from the current viewer page.
   * iDocket viewers typically embed documents via <iframe>, <embed>, or serve
   * images directly in an <img> tag.
   */
  private async extractDocumentImageUrl(): Promise<string | null> {
    if (!this.page) return null;

    // PDF in <embed> or <object>
    try {
      const embedUrl = await this.page.$eval(
        'embed[type="application/pdf"], embed[src*=".pdf"], ' +
        'object[data*=".pdf"], object[type="application/pdf"]',
        (el) =>
          (el as HTMLEmbedElement).src ??
          (el as HTMLObjectElement).data ?? '',
      );
      if (embedUrl) return embedUrl;
    } catch { /* no embed found */ }

    // Document in <iframe>
    try {
      const iframeSrc = await this.page.$eval(
        'iframe[src*="document"], iframe[src*="image"], ' +
        'iframe[src*="viewer"], iframe[src*="tif"]',
        (el) => (el as HTMLIFrameElement).src,
      );
      if (iframeSrc) return iframeSrc;
    } catch { /* no iframe found */ }

    // Direct <img> element
    try {
      const imgSrcs = await this.page.$$eval(
        'img[src*="image"], img[src*="document"], ' +
        '.viewer-image img, #documentImage, [data-testid="document-image"] img',
        (imgs) => imgs.map((img) => (img as HTMLImageElement).src),
      );
      for (const src of imgSrcs) {
        if (src && (src.startsWith('http') || src.startsWith('blob:'))) {
          return src;
        }
      }
    } catch { /* no image found */ }

    return null;
  }

  /**
   * Download a file from a URL (http/https or blob:) and save to disk.
   */
  private async downloadFile(url: string, filepath: string): Promise<void> {
    if (url.startsWith('blob:')) {
      const buffer = await this.page!.evaluate(async (blobUrl: string) => {
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        const ab = await blob.arrayBuffer();
        return Array.from(new Uint8Array(ab));
      }, url);
      fs.writeFileSync(filepath, Buffer.from(buffer));
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(filepath);
      const handleResponse = (response: import('http').IncomingMessage): void => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const location = response.headers.location;
          if (!location) {
            reject(new Error('Redirect with no Location header'));
            return;
          }
          https.get(location, { timeout: 30_000 }, handleResponse).on('error', reject);
        } else {
          response.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
          file.on('error', reject);
        }
      };
      https.get(url, { timeout: 30_000 }, handleResponse).on('error', reject);
    });
  }

  /**
   * Construct a DocumentImage metadata entry.
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
      isWatermarked: true,
      quality,
    };
  }

  // ── DOM query helpers ──────────────────────────────────────────────────────────

  /**
   * Find the first element that matches any of the provided CSS selectors.
   * Returns null when none match.
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

  // ── Text extraction helpers ────────────────────────────────────────────────────

  private normalizeInstrumentNumber(raw: string): string {
    const m = raw.match(/\b(\d{8,13})\b/);
    return m ? m[1] : '';
  }

  private parseDate(raw: string): string {
    const m =
      raw.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ??
      raw.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : raw.trim();
  }

  private extractDateFromText(text: string): string {
    const m =
      text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ??
      text.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  private extractDocTypeFromText(text: string): string {
    const typeKeywords = [
      'WARRANTY DEED', 'SPECIAL WARRANTY', 'QUITCLAIM', 'DEED OF TRUST',
      'REPLAT', 'AMENDED PLAT', 'VACATING PLAT', 'PLAT',
      'UTILITY EASEMENT', 'ACCESS EASEMENT', 'DRAINAGE EASEMENT', 'EASEMENT',
      'RESTRICTIVE COVENANT', 'CC&R', 'DEED RESTRICTION',
      'RELEASE OF LIEN', 'MECHANIC', 'TAX LIEN',
      'RIGHT OF WAY', 'DEDICATION',
      'OIL', 'GAS', 'MINERAL',
      'AFFIDAVIT', 'CORRECTION',
    ];
    const upper = text.toUpperCase();
    for (const kw of typeKeywords) {
      if (upper.includes(kw)) return kw;
    }
    return '';
  }

  private extractPartiesFromText(
    text: string,
    instrumentNumber: string,
  ): { grantors: string[]; grantees: string[] } {
    const grantors: string[] = [];
    const grantees: string[] = [];

    const namePattern = /[A-Z][A-Z\s,.''-]{3,}/g;
    const candidates = Array.from(text.matchAll(namePattern))
      .map((m) => m[0].trim())
      .filter(
        (c) =>
          c.length > 4 &&
          !c.includes(instrumentNumber) &&
          !/\d{4}/.test(c) &&
          !/^(WARRANTY|SPECIAL|QUITCLAIM|DEED|TRUST|PLAT|EASEMENT|LIEN|RIGHT|OIL|GAS|MINERAL|AFFIDAVIT|CORRECTION|REPLAT|COVENANT|RESTRICTION)/.test(c),
      );

    if (candidates[0]) grantors.push(candidates[0]);
    if (candidates[1]) grantees.push(candidates[1]);

    return { grantors, grantees };
  }

  private looksLikeDate(str: string): boolean {
    return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str) ||
           /^\d{4}-\d{2}-\d{2}$/.test(str);
  }

  private looksLikeDocType(str: string): boolean {
    const upper = str.toUpperCase();
    return (
      upper.includes('DEED') ||
      upper.includes('PLAT') ||
      upper.includes('EASEMENT') ||
      upper.includes('LIEN') ||
      upper.includes('COVENANT') ||
      upper.includes('AFFIDAVIT') ||
      upper.includes('TRUST') ||
      upper === 'WD' || upper === 'SWD' || upper === 'QCD' ||
      upper === 'DOT' || upper === 'PLT' || upper === 'ESMT' ||
      upper === 'ROW' || upper === 'OGL'
    );
  }

  private looksLikeName(str: string): boolean {
    return (
      str.length > 3 &&
      /^[A-Z][A-Z\s,.''-]{3,}$/.test(str) &&
      !/\d{4}/.test(str)
    );
  }

  /**
   * Strip legal-entity suffixes and extra whitespace to improve name-search recall.
   */
  private cleanSearchName(name: string): string {
    return name
      .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX|ESTATE)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── Default config factory ─────────────────────────────────────────────────────

  /**
   * Build a best-effort default configuration for an unknown iDocket county.
   * Uses the county name to construct the standard idocket.com URL pattern.
   */
  private defaultConfig(countyFIPS: string, countyName: string): IDocketConfig {
    const slug = countyName.replace(/\s+/g, '');
    return {
      baseUrl: `https://idocket.com/TX/${slug}`,
      countySlug: slug,
      countyDisplayName: `${countyName} County`,
      hasGuestImageAccess: false,
    };
  }
}

// ── Factory function ───────────────────────────────────────────────────────────

/**
 * Create an IDocketClerkAdapter for a specific Texas county.
 *
 * @param fips - 5-digit county FIPS code (e.g. '48085' for Collin County)
 * @param countyName - Human-readable county name (e.g. 'Collin')
 *
 * @example
 * ```ts
 * const adapter = createIDocketAdapter('48085', 'Collin');
 * await adapter.initSession();
 * const results = await adapter.searchByGrantorName('SMITH JOHN');
 * await adapter.destroySession();
 * ```
 */
export function createIDocketAdapter(
  fips: string,
  countyName: string,
): IDocketClerkAdapter {
  return new IDocketClerkAdapter(fips, countyName);
}
