// worker/src/services/bell-clerk.ts — Stage 2: County Clerk Document Retrieval
// Playwright automation for Kofile PublicSearch systems.
// Features: concurrent document fetching, PDF download attempts, pagination,
// better URL extraction, retry logic for transient failures.

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
  milam:      { subdomain: 'milam.tx.publicsearch.us', name: 'Milam County Clerk' },
  falls:      { subdomain: 'falls.tx.publicsearch.us', name: 'Falls County Clerk' },
  lampasas:   { subdomain: 'lampasas.tx.publicsearch.us', name: 'Lampasas County Clerk' },
  hays:       { subdomain: 'hays.tx.publicsearch.us', name: 'Hays County Clerk' },
  comal:      { subdomain: 'comal.tx.publicsearch.us', name: 'Comal County Clerk' },
  burnet:     { subdomain: 'burnet.tx.publicsearch.us', name: 'Burnet County Clerk' },
  bosque:     { subdomain: 'bosque.tx.publicsearch.us', name: 'Bosque County Clerk' },
  hamilton:   { subdomain: 'hamilton.tx.publicsearch.us', name: 'Hamilton County Clerk' },
  hill:       { subdomain: 'hill.tx.publicsearch.us', name: 'Hill County Clerk' },
  limestone:  { subdomain: 'limestone.tx.publicsearch.us', name: 'Limestone County Clerk' },
  robertson:  { subdomain: 'robertson.tx.publicsearch.us', name: 'Robertson County Clerk' },
  lee:        { subdomain: 'lee.tx.publicsearch.us', name: 'Lee County Clerk' },
  llano:      { subdomain: 'llano.tx.publicsearch.us', name: 'Llano County Clerk' },
};

// ── Deed-Relevant Document Types ───────────────────────────────────────────

const DEED_TYPE_PATTERNS = [
  /warranty\s*deed/i,
  /special\s*warranty/i,
  /general\s*warranty/i,
  /deed\s*without\s*warranty/i,
  /quit\s*claim/i,
  /quitclaim/i,
  /\bplat\b/i,
  /amended\s*plat/i,
  /\breplat\b/i,
  /\beasement\b/i,
  /right[- ]of[- ]way/i,
  /deed\s*of\s*trust/i,
  /release\s*of\s*lien/i,
  /mineral\s*deed/i,
  /oil\s*and\s*gas/i,
  /oil\s*&\s*gas/i,
  /restrictive\s*covenant/i,
  /\bcc&r\b/i,
  /\bdeed\b/i,
  /\bconveyance\b/i,
  /\btransfer\b/i,
  /\bassignment\b/i,
];

const DEED_TYPE_ABBREVS = /^(WD|SWD|GWD|DWW|QCD|DOT|REL|PLT|ESMT|ROW|MD|OGL|RC)$/i;

function isDeedRelevant(docType: string): boolean {
  const trimmed = docType.trim();
  if (DEED_TYPE_ABBREVS.test(trimmed)) return true;
  return DEED_TYPE_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Score document relevance (higher = more useful for boundary research).
 */
function scoreDocumentRelevance(docType: string): number {
  const lower = docType.toLowerCase();
  if (/warranty\s*deed|deed\s*without/i.test(lower)) return 100;
  if (/\bplat\b/i.test(lower)) return 95;
  if (/\bdeed\b/i.test(lower)) return 90;
  if (/\beasement\b/i.test(lower)) return 85;
  if (/right[- ]of[- ]way/i.test(lower)) return 80;
  if (/restrictive|cc&r/i.test(lower)) return 70;
  if (/deed\s*of\s*trust/i.test(lower)) return 60;
  if (/release/i.test(lower)) return 50;
  if (/mineral|oil|gas/i.test(lower)) return 40;
  return 30;
}

// ── Owner Name Formatting ──────────────────────────────────────────────────

/**
 * Parse an owner name into formats suitable for clerk search.
 * Returns multiple search strings to try.
 */
function formatOwnerForSearch(ownerName: string): string[] {
  const name = ownerName.trim();
  const variants: string[] = [];
  const seen = new Set<string>();

  function add(s: string): void {
    const normalized = s.trim().toUpperCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      variants.push(normalized);
    }
  }

  const upper = name.toUpperCase();

  // Business entities — use as-is, plus try without suffix
  const bizPatterns = /\b(LLC|LP|LTD|INC|CORP|TRUST|ESTATE|PARTNERSHIP|COMPANY|CO|ENTERPRISES?|GROUP|HOLDINGS?|PROPERTIES)\b/i;
  if (bizPatterns.test(name)) {
    add(upper);
    // Also try without the entity type
    const withoutEntity = upper.replace(/\s*(LLC|LP|LTD|INC|CORP|COMPANY|CO)\s*$/i, '').trim();
    if (withoutEntity !== upper) add(withoutEntity);
    return variants;
  }

  // Already in LAST, FIRST format
  if (name.includes(',')) {
    add(upper);
    // Also try without comma
    add(upper.replace(',', ' ').replace(/\s+/g, ' '));
    // Also try reversed
    const parts = upper.split(',').map((s) => s.trim());
    if (parts.length === 2) {
      add(`${parts[1]} ${parts[0]}`);
    }
    return variants;
  }

  // Individual name: try multiple formats
  const parts = upper.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const first = parts[0];
    const middle = parts.length > 2 ? parts.slice(1, -1) : [];

    // LAST, FIRST
    add(`${last}, ${first}`);
    // LAST, FIRST MIDDLE
    if (middle.length > 0) add(`${last}, ${first} ${middle.join(' ')}`);
    // FIRST LAST
    add(`${first} ${last}`);
    // Full name as-is
    add(upper);
    // Last name only (for partial search)
    add(last);
  } else {
    add(upper);
  }

  return variants;
}

// ── Concurrent Document Fetcher ────────────────────────────────────────────

const MAX_CONCURRENT_FETCHES = 3;

interface FetchedDocument {
  ref: DocumentRef;
  textContent: string | null;
  imageBase64: string | null;
  imageFormat: 'png' | 'jpg' | 'tiff' | 'pdf' | null;
  processingErrors: string[];
}

async function fetchDocumentDetail(
  page: import('playwright').Page,
  doc: DocumentRef,
  baseUrl: string,
  logger: PipelineLogger,
  index: number,
): Promise<FetchedDocument> {
  const label = `doc-${index + 1} (${doc.documentType})`;
  const result: FetchedDocument = {
    ref: doc,
    textContent: null,
    imageBase64: null,
    imageFormat: null,
    processingErrors: [],
  };

  if (!doc.url) {
    // Build URL from instrument number as fallback
    if (doc.instrumentNumber) {
      doc.url = `${baseUrl}/results?department=RP&search=index&q=${encodeURIComponent(doc.instrumentNumber)}`;
      logger.info('Stage2B', `${label}: Built fallback URL from instrument number`);
    } else {
      result.processingErrors.push('No URL or instrument number available');
      return result;
    }
  }

  const finish = logger.startAttempt({
    layer: 'Stage2B',
    source: 'Clerk-Detail',
    method: 'page-fetch',
    input: `${label}: ${doc.url}`,
  });

  try {
    await page.goto(doc.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2_500);

    // ── Try to extract text content ──────────────────────────
    const pageText = await page.evaluate(() => {
      const contentSelectors = [
        '.document-content', '.detail-content', '.instrument-text',
        '#documentContent', '#docText', '.doc-viewer-text',
        '.viewer-content', 'article', 'main .content',
      ];
      for (const sel of contentSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent && el.textContent.trim().length > 100) {
          return el.textContent.trim();
        }
      }
      // Fall back to body but exclude nav/header/footer
      const body = document.querySelector('main') ?? document.body;
      const text = body.textContent?.trim() ?? '';
      return text.length > 200 ? text : '';
    });

    if (pageText.length > 100) {
      result.textContent = pageText.substring(0, 50_000); // Cap at 50K chars
    }

    // ── Try to find document images/PDFs ──────────────────────

    // Check for PDF embed/iframe
    const pdfUrl = await page.evaluate(() => {
      const pdfSelectors = [
        'iframe[src*=".pdf"]', 'embed[src*=".pdf"]',
        'object[data*=".pdf"]', 'a[href*=".pdf"]',
        'iframe[src*="document"]', 'iframe[src*="viewer"]',
      ];
      for (const sel of pdfSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          return (el as HTMLIFrameElement).src ?? (el as HTMLEmbedElement).src ?? (el as HTMLObjectElement).data ?? (el as HTMLAnchorElement).href ?? null;
        }
      }
      return null;
    });

    if (pdfUrl) {
      logger.info('Stage2B', `${label}: Found PDF URL: ${pdfUrl}`);
      // Try to download the PDF
      try {
        const fullPdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `${baseUrl}${pdfUrl.startsWith('/') ? '' : '/'}${pdfUrl}`;
        const pdfResponse = await page.context().request.get(fullPdfUrl, { timeout: 30_000 });
        if (pdfResponse.ok()) {
          const pdfBuffer = await pdfResponse.body();
          result.imageBase64 = pdfBuffer.toString('base64');
          result.imageFormat = 'pdf';
          logger.info('Stage2B', `${label}: Downloaded PDF (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);
        }
      } catch (pdfErr) {
        result.processingErrors.push(`PDF download failed: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
      }
    }

    // Check for document images
    if (!result.imageBase64) {
      const imageInfo = await page.evaluate(() => {
        const imgSelectors = [
          'img.document-image', 'img[src*="document"]', 'img[src*="instrument"]',
          'img[src*="image"]', '.page-image img', '.viewer img',
          'img[src*="page"]', 'img[src*="scan"]', 'img[class*="doc"]',
        ];
        for (const sel of imgSelectors) {
          const el = document.querySelector(sel) as HTMLImageElement | null;
          if (el?.src && el.naturalWidth > 100) {
            return { found: true, src: el.src, width: el.naturalWidth, height: el.naturalHeight };
          }
        }
        // Check for canvas-based viewer
        const canvas = document.querySelector('canvas.document-viewer, canvas[class*="page"]') as HTMLCanvasElement | null;
        if (canvas) {
          return { found: true, src: 'canvas', width: canvas.width, height: canvas.height };
        }
        return { found: false, src: null, width: 0, height: 0 };
      });

      if (imageInfo.found) {
        // Take a screenshot of the document area or full page
        const screenshot = await page.screenshot({ fullPage: true }) as Buffer;
        result.imageBase64 = screenshot.toString('base64');
        result.imageFormat = 'png';
        logger.info('Stage2B', `${label}: Captured screenshot (${(screenshot.length / 1024).toFixed(0)} KB)`);
      }
    }

    // ── Extract additional metadata from detail page ──────────
    const metadata = await page.evaluate(() => {
      const getFieldText = (labels: string[]): string | null => {
        for (const label of labels) {
          // Try label:value pattern
          const re = new RegExp(`${label}\\s*:?\\s*([^\\n<]+)`, 'i');
          const match = document.body.textContent?.match(re);
          if (match) return match[1].trim();
        }
        return null;
      };

      return {
        volume: getFieldText(['Volume', 'Vol', 'Book']),
        page: getFieldText(['Page', 'Pg']),
        instrumentNumber: getFieldText(['Instrument', 'Inst', 'Document Number', 'Doc #']),
        recordingDate: getFieldText(['Recording Date', 'Recorded', 'Filed', 'Date']),
        grantors: getFieldText(['Grantor', 'From', 'Seller']),
        grantees: getFieldText(['Grantee', 'To', 'Buyer']),
      };
    });

    // Merge metadata into ref
    if (metadata.volume && !doc.volume) doc.volume = metadata.volume;
    if (metadata.page && !doc.page) doc.page = metadata.page;
    if (metadata.instrumentNumber && !doc.instrumentNumber) doc.instrumentNumber = metadata.instrumentNumber;
    if (metadata.recordingDate && !doc.recordingDate) doc.recordingDate = metadata.recordingDate;
    if (metadata.grantors && doc.grantors.length === 0) doc.grantors = [metadata.grantors];
    if (metadata.grantees && doc.grantees.length === 0) doc.grantees = [metadata.grantees];

    const dataPoints = (result.textContent ? 1 : 0) + (result.imageBase64 ? 1 : 0);
    finish({
      status: dataPoints > 0 ? 'success' : 'partial',
      dataPointsFound: dataPoints,
      details: `Text: ${result.textContent?.length ?? 0} chars, Image: ${result.imageFormat ?? 'none'}${result.processingErrors.length > 0 ? `, Errors: ${result.processingErrors.length}` : ''}`,
    });

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.processingErrors.push(`Detail page fetch failed: ${errMsg}`);
    finish({ status: 'fail', error: errMsg });
    return result;
  }
}

// ── Main Clerk Search ──────────────────────────────────────────────────────

/**
 * Search county clerk records for deeds and recorded documents.
 * Returns document references with content (text, images, PDFs).
 */
export async function searchClerkRecords(
  county: string,
  ownerName: string,
  logger: PipelineLogger,
): Promise<DocumentResult[]> {
  const config = KOFILE_CONFIGS[county.toLowerCase()];
  if (!config) {
    logger.warn('Stage2', `No Kofile config for county: ${county}. Known: ${Object.keys(KOFILE_CONFIGS).join(', ')}`);
    return [];
  }

  const searchNames = formatOwnerForSearch(ownerName);
  logger.info('Stage2', `Searching ${config.name} with ${searchNames.length} name variants: ${searchNames.join(' | ')}`);

  const finish = logger.startAttempt({
    layer: 'Stage2A',
    source: config.name,
    method: 'playwright-search',
    input: searchNames[0],
  });

  let browser = null;
  const baseUrl = `https://${config.subdomain}`;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
    });

    const page = await context.newPage();

    // Try each name variant until we get results
    let documents: DocumentRef[] = [];

    for (const searchName of searchNames) {
      try {
        // Try direct URL search first (more reliable than form interaction)
        const searchUrl = `${baseUrl}/results?department=RP&search=index%2CfullText&q=${encodeURIComponent(searchName)}`;
        logger.info('Stage2A', `Trying: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForTimeout(3_000);

        // Wait for results or "no results" message
        try {
          await page.waitForSelector('.result-item, .search-result, table tbody tr, .document-row, .no-results, [class*="empty"]', { timeout: 15_000 });
        } catch {
          // Continue with whatever loaded
        }

        // Check for "no results"
        const noResults = await page.evaluate(() => {
          const text = document.body.textContent?.toLowerCase() ?? '';
          return text.includes('no results') || text.includes('no records found') || text.includes('0 results') || text.includes('no documents');
        });

        if (noResults) {
          logger.info('Stage2A', `"${searchName}" returned no results — trying next variant`);
          continue;
        }

        // Extract document listings
        const extracted = await page.evaluate((bUrl: string) => {
          const docs: Array<{
            type: string;
            date: string;
            instrumentNumber: string;
            volume: string;
            docPage: string;
            grantors: string[];
            grantees: string[];
            url: string | null;
            text: string;
          }> = [];

          // Strategy 1: Result items/rows
          const rows = document.querySelectorAll(
            '.result-item, .search-result, table tbody tr, .document-row, [class*="result-"]',
          );

          rows.forEach((row) => {
            const text = row.textContent?.trim() ?? '';
            if (text.length < 10) return;

            // Find all links
            const links = Array.from(row.querySelectorAll('a[href]'));
            let url: string | null = null;
            for (const link of links) {
              const href = link.getAttribute('href') ?? '';
              // Prefer detail page links
              if (href.includes('/details') || href.includes('/document') || href.includes('/view') || href.match(/\/\d{4,}/)) {
                url = href.startsWith('http') ? href : `${bUrl}${href.startsWith('/') ? '' : '/'}${href}`;
                break;
              }
            }
            // Fallback: any link that's not a search/filter link
            if (!url && links.length > 0) {
              for (const link of links) {
                const href = link.getAttribute('href') ?? '';
                if (!href.includes('search') && !href.includes('filter') && !href.includes('#') && href.length > 5) {
                  url = href.startsWith('http') ? href : `${bUrl}${href.startsWith('/') ? '' : '/'}${href}`;
                  break;
                }
              }
            }

            // Parse document fields
            const typePatterns = [
              /(?:Type|Document Type|Doc Type)\s*:?\s*([^\n|]+)/i,
              /\b(Warranty Deed|Special Warranty Deed|General Warranty Deed|Deed Without Warranty|Plat|Amended Plat|Easement|Right[- ]of[- ]Way|Quit Claim|Deed of Trust|Release|Mineral Deed)\b/i,
            ];
            const datePatterns = [
              /(?:Date|Recorded|Filed|Recording Date)\s*:?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
              /(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})/,
            ];
            const instrPatterns = [
              /(?:Instrument|Inst\.?\s*#?|Document\s*#?|Doc\.?\s*#?)\s*:?\s*([\d\-]+)/i,
              /\b(\d{8,})\b/,
            ];
            const volPatterns = [/(?:Volume|Vol\.?|Book)\s*:?\s*(\d+)/i];
            const pgPatterns = [/(?:Page|Pg\.?)\s*:?\s*(\d+)/i];
            const grantorPatterns = [/(?:Grantor|From|Seller)\s*:?\s*([^\n|;]+)/i];
            const granteePatterns = [/(?:Grantee|To|Buyer)\s*:?\s*([^\n|;]+)/i];

            const findMatch = (patterns: RegExp[]): string => {
              for (const p of patterns) {
                const m = text.match(p);
                if (m) return (m[1] ?? m[0]).trim();
              }
              return '';
            };

            docs.push({
              type: findMatch(typePatterns) || 'Unknown',
              date: findMatch(datePatterns),
              instrumentNumber: findMatch(instrPatterns),
              volume: findMatch(volPatterns),
              docPage: findMatch(pgPatterns),
              grantors: findMatch(grantorPatterns) ? [findMatch(grantorPatterns)] : [],
              grantees: findMatch(granteePatterns) ? [findMatch(granteePatterns)] : [],
              url,
              text: text.substring(0, 500),
            });
          });

          return docs;
        }, baseUrl);

        if (extracted.length > 0) {
          for (const doc of extracted) {
            documents.push({
              instrumentNumber: doc.instrumentNumber || null,
              volume: doc.volume || null,
              page: doc.docPage || null,
              documentType: doc.type,
              recordingDate: doc.date || null,
              grantors: doc.grantors,
              grantees: doc.grantees,
              source: config.name,
              url: doc.url,
            });
          }
          logger.info('Stage2A', `"${searchName}" found ${extracted.length} documents`);
          break; // Got results, no need to try more name variants
        }

        // Check for pagination — try to get more results
        try {
          const hasMorePages = await page.evaluate(() => {
            return !!document.querySelector('.pagination a, .next-page, [aria-label="Next"]');
          });
          if (hasMorePages) {
            logger.info('Stage2A', 'More pages available — loading additional results');
            // Click "next" up to 2 more times
            for (let pageNum = 0; pageNum < 2; pageNum++) {
              try {
                const nextBtn = page.locator('.pagination a:has-text("Next"), .next-page, [aria-label="Next"], .pagination li:last-child a').first();
                if (await nextBtn.isVisible({ timeout: 2_000 })) {
                  await nextBtn.click();
                  await page.waitForTimeout(3_000);

                  const moreExtracted = await page.evaluate((bUrl: string) => {
                    const docs: Array<{ type: string; url: string | null; text: string }> = [];
                    document.querySelectorAll('.result-item, .search-result, table tbody tr').forEach((row) => {
                      const text = row.textContent?.trim() ?? '';
                      const link = row.querySelector('a[href]');
                      const href = link?.getAttribute('href') ?? '';
                      const url = href ? (href.startsWith('http') ? href : `${bUrl}${href.startsWith('/') ? '' : '/'}${href}`) : null;
                      if (text.length > 10) docs.push({ type: 'Unknown', url, text: text.substring(0, 500) });
                    });
                    return docs;
                  }, baseUrl);

                  for (const doc of moreExtracted) {
                    documents.push({
                      instrumentNumber: null,
                      volume: null,
                      page: null,
                      documentType: doc.type,
                      recordingDate: null,
                      grantors: [],
                      grantees: [],
                      source: config.name,
                      url: doc.url,
                    });
                  }
                }
              } catch { break; }
            }
          }
        } catch { /* pagination check failed */ }

      } catch (err) {
        logger.warn('Stage2A', `Search with "${searchName}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Log all found URLs
    for (let i = 0; i < documents.length; i++) {
      logger.info('Stage2', `  [${i + 1}] ${documents[i].documentType} | Inst: ${documents[i].instrumentNumber ?? 'NONE'} | URL: ${documents[i].url ?? 'NONE'}`);
    }

    // Sort by relevance and take top documents
    const sorted = [...documents].sort((a, b) => scoreDocumentRelevance(b.documentType) - scoreDocumentRelevance(a.documentType));
    const relevant = sorted.filter((d) => isDeedRelevant(d.documentType));
    const toFetch = relevant.length > 0 ? relevant.slice(0, 15) : sorted.slice(0, 8);

    finish({
      status: documents.length > 0 ? 'success' : 'partial',
      dataPointsFound: documents.length,
      details: `${documents.length} total, ${relevant.length} deed-relevant, fetching ${toFetch.length}`,
    });

    // ── Stage 2B: Fetch document details concurrently ──────────

    const results: DocumentResult[] = [];

    // Process in batches of MAX_CONCURRENT_FETCHES
    for (let i = 0; i < toFetch.length; i += MAX_CONCURRENT_FETCHES) {
      const batch = toFetch.slice(i, i + MAX_CONCURRENT_FETCHES);

      // For concurrent fetching, we need separate pages
      const batchResults = await Promise.allSettled(
        batch.map(async (doc, batchIndex) => {
          const detailPage = await context.newPage();
          try {
            return await fetchDocumentDetail(detailPage, doc, baseUrl, logger, i + batchIndex);
          } finally {
            await detailPage.close().catch(() => {});
          }
        }),
      );

      for (const batchResult of batchResults) {
        if (batchResult.status === 'fulfilled') {
          const fetched = batchResult.value;
          results.push({
            ref: fetched.ref,
            textContent: fetched.textContent,
            imageBase64: fetched.imageBase64,
            imageFormat: fetched.imageFormat,
            ocrText: null,
            extractedData: null,
            processingErrors: fetched.processingErrors,
          });
        } else {
          logger.warn('Stage2B', `Batch fetch failed: ${batchResult.reason}`);
        }
      }
    }

    await browser.close();
    browser = null;

    logger.info('Stage2', `Fetched ${results.length} documents. With content: ${results.filter((r) => r.textContent || r.imageBase64).length}`);
    return results;
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    finish({ status: 'fail', error: errMsg });
    logger.error('Stage2', `Clerk search failed: ${errMsg}`, err);
    return [];
  }
}
