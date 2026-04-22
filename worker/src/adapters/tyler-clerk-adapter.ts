// worker/src/adapters/tyler-clerk-adapter.ts
// Phase 2: TylerClerkAdapter — Playwright automation for Tyler Technologies
// Odyssey/Eagle county clerk systems.
//
// Tyler Technologies is the third most common Texas county clerk system.
// Key characteristics:
//   - Server-rendered HTML (some counties) or React SPA (newer deployments)
//   - Image preview availability varies by county configuration
//   - Authentication required in some deployments (anonymous for most TX counties)
//   - URL patterns vary significantly by county: some use shared Tyler hosting,
//     others have county-branded domains
//
// Spec §2.10 — Tyler Technologies/Odyssey Clerk Adapter

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

// ── Per-county Tyler configuration ────────────────────────────────────────────

interface TylerConfig {
  /** Base URL for the county clerk search system */
  baseUrl: string;
  /** Path to the search page */
  searchPath: string;
  /** True when this deployment provides free image previews */
  hasImagePreview: boolean;
  /** Display name for logging */
  countyDisplayName: string;
  /** Deployment type — affects DOM parsing strategy */
  deploymentType: 'odyssey' | 'eagle' | 'iqs' | 'generic';
  /** Optional: direct API endpoint when available (avoids Playwright) */
  apiEndpoint?: string;
}

/** Known Tyler county configurations keyed by 5-digit FIPS code. */
const TYLER_CONFIGS: Record<string, TylerConfig> = {
  '48215': {  // Hidalgo County
    baseUrl: 'https://hidalgocountyclerk.com',
    searchPath: '/official-public-records',
    hasImagePreview: true,
    countyDisplayName: 'Hidalgo County',
    deploymentType: 'odyssey',
  },
  '48141': {  // El Paso County
    baseUrl: 'https://legacy.clerkrecords.elpasoco.com',
    searchPath: '/search/SearchEntry.aspx',
    hasImagePreview: true,
    countyDisplayName: 'El Paso County',
    deploymentType: 'iqs',
  },
  '48113': {  // Dallas County — some record types use Tyler/Eagle
    baseUrl: 'https://deed.dallascounty.org',
    searchPath: '/CFSPublic',
    hasImagePreview: false,
    countyDisplayName: 'Dallas County',
    deploymentType: 'eagle',
  },
  '48067': {  // Cass County
    baseUrl: 'https://casscountyclerk.com',
    searchPath: '/records/search',
    hasImagePreview: false,
    countyDisplayName: 'Cass County',
    deploymentType: 'generic',
  },
  '48037': {  // Bowie County
    baseUrl: 'https://bowie.tx.publicsearch.us',
    searchPath: '/results',
    hasImagePreview: false,
    countyDisplayName: 'Bowie County',
    deploymentType: 'odyssey',
  },
  '48097': {  // Cooke County
    baseUrl: 'https://cookecountyclerk.com',
    searchPath: '/search',
    hasImagePreview: false,
    countyDisplayName: 'Cooke County',
    deploymentType: 'generic',
  },
  '48449': {  // Titus County
    baseUrl: 'https://tituscountyclerk.com',
    searchPath: '/records',
    hasImagePreview: false,
    countyDisplayName: 'Titus County',
    deploymentType: 'generic',
  },
};

/** Default configuration for unknown Tyler counties */
function defaultTylerConfig(countyFIPS: string, countyName: string): TylerConfig {
  const key = countyName.toLowerCase().replace(/\s+/g, '');
  return {
    baseUrl: `https://${key}countyclerk.com`,
    searchPath: '/search',
    hasImagePreview: false,
    countyDisplayName: `${countyName} County`,
    deploymentType: 'generic',
  };
}

/** Set of all FIPS codes known to use Tyler Technologies (exported for ClerkRegistry) */
export const TYLER_FIPS_SET = new Set<string>(Object.keys(TYLER_CONFIGS));

// ── Rate limits ───────────────────────────────────────────────────────────────

const RATE_LIMIT_MS = {
  SEARCH_DELAY:    2_500,
  PAGE_NAVIGATION: 2_000,
  DOCUMENT_DOWNLOAD: 5_000,
} as const;

/** Minimum acceptable image file size — files smaller than this are broken/blank */
const MIN_IMAGE_SIZE_BYTES = 10_240;  // 10 KB

// ── TylerClerkAdapter ─────────────────────────────────────────────────────────

export class TylerClerkAdapter extends ClerkAdapter {
  private config: TylerConfig;
  private downloadDir: string;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    this.config = TYLER_CONFIGS[countyFIPS] ?? defaultTylerConfig(countyFIPS, countyName);
    this.downloadDir = `/tmp/harvest/${countyFIPS}`;
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await acquireBrowser({
      adapterId: 'tyler-clerk',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
    });

    this.page = await context.newPage();
    fs.mkdirSync(this.downloadDir, { recursive: true });
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
      `[Tyler/${this.countyName}] Searching instrument# ${instrumentNo}...`,
    );

    try {
      // Tyler/Odyssey: append instrument number as query param
      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?instrument=${encodeURIComponent(instrumentNo)}` +
        `&instrno=${encodeURIComponent(instrumentNo)}`;

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);

      // If a search form appears, fill it in
      await this.tryFillInstrumentForm(instrumentNo);

      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`[Tyler/${this.countyName}] Instrument# search failed:`, e);
      return [];
    }
  }

  async searchByVolumePage(
    volume: string,
    pg: string,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    console.log(`[Tyler/${this.countyName}] Searching Vol ${volume} / Pg ${pg}...`);

    try {
      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?volume=${encodeURIComponent(volume)}&page=${encodeURIComponent(pg)}`;

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);
      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`[Tyler/${this.countyName}] Vol/Page search failed:`, e);
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
    console.log(`[Tyler/${this.countyName}] Searching grantee: "${cleanName}"...`);

    try {
      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?grantee=${encodeURIComponent(cleanName)}` +
        `&name=${encodeURIComponent(cleanName)}`;

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);

      await this.tryFillNameForm(cleanName, 'grantee');
      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`[Tyler/${this.countyName}] Grantee search failed:`, e);
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
    console.log(`[Tyler/${this.countyName}] Searching grantor: "${cleanName}"...`);

    try {
      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?grantor=${encodeURIComponent(cleanName)}` +
        `&name=${encodeURIComponent(cleanName)}`;

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(RATE_LIMIT_MS.SEARCH_DELAY);

      await this.tryFillNameForm(cleanName, 'grantor');
      return await this.parseSearchResults();
    } catch (e) {
      console.warn(`[Tyler/${this.countyName}] Grantor search failed:`, e);
      return [];
    }
  }

  async searchByLegalDescription(
    _legalDesc: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    // Tyler Odyssey generally does not support OCR full-text search in the free tier
    console.warn(
      `[Tyler/${this.countyName}] Legal description search not supported`,
    );
    return [];
  }

  // ── Document access ───────────────────────────────────────────────────────────

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    if (!this.config.hasImagePreview) {
      // Index-only county — no free preview images
      return [];
    }

    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const images: DocumentImage[] = [];
    const outputDir = path.join(this.downloadDir, instrumentNo);
    fs.mkdirSync(outputDir, { recursive: true });

    console.log(
      `[Tyler/${this.countyName}] Downloading images for instrument# ${instrumentNo}...`,
    );

    try {
      const viewerUrl =
        `${this.config.baseUrl}/doc/${instrumentNo}` +
        `?instrument=${instrumentNo}`;

      await this.page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.page.waitForTimeout(2_000);

      // Detect total page count
      let totalPages = 1;
      const pageText = await this.page.evaluate(() => document.body.innerText ?? '');
      const ofMatch = pageText.match(/of\s+(\d+)\s*page/i);
      if (ofMatch) totalPages = parseInt(ofMatch[1], 10);

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          if (pageNum > 1) {
            const nextBtn = await this.page.$(
              '.next-page, button:has-text("Next"), [aria-label="Next page"]',
            );
            if (nextBtn) {
              await nextBtn.click();
              await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
            }
          }

          // Extract image URL from <img> tag or network response
          const imgUrl = await this.extractImageUrl();

          if (imgUrl) {
            const filename = `${instrumentNo}_p${pageNum}.png`;
            const filepath = path.join(outputDir, filename);
            await this.downloadImage(imgUrl, filepath);

            let quality: DocumentImage['quality'] = 'fair';
            try {
              const stat = fs.statSync(filepath);
              if (stat.size < MIN_IMAGE_SIZE_BYTES) { fs.unlinkSync(filepath); continue; }
              if (stat.size > 500_000) quality = 'good';
            } catch { /* ignore */ }

            images.push({
              instrumentNumber: instrumentNo,
              pageNumber: pageNum,
              totalPages,
              imagePath: filepath,
              imageUrl: imgUrl,
              isWatermarked: true,
              quality,
            });
          }

          await this.page.waitForTimeout(RATE_LIMIT_MS.DOCUMENT_DOWNLOAD);
        } catch (e) {
          console.warn(`[Tyler/${this.countyName}] Page ${pageNum} download failed:`, e);
        }
      }
    } catch (e) {
      console.warn(`[Tyler/${this.countyName}] Image retrieval failed:`, e);
    }

    return images;
  }

  async getDocumentPricing(_instrumentNo: string): Promise<PricingInfo> {
    return {
      available: true,
      pricePerPage: 1.00,
      paymentMethod: 'credit_card',
      source: `tyler_${this.countyFIPS}`,
    };
  }

  // ── Form helpers ──────────────────────────────────────────────────────────────

  private async tryFillInstrumentForm(instrumentNo: string): Promise<void> {
    if (!this.page) return;
    const input = await this.page.$(
      'input[name="instrument"], input[name="instrno"], ' +
      'input[placeholder*="instrument" i], #InstrumentNumber',
    );
    if (!input) return;
    await input.fill(instrumentNo);
    await this.submitForm();
  }

  private async tryFillNameForm(
    name: string,
    type: 'grantee' | 'grantor',
  ): Promise<void> {
    if (!this.page) return;
    const selector =
      type === 'grantee'
        ? 'input[name="grantee"], #Grantee, input[placeholder*="Grantee" i]'
        : 'input[name="grantor"], #Grantor, input[placeholder*="Grantor" i]';
    const input = await this.page.$(selector);
    if (!input) return;
    await input.fill(name);
    await this.submitForm();
  }

  private async submitForm(): Promise<void> {
    if (!this.page) return;
    const submitBtn = await this.page.$(
      'button[type="submit"], input[type="submit"], button:has-text("Search")',
    );
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await this.page.keyboard.press('Enter');
    }
    await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
  }

  // ── Result parser ─────────────────────────────────────────────────────────────

  private async parseSearchResults(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    const results: ClerkDocumentResult[] = [];

    try {
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

      const rows = await this.page.$$(
        'table tbody tr, table tr:not(:first-child), .result-row',
      );

      for (const row of rows) {
        try {
          const text = await row.innerText();
          const cells = text.split('\n').map((s) => s.trim()).filter(Boolean);

          // Find an instrument number in the row text
          const instrMatch = text.match(/\b(\d{8,13})\b/);
          if (!instrMatch) continue;

          const instrumentNumber = instrMatch[1];
          const recordingDate = this.extractDate(text);
          const docTypeRaw = this.extractDocType(cells);
          const { grantors, grantees } = this.extractParties(cells, instrumentNumber);

          results.push({
            instrumentNumber,
            documentType: docTypeRaw
              ? this.classifyDocumentType(docTypeRaw)
              : 'other',
            recordingDate,
            grantors,
            grantees,
            source: `tyler_${this.countyFIPS}`,
          });
        } catch {
          // Skip unparseable rows
        }
      }
    } catch (e) {
      console.warn(`[Tyler/${this.countyName}] DOM parsing failed:`, e);
    }

    console.log(
      `[Tyler/${this.countyName}] Found ${results.length} records`,
    );
    return results;
  }

  // ── Image helpers ─────────────────────────────────────────────────────────────

  private async extractImageUrl(): Promise<string | null> {
    if (!this.page) return null;

    const imgSrcs = await this.page.$$eval(
      'img[src*="image"], img[src*="document"], .viewer-image img, #documentImage',
      (imgs) => imgs.map((img) => (img as HTMLImageElement).src),
    );

    for (const src of imgSrcs) {
      if (src && (src.startsWith('http') || src.startsWith('blob:'))) {
        return src;
      }
    }

    return null;
  }

  private async downloadImage(url: string, filepath: string): Promise<void> {
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
          if (!location) { reject(new Error('Redirect with no Location header')); return; }
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

  // ── Text extraction helpers ───────────────────────────────────────────────────

  private extractDate(text: string): string {
    const m =
      text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/) ??
      text.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  private extractDocType(cells: string[]): string {
    const typeKws = [
      'DEED', 'PLAT', 'EASEMENT', 'LIEN', 'RESTRICTION', 'COVENANT',
      'RIGHT OF WAY', 'AFFIDAVIT', 'RELEASE', 'TRUST', 'LEASE',
    ];
    for (const cell of cells) {
      if (typeKws.some((kw) => cell.toUpperCase().includes(kw))) return cell;
    }
    return '';
  }

  private extractParties(
    cells: string[],
    instrumentNumber: string,
  ): { grantors: string[]; grantees: string[] } {
    const grantors: string[] = [];
    const grantees: string[] = [];

    const namePattern = /^[A-Z][A-Z\s,\.'-]{3,}$/;
    const candidates = cells.filter(
      (c) =>
        namePattern.test(c.trim()) &&
        !c.includes(instrumentNumber) &&
        !/\d{4}/.test(c),
    );

    if (candidates[0]) grantors.push(candidates[0]);
    if (candidates[1]) grantees.push(candidates[1]);

    return { grantors, grantees };
  }

  private cleanName(name: string): string {
    return name
      .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
