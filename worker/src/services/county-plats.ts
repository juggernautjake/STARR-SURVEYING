// worker/src/services/county-plats.ts
//
// Generic county plat repository adapter.
//
// Some counties publish free plat PDFs on their official websites, organized
// alphabetically by subdivision name. This module:
//   1. Maintains a registry of counties that have a free plat repository
//   2. Fetches the alphabetical index page for a given subdivision letter
//   3. Fuzzy-matches subdivision names from the index
//   4. Downloads the best-matching plat PDF
//
// Adding a new county: add one entry to PLAT_REPO_REGISTRY.
// No pipeline code changes are required.

import type { PipelineLogger } from '../lib/logger.js';

// ── Registry ─────────────────────────────────────────────────────────────────

export interface PlatRepoConfig {
  /** URL template for alphabetical index pages. {letter} is replaced with a-z or 0-9. */
  indexUrlTemplate: string;
  /** Base URL for PDF downloads (used for relative URL resolution). */
  pdfBaseUrl: string;
  /** Human-readable display name for log / source metadata. */
  countyDisplayName: string;
}

/**
 * Registry of counties that host a free plat PDF repository.
 * Key: lowercase county name (matches pipeline input.county).
 */
export const PLAT_REPO_REGISTRY: Record<string, PlatRepoConfig> = {
  bell: {
    indexUrlTemplate: 'https://www.bellcountytx.com/county_government/county_clerk/{letter}.php',
    pdfBaseUrl: 'https://cms3.revize.com',
    countyDisplayName: 'Bell County Clerk plat repository (bellcountytx.com)',
  },
};

/** Returns true when the given county has a free plat repository configured. */
export function hasPlatRepository(county: string): boolean {
  return Object.prototype.hasOwnProperty.call(PLAT_REPO_REGISTRY, county.toLowerCase());
}

/** Returns the plat repository config for a county, or null if not configured. */
export function getPlatRepoConfig(county: string): PlatRepoConfig | null {
  return PLAT_REPO_REGISTRY[county.toLowerCase()] ?? null;
}

/** Returns the list of county names with configured plat repositories. */
export function listPlatRepoCounties(): string[] {
  return Object.keys(PLAT_REPO_REGISTRY);
}

// ── Subdivision Name Extraction ───────────────────────────────────────────────

/**
 * Parses a Texas CAD legal description string and returns the subdivision or
 * addition name suitable for looking up a plat PDF.
 *
 * Examples:
 *   "ASH FAMILY TRUST 12.358 ACRE ADDITION, BLK 001, LOT 0002"
 *     → "ASH FAMILY TRUST 12.358 ACRE ADDITION"
 *
 *   "LOT 3 BLK 2 WILLIAMS CREEK ESTATES"
 *     → "WILLIAMS CREEK ESTATES"
 *
 *   "BUSINESS PERSONAL PROPERTY"
 *     → null  (not a real property description)
 *
 *   "ANTONIO MENCHACA SURVEY, ABSTRACT 12"
 *     → null  (survey reference, not a subdivision)
 */
export function extractSubdivisionName(legalDescription: string): string | null {
  if (!legalDescription) return null;

  const upper = legalDescription.toUpperCase().trim();

  // Reject non-useful descriptions
  if (/^BUSINESS\s+PERSONAL\s+PROPERTY/i.test(upper)) return null;
  if (/^MINERAL/i.test(upper)) return null;
  if (/^SURVEY\b|^ABSTRACT\b/i.test(upper)) return null;

  // Pattern 1: Name ends with ADDITION / SUBDIVISION / ESTATES / SECTION / PHASE / UNIT [N]
  // e.g. "ASH FAMILY TRUST 12.358 ACRE ADDITION" or "WILLIAMS CREEK PHASE 3"
  const additionMatch = upper.match(
    /(.+?\b(?:ADDITION|SUBDIVISION|ESTATES?|SECTION|PHASE\s*\d*|UNIT\s*\d*|REPLAT|ANNEX(?:ATION)?|RANCH))\b/i,
  );
  if (additionMatch) {
    const name = additionMatch[1].trim();
    // Strip any leading LOT/BLOCK prefix that crept in
    const cleaned = name.replace(/^LOT\s+\d+\s+(?:BLK|BLOCK)\s+\S+\s+/i, '').trim();
    if (cleaned.length > 5) return cleaned;
  }

  // Pattern 2: "LOT N BLK M <NAME>" — extract <NAME>
  const lotBlkMatch = upper.match(/LOT\s+\S+\s+(?:BLK|BLOCK)\s+\S+\s+(.+)/i);
  if (lotBlkMatch) {
    const name = lotBlkMatch[1]
      .replace(/,.*$/, '')     // trim after first comma
      .trim();
    if (name.length > 5) return name;
  }

  return null;
}

// ── Letter Page Fetching ─────────────────────────────────────────────────────

function getLetter(subdivisionName: string): string | null {
  const first = subdivisionName.trim()[0]?.toUpperCase() ?? '';
  if (/[A-Z]/.test(first)) return first.toLowerCase();
  if (/[0-9]/.test(first)) return '0-9';
  return null; // non-alphanumeric first char — cannot map to an index page
}

async function fetchPlatIndex(
  config: PlatRepoConfig,
  letter: string,
  logger: PipelineLogger,
): Promise<string | null> {
  const url = config.indexUrlTemplate.replace('{letter}', letter);
  const tracker = logger.startAttempt({
    layer: 'Stage2A',
    source: 'PlatRepo',
    method: 'HTTP-GET',
    input: url,
  });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-RECON/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      tracker({ status: 'fail', error: `HTTP ${response.status}` });
      return null;
    }
    const html = await response.text();
    tracker({ status: 'success', dataPointsFound: 1, details: `${html.length} bytes` });
    return html;
  } catch (err) {
    tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ── Plat Link Parsing ────────────────────────────────────────────────────────

interface PlatLink {
  name: string;
  url: string;
}

function parsePlatLinks(html: string, config: PlatRepoConfig): PlatLink[] {
  const results: PlatLink[] = [];
  const seen = new Set<string>();

  // Match all <a href="...pdf">NAME</a> links — case-insensitive
  const linkRegex = /<a\s[^>]*href="([^"]*\.pdf[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1];
    const rawName = match[2].replace(/\s+/g, ' ').trim();

    if (!rawName || rawName.length < 3) continue;

    // Resolve URL: relative paths get prepended with pdfBaseUrl
    let pdfUrl: string;
    if (rawHref.startsWith('http')) {
      pdfUrl = rawHref;
    } else {
      pdfUrl = config.pdfBaseUrl + (rawHref.startsWith('/') ? '' : '/') + rawHref;
    }

    // Strip cache-busting query params (e.g. ?t=202307271154110&t=202307271154110)
    try {
      const u = new URL(pdfUrl);
      u.searchParams.delete('t');
      pdfUrl = u.toString();
    } catch {
      // If URL parsing fails, fall back to simple regex strip
      pdfUrl = pdfUrl.replace(/([?&])t=\d+/g, '').replace(/^([^?]*)\?&/, '$1?').replace(/\?$/, '');
    }

    const key = rawName.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ name: rawName, url: pdfUrl });
    }
  }

  return results;
}

// ── Fuzzy Matching ────────────────────────────────────────────────────────────

/** Common words that don't help distinguish subdivision names. */
const STOP_WORDS = new Set([
  'ADDITION', 'SUBDIVISION', 'ESTATES', 'SECTION', 'PHASE', 'UNIT', 'LOT',
  'BLOCK', 'BLK', 'THE', 'OF', 'AT', 'AND', 'A', 'AN', 'NO',
  'REPLAT', 'AMENDED', 'FINAL', 'PLAT', 'SURVEY', 'ABSTRACT',
]);

/**
 * Scores how well `platName` (from the index) matches `targetName` (from the legal description).
 * Returns 0-1 where 1.0 = exact match.
 */
export function scorePlatMatch(platName: string, targetName: string): number {
  const a = platName.toUpperCase().trim();
  const b = targetName.toUpperCase().trim();

  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const tokensA = new Set(a.split(/\W+/).filter(Boolean));
  const tokensB = b.split(/\W+/).filter(Boolean);

  if (tokensB.length === 0) return 0;

  // Count matching tokens
  let matches = 0;
  let significantMatches = 0;
  for (const t of tokensB) {
    if (tokensA.has(t)) {
      matches++;
      if (!STOP_WORDS.has(t)) significantMatches++;
    }
  }

  const significantB = tokensB.filter((t) => !STOP_WORDS.has(t));
  const significantScore = significantB.length > 0 ? significantMatches / significantB.length : 0;
  const totalScore = matches / tokensB.length;

  // Weight significant matches more heavily
  return Math.max(significantScore * 0.7 + totalScore * 0.3, 0);
}

// ── PDF Download ──────────────────────────────────────────────────────────────

async function downloadPlatPdf(
  pdfUrl: string,
  logger: PipelineLogger,
): Promise<string | null> {
  const tracker = logger.startAttempt({
    layer: 'Stage2A',
    source: 'PlatRepo',
    method: 'PDF-download',
    input: pdfUrl.substring(0, 100),
  });

  try {
    const response = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-RECON/1.0)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      tracker({ status: 'fail', error: `HTTP ${response.status}` });
      return null;
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    tracker({ status: 'success', dataPointsFound: 1, details: `${buffer.byteLength} bytes` });
    return base64;
  } catch (err) {
    tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface PlatSearchResult {
  name: string;
  url: string;
  score: number;
}

/**
 * Searches a county's plat repository for plats matching the given subdivision name.
 * Returns matches sorted by score descending.
 */
export async function searchCountyPlats(
  county: string,
  subdivisionName: string,
  logger: PipelineLogger,
  minScore = 0.5,
): Promise<PlatSearchResult[]> {
  const config = getPlatRepoConfig(county);
  if (!config) {
    logger.warn('Stage2A', `No plat repository configured for county: ${county}`);
    return [];
  }

  const letter = getLetter(subdivisionName);
  if (!letter) {
    logger.warn('Stage2A', `Cannot map subdivision "${subdivisionName}" to plat index letter — starts with non-alphanumeric character`);
    return [];
  }
  const html = await fetchPlatIndex(config, letter, logger);
  if (!html) return [];

  const links = parsePlatLinks(html, config);
  logger.info('Stage2A', `Plat index /${letter}.php: found ${links.length} plat entries`);

  const scored: PlatSearchResult[] = links
    .map((link) => ({ ...link, score: scorePlatMatch(link.name, subdivisionName) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);

  logger.info('Stage2A', `Subdivision "${subdivisionName}": ${scored.length} match(es) above score ${minScore}${scored.length > 0 ? ` (best: "${scored[0].name}" score=${scored[0].score.toFixed(2)})` : ''}`);
  return scored;
}

/**
 * Finds and downloads the best-matching plat PDF for a subdivision from the
 * county's free plat repository. Returns null if not found or download fails.
 */
export async function fetchBestMatchingPlat(
  county: string,
  subdivisionName: string,
  logger: PipelineLogger,
): Promise<{ base64: string; name: string; url: string; source: string } | null> {
  const config = getPlatRepoConfig(county);
  if (!config) return null;

  const matches = await searchCountyPlats(county, subdivisionName, logger);
  if (matches.length === 0) {
    logger.info('Stage2A', `No plat found for "${subdivisionName}" in ${config.countyDisplayName}`);
    return null;
  }

  // Try top 3 matches in case a download fails
  for (const match of matches.slice(0, 3)) {
    logger.info('Stage2A', `Downloading plat "${match.name}" (score=${match.score.toFixed(2)}) from ${match.url.substring(0, 80)}`);
    const base64 = await downloadPlatPdf(match.url, logger);
    if (base64) {
      return { base64, name: match.name, url: match.url, source: config.countyDisplayName };
    }
  }

  logger.warn('Stage2A', `All plat download attempts failed for "${subdivisionName}"`);
  return null;
}
