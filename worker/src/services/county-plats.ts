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
    // Strip inner HTML tags from anchor text, decode HTML entities, normalize whitespace.
    // Entity decoding is needed because parsePlatLinks operates on raw HTML strings without
    // a full HTML parser — "&amp;" in the source stays as the 5-char literal "&amp;" until decoded.
    const stripped = rawName.replace(/<[^>]*>/g, '');
    const decoded = stripped
      .replace(/&amp;/gi, '&')
      .replace(/&apos;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
    let name = decoded.replace(/\s+/g, ' ').trim();
    if (!name) {
      // Category Q: empty anchor text — extract subdivision name from the PDF filename in the href.
      // e.g. href ".../ACADEMY MINI SELF STORAGE SUB.pdf" → "ACADEMY MINI SELF STORAGE SUB"
      const bareHref = rawHref.split('?')[0];
      const lastSeg = bareHref.split('/').pop() ?? '';
      let decoded = lastSeg;
      try { decoded = decodeURIComponent(lastSeg); } catch { /* keep raw segment */ }
      name = decoded.replace(/\.[^.]*$/, '').replace(/\+/g, ' ').trim();
    }
    if (!name || name.length < 3) return;

    let fileUrl: string;
    if (rawHref.startsWith('http')) {
      fileUrl = rawHref;
    } else {
      // Resolve relative hrefs from the site root (all pages have <base href="https://…/">).
      // CRITICAL: encode each path segment so that spaces become %20 and '#' becomes
      // %23 (otherwise '#' is misinterpreted as a URL fragment identifier).
      //   Pattern 1 (95%): "county_government/county_clerk/docs/plats/D/NAME.PDF?t=…"
      //   Pattern 2 ( 2%): "county_government/county_clerk/docs/plats/NAME.pdf?t=…"
      //   Pattern 3 ( 3%): "NAME.pdf?t=…"  → resolves to site root, not clerk dir
      const qIdx = rawHref.indexOf('?');
      const rawPath = qIdx >= 0 ? rawHref.slice(0, qIdx) : rawHref;
      const querySuffix = qIdx >= 0 ? rawHref.slice(qIdx) : '';
      const encodedPath = rawPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
      const separator = rawHref.startsWith('/') ? '' : '/';
      fileUrl = config.fileBaseUrl + separator + encodedPath + querySuffix;
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
    `<a\\s[^>]*href="([^"]*\\.${ext}[^"]*)"[^>]*>([\\s\\S]*?)<\\/a>`,
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
  // Pattern: /docs/plats/{LETTER-OR-#}/{URL_ENCODED_NAME}.pdf
  // Note: '#' is a valid subfolder name in the Bell County archive — match it too.
  if (results.length === 0) {
    const cdnRegex = /\/docs\/plats\/[A-Z0-9#]\/([^"'\s?]+\.pdf)/gi;
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
  // Handle HTML entity &amp; FIRST so that the single & replacement below works correctly
  // even when rawName comes from unparsed HTML (e.g. "TOPEKA &amp; SANTA FE" in anchor text).
  // After toUpperCase(), "&amp;" becomes "&AMP;" — match the uppercase form.
  n = n.replace(/&AMP;/g, ' AND ');      // &amp; (HTML entity) after toUpperCase → &AMP;
  n = n.replace(/&/g, ' AND ');
  n = n.replace(/#(\d)/g, 'NUMBER $1');
  n = n.replace(/#/g, 'NUMBER');
  // Remove apostrophes and periods WITHOUT spacing so contractions/abbreviations merge:
  //   ALBERTSON'S → ALBERTSONS  (not ALBERTSON S — avoids false token split)
  //   12.358 → 12358  (decimal points in acreage are not significant for name matching)
  n = n.replace(/['.]/g, '');
  // Strip remaining non-alphanumeric characters (except spaces) — handles hyphens, punctuation
  n = n.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // ── Expand abbreviations to canonical forms ─────────────────────────────
  // ADDITION variants
  n = n.replace(/\bADN\b/g, 'ADDITION');
  n = n.replace(/\bADDN\b/g, 'ADDITION');
  n = n.replace(/\bADDITON\b/g, 'ADDITION');    // typo
  n = n.replace(/\bADDITITON\b/g, 'ADDITION');  // typo
  n = n.replace(/\bAD\b/g, 'ADDITION');          // truncated (e.g. "MAYO AUTOMOTIVE AD")

  // SUBDIVISION variants
  // Note: \bSUB\b is safe — does not match inside SUBURBAN/SUBJECT (no word boundary after B there)
  n = n.replace(/\bSUB\b/g, 'SUBDIVISION');    // Category E: ~50 entries (e.g. BARNHARDT SUB)
  n = n.replace(/\bSUBD\b/g, 'SUBDIVISION');
  n = n.replace(/\bSUBDVISION\b/g, 'SUBDIVISION'); // typo

  // ESTATES (Category F: ~20+ entries)
  n = n.replace(/\bEST\b/g, 'ESTATES');
  n = n.replace(/\bESTATE\b/g, 'ESTATES');    // singular → plural (e.g. MAHLER-MARSHALL ESTATE)

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

  // BLOCK / LOT (Category I surveying shorthands used in some archive filenames)
  n = n.replace(/\bBLK\b/g, 'BLOCK');
  n = n.replace(/\bLT\b/g, 'LOT');
  // L1/L2.../L12... → LOT 1/2.../12..., B1/B2... → BLOCK 1/2... (Category I: L1 B1 → LOT 1 BLOCK 1)
  // \b ensures bare suffix letters (e.g. "PLAT B") are NOT expanded — only digit-suffixed forms.
  n = n.replace(/\bL(\d+)\b/g, 'LOT $1');
  n = n.replace(/\bB(\d+)\b/g, 'BLOCK $1');

  // INDUSTRIAL / INSTRUMENT (Category I)
  n = n.replace(/\bIND\b/g, 'INDUSTRIAL');
  n = n.replace(/\bINST\b/g, 'INSTRUMENT');

  // RESUBDIVISION
  n = n.replace(/\bRESUB\b/g, 'RESUBDIVISION');

  // NUMBER / NO
  n = n.replace(/\bNO\b/g, 'NUMBER');

  // ── Phase / Section abbreviations ──────────────────────────────────────
  // P1 → PHASE 1, S1 → SECTION 1 (single-digit attached abbrs)
  n = n.replace(/\bP(\d+)\b/g, 'PHASE $1');
  n = n.replace(/\bS(\d+)\b/g, 'SECTION $1');
  // PH N → PHASE N (e.g. NORTH GATE PH 6 A → PHASE 6 A)
  n = n.replace(/\bPH\s+(\d)/g, 'PHASE $1');
  // PH alone → PHASE (Category I: PH → PHASE)
  n = n.replace(/\bPH\b/g, 'PHASE');
  // SEC N → SECTION N (e.g. SEC 2 → SECTION 2)
  n = n.replace(/\bSEC\s+(\d)/g, 'SECTION $1');
  // SEC alone or before a letter → SECTION (Category C/I: SEC → SECTION)
  n = n.replace(/\bSEC\b/g, 'SECTION');
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

  // Category R: trailing "1 OF 2" / "2 OF 2" → letter suffix A / B (split-file archive variants)
  // Only match trailing position to avoid transforming mid-name phrases.
  n = n.replace(/\b([1-4])\s+OF\s+\d+\s*$/g,
    (_, d) => String.fromCharCode(64 + parseInt(d)));

  return n.replace(/\s+/g, ' ').trim();
}

// ── Levenshtein character similarity ────────────────────────────────────────

/**
 * Returns a 0-1 similarity score based on Levenshtein edit distance:
 *   1.0 = identical strings
 *   0.0 = completely different (or one/both empty)
 *
 * Uses space-optimised O(m·n) time / O(n) space Levenshtein algorithm.
 * Called from scorePlatMatch as a secondary boost for typo matching (Category J).
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a.length || !b.length) return 0.0;
  const m = a.length, n = b.length;
  // dp[j] = edit distance between a[0..i-1] and b[0..j-1]
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let diag = dp[0]; // dp[i-1][j-1]
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const above = dp[j]; // dp[i-1][j]
      dp[j] = a[i - 1] === b[j - 1]
        ? diag
        : 1 + Math.min(diag, above, dp[j - 1]);
      diag = above;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

/**
 * Scores how well `platName` (from the index) matches `targetName` (from the legal description).
 * Returns 0-1 where 1.0 = exact match.
 *
 * Both names are normalized through normalizePlatName() before comparison so that
 * abbreviation differences (ADN vs ADDITION, AMENDING vs AMENDED) don't prevent matches.
 *
 * A Levenshtein character-level similarity is used as a secondary boost for the
 * ~14.5% of cases that are simple typos or minor misspellings (Category J):
 *   VAZQUES ADN → VAZQUEZ ADDITION  (one-char transposition)
 *   HICKS FAMILY PROPETIES → HICKS FAMILY PROPERTIES  (missing letter)
 *   HILLLS OF WESTPARK → HILLS OF WESTPARK  (doubled letter)
 * The boost only activates when there is already some token overlap (tokenScore > 0) AND
 * the character similarity is ≥ 0.82, to avoid false-positive matching of truly
 * different names that happen to have short edit distances.
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

  const tokenScore = Math.max(significantScore * 0.7 + totalScore * 0.3, 0);

  // Levenshtein boost: only when there is existing token overlap AND very high
  // character similarity (≥0.82 ≈ ≤18% of chars differ). This catches typos
  // in proper-noun tokens while leaving completely unrelated names unaffected.
  if (tokenScore > 0) {
    const charSim = levenshteinSimilarity(a, b);
    if (charSim >= 0.82) return Math.max(tokenScore, charSim * 0.9);
  }

  return tokenScore;
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

// ── AI Plat Match Fallback ────────────────────────────────────────────────────

/** AI candidate match returned by askClaudeForPlatMatch. */
interface AiPlatMatchEntry {
  displayName: string;
  confidence:  number;
}

/**
 * In-memory cache: `county:normalizedSearchName` → AI match results
 * (empty array = AI confirmed no match).
 * Keyed by normalized form so that abbreviation variants share a cache entry.
 */
const platMatchAiCache = new Map<string, AiPlatMatchEntry[]>();

/** Model for plat-name AI matching (lightweight text task — haiku is sufficient). */
const PLAT_AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-haiku-4-5-20251022';

/**
 * Asks Claude to resolve a subdivision name against a set of candidates from the
 * plat archive.  Used as a fallback when the normalizer cannot find a confident match.
 *
 * Trigger conditions (from searchCountyPlats):
 *   1. Best normalizer score < 0.7  — no candidate above threshold
 *   2. Best normalizer score < 0.85 AND multiple candidates ≥ 0.3 — ambiguous
 *
 * Results are cached by normalised search key so each unique name is only sent to
 * Claude once.  Estimated cost: ~$0.01 per call × <5% of lookups = negligible.
 *
 * Returns an array of { displayName, confidence } in descending confidence order,
 * or [] if Claude found no match or the API call failed.
 */
async function askClaudeForPlatMatch(
  searchName: string,
  candidates: PlatSearchResult[],
  apiKey: string,
  logger: PipelineLogger,
): Promise<AiPlatMatchEntry[]> {
  if (!apiKey) {
    logger.warn('Stage2A', 'AI plat fallback skipped: no ANTHROPIC_API_KEY');
    return [];
  }

  const cacheKey = `bell:${normalizePlatName(searchName)}`;
  const cached = platMatchAiCache.get(cacheKey);
  if (cached !== undefined) {
    logger.info('Stage2A', `AI plat match: cache hit for "${searchName}" (${cached.length} match(es))`);
    return cached;
  }

  const top10 = candidates.slice(0, 10);
  if (top10.length === 0) {
    platMatchAiCache.set(cacheKey, []);
    return [];
  }

  const candidateList = top10
    .map((c, i) => `${i + 1}. "${c.name}" | score=${c.score.toFixed(2)}`)
    .join('\n');

  const prompt = `You are matching a subdivision name from Bell County CAD records to entries in the Bell County plat archive.

The search term from CAD is: "${searchName}"

Here are the closest candidates from the plat archive (display name | normalizer score):
${candidateList}

Which entry or entries are the correct match? Consider:
- Abbreviations (ADN=ADDITION, SUB=SUBDIVISION, P1=PHASE 1, S1=SECTION 1, etc.)
- Spelling errors in both the CAD name and the archive filenames
- Roman numerals (II=2, III=3, etc.) and spelled-out numbers (ONE=1, TWO=2)
- The plat may be split across multiple files (A and B pages)

Return JSON only: { "matches": [{"displayName": "...", "confidence": 0.0-1.0}] }
If no match exists, return: { "matches": [] }`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PLAT_AI_MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      logger.warn('Stage2A', `AI plat match HTTP ${response.status}`);
      platMatchAiCache.set(cacheKey, []);
      return [];
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
    };

    if (data.error) {
      logger.warn('Stage2A', `AI plat match API error: ${data.error.message ?? JSON.stringify(data.error)}`);
      platMatchAiCache.set(cacheKey, []);
      return [];
    }

    const text = (data.content?.[0]?.text ?? '').trim();
    // JSON may be wrapped in ```json ... ``` fences
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Stage2A', `AI plat match: no JSON in response: ${text.slice(0, 200)}`);
      platMatchAiCache.set(cacheKey, []);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as { matches?: unknown[] };
    const matches: AiPlatMatchEntry[] = (Array.isArray(parsed.matches) ? parsed.matches : [])
      .filter((m): m is { displayName: string; confidence: number } =>
        typeof m === 'object' && m !== null &&
        typeof (m as Record<string, unknown>).displayName === 'string' &&
        typeof (m as Record<string, unknown>).confidence === 'number')
      .map(m => ({
        displayName: m.displayName,
        confidence: Math.min(1, Math.max(0, m.confidence)),
      }))
      .sort((a, b) => b.confidence - a.confidence);

    logger.info('Stage2A',
      `AI plat match for "${searchName}": ${matches.length} match(es)` +
      (matches.length ? ` — "${matches[0].displayName}" (conf=${matches[0].confidence.toFixed(2)})` : ''));

    platMatchAiCache.set(cacheKey, matches);
    return matches;
  } catch (err) {
    logger.warn('Stage2A', `AI plat match failed: ${err instanceof Error ? err.message : String(err)}`);
    platMatchAiCache.set(cacheKey, []);
    return [];
  }
}

/** Clears the AI plat match cache.  Exposed for testing. */
export function clearPlatMatchAiCache(): void {
  platMatchAiCache.clear();
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
 *
 * When `anthropicApiKey` is provided, an AI fallback is triggered if the normalizer
 * cannot find a confident match (best score < 0.7, or ambiguous at < 0.85).
 */
export async function searchCountyPlats(
  county: string,
  subdivisionName: string,
  logger: PipelineLogger,
  minScore = 0.5,
  anthropicApiKey?: string,
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

  // Score all links (keep unfiltered set for AI fallback candidate pool)
  const allScored: PlatSearchResult[] = links
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
    .sort((a, b) => b.score - a.score);

  // ── AI Fallback ─────────────────────────────────────────────────────────────
  // Trigger when the normalizer cannot confidently resolve the match:
  //   Condition 1 — no candidate scores ≥ 0.7 (complete miss)
  //   Condition 2 — best candidate < 0.85 AND there are multiple near-misses (ambiguous)
  // Only fires when the caller supplies an API key (saves ~$0.01/call × <5% of lookups).
  const bestScore = allScored[0]?.score ?? 0;
  const nearMisses = allScored.filter(s => s.score >= 0.3);

  if (anthropicApiKey && (
    bestScore < 0.7 ||
    (bestScore < 0.85 && nearMisses.length > 1)
  )) {
    // Use all near-miss candidates (≥ 0.2) as AI prompt material
    const aiCandidates = allScored.filter(s => s.score >= 0.2).slice(0, 10);
    const aiMatches = await askClaudeForPlatMatch(
      searchName,
      aiCandidates.length > 0 ? aiCandidates : allScored.slice(0, 10),
      anthropicApiKey,
      logger,
    );
    // Boost the score of AI-confirmed matches; add any not-yet-scored AI matches
    for (const aiMatch of aiMatches) {
      const existing = allScored.find(s => s.name === aiMatch.displayName);
      if (existing) {
        existing.score = Math.max(existing.score, aiMatch.confidence);
      } else {
        const link = links.find(l => l.name === aiMatch.displayName);
        if (link) allScored.push({ ...link, score: aiMatch.confidence });
      }
    }
    if (aiMatches.length > 0) {
      allScored.sort((a, b) => b.score - a.score);
      logger.info('Stage2A',
        `AI boost: "${searchName}" → best now "${allScored[0]?.name}" (score=${allScored[0]?.score.toFixed(2)})`);
    }
  }

  const scored = allScored.filter(r => r.score >= minScore);

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
  anthropicApiKey?: string,
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
  const matches = await searchCountyPlats(county, subdivisionName, logger, 0.5, anthropicApiKey);
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


// ── Full Archive Scraper (Bell County) ────────────────────────────────────────

/**
 * Richer plat entry type returned by scrapePlatIndexPage().
 * Tracks the raw href, resolved URL, filename, letter page, and URL path pattern.
 */
export interface PlatArchiveEntry {
  /** Human-readable subdivision name from the anchor text (HTML entities decoded). */
  displayName: string;
  /** Decoded PDF filename without extension (from the href path segment). */
  filename: string;
  /** Raw href attribute value exactly as it appears in the HTML. */
  href: string;
  /** Absolute URL ready for download (cache-buster stripped, segments encoded). */
  resolvedUrl: string;
  /** Letter page this entry came from ('a'–'z' or '0-9'). */
  letter: string;
  /**
   * URL path pattern:
   *   'full'     = Pattern 1 (95%): …/docs/plats/{LETTER}/{NAME}.pdf  — includes letter subdir
   *   'nosubdir' = Pattern 2 ( 2%): …/docs/plats/{NAME}.pdf           — no letter subdir
   *   'bare'     = Pattern 3 ( 3%): {NAME}.pdf                        — bare filename only
   */
  pathType: 'full' | 'nosubdir' | 'bare';
}

/**
 * All letter pages in the Bell County plat archive: a–z plus the numeric page '0-9'.
 * Used by full-archive scraping (e.g. building a local index for bulk matching).
 */
export const PLAT_PAGES: string[] = 'abcdefghijklmnopqrstuvwxyz'.split('').concat(['0-9']);

/**
 * Scrapes a single letter page from the Bell County plat archive and returns all
 * plat entries found, with rich metadata for each link.
 *
 * Compared to searchCountyPlats (which scrapes one page for a specific search term),
 * this function is used for full-archive operations: building a local cache, bulk
 * verification, or pre-fetching all entries for a given letter.
 *
 * @param letter  One of PLAT_PAGES ('a'–'z' or '0-9')
 * @param logger  Pipeline logger for attempt tracking
 */
export async function scrapePlatIndexPage(
  letter: string,
  logger: PipelineLogger,
): Promise<PlatArchiveEntry[]> {
  const config = PLAT_REPO_REGISTRY.bell;
  const html = await fetchPlatIndex(config, letter, logger);
  if (!html) return [];

  const entries: PlatArchiveEntry[] = [];
  const seen = new Set<string>();

  /**
   * Classifies the URL path type based on the href structure:
   *   full     = has a letter subdirectory before the filename
   *   nosubdir = /docs/plats/ path but no letter subdir
   *   bare     = just a filename (no /docs/plats/ path component)
   */
  function classifyPathType(href: string): 'full' | 'nosubdir' | 'bare' {
    const path = href.split('?')[0];
    if (/\/docs\/plats\/[A-Z0-9#]\/[^/]+$/i.test(path)) return 'full';
    if (/\/docs\/plats\/[^/]+$/i.test(path)) return 'nosubdir';
    return 'bare';
  }

  /**
   * Resolves a raw href to an absolute, cache-buster-free URL.
   * Mirrors the logic in addLink() so that resolvedUrl is always correct.
   */
  function resolveHref(rawHref: string): string {
    if (rawHref.startsWith('http')) {
      try {
        const u = new URL(rawHref);
        u.searchParams.delete('t');
        return u.toString();
      } catch { return rawHref; }
    }
    const qIdx = rawHref.indexOf('?');
    const rawPath = qIdx >= 0 ? rawHref.slice(0, qIdx) : rawHref;
    const encodedPath = rawPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
    const separator = rawHref.startsWith('/') ? '' : '/';
    const url = config.fileBaseUrl + separator + encodedPath;
    try {
      const u = new URL(url);
      u.searchParams.delete('t');
      return u.toString();
    } catch { return url; }
  }

  /** Extracts the decoded filename (without extension) from a raw href. */
  function extractFilename(rawHref: string): string {
    const path = rawHref.split('?')[0];
    const last = path.split('/').pop() ?? '';
    try {
      return decodeURIComponent(last).replace(/\.pdf$/i, '').replace(/\+/g, ' ').trim();
    } catch {
      return last.replace(/\.pdf$/i, '').trim();
    }
  }

  /** Decodes HTML entities in anchor text (mirrors addLink entity decoding). */
  function decodeDisplayName(raw: string): string {
    return raw
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/gi, '&')
      .replace(/&apos;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function addEntry(rawHref: string, rawName: string): void {
    const displayName = decodeDisplayName(rawName);
    const filename = extractFilename(rawHref);
    // Category Q: empty anchor text — use filename as display name
    const finalDisplayName = displayName || filename;
    if (!finalDisplayName || finalDisplayName.length < 3) return;
    const key = finalDisplayName.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      displayName: finalDisplayName,
      filename,
      href: rawHref,
      resolvedUrl: resolveHref(rawHref),
      letter,
      pathType: classifyPathType(rawHref),
    });
  }

  // Strategy 1: match <a href="…pdf…">…</a> — most Bell County links
  const extRegex = /<a\s[^>]*href="([^"]*\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = extRegex.exec(html)) !== null) {
    addEntry(match[1], match[2]);
  }

  // Strategy 2: /docs/plats/ path pattern (covers uppercase .PDF and other edge cases)
  if (entries.length === 0) {
    const platPathRegex = /<a\s[^>]*href="([^"]*\/docs\/plats\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = platPathRegex.exec(html)) !== null) {
      addEntry(match[1], match[2]);
    }
  }

  logger.info('Stage2A', `scrapePlatIndexPage("${letter}"): ${entries.length} entries`);
  return entries;
}

// ── Registry ─────────────────────────────────────────────────────────────────
