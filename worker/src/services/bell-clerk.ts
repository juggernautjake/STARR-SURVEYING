// worker/src/services/bell-clerk.ts — Stage 2: County Clerk Document Retrieval
// Uses Playwright to search county clerk records (Kofile PublicSearch) by owner name,
// then fetches document detail pages and captures screenshots for OCR.

import type { DocumentRef, DocumentResult } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Kofile PublicSearch Configuration ──────────────────────────────────────

interface KofileConfig {
  subdomain: string;
  name: string;
}

const KOFILE_CONFIGS: Record<string, KofileConfig> = {
  bell:       { subdomain: 'bell.tx.publicsearch.us', name: 'Bell County Clerk' },
  williamson: { subdomain: 'williamson.tx.publicsearch.us', name: 'Williamson County Clerk' },
  mclennan:   { subdomain: 'mclennan.tx.publicsearch.us', name: 'McLennan County Clerk' },
  coryell:    { subdomain: 'coryell.tx.publicsearch.us', name: 'Coryell County Clerk' },
};

// ── Deed-Relevant Document Types ───────────────────────────────────────────

const DEED_TYPES = new Set([
  'warranty deed',
  'special warranty deed',
  'general warranty deed',
  'deed without warranty',
  'quit claim deed',
  'quitclaim deed',
  'plat',
  'amended plat',
  'replat',
  'easement',
  'right of way',
  'right-of-way',
  'deed of trust',
  'release of lien',
  'mineral deed',
  'oil and gas lease',
  'restrictive covenant',
]);

function isDeedRelevant(docType: string): boolean {
  const lower = docType.toLowerCase().trim();
  for (const type of DEED_TYPES) {
    if (lower.includes(type)) return true;
  }
  // Also match common abbreviations
  if (/^(wd|swd|gwd|dww|qcd|dot|rel|plt|esmt)$/i.test(lower)) return true;
  return false;
}

// ── Owner Name Parser ──────────────────────────────────────────────────────

/**
 * Parse an owner name into "LAST, FIRST" format for clerk search.
 * "JOHN D SMITH" → "SMITH, JOHN"
 * "SMITH, JOHN D" → "SMITH, JOHN" (already in format)
 * "J & M HOLDINGS LLC" → "J & M HOLDINGS LLC" (business name, use as-is)
 */
function formatOwnerForSearch(ownerName: string): string {
  const name = ownerName.trim().toUpperCase();

  // Already in LAST, FIRST format
  if (name.includes(',')) return name;

  // Business entities — use as-is
  const bizPatterns = /\b(LLC|LP|LTD|INC|CORP|TRUST|ESTATE|PARTNERSHIP|COMPANY|CO|ENTERPRISES?|GROUP|HOLDINGS?|PROPERTIES)\b/i;
  if (bizPatterns.test(name)) return name;

  // Split into parts and attempt LAST, FIRST formatting
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const first = parts[0];
    return `${last}, ${first}`;
  }

  return name;
}

// ── Main Clerk Search ──────────────────────────────────────────────────────

/**
 * Search county clerk records for deeds and recorded documents by owner name.
 * Returns document references with URLs and any captured screenshots.
 */
export async function searchClerkRecords(
  county: string,
  ownerName: string,
  logger: PipelineLogger,
): Promise<DocumentResult[]> {
  const config = KOFILE_CONFIGS[county.toLowerCase()];
  if (!config) {
    logger.warn('Stage2', `No Kofile config for county: ${county}`);
    return [];
  }

  const searchName = formatOwnerForSearch(ownerName);
  logger.info('Stage2', `Searching clerk records for: ${searchName}`);

  const finish = logger.startAttempt({
    layer: 'Stage2A',
    source: config.name,
    method: 'playwright-search',
    input: searchName,
  });

  let browser = null;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    const baseUrl = `https://${config.subdomain}`;

    // Navigate to public search
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Fill search form
    try {
      // Try multiple selectors for the search input
      const inputSelectors = [
        'input[name="SearchText"]',
        'input[id="SearchText"]',
        'input[type="search"]',
        'input[placeholder*="search" i]',
        'input[placeholder*="name" i]',
        'input.search-input',
        '#searchBox',
        'input[type="text"]',
      ];

      let inputFound = false;
      for (const sel of inputSelectors) {
        try {
          const input = page.locator(sel).first();
          if (await input.isVisible({ timeout: 2_000 })) {
            await input.fill(searchName);
            inputFound = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!inputFound) {
        // Try direct URL-based search as fallback
        const searchUrl = `${baseUrl}/results?search=index,fullText&q=${encodeURIComponent(searchName)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      } else {
        // Submit the search
        try {
          const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Search"), .search-btn').first();
          await submitBtn.click({ timeout: 5_000 });
        } catch {
          // Try pressing Enter instead
          await page.keyboard.press('Enter');
        }
      }
    } catch (err) {
      logger.warn('Stage2', `Search form interaction failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Wait for results to load
    await page.waitForTimeout(3_000);
    try {
      await page.waitForSelector('.result-item, .search-result, table tbody tr, .document-row', { timeout: 15_000 });
    } catch {
      // Results might not load with expected selectors
    }

    // Extract document listings from results
    const documents: DocumentRef[] = [];

    // Try multiple extraction strategies
    const extractedDocs = await page.evaluate(() => {
      const docs: Array<{
        type: string;
        date: string;
        instrumentNumber: string;
        grantors: string[];
        grantees: string[];
        url: string | null;
        text: string;
      }> = [];

      // Strategy 1: Table rows
      const rows = document.querySelectorAll('table tbody tr, .result-item, .search-result, .document-row');
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td, .result-field, .field'));
        const text = row.textContent?.trim() ?? '';
        const link = row.querySelector('a[href]');
        const url = link?.getAttribute('href') ?? null;

        // Try to parse document type, date, instrument number from cells/text
        const typeMatch = text.match(/(?:Type|Document):\s*([^\n|]+)/i) ??
          text.match(/(?:Warranty Deed|Special Warranty|Plat|Easement|Deed|Quit Claim|Right[- ]of[- ]Way)/i);
        const dateMatch = text.match(/(?:Date|Recorded|Filed):\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i) ??
          text.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{4})/);
        const instrMatch = text.match(/(?:Instrument|Inst\.?\s*#?|Doc\.?\s*#?):\s*([\d-]+)/i) ??
          text.match(/\b(\d{8,})\b/);
        const grantorMatch = text.match(/(?:Grantor|From):\s*([^\n|;]+)/i);
        const granteeMatch = text.match(/(?:Grantee|To):\s*([^\n|;]+)/i);

        docs.push({
          type: typeMatch ? typeMatch[1]?.trim() ?? typeMatch[0]?.trim() ?? 'Unknown' : 'Unknown',
          date: dateMatch?.[1] ?? '',
          instrumentNumber: instrMatch?.[1] ?? '',
          grantors: grantorMatch ? [grantorMatch[1].trim()] : [],
          grantees: granteeMatch ? [granteeMatch[1].trim()] : [],
          url,
          text: text.substring(0, 500),
        });
      });

      return docs;
    });

    // Log what was found
    logger.info('Stage2', `Found ${extractedDocs.length} document listings`);

    for (const doc of extractedDocs) {
      const fullUrl = doc.url
        ? doc.url.startsWith('http') ? doc.url : `${baseUrl}${doc.url.startsWith('/') ? '' : '/'}${doc.url}`
        : null;

      logger.info('Stage2', `Document: ${doc.type} | Inst: ${doc.instrumentNumber || 'NONE'} | URL: ${fullUrl ?? 'NONE'}`);

      documents.push({
        instrumentNumber: doc.instrumentNumber || null,
        volume: null,
        page: null,
        documentType: doc.type,
        recordingDate: doc.date || null,
        grantors: doc.grantors,
        grantees: doc.grantees,
        source: config.name,
        url: fullUrl,
      });
    }

    // Filter for deed-relevant documents and take top 10
    const relevant = documents.filter((d) => isDeedRelevant(d.documentType));
    const toFetch = relevant.length > 0 ? relevant.slice(0, 10) : documents.slice(0, 5);

    finish({
      status: documents.length > 0 ? 'success' : 'partial',
      dataPointsFound: documents.length,
      details: `${documents.length} total, ${relevant.length} deed-relevant, fetching ${toFetch.length}`,
    });

    // Stage 2B: Fetch document detail pages
    const results: DocumentResult[] = [];

    for (const doc of toFetch) {
      if (!doc.url) {
        // Build fallback URL from instrument number if available
        if (doc.instrumentNumber) {
          doc.url = `${baseUrl}/results?search=index&q=${encodeURIComponent(doc.instrumentNumber)}`;
        } else {
          results.push({
            ref: doc,
            textContent: null,
            imageBase64: null,
            imageFormat: null,
            ocrText: null,
            extractedData: null,
          });
          continue;
        }
      }

      const detailFinish = logger.startAttempt({
        layer: 'Stage2B',
        source: config.name,
        method: 'detail-page-fetch',
        input: doc.url,
      });

      try {
        await page.goto(doc.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForTimeout(2_000);

        // Extract text content from detail page
        const pageText = await page.evaluate(() => {
          // Try to get the document content area
          const contentSelectors = [
            '.document-content',
            '.detail-content',
            '.instrument-text',
            '#documentContent',
            'main',
            'article',
          ];
          for (const sel of contentSelectors) {
            const el = document.querySelector(sel);
            if (el?.textContent && el.textContent.trim().length > 100) {
              return el.textContent.trim();
            }
          }
          return document.body.textContent?.trim() ?? '';
        });

        // Try to find and capture document image
        let imageBase64: string | null = null;
        let imageFormat: 'png' | 'jpg' | 'tiff' | 'pdf' | null = null;

        // Check for document image viewer
        const hasImage = await page.evaluate(() => {
          const imgSelectors = [
            'img.document-image',
            'img[src*="document"]',
            'img[src*="instrument"]',
            'img[src*="image"]',
            '.page-image img',
            'canvas.document-viewer',
            'iframe[src*=".pdf"]',
          ];
          for (const sel of imgSelectors) {
            const el = document.querySelector(sel);
            if (el) return { found: true, selector: sel };
          }
          return { found: false, selector: null };
        });

        if (hasImage.found) {
          // Take screenshot of the document area
          const screenshot = await page.screenshot({ fullPage: true }) as Buffer;
          imageBase64 = screenshot.toString('base64');
          imageFormat = 'png';
        }

        detailFinish({
          status: pageText.length > 100 || imageBase64 ? 'success' : 'partial',
          dataPointsFound: (pageText.length > 100 ? 1 : 0) + (imageBase64 ? 1 : 0),
          details: `Text: ${pageText.length} chars, Image: ${imageBase64 ? 'captured' : 'none'}`,
        });

        results.push({
          ref: doc,
          textContent: pageText.length > 100 ? pageText : null,
          imageBase64,
          imageFormat,
          ocrText: null,
          extractedData: null,
        });
      } catch (err) {
        detailFinish({
          status: 'fail',
          error: err instanceof Error ? err.message : String(err),
        });

        results.push({
          ref: doc,
          textContent: null,
          imageBase64: null,
          imageFormat: null,
          ocrText: null,
          extractedData: null,
        });
      }
    }

    await browser.close();
    return results;
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }

    finish({
      status: 'fail',
      error: err instanceof Error ? err.message : String(err),
    });

    return [];
  }
}
