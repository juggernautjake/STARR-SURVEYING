/**
 * Bell County Plat Repository Adapter
 *
 * Searches the Bell County Clerk's public plat repository at bellcountytx.com.
 * Plats are organized alphabetically as PDFs hosted on cms3.revize.com.
 *
 * URL structure:
 *   Index pages: https://www.bellcountytx.com/county_government/county_clerk/{letter}.php
 *   PDF files:   https://cms3.revize.com/revize/bellcountytx/county_government/county_clerk/docs/plats/{LETTER}/{NAME}.pdf
 *
 * This adapter:
 *   1. Extracts subdivision/addition name from CAD legal description
 *   2. Fetches the appropriate alphabetical index page
 *   3. Fuzzy-matches plat names against the subdivision
 *   4. Returns matching plat PDF URL(s) and downloads them
 */

import type { PipelineLogger } from '../lib/logger.js';

const BASE_URL = 'https://www.bellcountytx.com/county_government/county_clerk';
const REVIZE_BASE = 'https://cms3.revize.com/revize/bellcountytx';

export interface PlatMatch {
  /** Name of the plat as listed on the index page */
  name: string;
  /** Direct URL to the plat PDF */
  pdfUrl: string;
  /** How well the name matched (0-1) */
  matchScore: number;
}

/**
 * Extract the subdivision/addition name from a CAD legal description.
 *
 * Texas CAD legal descriptions typically contain the subdivision name in formats like:
 *   "LOT 3 BLK 2 ASH FAMILY TRUST 12.358 ACRE ADDITION"
 *   "12.358AC ANTONIO MANCHACA #12 ASH FAMILY TRUST 12.358 ACRE ADDITION"
 *   "WILLIAMS CREEK ESTATES PHASE 3 LOT 14 BLK A"
 *
 * Returns null if no subdivision name can be extracted.
 */
export function extractSubdivisionName(legalDescription: string): string | null {
  if (!legalDescription) return null;

  const upper = legalDescription.toUpperCase().trim();

  // Skip useless descriptions
  if (/^BUSINESS\s+PERSONAL\s+PROPERTY$/i.test(upper)) return null;
  if (/^MINERAL\s+/i.test(upper)) return null;

  // Pattern 1: Explicit "ADDITION" or "SUBDIVISION" suffix
  // e.g., "ASH FAMILY TRUST 12.358 ACRE ADDITION"
  const additionMatch = upper.match(
    /([A-Z][A-Z\s\d.&'-]+?\s+(?:ADDITION|ADDN?|SUBDIVISION|SUBD?|ESTATES?|HEIGHTS|HILLS|ACRES|RANCH|RANCHES|PARK|GARDENS?|MEADOWS?|VILLAGE|PLACE|LANDING|CROSSING|COVE|CREEK|SPRINGS?)(?:\s+(?:PHASE|PH|SEC(?:TION)?)\s*\d+[A-Z]?)?)/,
  );
  if (additionMatch) return additionMatch[1].trim();

  // Pattern 2: "LOT N BLK M <SUBDIVISION>"
  const lotBlkMatch = upper.match(
    /LOT\s+\d+\s+(?:BLK|BLOCK)\s+[A-Z0-9]+\s+(.+?)(?:\s+(?:VOL|INST|CAB|PG|PAGE)\b|$)/,
  );
  if (lotBlkMatch) {
    const name = lotBlkMatch[1].trim();
    if (name.length > 3 && !/^\d+$/.test(name)) return name;
  }

  // Pattern 3: Named survey reference (e.g., "ANTONIO MANCHACA #12") — less specific
  // Not useful for plat lookup since these are original land grants, not subdivisions

  return null;
}

/**
 * Determine which letter page(s) to fetch for a given subdivision name.
 * Returns letters to search (typically just the first letter, but can include alternates).
 */
function getLetterPages(name: string): string[] {
  const first = name.charAt(0).toUpperCase();
  // Handle numeric-prefixed names
  if (/\d/.test(first)) return ['0-9'];
  if (first >= 'A' && first <= 'Z') return [first.toLowerCase()];
  return [];
}

/**
 * Fetch a letter index page and extract all plat PDF links.
 */
async function fetchPlatIndex(letter: string, logger: PipelineLogger): Promise<Array<{ name: string; pdfUrl: string }>> {
  const url = `${BASE_URL}/${letter}.php`;
  logger.info('Stage2A-Plats', `Fetching plat index: ${url}`);

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      logger.warn('Stage2A-Plats', `Index page returned HTTP ${resp.status}`);
      return [];
    }

    const html = await resp.text();
    return parsePlatLinks(html, letter);
  } catch (err) {
    logger.warn('Stage2A-Plats', `Failed to fetch index: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Parse plat PDF links from the index page HTML.
 * Links are in <li><a href="...pdf">NAME</a></li> format.
 */
function parsePlatLinks(html: string, _letter: string): Array<{ name: string; pdfUrl: string }> {
  const results: Array<{ name: string; pdfUrl: string }> = [];
  const seen = new Set<string>();

  // Match <a> tags linking to PDF files in the plats directory
  const linkPattern = /<a\s[^>]*href=["']([^"']*\.pdf[^"']*)["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    let href = match[1];
    const name = match[2].trim();

    if (!name || seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());

    // Resolve relative URLs
    if (href.startsWith('county_government/') || href.startsWith('/county_government/')) {
      href = `${REVIZE_BASE}/${href.replace(/^\//, '')}`;
    } else if (!href.startsWith('http')) {
      href = `${REVIZE_BASE}/county_government/county_clerk/${href.replace(/^\//, '')}`;
    }

    // Strip cache-busting timestamp query param
    const pdfUrl = href.split('?')[0];

    results.push({ name, pdfUrl });
  }

  return results;
}

/**
 * Score how well a plat name matches the target subdivision name.
 * Returns a score from 0 to 1.
 */
function scorePlatMatch(platName: string, targetName: string): number {
  const pn = platName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  const tn = targetName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();

  // Exact match
  if (pn === tn) return 1.0;

  // One contains the other
  if (pn.includes(tn) || tn.includes(pn)) return 0.9;

  // Token overlap scoring
  const pnTokens = pn.split(/\s+/).filter(t => t.length > 1);
  const tnTokens = tn.split(/\s+/).filter(t => t.length > 1);

  if (tnTokens.length === 0 || pnTokens.length === 0) return 0;

  // Count how many target tokens appear in the plat name
  let matchedTokens = 0;
  for (const token of tnTokens) {
    if (pnTokens.includes(token)) matchedTokens++;
  }

  const tokenScore = matchedTokens / tnTokens.length;

  // Boost if major words match (ignore common words like ADDITION, PHASE, etc.)
  const commonWords = new Set(['ADDITION', 'ADDN', 'ADD', 'SUBDIVISION', 'SUBD', 'SUB',
    'ESTATES', 'ESTATE', 'PHASE', 'PH', 'SECTION', 'SEC', 'LOT', 'BLOCK', 'BLK',
    'ACRE', 'ACRES', 'THE', 'OF', 'AT', 'IN', 'A', 'AN']);

  const significantTarget = tnTokens.filter(t => !commonWords.has(t));
  const significantPlat = pnTokens.filter(t => !commonWords.has(t));

  if (significantTarget.length > 0 && significantPlat.length > 0) {
    let sigMatched = 0;
    for (const t of significantTarget) {
      if (significantPlat.includes(t)) sigMatched++;
    }
    const sigScore = sigMatched / significantTarget.length;
    return Math.max(tokenScore, sigScore);
  }

  return tokenScore;
}

/**
 * Download a plat PDF and return its content as a base64-encoded buffer.
 */
async function downloadPlatPdf(
  pdfUrl: string,
  logger: PipelineLogger,
): Promise<{ base64: string; sizeBytes: number } | null> {
  logger.info('Stage2A-Plats', `Downloading plat PDF: ${pdfUrl}`);

  try {
    const resp = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)',
        Accept: 'application/pdf',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      logger.warn('Stage2A-Plats', `PDF download returned HTTP ${resp.status}`);
      return null;
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    logger.info('Stage2A-Plats', `Downloaded ${buf.length} bytes`);
    return { base64: buf.toString('base64'), sizeBytes: buf.length };
  } catch (err) {
    logger.warn('Stage2A-Plats', `PDF download failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Search the Bell County plat repository for plats matching a subdivision name.
 *
 * @param subdivisionName - The subdivision/addition name from the CAD legal description
 * @param logger - Pipeline logger
 * @param minScore - Minimum match score to include (default 0.6)
 * @returns Matched plats sorted by score descending
 */
export async function searchBellCountyPlats(
  subdivisionName: string,
  logger: PipelineLogger,
  minScore = 0.6,
): Promise<PlatMatch[]> {
  const tracker = logger.startAttempt({
    layer: 'Stage2A',
    source: 'BellCountyPlats',
    method: 'bellcountytx.com plat repository',
    input: subdivisionName,
  });

  try {
    const letters = getLetterPages(subdivisionName);
    if (letters.length === 0) {
      tracker({ status: 'fail', details: 'Could not determine letter page for subdivision name' });
      return [];
    }

    const allPlats: Array<{ name: string; pdfUrl: string }> = [];
    for (const letter of letters) {
      const plats = await fetchPlatIndex(letter, logger);
      allPlats.push(...plats);
    }

    tracker.step(`Found ${allPlats.length} plat(s) on ${letters.join(', ')} page(s)`);

    if (allPlats.length === 0) {
      tracker({ status: 'fail', details: 'No plats found on index page' });
      return [];
    }

    // Score and filter matches
    const scored = allPlats
      .map((p) => ({
        name: p.name,
        pdfUrl: p.pdfUrl,
        matchScore: scorePlatMatch(p.name, subdivisionName),
      }))
      .filter((p) => p.matchScore >= minScore)
      .sort((a, b) => b.matchScore - a.matchScore);

    tracker.step(`${scored.length} plat(s) matched above threshold ${minScore}`);

    if (scored.length > 0) {
      tracker({
        status: 'success',
        dataPointsFound: scored.length,
        details: `Best match: "${scored[0].name}" (score=${scored[0].matchScore.toFixed(2)})`,
      });
    } else {
      tracker({ status: 'fail', details: 'No plats matched above threshold' });
    }

    return scored;
  } catch (err) {
    tracker({
      status: 'fail',
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Full plat retrieval: search + download the best matching plat PDF.
 *
 * Returns the plat PDF as base64 + metadata, ready to be inserted into the
 * pipeline as a DocumentResult.
 */
export async function fetchBestMatchingPlat(
  subdivisionName: string,
  logger: PipelineLogger,
): Promise<{
  match: PlatMatch;
  pdfBase64: string;
  pdfSizeBytes: number;
} | null> {
  const matches = await searchBellCountyPlats(subdivisionName, logger);
  if (matches.length === 0) return null;

  // Try to download the best match, fall back to next if download fails
  for (const match of matches.slice(0, 3)) {
    const pdf = await downloadPlatPdf(match.pdfUrl, logger);
    if (pdf) {
      return {
        match,
        pdfBase64: pdf.base64,
        pdfSizeBytes: pdf.sizeBytes,
      };
    }
  }

  return null;
}
