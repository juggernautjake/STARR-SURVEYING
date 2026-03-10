// worker/src/services/bell-clerk.ts — Stage 2: County Clerk Document Retrieval
// Playwright automation for Kofile PublicSearch systems.
// Features: concurrent document fetching, PDF download attempts, pagination,
// better URL extraction, retry logic for transient failures.

import * as fs from 'fs';
import type { DocumentRef, DocumentResult, PageScreenshot, DocumentPage } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';
import type { Response as PlaywrightResponse } from 'playwright';

// ── Kofile PublicSearch Configuration ──────────────────────────────────────

interface KofileConfig {
  subdomain: string;
  name: string;
}

// Kofile/GovOS PublicSearch — all known counties within 200-mile radius of Bell County
const KOFILE_CONFIGS: Record<string, KofileConfig> = {
  // ── Ring 0-1: Bell + adjacent (~0-30 mi) ─────────────────────────
  bell:        { subdomain: 'bell.tx.publicsearch.us', name: 'Bell County Clerk' },
  coryell:     { subdomain: 'coryell.tx.publicsearch.us', name: 'Coryell County Clerk' },
  mclennan:    { subdomain: 'mclennan.tx.publicsearch.us', name: 'McLennan County Clerk' },
  falls:       { subdomain: 'falls.tx.publicsearch.us', name: 'Falls County Clerk' },
  milam:       { subdomain: 'milam.tx.publicsearch.us', name: 'Milam County Clerk' },
  williamson:  { subdomain: 'williamson.tx.publicsearch.us', name: 'Williamson County Clerk' },
  burnet:      { subdomain: 'burnet.tx.publicsearch.us', name: 'Burnet County Clerk' },
  lampasas:    { subdomain: 'lampasas.tx.publicsearch.us', name: 'Lampasas County Clerk' },
  // ── Ring 2: (~30-60 mi) ──────────────────────────────────────────
  hamilton:    { subdomain: 'hamilton.tx.publicsearch.us', name: 'Hamilton County Clerk' },
  bosque:      { subdomain: 'bosque.tx.publicsearch.us', name: 'Bosque County Clerk' },
  hill:        { subdomain: 'hill.tx.publicsearch.us', name: 'Hill County Clerk' },
  limestone:   { subdomain: 'limestone.tx.publicsearch.us', name: 'Limestone County Clerk' },
  robertson:   { subdomain: 'robertson.tx.publicsearch.us', name: 'Robertson County Clerk' },
  lee:         { subdomain: 'lee.tx.publicsearch.us', name: 'Lee County Clerk' },
  bastrop:     { subdomain: 'bastrop.tx.publicsearch.us', name: 'Bastrop County Clerk' },
  san_saba:    { subdomain: 'sansaba.tx.publicsearch.us', name: 'San Saba County Clerk' },
  mills:       { subdomain: 'mills.tx.publicsearch.us', name: 'Mills County Clerk' },
  // ── Ring 3: (~60-100 mi) ─────────────────────────────────────────
  hays:        { subdomain: 'hays.tx.publicsearch.us', name: 'Hays County Clerk' },
  comal:       { subdomain: 'comal.tx.publicsearch.us', name: 'Comal County Clerk' },
  blanco:      { subdomain: 'blanco.tx.publicsearch.us', name: 'Blanco County Clerk' },
  llano:       { subdomain: 'llano.tx.publicsearch.us', name: 'Llano County Clerk' },
  caldwell:    { subdomain: 'caldwell.tx.publicsearch.us', name: 'Caldwell County Clerk' },
  guadalupe:   { subdomain: 'guadalupe.tx.publicsearch.us', name: 'Guadalupe County Clerk' },
  mason:       { subdomain: 'mason.tx.publicsearch.us', name: 'Mason County Clerk' },
  mcculloch:   { subdomain: 'mcculloch.tx.publicsearch.us', name: 'McCulloch County Clerk' },
  brown:       { subdomain: 'brown.tx.publicsearch.us', name: 'Brown County Clerk' },
  comanche:    { subdomain: 'comanche.tx.publicsearch.us', name: 'Comanche County Clerk' },
  erath:       { subdomain: 'erath.tx.publicsearch.us', name: 'Erath County Clerk' },
  somervell:   { subdomain: 'somervell.tx.publicsearch.us', name: 'Somervell County Clerk' },
  johnson:     { subdomain: 'johnson.tx.publicsearch.us', name: 'Johnson County Clerk' },
  ellis:       { subdomain: 'ellis.tx.publicsearch.us', name: 'Ellis County Clerk' },
  navarro:     { subdomain: 'navarro.tx.publicsearch.us', name: 'Navarro County Clerk' },
  freestone:   { subdomain: 'freestone.tx.publicsearch.us', name: 'Freestone County Clerk' },
  leon:        { subdomain: 'leon.tx.publicsearch.us', name: 'Leon County Clerk' },
  madison:     { subdomain: 'madison.tx.publicsearch.us', name: 'Madison County Clerk' },
  brazos:      { subdomain: 'brazos.tx.publicsearch.us', name: 'Brazos County Clerk' },
  burleson:    { subdomain: 'burleson.tx.publicsearch.us', name: 'Burleson County Clerk' },
  washington:  { subdomain: 'washington.tx.publicsearch.us', name: 'Washington County Clerk' },
  fayette:     { subdomain: 'fayette.tx.publicsearch.us', name: 'Fayette County Clerk' },
  gonzales:    { subdomain: 'gonzales.tx.publicsearch.us', name: 'Gonzales County Clerk' },
  // ── Ring 4-5: (~100-175 mi) ──────────────────────────────────────
  hood:        { subdomain: 'hood.tx.publicsearch.us', name: 'Hood County Clerk' },
  palo_pinto:  { subdomain: 'palopinto.tx.publicsearch.us', name: 'Palo Pinto County Clerk' },
  parker:      { subdomain: 'parker.tx.publicsearch.us', name: 'Parker County Clerk' },
  kendall:     { subdomain: 'kendall.tx.publicsearch.us', name: 'Kendall County Clerk' },
  bandera:     { subdomain: 'bandera.tx.publicsearch.us', name: 'Bandera County Clerk' },
  bexar:       { subdomain: 'bexar.tx.publicsearch.us', name: 'Bexar County Clerk' },
  medina:      { subdomain: 'medina.tx.publicsearch.us', name: 'Medina County Clerk' },
  wilson:      { subdomain: 'wilson.tx.publicsearch.us', name: 'Wilson County Clerk' },
  karnes:      { subdomain: 'karnes.tx.publicsearch.us', name: 'Karnes County Clerk' },
  dewitt:      { subdomain: 'dewitt.tx.publicsearch.us', name: 'DeWitt County Clerk' },
  lavaca:      { subdomain: 'lavaca.tx.publicsearch.us', name: 'Lavaca County Clerk' },
  colorado:    { subdomain: 'colorado.tx.publicsearch.us', name: 'Colorado County Clerk' },
  anderson:    { subdomain: 'anderson.tx.publicsearch.us', name: 'Anderson County Clerk' },
  henderson:   { subdomain: 'henderson.tx.publicsearch.us', name: 'Henderson County Clerk' },
  kaufman:     { subdomain: 'kaufman.tx.publicsearch.us', name: 'Kaufman County Clerk' },
  collin:      { subdomain: 'collin.tx.publicsearch.us', name: 'Collin County Clerk' },
  denton:      { subdomain: 'denton.tx.publicsearch.us', name: 'Denton County Clerk' },
  dallas:      { subdomain: 'dallas.tx.publicsearch.us', name: 'Dallas County Clerk' },
  tarrant:     { subdomain: 'tarrant.tx.publicsearch.us', name: 'Tarrant County Clerk' },
  montgomery:  { subdomain: 'montgomery.tx.publicsearch.us', name: 'Montgomery County Clerk' },
  // fort_bend, brazoria, galveston: DNS NXDOMAIN on publicsearch.us (verified 2026-03-09)
  // These counties do NOT use publicsearch.us — need separate adapters.
  nueces:      { subdomain: 'nueces.tx.publicsearch.us', name: 'Nueces County Clerk' },
  potter:      { subdomain: 'potter.tx.publicsearch.us', name: 'Potter County Clerk' },
  victoria:    { subdomain: 'victoria.tx.publicsearch.us', name: 'Victoria County Clerk' },
  // ── Ring 6: (~175-200 mi) ────────────────────────────────────────
  grayson:     { subdomain: 'grayson.tx.publicsearch.us', name: 'Grayson County Clerk' },
  hunt:        { subdomain: 'hunt.tx.publicsearch.us', name: 'Hunt County Clerk' },
  van_zandt:   { subdomain: 'vanzandt.tx.publicsearch.us', name: 'Van Zandt County Clerk' },
  smith:       { subdomain: 'smith.tx.publicsearch.us', name: 'Smith County Clerk' },
  cherokee:    { subdomain: 'cherokee.tx.publicsearch.us', name: 'Cherokee County Clerk' },
  nacogdoches: { subdomain: 'nacogdoches.tx.publicsearch.us', name: 'Nacogdoches County Clerk' },
  angelina:    { subdomain: 'angelina.tx.publicsearch.us', name: 'Angelina County Clerk' },
  uvalde:      { subdomain: 'uvalde.tx.publicsearch.us', name: 'Uvalde County Clerk' },
  atascosa:    { subdomain: 'atascosa.tx.publicsearch.us', name: 'Atascosa County Clerk' },
  goliad:      { subdomain: 'goliad.tx.publicsearch.us', name: 'Goliad County Clerk' },
  jackson:     { subdomain: 'jackson.tx.publicsearch.us', name: 'Jackson County Clerk' },
  matagorda:   { subdomain: 'matagorda.tx.publicsearch.us', name: 'Matagorda County Clerk' },
  chambers:    { subdomain: 'chambers.tx.publicsearch.us', name: 'Chambers County Clerk' },
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
  if (/\bdeed\b/i.test(lower)) return 90;
  if (/\beasement\b/i.test(lower)) return 85;
  if (/right[- ]of[- ]way/i.test(lower)) return 80;
  if (/restrictive|cc&r/i.test(lower)) return 70;
  if (/deed\s*of\s*trust/i.test(lower)) return 60;
  if (/release/i.test(lower)) return 50;
  if (/\bplat\b/i.test(lower)) return 50;
  if (/mineral|oil|gas/i.test(lower)) return 40;
  return 30;
}

// ── Tyler PublicSearch URL Builder ─────────────────────────────────────────

/**
 * Build a Tyler/Kofile PublicSearch results URL with the correct parameters.
 * URL format confirmed from actual HTML inspection of bell.tx.publicsearch.us (March 2026):
 *   /results?department=RP&keywordSearch=false&limit=50&offset={offset}
 *     &recordedDateRange=16000101%2C{YYYYMMDD}
 *     &searchOcrText=true&searchType=quickSearch&searchValue={value}
 *
 * Offset is 0-based: page 1 = offset 0, page 2 = offset 50, page 3 = offset 100, etc.
 */
function buildTylerUrl(baseUrl: string, searchValue: string, offset = 0): string {
  const d = new Date();
  const dateTo = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return (
    `${baseUrl}/results?department=RP&keywordSearch=false&limit=50&offset=${offset}` +
    `&recordedDateRange=16000101%2C${dateTo}&searchOcrText=true&searchType=quickSearch` +
    `&searchValue=${encodeURIComponent(searchValue)}`
  );
}

// ── Owner Name Formatting ──────────────────────────────────────────────────

/**
 * Business entity keywords that indicate a name should be searched verbatim
 * (not inverted to LAST, FIRST format).  Includes legal suffixes (LLC, INC …)
 * and professional-service descriptors (SURVEYING, ENGINEERING …) so that
 * names like "STARR SURVEYING" are never mangled into "SURVEYING, STARR".
 */
const BUSINESS_ENTITY_TERMS = [
  // Legal suffixes
  'LLC', 'LP', 'LTD', 'INC', 'CORP', 'TRUST', 'ESTATE', 'PARTNERSHIP',
  'COMPANY', 'CO', 'ENTERPRISES?', 'GROUP', 'HOLDINGS?', 'PROPERTIES',
  // Professional-service descriptors
  'SURVEYING', 'SURVEYORS?', 'ENGINEERING', 'ENGINEERS?', 'CONSTRUCTION',
  'CONSULTING', 'CONSULTANTS?', 'SERVICES?', 'DEVELOPMENT', 'MANAGEMENT',
  'REALTY', 'INVESTMENTS?', 'BUILDERS?', 'ASSOCIATES?',
] as const;

const BIZ_ENTITY_RE = new RegExp(`\\b(${BUSINESS_ENTITY_TERMS.join('|')})\\b`, 'i');

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

  // Business entities — use as-is, plus try without the trailing legal suffix.
  if (BIZ_ENTITY_RE.test(name)) {
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
  pageScreenshots: PageScreenshot[];
  /** Whether the URL resolved to a valid page with content */
  urlValid: boolean;
}

// ── URL Validation ──────────────────────────────────────────────────────────

/**
 * Check if a page actually loaded with real content (not blank/broken/error).
 */
async function isPageValid(page: import('playwright').Page): Promise<{ valid: boolean; reason: string }> {
  const check = await page.evaluate(() => {
    const body = document.body;
    if (!body) return { valid: false, reason: 'No body element' };

    const text = body.textContent?.trim() ?? '';
    const title = document.title?.toLowerCase() ?? '';

    // Check for common error indicators
    if (text.length < 50) return { valid: false, reason: `Page too short (${text.length} chars)` };
    if (/404|not found|page not found/i.test(title)) return { valid: false, reason: '404 page' };
    if (/error|forbidden|unauthorized|access denied/i.test(title)) return { valid: false, reason: `Error page: ${title}` };
    if (/blank|empty/i.test(title) && text.length < 100) return { valid: false, reason: 'Blank page' };

    // Check if the page is just a login/redirect
    const hasLoginForm = !!document.querySelector('form[action*="login"], form[action*="sign"], input[type="password"]');
    if (hasLoginForm && text.length < 500) return { valid: false, reason: 'Login page' };

    return { valid: true, reason: 'OK' };
  });

  return check;
}

// ── Multi-Page Document Viewer Navigation ───────────────────────────────────

/**
 * Navigate through ALL pages of a document in a viewer, capturing high-res
 * screenshots of each page. Handles page arrows, page selectors, and
 * canvas/image-based viewers.
 *
 * Returns an array of PageScreenshot objects for every page found.
 */
async function captureAllDocumentPages(
  page: import('playwright').Page,
  logger: PipelineLogger,
  label: string,
  maxPages: number = 50,
): Promise<PageScreenshot[]> {
  const screenshots: PageScreenshot[] = [];

  // Detect the document viewer type and page count
  const viewerInfo = await page.evaluate(() => {
    // Look for page count indicators
    const pageCountPatterns = [
      /(?:of|\/)\s*(\d+)\s*(?:pages?)?/i,
      /(\d+)\s*(?:pages?|pgs?)\s*(?:total)?/i,
      /page\s*\d+\s*of\s*(\d+)/i,
    ];
    const bodyText = document.body.textContent ?? '';
    let totalPages = 1;
    for (const pattern of pageCountPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (parsed > 0 && parsed < 500) { totalPages = parsed; break; }
      }
    }

    // Check for page number input
    const pageInput = document.querySelector(
      'input[type="number"][class*="page"], input[aria-label*="page" i], input[name*="page" i], input[id*="pageNum" i], input.page-number'
    ) as HTMLInputElement | null;

    // Detect viewer type
    const hasCanvas = !!document.querySelector('canvas');
    const hasDocImage = !!document.querySelector(
      'img.document-image, img[src*="document"], img[src*="page"], img[src*="image"], img[src*="scan"], .page-image img'
    );
    const hasIframe = !!document.querySelector('iframe[src*="document"], iframe[src*="viewer"]');

    // Find next/prev buttons
    const nextSelectors = [
      '[aria-label*="next" i]', '[title*="next" i]',
      'button:has-text("Next")', 'a:has-text("Next")',
      '.next-page', '.page-next', '#nextPage', '#btnNext',
      'button.next', 'a.next',
      '[class*="next-page"]', '[class*="page-next"]',
      '[class*="forward"]', '[class*="right-arrow"]',
      'button[class*="next"]', 'a[class*="next"]',
      // Arrow buttons (common in document viewers)
      'button:has(svg), button:has(.arrow-right), button:has(.chevron-right)',
      '.viewer-controls button:last-child',
      '.page-controls button:last-child',
      '.pagination button:last-child',
    ];

    let nextBtnFound = false;
    for (const sel of nextSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && (el as HTMLElement).offsetParent !== null) {
          nextBtnFound = true;
          break;
        }
      } catch { /* invalid selector */ }
    }

    // Check for zoom controls
    const hasZoom = !!(
      document.querySelector('[aria-label*="zoom" i], [title*="zoom" i], .zoom-control, .zoom-button, [class*="zoom-btn"]') ||
      document.querySelector('select[class*="zoom"], input[class*="zoom"]')
    );

    return {
      totalPages,
      hasPageInput: !!pageInput,
      pageInputMax: pageInput?.max ? parseInt(pageInput.max, 10) : null,
      hasCanvas,
      hasDocImage,
      hasIframe,
      nextBtnFound,
      hasZoom,
      viewerType: hasCanvas ? 'canvas' : hasDocImage ? 'image' : hasIframe ? 'iframe' : 'unknown',
    };
  });

  logger.info('Stage2B', `${label}: Viewer detected — type=${viewerInfo.viewerType}, pages=${viewerInfo.totalPages}, nextBtn=${viewerInfo.nextBtnFound}, zoom=${viewerInfo.hasZoom}`);

  // Try to maximize zoom for best resolution
  if (viewerInfo.hasZoom) {
    try {
      await page.evaluate(() => {
        // Try zoom dropdown/select
        const zoomSelect = document.querySelector('select[class*="zoom"], select[aria-label*="zoom" i]') as HTMLSelectElement | null;
        if (zoomSelect) {
          // Pick highest zoom value
          const options = Array.from(zoomSelect.options);
          const maxZoom = options.reduce((max, opt) => {
            const val = parseFloat(opt.value);
            return val > max ? val : max;
          }, 0);
          if (maxZoom > 0) {
            zoomSelect.value = String(maxZoom);
            zoomSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return;
        }

        // Try zoom-in button (click multiple times)
        const zoomIn = document.querySelector('[aria-label*="zoom in" i], [title*="zoom in" i], .zoom-in, #zoomIn, [class*="zoom-in"]') as HTMLElement | null;
        if (zoomIn) {
          for (let i = 0; i < 5; i++) zoomIn.click();
          return;
        }

        // Try "fit width" or "actual size" button for best resolution
        const fitBtn = document.querySelector('[aria-label*="actual" i], [title*="actual" i], [aria-label*="fit width" i]') as HTMLElement | null;
        if (fitBtn) fitBtn.click();
      });
      await page.waitForTimeout(1_500);
      logger.info('Stage2B', `${label}: Attempted zoom maximize`);
    } catch {
      logger.info('Stage2B', `${label}: Zoom maximize failed — continuing at default zoom`);
    }
  }

  // Determine effective total pages
  const effectiveTotal = Math.min(
    viewerInfo.pageInputMax ?? viewerInfo.totalPages,
    maxPages,
  );

  // Capture page 1
  const page1Screenshot = await captureCurrentPageScreenshot(page, label, logger);
  if (page1Screenshot) {
    screenshots.push({ ...page1Screenshot, pageNumber: 1 });
    logger.info('Stage2B', `${label}: Page 1 captured (${page1Screenshot.width}x${page1Screenshot.height})`);
  }

  // Navigate through remaining pages
  if (effectiveTotal > 1) {
    for (let pageNum = 2; pageNum <= effectiveTotal; pageNum++) {
      const navigated = await navigateToNextPage(page, pageNum, viewerInfo.hasPageInput, logger, label);
      if (!navigated) {
        logger.info('Stage2B', `${label}: Could not navigate to page ${pageNum} — stopping at ${pageNum - 1} pages`);
        break;
      }

      // Wait for page to render
      await page.waitForTimeout(1_500);

      const screenshot = await captureCurrentPageScreenshot(page, label, logger);
      if (screenshot) {
        screenshots.push({ ...screenshot, pageNumber: pageNum });
        logger.info('Stage2B', `${label}: Page ${pageNum}/${effectiveTotal} captured (${screenshot.width}x${screenshot.height})`);
      } else {
        logger.warn('Stage2B', `${label}: Page ${pageNum} capture failed — continuing`);
      }
    }
  }

  logger.info('Stage2B', `${label}: Captured ${screenshots.length}/${effectiveTotal} pages total`);
  return screenshots;
}

/**
 * Navigate to the next page in a document viewer.
 * Tries: page input field, next button/arrow, keyboard arrow.
 */
async function navigateToNextPage(
  page: import('playwright').Page,
  targetPage: number,
  hasPageInput: boolean,
  logger: PipelineLogger,
  label: string,
): Promise<boolean> {
  // Method 1: Direct page number input
  if (hasPageInput) {
    try {
      const success = await page.evaluate((target: number) => {
        const pageInput = document.querySelector(
          'input[type="number"][class*="page"], input[aria-label*="page" i], input[name*="page" i], input[id*="pageNum" i], input.page-number'
        ) as HTMLInputElement | null;
        if (pageInput) {
          pageInput.value = String(target);
          pageInput.dispatchEvent(new Event('input', { bubbles: true }));
          pageInput.dispatchEvent(new Event('change', { bubbles: true }));
          pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return true;
        }
        return false;
      }, targetPage);

      if (success) {
        await page.waitForTimeout(1_000);
        return true;
      }
    } catch { /* fall through */ }
  }

  // Method 2: Click next/forward button
  const nextSelectors = [
    '[aria-label*="next" i]', '[title*="next" i]',
    'button:has-text("Next")', 'a:has-text("Next")',
    '.next-page', '.page-next', '#nextPage', '#btnNext',
    'button.next', 'a.next',
    '[class*="next-page"]', '[class*="page-next"]',
    '[class*="forward"]',
    'button[class*="next"]', 'a[class*="next"]',
    '.viewer-controls button:last-child',
    '.page-controls button:last-child',
  ];

  for (const sel of nextSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1_000 })) {
        const isDisabled = await btn.isDisabled().catch(() => false);
        if (!isDisabled) {
          await btn.click();
          return true;
        }
      }
    } catch { continue; }
  }

  // Method 3: Right arrow key (common in document viewers)
  try {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);

    // Check if page actually changed
    const currentText = await page.evaluate(() => {
      const indicator = document.body.textContent?.match(/page\s*(\d+)/i);
      return indicator ? parseInt(indicator[1], 10) : null;
    });
    if (currentText === targetPage) return true;
  } catch { /* fall through */ }

  return false;
}

/**
 * Capture a high-resolution screenshot of the current document page.
 * Tries to find the document image/canvas element and screenshot just that
 * for maximum clarity, falling back to full-page screenshot.
 */
async function captureCurrentPageScreenshot(
  page: import('playwright').Page,
  label: string,
  logger: PipelineLogger,
): Promise<{ imageBase64: string; width: number; height: number } | null> {
  try {
    // Try to find the specific document element for targeted screenshot
    const docElement = await page.evaluate(() => {
      const selectors = [
        'canvas', // Canvas-based viewer (most common for high-res)
        'img.document-image', 'img[src*="document"]', 'img[src*="page"]',
        'img[src*="image"]', 'img[src*="scan"]', '.page-image img',
        '.viewer img', 'img[class*="doc"]',
        '.document-viewer', '.page-viewer', '.viewer-content',
        '#documentViewer', '#pageViewer',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el && el.offsetWidth > 200 && el.offsetHeight > 200) {
          const rect = el.getBoundingClientRect();
          return {
            found: true,
            selector: sel,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            isCanvas: el.tagName === 'CANVAS',
            isImg: el.tagName === 'IMG',
            imgSrc: el.tagName === 'IMG' ? (el as HTMLImageElement).src : null,
            naturalWidth: el.tagName === 'IMG' ? (el as HTMLImageElement).naturalWidth : 0,
            naturalHeight: el.tagName === 'IMG' ? (el as HTMLImageElement).naturalHeight : 0,
          };
        }
      }

      return { found: false, selector: null, width: 0, height: 0, isCanvas: false, isImg: false, imgSrc: null, naturalWidth: 0, naturalHeight: 0 };
    });

    // If we found a canvas, try to extract its data directly at full resolution
    if (docElement.found && docElement.isCanvas) {
      const canvasData = await page.evaluate((sel: string) => {
        const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
        if (!canvas) return null;
        try {
          // Get full resolution data from canvas
          return {
            dataUrl: canvas.toDataURL('image/png', 1.0),
            width: canvas.width,
            height: canvas.height,
          };
        } catch {
          // Canvas might be tainted (cross-origin)
          return null;
        }
      }, docElement.selector!);

      if (canvasData?.dataUrl) {
        const base64 = canvasData.dataUrl.replace(/^data:image\/png;base64,/, '');
        return { imageBase64: base64, width: canvasData.width, height: canvasData.height };
      }
    }

    // If we found an img element, try to download the source at full resolution
    if (docElement.found && docElement.isImg && docElement.imgSrc) {
      try {
        const imgResponse = await page.context().request.get(docElement.imgSrc, { timeout: 15_000 });
        if (imgResponse.ok()) {
          const imgBuffer = await imgResponse.body();
          if (imgBuffer.length > 1000) {
            return {
              imageBase64: imgBuffer.toString('base64'),
              width: docElement.naturalWidth || docElement.width,
              height: docElement.naturalHeight || docElement.height,
            };
          }
        }
      } catch {
        // Fall through to element screenshot
      }
    }

    // Take element-level screenshot if we found the viewer
    if (docElement.found && docElement.selector) {
      try {
        const element = page.locator(docElement.selector).first();
        const elementScreenshot = await element.screenshot({ type: 'png' }) as Buffer;
        if (elementScreenshot.length > 1000) {
          return {
            imageBase64: elementScreenshot.toString('base64'),
            width: docElement.width,
            height: docElement.height,
          };
        }
      } catch {
        // Fall through to full page
      }
    }

    // Fallback: full page screenshot at maximum viewport
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' }) as Buffer;
    if (screenshot.length > 1000) {
      const size = await page.viewportSize();
      return {
        imageBase64: screenshot.toString('base64'),
        width: size?.width ?? 1366,
        height: size?.height ?? 768,
      };
    }

    return null;
  } catch (err) {
    logger.warn('Stage2B', `${label}: Screenshot capture failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Document Detail Fetcher (with multi-page and URL validation) ────────────

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
    pageScreenshots: [],
    urlValid: false,
  };

  if (!doc.url) {
    if (doc.instrumentNumber) {
      // Build a direct detail page URL using Kofile's /doc/{id}/details pattern
      doc.url = `${baseUrl}/doc/${encodeURIComponent(doc.instrumentNumber)}/details`;
      logger.info('Stage2B', `${label}: Built detail URL from instrument number: ${doc.url}`);
    } else {
      result.processingErrors.push('No URL or instrument number available');
      return result;
    }
  }

  const tracker = logger.startAttempt({
    layer: 'Stage2B',
    source: 'Clerk-Detail',
    method: 'page-fetch',
    input: `${label}: ${doc.url}`,
  });

  try {
    tracker.step(`Navigating to: ${doc.url}`);

    // Set a larger viewport for high-res capture
    await page.setViewportSize({ width: 1920, height: 1200 });

    const response = await page.goto(doc.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Check HTTP response status
    if (response && (response.status() >= 400 || response.status() === 0)) {
      tracker.step(`HTTP error: ${response.status()}`);
      result.processingErrors.push(`URL returned HTTP ${response.status()}`);
      doc.url = null; // Mark URL as broken
      tracker({ status: 'fail', error: `HTTP ${response.status()} — broken URL removed` });
      return result;
    }

    // For React SPAs (like Kofile), wait for network to go idle so content renders
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      // networkidle timeout is acceptable — fall back to a fixed delay
      await page.waitForTimeout(3_000);
    }

    // Validate the page actually has content
    const pageCheck = await isPageValid(page);
    if (!pageCheck.valid) {
      tracker.step(`Page invalid: ${pageCheck.reason}`);
      result.processingErrors.push(`Page broken: ${pageCheck.reason}`);
      doc.url = null; // Mark URL as broken
      tracker({ status: 'fail', error: `Broken page: ${pageCheck.reason}` });
      return result;
    }

    result.urlValid = true;
    tracker.step('Page loaded and validated');

    // ── Extract text content ──────────────────────────────
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
      const body = document.querySelector('main') ?? document.body;
      const text = body.textContent?.trim() ?? '';
      return text.length > 200 ? text : '';
    });

    if (pageText.length > 100) {
      result.textContent = pageText.substring(0, 50_000);
      tracker.step(`Extracted text: ${result.textContent.length} chars`);
    }

    // ── Try to find and download PDF ──────────────────────
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
      tracker.step(`Found PDF: ${pdfUrl}`);
      try {
        const fullPdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `${baseUrl}${pdfUrl.startsWith('/') ? '' : '/'}${pdfUrl}`;
        const pdfResponse = await page.context().request.get(fullPdfUrl, { timeout: 30_000 });
        if (pdfResponse.ok()) {
          const pdfBuffer = await pdfResponse.body();
          result.imageBase64 = pdfBuffer.toString('base64');
          result.imageFormat = 'pdf';
          tracker.step(`Downloaded PDF: ${(pdfBuffer.length / 1024).toFixed(0)} KB`);
        }
      } catch (pdfErr) {
        result.processingErrors.push(`PDF download failed: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
      }
    }

    // ── Capture ALL pages of the document at high resolution ──────
    tracker.step('Capturing document pages at high resolution...');
    result.pageScreenshots = await captureAllDocumentPages(page, logger, label);

    // Use first page screenshot as imageBase64 if no PDF was downloaded
    if (!result.imageBase64 && result.pageScreenshots.length > 0) {
      result.imageBase64 = result.pageScreenshots[0].imageBase64;
      result.imageFormat = 'png';
    }

    // ── Extract metadata from detail page ──────────────────
    const metadata = await page.evaluate(() => {
      const getFieldText = (labels: string[]): string | null => {
        for (const lbl of labels) {
          const re = new RegExp(`${lbl}\\s*:?\\s*([^\\n<]+)`, 'i');
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

    if (metadata.volume && !doc.volume) doc.volume = metadata.volume;
    if (metadata.page && !doc.page) doc.page = metadata.page;
    if (metadata.instrumentNumber && !doc.instrumentNumber) doc.instrumentNumber = metadata.instrumentNumber;
    if (metadata.recordingDate && !doc.recordingDate) doc.recordingDate = metadata.recordingDate;
    if (metadata.grantors && doc.grantors.length === 0) doc.grantors = [metadata.grantors];
    if (metadata.grantees && doc.grantees.length === 0) doc.grantees = [metadata.grantees];

    const dataPoints = (result.textContent ? 1 : 0) + result.pageScreenshots.length + (result.imageBase64 ? 1 : 0);
    tracker.step(`Complete: ${result.pageScreenshots.length} pages captured, text: ${result.textContent?.length ?? 0} chars`);
    tracker({
      status: dataPoints > 0 ? 'success' : 'partial',
      dataPointsFound: dataPoints,
      details: `Pages: ${result.pageScreenshots.length}, Text: ${result.textContent?.length ?? 0} chars, Image: ${result.imageFormat ?? 'none'}`,
    });

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.processingErrors.push(`Detail page fetch failed: ${errMsg}`);
    tracker({ status: 'fail', error: errMsg });
    return result;
  }
}

// ── Kofile Config Helpers ──────────────────────────────────────────────────

/**
 * Returns true if the given county name has a Kofile/PublicSearch configuration.
 * Use this to gate instrument-number searches and Kofile image downloads instead
 * of hardcoding county names in the pipeline.
 */
export function hasKofileConfig(county: string): boolean {
  return Object.prototype.hasOwnProperty.call(KOFILE_CONFIGS, county.toLowerCase());
}

/**
 * Returns the base URL for a county's Kofile/PublicSearch instance, or null.
 * e.g. "bell" → "https://bell.tx.publicsearch.us"
 */
export function getKofileBaseUrl(county: string): string | null {
  const cfg = KOFILE_CONFIGS[county.toLowerCase()];
  if (!cfg) return null;
  const subdomain = cfg.subdomain;
  return subdomain.startsWith('http') ? subdomain : `https://${subdomain}`;
}

// ── Main Clerk Search ──────────────────────────────────────────────────────

/**
 * Extract party names (grantors/grantees) from a Kofile API JSON field.
 *
 * Handles three common shapes:
 *   - `"STARR SURVEYING"`  → ["STARR SURVEYING"]
 *   - `["NAME ONE", "NAME TWO"]`  → ["NAME ONE", "NAME TWO"]
 *   - `[{ name: "JOHN DOE" }, { partyName: "JANE DOE" }]`  → ["JOHN DOE", "JANE DOE"]
 */
export function extractKofilePartyNames(val: unknown): string[] {
  if (!val) return [];
  if (typeof val === 'string') return [val].filter(Boolean);
  if (Array.isArray(val)) {
    return (val as unknown[])
      .map((v) =>
        v && typeof v === 'object'
          ? String((v as Record<string, unknown>).name ?? (v as Record<string, unknown>).partyName ?? v)
          : String(v),
      )
      .filter(Boolean);
  }
  return [];
}

/**
 * Normalise a Kofile/GovOS PublicSearch API response into a flat array of
 * document records, handling the various response envelope shapes the system
 * uses across deployments:
 *   - plain array
 *   - `{ results: [...] }` / `{ documents: [...] }` / `{ data: [...] }` / `{ records: [...] }`
 *   - Elasticsearch `{ hits: { hits: [{ _source: {...} }] } }`
 */
export function normaliseKofileApiResponse(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.results))    return d.results as Array<Record<string, unknown>>;
    if (Array.isArray(d.documents))  return d.documents as Array<Record<string, unknown>>;
    if (Array.isArray(d.data))       return d.data as Array<Record<string, unknown>>;
    if (Array.isArray(d.records))    return d.records as Array<Record<string, unknown>>;
    if (d.hits && typeof d.hits === 'object') {
      const hits = d.hits as Record<string, unknown>;
      if (Array.isArray(hits.hits)) {
        return (hits.hits as Array<Record<string, unknown>>).map(
          (h) => (h._source as Record<string, unknown>) ?? h,
        );
      }
    }
  }
  return [];
}

/**
 * Return true when an array of API items looks like Kofile document records.
 *
 * Used by the broadened API-response interceptor to accept JSON from any endpoint
 * whose response *structure* matches a document list, regardless of its URL.
 */
export function looksLikeKofileDocuments(items: Array<Record<string, unknown>>): boolean {
  return items.some((item) =>
    'instrumentNumber' in item || 'docType' in item || 'documentType' in item ||
    'docTypeDescription' in item || 'recordingDate' in item ||
    'grantors' in item || 'grantees' in item,
  );
}

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

  const tracker = logger.startAttempt({
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

    // ── Stage 2A: API response interception ──────────────────────────────────
    // Kofile/GovOS PublicSearch is a React SPA: it fetches document data from a
    // JSON API.  Intercept those responses to get clean structured data instead
    // of trying to reverse-engineer the dynamic DOM.

    /** Docs captured from the Kofile JSON API for the CURRENT search name */
    let apiCapture: DocumentRef[] = [];

    const handleApiResponse = async (response: PlaywrightResponse): Promise<void> => {
      try {
        const url = response.url();
        const ct = response.headers()['content-type'] ?? '';
        if (!ct.includes('json')) return;

        // Match Kofile/GovOS PublicSearch AJAX endpoints:
        //   /api/search/instrument, /api/public/..., /results (JSON), /SearchResults, etc.
        const isSearchApi =
          url.includes('/api/') ||
          url.includes('/search/instrument') ||
          url.includes('/instrument/') ||
          url.includes('SearchResults') ||
          url.includes('searchresults');

        // Structural guard: even for unmatched URLs, accept JSON arrays that look
        // like document records.  This handles Kofile deployments with non-standard paths.
        const data = await response.json() as unknown;
        const items = normaliseKofileApiResponse(data);
        if (items.length === 0) return;

        // Structural check: require at least one document-like field.
        // This lets us capture data from non-standard API URLs too.
        if (!isSearchApi && !looksLikeKofileDocuments(items)) return;

        const newDocs: DocumentRef[] = items.map((item) => {
          // Kofile uses various field names for the document identifier
          const id = String(
            item.id ?? item.documentId ?? item.instrumentNumber ?? item.docNumber ?? item.instrument ?? '',
          ).trim();
          const docType = String(
            item.docTypeDescription ?? item.documentTypeDescription ??
            item.documentType ?? item.docType ?? item.type ?? 'Unknown',
          ).trim();
          const date = String(
            item.recordingDate ?? item.documentDate ?? item.filingDate ?? item.date ?? '',
          ).trim();

          return {
            instrumentNumber: id || null,
            documentType: docType,
            recordingDate: date || null,
            grantors: extractKofilePartyNames(item.grantors ?? item.grantor ?? item.grantorParties),
            grantees: extractKofilePartyNames(item.grantees ?? item.grantee ?? item.granteeParties),
            source: config.name,
            // Kofile detail page URL pattern: /doc/{id}/details
            url: id ? `${baseUrl}/doc/${id}/details` : null,
            volume: String(item.volume ?? item.bookNumber ?? '').trim() || null,
            page: String(item.page ?? item.pageNumber ?? '').trim() || null,
          };
        });

        apiCapture = [...apiCapture, ...newDocs];
        logger.info('Stage2A', `[api-intercept] Captured ${newDocs.length} docs from ${url.substring(0, 100)}`);
      } catch (err) {
        logger.info('Stage2A', `[api-intercept] Could not parse response from ${response.url().substring(0, 80)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    page.on('response', (response) => { void handleApiResponse(response); });

    // Try each name variant until we get results
    let documents: DocumentRef[] = [];

    for (const searchName of searchNames) {
      try {
        // ── AJAX Response Interception ──────────────────────────────────
        // Kofile PublicSearch is a React SPA. The initial HTML contains no
        // results — data arrives via an asynchronous fetch/XHR that populates
        // the Redux store. We intercept that JSON response to get clean,
        // structured document data instead of scraping the rendered DOM.
        interface KofileDoc {
          docNumber?: string;
          instrumentNumber?: string;
          documentNumber?: string;
          number?: string;
          docType?: string;
          docTypeCode?: string;
          documentType?: string;
          typeCode?: string;
          type?: string;
          recordedDate?: string;
          recordedDateStr?: string;
          recordingDate?: string;
          filingDate?: string;
          date?: string;
          parties?: Array<{ name?: string; type?: string; role?: string }>;
          grantors?: string[];
          grantees?: string[];
          pageCount?: number;
          id?: string | number;
          bookType?: string;
          bookNumber?: string;
          pageNumber?: string;
          [key: string]: unknown;
        }

        let capturedDocs: KofileDoc[] = [];
        let resolveCapture: ((docs: KofileDoc[]) => void) | null = null;
        const capturePromise = new Promise<KofileDoc[]>((resolve) => {
          resolveCapture = resolve;
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        page.on('response', async (response: any) => {
          try {
            const url = response.url();
            const ct = response.headers()['content-type'] ?? '';
            // Kofile SPA fetches results as JSON from various endpoints
            if (!ct.includes('json')) return;
            // Match search/result endpoints — the SPA calls back to the server
            // which returns document data in JSON form
            if (
              url.includes('/results') ||
              url.includes('/search') ||
              url.includes('/documents') ||
              url.includes('/api/') ||
              url.includes('/graphql') ||
              url.includes('/query') ||
              url.includes('/workspace')
            ) {
              const data = await response.json() as Record<string, unknown>;

              // Strategy 1: Redux-shaped response with byHash/byOrder
              const workspaces = data.documents as Record<string, unknown> | undefined;
              if (workspaces) {
                const wsEntries = Object.values(
                  (workspaces as Record<string, unknown>).workspaces ?? workspaces,
                );
                for (const ws of wsEntries) {
                  const wsData = (ws as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
                  if (wsData?.byHash && typeof wsData.byHash === 'object') {
                    const docs = Object.values(wsData.byHash as Record<string, KofileDoc>);
                    if (docs.length > 0) {
                      capturedDocs = docs;
                      if (resolveCapture) resolveCapture(docs);
                      return;
                    }
                  }
                }
              }

              // Strategy 2: Direct array of document objects
              if (Array.isArray(data)) {
                const docs = data as KofileDoc[];
                if (docs.length > 0 && (docs[0].docNumber || docs[0].instrumentNumber || docs[0].docType)) {
                  capturedDocs = docs;
                  if (resolveCapture) resolveCapture(docs);
                  return;
                }
              }

              // Strategy 3: Wrapped array (e.g. { results: [...] })
              for (const key of ['results', 'data', 'records', 'items', 'documents', 'searchResults']) {
                const arr = data[key];
                if (Array.isArray(arr) && arr.length > 0) {
                  const first = arr[0] as KofileDoc;
                  if (first.docNumber || first.instrumentNumber || first.docType || first.recordedDate) {
                    capturedDocs = arr as KofileDoc[];
                    if (resolveCapture) resolveCapture(capturedDocs);
                    return;
                  }
                }
              }

              // Strategy 4: Direct workspace data (Tyler PublicSearch returns
              // { byHash: { id: docObj, ... }, byOrder: [...], numRecords: N }
              // without the documents.workspaces wrapper)
              if (data.byHash && typeof data.byHash === 'object' && !Array.isArray(data.byHash)) {
                const docs = Object.values(data.byHash as Record<string, KofileDoc>);
                if (docs.length > 0) {
                  capturedDocs = docs;
                  if (resolveCapture) resolveCapture(docs);
                  return;
                }
              }

              // Strategy 5: Nested workspace without 'documents' prefix
              // e.g. { workspaces: { wsId: { data: { byHash: {...} } } } }
              if (data.workspaces && typeof data.workspaces === 'object') {
                const wsEntries = Object.values(data.workspaces as Record<string, Record<string, unknown>>);
                for (const ws of wsEntries) {
                  const wsData = ws?.data as Record<string, unknown> | undefined;
                  if (wsData?.byHash && typeof wsData.byHash === 'object') {
                    const docs = Object.values(wsData.byHash as Record<string, KofileDoc>);
                    if (docs.length > 0) {
                      capturedDocs = docs;
                      if (resolveCapture) resolveCapture(docs);
                      return;
                    }
                  }
                }
              }

              // Strategy 6: Deep scan — any object with arrays of items
              // that have date-like or number-like fields typical of documents
              for (const key of Object.keys(data)) {
                const val = data[key];
                if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                  const first = val[0] as Record<string, unknown>;
                  // Check for typical document fields (using broader field names)
                  const hasDocFields = first.docNumber || first.instrumentNumber || first.docType ||
                    first.recordedDate || first.documentType || first.documentNumber ||
                    first.recordingDate || first.filingDate || first.typeCode;
                  if (hasDocFields) {
                    capturedDocs = val as KofileDoc[];
                    if (resolveCapture) resolveCapture(capturedDocs);
                    return;
                  }
                }
              }
            }
          } catch { /* ignore parse errors */ }
        });
        apiCapture = []; // Reset for each attempt

        // Build URL with correct Tyler PublicSearch parameters (verified March 2026)
        const searchUrl = buildTylerUrl(baseUrl, searchName, 0);
        logger.info('Stage2A', `Trying: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });

        // Race: AJAX capture vs DOM rendering vs timeout
        // The SPA loads results asynchronously — wait for AJAX or rendered DOM
        try {
          await Promise.race([
            capturePromise,
            page.waitForSelector('table tbody tr[aria-selected], section.search-results__results-wrap table tbody tr', { timeout: 20_000 }),
            page.waitForTimeout(20_000),
          ]);
        } catch {
          // Continue with whatever we have
        }

        // Small extra wait to ensure AJAX response is fully processed
        await page.waitForTimeout(2_000);

        // ── Parse captured AJAX data ──────────────────────────────────
        if (capturedDocs.length > 0) {
          logger.info('Stage2A', `"${searchName}" captured ${capturedDocs.length} documents via AJAX intercept`);

          for (const doc of capturedDocs) {
            // Handle multiple field name conventions across Tyler/Kofile versions
            const instrNum = String(doc.docNumber ?? doc.instrumentNumber ?? doc.documentNumber ?? doc.number ?? '').trim();
            const docType = String(doc.docType ?? doc.docTypeCode ?? doc.documentType ?? doc.typeCode ?? doc.type ?? '').trim();
            const recDate = String(doc.recordedDate ?? doc.recordedDateStr ?? doc.recordingDate ?? doc.filingDate ?? doc.date ?? '').trim();

            // Parse parties from Kofile's party array
            const grantors: string[] = [];
            const grantees: string[] = [];
            if (Array.isArray(doc.parties)) {
              for (const party of doc.parties) {
                const name = String(party.name ?? '').trim();
                if (!name) continue;
                const role = String(party.type ?? party.role ?? '').toLowerCase();
                if (role.includes('grantor') || role.includes('from') || role.includes('seller') || role === '1') {
                  grantors.push(name);
                } else if (role.includes('grantee') || role.includes('to') || role.includes('buyer') || role === '2') {
                  grantees.push(name);
                }
              }
            }
            if (grantors.length === 0 && Array.isArray(doc.grantors)) {
              grantors.push(...doc.grantors.map(String));
            }
            if (grantees.length === 0 && Array.isArray(doc.grantees)) {
              grantees.push(...doc.grantees.map(String));
            }

            // Build document detail URL — prefer doc.id (internal ID used in /doc/{id})
            // over instrNum (instrument number like 2024046480 which is NOT the URL ID)
            const docId = String(doc.id ?? '').trim() || instrNum;
            const docUrl = docId ? `${baseUrl}/doc/${docId}` : null;

            documents.push({
              instrumentNumber: instrNum || null,
              volume: doc.bookNumber ? String(doc.bookNumber) : null,
              page: doc.pageNumber ? String(doc.pageNumber) : null,
              documentType: docType || 'Unknown',
              recordingDate: recDate || null,
              grantors,
              grantees,
              source: config.name,
              url: docUrl,
            });
          }
          // Remove the response listener before continuing
          page.removeAllListeners('response');
          break; // Got results via AJAX
        }

        // ── Fallback: Parse from Redux store in window.__data ────────
        // Wait a bit extra for the store to be populated by async fetch
        await page.waitForTimeout(3_000);

        const storeExtracted = await page.evaluate((bUrl: string) => {
          const docs: Array<{
            type: string;
            date: string;
            instrumentNumber: string;
            volume: string;
            docPage: string;
            grantors: string[];
            grantees: string[];
            url: string | null;
          }> = [];

          // Helper to extract docs from a byHash object
          const extractFromByHash = (byHash: Record<string, any>) => {
            for (const docKey of Object.keys(byHash)) {
              const d = byHash[docKey];
              if (!d || typeof d !== 'object') continue;
              const instrNum = String(d.docNumber ?? d.instrumentNumber ?? d.documentNumber ?? d.number ?? '').trim();
              const docType = String(d.docType ?? d.docTypeCode ?? d.documentType ?? d.typeCode ?? d.type ?? '').trim();
              const recDate = String(d.recordedDate ?? d.recordedDateStr ?? d.recordingDate ?? d.filingDate ?? d.date ?? '').trim();

              const grantors: string[] = [];
              const grantees: string[] = [];
              if (Array.isArray(d.parties)) {
                for (const party of d.parties) {
                  const name = String(party.name ?? '').trim();
                  if (!name) continue;
                  const role = String(party.type ?? party.role ?? '').toLowerCase();
                  if (role.includes('grantor') || role.includes('from') || role === '1') {
                    grantors.push(name);
                  } else {
                    grantees.push(name);
                  }
                }
              }

              // Prefer d.id (internal doc ID) or docKey (byHash key) for URL
              const docIdForUrl = String(d.id ?? '').trim() || docKey;
              const docUrl = docIdForUrl ? `${bUrl}/doc/${docIdForUrl}` : null;
              docs.push({
                type: docType || 'Unknown',
                date: recDate,
                instrumentNumber: instrNum,
                volume: String(d.bookNumber ?? ''),
                docPage: String(d.pageNumber ?? ''),
                grantors,
                grantees,
                url: docUrl,
              });
            }
          };

          // Try to read document data from the Redux store (window.__data)
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const appData = (window as any).__data;
            if (!appData) return docs;

            // Path 1: documents.workspaces.*.data.byHash (original Kofile)
            if (appData.documents?.workspaces) {
              const workspaces = appData.documents.workspaces;
              for (const wsKey of Object.keys(workspaces)) {
                const ws = workspaces[wsKey];
                const byHash = ws?.data?.byHash;
                if (byHash && typeof byHash === 'object' && Object.keys(byHash).length > 0) {
                  extractFromByHash(byHash);
                }
              }
            }

            // Path 2: workspaces.*.data.byHash (without documents prefix)
            if (docs.length === 0 && appData.workspaces) {
              for (const wsKey of Object.keys(appData.workspaces)) {
                const ws = appData.workspaces[wsKey];
                const byHash = ws?.data?.byHash;
                if (byHash && typeof byHash === 'object' && Object.keys(byHash).length > 0) {
                  extractFromByHash(byHash);
                }
              }
            }

            // Path 3: Try reading from the live Redux store if available
            if (docs.length === 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const store = (window as any).__REDUX_STORE__ ?? (window as any).__store__ ?? (window as any).store;
              if (store?.getState) {
                const state = store.getState();
                const storeWorkspaces = state?.documents?.workspaces ?? state?.workspaces;
                if (storeWorkspaces) {
                  for (const wsKey of Object.keys(storeWorkspaces)) {
                    const ws = storeWorkspaces[wsKey];
                    const byHash = ws?.data?.byHash;
                    if (byHash && typeof byHash === 'object' && Object.keys(byHash).length > 0) {
                      extractFromByHash(byHash);
                    }
                  }
                }
              }
            }
          } catch { /* window.__data not available or parsing failed */ }

          return docs;
        }, baseUrl);

        if (storeExtracted.length > 0) {
          logger.info('Stage2A', `"${searchName}" extracted ${storeExtracted.length} documents from Redux store`);
          for (const doc of storeExtracted) {
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
          page.removeAllListeners('response');
          break;
        }

        // ── Fallback: DOM scraping (original approach, improved) ─────
        // Check for "no results"
        const noResults = await page.evaluate(() => {
          const text = document.body.textContent?.toLowerCase() ?? '';
          return text.includes('no results') || text.includes('no records found') || text.includes('0 results') || text.includes('no documents');
        });

        if (noResults) {
          logger.info('Stage2A', `"${searchName}" returned no results — trying next variant`);
          page.removeAllListeners('response');
          continue;
        }

        // Extra wait for Tyler PublicSearch React SPA to finish rendering
        await page.waitForTimeout(3_000);

        // DOM extraction: Tyler PublicSearch uses a standard <table> with
        // column classes col-0 through col-9. Document ID is embedded in the
        // checkbox input as id="table-checkbox-{docId}".
        // Column mapping (from actual HTML inspection):
        //   col-0: checkbox (contains document ID)
        //   col-1: action menu
        //   col-2: cart icon
        //   col-3: Grantor    col-4: Grantee     col-5: Doc Type
        //   col-6: Rec Date   col-7: Inst Number  col-8: Book/Vol/Page
        //   col-9: Property Description
        // ── DOM extraction (fallback when API intercept missed data) ───────
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

          // ── Strategy A: Tyler PublicSearch table with col-N classes ──
          // Only select result rows (aria-selected attribute); skips header/footer <th> rows.
          const tableRows = document.querySelectorAll('table tbody tr[aria-selected]');
          if (tableRows.length > 0) {
            tableRows.forEach((row) => {
              // Extract document ID from checkbox input
              const checkbox = row.querySelector('input[id^="table-checkbox-"]') as HTMLInputElement | null;
              const docId = checkbox?.id?.replace('table-checkbox-', '') ?? '';

              // Extract by column class (most reliable)
              const getCol = (n: number): string => {
                const cell = row.querySelector(`td.col-${n}, td:nth-child(${n + 1})`);
                return cell?.textContent?.trim() ?? '';
              };

              const grantor = getCol(3);
              const grantee = getCol(4);
              const docType = getCol(5);
              const recDate = getCol(6);
              const instrNum = getCol(7);
              const bookVolPage = getCol(8);
              // Strip Tyler's "Property Description: " label prefix from col-9
              const propDesc = getCol(9).replace(/^Property Description:\s*/i, '');

              // Parse volume/page from "OPR/13355/58" format
              let volume = '';
              let pg = '';
              const bvpMatch = bookVolPage.match(/(?:OPR\/)?(\d+)\/(\d+)/);
              if (bvpMatch) { volume = bvpMatch[1]; pg = bvpMatch[2]; }

              // Construct detail URL from document ID (Tyler uses /doc/{docId})
              let url: string | null = null;
              if (docId) {
                url = `${bUrl}/doc/${docId}`;
              }

              // Only push if we have meaningful data
              if (instrNum || docType || docId) {
                docs.push({
                  type: docType || 'Unknown',
                  date: recDate,
                  instrumentNumber: instrNum || docId,
                  volume,
                  docPage: pg,
                  grantors: grantor ? [grantor] : [],
                  grantees: grantee ? [grantee] : [],
                  url,
                  text: [grantor, grantee, docType, recDate, instrNum, bookVolPage, propDesc]
                    .filter(Boolean).join(' | ').substring(0, 500),
                });
              }
            });
            return docs;
          }

          // ── Strategy B: Fallback generic extraction for non-Tyler sites ──
          // Helper: build an absolute URL from a possibly-relative href
          const toAbsolute = (href: string): string =>
            href.startsWith('http') ? href : `${bUrl}${href.startsWith('/') ? '' : '/'}${href}`;

          const resultItems = document.querySelectorAll(
            '.result-item, .result-row, .search-result, .document-result, ' +
            '.document-row, [class*="result-row"], [class*="ResultRow"]',
          );
          let resultElements: Element[] = Array.from(resultItems);
          if (resultElements.length === 0) {
            const detailLinks = document.querySelectorAll(
              'a[href*="/doc/"], a[href*="/detail/"], a[href*="/document/"]',
            );
            detailLinks.forEach((link) => {
              const parent = link.closest('tr, [role="row"], [class*="result"], [class*="card"]') ?? link.parentElement?.parentElement ?? link.parentElement;
              if (parent && !resultElements.includes(parent)) {
                resultElements.push(parent);
              }
            });
          }

          const typePatterns = [
            /(?:Type|Document Type|Doc Type)\s*:?\s*([^\n|]+)/i,
            /\b(Warranty Deed|Special Warranty Deed|General Warranty Deed|Deed Without Warranty|Plat|Amended Plat|Easement|Right[- ]of[- ]Way|Quit Claim|Deed of Trust|Release|Mineral Deed|Affidavit|Restriction|Covenant)\b/i,
          ];
          const datePatterns = [
            /(?:Date|Recorded|Filed|Recording Date)\s*:?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
            /(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})/,
          ];
          const instrPatterns = [
            /(?:Instrument|Inst\.?\s*#?|Document\s*#?|Doc\.?\s*#?)\s*:?\s*([\d\-]+)/i,
            /\b(\d{4}-\d{5,})\b/,
            /\b(\d{9,})\b/,
          ];
          const volPatterns = [/(?:Volume|Vol\.?|Book)\s*:?\s*(\d+)/i];
          const pgPatterns = [/(?:Page|Pg\.?)\s*:?\s*(\d+)/i];
          const grantorPatterns = [/(?:Grantor|From|Seller)\s*:?\s*([^\n|;]+)/i];
          const granteePatterns = [/(?:Grantee|To|Buyer)\s*:?\s*([^\n|;]+)/i];

          const findMatch = (patterns: RegExp[], source: string): string => {
            for (const p of patterns) {
              const m = source.match(p);
              if (m) return (m[1] ?? m[0]).trim();
            }
            return '';
          };

          resultElements.forEach((row) => {
            const text = row.textContent?.trim() ?? '';
            if (text.length < 10) return;

            let url: string | null = null;
            let hrefInstrument = '';
            const rowLinks = Array.from(row.querySelectorAll('a'));
            for (const link of rowLinks) {
              const href = link.getAttribute('href') ?? '';
              const docMatch = href.match(/\/doc\/([^/]+)(?:\/details)?/i);
              if (docMatch) {
                url = toAbsolute(href.includes('/details') ? href : `${href}/details`);
                hrefInstrument = docMatch[1];
                break;
              }
              if (href.includes('/details') || href.includes('/document') || href.includes('/view') || href.match(/\/[\d]{4,}/)) {
                url = toAbsolute(href);
                break;
              }
            }
            if (!url && rowLinks.length > 0) {
              for (const link of rowLinks) {
                const href = link.getAttribute('href') ?? '';
                if (!href.includes('results') && !href.includes('filter') && !href.includes('#') && href.length > 5) {
                  url = toAbsolute(href);
                  break;
                }
              }
            }

            const dataId = (row as HTMLElement).dataset?.id
              ?? (row as HTMLElement).dataset?.documentId
              ?? (row as HTMLElement).dataset?.instrumentNumber
              ?? '';
            if (!url && dataId) {
              url = `${bUrl}/doc/${dataId}/details`;
            }

            const instrumentNumber = hrefInstrument || findMatch(instrPatterns, text) || dataId || '';
            docs.push({
              type: findMatch(typePatterns, text) || 'Unknown',
              date: findMatch(datePatterns, text),
              instrumentNumber,
              volume: findMatch(volPatterns, text),
              docPage: findMatch(pgPatterns, text),
              grantors: findMatch(grantorPatterns, text) ? [findMatch(grantorPatterns, text)] : [],
              grantees: findMatch(granteePatterns, text) ? [findMatch(granteePatterns, text)] : [],
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
          logger.info('Stage2A', `"${searchName}" found ${extracted.length} documents via DOM (page 1)`);

          // ── URL-based multi-page fetching ─────────────────────────────────
          // Tyler uses ?offset=N for pagination (confirmed from HTML: nav.Pagination
          // with button[aria-label="page N"] buttons, offset = (page-1)*50)
          const totalPages = await page.evaluate(() =>
            document.querySelectorAll('nav.Pagination button[aria-label^="page "]').length,
          );

          if (totalPages > 1) {
            logger.info('Stage2A', `"${searchName}": ${totalPages} pages total — fetching via URL offsets`);
            for (let pg = 2; pg <= Math.min(totalPages, 5); pg++) {
              try {
                apiCapture = [];
                const pageUrl = buildTylerUrl(baseUrl, searchName, (pg - 1) * 50);
                logger.info('Stage2A', `Loading page ${pg}/${totalPages}: offset=${(pg - 1) * 50}`);
                await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
                try {
                  await page.waitForSelector('table tbody tr[aria-selected]', { timeout: 15_000 });
                } catch {
                  logger.info('Stage2A', `Page ${pg}: no result rows — stopping pagination`);
                  break;
                }
                await page.waitForTimeout(1_000);

                // Prefer AJAX-intercepted data for this page
                if (apiCapture.length > 0) {
                  documents = [...documents, ...apiCapture];
                  logger.info('Stage2A', `Page ${pg}: +${apiCapture.length} docs via AJAX`);
                } else {
                  const pageExtracted = await page.evaluate((bUrl: string) => {
                    const pageDocs: Array<{
                      type: string; date: string; instrumentNumber: string;
                      volume: string; docPage: string; grantors: string[];
                      grantees: string[]; url: string | null;
                    }> = [];
                    document.querySelectorAll('table tbody tr[aria-selected]').forEach((row) => {
                      const checkbox = row.querySelector('input[id^="table-checkbox-"]') as HTMLInputElement | null;
                      const docId = checkbox?.id?.replace('table-checkbox-', '') ?? '';
                      const getC = (n: number): string =>
                        (row.querySelector(`td.col-${n}`)?.textContent?.trim() ?? '');
                      const instrNum = getC(7);
                      const docType = getC(5);
                      if (!instrNum && !docType && !docId) return;
                      const bvp = getC(8);
                      const bvpMatch = bvp.match(/(?:OPR\/)?(\d+)\/(\d+)/);
                      pageDocs.push({
                        type: docType || 'Unknown',
                        date: getC(6),
                        instrumentNumber: instrNum || docId,
                        volume: bvpMatch ? bvpMatch[1] : '',
                        docPage: bvpMatch ? bvpMatch[2] : '',
                        grantors: getC(3) ? [getC(3)] : [],
                        grantees: getC(4) ? [getC(4)] : [],
                        url: docId ? `${bUrl}/doc/${docId}` : null,
                      });
                    });
                    return pageDocs;
                  }, baseUrl);
                  for (const doc of pageExtracted) {
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
                  logger.info('Stage2A', `Page ${pg}: +${pageExtracted.length} docs via DOM`);
                }
              } catch { break; }
            }
          }

          page.removeAllListeners('response');
          break; // Got results for this name variant
        }

        // ── Last resort: Log diagnostic info about what the DOM contains ──
        const diagnostic = await page.evaluate(() => {
          const tableRows = document.querySelectorAll('table tbody tr');
          const checkboxes = document.querySelectorAll('input[id^="table-checkbox-"]');
          const allElements = document.querySelectorAll('[class*="result"], [class*="card"], [class*="document"], a[href*="/doc"]');
          const sampleTexts: string[] = [];
          const sampleLinks: string[] = [];
          // Show first table row structure for debugging
          if (tableRows.length > 0) {
            const firstRow = tableRows[0];
            const cells = firstRow.querySelectorAll('td');
            cells.forEach((cell, idx) => {
              const cls = cell.className;
              const txt = (cell.textContent ?? '').trim().substring(0, 80);
              sampleTexts.push(`td[${idx}] class="${cls}" text="${txt}"`);
            });
          }
          let i = 0;
          allElements.forEach((el) => {
            if (i >= 3) return;
            const text = (el.textContent ?? '').trim().substring(0, 300);
            if (text.length > 20) { sampleTexts.push(text); i++; }
            const href = el.getAttribute('href');
            if (href) sampleLinks.push(href);
          });
          // Also get all unique href patterns
          const allLinks = Array.from(document.querySelectorAll('a[href]'));
          const hrefPatterns = new Set<string>();
          allLinks.forEach((a) => {
            const href = a.getAttribute('href') ?? '';
            // Generalize: replace numbers with {N}
            const pattern = href.replace(/\d{4,}/g, '{N}');
            if (pattern.length > 3 && !pattern.includes('google') && !pattern.includes('analytics')) {
              hrefPatterns.add(pattern);
            }
          });
          return {
            elementCount: allElements.length,
            tableRowCount: tableRows.length,
            checkboxCount: checkboxes.length,
            sampleTexts,
            sampleLinks: sampleLinks.slice(0, 5),
            hrefPatterns: Array.from(hrefPatterns).slice(0, 10),
            bodyTextLength: document.body.textContent?.length ?? 0,
          };
        });
        // Check for pagination — try to get more results via API intercept or DOM
        // (URL-based pagination is handled above after a successful DOM extraction)
        logger.info('Stage2A', `DOM diagnostic: ${diagnostic.elementCount} candidate elements, ${diagnostic.tableRowCount} table rows, ${diagnostic.checkboxCount} checkboxes, body text length: ${diagnostic.bodyTextLength}`);
        if (diagnostic.sampleTexts.length > 0) {
          logger.info('Stage2A', `Sample text[0]: ${diagnostic.sampleTexts[0]?.substring(0, 200)}`);
        }
        if (diagnostic.hrefPatterns.length > 0) {
          logger.info('Stage2A', `Link patterns: ${diagnostic.hrefPatterns.join(' | ')}`);
        }

        page.removeAllListeners('response');
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

    tracker.step(`Found ${documents.length} total documents, ${relevant.length} deed-relevant, fetching top ${toFetch.length}`);
    tracker({
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
          // Skip documents with broken/invalid URLs that returned no content
          if (!fetched.urlValid && !fetched.textContent && !fetched.imageBase64 && fetched.pageScreenshots.length === 0) {
            logger.info('Stage2B', `Skipping doc with broken URL: ${fetched.ref.url ?? 'no-url'}`);
            continue;
          }
          // Clear broken URLs so they don't appear in results
          if (!fetched.urlValid) {
            fetched.ref.url = null;
          }
          results.push({
            ref: fetched.ref,
            textContent: fetched.textContent,
            imageBase64: fetched.imageBase64,
            imageFormat: fetched.imageFormat,
            ocrText: null,
            extractedData: null,
            processingErrors: fetched.processingErrors,
            pageScreenshots: fetched.pageScreenshots.length > 0 ? fetched.pageScreenshots : undefined,
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
    tracker({ status: 'fail', error: errMsg });
    logger.error('Stage2', `Clerk search failed: ${errMsg}`, err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KOFILE IMAGE INTERCEPTION — proven working (Ash Trust, March 4, 2026)
// These functions intercept signed PNG URLs from the document viewer network
// traffic instead of taking screenshots. This yields full-resolution originals.
// ─────────────────────────────────────────────────────────────────────────────

const BELL_CLERK_BASE = 'https://bell.tx.publicsearch.us';

/**
 * Search Bell County clerk records by owner name.
 * Uses direct URL parameters rather than form interaction.
 */
export async function searchBellClerk(
  ownerName: string,
  logger: PipelineLogger,
): Promise<DocumentRef[]> {
  let browser: import('playwright').Browser | null = null;
  const attempt = logger.attempt('2A', BELL_CLERK_BASE, 'PLAYWRIGHT_SEARCH', ownerName);

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    const nameParts = _parseOwnerName(ownerName);
    console.log('[BELL-CLERK] Searching for:', nameParts.searchQuery);

    // Use correct Tyler PublicSearch URL parameters (verified from actual HTML, March 2026)
    const d0 = new Date();
    const dateTo0 = `${d0.getFullYear()}${String(d0.getMonth() + 1).padStart(2, '0')}${String(d0.getDate()).padStart(2, '0')}`;
    const buildBellUrl = (offset: number): string =>
      `${BELL_CLERK_BASE}/results?department=RP&keywordSearch=false&limit=50&offset=${offset}` +
      `&recordedDateRange=16000101%2C${dateTo0}&searchOcrText=true&searchType=quickSearch` +
      `&searchValue=${encodeURIComponent(nameParts.searchQuery)}`;

    await page.goto(buildBellUrl(0), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // Wait for Tyler SPA to render result rows
    try {
      await page.waitForSelector('table tbody tr[aria-selected]', { timeout: 15_000 });
    } catch { /* continue even if no rows yet */ }
    await page.waitForTimeout(2_000);

    // Accept disclaimers if present
    try {
      const btn = await page.$('button:has-text("Accept"), button:has-text("OK"), button:has-text("I Agree"), button:has-text("Continue")');
      if (btn) { await btn.click(); await page.waitForTimeout(1000); }
    } catch { /* no dialog */ }

    let documents = await _extractSearchResults(page);

    // URL-based multi-page fetching (Tyler uses offset= for pagination)
    const totalBellPages = await page.evaluate(() =>
      document.querySelectorAll('nav.Pagination button[aria-label^="page "]').length,
    );
    if (totalBellPages > 1) {
      for (let pg = 2; pg <= Math.min(totalBellPages, 5); pg++) {
        try {
          await page.goto(buildBellUrl((pg - 1) * 50), { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await page.waitForSelector('table tbody tr[aria-selected]', { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1_000);
          const more = await _extractSearchResults(page);
          documents = [...documents, ...more];
          logger.info('Stage2A', `searchBellClerk page ${pg}: +${more.length} docs`);
        } catch { break; }
      }
    }

    await browser.close();

    if (documents.length > 0) {
      attempt.success(documents.length, `Found ${documents.length} records`);
    } else {
      attempt.fail('No deed/plat records found');
    }
    return documents;
  } catch (err: any) {
    console.error('[BELL-CLERK] Search failed:', err.message);
    if (browser) await browser.close().catch(() => {});
    attempt.fail(err.message);
    return [];
  }
}

/**
 * Search Bell County clerk by instrument number.
 */
export async function searchByInstrument(
  instrumentNumber: string,
  logger: PipelineLogger,
): Promise<DocumentRef | null> {
  let browser: import('playwright').Browser | null = null;
  const attempt = logger.attempt('2A-INST', BELL_CLERK_BASE, 'PLAYWRIGHT_INST', instrumentNumber);

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    const searchUrl = `${BELL_CLERK_BASE}/results?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(instrumentNumber)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);

    const documents = await _extractSearchResults(page);
    await browser.close();

    if (documents.length > 0) {
      attempt.success(1, `Found instrument ${instrumentNumber}`);
      return documents[0];
    }

    attempt.fail(`Instrument ${instrumentNumber} not found`);
    return null;
  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    attempt.fail(err.message);
    return null;
  }
}

/**
 * Download all page images for a document by intercepting signed image URLs.
 *
 * KEY TECHNIQUE: page.on('response') captures signed image URLs from
 * /files/documents/ paths as the Kofile viewer loads each page.
 * Then we download each image directly using the signed URL.
 *
 * This avoids screenshot latency and gets the full-resolution originals.
 * Navigates directly to the document detail page (/doc/{id}/details) rather
 * than the old search-then-click approach (saves ~16 seconds per document).
 */
export async function fetchDocumentImages(
  instrumentNumber: string,
  expectedPages: number,
  logger: PipelineLogger,
): Promise<DocumentPage[]> {
  let browser: import('playwright').Browser | null = null;
  const attempt = logger.attempt('2D-IMG', BELL_CLERK_BASE, 'PLAYWRIGHT_IMAGES', instrumentNumber);
  const pages: DocumentPage[] = [];

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    // Intercept signed image URLs from the Kofile viewer
    const imageUrls: string[] = [];
    page.on('response', (res) => {
      const url = res.url();
      // Match Kofile signed document image URLs (PNG, JPG, TIFF)
      if (
        (url.includes('/files/documents/') || url.includes('/documents/files/')) &&
        /\.(png|jpe?g|tiff?)(\?|$)/i.test(url)
      ) {
        imageUrls.push(url);
        console.log(`[BELL-IMG] Captured: ${url.substring(0, 100)}...`);
      }
    });

    // Navigate directly to the document viewer page (avoids search+click overhead)
    const viewerUrl = `${BELL_CLERK_BASE}/doc/${encodeURIComponent(instrumentNumber)}/details`;
    console.log(`[BELL-IMG] Navigating directly to viewer: ${viewerUrl}`);
    try {
      await page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 45_000 });
    } catch {
      // networkidle timeout is acceptable — images may still be loading
      await page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(5_000);
    }

    // Wait up to 10 seconds for at least one image URL to appear
    const imageWaitDeadline = Date.now() + 10_000;
    while (imageUrls.length === 0 && Date.now() < imageWaitDeadline) {
      await page.waitForTimeout(500);
    }

    console.log(`[BELL-IMG] After viewer load: ${imageUrls.length} URLs captured`);

    // Fallback: if direct viewer didn't capture images, try search+click (legacy approach)
    if (imageUrls.length === 0) {
      console.log('[BELL-IMG] Direct viewer captured no images — falling back to search+click');
      const searchUrl = `${BELL_CLERK_BASE}/results?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(instrumentNumber)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(5_000);
      try {
        await page.locator('tbody tr').first().click();
        await page.waitForTimeout(6_000);
      } catch (e: any) {
        console.log('[BELL-IMG] Search+click fallback: could not click result:', e.message);
      }
    }

    // ── Helper: detect image format from URL extension ────────────────────
    const detectFormat = (url: string): 'png' | 'jpg' | 'tiff' => {
      if (/\.jpe?g(\?|$)/i.test(url)) return 'jpg';
      if (/\.tiff?(\?|$)/i.test(url)) return 'tiff';
      return 'png';
    };

    // ── Helper: download one image URL and push to pages array ────────────
    const downloadPage = async (imgUrl: string, pageNum: number): Promise<boolean> => {
      try {
        const resp = await page.context().request.get(imgUrl);
        if (resp.ok()) {
          const buf = await resp.body();
          pages.push({
            pageNumber: pageNum,
            imageBase64: buf.toString('base64'),
            imageFormat: detectFormat(imgUrl),
            width: 0,
            height: 0,
            signedUrl: imgUrl,
          });
          console.log(`[BELL-IMG] Page ${pageNum}: ${buf.length} bytes (${detectFormat(imgUrl)})`);
          return true;
        }
      } catch (e: any) {
        console.log(`[BELL-IMG] Page ${pageNum} download failed: ${e.message}`);
      }
      return false;
    };

    // Download page 1
    if (imageUrls.length > 0) {
      await downloadPage(imageUrls[imageUrls.length - 1], 1);
    }

    // Navigate to subsequent pages using the next-page button
    for (let pageNum = 2; pageNum <= Math.min(expectedPages, 10); pageNum++) {
      const urlCountBefore = imageUrls.length;

      const nextSelectors = [
        'img[alt*="Next"]', 'img[alt*="next"]', 'button[title*="Next"]',
        'a[title*="Next"]', 'img[src*="jump_triangle"]', '.page-next',
        '[aria-label*="next" i]',
      ];

      let clicked = false;
      for (const sel of nextSelectors) {
        try {
          const btns = await page.$$(sel);
          const btn = btns.length > 1 ? btns[btns.length - 1] : btns[0];
          if (btn) { await btn.click(); clicked = true; break; }
        } catch { /* try next */ }
      }

      if (!clicked) {
        console.log(`[BELL-IMG] No next-page button for page ${pageNum}`);
        break;
      }

      await page.waitForTimeout(5_000);

      if (imageUrls.length > urlCountBefore) {
        await downloadPage(imageUrls[imageUrls.length - 1], pageNum);
      } else if (imageUrls.length > 0) {
        // Construct URL for this page by replacing the page number in the seed URL
        // Handles both _1.png and _1.jpg patterns
        const seedUrl = imageUrls[0];
        const constructedUrl = seedUrl.replace(/_1\.(png|jpe?g|tiff?)/i, `_${pageNum}.$1`);
        if (constructedUrl !== seedUrl) {
          const ok = await downloadPage(constructedUrl, pageNum);
          if (!ok) console.log(`[BELL-IMG] Page ${pageNum} constructed URL failed`);
        }
      }
    }

    page.removeAllListeners('response');
    await browser.close();

    if (pages.length > 0) {
      attempt.success(pages.length, `Downloaded ${pages.length} page images`);
    } else {
      attempt.fail('No page images captured');
    }
    return pages;
  } catch (err: any) {
    console.error('[BELL-IMG] Image fetch failed:', err.message);
    if (browser) await browser.close().catch(() => {});
    attempt.fail(err.message);
    return [];
  }
}

/**
 * Save page images to disk (for debugging / archival).
 */
export function savePageImages(
  pages: DocumentPage[],
  outputDir: string,
  prefix: string,
): string[] {
  const paths: string[] = [];
  for (const p of pages) {
    const fname = `${outputDir}/${prefix}_p${p.pageNumber}.png`;
    fs.writeFileSync(fname, Buffer.from(p.imageBase64, 'base64'));
    paths.push(fname);
    console.log(`[SAVE] ${fname} (${Math.round(p.imageBase64.length * 0.75 / 1024)}KB)`);
  }
  return paths;
}

// ── Helpers (private to this module section) ──────────────────────────────

async function _extractSearchResults(
  page: import('playwright').Page,
): Promise<DocumentRef[]> {
  const documents: DocumentRef[] = [];
  const rows = await page.$$('table tbody tr[aria-selected], .result-row, .search-result');

  for (const row of rows) {
    try {
      const text = await row.textContent() || '';
      if (text.toLowerCase().includes('recording date') && text.toLowerCase().includes('document type')) continue;

      // Tyler PublicSearch: extract from table columns by class
      const checkbox = await row.$('input[id^="table-checkbox-"]');
      const docId = checkbox ? (await checkbox.getAttribute('id'))?.replace('table-checkbox-', '') ?? '' : '';
      const getColText = async (n: number): Promise<string> => {
        const cell = await row.$(`td.col-${n}, td:nth-child(${n + 1})`);
        return cell ? ((await cell.textContent()) ?? '').trim() : '';
      };
      const colDocType = await getColText(5);
      const colInstr = await getColText(7);

      if (colDocType || colInstr) {
        // Structured Tyler table row
        const colDate = await getColText(6);
        const colBVP = await getColText(8);
        const colGrantor = await getColText(3);
        const colGrantee = await getColText(4);
        let volume = '';
        let pg = '';
        const bvpMatch = colBVP.match(/(?:OPR\/)?(\d+)\/(\d+)/);
        if (bvpMatch) { volume = bvpMatch[1]; pg = bvpMatch[2]; }

        documents.push({
          instrumentNumber: colInstr || null,
          volume: volume || null,
          page: pg || null,
          documentType: colDocType || 'Unknown',
          recordingDate: colDate || null,
          grantors: colGrantor ? [colGrantor] : [],
          grantees: colGrantee ? [colGrantee] : [],
          source: 'Bell County Clerk PublicSearch',
          url: docId ? `${BELL_CLERK_BASE}/doc/${docId}` : null,
        });
        continue;
      }

      // Fallback: parse from text content
      const doc = _parseDocumentRow(text);
      if (doc) {
        const link = await row.$('a[href]');
        if (link) {
          const href = await link.getAttribute('href');
          if (href) doc.url = href.startsWith('http') ? href : BELL_CLERK_BASE + href;
        }
        if (!doc.url && docId) {
          doc.url = `${BELL_CLERK_BASE}/doc/${docId}`;
        }
        documents.push(doc);
      }
    } catch { /* skip */ }
  }

  return documents.filter(d => /deed|warranty|plat|conveyance/i.test(d.documentType));
}

function _parseDocumentRow(text: string): DocumentRef | null {
  const typeMatch = text.match(
    /(Warranty Deed|Special Warranty Deed|General Warranty Deed|Deed Without Warranty|Deed of Trust|Plat|Plat Amended|Quit Claim|Transfer)/i,
  );
  if (!typeMatch) return null;

  const dateMatch   = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  const instrMatch  = text.match(/(?:Inst(?:rument)?|Doc)[\s#:]*(\d{6,})/i) || text.match(/(\d{10,})/);
  const volPageMatch = text.match(/Vol(?:ume)?[\s.]*(\d+)[\s,]*(?:Pg|Page)[\s.]*(\d+)/i);
  const grantorMatch = text.match(/(?:Grantor|From)[\s:]*([^,\n]+)/i);
  const granteeMatch = text.match(/(?:Grantee|To)[\s:]*([^,\n]+)/i);

  return {
    instrumentNumber: instrMatch ? instrMatch[1] : null,
    volume:           volPageMatch ? volPageMatch[1] : null,
    page:             volPageMatch ? volPageMatch[2] : null,
    documentType:     typeMatch[1],
    recordingDate:    dateMatch ? dateMatch[1] : null,
    grantors:         grantorMatch ? [grantorMatch[1].trim()] : [],
    grantees:         granteeMatch ? [granteeMatch[1].trim()] : [],
    source:           'Bell County Clerk PublicSearch',
    url:              null,
  };
}

function _parseOwnerName(name: string): { lastName: string; firstName: string; searchQuery: string } {
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    return { lastName: last, firstName: first, searchQuery: `${last}, ${first}` };
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const last  = parts[parts.length - 1];
    const first = parts.slice(0, -1).join(' ');
    return { lastName: last, firstName: first, searchQuery: `${last}, ${first}` };
  }
  return { lastName: name, firstName: '', searchQuery: name };
}
