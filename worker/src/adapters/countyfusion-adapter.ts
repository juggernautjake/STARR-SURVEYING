// worker/src/adapters/countyfusion-adapter.ts
// Phase 2: CountyFusionAdapter — Playwright automation for CountyFusion/Cott Systems.
//
// CountyFusion (by Cott Systems) is the second most common Texas county clerk system,
// used by ~40+ counties.  Key characteristics:
//   - Server-rendered HTML pages (DOM scraping works; still use Playwright for reliability)
//   - SUPERSEARCH endpoint for OCR full-text legal-description queries
//   - No free image preview — returns index metadata only (instrument#, date, type, names)
//   - Pricing info delegated to TexasFile fallback ($1/page universal)
//
// URL patterns vary by county but follow one of two templates:
//   https://www.{county}countyclerk.com/    (county-branded domains)
//   https://countyfusion{N}.kofiletech.com/ (Kofile-hosted CountyFusion)
//
// Spec §2.10 — CountyFusion/Cott Adapter

import { chromium } from 'playwright';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type ClerkSearchOptions,
} from './clerk-adapter.js';

// ── Per-county CountyFusion configuration ─────────────────────────────────────

interface CountyFusionConfig {
  /** Primary base URL for document search */
  baseUrl: string;
  /** Path to the search form (POST target) */
  searchPath: string;
  /** Path to SUPERSEARCH (OCR full-text), or null if not available */
  superSearchPath: string | null;
  /** Display name for logging */
  countyDisplayName: string;
  /** HTML form field name for grantee searches */
  granteeField: string;
  /** HTML form field name for grantor searches */
  grantorField: string;
  /** HTML form field name for instrument number */
  instrumentField: string;
}

/** Known CountyFusion county configurations keyed by 5-digit FIPS code. */
const COUNTYFUSION_CONFIGS: Record<string, CountyFusionConfig> = {
  '48201': {  // Harris County — cclerk.hctx.net ASP.NET Web Forms
    baseUrl: 'https://www.cclerk.hctx.net',
    searchPath: '/Applications/WebSearch/RP.aspx',
    superSearchPath: null,
    countyDisplayName: 'Harris County',
    granteeField: 'ctl00$ContentPlaceHolder1$txtOE',
    grantorField: 'ctl00$ContentPlaceHolder1$txtOR',
    instrumentField: 'ctl00$ContentPlaceHolder1$txtFileNo',
  },
  '48439': {  // Tarrant County — now on publicsearch.us
    baseUrl: 'https://tarrant.tx.publicsearch.us',
    searchPath: '/results',
    superSearchPath: null,
    countyDisplayName: 'Tarrant County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrument',
  },
  '48113': {  // Dallas County — now on publicsearch.us
    baseUrl: 'https://dallas.tx.publicsearch.us',
    searchPath: '/results',
    superSearchPath: null,
    countyDisplayName: 'Dallas County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  },
  '48085': {  // Collin County — now on publicsearch.us
    baseUrl: 'https://collin.tx.publicsearch.us',
    searchPath: '/results',
    superSearchPath: null,
    countyDisplayName: 'Collin County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  },
  '48121': {  // Denton County — now on publicsearch.us
    baseUrl: 'https://denton.tx.publicsearch.us',
    searchPath: '/results',
    superSearchPath: null,
    countyDisplayName: 'Denton County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  },
  '48339': {  // Montgomery County — now on publicsearch.us (verified 200 OK)
    baseUrl: 'https://montgomery.tx.publicsearch.us',
    searchPath: '/results',
    superSearchPath: null,
    countyDisplayName: 'Montgomery County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  },
  '48167': {  // Galveston County — publicsearch.us unreachable; keeping legacy URL
    baseUrl: 'https://countyfusion3.kofiletech.com/countyweb/login.do?countyname=Galveston',
    searchPath: '/countyweb/login.do',
    superSearchPath: null,
    countyDisplayName: 'Galveston County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  },
  '48355': {  // Nueces County — now on publicsearch.us (verified 200 OK)
    baseUrl: 'https://nueces.tx.publicsearch.us',
    searchPath: '/results',
    superSearchPath: null,
    countyDisplayName: 'Nueces County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  },
  '48479': {  // Webb County — publicsearch.us unreachable; keeping legacy URL
    baseUrl: 'https://countyfusion7.kofiletech.com/countyweb/login.do?countyname=Webb',
    searchPath: '/countyweb/login.do',
    superSearchPath: null,
    countyDisplayName: 'Webb County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  },
  '48375': {  // Potter County — now on publicsearch.us (verified 200 OK)
    baseUrl: 'https://potter.tx.publicsearch.us',
    searchPath: '/results',
    superSearchPath: null,
    countyDisplayName: 'Potter County',
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  },
};

/** Default configuration for unknown CountyFusion counties */
function defaultConfig(countyFIPS: string, countyName: string): CountyFusionConfig {
  const key = countyName.toLowerCase().replace(/\s+/g, '');
  return {
    baseUrl: `https://${key}countyclerk.com`,
    searchPath: '/search',
    superSearchPath: null,
    countyDisplayName: `${countyName} County`,
    granteeField: 'grantee',
    grantorField: 'grantor',
    instrumentField: 'instrno',
  };
}

/** Set of all FIPS codes known to use CountyFusion (exported for ClerkRegistry) */
export const COUNTYFUSION_FIPS_SET = new Set<string>(Object.keys(COUNTYFUSION_CONFIGS));

// ── Rate limits ───────────────────────────────────────────────────────────────

const RATE_LIMIT_MS = {
  /** Between search requests */
  SEARCH_DELAY: 2_500,
  /** Between result-page navigations */
  PAGE_NAVIGATION: 2_000,
} as const;

// ── CountyFusionAdapter ───────────────────────────────────────────────────────

export class CountyFusionAdapter extends ClerkAdapter {
  private config: CountyFusionConfig;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    this.config = COUNTYFUSION_CONFIGS[countyFIPS] ?? defaultConfig(countyFIPS, countyName);
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1920, height: 1080 },
    });

    this.page = await context.newPage();

    // Navigate to the base URL to establish a session cookie
    await this.page.goto(this.config.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await this.page.waitForTimeout(1_000);
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  // ── Search methods ────────────────────────────────────────────────────────────

  async searchByInstrumentNumber(
    instrumentNo: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(
      `[CountyFusion/${this.countyName}] Searching instrument# ${instrumentNo}...`,
    );

    try {
      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?${this.config.instrumentField}=${encodeURIComponent(instrumentNo)}`;

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);

      // If navigate lands on a form page, try to submit the form
      const hasForm = await this.page.$('form');
      if (hasForm) {
        await this.fillAndSubmitSearchForm({ instrumentNo });
      }

      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`[CountyFusion/${this.countyName}] Instrument# search failed:`, e);
      return [];
    }
  }

  async searchByVolumePage(
    volume: string,
    pg: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(
      `[CountyFusion/${this.countyName}] Searching Vol ${volume} / Pg ${pg}...`,
    );

    try {
      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?volume=${encodeURIComponent(volume)}&page=${encodeURIComponent(pg)}`;

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`[CountyFusion/${this.countyName}] Vol/Page search failed:`, e);
      return [];
    }
  }

  async searchByGranteeName(
    name: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const cleanName = this.cleanName(name);
    console.log(
      `[CountyFusion/${this.countyName}] Searching grantee: "${cleanName}"...`,
    );

    try {
      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?${this.config.granteeField}=${encodeURIComponent(cleanName)}`;

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);

      const hasForm = await this.page.$('form');
      if (hasForm) {
        await this.fillAndSubmitSearchForm({ grantee: cleanName });
      }

      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`[CountyFusion/${this.countyName}] Grantee search failed:`, e);
      return [];
    }
  }

  async searchByGrantorName(
    name: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const cleanName = this.cleanName(name);
    console.log(
      `[CountyFusion/${this.countyName}] Searching grantor: "${cleanName}"...`,
    );

    try {
      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?${this.config.grantorField}=${encodeURIComponent(cleanName)}`;

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);

      const hasForm = await this.page.$('form');
      if (hasForm) {
        await this.fillAndSubmitSearchForm({ grantor: cleanName });
      }

      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`[CountyFusion/${this.countyName}] Grantor search failed:`, e);
      return [];
    }
  }

  async searchByLegalDescription(
    legalDesc: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    // CountyFusion SUPERSEARCH supports OCR full-text legal description queries
    if (this.config.superSearchPath) {
      return this.superSearch(legalDesc);
    }

    console.warn(
      `[CountyFusion/${this.countyName}] SUPERSEARCH not configured — ` +
      `legal description search unavailable for this county`,
    );
    return [];
  }

  // ── Document access ───────────────────────────────────────────────────────────

  /**
   * CountyFusion does not provide free document image preview.
   * Returns an empty array — callers should use getDocumentPricing() to check
   * purchase availability via TexasFile.
   */
  async getDocumentImages(_instrumentNo: string): Promise<DocumentImage[]> {
    // CountyFusion is index-only in the free tier.
    // Images require purchase; Phase 9 handles that via TexasFile or direct purchase.
    return [];
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    // CountyFusion does not sell images directly; route purchases through TexasFile
    return {
      available: true,
      pricePerPage: 1.00,
      paymentMethod: 'wallet',
      source: `texasfile_${this.countyFIPS}`,
    };
  }

  // ── SUPERSEARCH ───────────────────────────────────────────────────────────────

  private async superSearch(query: string): Promise<ClerkDocumentResult[]> {
    if (!this.page || !this.config.superSearchPath) return [];

    console.log(
      `[CountyFusion/SUPERSEARCH/${this.countyName}] Full-text: "${query.substring(0, 60)}"...`,
    );

    const ssUrl = `${this.config.baseUrl}${this.config.superSearchPath}`;
    await this.page.goto(ssUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.page.waitForTimeout(1_000);

    // SUPERSEARCH accepts a free-text query in a single input
    const input = await this.page.$(
      'input[type="text"], textarea, input[name="query"], #searchInput',
    );
    if (input) {
      await input.fill(query);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(3_000);
    }

    return this.parseSearchResults();
  }

  // ── Form helper ───────────────────────────────────────────────────────────────

  private async fillAndSubmitSearchForm(params: {
    grantee?: string;
    grantor?: string;
    instrumentNo?: string;
  }): Promise<void> {
    if (!this.page) return;

    if (params.grantee) {
      const el = await this.page.$(
        `input[name="${this.config.granteeField}"], #grantee, input[placeholder*="Grantee" i]`,
      );
      if (el) { await el.fill(''); await el.type(params.grantee); }
    }

    if (params.grantor) {
      const el = await this.page.$(
        `input[name="${this.config.grantorField}"], #grantor, input[placeholder*="Grantor" i]`,
      );
      if (el) { await el.fill(''); await el.type(params.grantor); }
    }

    if (params.instrumentNo) {
      const el = await this.page.$(
        `input[name="${this.config.instrumentField}"], #instrno, ` +
        `input[placeholder*="instrument" i], input[placeholder*="Instrument" i]`,
      );
      if (el) { await el.fill(''); await el.type(params.instrumentNo); }
    }

    // Submit the form
    const submitBtn = await this.page.$(
      'button[type="submit"], input[type="submit"], button:has-text("Search")',
    );
    if (submitBtn) {
      await submitBtn.click();
      await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
    } else {
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
    }
  }

  // ── Result parser ─────────────────────────────────────────────────────────────

  /**
   * Parse server-rendered CountyFusion search result tables.
   * CountyFusion renders results as HTML tables with consistent column order:
   *   Recording Date | Instrument# | Book/Page | Doc Type | Grantors | Grantees
   */
  private async parseSearchResults(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    const results: ClerkDocumentResult[] = [];

    try {
      // Try to detect a "no results" message early
      const pageText = await this.page.evaluate(
        () => (document.body.innerText ?? '').toLowerCase(),
      );
      if (
        pageText.includes('no records found') ||
        pageText.includes('no results') ||
        pageText.includes('0 records')
      ) {
        return [];
      }

      // CountyFusion results live in <table> elements; grab all table rows
      const rows = await this.page.$$(
        'table tbody tr, table tr:not(:first-child)',
      );

      for (const row of rows) {
        try {
          const cells = await row.$$('td');
          if (cells.length < 3) continue;

          const cellTexts = await Promise.all(
            cells.map((c) => c.innerText()),
          );

          const result = this.parseCells(cellTexts);
          if (result) results.push(result);
        } catch {
          // Skip unparseable rows
        }
      }
    } catch (e) {
      console.warn(`[CountyFusion/${this.countyName}] DOM parsing failed:`, e);
    }

    console.log(
      `[CountyFusion/${this.countyName}] Found ${results.length} records`,
    );

    return results;
  }

  /**
   * Parse one row of CountyFusion search results.
   * Attempts to identify cells by content patterns rather than hard-coded
   * column positions since layout varies by county deployment.
   */
  private parseCells(cells: string[]): ClerkDocumentResult | null {
    let instrumentNumber = '';
    let recordingDate = '';
    let docTypeRaw = '';
    let volume = '';
    let pg = '';
    const grantors: string[] = [];
    const grantees: string[] = [];

    for (const cell of cells) {
      const trimmed = cell.trim();
      if (!trimmed) continue;

      // Instrument number: 8–13 digit number (CountyFusion uses 8–13 digit formats)
      if (!instrumentNumber) {
        const instrMatch = trimmed.match(/^(\d{8,13})$/);
        if (instrMatch) {
          instrumentNumber = instrMatch[1];
          continue;
        }
      }

      // Recording date: MM/DD/YYYY or YYYY-MM-DD
      if (!recordingDate) {
        const dateMatch =
          trimmed.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ??
          trimmed.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          recordingDate = dateMatch[1];
          continue;
        }
      }

      // Volume/Page: "Vol NNN / Pg NNN" or similar
      if (!volume) {
        const vpMatch = trimmed.match(/(\d+)\s*[/,]\s*(\d+)/);
        if (vpMatch && !looksLikeInstrumentNumber(trimmed)) {
          volume = vpMatch[1];
          pg = vpMatch[2];
          continue;
        }
      }

      // Document type keywords
      if (!docTypeRaw) {
        const typeKws = [
          'DEED', 'PLAT', 'EASEMENT', 'LIEN', 'RESTRICTION', 'COVENANT',
          'RIGHT OF WAY', 'AFFIDAVIT', 'RELEASE', 'LEASE', 'TRUST',
        ];
        if (typeKws.some((kw) => trimmed.toUpperCase().includes(kw))) {
          docTypeRaw = trimmed;
          continue;
        }
      }

      // Names: cells with alphabetic content and commas are likely names
      if (trimmed.length > 3 && /[A-Z]/.test(trimmed) && !/\d{4}/.test(trimmed)) {
        // First long alphabetic cell after instrument# = grantor, second = grantee
        if (grantors.length === 0) {
          grantors.push(trimmed);
        } else if (grantees.length === 0) {
          grantees.push(trimmed);
        }
      }
    }

    if (!instrumentNumber) return null;

    return {
      instrumentNumber,
      documentType: docTypeRaw ? this.classifyDocumentType(docTypeRaw) : 'other',
      recordingDate,
      grantors,
      grantees,
      volumePage: volume ? { volume, page: pg } : undefined,
      source: `countyfusion_${this.countyFIPS}`,
    };
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  /** Strip common entity suffixes to improve CountyFusion search precision */
  private cleanName(name: string): string {
    return name
      .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// ── Local helper (not exported) ───────────────────────────────────────────────

/** Return true if a string looks like a pure instrument number (digits only, 8–13 chars) */
function looksLikeInstrumentNumber(s: string): boolean {
  return /^\d{8,13}$/.test(s.trim());
}
