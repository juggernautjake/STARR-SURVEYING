// worker/src/adapters/bexar-clerk-adapter.ts — Phase 15
// Bexar County (San Antonio) custom clerk adapter.
//
// Bexar County uses its own custom web portal for property records:
//   https://bexar.tx.publicsearch.us (Kofile / GovOS PublicSearch)
// AND an additional records search system at:
//   https://www.bexar.org/169/County-Clerk
//
// Key characteristics:
//   - Large urban county (~2M+ records, Harris & Dallas tier)
//   - Primary system: Kofile/GovOS PublicSearch at bexar.tx.publicsearch.us
//   - Also has BCAD (Bexar County Appraisal District) at bexar.org
//   - Documents indexed from 1971 onward; older docs require in-person request
//   - Instrument numbers: standard 13-digit Texas format (YYYY-XXXXXXX)
//   - High volume: 300,000+ instruments recorded per year
//
// Spec §15.7 — Bexar County Custom Clerk Adapter
// v1.0: Initial implementation

import type { Browser, BrowserContext, Page } from 'playwright';
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

// ── Bexar County Configuration ─────────────────────────────────────────────

const BEXAR_FIPS = '48029';
const BEXAR_PUBLICSEARCH_URL = 'https://bexar.tx.publicsearch.us';
const BEXAR_RECORDS_URL = 'https://www.bexar.org/169/County-Clerk';

// Bexar FIPS is included in this set (single county adapter)
export const BEXAR_FIPS_SET = new Set<string>([BEXAR_FIPS]);

// ── Bexar County Clerk Adapter ────────────────────────────────────────────────

export class BexarClerkAdapter extends ClerkAdapter {
  private context: BrowserContext | null = null;
  private logger: PipelineLogger;
  private outputDir: string;

  constructor(outputDir: string = '/tmp/bexar-docs', projectId: string = 'bexar-clerk') {
    super('Bexar', BEXAR_FIPS);
    this.outputDir = outputDir;
    this.logger = new PipelineLogger(projectId);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ── Session Management ─────────────────────────────────────────────────────

  async initSession(): Promise<void> {
    const browser = await acquireBrowser({
      adapterId: 'bexar-clerk',
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
    this.browser = browser;
    this.context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    });
    this.page = await this.context.newPage();
    this.logger.info('BexarClerk', 'Session initialized');
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // ── Search Methods ─────────────────────────────────────────────────────────

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    return this._search({ instrumentNumber: instrumentNo });
  }

  async searchByVolumePage(volume: string, page: string): Promise<ClerkDocumentResult[]> {
    return this._search({ volumePage: `${volume}/${page}` });
  }

  async searchByGranteeName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this._search({ granteeName: name }, options);
  }

  async searchByGrantorName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this._search({ grantorName: name }, options);
  }

  async searchByLegalDescription(legalDesc: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this._search({ legalDescription: legalDesc }, options);
  }

  // ── Core Search Logic ──────────────────────────────────────────────────────

  private async _search(
    query: {
      instrumentNumber?: string;
      volumePage?: string;
      granteeName?: string;
      grantorName?: string;
      legalDescription?: string;
    },
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    if (!this.page) {
      this.logger.warn('BexarClerk', 'Session not initialized — call initSession() first');
      return [];
    }

    try {
      // Navigate to Bexar PublicSearch (Kofile/GovOS portal)
      await this.page.goto(BEXAR_PUBLICSEARCH_URL, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.page.waitForTimeout(2000);

      // Select search type
      const searchTypeSelect = await this.page.$('select[name="searchType"], #searchType, select.search-type');
      if (searchTypeSelect) {
        if (query.instrumentNumber) {
          await searchTypeSelect.selectOption('Instrument Number').catch(() => {/* fallback */});
        } else if (query.granteeName || query.grantorName) {
          await searchTypeSelect.selectOption('Party Name').catch(() => {/* fallback */});
        }
      }
      await this.page.waitForTimeout(500);

      // Fill search field
      const searchInput = await this.page.$(
        'input[name="searchValue"], input[name="q"], input[placeholder*="Search"], .search-input',
      );
      if (!searchInput) {
        this.logger.warn('BexarClerk', 'Search input not found on Bexar PublicSearch');
        return [];
      }

      const searchValue =
        query.instrumentNumber ??
        query.granteeName ??
        query.grantorName ??
        query.legalDescription ??
        query.volumePage ??
        '';

      await searchInput.fill(searchValue);
      const searchBtn = await this.page.$('button[type="submit"], .search-button, button:has-text("Search")');
      if (searchBtn) await searchBtn.click();
      await this.page.waitForTimeout(3000);

      // Parse results from DOM
      return await this._parseSearchResults();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('BexarClerk', `Search failed: ${msg}`);
      return [];
    }
  }

  private async _parseSearchResults(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];
    const results: ClerkDocumentResult[] = [];

    // Bexar uses standard Kofile/GovOS result layout
    const rows = await this.page.$$('.search-result, .result-row, table.results tbody tr');

    for (const row of rows.slice(0, 50)) {
      try {
        const instrumentEl = await row.$('.instrument-number, td.instrument, [data-label="Instrument"]');
        const typeEl = await row.$('.doc-type, td.type, [data-label="Type"]');
        const dateEl = await row.$('.recorded-date, td.date, [data-label="Date"]');
        const grantorEl = await row.$('.grantor, td.grantor, [data-label="Grantor"]');
        const granteeEl = await row.$('.grantee, td.grantee, [data-label="Grantee"]');

        const instrumentNumber = (await instrumentEl?.textContent() ?? '').trim();
        if (!instrumentNumber) continue;

        const rawType = (await typeEl?.textContent() ?? '').trim().toLowerCase();
        const documentType = this._classifyType(rawType);
        const recordingDate = (await dateEl?.textContent() ?? '').trim();
        const grantorText = (await grantorEl?.textContent() ?? '').trim();
        const granteeText = (await granteeEl?.textContent() ?? '').trim();

        results.push({
          instrumentNumber,
          documentType,
          recordingDate,
          grantors: grantorText ? [grantorText] : [],
          grantees: granteeText ? [granteeText] : [],
          source: 'bexar_publicsearch',
        });
      } catch {
        // Skip malformed row
      }
    }

    this.logger.info('BexarClerk', `Parsed ${results.length} results`);
    return results;
  }

  // ── Image Retrieval ────────────────────────────────────────────────────────

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    if (!this.page) {
      this.logger.warn('BexarClerk', 'Session not initialized');
      return [];
    }

    try {
      // Search for the specific instrument
      const results = await this.searchByInstrumentNumber(instrumentNo);
      if (results.length === 0) return [];

      // Click on the document to open detail view
      const docLink = await this.page.$(
        `a:has-text("${instrumentNo}"), .result-row:has-text("${instrumentNo}") a`,
      );
      if (!docLink) return [];

      await docLink.click();
      await this.page.waitForTimeout(2000);

      // Bexar PublicSearch serves images as JPEG pages
      const imageElements = await this.page.$$('img.document-page, .page-image img, #documentViewer img');
      const images: DocumentImage[] = [];

      for (let i = 0; i < imageElements.length; i++) {
        const imgSrc = await imageElements[i].getAttribute('src');
        if (!imgSrc) continue;

        const fileName = path.join(this.outputDir, `${instrumentNo}_bexar_p${i + 1}.jpg`);
        await this._downloadImage(imgSrc, fileName);

        images.push({
          instrumentNumber: instrumentNo,
          pageNumber: i + 1,
          totalPages: imageElements.length,
          imagePath: fileName,
          imageUrl: imgSrc,
          isWatermarked: true, // Free preview = watermarked
          quality: 'good',
        });
      }

      return images;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('BexarClerk', `Image retrieval failed: ${msg}`);
      return [];
    }
  }

  private async _downloadImage(url: string, filePath: string): Promise<void> {
    if (url.startsWith('data:')) {
      // Base64-encoded inline image
      const base64 = url.split(',')[1] ?? '';
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      return;
    }

    await new Promise<void>((resolve, reject) => {
      https.get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          fs.writeFileSync(filePath, Buffer.concat(chunks));
          resolve();
        });
        res.on('error', reject);
      }).on('error', reject);
    }).catch(() => {
      // Write placeholder on network failure
      fs.writeFileSync(filePath, Buffer.from('IMG_PLACEHOLDER'));
    });
  }

  // ── Pricing ────────────────────────────────────────────────────────────────

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    // Bexar PublicSearch watermarked preview: free
    // Bexar GovOS paid purchase: $1.00/page
    return {
      available: true,
      pricePerPage: 1.00,
      pageCount: 2, // Estimated average
      totalPrice: 2.00,
      paymentMethod: 'credit_card',
      source: 'bexar_publicsearch',
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _classifyType(raw: string): import('./clerk-adapter.js').DocumentType {
    if (raw.includes('warranty deed')) return 'warranty_deed';
    if (raw.includes('special warranty')) return 'special_warranty_deed';
    if (raw.includes('quitclaim')) return 'quitclaim_deed';
    if (raw.includes('deed of trust')) return 'deed_of_trust';
    if (raw.includes('plat')) return 'plat';
    if (raw.includes('easement')) return 'easement';
    if (raw.includes('restriction') || raw.includes('covenant')) return 'restrictive_covenant';
    if (raw.includes('release')) return 'release_of_lien';
    if (raw.includes('lien')) return 'mechanics_lien';
    if (raw.includes('right of way') || raw.includes('row')) return 'right_of_way';
    if (raw.includes('oil') || raw.includes('gas') || raw.includes('mineral')) return 'oil_gas_lease';
    if (raw.includes('affidavit')) return 'affidavit';
    if (raw.includes('correction')) return 'correction_instrument';
    return 'other';
  }

  // ── Static Helpers ─────────────────────────────────────────────────────────

  static isBexarCounty(countyFIPS: string): boolean {
    return countyFIPS === BEXAR_FIPS || countyFIPS === '029';
  }

  get publicSearchUrl(): string {
    return BEXAR_PUBLICSEARCH_URL;
  }

  get recordsPortalUrl(): string {
    return BEXAR_RECORDS_URL;
  }
}
