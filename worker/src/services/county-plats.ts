// worker/src/services/county-plats.ts
//
// Generic county plat repository adapter.
//
// Supported county systems:
//   Bell County  — Revize CMS alphabetical PHP pages   → direct PDF links    (~1,500 plats)
//   Hays County  — Hays CAD WordPress sublist pages    → TIF image links     (8,051 plats)
//
// Bell County plat fetch strategy (layered, fastest-first):
//   Layer 0 — Direct Revize CDN URL construction (no scraping, ~1-2s)
//              URL: https://cms3.revize.com/revize/bellcountytx/
//                   county_government/county_clerk/docs/plats/{LETTER}/{NAME}.pdf
//   Layer 1 — bellcountytx.com alphabetical index page scrape + fuzzy match (~5-15s)
//   Layer 2 — Retry Layer 0 with URL-encoded name variations (dots, ampersands, etc.)
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
  /**
   * Direct URL template for constructing a plat PDF URL without scraping the index.
   * Placeholders:
   *   {LETTER} = uppercase first letter of the subdivision name (e.g., "A")
   *   {NAME}   = URL-encoded subdivision name (spaces → %20)
   * Example (Bell County):
   *   https://cms3.revize.com/revize/bellcountytx/county_government/county_clerk/docs/plats/{LETTER}/{NAME}.pdf
   * Layer 0 of the multi-layer fetch strategy — tried first before index page scraping.
   */
  directUrlTemplate?: string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/** Shared browser User-Agent used for all plat repository HTTP requests. */
const PLAT_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

/**
 * Registry of counties that host a free plat file repository.
 * Key: lowercase county name (matches pipeline input.county).
 */
export const PLAT_REPO_REGISTRY: Record<string, PlatRepoConfig> = {
  // ── Bell County — Revize CMS, direct PDF downloads ────────────────────────
  //
  // URL discovery (verified March 14, 2026):
  //   Index pages:  https://www.bellcountytx.com/county_government/county_clerk/{letter}.php
  //   Direct PDFs:  https://www.bellcountytx.com/county_government/county_clerk/docs/plats/{LETTER}/{NAME}.pdf
  //                 (the site auto-redirects to cms3.revize.com/revize/bellcountytx/... — always go through
  //                  bellcountytx.com, NEVER hit cms3.revize.com directly which returns 403)
  //
  // HTML structure of index pages (varies by page — ONLY reliable selector is <a href="*.pdf">):
  //   a.php  → UL > LI > A          (236 links)
  //   d.php  → UL > LI > SPAN > A   (242 links)
  //   m.php  → UL > LI > SPAN > A   (644 links)
  //   0-9.php → U > FONT > A        (56 links)
  //
  // URL resolution: every page has <base href="https://www.bellcountytx.com/"> so ALL relative hrefs
  // resolve from the site root. Three href patterns appear in the wild:
  //   Pattern 1 (95%): county_government/county_clerk/docs/plats/D/NAME.PDF   → prepend bellcountytx.com/
  //   Pattern 2 ( 2%): county_government/county_clerk/docs/plats/NAME.pdf     → prepend bellcountytx.com/
  //   Pattern 3 ( 3%): NAME.pdf                                                → prepend bellcountytx.com/
  //
  // Fetch strategy (fastest-first):
  //   Layer 0 — Direct bellcountytx.com URL construction (0 scraping, ~1-2s response)
  //   Layer 1 — bellcountytx.com index page scrape + fuzzy match (~5-15s)
  //   Layer 2 — Retry Layer 0 with name variations (A/B suffixes, abbreviation expansion, etc.)
  bell: {
    indexUrlTemplate: 'https://www.bellcountytx.com/county_government/county_clerk/{letter}.php',
    fileBaseUrl:      'https://www.bellcountytx.com',
    directUrlTemplate: 'https://www.bellcountytx.com/county_government/county_clerk/docs/plats/{LETTER}/{NAME}.pdf',
    countyDisplayName: 'Bell County Clerk plat repository (bellcountytx.com)',
    fileExt: 'pdf',
    parseMode: 'links',
    indexHeaders: {
      'User-Agent': PLAT_BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    fileHeaders: {
      'User-Agent': PLAT_BROWSER_UA,
      'Referer': 'https://www.bellcountytx.com/county_government/county_clerk/',
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
      'User-Agent':      PLAT_BROWSER_UA,
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://hayscad.com/',
    },
    fileHeaders: {
      'User-Agent': PLAT_BROWSER_UA,
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
 *
 * Also handles the Revize CMS format where links contain `/docs/plats/` in the
 * href — matching by path prefix when the extension-based match finds nothing.
 */
function parsePlatLinks(html: string, config: PlatRepoConfig): PlatLink[] {
  const ext = config.fileExt ?? 'pdf';
  const results: PlatLink[] = [];
  const seen = new Set<string>();

  function addLink(rawHref: string, rawName: string): void {
    // Strip inner HTML tags from anchor text, normalize whitespace
    const name = rawName.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 3) return;

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

    const key = name.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ name, url: fileUrl });
    }
  }

  // Strategy 1: match <a href="...{ext}...">…inner…</a> — allows inner tags in text
  const extRegex = new RegExp(
    `<a\\s[^>]*href="([^"]*\\.${ext}[^"]*)"[^>]*>([\s\S]*?)<\\/a>`,
    'gi',
  );
  let match: RegExpExecArray | null;
  while ((match = extRegex.exec(html)) !== null) {
    addLink(match[1], match[2]);
  }

  // Strategy 2: match any <a href="…/docs/plats/…">…</a> (Revize CMS path pattern)
  // Covers cases where the extension is not in the href or is uppercase (.PDF)
  if (results.length === 0) {
    const platPathRegex = /<a\s[^>]*href="([^"]*\/docs\/plats\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = platPathRegex.exec(html)) !== null) {
      addLink(match[1], match[2]);
    }
  }

  // Strategy 3: if still nothing, extract names from Revize CDN URLs anywhere in the HTML
  // Pattern: /docs/plats/{LETTER}/{URL_ENCODED_NAME}.pdf
  if (results.length === 0) {
    const cdnRegex = /\/docs\/plats\/[A-Z0-9]\/([^"'\s?]+\.pdf)/gi;
    while ((match = cdnRegex.exec(html)) !== null) {
      const encodedName = match[1].replace(/\.pdf$/i, '');
      try {
        const decodedName = decodeURIComponent(encodedName).replace(/\+/g, ' ');
        const fullHref = match[0].startsWith('http') ? match[0]
          : config.fileBaseUrl + match[0];
        addLink(fullHref, decodedName);
      } catch { /* skip malformed URLs */ }
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
  'REPLAT', 'AMENDED', 'AMENDMENT', 'FINAL', 'PLAT', 'SURVEY', 'ABSTRACT',
]);

/**
 * Normalizes a subdivision name for fuzzy matching by expanding abbreviations
 * to canonical forms, correcting common typos, and normalizing ordinals/cardinals.
 *
 * Handles all abbreviation patterns found in Bell County's 8,288-entry plat archive.
 * Applied to BOTH the search target and each index entry before comparison so that
 * "DAWSON RIDGE AMENDING PLAT" matches "DAWSON RIDGE AMENDED PLAT-A" (score > 0.8).
 */
export function normalizePlatName(name: string): string {
  let n = name.toUpperCase().trim();

  // Step 0: Normalize symbols BEFORE stripping punctuation
  n = n.replace(/&/g, ' AND ');
  n = n.replace(/#(\d)/g, 'NUMBER $1');
  n = n.replace(/#/g, 'NUMBER');
  // Strip non-alphanumeric characters (except spaces) — handles hyphens, punctuation
  n = n.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // ── Expand abbreviations to canonical forms ─────────────────────────────
  // ADDITION variants
  n = n.replace(/\bADN\b/g, 'ADDITION');
  n = n.replace(/\bADDN\b/g, 'ADDITION');
  n = n.replace(/\bADDITON\b/g, 'ADDITION');    // typo
  n = n.replace(/\bADDITITON\b/g, 'ADDITION');  // typo
  n = n.replace(/\bAD\b/g, 'ADDITION');          // truncated (e.g. "MAYO AUTOMOTIVE AD")

  // SUBDIVISION variants
  n = n.replace(/\bSUBD\b/g, 'SUBDIVISION');
  n = n.replace(/\bSUBDVISION\b/g, 'SUBDIVISION'); // typo
  // "SUB" alone is intentionally NOT expanded — too many non-subdivision uses
  // (e.g. "SUBURBAN", "SUBJECT") and Bell County does not use SUB as an abbreviation.

  // ESTATES
  n = n.replace(/\bEST\b/g, 'ESTATES');

  // REPLAT variants
  n = n.replace(/\bRPLT\b/g, 'REPLAT');
  n = n.replace(/\bRPLAT\b/g, 'REPLAT');
  n = n.replace(/\bRP\b/g, 'REPLAT');
  n = n.replace(/\bREPLATE\b/g, 'REPLAT');         // typo

  // AMENDED / AMENDING — Bell County uses these interchangeably in file names
  n = n.replace(/\bAMENDING\b/g, 'AMENDED');
  n = n.replace(/\bAMANDED\b/g, 'AMENDED');         // typo

  // AMENDMENT variants
  n = n.replace(/\bAMND\b/g, 'AMENDMENT');
  // "AMEND" alone (but not when followed by -ED or -ING which we already handled)
  n = n.replace(/\bAMEND\b/g, 'AMENDMENT');

  // FINAL PLAT
  n = n.replace(/\bFP\b/g, 'FINAL PLAT');

  // COMMERCIAL / HEIGHTS
  n = n.replace(/\bCOMM\b/g, 'COMMERCIAL');
  n = n.replace(/\bHTS\b/g, 'HEIGHTS');

  // RESUBDIVISION
  n = n.replace(/\bRESUB\b/g, 'RESUBDIVISION');

  // NUMBER / NO
  n = n.replace(/\bNO\b/g, 'NUMBER');

  // ── Phase / Section abbreviations ──────────────────────────────────────
  // P1 → PHASE 1, S1 → SECTION 1 (single-digit attached abbrs)
  n = n.replace(/\bP(\d+)\b/g, 'PHASE $1');
  n = n.replace(/\bS(\d+)\b/g, 'SECTION $1');
  // PH N → PHASE N, SEC N → SECTION N
  n = n.replace(/\bPH\s+(\d)/g, 'PHASE $1');
  n = n.replace(/\bSEC\s+(\d)/g, 'SECTION $1');
  // Extension shorthand: 1E → 1 EXTENSION
  n = n.replace(/\b(\d+)E\b/g, '$1 EXTENSION');

  // ── Normalize ordinals to plain arabic ─────────────────────────────────
  // 1ST → 1, 2ND → 2, etc.
  n = n.replace(/\b(\d+)(?:ST|ND|RD|TH)\b/g, '$1');

  // Spelled-out ordinals and cardinals → arabic
  const wordNums: Record<string, string> = {
    FIRST: '1', SECOND: '2', THIRD: '3', FOURTH: '4', FIFTH: '5',
    SIXTH: '6', SEVENTH: '7', EIGHTH: '8', NINTH: '9', TENTH: '10',
    ONE: '1', TWO: '2', THREE: '3', FOUR: '4', FIVE: '5',
    SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', TEN: '10',
  };
  for (const [word, num] of Object.entries(wordNums)) {
    n = n.replace(new RegExp(`\\b${word}\\b`, 'g'), num);
  }

  // Roman numerals (multi-char only — I/V/X are too ambiguous standalone)
  const romans: Record<string, string> = {
    II: '2', III: '3', IV: '4', VI: '6', VII: '7', VIII: '8', IX: '9',
    XI: '11', XII: '12', XIII: '13', XIV: '14', XV: '15',
  };
  for (const [roman, arabic] of Object.entries(romans)) {
    n = n.replace(new RegExp(`\\b${roman}\\b`, 'g'), arabic);
  }
  // Single-char romans only after known keywords
  n = n.replace(/\b(PHASE|SECTION|NUMBER|REPLAT|AMENDMENT|UNIT|PART)\s+I\b/g, '$1 1');
  n = n.replace(/\b(PHASE|SECTION|NUMBER|REPLAT|AMENDMENT|UNIT|PART)\s+V\b/g, '$1 5');
  n = n.replace(/\b(PHASE|SECTION|NUMBER|REPLAT|AMENDMENT|UNIT|PART)\s+X\b/g, '$1 10');

  return n.replace(/\s+/g, ' ').trim();
}

/**
 * Scores how well `platName` (from the index) matches `targetName` (from the legal description).
 * Returns 0-1 where 1.0 = exact match.
 *
 * Both names are normalized through normalizePlatName() before comparison so that
 * abbreviation differences (ADN vs ADDITION, AMENDING vs AMENDED) don't prevent matches.
 */
export function scorePlatMatch(platName: string, targetName: string): number {
  // Compare normalized forms
  const a = normalizePlatName(platName);
  const b = normalizePlatName(targetName);

  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = b.split(/\s+/).filter(Boolean);

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

// ── Direct URL Construction (Bell County Layer 0) ────────────────────────────

/**
 * Constructs the direct bellcountytx.com URL for a Bell County plat PDF.
 *
 * IMPORTANT (verified March 14, 2026): Always go through bellcountytx.com, NEVER
 * construct cms3.revize.com URLs directly — those return HTTP 403.
 * bellcountytx.com automatically redirects to the Revize CDN.
 *
 * Bell County URL pattern:
 *   https://www.bellcountytx.com/county_government/county_clerk/docs/plats/{LETTER}/{NAME}.pdf
 *
 * Where:
 *   {LETTER} = uppercase first letter of subdivision name (e.g. "A" for ASH FAMILY TRUST)
 *   {NAME}   = subdivision name URL-encoded via encodeURIComponent
 *              (spaces → %20, periods → %2E, etc.)
 *
 * Example:
 *   "ASH FAMILY TRUST 12.358 ACRE ADDITION"
 *   → https://www.bellcountytx.com/county_government/county_clerk/docs/plats/A/
 *       ASH%20FAMILY%20TRUST%2012.358%20ACRE%20ADDITION.pdf
 *
 * Note: Bell County plats are often split into multiple files (A, B).
 * Use directUrlNameVariants() to try " A", " B", " C" suffixes as well.
 * Returns null if the config has no directUrlTemplate.
 */
export function constructDirectPlatUrl(
  subdivisionName: string,
  config: PlatRepoConfig,
): string | null {
  if (!config.directUrlTemplate) return null;
  const upper = subdivisionName.trim().toUpperCase();
  const letter = upper[0] ?? '';
  if (!letter || !/[A-Z0-9]/.test(letter)) return null;

  // encodeURIComponent: spaces → %20, periods → %2E, special chars fully encoded.
  // The Revize CDN accepts these encoded names (verified March 2026).
  const encoded = encodeURIComponent(upper);

  return config.directUrlTemplate
    .replace('{LETTER}', letter)
    .replace('{NAME}', encoded);
}

/**
 * Generates name variants for direct URL tries.
 * Bell County file names may differ slightly in punctuation from the search term,
 * and many plats are split across multiple files with A/B/C letter suffixes.
 * Returns the original name plus cleaned alternatives.
 */
export function directUrlNameVariants(subdivisionName: string): string[] {
  const u = subdivisionName.trim().toUpperCase();
  const base = new Set<string>([u]);

  // Variant: replace & with AND
  base.add(u.replace(/&/g, 'AND').replace(/\s+/g, ' ').trim());
  // Variant: remove trailing section identifiers
  base.add(u.replace(/\s+(SECTION|PHASE|PART)\s+\d+$/i, '').trim());
  // Variant: replace / with space
  base.add(u.replace(/\//g, ' ').replace(/\s+/g, ' ').trim());

  // Bell County plats are often split into multiple files with letter suffixes:
  //   "DAWSON RIDGE AMENDING PLAT" → "DAWSON RIDGE AMENDING PLAT A", "DAWSON RIDGE AMENDING PLAT B"
  // We want to try the base name FIRST, then the suffixed variants.
  const suffixed: string[] = [];
  for (const variant of base) {
    for (const suffix of ['A', 'B', 'C', 'D']) {
      suffixed.push(`${variant} ${suffix}`);
    }
  }

  // Return base variants first (exact match is best), then suffixed variants
  return [...base, ...suffixed].filter(Boolean);
}


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
    .map(link => {
      // Score against the display name (link text)
      const nameScore = scorePlatMatch(link.name, searchName);
      // Also score against the filename extracted from the URL — these often differ
      // (e.g. link text "DAWSON RIDGE AMENDED PLAT-A" vs file "DAWSON RIDGE AMENDING PLAT A.pdf")
      let hrefScore = 0;
      try {
        const pathname = new URL(link.url).pathname;
        const filenameEncoded = pathname.split('/').pop() ?? '';
        const filename = decodeURIComponent(filenameEncoded).replace(/\.[pP][dD][fF]$/, '');
        hrefScore = scorePlatMatch(filename, searchName);
      } catch { /* ignore URL parsing errors */ }
      return { ...link, score: Math.max(nameScore, hrefScore) };
    })
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
 * Multi-layer strategy (fastest-first):
 *   Layer 0 — Direct CDN URL construction (no scraping, ~1-2s) — Bell County only
 *   Layer 1 — Index page scrape + fuzzy match (~5-15s)
 *   Layer 2 — Direct URL retry with name variants (ampersands, trailing sections, etc.)
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

  // ── Layer 0: Direct CDN URL (Bell County Revize CMS) ─────────────────────
  if (config.directUrlTemplate) {
    const variants = directUrlNameVariants(subdivisionName);
    for (const variant of variants) {
      const directUrl = constructDirectPlatUrl(variant, config);
      if (!directUrl) continue;

      const tracker = logger.startAttempt({
        layer: 'Stage2A',
        source: 'PlatRepo-Direct',
        method: 'direct-url',
        input: directUrl.substring(0, 120),
      });

      try {
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (compatible; STARR-RECON/1.0)',
          ...config.fileHeaders,
        };
        const response = await fetch(directUrl, {
          headers,
          signal: AbortSignal.timeout(20_000),
        });

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          tracker({
            status: 'success',
            dataPointsFound: 1,
            details: `Direct URL hit: ${buffer.byteLength} bytes — ${variant}`,
          });
          logger.info('Stage2A',
            `Layer 0 (direct URL): "${variant}" → ${buffer.byteLength} bytes from ${directUrl.substring(0, 80)}`);
          return {
            base64,
            mimeType: 'application/pdf',
            name: variant,
            url: directUrl,
            source: `${config.countyDisplayName} (direct URL)`,
            fileExt: 'pdf',
          };
        }

        tracker({ status: 'fail', error: `HTTP ${response.status} — falling through to index scrape` });
        logger.info('Stage2A', `Layer 0 miss: "${variant}" → HTTP ${response.status} — trying index scrape`);
      } catch (directErr) {
        tracker({ status: 'fail', error: directErr instanceof Error ? directErr.message : String(directErr) });
      }
    }
  }

  // ── Layer 1: Index page scrape + fuzzy match ──────────────────────────────
  const matches = await searchCountyPlats(county, subdivisionName, logger);
  if (matches.length > 0) {
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
  }

  logger.warn('Stage2A', `All layers failed for "${subdivisionName}" in ${config.countyDisplayName}`);
  return null;
}


// ── Registry ─────────────────────────────────────────────────────────────────
