// worker/src/services/bell-cad.ts — Stage 1: Bell County CAD Property Identification
// Layer 1A: HTTP POST to CAD JSON API
// Layer 1B: Playwright browser automation
// Layer 1C: Screenshot + Claude Vision OCR fallback

import type { PropertyIdResult, NormalizedAddress, AddressVariant } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── BIS Consultants eSearch Configuration ──────────────────────────────────

interface BisConfig {
  baseUrl: string;
  name: string;
}

const BIS_CONFIGS: Record<string, BisConfig> = {
  bell:       { baseUrl: 'https://esearch.bellcad.org', name: 'Bell CAD' },
  williamson: { baseUrl: 'https://esearch.wilcotx.gov', name: 'Williamson CAD' },
  mclennan:   { baseUrl: 'https://esearch.mclennancad.org', name: 'McLennan CAD' },
  coryell:    { baseUrl: 'https://esearch.coryellcad.org', name: 'Coryell CAD' },
  lampasas:   { baseUrl: 'https://esearch.lampasascad.org', name: 'Lampasas CAD' },
  falls:      { baseUrl: 'https://esearch.fallscad.net', name: 'Falls CAD' },
  milam:      { baseUrl: 'https://esearch.milamcad.org', name: 'Milam CAD' },
};

// ── Types for CAD API Response ─────────────────────────────────────────────

interface CadSearchResult {
  propertyId?: string;
  PropertyId?: string;
  ownerName?: string;
  OwnerName?: string;
  legalDescription?: string;
  LegalDescription?: string;
  geoId?: string;
  GeoId?: string;
  address?: string;
  Address?: string;
  isUDI?: boolean;
  IsUDI?: boolean;
}

// ── Layer 1A: HTTP POST to CAD JSON API ────────────────────────────────────

async function searchCadHttp(
  baseUrl: string,
  variants: AddressVariant[],
  logger: PipelineLogger,
): Promise<CadSearchResult[] | null> {
  for (const variant of variants) {
    const finish = logger.startAttempt({
      layer: 'Stage1A',
      source: 'CAD-HTTP',
      method: 'POST',
      input: `${variant.streetNumber} ${variant.streetName}`,
    });

    try {
      const keywords = `StreetNumber:${encodeURIComponent(variant.streetNumber)} StreetName:${encodeURIComponent(variant.streetName)}`;
      const url = `${baseUrl}/search/SearchResults?keywords=${keywords}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${baseUrl}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        finish({
          status: 'fail',
          error: `HTTP ${response.status} ${response.statusText}`,
          nextLayer: 'Stage1B',
        });
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) {
        finish({
          status: 'fail',
          error: `Non-JSON response: ${contentType}`,
          nextLayer: 'Stage1B',
        });
        continue;
      }

      const data = await response.json() as { resultsList?: CadSearchResult[] } | CadSearchResult[];
      const results = Array.isArray(data) ? data : data.resultsList ?? [];

      if (!results.length) {
        finish({ status: 'fail', error: 'No results', nextLayer: 'Stage1B' });
        continue;
      }

      finish({ status: 'success', dataPointsFound: results.length });
      return results;
    } catch (err) {
      finish({
        status: 'fail',
        error: err instanceof Error ? err.message : String(err),
        nextLayer: 'Stage1B',
      });
    }
  }

  return null;
}

// ── Layer 1B: Playwright Browser Automation ────────────────────────────────

async function searchCadPlaywright(
  baseUrl: string,
  variants: AddressVariant[],
  logger: PipelineLogger,
): Promise<{ results: CadSearchResult[]; screenshot: Buffer | null }> {
  const finish = logger.startAttempt({
    layer: 'Stage1B',
    source: 'CAD-Playwright',
    method: 'browser-automation',
    input: variants.map((v) => v.query).join(' | '),
  });

  let browser = null;
  let screenshot: Buffer | null = null;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Navigate to the search page
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Try to click "By Address" tab if it exists
    try {
      const addressTab = page.locator('text=By Address, a:has-text("Address"), [data-tab="address"]').first();
      await addressTab.click({ timeout: 3_000 });
      await page.waitForTimeout(500);
    } catch {
      // Tab might not exist, continue
    }

    let capturedResults: CadSearchResult[] = [];

    // Set up response interceptor to capture AJAX results
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('SearchResults') || url.includes('searchresults')) {
          const contentType = response.headers()['content-type'] ?? '';
          if (contentType.includes('json')) {
            const data = await response.json() as { resultsList?: CadSearchResult[] } | CadSearchResult[];
            const results = Array.isArray(data) ? data : data.resultsList ?? [];
            if (results.length > capturedResults.length) {
              capturedResults = results;
            }
          }
        }
      } catch {
        // Ignore response parsing errors
      }
    });

    // Try each variant
    for (const variant of variants) {
      try {
        // Fill street number and street name using page.evaluate for reliability
        await page.evaluate(
          ([num, name]: [string, string]) => {
            // Try various selector patterns for the street number field
            const numSelectors = [
              'input[name*="StreetNumber" i]',
              'input[name*="streetNumber" i]',
              'input[id*="streetnum" i]',
              'input[placeholder*="number" i]',
            ];
            const nameSelectors = [
              'input[name*="StreetName" i]',
              'input[name*="streetName" i]',
              'input[id*="streetname" i]',
              'input[placeholder*="name" i]',
            ];

            for (const sel of numSelectors) {
              const el = document.querySelector(sel) as HTMLInputElement | null;
              if (el) {
                el.value = num;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                break;
              }
            }

            for (const sel of nameSelectors) {
              const el = document.querySelector(sel) as HTMLInputElement | null;
              if (el) {
                el.value = name;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                break;
              }
            }
          },
          [variant.streetNumber, variant.streetName] as [string, string],
        );

        // Click search button
        const searchBtn = page.locator('button:has-text("Search"), input[type="submit"], .search-btn, button[type="submit"]').first();
        await searchBtn.click({ timeout: 5_000 });

        // Wait for results
        await page.waitForTimeout(3_000);

        // Also try to wait for result rows to appear
        try {
          await page.waitForSelector('table tbody tr, .search-results tr, .result-row', { timeout: 10_000 });
        } catch {
          // Results might not have loaded via DOM
        }

        if (capturedResults.length > 0) {
          break; // Got results via AJAX interception
        }
      } catch {
        // Variant didn't work, try next
        continue;
      }
    }

    // Take screenshot for debugging/Vision OCR
    screenshot = await page.screenshot({ fullPage: true }) as Buffer;

    // If AJAX interception didn't capture results, try DOM extraction
    if (capturedResults.length === 0) {
      try {
        const rows = await page.$$eval('table tbody tr', (trs) =>
          trs.map((tr) => {
            const cells = Array.from(tr.querySelectorAll('td'));
            return {
              text: cells.map((c) => c.textContent?.trim() ?? '').join(' | '),
              href: tr.querySelector('a')?.getAttribute('href') ?? null,
            };
          }),
        );

        for (const row of rows) {
          // Try to extract property ID from links or cell text
          const idMatch = row.href?.match(/(?:Id|id|ID)=(\d+)/) ?? row.text.match(/(\d{4,})/);
          if (idMatch) {
            capturedResults.push({
              propertyId: idMatch[1],
              ownerName: row.text,
              address: row.text,
            });
          }
        }
      } catch {
        // DOM extraction failed
      }
    }

    await browser.close();

    if (capturedResults.length > 0) {
      finish({
        status: 'success',
        dataPointsFound: capturedResults.length,
        details: `Found ${capturedResults.length} results via Playwright`,
      });
    } else {
      finish({
        status: 'fail',
        error: 'No results found via Playwright',
        nextLayer: 'Stage1C',
      });
    }

    return { results: capturedResults, screenshot };
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    finish({
      status: 'fail',
      error: err instanceof Error ? err.message : String(err),
      nextLayer: 'Stage1C',
    });
    return { results: [], screenshot };
  }
}

// ── Layer 1C: Vision OCR Fallback ──────────────────────────────────────────

async function extractFromScreenshot(
  screenshot: Buffer,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<PropertyIdResult | null> {
  const finish = logger.startAttempt({
    layer: 'Stage1C',
    source: 'CAD-Vision',
    method: 'screenshot-ocr',
    input: `screenshot (${screenshot.length} bytes)`,
  });

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot.toString('base64'),
              },
            },
            {
              type: 'text',
              text: `This is a screenshot of a Texas county appraisal district (CAD) search results page.

Extract ALL property information visible in the results. For each property found, provide:
- Property ID (numeric)
- GEO ID (if visible)
- Owner name
- Legal description
- Situs address
- Acreage (if visible)

Return a JSON array of objects. If no results are visible, return an empty array.
Return ONLY valid JSON, no markdown fences or explanation.`,
            },
          ],
        },
      ],
    });

    const text = response.content.find((c) => c.type === 'text');
    if (!text || text.type !== 'text') {
      finish({ status: 'fail', error: 'No text in Vision response' });
      return null;
    }

    const cleaned = text.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as Array<{
      propertyId?: string;
      property_id?: string;
      geoId?: string;
      geo_id?: string;
      ownerName?: string;
      owner_name?: string;
      legalDescription?: string;
      legal_description?: string;
      acreage?: number;
      address?: string;
    }>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      finish({ status: 'fail', error: 'No properties found in screenshot' });
      return null;
    }

    const first = parsed[0];
    const propId = first.propertyId ?? first.property_id ?? '';

    if (!propId) {
      finish({ status: 'fail', error: 'No property ID found in OCR' });
      return null;
    }

    finish({ status: 'success', dataPointsFound: parsed.length });

    return {
      propertyId: propId,
      geoId: first.geoId ?? first.geo_id ?? null,
      ownerName: first.ownerName ?? first.owner_name ?? null,
      legalDescription: first.legalDescription ?? first.legal_description ?? null,
      acreage: first.acreage ?? null,
      propertyType: null,
      situsAddress: first.address ?? null,
      source: 'vision-ocr',
      layer: 'Stage1C',
    };
  } catch (err) {
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ── Property Detail Enrichment ─────────────────────────────────────────────

async function enrichPropertyDetail(
  baseUrl: string,
  propertyId: string,
  logger: PipelineLogger,
): Promise<{ acreage: number | null; legalDescription: string | null }> {
  const finish = logger.startAttempt({
    layer: 'Stage1-Detail',
    source: 'CAD-Detail',
    method: 'HTTP-GET',
    input: propertyId,
  });

  try {
    const year = new Date().getFullYear();
    const url = `${baseUrl}/Property/View?Id=${propertyId}&year=${year}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      finish({ status: 'fail', error: `HTTP ${response.status}` });
      return { acreage: null, legalDescription: null };
    }

    const html = await response.text();

    // Extract acreage from HTML
    const acreageMatch = html.match(/(?:Acreage|Land\s*Area|Total\s*Acres?)\s*:?\s*<[^>]*>\s*([\d,.]+)/i)
      ?? html.match(/([\d,.]+)\s*(?:acres?|ac)\b/i);
    const acreage = acreageMatch ? parseFloat(acreageMatch[1].replace(/,/g, '')) : null;

    // Extract legal description from HTML
    const legalMatch = html.match(/(?:Legal\s*Description|Legal\s*Desc\.?)\s*:?\s*<[^>]*>\s*([^<]+)/i);
    const legalDescription = legalMatch ? legalMatch[1].trim() : null;

    finish({
      status: acreage || legalDescription ? 'success' : 'partial',
      dataPointsFound: (acreage ? 1 : 0) + (legalDescription ? 1 : 0),
      details: `Acreage: ${acreage ?? 'N/A'}, Legal: ${legalDescription ? 'found' : 'N/A'}`,
    });

    return { acreage, legalDescription };
  } catch (err) {
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return { acreage: null, legalDescription: null };
  }
}

// ── Pick Best Result ───────────────────────────────────────────────────────

function pickBestResult(results: CadSearchResult[]): CadSearchResult | null {
  // Filter out UDI (Undivided Interest) records
  const nonUdi = results.filter((r) => !(r.isUDI ?? r.IsUDI));
  if (nonUdi.length === 0 && results.length > 0) {
    return results[0]; // Fall back to first even if UDI
  }
  return nonUdi[0] ?? null;
}

// ── Main Search Function ───────────────────────────────────────────────────

/**
 * Search for a property in a BIS Consultants eSearch CAD system.
 * Tries HTTP → Playwright → Vision OCR in sequence (layered fallback).
 */
export async function searchBisCad(
  county: string,
  normalized: NormalizedAddress,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<PropertyIdResult | null> {
  const config = BIS_CONFIGS[county.toLowerCase()];
  if (!config) {
    logger.warn('Stage1', `No BIS config for county: ${county}`);
    return null;
  }

  const { variants } = normalized;
  if (!variants.length) {
    logger.warn('Stage1', 'No address variants to search');
    return null;
  }

  // Layer 1A: HTTP POST
  const httpResults = await searchCadHttp(config.baseUrl, variants, logger);
  if (httpResults && httpResults.length > 0) {
    const best = pickBestResult(httpResults);
    if (best) {
      const propId = best.propertyId ?? best.PropertyId ?? '';
      const detail = await enrichPropertyDetail(config.baseUrl, propId, logger);

      return {
        propertyId: propId,
        geoId: best.geoId ?? best.GeoId ?? null,
        ownerName: best.ownerName ?? best.OwnerName ?? null,
        legalDescription: detail.legalDescription ?? best.legalDescription ?? best.LegalDescription ?? null,
        acreage: detail.acreage ?? null,
        propertyType: null,
        situsAddress: best.address ?? best.Address ?? null,
        source: config.name,
        layer: 'Stage1A',
      };
    }
  }

  // Layer 1B: Playwright
  const { results: pwResults, screenshot } = await searchCadPlaywright(config.baseUrl, variants, logger);
  if (pwResults.length > 0) {
    const best = pickBestResult(pwResults);
    if (best) {
      const propId = best.propertyId ?? best.PropertyId ?? '';
      const detail = await enrichPropertyDetail(config.baseUrl, propId, logger);

      return {
        propertyId: propId,
        geoId: best.geoId ?? best.GeoId ?? null,
        ownerName: best.ownerName ?? best.OwnerName ?? null,
        legalDescription: detail.legalDescription ?? best.legalDescription ?? best.LegalDescription ?? null,
        acreage: detail.acreage ?? null,
        propertyType: null,
        situsAddress: best.address ?? best.Address ?? null,
        source: config.name,
        layer: 'Stage1B',
      };
    }
  }

  // Layer 1C: Vision OCR from screenshot
  if (screenshot) {
    const visionResult = await extractFromScreenshot(screenshot, anthropicApiKey, logger);
    if (visionResult) {
      const detail = await enrichPropertyDetail(config.baseUrl, visionResult.propertyId, logger);
      return {
        ...visionResult,
        legalDescription: detail.legalDescription ?? visionResult.legalDescription,
        acreage: detail.acreage ?? visionResult.acreage,
      };
    }
  }

  logger.error('Stage1', 'All CAD search layers failed');
  return null;
}
