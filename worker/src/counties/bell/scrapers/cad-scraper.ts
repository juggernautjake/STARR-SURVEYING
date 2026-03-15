/**
 * Bell County CAD Scraper
 *
 * Searches Bell Central Appraisal District (esearch.bellcad.org) for property
 * records. Uses a multi-layer strategy:
 *   1. HTTP API with session cookies (fastest)
 *   2. Playwright browser automation (SPA fallback)
 *   3. Screenshot + Claude Vision OCR (last resort)
 *
 * Also enriches results from the property detail page (deed history,
 * improvements, exemptions).
 */

import { BELL_ENDPOINTS, RATE_LIMITS, TIMEOUTS } from '../config/endpoints.js';
import { ESEARCH_FORMATS } from '../config/field-maps.js';
import type { ScreenshotCapture } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface CadSearchResult {
  propertyId: string;
  ownerName: string | null;
  legalDescription: string | null;
  acreage: number | null;
  situsAddress: string | null;
  propertyType: string | null;
  /** Deed history entries from the CAD detail page */
  deedHistory: CadDeedEntry[];
  /** Instrument numbers extracted from deed history */
  instrumentNumbers: string[];
  /** Owner ID for detail page navigation */
  ownerId?: string;
  mapId?: string;
  mailingAddress?: string;
  /** How this result was found */
  source: 'http-api' | 'playwright' | 'vision-ocr';
  /** All screenshots taken during this search */
  screenshots: ScreenshotCapture[];
  /** All URLs visited */
  urlsVisited: string[];
}

export interface CadDeedEntry {
  deedDate?: string;
  type?: string;
  description?: string;
  grantor?: string;
  grantee?: string;
  volume?: string;
  page?: string;
  instrumentNumber?: string;
}

export interface CadSearchInput {
  address?: string;
  propertyId?: string;
  ownerName?: string;
  instrumentNumber?: string;
}

export interface CadScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Search Bell CAD for a property using all available methods.
 * Returns the best match with full detail enrichment.
 *
 * @param input - At least one identifying field
 * @param onProgress - Callback for progress updates
 * @returns CadSearchResult or null if not found
 */
export async function scrapeBellCad(
  input: CadSearchInput,
  onProgress: (p: CadScraperProgress) => void,
): Promise<CadSearchResult | null> {
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];

  const progress = (phase: string, message: string) => {
    onProgress({ phase, message, timestamp: new Date().toISOString() });
  };

  // ── Layer 1: Direct property ID lookup ─────────────────────────────
  if (input.propertyId) {
    progress('CAD', `Looking up property ID: ${input.propertyId}`);
    const result = await lookupByPropertyId(input.propertyId, screenshots, urlsVisited);
    if (result) return result;
  }

  // ── Layer 2: HTTP API keyword search ───────────────────────────────
  if (input.address) {
    progress('CAD', `Searching Bell CAD by address: ${input.address}`);
    const result = await searchByAddress(input.address, screenshots, urlsVisited, progress);
    if (result) return result;
  }

  // ── Layer 3: Owner name search ─────────────────────────────────────
  if (input.ownerName) {
    progress('CAD', `Searching Bell CAD by owner: ${input.ownerName}`);
    const result = await searchByOwner(input.ownerName, screenshots, urlsVisited);
    if (result) return result;
  }

  progress('CAD', 'Bell CAD search exhausted — no results found');
  return null;
}

// ── Internal: Property ID Lookup ─────────────────────────────────────

async function lookupByPropertyId(
  propId: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): Promise<CadSearchResult | null> {
  const url = BELL_ENDPOINTS.cad.propertyDetail(propId);
  urlsVisited.push(url);

  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/json,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
    });

    if (!resp.ok) return null;
    const html = await resp.text();
    return parsePropertyDetailHtml(html, propId, 'http-api', screenshots, urlsVisited);
  } catch {
    return null;
  }
}

// ── Internal: Address Search ─────────────────────────────────────────

async function searchByAddress(
  address: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): Promise<CadSearchResult | null> {
  // Acquire session cookie first
  const session = await acquireSession(screenshots, urlsVisited);
  if (!session) {
    progress('CAD', 'Failed to acquire Bell CAD session — will try Playwright');
    return searchByAddressPlaywright(address, screenshots, urlsVisited, progress);
  }

  // Parse address into components
  const parsed = parseAddressComponents(address);
  if (!parsed) return null;

  // Generate search variants (with and without street number)
  const variants = generateSearchVariants(parsed);

  for (const variant of variants) {
    const keywords = ESEARCH_FORMATS.buildKeywords(variant.number, variant.name);
    const url = `${BELL_ENDPOINTS.cad.searchResults}?keywords=${encodeURIComponent(keywords)}&searchSessionToken=${encodeURIComponent(session.token)}`;
    urlsVisited.push(url);

    try {
      const resp = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': session.cookies,
          'Referer': BELL_ENDPOINTS.cad.home,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
      });

      if (!resp.ok) continue;
      const html = await resp.text();
      const results = parseSearchResultsHtml(html);

      if (results.length > 0) {
        progress('CAD', `Found ${results.length} result(s) for variant: ${variant.name}`);
        // Pick best match and get detail
        const bestPropId = pickBestMatch(results, parsed);
        if (bestPropId) {
          return lookupByPropertyId(bestPropId, screenshots, urlsVisited);
        }
      }

      await delay(RATE_LIMITS.cadSearch);
    } catch {
      continue;
    }
  }

  // All HTTP variants failed — try Playwright
  return searchByAddressPlaywright(address, screenshots, urlsVisited, progress);
}

// ── Internal: Playwright Fallback ────────────────────────────────────

async function searchByAddressPlaywright(
  address: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): Promise<CadSearchResult | null> {
  progress('CAD', 'Launching Playwright browser for Bell CAD search...');

  // TODO: Implement Playwright-based search
  // This will use the existing Layer 1B logic from bis-cad.ts
  // but adapted for the Bell County isolated module.
  //
  // For now, return null to fall through to GIS scraper.
  // The GIS scraper (which was broken but is now fixed) will
  // catch properties that CAD eSearch can't find.

  return null;
}

// ── Internal: Owner Name Search ──────────────────────────────────────

async function searchByOwner(
  ownerName: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): Promise<CadSearchResult | null> {
  const session = await acquireSession(screenshots, urlsVisited);
  if (!session) return null;

  const variants = generateOwnerNameVariants(ownerName);

  for (const name of variants) {
    const keywords = ESEARCH_FORMATS.buildOwnerSearch(name);
    const url = `${BELL_ENDPOINTS.cad.searchResults}?keywords=${encodeURIComponent(keywords)}&searchSessionToken=${encodeURIComponent(session.token)}`;
    urlsVisited.push(url);

    try {
      const resp = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/json,*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': session.cookies,
        },
        signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
      });

      if (!resp.ok) continue;
      const html = await resp.text();
      const results = parseSearchResultsHtml(html);

      if (results.length > 0 && results.length <= 50) {
        const bestPropId = results[0].propertyId;
        if (bestPropId) {
          return lookupByPropertyId(bestPropId, screenshots, urlsVisited);
        }
      }

      await delay(RATE_LIMITS.cadSearch);
    } catch {
      continue;
    }
  }

  return null;
}

// ── Internal: Session Management ─────────────────────────────────────

interface CadSession {
  token: string;
  cookies: string;
}

async function acquireSession(
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): Promise<CadSession | null> {
  urlsVisited.push(BELL_ENDPOINTS.cad.home);

  try {
    const resp = await fetch(BELL_ENDPOINTS.cad.home, {
      headers: {
        'Accept': 'text/html,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
    });

    if (!resp.ok) return null;

    // Extract session token from HTML
    const html = await resp.text();
    const tokenMatch = html.match(/searchSessionToken['"]\s*(?:value|content)\s*=\s*['"]([^'"]+)['"]/i)
      ?? html.match(/name=['"]searchSessionToken['"][^>]*value=['"]([^'"]+)['"]/i);
    const token = tokenMatch?.[1] ?? '';

    // Extract cookies from response headers
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

    if (!token) return null;
    return { token, cookies };
  } catch {
    return null;
  }
}

// ── Internal: HTML Parsing ───────────────────────────────────────────

interface ParsedSearchResult {
  propertyId: string;
  ownerName?: string;
  address?: string;
}

function parseSearchResultsHtml(html: string): ParsedSearchResult[] {
  const results: ParsedSearchResult[] = [];

  // Match onclick handlers that contain property IDs
  const onclickPattern = /onclick\s*=\s*["'][^"']*(?:\/Property\/View\/|propertyId[=:]\s*)(\d+)/gi;
  let match;
  while ((match = onclickPattern.exec(html)) !== null) {
    if (!results.find(r => r.propertyId === match![1])) {
      results.push({ propertyId: match[1] });
    }
  }

  // Also try href pattern
  const hrefPattern = /href\s*=\s*["']\/Property\/View\/(\d+)/gi;
  while ((match = hrefPattern.exec(html)) !== null) {
    if (!results.find(r => r.propertyId === match![1])) {
      results.push({ propertyId: match[1] });
    }
  }

  return results;
}

function parsePropertyDetailHtml(
  html: string,
  propId: string,
  source: 'http-api' | 'playwright' | 'vision-ocr',
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): CadSearchResult | null {
  // TODO: Extract detailed property info from the detail page HTML.
  // This will parse owner name, legal description, deed history table,
  // mailing address, acreage, improvements, etc.
  //
  // For now, return a minimal result that the orchestrator can enrich
  // via GIS data.

  // Basic extraction using regex patterns
  const ownerMatch = html.match(/Owner\s*(?:Name)?[:\s]*<[^>]*>([^<]+)</i);
  const legalMatch = html.match(/Legal\s*(?:Description)?[:\s]*<[^>]*>([^<]+)</i);
  const acresMatch = html.match(/(?:Acreage|Acres)[:\s]*<[^>]*>([\d.,]+)/i);

  return {
    propertyId: propId,
    ownerName: ownerMatch?.[1]?.trim() ?? null,
    legalDescription: legalMatch?.[1]?.trim() ?? null,
    acreage: acresMatch ? parseFloat(acresMatch[1].replace(/,/g, '')) : null,
    situsAddress: null,
    propertyType: null,
    deedHistory: [],
    instrumentNumbers: [],
    source,
    screenshots,
    urlsVisited,
  };
}

// ── Internal: Address Parsing & Variants ─────────────────────────────

interface AddressComponents {
  streetNumber: string | null;
  direction: string | null;
  streetName: string;
  streetSuffix: string | null;
  city: string | null;
}

function parseAddressComponents(address: string): AddressComponents | null {
  // Normalize
  const clean = address.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = clean.split(' ');
  if (parts.length < 2) return null;

  let idx = 0;
  let streetNumber: string | null = null;
  let direction: string | null = null;

  // Street number
  if (/^\d+$/.test(parts[0])) {
    streetNumber = parts[0];
    idx = 1;
  }

  // Direction prefix
  const dirs = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST'];
  if (idx < parts.length && dirs.includes(parts[idx].toUpperCase())) {
    direction = parts[idx].toUpperCase();
    idx++;
  }

  // Everything else up to city/state/zip is street name
  const remaining = parts.slice(idx);
  // Remove state and zip from end
  const stateZipPattern = /^(TX|TEXAS|\d{5}(-\d{4})?)$/i;
  while (remaining.length > 0 && stateZipPattern.test(remaining[remaining.length - 1])) {
    remaining.pop();
  }

  // Common Texas cities — remove from end if present
  const cities = ['BELTON', 'KILLEEN', 'TEMPLE', 'HARKER HEIGHTS', 'NOLANVILLE', 'SALADO', 'HOLLAND', 'ROGERS', 'TROY', 'MOODY', 'BARTLETT', 'LITTLE RIVER-ACADEMY'];
  let city: string | null = null;
  const remainingStr = remaining.join(' ').toUpperCase();
  for (const c of cities) {
    if (remainingStr.endsWith(c)) {
      city = c;
      const cityWords = c.split(' ').length;
      remaining.splice(remaining.length - cityWords, cityWords);
      break;
    }
  }

  const streetName = remaining.join(' ');
  if (!streetName) return null;

  return { streetNumber, direction, streetName, streetSuffix: null, city };
}

interface SearchVariant {
  number: string | null;
  name: string;
}

function generateSearchVariants(parsed: AddressComponents): SearchVariant[] {
  const variants: SearchVariant[] = [];
  const { streetNumber, direction, streetName } = parsed;

  // Full address (number + direction + name)
  if (direction) {
    variants.push({ number: streetNumber, name: `${direction} ${streetName}` });
    variants.push({ number: streetNumber, name: streetName });
  } else {
    variants.push({ number: streetNumber, name: streetName });
  }

  // FM/CR road variants
  const fmMatch = streetName.match(/^(FM|RR|CR|SH|US|IH)\s*(\d+)/i);
  if (fmMatch) {
    const prefix = fmMatch[1].toUpperCase();
    const num = fmMatch[2];
    const fmVariants = [
      `${prefix} ${num}`,
      `${prefix}${num}`,
      `FM ROAD ${num}`,
      `FARM TO MARKET ${num}`,
      `FARM TO MARKET ROAD ${num}`,
      `FM RD ${num}`,
    ];
    for (const name of fmVariants) {
      if (direction) {
        variants.push({ number: streetNumber, name: `${direction} ${name}` });
      }
      variants.push({ number: streetNumber, name });
    }
  }

  // Street-name-only (no number) — for properties without situs numbers
  if (streetNumber) {
    for (const v of [...variants]) {
      variants.push({ number: null, name: v.name });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return variants.filter(v => {
    const key = `${v.number ?? ''}|${v.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateOwnerNameVariants(ownerName: string): string[] {
  const variants = [ownerName, ownerName.toUpperCase()];

  // If it looks like "FIRST LAST", also try "LAST, FIRST"
  const parts = ownerName.trim().split(/\s+/);
  if (parts.length >= 2 && !ownerName.includes(',')) {
    variants.push(`${parts[parts.length - 1].toUpperCase()}, ${parts.slice(0, -1).join(' ').toUpperCase()}`);
  }

  return [...new Set(variants)];
}

function pickBestMatch(results: ParsedSearchResult[], parsed: AddressComponents): string | null {
  // For now, return the first result. The orchestrator will validate via GIS.
  return results[0]?.propertyId ?? null;
}

// ── Utility ──────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
