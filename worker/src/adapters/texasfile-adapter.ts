// worker/src/adapters/texasfile-adapter.ts
// Phase 2: TexasFileAdapter — universal fallback for all 254 Texas counties.
//
// TexasFile.com provides an index-only view for every Texas county clerk system.
// Free access returns metadata only (no document images); $1/page for images.
//
// Architecture:
//   - SPA (React) — requires Playwright for search
//   - Universal coverage: works for any Texas county
//   - Free: instrument numbers, dates, grantor/grantee, doc types, page count
//   - Paid: $1/page for un-watermarked images (wallet-based payment)
//
// This adapter is used as a fallback when no county-specific adapter exists
// (CountyFusion, Kofile, Tyler, etc.) and provides index-level data to
// identify which instrument numbers exist before handing off to purchase.
//
// Spec §2.7 — TexasFile Universal Fallback Adapter

import { acquireBrowser } from '../lib/browser-factory.js';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type ClerkSearchOptions,
  type DocumentType,
} from './clerk-adapter.js';

/** Base URL for TexasFile public search */
const TEXASFILE_BASE = 'https://www.texasfile.com';

/** Rate limits — TexasFile is more sensitive than county systems */
const RATE_LIMIT_MS = {
  SEARCH_DELAY:    3_000,
  RESULT_WAIT:     2_500,
  BETWEEN_PAGES:   2_000,
} as const;

/** Maximum retries on transient failures */
const MAX_RETRIES = 2;

export class TexasFileAdapter extends ClerkAdapter {
  /** Per-page price for TexasFile document purchases */
  private static readonly PRICE_PER_PAGE = 1.00;

  /** Whether we've already navigated to the TexasFile search page */
  private sessionReady = false;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await acquireBrowser({
      adapterId: 'texasfile',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1920, height: 1080 },
    });

    this.page = await context.newPage();
    this.sessionReady = false;
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.sessionReady = false;
    }
  }

  // ── Navigation helper ─────────────────────────────────────────────────────────

  /**
   * Navigate to TexasFile and select the correct county if not already there.
   * TexasFile uses a county dropdown on the main search page.
   */
  private async ensureOnSearchPage(): Promise<void> {
    if (!this.page) throw new Error('Session not initialized');

    if (this.sessionReady) return;

    await this.page.goto(`${TEXASFILE_BASE}/search`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await this.page.waitForTimeout(1_500);

    // Select the county from the dropdown using FIPS or county name
    const countySelector = await this.page.$(
      'select[name="county"], select[id="county"], select[aria-label*="county" i]',
    );

    if (countySelector) {
      // Try to select by FIPS value first, then by display text
      await countySelector.selectOption({ value: this.countyFIPS }).catch(async () => {
        await countySelector.selectOption({ label: this.countyName }).catch(() => {
          // County not in dropdown; page will use default
        });
      });
      await this.page.waitForTimeout(800);
    }

    this.sessionReady = true;
  }

  // ── Search methods ────────────────────────────────────────────────────────────

  async searchByInstrumentNumber(
    instrumentNo: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(
      `[TexasFile/${this.countyName}] Searching instrument# ${instrumentNo}...`,
    );

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.ensureOnSearchPage();

        // Fill instrument number field
        const instrInput = await this.page.$(
          'input[name="instrno"], input[placeholder*="instrument" i], ' +
          'input[id*="instrument" i], #InstrumentNumber',
        );

        if (instrInput) {
          await instrInput.fill('');
          await instrInput.type(instrumentNo);
          await this.page.keyboard.press('Enter');
          await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
          return await this.parseResults();
        }

        // Fallback: navigate directly to search URL
        await this.page.goto(
          `${TEXASFILE_BASE}/search?county=${this.countyFIPS}&instrno=${encodeURIComponent(instrumentNo)}`,
          { waitUntil: 'networkidle', timeout: 30_000 },
        );
        await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
        return await this.parseResults();
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          console.warn(`[TexasFile/${this.countyName}] Instrument# search failed:`, e);
          return [];
        }
        this.sessionReady = false;
        await this.page.waitForTimeout(2_000);
      }
    }
    return [];
  }

  async searchByVolumePage(
    volume: string,
    pg: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(`[TexasFile/${this.countyName}] Searching Vol ${volume} / Pg ${pg}...`);

    try {
      await this.ensureOnSearchPage();
      await this.page.goto(
        `${TEXASFILE_BASE}/search?county=${this.countyFIPS}&vol=${encodeURIComponent(volume)}&pg=${encodeURIComponent(pg)}`,
        { waitUntil: 'networkidle', timeout: 30_000 },
      );
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
      return await this.parseResults();
    } catch (e) {
      console.warn(`[TexasFile/${this.countyName}] Vol/Page search failed:`, e);
      return [];
    }
  }

  async searchByGranteeName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const cleanName = this.cleanName(name);
    console.log(`[TexasFile/${this.countyName}] Searching grantee: "${cleanName}"...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.ensureOnSearchPage();

        // Attempt to fill the grantee name field in the SPA form
        const nameInput = await this.page.$(
          'input[name="grantee"], input[placeholder*="Grantee" i], #grantee',
        );

        if (nameInput) {
          await nameInput.fill('');
          await nameInput.type(cleanName);

          // Set document type filter if provided
          if (options?.documentTypes?.length) {
            await this.applyDocTypeFilter(options.documentTypes);
          }

          await this.page.keyboard.press('Enter');
          await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
          return await this.parseResults();
        }

        // Fallback URL
        await this.page.goto(
          `${TEXASFILE_BASE}/search?county=${this.countyFIPS}&grantee=${encodeURIComponent(cleanName)}`,
          { waitUntil: 'networkidle', timeout: 30_000 },
        );
        await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
        return await this.parseResults();
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          console.warn(`[TexasFile/${this.countyName}] Grantee search failed:`, e);
          return [];
        }
        this.sessionReady = false;
        await this.page.waitForTimeout(2_000);
      }
    }
    return [];
  }

  async searchByGrantorName(
    name: string,
    options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const cleanName = this.cleanName(name);
    console.log(`[TexasFile/${this.countyName}] Searching grantor: "${cleanName}"...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.ensureOnSearchPage();

        const nameInput = await this.page.$(
          'input[name="grantor"], input[placeholder*="Grantor" i], #grantor',
        );

        if (nameInput) {
          await nameInput.fill('');
          await nameInput.type(cleanName);

          if (options?.documentTypes?.length) {
            await this.applyDocTypeFilter(options.documentTypes);
          }

          await this.page.keyboard.press('Enter');
          await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
          return await this.parseResults();
        }

        await this.page.goto(
          `${TEXASFILE_BASE}/search?county=${this.countyFIPS}&grantor=${encodeURIComponent(cleanName)}`,
          { waitUntil: 'networkidle', timeout: 30_000 },
        );
        await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
        return await this.parseResults();
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          console.warn(`[TexasFile/${this.countyName}] Grantor search failed:`, e);
          return [];
        }
        this.sessionReady = false;
        await this.page.waitForTimeout(2_000);
      }
    }
    return [];
  }

  async searchByLegalDescription(
    _legalDesc: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    // TexasFile does not support legal-description full-text search in the free tier
    return [];
  }

  // ── Document access ───────────────────────────────────────────────────────────

  /**
   * TexasFile requires wallet-based purchase for document images.
   * Returns an empty array — use getDocumentPricing() to check cost and
   * Phase 9 (Document Purchase) for the actual purchase flow.
   */
  async getDocumentImages(_instrumentNo: string): Promise<DocumentImage[]> {
    // TexasFile images require purchase; Phase 9 handles the purchase flow.
    return [];
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    // Try to get the actual page count from a cached search result or live query
    const pageCount = await this.fetchPageCount(instrumentNo);
    const totalPrice = pageCount ? pageCount * TexasFileAdapter.PRICE_PER_PAGE : undefined;

    return {
      available: true,
      pricePerPage: TexasFileAdapter.PRICE_PER_PAGE,
      totalPrice,
      pageCount,
      paymentMethod: 'wallet',
      source: `texasfile_${this.countyFIPS}`,
    };
  }

  // ── Result parser ─────────────────────────────────────────────────────────────

  /**
   * Parse TexasFile search results.
   * TexasFile is a React SPA; results render into a table after the JS executes.
   * We parse the rendered DOM.
   */
  private async parseResults(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    const results: ClerkDocumentResult[] = [];

    try {
      // Wait for results to render
      await this.page.waitForSelector(
        'table tbody tr, .result-row, .search-result',
        { timeout: 8_000 },
      ).catch(() => {});

      const pageText = await this.page.evaluate(
        () => (document.body.innerText ?? '').toLowerCase(),
      );
      if (
        pageText.includes('no records') ||
        pageText.includes('no results') ||
        pageText.includes('0 result')
      ) {
        return [];
      }

      // Grab all table rows
      const rows = await this.page.$$(
        'table tbody tr, .result-row',
      );

      for (const row of rows) {
        try {
          const text = await row.innerText();
          const parsed = this.parseResultRow(text);
          if (parsed) results.push(parsed);
        } catch {
          // Skip unparseable rows
        }
      }

      // Handle pagination — TexasFile shows 25 results per page
      if (results.length >= 25) {
        const nextBtn = await this.page.$(
          '.next-page, button:has-text("Next"), [aria-label="Next"]',
        );
        if (nextBtn) {
          await nextBtn.click();
          await this.page.waitForTimeout(RATE_LIMIT_MS.BETWEEN_PAGES);
          const nextPageResults = await this.parseResults();
          results.push(...nextPageResults);
        }
      }
    } catch (e) {
      console.warn(`[TexasFile/${this.countyName}] DOM parsing failed:`, e);
    }

    console.log(
      `[TexasFile/${this.countyName}] Found ${results.length} records`,
    );

    return results;
  }

  /**
   * Parse one row of TexasFile search results.
   * TexasFile columns (typical order):
   *   Filing Date | Instrument# | Doc Type | Grantors | Grantees | Book/Page | Pages
   */
  private parseResultRow(rowText: string): ClerkDocumentResult | null {
    // Instrument number: 8–13 digit number
    const instrMatch = rowText.match(/\b(\d{8,13})\b/);
    if (!instrMatch) return null;

    const instrumentNumber = instrMatch[1];

    // Recording date
    const dateMatch =
      rowText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ??
      rowText.match(/(\d{4}-\d{2}-\d{2})/);
    const recordingDate = dateMatch ? dateMatch[1] : '';

    // Page count (e.g. "3 pages" or "3 pg")
    const pagesMatch = rowText.match(/(\d+)\s*(?:pages?|pg\.?)/i);
    const pageCount = pagesMatch ? parseInt(pagesMatch[1], 10) : undefined;

    // Volume/page reference
    const vpMatch = rowText.match(/\b(\d{3,6})\s*[/,]\s*(\d{1,5})\b/);
    const volumePage = vpMatch ? { volume: vpMatch[1], page: vpMatch[2] } : undefined;

    // Document type — extract any type keyword
    const docTypeRaw = this.extractDocTypeFromText(rowText);

    // Party names — extract ALL CAPS multi-word strings
    const nameMatches = rowText.match(/[A-Z][A-Z\s,\.'-]{4,}/g) ?? [];
    const names = nameMatches
      .map((n) => n.trim())
      .filter(
        (n) =>
          n.length > 4 &&
          !n.includes(instrumentNumber) &&
          !/\d{4}/.test(n),
      );

    const grantors = names[0] ? [names[0]] : [];
    const grantees = names[1] ? [names[1]] : [];

    return {
      instrumentNumber,
      documentType: docTypeRaw
        ? this.classifyDocumentType(docTypeRaw)
        : 'other',
      recordingDate,
      grantors,
      grantees,
      volumePage,
      pageCount,
      source: `texasfile_${this.countyFIPS}`,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private extractDocTypeFromText(text: string): string {
    const upper = text.toUpperCase();
    const typeKws = [
      'WARRANTY DEED', 'SPECIAL WARRANTY', 'QUITCLAIM', 'DEED OF TRUST',
      'PLAT', 'REPLAT', 'AMENDED PLAT', 'EASEMENT', 'RESTRICTIVE COVENANT',
      'CC&R', 'RIGHT OF WAY', 'DEDICATION', 'RELEASE OF LIEN',
      'AFFIDAVIT', 'CORRECTION', 'OIL', 'MINERAL', 'LEASE',
    ];
    for (const kw of typeKws) {
      if (upper.includes(kw)) return kw;
    }
    return '';
  }

  private async applyDocTypeFilter(docTypes: DocumentType[]): Promise<void> {
    if (!this.page) return;
    const select = await this.page.$(
      'select[name="docType"], select[name="type"], #documentType',
    );
    if (!select) return;

    // Map our canonical type to TexasFile's display label (best-effort)
    const labelMap: Partial<Record<DocumentType, string>> = {
      warranty_deed: 'Warranty Deed',
      plat: 'Plat',
      easement: 'Easement',
      deed_of_trust: 'Deed of Trust',
    };

    for (const dt of docTypes) {
      const label = labelMap[dt];
      if (label) {
        await select.selectOption({ label }).catch(() => {});
        break;  // TexasFile only supports one type filter at a time
      }
    }
  }

  private cleanName(name: string): string {
    return name
      .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Attempt to get the page count for a known instrument number */
  private async fetchPageCount(instrumentNo: string): Promise<number | undefined> {
    try {
      const results = await this.searchByInstrumentNumber(instrumentNo);
      const result = results.find((r) => r.instrumentNumber === instrumentNo);
      return result?.pageCount;
    } catch {
      return undefined;
    }
  }
}
