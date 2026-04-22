// worker/src/adapters/kofile-clerk-adapter.ts
// Phase 2: KofileClerkAdapter — Playwright automation for Kofile PublicSearch systems.
//
// Kofile/GovOS PublicSearch is the most common Texas county clerk system,
// powering Bell, Williamson, Travis, McLennan, Bexar, and ~80+ other counties.
//
// Key characteristics:
//   - SPA (React) — MUST use Playwright; HTTP-only scraping will not work
//   - Results load via AJAX/fetch; DOM renders client-side
//   - Document images served as signed S3 URLs (expire after ~15 min)
//   - Watermarked free previews; $1/page for un-watermarked copies
//   - Some counties add CountyFusion SUPERSEARCH for full-text OCR queries
//
// Spec §2.4 — Kofile/PublicSearch Adapter

import type { BrowserContext } from 'playwright';
import { acquireBrowser } from '../lib/browser-factory.js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type DocumentType,
  type ClerkSearchOptions,
} from './clerk-adapter.js';

// ── Per-county Kofile configuration ──────────────────────────────────────────

interface KofileConfig {
  /** Base URL, e.g. "https://bell.tx.publicsearch.us" */
  baseUrl: string;
  /** Path for search results SPA, e.g. "/results" */
  searchPath: string;
  /** Path prefix for the document viewer, e.g. "/doc/" */
  viewerPath: string;
  countyDisplayName: string;
  /** True for all current Kofile deployments */
  hasImagePreview: boolean;
  /** Some counties expose CountyFusion SUPERSEARCH for OCR full-text queries */
  hasSUPERSEARCH: boolean;
  superSearchUrl?: string;
}

// Known Kofile county configurations (keyed by 5-digit FIPS code)
const KOFILE_CONFIGS: Record<string, KofileConfig> = {
  '48027': {  // Bell County
    baseUrl: 'https://bell.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'Bell County',
    hasImagePreview: true,
    hasSUPERSEARCH: true,
    superSearchUrl: 'https://bell.tx.publicsearch.us/supersearch',
  },
  '48491': {  // Williamson County
    baseUrl: 'https://williamson.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'Williamson County',
    hasImagePreview: true,
    hasSUPERSEARCH: false,
  },
  '48453': {  // Travis County
    baseUrl: 'https://travis.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'Travis County',
    hasImagePreview: true,
    hasSUPERSEARCH: false,
  },
  '48309': {  // McLennan County
    baseUrl: 'https://mclennan.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'McLennan County',
    hasImagePreview: true,
    hasSUPERSEARCH: false,
  },
  '48029': {  // Bexar County
    baseUrl: 'https://bexar.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    countyDisplayName: 'Bexar County',
    hasImagePreview: true,
    hasSUPERSEARCH: false,
  },
};

// ── Rate-limit delays (spec §2.9) ────────────────────────────────────────────

const RATE_LIMIT_MS = {
  /** Between page navigations inside a document viewer */
  PAGE_NAVIGATION:    3_500,
  /** Between individual document downloads */
  DOCUMENT_DOWNLOAD:  6_000,
  /** After a 401 / redirect-to-login (re-auth + retry) */
  SESSION_EXPIRY:    30_000,
  /** Between different search-type requests */
  SEARCH_TYPE:        2_000,
} as const;

/** Maximum session-retry attempts before giving up */
const MAX_SESSION_RETRIES = 3;

// ── KofileClerkAdapter ────────────────────────────────────────────────────────

export class KofileClerkAdapter extends ClerkAdapter {
  private config: KofileConfig;
  private context: BrowserContext | null = null;
  /** Base directory for saving downloaded page images */
  private downloadDir: string;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);

    // Use known config if available; fall back to the standard Kofile URL pattern
    this.config = KOFILE_CONFIGS[countyFIPS] ?? {
      baseUrl: `https://${countyName.toLowerCase().replace(/\s+/g, '')}.tx.publicsearch.us`,
      searchPath: '/results',
      viewerPath: '/doc/',
      countyDisplayName: `${countyName} County`,
      hasImagePreview: true,
      hasSUPERSEARCH: false,
    };

    this.downloadDir = `/tmp/harvest/${countyFIPS}`;
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await acquireBrowser({
      adapterId: 'kofile-clerk',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
    });

    this.page = await this.context.newPage();

    fs.mkdirSync(this.downloadDir, { recursive: true });
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // ── Session retry wrapper ─────────────────────────────────────────────────────

  /**
   * Execute `fn` and automatically recover from Kofile session expiry.
   *
   * Kofile sessions expire silently (the site redirects to a blank/login page
   * rather than returning a proper 401).  This wrapper detects those cases and
   * re-navigates to the base URL before retrying, up to `MAX_SESSION_RETRIES`.
   */
  private async withSessionRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_SESSION_RETRIES; attempt++) {
      try {
        // Check for redirect-to-login before executing
        if (this.page) {
          const currentUrl = this.page.url();
          const isLoginPage =
            currentUrl.includes('/login') ||
            currentUrl.includes('/signin') ||
            currentUrl.includes('/auth');

          if (isLoginPage && attempt > 1) {
            console.warn(
              `[Kofile/${this.countyName}] Session redirected to login — ` +
              `waiting ${RATE_LIMIT_MS.SESSION_EXPIRY / 1000}s then retrying (attempt ${attempt})`,
            );
            await this.sleep(RATE_LIMIT_MS.SESSION_EXPIRY);
            // Re-navigate to the base URL (Kofile public search is anonymous)
            await this.page.goto(this.config.baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
            await this.page.waitForTimeout(2_000);
          }
        }

        return await fn();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);

        // Detect session-expiry symptoms: navigation timeout, page crash, net errors
        const isSessionError =
          msg.includes('net::ERR_') ||
          msg.includes('Navigation timeout') ||
          msg.includes('Target closed') ||
          msg.includes('Session closed');

        if (isSessionError && attempt < MAX_SESSION_RETRIES) {
          console.warn(
            `[Kofile/${this.countyName}] Session error on attempt ${attempt}/${MAX_SESSION_RETRIES}: ${msg}`,
          );
          // Destroy and re-initialise the browser session
          await this.destroySession().catch(() => {});
          await this.sleep(RATE_LIMIT_MS.SESSION_EXPIRY);
          await this.initSession();
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /** Promise-based sleep helper */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => { setTimeout(resolve, ms); });
  }

  // ── Search methods ────────────────────────────────────────────────────────────

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    return this.withSessionRetry(async () => {
      console.log(`[Kofile/${this.countyName}] Searching instrument# ${instrumentNo}...`);

      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?searchOper=instrument&searchString=${instrumentNo}`;

      await this.page!.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.page!.waitForTimeout(RATE_LIMIT_MS.SEARCH_TYPE);

      return this.parseSearchResults();
    });
  }

  async searchByVolumePage(volume: string, pg: string): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    return this.withSessionRetry(async () => {
      console.log(`[Kofile/${this.countyName}] Searching Vol ${volume}, Pg ${pg}...`);

      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?searchOper=book&volume=${volume}&page=${pg}`;

      await this.page!.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.page!.waitForTimeout(RATE_LIMIT_MS.SEARCH_TYPE);

      return this.parseSearchResults();
    });
  }

  async searchByGranteeName(
    name: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    return this.withSessionRetry(async () => {
      // Strip common entity suffixes that reduce search precision
      const cleanName = name
        .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX)\b/gi, '')
        .trim();

      console.log(`[Kofile/${this.countyName}] Searching grantee: "${cleanName}"...`);

      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?searchOper=grantee&searchString=${encodeURIComponent(cleanName)}`;

      await this.page!.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.page!.waitForTimeout(RATE_LIMIT_MS.SEARCH_TYPE);

      const results = await this.parseSearchResults();

      // Too many hits — retry with the full name for precision
      if (results.length > 50) {
        console.log(
          `[Kofile/${this.countyName}] ${results.length} results — retrying with full name: "${name}"`,
        );
        const refinedUrl =
          `${this.config.baseUrl}${this.config.searchPath}` +
          `?searchOper=grantee&searchString=${encodeURIComponent(name)}`;

        await this.page!.goto(refinedUrl, { waitUntil: 'networkidle', timeout: 30_000 });
        await this.page!.waitForTimeout(RATE_LIMIT_MS.SEARCH_TYPE);
        return this.parseSearchResults();
      }

      return results;
    });
  }

  async searchByGrantorName(
    name: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    return this.withSessionRetry(async () => {
      const cleanName = name
        .replace(/\b(LLC|INC|CORP|LP|LTD|TRUST|FAMILY|ET\s*AL|ET\s*UX)\b/gi, '')
        .trim();

      console.log(`[Kofile/${this.countyName}] Searching grantor: "${cleanName}"...`);

      const searchUrl =
        `${this.config.baseUrl}${this.config.searchPath}` +
        `?searchOper=grantor&searchString=${encodeURIComponent(cleanName)}`;

      await this.page!.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await this.page!.waitForTimeout(RATE_LIMIT_MS.SEARCH_TYPE);

      return this.parseSearchResults();
    });
  }

  async searchByLegalDescription(
    legalDesc: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    // CountyFusion SUPERSEARCH supports OCR full-text queries
    if (this.config.hasSUPERSEARCH && this.config.superSearchUrl) {
      return this.superSearch(legalDesc);
    }

    // Standard PublicSearch does not support legal-description search
    console.warn(
      `[Kofile/${this.countyName}] Legal description search not supported — ` +
      `use grantee/grantor search instead`,
    );
    return [];
  }

  // ── SUPERSEARCH (CountyFusion OCR full-text) ──────────────────────────────────

  private async superSearch(query: string): Promise<ClerkDocumentResult[]> {
    if (!this.page) throw new Error('Session not initialized');

    console.log(
      `[SUPERSEARCH/${this.countyName}] Full-text search: "${query.substring(0, 50)}..."`,
    );

    await this.page.goto(this.config.superSearchUrl!, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await this.page.waitForTimeout(1_000);

    // SUPERSEARCH exposes a single free-text input
    await this.page.fill(
      'input[type="text"], input[name="query"], #searchInput',
      query,
    );
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(3_000);  // OCR search is slower than index search

    return this.parseSearchResults();
  }

  // ── Search result DOM parser ──────────────────────────────────────────────────

  private async parseSearchResults(): Promise<ClerkDocumentResult[]> {
    if (!this.page) return [];

    const results: ClerkDocumentResult[] = [];

    try {
      // Kofile results live in a table or list rendered by the SPA
      const rows = await this.page.$$(
        '.search-result, .result-row, table tbody tr, .document-result',
      );

      for (const row of rows) {
        try {
          const text = await row.innerText();
          const cells = text.split('\n').map((s) => s.trim()).filter(Boolean);

          // Locate a link to the document detail / viewer
          const link = await row.$(
            'a[href*="doc"], a[href*="instrument"], a[href*="detail"]',
          );
          const href = link ? (await link.getAttribute('href') ?? '') : '';

          // Extract instrument number from URL or text
          const instrMatch =
            href.match(/(\d{10,13})/) ?? text.match(/\b(\d{10,13})\b/);
          if (!instrMatch) continue;

          const result: ClerkDocumentResult = {
            instrumentNumber: instrMatch[1],
            documentType: 'other',
            recordingDate: '',
            grantors: [],
            grantees: [],
            source: `kofile_${this.countyFIPS}`,
          };

          // Parse individual cells — typical Kofile column order:
          //   Recording Date | Instrument# | Document Type | Grantors | Grantees | Legal
          for (const cell of cells) {
            const dateMatch = cell.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
            if (dateMatch && !result.recordingDate) {
              result.recordingDate = dateMatch[1];
              continue;
            }

            const typeKeywords = [
              'DEED', 'PLAT', 'EASEMENT', 'LIEN', 'RESTRICTION',
              'COVENANT', 'RIGHT OF WAY', 'AFFIDAVIT', 'RELEASE',
            ];
            if (typeKeywords.some((kw) => cell.toUpperCase().includes(kw))) {
              result.documentType = this.classifyDocumentType(cell) as DocumentType;
              continue;
            }

            const volPgMatch = cell.match(
              /VOL\.?\s*(\d+)\s*[/,]\s*(?:PG\.?|PAGE)\s*(\d+)/i,
            );
            if (volPgMatch) {
              result.volumePage = { volume: volPgMatch[1], page: volPgMatch[2] };
            }
          }

          results.push(result);
        } catch {
          // Skip un-parseable rows silently
        }
      }
    } catch (e) {
      console.warn(`[Kofile/${this.countyName}] DOM parsing failed:`, e);
    }

    // AI OCR fallback when the SPA rendered nothing we could parse
    if (results.length === 0) {
      try {
        const screenshot = await this.page.screenshot({ fullPage: true });
        const aiResults = await this.aiParseSearchResults(screenshot);
        results.push(...aiResults);
      } catch (e) {
        console.warn(`[Kofile/${this.countyName}] AI fallback also failed:`, e);
      }
    }

    return results;
  }

  // ── AI OCR fallback — parses a screenshot of search results via Claude ────────

  private async aiParseSearchResults(
    screenshot: Buffer,
  ): Promise<ClerkDocumentResult[]> {
    // Guard: AI fallback requires an Anthropic API key.  Skip gracefully when
    // the key is absent rather than crashing with a fetch auth error.
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn(
        `[Kofile/${this.countyName}] AI fallback skipped — ANTHROPIC_API_KEY not set`,
      );
      return [];
    }

    const base64 = screenshot.toString('base64');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64 },
            },
            {
              type: 'text',
              text: `This is a county clerk document search results page (Kofile/PublicSearch system).

Extract ALL document records visible. Return JSON array:
[{
  "instrumentNumber": "string (10-13 digit number)",
  "documentType": "warranty_deed|plat|easement|deed_of_trust|restrictive_covenant|other",
  "recordingDate": "MM/DD/YYYY",
  "grantors": ["name1", "name2"],
  "grantees": ["name1", "name2"],
  "volumePage": { "volume": "string", "page": "string" } or null,
  "pageCount": number or null
}]

Return ONLY valid JSON, no explanation. If no results visible, return [].`,
            },
          ],
        }],
      }),
    });

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '[]';

    try {
      const parsed = JSON.parse(text.replace(/```json?|```/g, '').trim()) as unknown[];
      return parsed.map((item) => {
        const rec = item as Record<string, unknown>;
        return {
          instrumentNumber: String(rec.instrumentNumber ?? ''),
          documentType: this.classifyDocumentType(String(rec.documentType ?? 'other')),
          recordingDate: String(rec.recordingDate ?? ''),
          grantors: Array.isArray(rec.grantors) ? rec.grantors.map(String) : [],
          grantees: Array.isArray(rec.grantees) ? rec.grantees.map(String) : [],
          volumePage:
            rec.volumePage &&
            typeof rec.volumePage === 'object' &&
            'volume' in (rec.volumePage as object)
              ? {
                  volume: String((rec.volumePage as Record<string, unknown>).volume ?? ''),
                  page: String((rec.volumePage as Record<string, unknown>).page ?? ''),
                }
              : undefined,
          pageCount: typeof rec.pageCount === 'number' ? rec.pageCount : undefined,
          source: `kofile_${this.countyFIPS}_ai`,
        } satisfies ClerkDocumentResult;
      });
    } catch {
      return [];
    }
  }

  // ── Document image retrieval ──────────────────────────────────────────────────

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const images: DocumentImage[] = [];
    const outputDir = path.join(this.downloadDir, instrumentNo);
    fs.mkdirSync(outputDir, { recursive: true });

    const viewerUrl = `${this.config.baseUrl}${this.config.viewerPath}${instrumentNo}`;
    console.log(
      `[Kofile/${this.countyName}] Opening document viewer: ${instrumentNo}...`,
    );

    await this.page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await this.page.waitForTimeout(2_000);

    // ── Determine total page count ──────────────────────────────────────────────

    let totalPages = 1;

    // Try "Page X of Y" / "of N" indicator
    const pageIndicator = await this.page.$(
      '.page-indicator, .page-count',
    );
    if (pageIndicator) {
      const indicatorText = await pageIndicator.innerText();
      const match = indicatorText.match(/of\s+(\d+)/i);
      if (match) totalPages = parseInt(match[1], 10);
    }

    // Also check for page thumbnail strip
    if (totalPages <= 1) {
      const thumbnails = await this.page.$$(
        '.page-thumbnail, .thumbnail-item, .page-nav-item',
      );
      if (thumbnails.length > totalPages) totalPages = thumbnails.length;
    }

    // AI fallback for unusual viewer layouts
    if (totalPages <= 1) {
      const screenshot = await this.page.screenshot();
      const aiCount = await this.aiDetectPageCount(screenshot);
      if (aiCount > 1) totalPages = aiCount;
    }

    console.log(
      `[Kofile/${this.countyName}] Document ${instrumentNo}: ${totalPages} pages`,
    );

    // ── Download each page ──────────────────────────────────────────────────────

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        // Navigate to next page (page 1 is already loaded)
        if (pageNum > 1) {
          const nextBtn = await this.page.$(
            '.next-page, button:has-text("Next"), .page-next',
          );
          if (nextBtn) {
            await nextBtn.click();
            await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
          } else {
            // Try direct page-number button
            const pageBtn = await this.page.$(
              `.page-nav-item:nth-child(${pageNum})`,
            );
            if (pageBtn) {
              await pageBtn.click();
              await this.page.waitForTimeout(RATE_LIMIT_MS.PAGE_NAVIGATION);
            }
          }
        }

        const imageUrl = await this.extractImageUrl();

        if (imageUrl) {
          const filename = `${instrumentNo}_p${pageNum}.png`;
          const filepath = path.join(outputDir, filename);

          await this.downloadImage(imageUrl, filepath);

          // Quality guard: reject images that are too small to be real documents
          // (< 10 KB = broken/placeholder; < 500 px = thumbnail, not full-res scan)
          let quality: DocumentImage['quality'] = 'fair';
          try {
            const stat = fs.statSync(filepath);
            if (stat.size < 10_240) {
              console.warn(
                `[Kofile/${this.countyName}] Page ${pageNum} image too small ` +
                `(${stat.size} bytes) — likely broken; skipping`,
              );
              fs.unlinkSync(filepath);
              continue;
            }
            if (stat.size > 500_000) quality = 'good';
          } catch { /* stat failed — keep the image anyway */ }

          images.push({
            instrumentNumber: instrumentNo,
            pageNumber: pageNum,
            totalPages,
            imagePath: filepath,
            imageUrl,
            isWatermarked: true,  // Kofile free previews are always watermarked
            quality,
          });

          console.log(
            `[Kofile/${this.countyName}] Downloaded page ${pageNum}/${totalPages}: ${filename}`,
          );
        } else {
          console.warn(
            `[Kofile/${this.countyName}] Could not extract image URL for page ${pageNum}`,
          );

          // Fallback: screenshot the viewer container element
          const viewerEl = await this.page.$(
            '.document-viewer, .image-viewer, #documentImage, .viewer-content',
          );
          if (viewerEl) {
            const filename = `${instrumentNo}_p${pageNum}_screenshot.png`;
            const filepath = path.join(outputDir, filename);
            await viewerEl.screenshot({ path: filepath });

            images.push({
              instrumentNumber: instrumentNo,
              pageNumber: pageNum,
              totalPages,
              imagePath: filepath,
              isWatermarked: true,
              quality: 'poor',
            });
          }
        }

        // Polite rate-limiting between page requests
        await this.page.waitForTimeout(RATE_LIMIT_MS.DOCUMENT_DOWNLOAD);

      } catch (e) {
        console.warn(`[Kofile/${this.countyName}] Error on page ${pageNum}:`, e);
      }
    }

    return images;
  }

  // ── Image URL extraction ──────────────────────────────────────────────────────

  /**
   * Extract the URL of the document image currently displayed in the viewer.
   * Kofile uses signed AWS S3 URLs; these expire after ~15 minutes.
   */
  private async extractImageUrl(): Promise<string | null> {
    if (!this.page) return null;

    // Method 1: <img> tag with a recognisable S3 / Kofile src
    const imgSrcs = await this.page.$$eval(
      'img[src*="amazonaws"], img[src*="blob:"], img[src*="kofile"], .viewer-image img',
      (imgs) => imgs.map((img) => (img as HTMLImageElement).src),
    );

    for (const src of imgSrcs) {
      if (
        src &&
        (src.includes('amazonaws') || src.startsWith('blob:') || src.includes('kofile'))
      ) {
        return src;
      }
    }

    // Method 2: intercept the next network response for an image resource
    const imageUrls: string[] = [];
    const responseHandler = (response: import('playwright').Response): void => {
      const url = response.url();
      if (
        /\.(png|jpe?g|tiff?)(\?|$)/i.test(url) ||
        /GetImage|image\/page/i.test(url)
      ) {
        imageUrls.push(url);
      }
    };
    this.page.on('response', responseHandler);

    // Trigger the viewer to request the image again
    await this.page.evaluate(() => {
      const viewer = document.querySelector(
        '.viewer-image, .document-image, #pageImage',
      ) as HTMLElement | null;
      if (viewer) viewer.click();
    });
    await this.page.waitForTimeout(2_000);

    this.page.off('response', responseHandler);

    if (imageUrls.length > 0) return imageUrls[imageUrls.length - 1];

    // Method 3: CSS background-image on the viewer element
    const bgUrl = await this.page.evaluate(() => {
      const viewer = document.querySelector(
        '.viewer-image, .document-image, .page-image',
      );
      if (viewer) {
        const bg = getComputedStyle(viewer).backgroundImage;
        const match = bg.match(/url\(["']?(.+?)["']?\)/);
        return match ? match[1] : null;
      }
      return null;
    });

    return bgUrl;
  }

  // ── Image download ────────────────────────────────────────────────────────────

  private async downloadImage(url: string, filepath: string): Promise<void> {
    // Blob URLs must be fetched inside the page context
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

    // Regular https URLs
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

  // ── AI page-count detection ───────────────────────────────────────────────────

  private async aiDetectPageCount(screenshot: Buffer): Promise<number> {
    const base64 = screenshot.toString('base64');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64 },
            },
            {
              type: 'text',
              text:
                'This is a document viewer. How many total pages does this document have? ' +
                'Look for "Page X of Y" indicators, page navigation buttons, or page count displays. ' +
                'Return ONLY a number.',
            },
          ],
        }],
      }),
    });

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '1';
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  // ── Pricing information ───────────────────────────────────────────────────────

  /**
   * Detect per-document purchase pricing from the document viewer page.
   * Most Kofile-powered counties charge $1.00/page for un-watermarked copies.
   */
  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');

    const viewerUrl = `${this.config.baseUrl}${this.config.viewerPath}${instrumentNo}`;
    await this.page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await this.page.waitForTimeout(2_000);

    // Look for a price mentioned near a purchase / download button
    const priceText = await this.page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll(
        'button, a, .price, .cost, .download-btn, .purchase-btn',
      ));
      for (const el of candidates) {
        const text = el.textContent ?? '';
        if (text.match(/\$\d+\.?\d*/)) return text;
      }
      return null;
    });

    if (priceText) {
      const priceMatch = priceText.match(/\$(\d+\.?\d*)/);
      const totalPrice = priceMatch ? parseFloat(priceMatch[1]) : 1.00;
      const pageCount = Math.round(totalPrice / 1.00);

      return {
        available: true,
        pricePerPage: 1.00,
        totalPrice,
        pageCount,
        paymentMethod: 'credit_card',
        source: `kofile_${this.countyFIPS}`,
      };
    }

    // Default assumption: $1.00/page (standard for Kofile Texas counties)
    return {
      available: true,
      pricePerPage: 1.00,
      source: `kofile_${this.countyFIPS}_estimated`,
    };
  }
}
