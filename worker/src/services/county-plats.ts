/**
 * County Plat Repository Adapter
 *
 * Generic adapter for searching county clerk plat repositories that publish
 * alphabetical PDF indexes. Many Texas counties host plat records on their
 * county website (often via Revize CMS) organized by letter with direct PDF links.
 *
 * The adapter is config-driven — each county's plat repository is described
 * by a PlatRepoConfig entry in the PLAT_REPO_REGISTRY. Adding a new county
 * only requires adding a new entry; no code changes needed.
 *
 * This adapter:
 *   1. Extracts subdivision/addition name from CAD legal description
 *   2. Looks up the county's plat repository config
 *   3. Fetches the appropriate alphabetical index page
 *   4. Fuzzy-matches plat names against the subdivision
 *   5. Downloads matching plat PDF(s)
 */

import type { PipelineLogger } from '../lib/logger.js';

// ── Plat Repository Configuration ─────────────────────────────────────────────

export interface PlatRepoConfig {
  /** County name (lowercase key, e.g., 'bell') */
  county: string;
  /** Human-readable county name for logging */
  countyDisplayName: string;
  /**
   * URL template for alphabetical index pages.
   * Use {letter} as placeholder — replaced with lowercase letter (a-z) or '0-9'.
   * Example: 'https://www.bellcountytx.com/county_government/county_clerk/{letter}.php'
   */
  indexUrlTemplate: string;
  /**
   * Base URL for resolving relative PDF hrefs found in the index pages.
   * Example: 'https://cms3.revize.com/revize/bellcountytx'
   */
  pdfBaseUrl: string;
  /**
   * Path prefix to prepend when resolving relative hrefs that don't start
   * with the expected prefix. Used as: `${pdfBaseUrl}/${relativePathPrefix}/${href}`
   */
  relativePathPrefix?: string;
  /**
   * File extensions to match in index pages (default: ['.pdf']).
   * Hays CAD uses TIF images instead of PDFs.
   */
  fileExtensions?: string[];
  /**
   * HTML parsing mode:
   * - 'link-list': Standard <a href="...pdf">Name</a> links (default, Bell County / Revize)
   * - 'table': HTML table with name in first <td>, file links in second <td> (Hays CAD)
   */
  parseMode?: 'link-list' | 'table';
  /**
   * Custom HTTP headers for fetching index pages and files.
   * Some sites (Hays CAD) block requests without browser-like User-Agent.
   */
  customHeaders?: Record<string, string>;
  /**
   * Whether numeric-starting subdivisions are on the first-letter page
   * rather than a separate '0-9' page. (Hays CAD puts "117 Business Park" on sublista)
   */
  numericsOnLetterPage?: boolean;
  /** Notes for documentation */
  notes?: string;
}

/**
 * Registry of county plat repositories.
 * Key: lowercase county name (matches input.county.toLowerCase())
 *
 * To add a new county, add a new entry here. The adapter handles the rest.
 */
/** Browser-like headers for sites that block generic User-Agents */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const PLAT_REPO_REGISTRY: Record<string, PlatRepoConfig> = {
  bell: {
    county: 'bell',
    countyDisplayName: 'Bell County',
    indexUrlTemplate: 'https://www.bellcountytx.com/county_government/county_clerk/{letter}.php',
    pdfBaseUrl: 'https://cms3.revize.com/revize/bellcountytx',
    relativePathPrefix: 'county_government/county_clerk',
    notes: 'Revize CMS, plats organized A-Z + 0-9',
  },
  hays: {
    county: 'hays',
    countyDisplayName: 'Hays County',
    indexUrlTemplate: 'https://hayscad.com/subdivisionplats/sublist{letter}/',
    pdfBaseUrl: 'https://hayscad.com',
    fileExtensions: ['.tif', '.TIF'],
    parseMode: 'table',
    customHeaders: BROWSER_HEADERS,
    numericsOnLetterPage: true,
    notes: 'Hays CAD (WordPress/Elementor), 8000+ TIF plat images organized A-Z. Subdivision API at esearch.hayscad.com/Search/SubdivisionList',
  },
};

/**
 * Check whether a county has a plat repository configured.
 */
export function hasPlatRepository(county: string): boolean {
  return county.toLowerCase() in PLAT_REPO_REGISTRY;
}

/**
 * Get the plat repository config for a county, or null if none exists.
 */
export function getPlatRepoConfig(county: string): PlatRepoConfig | null {
  return PLAT_REPO_REGISTRY[county.toLowerCase()] ?? null;
}

/**
 * List all counties with configured plat repositories.
 */
export function listPlatRepoCounties(): string[] {
  return Object.keys(PLAT_REPO_REGISTRY);
}

// ── Plat Match Types ──────────────────────────────────────────────────────────

export interface PlatMatch {
  /** Name of the plat as listed on the index page */
  name: string;
  /** Direct URL to the plat PDF */
  pdfUrl: string;
  /** How well the name matched (0-1) */
  matchScore: number;
}

// ── Subdivision Name Extraction ───────────────────────────────────────────────

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

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Determine which letter page(s) to fetch for a given subdivision name.
 * Some repos (Hays CAD) put numeric-starting names on the 'a' page.
 */
function getLetterPages(name: string, config: PlatRepoConfig): string[] {
  const first = name.charAt(0).toUpperCase();
  if (/\d/.test(first)) {
    return config.numericsOnLetterPage ? ['a'] : ['0-9'];
  }
  if (first >= 'A' && first <= 'Z') return [first.toLowerCase()];
  return [];
}

/**
 * Fetch a letter index page and extract all plat file links.
 */
async function fetchPlatIndex(
  config: PlatRepoConfig,
  letter: string,
  logger: PipelineLogger,
): Promise<Array<{ name: string; pdfUrl: string }>> {
  const url = config.indexUrlTemplate.replace('{letter}', letter);
  logger.info('Stage2A-Plats', `Fetching plat index: ${url}`);

  const headers = config.customHeaders ?? {
    'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)',
    Accept: 'text/html',
  };

  try {
    const resp = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      logger.warn('Stage2A-Plats', `Index page returned HTTP ${resp.status}`);
      return [];
    }

    const html = await resp.text();
    const parseMode = config.parseMode ?? 'link-list';
    return parseMode === 'table'
      ? parsePlatTable(html, config)
      : parsePlatLinks(html, config);
  } catch (err) {
    logger.warn('Stage2A-Plats', `Failed to fetch index: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Build a regex pattern matching configured file extensions.
 */
function buildExtensionPattern(config: PlatRepoConfig): string {
  const exts = config.fileExtensions ?? ['.pdf'];
  // Escape dots and join with alternation
  return exts.map(e => e.replace('.', '\\.')).join('|');
}

/**
 * Resolve a relative href to an absolute URL using config.
 */
function resolveHref(href: string, config: PlatRepoConfig): string {
  if (href.startsWith('http')) return href.split('?')[0];

  const cleanHref = href.replace(/^\//, '');
  const prefix = config.relativePathPrefix ?? '';
  if (prefix && cleanHref.startsWith(prefix.replace(/^\//, ''))) {
    return `${config.pdfBaseUrl}/${cleanHref}`.split('?')[0];
  } else if (prefix) {
    return `${config.pdfBaseUrl}/${prefix}/${cleanHref}`.split('?')[0];
  }
  return `${config.pdfBaseUrl}/${cleanHref}`.split('?')[0];
}

/**
 * Parse plat PDF links from the index page HTML (link-list mode).
 * Links are in <li><a href="...pdf">NAME</a></li> format (common Revize CMS pattern).
 */
function parsePlatLinks(html: string, config: PlatRepoConfig): Array<{ name: string; pdfUrl: string }> {
  const results: Array<{ name: string; pdfUrl: string }> = [];
  const seen = new Set<string>();

  const extPat = buildExtensionPattern(config);
  const linkPattern = new RegExp(
    `<a\\s[^>]*href=["']([^"']*(?:${extPat})[^"']*)["'][^>]*>([^<]+)<\\/a>`,
    'gi',
  );
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const name = match[2].trim();

    if (!name || seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());

    const pdfUrl = resolveHref(href, config);
    results.push({ name, pdfUrl });
  }

  return results;
}

/**
 * Parse plat file links from HTML table format (Hays CAD).
 *
 * Expected structure:
 *   <tr><td>Subdivision Name</td><td><a href="...TIF">Page 1</a> <a href="...TIF">Page 2</a></td></tr>
 *
 * Returns one entry per subdivision (using first page link only for initial match).
 */
function parsePlatTable(html: string, config: PlatRepoConfig): Array<{ name: string; pdfUrl: string }> {
  const results: Array<{ name: string; pdfUrl: string }> = [];
  const seen = new Set<string>();

  const extPat = buildExtensionPattern(config);

  // Match table rows: extract both <td> cells
  const rowPattern = /<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  const linkInCell = new RegExp(
    `href=["']([^"']*(?:${extPat})[^"']*)["']`,
    'gi',
  );

  let rowMatch;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rawName = rowMatch[1].replace(/&amp;/g, '&').replace(/&#8211;/g, '–').trim();
    const linksCell = rowMatch[2];

    // Skip header rows or empty names
    if (!rawName || rawName.toLowerCase().includes('recorded plats')) continue;
    if (seen.has(rawName.toUpperCase())) continue;
    seen.add(rawName.toUpperCase());

    // Extract first file link from the links cell (Page 1)
    linkInCell.lastIndex = 0;
    const linkMatch = linkInCell.exec(linksCell);
    if (!linkMatch) continue;

    let href = linkMatch[1].replace(/&amp;/g, '&');
    const pdfUrl = resolveHref(href, config);

    // Skip broken links (some Hays entries have malformed hrefs like "https://ACORD ACRES...")
    if (pdfUrl.includes(' ') && !pdfUrl.includes('%20')) continue;

    results.push({ name: rawName, pdfUrl });
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

  let matchedTokens = 0;
  for (const token of tnTokens) {
    if (pnTokens.includes(token)) matchedTokens++;
  }

  const tokenScore = matchedTokens / tnTokens.length;

  // Boost if significant (non-common) words match
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
 * Detect the file format from a URL.
 */
function detectFileFormat(url: string): 'pdf' | 'tif' {
  const lower = url.toLowerCase();
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'tif';
  return 'pdf';
}

/**
 * Download a plat file (PDF or TIF) and return its content as a base64-encoded buffer.
 */
async function downloadPlatFile(
  fileUrl: string,
  logger: PipelineLogger,
  config?: PlatRepoConfig,
): Promise<{ base64: string; sizeBytes: number; format: 'pdf' | 'tif' } | null> {
  const format = detectFileFormat(fileUrl);
  logger.info('Stage2A-Plats', `Downloading plat ${format.toUpperCase()}: ${fileUrl}`);

  const headers = config?.customHeaders ?? {
    'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)',
  };

  try {
    const resp = await fetch(fileUrl, {
      headers: {
        ...headers,
        Accept: format === 'tif' ? 'image/tiff,*/*' : 'application/pdf',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      logger.warn('Stage2A-Plats', `File download returned HTTP ${resp.status}`);
      return null;
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    logger.info('Stage2A-Plats', `Downloaded ${buf.length} bytes (${format})`);
    return { base64: buf.toString('base64'), sizeBytes: buf.length, format };
  } catch (err) {
    logger.warn('Stage2A-Plats', `File download failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search a county's plat repository for plats matching a subdivision name.
 *
 * @param county - County name (e.g., 'Bell')
 * @param subdivisionName - The subdivision/addition name from the CAD legal description
 * @param logger - Pipeline logger
 * @param minScore - Minimum match score to include (default 0.6)
 * @returns Matched plats sorted by score descending, or empty array if county has no plat repo
 */
export async function searchCountyPlats(
  county: string,
  subdivisionName: string,
  logger: PipelineLogger,
  minScore = 0.6,
): Promise<PlatMatch[]> {
  const config = getPlatRepoConfig(county);
  if (!config) {
    logger.info('Stage2A-Plats', `No plat repository configured for ${county} County`);
    return [];
  }

  const tracker = logger.startAttempt({
    layer: 'Stage2A',
    source: `${config.countyDisplayName} Plats`,
    method: `${config.countyDisplayName} plat repository`,
    input: subdivisionName,
  });

  try {
    const letters = getLetterPages(subdivisionName, config);
    if (letters.length === 0) {
      tracker({ status: 'fail', details: 'Could not determine letter page for subdivision name' });
      return [];
    }

    const allPlats: Array<{ name: string; pdfUrl: string }> = [];
    for (const letter of letters) {
      const plats = await fetchPlatIndex(config, letter, logger);
      allPlats.push(...plats);
    }

    tracker.step(`Found ${allPlats.length} plat(s) on ${letters.join(', ')} page(s)`);

    if (allPlats.length === 0) {
      tracker({ status: 'fail', details: 'No plats found on index page' });
      return [];
    }

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
 * Full plat retrieval: search + download the best matching plat file (PDF or TIF).
 *
 * @param county - County name (e.g., 'Bell')
 * @param subdivisionName - The subdivision/addition name
 * @param logger - Pipeline logger
 * @returns The plat file as base64 + metadata, or null if no match / county has no repo
 */
export async function fetchBestMatchingPlat(
  county: string,
  subdivisionName: string,
  logger: PipelineLogger,
): Promise<{
  match: PlatMatch;
  pdfBase64: string;
  pdfSizeBytes: number;
  fileFormat: 'pdf' | 'tif';
  source: string;
} | null> {
  const config = getPlatRepoConfig(county);
  if (!config) return null;

  const matches = await searchCountyPlats(county, subdivisionName, logger);
  if (matches.length === 0) return null;

  for (const match of matches.slice(0, 3)) {
    const file = await downloadPlatFile(match.pdfUrl, logger, config);
    if (file) {
      return {
        match,
        pdfBase64: file.base64,
        pdfSizeBytes: file.sizeBytes,
        fileFormat: file.format,
        source: `${config.countyDisplayName} plat repository`,
      };
    }
  }

  return null;
}
