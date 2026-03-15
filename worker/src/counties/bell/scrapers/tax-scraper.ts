/**
 * Bell County Tax Record Scraper
 *
 * Scrapes additional tax and property detail data from the Bell CAD
 * property detail page. Extracts improvements, exemptions, valuation
 * history, and taxing entity information.
 */

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';
import type { ScreenshotCapture, TaxInfo } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface TaxSearchInput {
  propertyId: string;
  ownerId?: string;
}

export interface TaxSearchResult {
  taxInfo: TaxInfo | null;
  improvements: Improvement[];
  valuationHistory: ValuationEntry[];
  screenshots: ScreenshotCapture[];
  urlsVisited: string[];
}

export interface Improvement {
  description: string;
  squareFeet: number | null;
  yearBuilt: number | null;
  condition: string | null;
}

export interface ValuationEntry {
  year: number;
  landValue: number | null;
  improvementValue: number | null;
  totalValue: number | null;
}

export interface TaxScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Scrape Bell CAD property detail page for tax and valuation data.
 */
export async function scrapeBellTax(
  input: TaxSearchInput,
  onProgress: (p: TaxScraperProgress) => void,
): Promise<TaxSearchResult> {
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];

  const progress = (msg: string) => {
    onProgress({ phase: 'Tax', message: msg, timestamp: new Date().toISOString() });
  };

  progress(`Fetching tax details for property: ${input.propertyId}`);

  const url = BELL_ENDPOINTS.cad.propertyDetail(input.propertyId, input.ownerId);
  urlsVisited.push(url);

  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'text/html,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
    });

    if (!resp.ok) {
      progress(`Failed to fetch property detail: HTTP ${resp.status}`);
      return { taxInfo: null, improvements: [], valuationHistory: [], screenshots, urlsVisited };
    }

    const html = await resp.text();
    const taxInfo = parseTaxInfo(html);
    const improvements = parseImprovements(html);
    const valuationHistory = parseValuationHistory(html);

    progress(`Tax data extracted: ${improvements.length} improvement(s), ${valuationHistory.length} year(s) of valuation`);

    return { taxInfo, improvements, valuationHistory, screenshots, urlsVisited };
  } catch (err) {
    progress(`Tax scraper error: ${err instanceof Error ? err.message : String(err)}`);
    return { taxInfo: null, improvements: [], valuationHistory: [], screenshots, urlsVisited };
  }
}

// ── Internal: HTML Parsing ───────────────────────────────────────────

function parseTaxInfo(html: string): TaxInfo | null {
  // Extract tax year
  const yearMatch = html.match(/Tax\s*Year[:\s]*(\d{4})/i);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

  // Extract appraised value
  const appraisedMatch = html.match(/(?:Total|Appraised)\s*Value[:\s]*\$?([\d,]+)/i);
  const appraised = appraisedMatch ? parseInt(appraisedMatch[1].replace(/,/g, '')) : null;

  // Extract assessed value
  const assessedMatch = html.match(/Assessed\s*Value[:\s]*\$?([\d,]+)/i);
  const assessed = assessedMatch ? parseInt(assessedMatch[1].replace(/,/g, '')) : null;

  // Extract exemptions
  const exemptions: string[] = [];
  const exemptionPattern = /(?:Homestead|Over\s*65|Disabled|Veteran|Agricultural)/gi;
  let match;
  while ((match = exemptionPattern.exec(html)) !== null) {
    const exemption = match[0].trim();
    if (!exemptions.includes(exemption)) {
      exemptions.push(exemption);
    }
  }

  // Extract taxing entities
  const taxingEntities: string[] = [];
  const entityPattern = /(?:Bell\s*County|City\s*of\s*\w+|Killeen\s*ISD|Belton\s*ISD|Temple\s*ISD)/gi;
  while ((match = entityPattern.exec(html)) !== null) {
    const entity = match[0].trim();
    if (!taxingEntities.includes(entity)) {
      taxingEntities.push(entity);
    }
  }

  return {
    taxYear: year,
    appraisedValue: appraised,
    assessedValue: assessed,
    exemptions,
    taxingEntities,
  };
}

function parseImprovements(html: string): Improvement[] {
  // TODO: Parse improvements table from Bell CAD detail page
  // Look for "Improvements" or "Buildings" section
  return [];
}

function parseValuationHistory(html: string): ValuationEntry[] {
  // TODO: Parse valuation history table from Bell CAD detail page
  return [];
}
