// worker/src/services/texas-digital-archive-client.ts — Phase 6 §6.7
// Texas State Library Digital Archive — TxDOT ROW records search.
//
// Provides historical ROW maps, acquisition records, and conveyance documents.
// Results may be sparse (many rural records not yet digitized).
//
// NOTES:
//   - Playwright (chromium) must be installed: npx playwright install chromium
//   - Returns empty result on any failure — never throws
//   - Many Bell County rural roads have no digitized archive records
//   - Max wait: 45 seconds for initial page load, 5 seconds after search
//
// Spec §6.7

import * as path from 'path';
import type { PipelineLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArchiveRecord {
  /** Human-readable title of the scanned record */
  title: string;
  /** CSJ or document control number extracted from title/description */
  controlNumber: string;
  /** TxDOT district (e.g., "Waco", "Austin") */
  district: string;
  /** Highway name (e.g., "FM 436") */
  highway: string;
  /** County name */
  county: string;
  /** Date range of the record (e.g., "1952-1955") */
  dateRange?: string;
  /** URL to thumbnail image, if available */
  thumbnailUrl?: string;
  /** URL to download the full document, if available */
  downloadUrl?: string;
  /** Record type classified from title keywords */
  type: 'map' | 'conveyance' | 'title' | 'other';
}

export interface DigitalArchiveResult {
  /** Number of records found */
  recordsFound: number;
  records: ArchiveRecord[];
  /** The URL that was searched */
  searchUrl: string;
  /** True if the search was attempted, false if skipped or Playwright unavailable */
  attempted: boolean;
  /** Error message if the search failed, null otherwise */
  error: string | null;
}

// ── TexasDigitalArchiveClient ─────────────────────────────────────────────────

/**
 * Playwright client for the Texas State Library Digital Archive (TDA).
 * Searches the TxDOT ROW records section for historical road maps and
 * conveyance documents.
 *
 * @example
 *   const client = new TexasDigitalArchiveClient();
 *   const result = await client.searchROWRecords('FM 436', 'Bell', 'Waco', logger);
 */
export class TexasDigitalArchiveClient {
  /**
   * Base URL for the Texas State Library Digital Archive TxDOT ROW section.
   * Configurable via `TDA_ROW_BASE_URL` environment variable to allow URL
   * updates without code changes if TDA restructures their system.
   * NOTE: Verify this URL against the live TDA site before first use.
   */
  private readonly archiveBaseUrl: string;

  constructor() {
    this.archiveBaseUrl =
      process.env.TDA_ROW_BASE_URL ??
      'https://tsl.access.preservica.com/tda/reference-tools/txdot-row/';
  }

  /**
   * Search the Texas State Library digital archive for TxDOT ROW records.
   *
   * @param highway   Highway name (e.g., "FM 436", "SH 195")
   * @param county    County name (e.g., "Bell")
   * @param district  TxDOT district (optional filter, e.g., "Waco")
   * @param logger    Optional pipeline logger
   * @returns         DigitalArchiveResult with records found (empty if none/failure)
   */
  async searchROWRecords(
    highway: string,
    county: string,
    district?: string,
    logger?: PipelineLogger,
  ): Promise<DigitalArchiveResult> {
    const searchUrl = this.buildSearchUrl(highway, county, district);
    const emptyResult: DigitalArchiveResult = {
      recordsFound: 0,
      records: [],
      searchUrl,
      attempted: false,
      error: null,
    };

    // Dynamically import Playwright — return empty if not installed
    let chromium: typeof import('playwright')['chromium'];
    try {
      const playwright = await import('playwright');
      chromium = playwright.chromium;
    } catch {
      logger?.warn(
        'TxDOT-Archive',
        'Playwright not installed — skipping Texas Digital Archive search. Run: npx playwright install chromium',
      );
      return { ...emptyResult, error: 'Playwright not installed' };
    }

    logger?.info('TxDOT-Archive', `Searching TDA for: highway="${highway}", county="${county}"`);

    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Navigate to the archive with a 45-second timeout for initial load
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {
        // If exact URL fails, try base URL
        return page.goto(this.archiveBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      });

      // Try to fill search fields
      await this.fillSearchForm(page, highway, county, district);

      // Wait for results
      await page.waitForTimeout(5000);

      // Parse results from the page
      const records = await this.parseResults(page, highway, county);

      logger?.info('TxDOT-Archive', `Found ${records.length} archive record(s) for ${highway} in ${county} County`);

      return {
        recordsFound: records.length,
        records,
        searchUrl,
        attempted: true,
        error: null,
      };

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger?.warn('TxDOT-Archive', `Archive search failed: ${msg}`);
      // Return empty result — do not throw (empty is expected for many rural roads)
      return {
        ...emptyResult,
        attempted: true,
        error: msg,
      };
    } finally {
      if (browser) {
        try { await browser.close(); } catch { /* ignore */ }
      }
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Build the search URL with query parameters. */
  private buildSearchUrl(highway: string, county: string, district?: string): string {
    const params = new URLSearchParams({
      highway: highway.trim(),
      county:  county.trim(),
    });
    if (district) params.set('district', district.trim());
    return `${this.archiveBaseUrl}?${params.toString()}`;
  }

  /**
   * Attempt to fill the archive's search form.
   * Silently skips fields that are not found (form structure may vary).
   */
  private async fillSearchForm(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>,
    highway: string,
    county: string,
    district?: string,
  ): Promise<void> {
    try {
      // Highway input
      const hwyInput = page.locator(
        'input[name="highway"], input[placeholder*="Highway"], input[id*="highway"]',
      );
      if (await hwyInput.count() > 0) {
        await hwyInput.first().fill(highway, { timeout: 3000 });
      }

      // County selector
      const countySelect = page.locator(
        'select[name="county"], select[id*="county"]',
      );
      if (await countySelect.count() > 0) {
        await countySelect.first().selectOption({ label: county }, { timeout: 3000 }).catch(() =>
          countySelect.first().selectOption({ value: county.toUpperCase() }, { timeout: 3000 }),
        );
      }

      // District selector (optional)
      if (district) {
        const districtSelect = page.locator('select[name="district"], select[id*="district"]');
        if (await districtSelect.count() > 0) {
          await districtSelect.first().selectOption({ label: district }, { timeout: 3000 }).catch(() => {
            /* non-fatal */
          });
        }
      }

      // Submit search
      const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Search")');
      if (await submitBtn.count() > 0) {
        await submitBtn.first().click({ timeout: 5000 });
      }
    } catch {
      // Non-fatal — form may not exist or page structure may differ
    }
  }

  /**
   * Parse search result rows from the archive page.
   * Handles common result containers: .search-result, .result-item, tr[data-id], .asset-item
   */
  private async parseResults(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>,
    highway: string,
    county: string,
  ): Promise<ArchiveRecord[]> {
    const records: ArchiveRecord[] = [];

    try {
      // Try multiple common result selectors
      const resultSelectors = [
        '.search-result', '.result-item', 'tr[data-id]', '.asset-item',
        '.record-row', '.document-item', 'table.results tr:not(:first-child)',
      ];

      for (const selector of resultSelectors) {
        const items = await page.locator(selector).all();
        if (items.length === 0) continue;

        for (const item of items.slice(0, 20)) { // cap at 20 results
          try {
            const text = await item.textContent().catch(() => '');
            if (!text?.trim()) continue;

            const title = await item.locator('h3, h4, .title, td:first-child, a').first()
              .textContent().catch(() => text.slice(0, 100).trim()) ?? text.slice(0, 100).trim();

            const downloadUrl = await item.locator('a[href]').first()
              .getAttribute('href').catch(() => undefined) ?? undefined;

            // Extract CSJ number from title
            const csjMatch = title.match(/(\d{4}-\d{2}-\d{3})/);
            const controlNumber = csjMatch?.[1] ?? '';

            // Classify record type from title keywords
            let type: ArchiveRecord['type'] = 'other';
            if (/map|plan|sheet|plat/i.test(title)) type = 'map';
            else if (/conveyance|deed|easement|parcel/i.test(title)) type = 'conveyance';
            else if (/title|abstract/i.test(title)) type = 'title';

            // Extract date range (e.g., "1952-1970", "1952/1955")
            const dateMatch = title.match(/(\d{4})[\s\-\/](\d{4})/);
            const dateRange = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : undefined;

            records.push({
              title: title.trim(),
              controlNumber,
              district: '',
              highway,
              county,
              dateRange,
              downloadUrl: downloadUrl
                ? (downloadUrl.startsWith('http') ? downloadUrl : `${this.archiveBaseUrl}${downloadUrl}`)
                : undefined,
              type,
            });
          } catch {
            // Skip malformed result rows
          }
        }

        if (records.length > 0) break; // Found results with this selector
      }
    } catch {
      // Non-fatal parse failure
    }

    return records;
  }
}

// ── Standalone helper ─────────────────────────────────────────────────────────

/**
 * Convenience function: search the Texas Digital Archive for TxDOT ROW records.
 * Returns an empty result on any failure.
 */
export async function searchTexasDigitalArchive(
  highway: string,
  county: string,
  district?: string,
  logger?: PipelineLogger,
): Promise<DigitalArchiveResult> {
  const client = new TexasDigitalArchiveClient();
  return client.searchROWRecords(highway, county, district, logger);
}

// Export the path helper for Phase 6 orchestrator
export { path };
