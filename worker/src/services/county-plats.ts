// worker/src/services/county-plats.ts
//
// Generic county plat repository adapter.
//
// Supported county systems:
//   Bell County  — Revize CMS alphabetical PHP pages   → direct PDF links    (~1,500 plats)
//   Hays County  — Hays CAD WordPress sublist pages    → TIF image links     (8,051 plats)
//
// Adding a new county: add one entry to PLAT_REPO_REGISTRY.
// No pipeline code changes are required.

import type { PipelineLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatRepoConfig {
  /** URL template for alphabetical index pages. {letter} replaced with a-z or 0-9. */
  indexUrlTemplate: string;
  /** Base URL for resolving relative file hrefs. */
  fileBaseUrl: string;
  /** Human-readable display name for log / source metadata. */
  countyDisplayName: string;
  /**
   * File extension to match in links. Default: 'pdf'.
   * 'tif' files are converted to PNG for AI analysis (Claude does not accept TIFF).
   */
  fileExt?: 'pdf' | 'tif';
  /**
   * If true, numeric subdivisions (0-9 first char) appear on the 'a' letter page
   * instead of a separate '0-9' page. (Hays CAD: yes, Bell County: no)
   */
  numericsOnLetterA?: boolean;
  /** Custom HTTP headers for fetching the index page. Hays CAD requires browser User-Agent. */
  indexHeaders?: Record<string, string>;
  /** Custom HTTP headers for downloading plat files. */
  fileHeaders?: Record<string, string>;
  /**
   * How to parse the index page.
   *   'links' = scan all <a href="..."> anchors (Bell County)
   *   'table' = parse <tr><td>Name</td><td><a href="...">Page 1</a>…</td></tr> rows (Hays CAD)
   */
  parseMode?: 'links' | 'table';
  /**
   * Optional BIS eSearch API URL that returns a JSON array of
   * { Id, Name } subdivision records for canonical name matching.
   * (Hays CAD: https://esearch.hayscad.com/Search/SubdivisionList)
   */
  subdivisionApiUrl?: string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Registry of counties that host a free plat file repository.
 * Key: lowercase county name (matches pipeline input.county).
 */
export const PLAT_REPO_REGISTRY: Record<string, PlatRepoConfig> = {
  // ── Bell County — Revize CMS, direct PDF downloads ────────────────────────
  bell: {
    indexUrlTemplate: 'https://www.bellcountytx.com/county_government/county_clerk/{letter}.php',
    fileBaseUrl: 'https://cms3.revize.com',
    countyDisplayName: 'Bell County Clerk plat repository (bellcountytx.com)',
    fileExt: 'pdf',
    parseMode: 'links',
    indexHeaders: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://www.bellcountytx.com/',
    },
    fileHeaders: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept':          'application/pdf,*/*;q=0.8',
      'Referer':         'https://www.bellcountytx.com/',
    },
  },
  // ── Hays County — Hays CAD WordPress, TIF images, 8,051 plats ────────────
  // Index:  https://hayscad.com/subdivisionplats/sublist{letter}/
  // Files:  https://hayscad.com/PA/Plats/{LETTER}/{NAME} VOL {N} PG {N}.TIF
  //         https://hayscad.com/wp-content/uploads/{path}.tif  (some older entries)
  // Notes:  Numeric subdivisions appear on sublista (not a separate 0-9 page).
  //         Site returns 403 without a real browser User-Agent.
  //         TIF files are converted to PNG by downloadPlatFile() before AI use.
  //         /Search/SubdivisionList provides canonical names for better matching.
  hays: {
    indexUrlTemplate: 'https://hayscad.com/subdivisionplats/sublist{letter}/',
    fileBaseUrl: 'https://hayscad.com',
    countyDisplayName: 'Hays CAD plat repository (hayscad.com)',
    fileExt: 'tif',
    numericsOnLetterA: true,
    parseMode: 'table',
    indexHeaders: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://hayscad.com/',
    },
    fileHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    },
    subdivisionApiUrl: 'https://esearch.hayscad.com/Search/SubdivisionList',
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
 * addition name suitable for looking up a plat file.
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
  const additionMatch = upper.match(
    /(.+?\b(?:ADDITION|SUBDIVISION|ESTATES?|SECTION|PHASE\s*\d*|UNIT\s*\d*|REPLAT|ANNEX(?:ATION)?|RANCH))\b/i,
  );
  if (additionMatch) {
    const cleaned = additionMatch[1].trim()
      .replace(/^LOT\s+\d+\s+(?:BLK|BLOCK)\s+\S+\s+/i, '').trim();
    if (cleaned.length > 5) return cleaned;
  }

  // Pattern 2: "LOT N BLK M <NAME>" — extract <NAME>
  const lotBlkMatch = upper.match(/LOT\s+\S+\s+(?:BLK|BLOCK)\s+\S+\s+(.+)/i);
  if (lotBlkMatch) {
    const name = lotBlkMatch[1].replace(/,.*$/, '').trim();
    if (name.length > 5) return name;
  }

  return null;
}

// ── Subdivision API Cache (for Hays CAD canonical names) ─────────────────────

interface SubdivisionApiRecord {
  Id: number | string;
  Name: string;
}

/** In-memory cache: county → { fetchedAt, names } */
const subdivisionApiCache = new Map<string, { fetchedAt: number; names: string[] }>();
const SUBDIVISION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fetches canonical subdivision names from a BIS eSearch SubdivisionList API.
 * Returns an empty array on failure (non-fatal; fuzzy matching falls back to plat index names).
 */
async function fetchSubdivisionApiNames(
  county: string,
  apiUrl: string,
  logger: PipelineLogger,
): Promise<string[]> {
  const cached = subdivisionApiCache.get(county);
  if (cached && Date.now() - cached.fetchedAt < SUBDIVISION_CACHE_TTL_MS) {
    return cached.names;
  }

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': new URL(apiUrl).origin + '/',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn('Stage2A', `Subdivision API ${apiUrl}: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json() as SubdivisionApiRecord[];
    const names = Array.isArray(data)
      ? data.map(r => (r.Name ?? '').toUpperCase().trim()).filter(Boolean)
      : [];
    subdivisionApiCache.set(county, { fetchedAt: Date.now(), names });
    logger.info('Stage2A', `Subdivision API: cached ${names.length} canonical names for ${county}`);
    return names;
  } catch (err) {
    logger.warn('Stage2A', `Subdivision API fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Letter Page Mapping ───────────────────────────────────────────────────────

function getLetter(subdivisionName: string, config: PlatRepoConfig): string | null {
  const first = subdivisionName.trim()[0]?.toUpperCase() ?? '';
  if (/[A-Z]/.test(first)) return first.toLowerCase();
  if (/[0-9]/.test(first)) {
    // Some counties (e.g. Hays) put numeric entries on the 'a' page
    return config.numericsOnLetterA ? 'a' : '0-9';
  }
  return null; // non-alphanumeric — cannot map to an index page
}

// ── Index Page Fetching ───────────────────────────────────────────────────────

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
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; STARR-RECON/1.0)',
      ...config.indexHeaders,
    };
    const response = await fetch(url, {
      headers,
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

// ── Plat Link Parsing ─────────────────────────────────────────────────────────

interface PlatLink {
  name: string;
  url:  string;
}

/**
 * Bell County style: scans all <a href="...pdf"> anchor tags in the HTML.
 * Each anchor text is the subdivision name; the href is the direct PDF URL.
 */
function parsePlatLinks(html: string, config: PlatRepoConfig): PlatLink[] {
  const ext = config.fileExt ?? 'pdf';
  const results: PlatLink[] = [];
  const seen = new Set<string>();

  // Match <a href="...{ext}...">NAME</a> — case-insensitive extension match
  const linkRegex = new RegExp(
    `<a\\s[^>]*href="([^"]*\\.${ext}[^"]*)"[^>]*>([^<]+)<\\/a>`,
    'gi',
  );
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1];
    const rawName = match[2].replace(/\s+/g, ' ').trim();
    if (!rawName || rawName.length < 3) continue;

    let fileUrl: string;
    if (rawHref.startsWith('http')) {
      fileUrl = rawHref;
    } else {
      fileUrl = config.fileBaseUrl + (rawHref.startsWith('/') ? '' : '/') + rawHref;
    }

    // Strip cache-busting query params (e.g. ?t=202307271154110)
    try {
      const u = new URL(fileUrl);
      u.searchParams.delete('t');
      fileUrl = u.toString();
    } catch {
      fileUrl = fileUrl.replace(/([?&])t=\d+/g, '').replace(/\?&/, '?').replace(/\?$/, '');
    }

    const key = rawName.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ name: rawName, url: fileUrl });
    }
  }

  return results;
}

/**
 * Hays CAD style: parses an HTML table where each row is:
 *   <tr>
 *     <td>SUBDIVISION NAME</td>
 *     <td><a href="/PA/Plats/A/NAME VOL 1 PG 1.TIF">Page 1</a>
 *         <a href="/PA/Plats/A/NAME VOL 1 PG 2.TIF">Page 2</a></td>
 *   </tr>
 *
 * We take only Page 1 (the plat drawing sheet) for AI analysis.
 */
function parsePlatTable(html: string, config: PlatRepoConfig): PlatLink[] {
  const ext = config.fileExt ?? 'tif';
  const results: PlatLink[] = [];
  const seen = new Set<string>();

  // Match each table row
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    // Extract <td> cells
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(cellMatch[1]);
    }
    if (cells.length < 2) continue;

    // Cell 0 = subdivision name (strip tags)
    const name = cells[0].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 3) continue;

    // Cell 1 = link(s) to plat pages — take the FIRST link (Page 1)
    const linkRegex = new RegExp(
      `href="([^"]*\\.${ext}[^"]*)"`,
      'i',
    );
    const linkMatch = cells[1].match(linkRegex);
    if (!linkMatch) continue;

    const rawHref = linkMatch[1];
    let fileUrl: string;
    if (rawHref.startsWith('http')) {
      fileUrl = rawHref;
    } else {
      fileUrl = config.fileBaseUrl + (rawHref.startsWith('/') ? '' : '/') + rawHref;
    }

    const key = name.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ name, url: fileUrl });
    }
  }

  return results;
}

/** Routes to the correct parser based on config.parseMode. */
function parsePlatIndex(html: string, config: PlatRepoConfig): PlatLink[] {
  return config.parseMode === 'table'
    ? parsePlatTable(html, config)
    : parsePlatLinks(html, config);
}

// ── Fuzzy Name Matching ───────────────────────────────────────────────────────

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

  let matches = 0;
  let significantMatches = 0;
  for (const t of tokensB) {
    if (tokensA.has(t)) {
      matches++;
      if (!STOP_WORDS.has(t)) significantMatches++;
    }
  }

  const significantB = tokensB.filter(t => !STOP_WORDS.has(t));
  const significantScore = significantB.length > 0 ? significantMatches / significantB.length : 0;
  const totalScore = matches / tokensB.length;

  return Math.max(significantScore * 0.7 + totalScore * 0.3, 0);
}

// ── File Download & Format Conversion ────────────────────────────────────────

/**
 * Downloads a plat file and returns it as base64.
 * TIF files are converted to PNG so Claude Vision can process them
 * (Claude does not accept TIFF format).
 * Returns { base64, mimeType } or null on failure.
 */
async function downloadPlatFile(
  fileUrl: string,
  config: PlatRepoConfig,
  logger: PipelineLogger,
): Promise<{ base64: string; mimeType: 'application/pdf' | 'image/png' } | null> {
  const isTif = (config.fileExt ?? 'pdf') === 'tif';
  const tracker = logger.startAttempt({
    layer: 'Stage2A',
    source: 'PlatRepo',
    method: isTif ? 'TIF-download' : 'PDF-download',
    input: fileUrl.substring(0, 100),
  });

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; STARR-RECON/1.0)',
      ...config.fileHeaders,
    };
    const response = await fetch(fileUrl, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      tracker({ status: 'fail', error: `HTTP ${response.status}` });
      return null;
    }
    const buffer = await response.arrayBuffer();

    if (isTif) {
      // Convert TIF → PNG using sharp (Claude Vision only accepts PNG/JPEG/GIF/WEBP)
      const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
      try {
        const pngBuffer = await sharp(Buffer.from(buffer))
          .png({ compressionLevel: 6 })
          .toBuffer();
        const base64 = pngBuffer.toString('base64');
        tracker({ status: 'success', dataPointsFound: 1, details: `TIF→PNG: ${buffer.byteLength}→${pngBuffer.byteLength} bytes` });
        return { base64, mimeType: 'image/png' };
      } catch (convErr) {
        tracker({ status: 'fail', error: `TIF conversion failed: ${convErr instanceof Error ? convErr.message : String(convErr)}` });
        return null;
      }
    } else {
      const base64 = Buffer.from(buffer).toString('base64');
      tracker({ status: 'success', dataPointsFound: 1, details: `PDF: ${buffer.byteLength} bytes` });
      return { base64, mimeType: 'application/pdf' };
    }
  } catch (err) {
    tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface PlatSearchResult {
  name:  string;
  url:   string;
  score: number;
}

/**
 * Searches a county's plat repository for plats matching the given subdivision name.
 * Optionally uses the county's BIS subdivision API to canonicalize the name first.
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

  // Optional: resolve canonical subdivision name from BIS API for better matching
  let searchName = subdivisionName;
  if (config.subdivisionApiUrl) {
    const canonicalNames = await fetchSubdivisionApiNames(county, config.subdivisionApiUrl, logger);
    if (canonicalNames.length > 0) {
      // Find the best-scoring canonical name and use it if it scores higher
      let bestCanonical = '';
      let bestScore = 0;
      for (const cn of canonicalNames) {
        const s = scorePlatMatch(cn, subdivisionName.toUpperCase());
        if (s > bestScore) { bestScore = s; bestCanonical = cn; }
      }
      if (bestScore >= 0.8 && bestCanonical) {
        searchName = bestCanonical;
        if (bestCanonical.toUpperCase() !== subdivisionName.toUpperCase()) {
          logger.info('Stage2A', `Canonical name: "${subdivisionName}" → "${bestCanonical}" (score=${bestScore.toFixed(2)})`);
        }
      }
    }
  }

  const letter = getLetter(searchName, config);
  if (!letter) {
    logger.warn('Stage2A', `Cannot map "${searchName}" to a plat index page — non-alphanumeric first character`);
    return [];
  }

  const html = await fetchPlatIndex(config, letter, logger);
  if (!html) return [];

  const links = parsePlatIndex(html, config);
  logger.info('Stage2A', `${config.countyDisplayName} /${letter} index: ${links.length} entries`);

  const scored: PlatSearchResult[] = links
    .map(link => ({ ...link, score: scorePlatMatch(link.name, searchName) }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    logger.info('Stage2A', `"${searchName}": ${scored.length} match(es) — best "${scored[0].name}" (score=${scored[0].score.toFixed(2)})`);
  } else {
    logger.info('Stage2A', `"${searchName}": no matches above score ${minScore}`);
  }
  return scored;
}

/**
 * Finds and downloads the best-matching plat for a subdivision from the
 * county's free plat repository.
 *
 * Returns null if the county has no repository, no match is found, or all downloads fail.
 */
export async function fetchBestMatchingPlat(
  county: string,
  subdivisionName: string,
  logger: PipelineLogger,
): Promise<{
  base64:   string;
  mimeType: 'application/pdf' | 'image/png';
  name:     string;
  url:      string;
  source:   string;
  fileExt:  'pdf' | 'tif';
} | null> {
  const config = getPlatRepoConfig(county);
  if (!config) return null;

  const matches = await searchCountyPlats(county, subdivisionName, logger);
  if (matches.length === 0) return null;

  // Try top 3 matches in case a download fails
  for (const match of matches.slice(0, 3)) {
    const result = await downloadPlatFile(match.url, config, logger);
    if (result) {
      return {
        ...result,
        name:    match.name,
        url:     match.url,
        source:  config.countyDisplayName,
        fileExt: config.fileExt ?? 'pdf',
      };
    }
  }

  logger.warn('Stage2A', `All download attempts failed for "${subdivisionName}" in ${config.countyDisplayName}`);
  return null;
}


// ── Registry ─────────────────────────────────────────────────────────────────
