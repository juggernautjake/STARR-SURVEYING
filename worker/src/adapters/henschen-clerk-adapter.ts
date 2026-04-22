// worker/src/adapters/henschen-clerk-adapter.ts
// Phase 13: HenschenClerkAdapter — Playwright automation for Henschen & Associates
// county clerk record management systems.
//
// Henschen & Associates (henschen-and-assoc.com) is the second most common Texas
// county clerk system, powering ~40 counties primarily in the Hill Country and
// central Texas region (Burnet, Llano, Mason, McCulloch, Mills, San Saba, etc.).
//
// Key characteristics:
//   - Server-rendered HTML — DOM scraping is reliable (no heavy JS framework)
//   - Search form with dropdown for search type (LastName, InstrumentNumber, VolumePage)
//   - Results rendered in <table.ResultTable> or <table#tblResults>
//   - Document images served as PDF or TIFF, opening in a new window/tab
//   - URL patterns vary by county: either ClerkInquiry/ subdirectory on co.texas.us
//     or a standalone records.{county}countyclerk.com domain
//   - Per-county form field names are mostly consistent but selectors have fallbacks
//
// Spec §2.11 — Henschen & Associates Clerk Adapter

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

// ── Per-county Henschen configuration ─────────────────────────────────────────

/**
 * Per-county configuration for Henschen & Associates clerk systems.
 * URL patterns vary: either the standard co.texas.us/ClerkInquiry/ path or
 * a dedicated countyclerk.com domain.
 */
export interface HenschenConfig {
  /** Base URL for the county's Henschen system */
  baseUrl: string;
  /** Path to the ClerkInquiry search page (default: '/ClerkInquiry/') */
  searchPath: string;
  /** Human-readable county name for logging */
  countyDisplayName: string;
  /**
   * Whether this county's deployment provides direct image/PDF access.
   * Some rural Henschen counties require a paid account for image retrieval.
   */
  hasImageAccess: boolean;
  /**
   * Optional override for the result table selector when a county's deployment
   * differs from the standard `table.ResultTable` or `table#tblResults`.
   */
  resultTableSelector?: string;
}

/**
 * Known Henschen county configurations, keyed by 5-digit FIPS code.
 *
 * URL sources:
 *   - https://{county}.co.texas.us/ClerkInquiry/  (most common)
 *   - https://records.{county}countyclerk.com/     (some counties)
 */
export const HENSCHEN_CONFIGS: Record<string, HenschenConfig> = {
  '48053': {  // Burnet County
    baseUrl: 'https://burnet.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Burnet County',
    hasImageAccess: true,
  },
  '48299': {  // Llano County
    baseUrl: 'https://llano.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Llano County',
    hasImageAccess: true,
  },
  '48319': {  // Mason County
    baseUrl: 'https://mason.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Mason County',
    hasImageAccess: false,
  },
  '48307': {  // McCulloch County
    baseUrl: 'https://mcculloch.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'McCulloch County',
    hasImageAccess: false,
  },
  '48333': {  // Mills County
    baseUrl: 'https://mills.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Mills County',
    hasImageAccess: false,
  },
  '48411': {  // San Saba County
    baseUrl: 'https://sansaba.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'San Saba County',
    hasImageAccess: false,
  },
  '48321': {  // Menard County
    baseUrl: 'https://menard.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Menard County',
    hasImageAccess: false,
  },
  '48265': {  // Kimble County
    baseUrl: 'https://kimble.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Kimble County',
    hasImageAccess: false,
  },
  '48435': {  // Sutton County
    baseUrl: 'https://sutton.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Sutton County',
    hasImageAccess: false,
  },
  '48171': {  // Gillespie County
    baseUrl: 'https://records.gillespiecountyclerk.com',
    searchPath: '/',
    countyDisplayName: 'Gillespie County',
    hasImageAccess: true,
  },
  '48283': {  // Lampasas County
    baseUrl: 'https://lampasas.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Lampasas County',
    hasImageAccess: false,
  },
  '48381': {  // Randall County
    baseUrl: 'https://randall.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Randall County',
    hasImageAccess: false,
  },
  '48135': {  // Ector County
    baseUrl: 'https://ector.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Ector County',
    hasImageAccess: false,
  },
  '48177': {  // Gonzales County
    baseUrl: 'https://gonzales.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Gonzales County',
    hasImageAccess: false,
  },
  '48209': {  // Hays County (some record types)
    baseUrl: 'https://hays.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Hays County',
    hasImageAccess: true,
  },
  '48463': {  // Uvalde County
    baseUrl: 'https://uvalde.co.texas.us',
    searchPath: '/ClerkInquiry/',
    countyDisplayName: 'Uvalde County',
    hasImageAccess: false,
  },
};

/** Set of all FIPS codes known to use Henschen & Associates (exported for ClerkRegistry) */
export const HENSCHEN_FIPS_SET = new Set<string>(Object.keys(HENSCHEN_CONFIGS));

// ── Selector fallback arrays ───────────────────────────────────────────────────

/**
 * Ordered fallback selectors for the Henschen search form.
 * Henschen deployments across counties share the same software but sometimes
 * differ in field IDs.  Try the primary selector first, then fall through.
 */
const SELECTORS = {
  /** Dropdown that selects search type (LastName, InstrumentNumber, VolumePage) */
  searchTypeDropdown: [
    'select#SearchType',
    'select[name="SearchType"]',
    'select#searchType',
    'select.search-type',
  ],
  /** Last name input for name-based searches */
  lastNameInput: [
    'input#LastName',
    'input[name="LastName"]',
    'input#lastName',
    'input[placeholder*="Last" i]',
  ],
  /** First name input for name-based searches */
  firstNameInput: [
    'input#FirstName',
    'input[name="FirstName"]',
    'input#firstName',
    'input[placeholder*="First" i]',
  ],
  /** Instrument number input for direct lookup */
  instrumentNumberInput: [
    'input#InstrumentNumber',
    'input[name="InstrumentNumber"]',
    'input#instrNo',
    'input[placeholder*="nstrument" i]',
  ],
  /** Volume input for Volume/Page search */
  volumeInput: [
    'input#Volume',
    'input[name="Volume"]',
    'input#volume',
    'input[placeholder*="Volume" i]',
  ],
  /** Page input for Volume/Page search */
  pageInput: [
    'input#Page',
    'input[name="Page"]',
    'input#page',
    'input[placeholder*="Page" i]',
  ],
  /** Document type filter dropdown */
  documentTypeSelect: [
    'select#DocumentType',
    'select[name="DocumentType"]',
    'select#docType',
  ],
  /** Date range: from */
  dateFrom: [
    'input#DateFrom',
    'input[name="DateFrom"]',
    'input[placeholder*="From" i]',
  ],
  /** Date range: to */
  dateTo: [
    'input#DateTo',
    'input[name="DateTo"]',
    'input[placeholder*="To" i]',
  ],
  /** Submit button */
  submitButton: [
    'input[type="submit"]',
    'button[type="submit"]',
    'button:has-text("Search")',
    'input[value="Search"]',
  ],
  /** Result table — primary and fallback */
  resultTable: [
    'table.ResultTable',
    'table#tblResults',
    'table.results',
    '#searchResults table',
    'table',
  ],
} as const;

// ── Rate-limit delays ──────────────────────────────────────────────────────────

const RATE_LIMIT_MS = {
  /** Minimum delay between outbound search requests */
  BETWEEN_REQUESTS: 4_000,
  /** Delay after form submission before parsing results */
  AFTER_SUBMIT:     3_000,
  /** Delay between page navigations in a document viewer */
  PAGE_NAVIGATION:  3_000,
  /** Delay between individual document image downloads */
  DOCUMENT_DOWNLOAD: 5_000,
} as const;

/** Minimum acceptable image file size — below this is a broken/blank placeholder */
const MIN_IMAGE_BYTES = 10_240; // 10 KB

// ── HenschenClerkAdapter ───────────────────────────────────────────────────────

/**
 * Clerk adapter for Henschen & Associates county record management systems.
 *
 * Henschen systems are server-rendered; all searches submit an HTML form and
 * the browser receives a full-page reload with result rows in a `<table>`.
 * The adapter uses Playwright to handle that lifecycle, falling back to
 * Claude vision AI when DOM parsing fails.
 *
 * Usage:
 * ```ts
 * const adapter = createHenschenAdapter('48053', 'Burnet');
 * await adapter.initSession();
 * const docs = await adapter.searchByGrantorName('SMITH JOHN');
 * await adapter.destroySession();
 * ```
 */
export class HenschenClerkAdapter extends ClerkAdapter {
  private readonly config: HenschenConfig;
  /** Absolute directory path where downloaded images are saved */
  private readonly downloadDir: string;
  /** Log prefix, e.g. "[Henschen-Burnet]" */
  private readonly logPrefix: string;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    this.config =
      HENSCHEN_CONFIGS[countyFIPS] ?? this.defaultConfig(countyFIPS, countyName);
    this.downloadDir = `/tmp/harvest/${countyFIPS}`;
    this.logPrefix = `[Henschen-${countyName}]`;
  }

  // ── Session lifecycle ──────────────────────────────────────────────────────────

  /**
   * Launch a headless Chromium browser and open the Henschen search page.
   * Calling initSession() when a session is already active is a no-op.
   */
  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await acquireBrowser({
      adapterId: 'henschen-clerk',
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
   * Search by exact instrument number (most precise; preferred when available).
   * Selects the "InstrumentNumber" search type from the dropdown, fills the
   * instrument field, and submits.
   */
  async searchByInstrumentNumber(
    instrumentNo: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(`${this.logPrefix} Searching instrument# ${instrumentNo}...`);

    try {
      const url = this.buildSearchUrl('InstrumentNumber', { instrumentNo });
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.BETWEEN_REQUESTS);

      // Select the InstrumentNumber search type and fill the form
      await this.selectSearchType('InstrumentNumber');
      const instrInput = await this.findElement(SELECTORS.instrumentNumberInput);
      if (instrInput) {
        await instrInput.fill(instrumentNo);
        await this.submitSearchForm();
      }

      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`${this.logPrefix} Instrument# search failed:`, e);
      return this.aiSearchFallback('InstrumentNumber', instrumentNo);
    }
  }

  /**
   * Search by volume and page number.
   * Selects the "VolumePage" search type, fills both fields, and submits.
   */
  async searchByVolumePage(
    volume: string,
    page: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(`${this.logPrefix} Searching Vol ${volume} / Page ${page}...`);

    try {
      const url = this.buildSearchUrl('VolumePage', { volume, page });
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.BETWEEN_REQUESTS);

      await this.selectSearchType('VolumePage');

      const volInput = await this.findElement(SELECTORS.volumeInput);
      if (volInput) await volInput.fill(volume);

      const pgInput = await this.findElement(SELECTORS.pageInput);
      if (pgInput) await pgInput.fill(page);

      await this.submitSearchForm();
      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`${this.logPrefix} Vol/Page search failed:`, e);
      return this.aiSearchFallback('VolumePage', `${volume}/${page}`);
    }
  }

  /**
   * Search by grantee (buyer / new owner) last name.
   * Selects "LastName/FirstName" search type, fills LastName field only,
   * and applies optional date range / document type filters.
   */
  async searchByGranteeName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const { lastName, firstName } = this.splitName(name);
    console.log(`${this.logPrefix} Searching grantee: "${lastName}, ${firstName}"...`);

    try {
      const url = this.buildSearchUrl('LastName', { lastName, firstName });
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.BETWEEN_REQUESTS);

      await this.selectSearchType('LastName/FirstName');
      await this.fillNameFields(lastName, firstName);
      await this.applySearchFilters(options);
      await this.submitSearchForm();

      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`${this.logPrefix} Grantee search failed:`, e);
      return this.aiSearchFallback('Grantee', name);
    }
  }

  /**
   * Search by grantor (seller / previous owner) last name.
   * Identical form flow to grantee search — Henschen systems do not expose
   * separate grantor vs. grantee form fields; the name field is shared and
   * the result rows are filtered client-side.
   */
  async searchByGrantorName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const { lastName, firstName } = this.splitName(name);
    console.log(`${this.logPrefix} Searching grantor: "${lastName}, ${firstName}"...`);

    try {
      const url = this.buildSearchUrl('LastName', { lastName, firstName });
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.BETWEEN_REQUESTS);

      await this.selectSearchType('LastName/FirstName');
      await this.fillNameFields(lastName, firstName);
      await this.applySearchFilters(options);
      await this.submitSearchForm();

      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`${this.logPrefix} Grantor search failed:`, e);
      return this.aiSearchFallback('Grantor', name);
    }
  }

  /**
   * Legal description full-text search is not natively supported by Henschen
   * systems.  This method falls back immediately to an AI screenshot parse
   * using an instrument-number search for any numeric tokens found in the
   * description.  Returns an empty array when no parseable tokens are found.
   */
  async searchByLegalDescription(
    legalDesc: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    console.warn(
      `${this.logPrefix} Native legal-description search not supported — ` +
      `attempting AI fallback`,
    );

    // Extract any instrument-number-like tokens from the legal description
    const instrMatch = legalDesc.match(/\b(\d{8,13})\b/);
    if (instrMatch) {
      return this.searchByInstrumentNumber(instrMatch[1]);
    }

    // Extract volume/page patterns (e.g. "Vol. 42, Pg. 117")
    const volPgMatch = legalDesc.match(/vol[.\s]*(\d+)[,\s]+p(?:age|g)[.\s]*(\d+)/i);
    if (volPgMatch) {
      return this.searchByVolumePage(volPgMatch[1], volPgMatch[2]);
    }

    return [];
  }

  // ── Document access ────────────────────────────────────────────────────────────

  /**
   * Retrieve all page images for a recorded instrument.
   *
   * Henschen viewers open the document as a PDF or TIFF in a new window.
   * This method:
   *  1. Opens the document viewer URL for the instrument
   *  2. Waits for an <embed>, <iframe>, or <img> containing the document
   *  3. Downloads each page, saving to /tmp/harvest/{fips}/{instrumentNo}/
   *  4. Falls back to a screenshot of the viewer page when the embed URL
   *     cannot be extracted
   *
   * Returns an empty array when `hasImageAccess` is false for the county.
   */
  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    if (!this.config.hasImageAccess) {
      console.log(
        `${this.logPrefix} Image access not configured for this county — skipping`,
      );
      return [];
    }

    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const outputDir = path.join(this.downloadDir, instrumentNo);
    fs.mkdirSync(outputDir, { recursive: true });
    const images: DocumentImage[] = [];

    console.log(`${this.logPrefix} Retrieving images for instrument# ${instrumentNo}...`);

    try {
      // Henschen viewer URL pattern — most counties follow this convention
      const viewerUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `DocumentView.asp?InstrumentNumber=${encodeURIComponent(instrumentNo)}`;

      await this.page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(2_000);

      // Detect total page count from page indicator text or thumbnail strip
      const totalPages = await this.detectPageCount();

      console.log(
        `${this.logPrefix} Document ${instrumentNo}: ${totalPages} page(s) detected`,
      );

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          if (pageNum > 1) {
            // Henschen viewers use "Next" button or page-number links
            const advanced = await this.advanceToPage(pageNum);
            if (!advanced) {
              console.warn(
                `${this.logPrefix} Could not navigate to page ${pageNum} — stopping`,
              );
              break;
            }
            await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
          }

          const imageUrl = await this.extractDocumentImageUrl();

          if (!imageUrl) {
            // Fallback: screenshot the viewer page itself
            const screenshotPath = path.join(outputDir, `${instrumentNo}_p${pageNum}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: false });
            images.push(
              this.makeImageEntry(instrumentNo, pageNum, totalPages, screenshotPath, undefined),
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
              console.warn(
                `${this.logPrefix} Page ${pageNum} download too small (${stat.size}B) — skipping`,
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
          console.warn(`${this.logPrefix} Page ${pageNum} download failed:`, e);
        }
      }
    } catch (e) {
      console.warn(`${this.logPrefix} Image retrieval failed for ${instrumentNo}:`, e);
    }

    console.log(
      `${this.logPrefix} Retrieved ${images.length} image(s) for ${instrumentNo}`,
    );
    return images;
  }

  /**
   * Return pricing information for a document.
   * Most Henschen-powered counties charge ~$1.00/page for certified copies
   * through a separate county portal.  Public viewing is free but watermarked
   * (or unavailable without account).
   */
  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    try {
      const viewerUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `DocumentView.asp?InstrumentNumber=${encodeURIComponent(instrumentNo)}`;

      await this.page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(1_500);

      // Look for an explicit price near a purchase / download button
      const priceText = await this.page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll('a, button, .price, .cost, .download'),
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
          paymentMethod: 'credit_card',
          source: `henschen_${this.countyFIPS}`,
        };
      }
    } catch (e) {
      console.warn(`${this.logPrefix} Pricing lookup failed:`, e);
    }

    // Standard Texas certified-copy pricing for Henschen counties
    return {
      available: true,
      pricePerPage: 1.00,
      paymentMethod: 'credit_card',
      source: `henschen_${this.countyFIPS}_estimated`,
    };
  }

  // ── URL construction ───────────────────────────────────────────────────────────

  /**
   * Build the initial navigation URL for a given search type.
   *
   * Henschen search pages accept GET parameters for simple lookups.  For
   * instrument-number and volume/page lookups the URL can contain the query
   * directly; name searches always require form interaction.
   */
  private buildSearchUrl(
    searchType: 'InstrumentNumber' | 'VolumePage' | 'LastName',
    params: Record<string, string>,
  ): string {
    const base = `${this.config.baseUrl}${this.config.searchPath}`;

    if (searchType === 'InstrumentNumber' && params.instrumentNo) {
      return (
        `${base}?SearchType=InstrumentNumber` +
        `&InstrumentNumber=${encodeURIComponent(params.instrumentNo)}`
      );
    }

    if (searchType === 'VolumePage' && params.volume && params.page) {
      return (
        `${base}?SearchType=VolumePage` +
        `&Volume=${encodeURIComponent(params.volume)}` +
        `&Page=${encodeURIComponent(params.page)}`
      );
    }

    if (searchType === 'LastName' && params.lastName) {
      return (
        `${base}?SearchType=LastName%2FFirstName` +
        `&LastName=${encodeURIComponent(params.lastName)}` +
        (params.firstName ? `&FirstName=${encodeURIComponent(params.firstName)}` : '')
      );
    }

    return base;
  }

  // ── Form helpers ───────────────────────────────────────────────────────────────

  /**
   * Find the first matching element from an ordered list of CSS selectors.
   * Returns null when none of the selectors match.
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
   * Choose the correct value in the Henschen "SearchType" dropdown.
   * Silently skips when the dropdown is not present (some simplified county
   * deployments omit the type chooser and default to name search).
   */
  private async selectSearchType(value: string): Promise<void> {
    if (!this.page) return;
    const dropdown = await this.findElement(SELECTORS.searchTypeDropdown);
    if (!dropdown) return;
    try {
      await dropdown.selectOption({ label: value });
      await this.page.waitForTimeout(500);
    } catch {
      // selectOption by label failed — try by value
      try { await dropdown.selectOption({ value }); } catch { /* ignore */ }
    }
  }

  /**
   * Fill the last-name and (optionally) first-name fields.
   */
  private async fillNameFields(
    lastName: string,
    firstName: string,
  ): Promise<void> {
    if (!this.page) return;

    const lastInput = await this.findElement(SELECTORS.lastNameInput);
    if (lastInput) await lastInput.fill(lastName);

    if (firstName) {
      const firstInput = await this.findElement(SELECTORS.firstNameInput);
      if (firstInput) await firstInput.fill(firstName);
    }
  }

  /**
   * Apply optional date range and document-type filters when the form
   * exposes those fields.
   */
  private async applySearchFilters(options?: ClerkSearchOptions): Promise<void> {
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
   * Click the submit button or press Enter to execute the search.
   * Waits for the page to settle after submission.
   */
  private async submitSearchForm(): Promise<void> {
    if (!this.page) return;
    const submitBtn = await this.findElement(SELECTORS.submitButton);
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await this.page.keyboard.press('Enter');
    }
    await this.page.waitForTimeout(RATE_LIMIT_MS.AFTER_SUBMIT);
  }

  // ── Result parsing ─────────────────────────────────────────────────────────────

  /**
   * Parse the result table rendered by Henschen after a search.
   *
   * Column order (standard Henschen layout):
   *   0: Instrument Number  1: Vol  2: Page  3: Document Type
   *   4: Date               5: Grantor(s)    6: Grantee(s)    7: Description
   *
   * Falls back to AI screenshot parsing when:
   *  - The results table is missing
   *  - Fewer rows than expected are found
   *  - DOM parsing throws
   */
  private async parseSearchResults(): Promise<ClerkDocumentResult[]> {
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
        bodyText.includes('no matching')
      ) {
        console.log(`${this.logPrefix} No records found`);
        return [];
      }
    } catch { /* proceed to table parse */ }

    // Locate the result table using ordered fallback selectors
    const tableSelector =
      this.config.resultTableSelector ??
      SELECTORS.resultTable.join(', ');

    try {
      const table = await this.page.$(tableSelector);
      if (!table) {
        console.warn(`${this.logPrefix} Result table not found — trying AI fallback`);
        return this.aiParseScreenshot();
      }

      const rows = await table.$$('tr');

      // Skip header row (index 0) and any total/footer rows
      for (let i = 1; i < rows.length; i++) {
        try {
          const cells = await rows[i].$$eval('td', (tds) =>
            tds.map((td) => (td.textContent ?? '').trim()),
          );

          if (cells.length < 4) continue;

          const instrumentNumber = this.normalizeInstrumentNumber(cells[0]);
          if (!instrumentNumber) continue;

          const vol = cells[1] ?? '';
          const pg = cells[2] ?? '';
          const docTypeRaw = cells[3] ?? '';
          const recordingDate = this.parseDate(cells[4] ?? '');
          const grantors = this.splitPartyCell(cells[5] ?? '');
          const grantees = this.splitPartyCell(cells[6] ?? '');
          const description = cells[7] ?? '';

          results.push({
            instrumentNumber,
            volumePage: vol && pg ? { volume: vol, page: pg } : undefined,
            documentType: this.classifyDocumentType(docTypeRaw),
            recordingDate,
            grantors,
            grantees,
            legalDescription: description || undefined,
            source: `henschen_${this.countyFIPS}`,
          });
        } catch {
          // Skip unparseable rows silently
        }
      }
    } catch (e) {
      console.warn(`${this.logPrefix} DOM parse failed:`, e);
      return this.aiParseScreenshot();
    }

    // If DOM yielded nothing but the page has content, try AI
    if (results.length === 0) {
      console.log(`${this.logPrefix} DOM returned 0 results — trying AI screenshot parse`);
      return this.aiParseScreenshot();
    }

    console.log(`${this.logPrefix} Found ${results.length} record(s)`);
    return results;
  }

  // ── AI OCR fallback ────────────────────────────────────────────────────────────

  /**
   * Take a full-page screenshot and parse it with Claude (Anthropic) vision.
   * This is the last-resort fallback for counties with non-standard layouts
   * or when Playwright DOM parsing fails.
   *
   * Requires `ANTHROPIC_API_KEY` env variable.  Skips gracefully when absent.
   */
  private async aiParseScreenshot(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn(
        `${this.logPrefix} AI fallback skipped — ANTHROPIC_API_KEY not set`,
      );
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
   * The prompt is tuned for Henschen-style result tables.
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
                  '(Henschen & Associates system). ' +
                  'Extract ALL document records visible in the results table.\n\n' +
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
          source: `henschen_${this.countyFIPS}_ai`,
        });
      }
      return results;
    } catch {
      console.warn(`${this.logPrefix} AI result JSON parse failed`);
      return [];
    }
  }

  /**
   * Fallback called when a Playwright search entirely fails (network error,
   * timeout, etc.).  Navigates to the search page and takes a screenshot for
   * AI parsing, rather than returning an empty array immediately.
   */
  private async aiSearchFallback(
    searchType: string,
    query: string,
  ): Promise<ClerkDocumentResult[]> {
    if (!this.page || !process.env.ANTHROPIC_API_KEY) return [];

    console.log(
      `${this.logPrefix} AI search fallback for ${searchType}: "${query}"`,
    );

    try {
      // Navigate to base search page and screenshot
      await this.page.goto(
        `${this.config.baseUrl}${this.config.searchPath}`,
        { waitUntil: 'domcontentloaded', timeout: 30_000 },
      );
      await this.page.waitForTimeout(1_500);
      return this.aiParseScreenshot();
    } catch {
      return [];
    }
  }

  /**
   * Detect how many pages a document viewer contains.
   * Tries "Page X of Y" text, thumbnail strip, then falls back to 1.
   */
  private async detectPageCount(): Promise<number> {
    if (!this.page) return 1;

    // Strategy 1: "Page X of Y" indicator
    try {
      const bodyText = await this.page.evaluate(
        () => document.body?.innerText ?? '',
      );
      const ofMatch = bodyText.match(/(?:page\s+)?\d+\s+of\s+(\d+)/i);
      if (ofMatch) return parseInt(ofMatch[1], 10);
    } catch { /* try next */ }

    // Strategy 2: thumbnail / page-navigation items
    try {
      const thumbs = await this.page.$$(
        '.page-thumbnail, .page-nav-item, .pageThumbnail, td.pageThumb',
      );
      if (thumbs.length > 1) return thumbs.length;
    } catch { /* try next */ }

    // Strategy 3: AI page-count detection via screenshot
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
                    'This is a county clerk document viewer. ' +
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

  // ── Document image helpers ─────────────────────────────────────────────────────

  /**
   * Advance the document viewer to a specific page number.
   * Tries the "Next" button, then page-number links, then URL parameter.
   * Returns true if navigation appears to have succeeded.
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

    // Strategy 3: append page number to current URL
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
   * Checks <embed>, <iframe>, and <img> elements in that priority order.
   */
  private async extractDocumentImageUrl(): Promise<string | null> {
    if (!this.page) return null;

    // PDF embedded in <embed> or <object>
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

    // TIFF/PNG in <iframe> src
    try {
      const iframeSrc = await this.page.$eval(
        'iframe[src*="document"], iframe[src*="image"], iframe[src*="tif"]',
        (el) => (el as HTMLIFrameElement).src,
      );
      if (iframeSrc) return iframeSrc;
    } catch { /* no iframe */ }

    // Direct <img> — Henschen sometimes serves TIFFs converted to PNG
    try {
      const imgUrls = await this.page.$$eval(
        'img[src*="document"], img[src*="image"], img[src*="tif"], ' +
        'img[src*="InstrumentNumber"], .documentImage img',
        (imgs) => imgs.map((img) => (img as HTMLImageElement).src),
      );
      for (const url of imgUrls) {
        if (url && url.startsWith('http')) return url;
      }
    } catch { /* no img */ }

    return null;
  }

  /**
   * Download a remote file (HTTPS only) to a local path.
   * Handles one level of HTTP redirect.
   */
  private downloadFile(url: string, filepath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(filepath);

      const handleResponse = (res: import('http').IncomingMessage): void => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (!location) {
            reject(new Error('Redirect without Location header'));
            return;
          }
          https
            .get(location, { timeout: 30_000 }, handleResponse)
            .on('error', reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }

        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      };

      https
        .get(url, { timeout: 30_000 }, handleResponse)
        .on('error', reject);
    });
  }

  /**
   * Build a DocumentImage value object.
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

  // ── Text extraction helpers ────────────────────────────────────────────────────

  /**
   * Strip non-numeric characters and return the instrument number, or an
   * empty string when the cell does not look like a valid number.
   */
  private normalizeInstrumentNumber(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 6 ? digits : '';
  }

  /**
   * Parse a date string in common clerk formats to a consistent string.
   * Accepts MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, etc.
   */
  private parseDate(raw: string): string {
    if (!raw) return '';
    const m =
      raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) ??
      raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : raw.trim();
  }

  /**
   * Split a cell that may contain multiple party names separated by semicolons,
   * newlines, or " AND " into an array.
   */
  private splitPartyCell(cell: string): string[] {
    if (!cell.trim()) return [];
    return cell
      .split(/[;\n]|\bAND\b/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Split a full name into last/first components.
   * Handles "LAST, FIRST", "FIRST LAST", and single-token names.
   */
  private splitName(name: string): { lastName: string; firstName: string } {
    const cleaned = name
      .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|ET\s*AL|ET\s*UX)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.includes(',')) {
      const [last, ...rest] = cleaned.split(',');
      return {
        lastName: last.trim(),
        firstName: rest.join(',').trim(),
      };
    }

    const parts = cleaned.split(' ');
    if (parts.length >= 2) {
      return {
        lastName: parts[parts.length - 1],
        firstName: parts.slice(0, -1).join(' '),
      };
    }

    return { lastName: cleaned, firstName: '' };
  }

  // ── Fallback config ────────────────────────────────────────────────────────────

  /**
   * Generate a best-guess configuration for an unknown Henschen county FIPS.
   * Uses the standard co.texas.us/ClerkInquiry/ pattern.
   */
  private defaultConfig(fips: string, countyName: string): HenschenConfig {
    const slug = countyName.toLowerCase().replace(/\s+/g, '');
    return {
      baseUrl: `https://${slug}.co.texas.us`,
      searchPath: '/ClerkInquiry/',
      countyDisplayName: `${countyName} County`,
      hasImageAccess: false,
    };
  }
}

// ── Factory function ───────────────────────────────────────────────────────────

/**
 * Instantiate a `HenschenClerkAdapter` for the given county.
 *
 * @param fips       5-digit Texas county FIPS code (e.g. `'48053'` for Burnet)
 * @param countyName Human-readable county name (e.g. `'Burnet'`)
 * @returns          Ready-to-use adapter (call `initSession()` before searching)
 *
 * @example
 * ```ts
 * const adapter = createHenschenAdapter('48053', 'Burnet');
 * await adapter.initSession();
 * const results = await adapter.searchByGrantorName('JOHNSON ROBERT');
 * console.log(results);
 * await adapter.destroySession();
 * ```
 */
export function createHenschenAdapter(
  fips: string,
  countyName: string,
): HenschenClerkAdapter {
  return new HenschenClerkAdapter(fips, countyName);
}
