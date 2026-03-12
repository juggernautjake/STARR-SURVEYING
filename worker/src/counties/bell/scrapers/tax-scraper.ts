/**
 * Bell County Tax Record Scraper
 *
 * Scrapes additional tax and property detail data from the Bell CAD
 * property detail page. Extracts improvements, exemptions, valuation
 * history, and taxing entity information.
 */

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints';
import type { ScreenshotCapture, TaxInfo } from '../types/research-result';

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

  /** HTTP status codes that are safe to retry (transient server errors). */
  const RETRYABLE_STATUS = new Set([429, 503]);
  const MAX_RETRIES = 3;

  try {
    let resp: Response | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Each iteration gets a fresh AbortSignal (cannot reuse the same signal)
      const r = await fetch(url, {
        headers: {
          'Accept': 'text/html,*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
      });

      if (RETRYABLE_STATUS.has(r.status) && attempt < MAX_RETRIES) {
        const delaySec = attempt * 2;
        progress(`HTTP ${r.status} — retrying in ${delaySec}s (attempt ${attempt}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
        continue;
      }

      resp = r;
      break;
    }

    if (!resp || !resp.ok) {
      progress(`Failed to fetch property detail: HTTP ${resp?.status ?? 'unknown'}`);
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
  // Extract tax year — if missing we cannot reliably attribute data to any year
  const yearMatch = html.match(/Tax\s*Year[:\s]*(\d{4})/i);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1]);

  // Extract appraised value
  const appraisedMatch = html.match(/(?:Total|Appraised)\s*Value[:\s]*\$?([\d,]+)/i);
  const appraised = appraisedMatch ? parseInt(appraisedMatch[1].replace(/,/g, '')) : null;

  // Extract assessed value
  const assessedMatch = html.match(/Assessed\s*Value[:\s]*\$?([\d,]+)/i);
  const assessed = assessedMatch ? parseInt(assessedMatch[1].replace(/,/g, '')) : null;

  // If we have no dollar values at all, the page likely did not contain real tax data
  if (appraised === null && assessed === null) return null;

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
  const improvements: Improvement[] = [];

  // Bell CAD property detail pages render improvements in a table headed by
  // "Improvement" or "Buildings".  The table rows follow the pattern:
  //   <td>Description</td><td>Year Built</td><td>Sq Ft</td><td>Condition</td>
  // We extract rows from any table that sits inside a section whose heading
  // contains "Improvement" or "Building".

  // Locate the improvements section by heading proximity
  const sectionPattern = /(?:Improvement|Building)s?[\s\S]{0,500}?<table[\s\S]*?<\/table>/gi;
  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = sectionPattern.exec(html)) !== null) {
    const section = sectionMatch[0];

    // Extract rows (skip header row)
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    let rowIndex = 0;

    while ((rowMatch = rowPattern.exec(section)) !== null) {
      if (rowIndex === 0) { rowIndex++; continue; } // skip header
      const cells = extractCells(rowMatch[1]);
      if (cells.length < 2) { rowIndex++; continue; }

      const description = cells[0] ?? '';
      const yearBuiltRaw = cells[1] ?? '';
      const sqFtRaw = cells[2] ?? '';
      const conditionRaw = cells[3] ?? '';

      const yearBuilt = parseInt(yearBuiltRaw.replace(/\D/g, ''), 10) || null;
      const squareFeet = parseInt(sqFtRaw.replace(/[^\d]/g, ''), 10) || null;
      const condition = conditionRaw.trim() || null;

      if (description.trim()) {
        improvements.push({ description: description.trim(), squareFeet, yearBuilt, condition });
      }
      rowIndex++;
    }
  }

  // Fallback: scan for "Year Built" near description keywords outside of a table
  if (improvements.length === 0) {
    const fallbackPattern =
      /\b(Residential|Commercial|Garage|Barn|Shed|Pool|Mobile\s+Home)\b[^<]{0,100}?(?:Year[:\s]*Built)?[:\s]*(\d{4})[^<]{0,200}?(?:Sq\.?\s*Ft\.?|Square\s*Feet)[:\s]*([\d,]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = fallbackPattern.exec(html)) !== null) {
      improvements.push({
        description: m[1].trim(),   // just the keyword, e.g. "Residential"
        yearBuilt:   parseInt(m[2], 10) || null,
        squareFeet:  parseInt(m[3].replace(/,/g, ''), 10) || null,
        condition: null,
      });
    }
  }

  return improvements;
}

function parseValuationHistory(html: string): ValuationEntry[] {
  const history: ValuationEntry[] = [];

  // Bell CAD shows a multi-year appraisal history table with columns:
  //   Year | Land Value | Improvement Value | Total Value
  // The table is in a section labeled "Value History" or "Appraisal History".

  const sectionPattern = /(?:Value\s*History|Appraisal\s*History|Historical\s*Value)[\s\S]{0,500}?<table[\s\S]*?<\/table>/gi;
  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = sectionPattern.exec(html)) !== null) {
    const section = sectionMatch[0];

    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    let rowIndex = 0;

    while ((rowMatch = rowPattern.exec(section)) !== null) {
      if (rowIndex === 0) { rowIndex++; continue; } // skip header
      const cells = extractCells(rowMatch[1]);
      if (cells.length < 2) { rowIndex++; continue; }

      const yearRaw = cells[0] ?? '';
      const landRaw = cells[1] ?? '';
      const improvRaw = cells[2] ?? '';
      const totalRaw = cells[3] ?? cells[2] ?? '';

      const year = parseInt(yearRaw.replace(/\D/g, ''), 10);
      if (!year || year < 1980 || year > 2100) { rowIndex++; continue; }

      history.push({
        year,
        landValue: parseDollar(landRaw),
        improvementValue: cells.length >= 3 ? parseDollar(improvRaw) : null,
        totalValue: cells.length >= 4 ? parseDollar(totalRaw) : parseDollar(landRaw),
      });
      rowIndex++;
    }
  }

  // Fallback: find any year-to-dollar pattern — only if page looks like an appraisal record
  if (history.length === 0 && /(?:apprai[sz]|assessed|tax\s*year)/i.test(html)) {
    const fallback = /\b(20\d{2})\b[^<]{0,200}?\$?([\d,]{4,})/g;
    let m: RegExpExecArray | null;
    const seen = new Set<number>();
    while ((m = fallback.exec(html)) !== null) {
      const year = parseInt(m[1], 10);
      if (!seen.has(year)) {
        seen.add(year);
        history.push({
          year,
          landValue: null,
          improvementValue: null,
          totalValue: parseDollar(m[2]),
        });
      }
    }
    // Sort descending
    history.sort((a, b) => b.year - a.year);
  }

  return history;
}

// ── Internal: HTML Utility Helpers ───────────────────────────────────

/** Extract text content from <td>…</td> cells in an HTML row fragment. */
function extractCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = cellPattern.exec(rowHtml)) !== null) {
    cells.push(decodeHtmlCell(m[1]));
  }
  return cells;
}

/**
 * Extracts plain text from an HTML fragment using a simple tag-skipping
 * state machine.  Characters inside `<…>` are skipped; characters outside
 * are appended to the output.  This avoids regex-based HTML "sanitization"
 * patterns entirely, so no incomplete-sanitization concern applies.
 *
 * Standard XML entities are decoded after text extraction, with `&amp;`
 * decoded last to prevent double-decoding of sequences like `&amp;lt;`.
 */
function decodeHtmlCell(html: string): string {
  const parts: string[] = [];
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (inTag) {
      if (ch === '>') inTag = false;
    } else if (ch === '<') {
      inTag = true;
    } else {
      parts.push(ch);
    }
  }
  return parts.join('')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi,   '<')
    .replace(/&gt;/gi,   '>')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi,  '&')  // LAST: prevents double-decode of &amp;lt; etc.
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a dollar string like "$1,234,567" or "1234567" to a number or null. */
function parseDollar(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}
