/**
 * Bell County CAD Scraper
 *
 * Searches Bell Central Appraisal District (esearch.bellcad.org) for property
 * records. Uses a multi-layer cascading strategy:
 *
 *   Layer 1 — Direct property ID HTTP fetch (fastest, ~1-2s)
 *             URL: esearch.bellcad.org/Property/View/{propId}
 *
 *   Layer 2 — HTTP API keyword search (with session cookie)
 *             Tries multiple address variants (FM/CR stripping, partial)
 *
 *   Layer 3 — searchBisCad() Playwright browser automation
 *             Full Bell CAD eSearch SPA interaction (5-15s)
 *             Falls back automatically to owner-name tab when all address
 *             results are personal property (Type P).
 *
 *   Layer 4 — Owner name direct API search
 *             GET /api/Search/GetPropertySearchByOwner?ownerName=...
 *
 * Cascading identifier enrichment:
 *   When a property is found, ALL identifiers (ID, owner, instruments,
 *   deed history) are extracted and returned so the orchestrator can feed
 *   them into the clerk and plat scrapers.
 *
 * Personal property (BP/P) detection:
 *   If the result is a business equipment account, the scraper pivots to
 *   a land account search using the owner name + Map ID prefix for
 *   geographic filtering.
 *
 * Bell CAD URL reference (verified March 2026):
 *   eSearch: https://esearch.bellcad.org
 *   Detail:  https://esearch.bellcad.org/Property/View/{propId}?year={year}
 *   API:     https://esearch.bellcad.org/api/Search/GetPropertySearchByOwner?ownerName=...
 */

import { BELL_ENDPOINTS, RATE_LIMITS, TIMEOUTS } from '../config/endpoints.js';
import { ESEARCH_FORMATS } from '../config/field-maps.js';
import type { ScreenshotCapture } from '../types/research-result.js';
import { withRetry } from '../utils/retry.js';

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
  /** Real project ID — used to bind the scraper logger to the project's live log registry */
  projectId?: string;
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
  const startedAt = Date.now();

  const progress = (phase: string, message: string) => {
    const elapsed = Date.now() - startedAt;
    onProgress({ phase, message: `[+${elapsed}ms] ${message}`, timestamp: new Date().toISOString() });
  };

  // ── Layer 1: Direct property ID lookup (fastest: ~1-2s) ────────────
  if (input.propertyId) {
    progress('CAD-L1', `Direct ID lookup: ${input.propertyId}`);
    const result = await lookupByPropertyId(input.propertyId, screenshots, urlsVisited, progress);
    if (result) {
      progress('CAD-L1', `✓ Found property ${input.propertyId}: owner="${result.ownerName}" type=${result.propertyType ?? 'unknown'}`);
      return maybeEnrichWithDetail(result, screenshots, urlsVisited, progress);
    }
    progress('CAD-L1', `No result for ID ${input.propertyId} — continuing to next layer`);
  }

  // ── Layer 2: HTTP API keyword search with session cookie ────────────
  if (input.address) {
    progress('CAD-L2', `HTTP keyword search: "${input.address}"`);
    const result = await searchByAddress(input.address, screenshots, urlsVisited, progress);
    if (result) {
      progress('CAD-L2', `✓ Address search matched: ID=${result.propertyId} owner="${result.ownerName}"`);
      // Check if this is a personal property (BP/P) result and pivot if so
      const typeCode = (result.propertyType ?? '').toUpperCase();
      const isBP = typeCode === 'BP' || typeCode === 'P' ||
        /^BUSINESS\s+PERSONAL\s+PROPERTY/i.test(result.legalDescription ?? '');
      if (isBP) {
        progress('CAD-L2', `⚠ Result is personal property (${typeCode}) — pivoting to land account search`);
        const landResult = await pivotToLandAccount(result, input, screenshots, urlsVisited, progress);
        if (landResult) return landResult;
        progress('CAD-L2', 'BP pivot found no land accounts — returning personal property result');
      }
      return maybeEnrichWithDetail(result, screenshots, urlsVisited, progress);
    }
    progress('CAD-L2', 'HTTP keyword search found nothing — trying Playwright (Layer 3)');
  }

  // ── Layer 3: searchBisCad() Playwright browser automation ──────────
  // Uses the proven bis-cad.ts layer that handles the full BIS eSearch SPA,
  // including: session management, multiple address variant attempts,
  // Type P pivot, owner-name tab fallback, Playwright OCR.
  const addressOrOwner = input.address ?? input.ownerName;
  if (addressOrOwner) {
    progress('CAD-L3', `Playwright CAD search: "${addressOrOwner}"`);
    const result = await searchWithBisCad(input, screenshots, urlsVisited, progress);
    if (result) {
      progress('CAD-L3', `✓ Playwright found: ID=${result.propertyId} owner="${result.ownerName}"`);
      return result;
    }
    progress('CAD-L3', 'Playwright search found nothing — trying owner API (Layer 4)');
  }

  // ── Layer 4: Owner name direct API search ───────────────────────────
  const ownerToSearch = input.ownerName ?? extractOwnerHint(input.address);
  if (ownerToSearch) {
    progress('CAD-L4', `Owner API search: "${ownerToSearch}"`);
    const result = await searchByOwnerApi(ownerToSearch, null, screenshots, urlsVisited, progress);
    if (result) {
      progress('CAD-L4', `✓ Owner API found: ID=${result.propertyId}`);
      return maybeEnrichWithDetail(result, screenshots, urlsVisited, progress);
    }
  }

  progress('CAD', `⚠ All layers exhausted — Bell CAD has no record for this property`);
  return null;
}

// ── Internal: Property ID Lookup ─────────────────────────────────────

/**
 * Fetch Bell CAD property detail page by ID.
 * Parses owner, legal description, deed history, acreage, type.
 * Returns null on failure or if page has no useful data.
 */
async function lookupByPropertyId(
  propId: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): Promise<CadSearchResult | null> {
  const currentYear = new Date().getFullYear();
  const url = `${BELL_ENDPOINTS.cad.propertyDetail(propId)}?year=${currentYear}`;
  urlsVisited.push(url);

  try {
    const resp = await withRetry(
      () => fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': BELL_ENDPOINTS.cad.home,
        },
        signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
      }),
      { maxAttempts: 2, initialDelayMs: 1000, label: `CAD detail ${propId}` },
    );
    if (!resp.ok) {
      progress('CAD-L1', `HTTP ${resp.status} for property ${propId} — skipping`);
      return null;
    }
    const html = await resp.text();
    if (html.length < 200) {
      progress('CAD-L1', `Empty response for property ${propId}`);
      return null;
    }
    return parsePropertyDetailHtml(html, propId, 'http-api', screenshots, urlsVisited, progress);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress('CAD-L1', `Error fetching property ${propId}: ${msg}`);
    if (/timeout|abort/i.test(msg)) {
      progress('CAD-L1', '  ↳ Bell CAD may be slow or temporarily unavailable');
    }
    return null;
  }
}

// ── Internal: Address Search (HTTP + Playwright) ──────────────────────

async function searchByAddress(
  address: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): Promise<CadSearchResult | null> {
  const session = await acquireSession(screenshots, urlsVisited, progress);
  if (!session) {
    progress('CAD-L2', 'Failed to acquire Bell CAD session — falling through to Layer 3');
    return null;
  }

  const parsed = parseAddressComponents(address);
  if (!parsed) {
    progress('CAD-L2', `Could not parse address components: "${address}"`);
    return null;
  }

  const variants = generateSearchVariants(parsed);
  progress('CAD-L2', `Trying ${variants.length} address variant(s): ${variants.slice(0, 3).map(v => `"${[v.number, v.name].filter(Boolean).join(' ')}"`).join(', ')}...`);

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
        const variantLabel = [variant.number, variant.name].filter(Boolean).join(' ');
        progress('CAD-L2', `Variant "${variantLabel}": ${results.length} result(s)`);
        if (results.length > 1) {
          for (const r of results.slice(0, 5)) {
            progress('CAD-L2', `  → ID=${r.propertyId} addr="${r.address ?? '?'}" owner="${r.ownerName?.slice(0, 30) ?? '?'}"`);
          }
        }
        const bestPropId = pickBestMatch(results, parsed);
        if (bestPropId) {
          progress('CAD-L2', `Selected best match: ID=${bestPropId}`);
          return lookupByPropertyId(bestPropId, screenshots, urlsVisited, progress);
        }
      }

      await delay(RATE_LIMITS.cadSearch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      progress('CAD-L2', `Variant error: ${msg} — continuing`);
    }
  }

  return null;
}

// ── Internal: Playwright via searchBisCad ────────────────────────────

/**
 * Uses the proven bis-cad.ts Playwright layer to search Bell CAD.
 * This handles the full BIS eSearch SPA: session, address variants,
 * Type P pivot, owner-name tab, Vision OCR last-resort.
 */
async function searchWithBisCad(
  input: CadSearchInput,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): Promise<CadSearchResult | null> {
  try {
    // Dynamic import to avoid requiring bis-cad.ts at module load time
    const { searchBisCad, BIS_CONFIGS } = await import('../../../services/bis-cad.js');
    const { normalizeAddress } = await import('../../../services/address-utils.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');

    if (!BIS_CONFIGS['bell']) {
      progress('CAD-L3', 'No Bell CAD BIS config found — skipping Playwright layer');
      return null;
    }

    // Create a logger bound to the real project ID so live log entries appear in the
    // correct registry bucket when the frontend polls /research/status/:projectId.
    const logger = new PipelineLogger(input.projectId ?? `bell-cad-${Date.now()}`);
    progress('CAD-L3', 'Normalizing address for Playwright search...');

    const address = input.address ?? input.ownerName ?? '';
    const normalized = await normalizeAddress(address, logger);

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const { property: prop, diagnostics } = await searchBisCad(
      'bell',
      normalized,
      anthropicApiKey,
      logger,
      {
        ownerName: input.ownerName,
        propertyId: input.propertyId,
      },
    );

    if (diagnostics.siteUnreachable) {
      progress('CAD-L3', '⚠ Bell CAD site unreachable (Playwright confirmed) — will fall back to GIS/Clerk');
      return null;
    }

    if (!prop) {
      progress('CAD-L3', 'Playwright search returned no property');
      return null;
    }

    // Convert PropertyIdResult → CadSearchResult
    urlsVisited.push(BELL_ENDPOINTS.cad.propertyDetail(prop.propertyId));
    return {
      propertyId: prop.propertyId,
      ownerName: prop.ownerName,
      legalDescription: prop.legalDescription,
      acreage: prop.acreage,
      situsAddress: prop.situsAddress,
      propertyType: prop.propertyType,
      deedHistory: (prop.deedHistory ?? []).map(d => ({
        instrumentNumber: d.instrumentNumber,
        deedDate: d.deedDate,
        grantor: d.grantor,
        grantee: d.grantee,
        volume: d.volume,
        page: d.page,
      })),
      instrumentNumbers: prop.instrumentNumbers ?? [],
      mapId: prop.mapId,
      mailingAddress: prop.mailingAddress,
      source: 'playwright',
      screenshots,
      urlsVisited,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress('CAD-L3', `Playwright search error: ${msg}`);
    return null;
  }
}

// ── Internal: Owner Name API Search ──────────────────────────────────

/**
 * Search Bell CAD by owner name using the direct JSON API.
 * Returns the best matching property account.
 *
 * API: GET /api/Search/GetPropertySearchByOwner?ownerName={name}&take=50&skip=0
 * Used as Layer 4 and for BP/P pivoting.
 */
async function searchByOwnerApi(
  ownerName: string,
  mapIdPrefix: string | null,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): Promise<CadSearchResult | null> {
  const variants = generateOwnerNameVariants(ownerName);

  for (const name of variants) {
    const apiUrl = `${BELL_ENDPOINTS.cad.home}/api/Search/GetPropertySearchByOwner` +
      `?ownerName=${encodeURIComponent(name)}&take=50&skip=0`;
    urlsVisited.push(apiUrl);
    progress('CAD-L4', `Owner API: "${name}"${mapIdPrefix ? ` (map prefix: ${mapIdPrefix})` : ''}`);

    try {
      const resp = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': BELL_ENDPOINTS.cad.home,
        },
        signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
      });

      if (!resp.ok) {
        progress('CAD-L4', `Owner API HTTP ${resp.status} — continuing`);
        continue;
      }

      const data = await resp.json() as unknown;
      const rows: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : ((data as Record<string, unknown>)?.PropertySearchResults as Record<string, unknown>[] ?? []);

      if (!Array.isArray(rows) || rows.length === 0) {
        progress('CAD-L4', `Owner API: no results for "${name}"`);
        continue;
      }

      // Filter by map ID prefix if provided (geographic relevance)
      const filtered = mapIdPrefix
        ? rows.filter(r => {
            const mid = String(r['MapId'] ?? r['mapId'] ?? '');
            return mid.startsWith(mapIdPrefix);
          })
        : rows;

      // Skip personal property accounts when we have a map prefix (we're looking for land)
      const landRows = filtered.filter(r => {
        const type = String(r['PropertyType'] ?? r['propertyType'] ?? '').toUpperCase();
        return type !== 'BP' && type !== 'P';
      });

      const candidates = landRows.length > 0 ? landRows : filtered;
      if (candidates.length === 0) continue;

      progress('CAD-L4', `Owner API: ${rows.length} result(s)${filtered.length !== rows.length ? `, ${filtered.length} within map prefix` : ''}`);

      // Use the first candidate — get full detail if we have a property ID
      const best = candidates[0];
      const propId = String(best['PropertyId'] ?? best['propertyId'] ?? best['PROP_ID'] ?? '');
      if (!propId || propId === 'undefined') continue;

      // Try to get the full detail page
      const detail = await lookupByPropertyId(propId, screenshots, urlsVisited, progress);
      if (detail) return detail;

      // Fallback: build from API row
      const ownerStr = String(best['OwnerName'] ?? best['ownerName'] ?? best['OWN_NAME'] ?? '');
      const legalStr = String(best['LegalDescription'] ?? best['legalDescription'] ?? best['LEGAL_DESC'] ?? '');
      const acreStr = String(best['LandAcres'] ?? best['landAcres'] ?? best['LAND_ACRES'] ?? '');
      const typeCode = String(best['PropertyType'] ?? best['propertyType'] ?? best['PROP_TYPE'] ?? '').toUpperCase();
      const mapId = String(best['MapId'] ?? best['mapId'] ?? '');

      return {
        propertyId: propId,
        ownerName: ownerStr || null,
        legalDescription: legalStr || null,
        acreage: parseFloat(acreStr) || null,
        situsAddress: null,
        propertyType: typeCode || null,
        deedHistory: [],
        instrumentNumbers: [],
        mapId: mapId || undefined,
        source: 'http-api',
        screenshots,
        urlsVisited,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      progress('CAD-L4', `Owner API error for "${name}": ${msg}`);
    }
    await delay(RATE_LIMITS.cadSearch);
  }

  return null;
}

// ── Internal: Personal Property Pivot ─────────────────────────────────

/**
 * When address lookup returns a personal property (BP/P) account, pivot
 * to find the real estate land accounts owned by the same entity at the
 * same map location.
 */
async function pivotToLandAccount(
  bpResult: CadSearchResult,
  originalInput: CadSearchInput,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): Promise<CadSearchResult | null> {
  const ownerName = bpResult.ownerName ?? originalInput.ownerName;
  const mapPrefix = bpResult.mapId?.slice(0, 4) ?? null;

  if (!ownerName) {
    progress('CAD-BP', 'Cannot pivot: no owner name known for personal property account');
    return null;
  }

  progress('CAD-BP', `Pivoting from BP/P (ID=${bpResult.propertyId}) → searching land for "${ownerName}"${mapPrefix ? ` (map prefix: ${mapPrefix})` : ''}`);

  const landResult = await searchByOwnerApi(ownerName, mapPrefix, screenshots, urlsVisited, progress);
  if (landResult) {
    progress('CAD-BP', `✓ Pivot successful: land account ID=${landResult.propertyId} type=${landResult.propertyType ?? 'R'}`);
    return landResult;
  }

  // Try without the map prefix constraint if first attempt failed
  if (mapPrefix) {
    progress('CAD-BP', 'Retrying pivot without map prefix constraint...');
    const broadResult = await searchByOwnerApi(ownerName, null, screenshots, urlsVisited, progress);
    if (broadResult) {
      const typeCode = (broadResult.propertyType ?? '').toUpperCase();
      if (typeCode !== 'BP' && typeCode !== 'P') {
        progress('CAD-BP', `✓ Broad pivot: land account ID=${broadResult.propertyId}`);
        return broadResult;
      }
    }
  }

  return null;
}

// ── Internal: Detail Enrichment ───────────────────────────────────────

/**
 * If a CadSearchResult was built from a summary (owner API or search result),
 * try to enrich it with full detail from the property detail page.
 * Returns the original result if enrichment fails.
 */
async function maybeEnrichWithDetail(
  result: CadSearchResult,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): Promise<CadSearchResult> {
  // Already enriched if we have deed history or the source was detail-page-based
  if (result.deedHistory.length > 0 || result.instrumentNumbers.length > 0) {
    return result;
  }

  progress('CAD-ENRICH', `Enriching property ${result.propertyId} with full detail page...`);
  const enriched = await lookupByPropertyId(result.propertyId, screenshots, urlsVisited, progress);
  if (enriched) {
    progress('CAD-ENRICH', `✓ Enriched: deeds=${enriched.deedHistory.length} instruments=${enriched.instrumentNumbers.length}`);
    return enriched;
  }
  return result;
}

// ── Internal: Session Management ─────────────────────────────────────

interface CadSession {
  token: string;
  cookies: string;
}

async function acquireSession(
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
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

    if (!resp.ok) {
      progress('CAD-SESSION', `Bell CAD home returned HTTP ${resp.status}`);
      return null;
    }

    const html = await resp.text();

    // Multiple patterns for session token extraction (BIS eSearch has varied formats)
    const tokenPatterns = [
      /name=['"]searchSessionToken['"][^>]*value=['"]([^'"]+)['"]/i,
      /searchSessionToken['"]\s*(?:value|content)\s*=\s*['"]([^'"]+)['"]/i,
      /\bsearchSessionToken\b[^>]*value=['"]([^'"]+)['"]/i,
      /data-token=['"]([^'"]+)['"][^>]*searchSessionToken/i,
    ];
    let token = '';
    for (const pat of tokenPatterns) {
      const m = html.match(pat);
      if (m?.[1]) { token = m[1]; break; }
    }

    const setCookies = resp.headers.getSetCookie?.() ?? [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

    if (!token) {
      progress('CAD-SESSION', 'Could not extract session token from Bell CAD home page');
      return null;
    }
    return { token, cookies };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress('CAD-SESSION', `Session acquisition failed: ${msg}`);
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
  const strip = (s: string) => s.replace(/<[\s\S]*?>/g, ' ').replace(/\s+/g, ' ').trim();

  // Strategy 1: Extract from table rows with full context (address, owner, type)
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    // Check if this row has a property link
    const propIdMatch = rowHtml.match(/(?:\/Property\/View\/|propertyId[=:]\s*|"PropertyId"\s*:\s*"?)(\d{4,})/i);
    if (!propIdMatch) continue;
    const propertyId = propIdMatch[1];
    if (results.find(r => r.propertyId === propertyId)) continue;

    // Extract all cell text from this row
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(c => strip(c[1]));

    // Try to identify address cell (contains number + street pattern, reasonable length)
    const addressCell = cells.find(c =>
      /\d+\s+[A-Za-z]/.test(c) && c.length > 5 && c.length < 120
    );

    // Owner cell: uppercase name-like text, not the address
    const ownerCell = cells.find(c =>
      c.length > 3 && c.length < 80 && /[A-Z]{2,}/.test(c) && c !== addressCell && !/^\d+$/.test(c)
    );

    results.push({ propertyId, ownerName: ownerCell, address: addressCell });
  }

  // Strategy 2: Fallback — extract property IDs from onclick/href/JSON patterns
  if (results.length === 0) {
    let match;
    const onclickPattern = /onclick\s*=\s*["'][^"']*(?:\/Property\/View\/|propertyId[=:]\s*)(\d+)/gi;
    while ((match = onclickPattern.exec(html)) !== null) {
      if (!results.find(r => r.propertyId === match![1])) {
        results.push({ propertyId: match[1] });
      }
    }

    const hrefPattern = /href\s*=\s*["'](?:https?:\/\/[^/]*)?\/Property\/View\/(\d+)/gi;
    while ((match = hrefPattern.exec(html)) !== null) {
      if (!results.find(r => r.propertyId === match![1])) {
        results.push({ propertyId: match[1] });
      }
    }

    const jsonPattern = /"PropertyId"\s*:\s*"?(\d+)"?/gi;
    while ((match = jsonPattern.exec(html)) !== null) {
      if (!results.find(r => r.propertyId === match![1])) {
        results.push({ propertyId: match[1] });
      }
    }
  }

  return results;
}

/**
 * Parse the BIS property detail page HTML into a complete CadSearchResult.
 *
 * BIS eSearch detail page layout (verified March 2026):
 *   - Tabular layout with <td>Field</td><td>Value</td> rows
 *   - Deed history table in lower section
 *   - Owner section above property data
 *
 * All parsed values are stripped of HTML tags using /<[\s\S]*?>/g with
 * allowlist chars to prevent XSS in logged data.
 */
function parsePropertyDetailHtml(
  html: string,
  propId: string,
  source: 'http-api' | 'playwright' | 'vision-ocr',
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (phase: string, message: string) => void,
): CadSearchResult | null {

  // Strip tags utility — uses multiline match to handle tags spanning lines
  const strip = (s: string) => s.replace(/<[\s\S]*?>/g, ' ').replace(/\s+/g, ' ').trim();
  const safeStr = (s: string) => strip(s).replace(/[<>]/g, ''); // extra safety for output fields

  // ── Owner Name ────────────────────────────────────────────────────
  const ownerPatterns = [
    /<td[^>]*>\s*(?:Owner|Owner\s*Name)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    /(?:Owner|Owner\s*Name)\s*:?\s*(?:<[^>]*>\s*)*([A-Z][A-Z\s,&.'"-]{3,60})/,
    /<label[^>]*>Owner<\/label>\s*<[^>]*>([^<]+)</i,
  ];
  let ownerName: string | null = null;
  for (const pat of ownerPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      const v = safeStr(m[1]);
      if (v.length > 2 && !/appraisal district|should be verified|legal purpose/i.test(v)) {
        ownerName = v;
        break;
      }
    }
  }

  // ── Legal Description ──────────────────────────────────────────────
  const legalPatterns = [
    /<td[^>]*>\s*Legal\s*(?:Description|Desc\.?)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    /Legal\s*(?:Description|Desc)\.?\s*:?\s*(?:<[^>]*>\s*)*([^<]{10,})/i,
  ];
  let legalDescription: string | null = null;
  for (const pat of legalPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      const v = safeStr(m[1]);
      if (v.length > 5 && !/appraisal district|should be verified/i.test(v)) {
        legalDescription = v;
        break;
      }
    }
  }

  // ── Acreage ────────────────────────────────────────────────────────
  const acreMatch = html.match(/(?:Acreage|Acres|Land\s*Acres)\s*:?\s*(?:<[^>]*>\s*)*?([\d,.]+)/i);
  const acreage = acreMatch ? parseFloat(acreMatch[1].replace(/,/g, '')) : null;

  // ── Property Type ──────────────────────────────────────────────────
  const typeMatch = html.match(
    /<td[^>]*>\s*(?:Property|Prop)\s*Type\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
  );
  const propertyType = typeMatch
    ? safeStr(typeMatch[1]).replace(/[^\w\d\s]/g, '').trim().toUpperCase() || null
    : null;

  // ── Situs Address ──────────────────────────────────────────────────
  const situsMatch = html.match(
    /<td[^>]*>\s*(?:Situs\s*Address|Property\s*Address|Location)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
  );
  const situsAddress = situsMatch ? safeStr(situsMatch[1]) || null : null;

  // ── Map ID ─────────────────────────────────────────────────────────
  const mapMatch = html.match(
    /<td[^>]*>\s*Map\s*(?:ID|Sheet|Ref)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
  );
  const mapId = mapMatch
    ? strip(mapMatch[1]).replace(/<[\s\S]*?>/g, '').replace(/[^\w\d]/g, '').trim() || undefined
    : undefined;

  // ── Mailing Address ────────────────────────────────────────────────
  const mailMatch = html.match(
    /<td[^>]*>\s*Mailing\s*Address\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
  );
  const mailingAddress = mailMatch ? safeStr(mailMatch[1]) || undefined : undefined;

  // ── Deed History Table ─────────────────────────────────────────────
  // BIS layout: table rows with cells [Date] [Type] [Instrument#] [Vol] [Pg] [Grantor] [Grantee]
  const deedHistory: CadDeedEntry[] = [];
  const tableRows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const rowMatch of tableRows) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(c => safeStr(c[1]));
    // Identify deed rows by the presence of an instrument number pattern
    const instrCell = cells.find(c => /^\d{7,10}$/.test(c.trim()));
    if (instrCell) {
      const dateCell = cells.find(c => /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(c));
      // Grantor/Grantee are typically the last two non-empty, non-numeric cells
      const textCells = cells.filter(c => c.length > 2 && !/^\d+$/.test(c.trim()) && c !== instrCell && c !== (dateCell ?? ''));
      deedHistory.push({
        instrumentNumber: instrCell.trim(),
        deedDate: dateCell ?? undefined,
        grantor: textCells.at(-2) ?? undefined,
        grantee: textCells.at(-1) ?? undefined,
      });
    }
  }

  // ── Instrument Numbers ─────────────────────────────────────────────
  // Collect from deed history + direct text matches (10-digit bell county format)
  const instrFromHistory = deedHistory.map(d => d.instrumentNumber).filter(Boolean) as string[];
  const instrFromText = [...html.matchAll(/\b(\d{9,10})\b/g)].map(m => m[1]);
  const instrumentNumbers = [...new Set([...instrFromHistory, ...instrFromText])];

  if (!ownerName && !legalDescription) {
    progress('CAD-PARSE', `No owner or legal description found in detail page for ${propId} — skipping`);
    return null;
  }

  const result: CadSearchResult = {
    propertyId: propId,
    ownerName,
    legalDescription,
    acreage: acreage && !isNaN(acreage) ? acreage : null,
    situsAddress,
    propertyType,
    deedHistory,
    instrumentNumbers,
    mapId,
    mailingAddress,
    source,
    screenshots,
    urlsVisited,
  };

  progress('CAD-PARSE',
    `Parsed: owner="${ownerName?.slice(0, 30)}" ` +
    `type=${propertyType ?? '?'} ` +
    `legal="${legalDescription?.slice(0, 40)}..." ` +
    `deeds=${deedHistory.length} ` +
    `instruments=${instrumentNumbers.length}`);

  return result;
}

// ── Internal: Address Parsing & Variants ─────────────────────────────

interface AddressComponents {
  streetNumber: string | null;
  direction: string | null;
  streetName: string;
  streetSuffix: string | null;
  city: string | null;
}

/**
 * Parse a Texas address string into components for CAD search.
 * Handles FM/CR/SH roads, directional prefixes, and Bell County cities.
 */
function parseAddressComponents(address: string): AddressComponents | null {
  const clean = address.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = clean.split(' ');
  if (parts.length < 2) return null;

  let idx = 0;
  let streetNumber: string | null = null;
  let direction: string | null = null;

  if (/^\d+$/.test(parts[0])) {
    streetNumber = parts[0];
    idx = 1;
  }

  const dirs = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST'];
  if (idx < parts.length && dirs.includes(parts[idx].toUpperCase())) {
    direction = parts[idx].toUpperCase();
    idx++;
  }

  const remaining = parts.slice(idx);

  // Remove state and zip from end
  while (remaining.length > 0 && /^(TX|TEXAS|\d{5}(-\d{4})?)$/i.test(remaining[remaining.length - 1])) {
    remaining.pop();
  }

  // Remove Bell County cities from end
  const cities = [
    'BELTON', 'KILLEEN', 'TEMPLE', 'HARKER HEIGHTS', 'NOLANVILLE', 'SALADO',
    'HOLLAND', 'ROGERS', 'TROY', 'MOODY', 'BARTLETT', 'LITTLE RIVER-ACADEMY',
    'LITTLE RIVER ACADEMY', 'COPPERAS COVE', 'GATESVILLE', 'HAMILTON',
  ];
  let city: string | null = null;
  const remainingStr = remaining.join(' ').toUpperCase();
  for (const c of cities) {
    if (remainingStr.endsWith(c)) {
      city = c;
      remaining.splice(remaining.length - c.split(' ').length, c.split(' ').length);
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

/**
 * Generate multiple address search variants for Bell CAD.
 *
 * Bell CAD indexes FM roads without the "FM" prefix in some fields.
 * We generate variants both with and without the prefix to maximize
 * the chance of a match.
 */
function generateSearchVariants(parsed: AddressComponents): SearchVariant[] {
  const variants: SearchVariant[] = [];
  const { streetNumber, direction, streetName } = parsed;

  const addVariant = (number: string | null, name: string) => {
    variants.push({ number, name });
    if (direction && !name.toUpperCase().startsWith(direction)) {
      variants.push({ number, name: `${direction} ${name}` });
    }
  };

  addVariant(streetNumber, streetName);

  // FM/CR road variants — Bell CAD indexes these multiple ways
  const fmMatch = streetName.match(/^(FM|RR|CR|SH|US|IH|HWY)\s*(\d+)/i);
  if (fmMatch) {
    const prefix = fmMatch[1].toUpperCase();
    const num = fmMatch[2];
    const roadVariants = [
      `${prefix} ${num}`,          // "FM 436"
      `${prefix}${num}`,            // "FM436"
      num,                          // "436" (Bell CAD strips prefix in some searches)
      `FM ROAD ${num}`,
      `FARM TO MARKET ${num}`,
      `FARM TO MARKET ROAD ${num}`,
      `FM RD ${num}`,
      `${prefix} RD ${num}`,
    ];
    for (const roadName of roadVariants) {
      addVariant(streetNumber, roadName);
    }
  }

  // Street-name-only (no number) — for properties without situs numbers
  if (streetNumber) {
    const existingNames = [...new Set(variants.map(v => v.name))];
    for (const name of existingNames) {
      variants.push({ number: null, name });
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  return variants.filter(v => {
    const key = `${v.number ?? ''}|${v.name.toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Generate owner name variants for Bell CAD searches.
 * Bell CAD stores names as "LAST, FIRST" in most cases.
 */
function generateOwnerNameVariants(ownerName: string): string[] {
  const upper = ownerName.trim().toUpperCase();
  const variants = [upper];

  const parts = upper.split(/\s+/);

  // Business entities — no name inversion
  const businessKeywords = ['LLC', 'INC', 'CORP', 'LTD', 'LP', 'TRUST', 'ESTATE',
    'FOUNDATION', 'SURVEYING', 'COMPANY', 'PARTNERS', 'ASSOCIATION', 'HOLDINGS'];
  const isBusiness = businessKeywords.some(kw => upper.includes(kw));

  if (!isBusiness && parts.length >= 2 && !upper.includes(',')) {
    // Try "LAST, FIRST" format
    variants.push(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`);
    // Try just the last name (for partial match)
    if (parts[parts.length - 1].length > 3) {
      variants.push(parts[parts.length - 1]);
    }
  }

  // If already "LAST, FIRST", also try just "LAST"
  if (upper.includes(',')) {
    const lastName = upper.split(',')[0].trim();
    if (lastName.length > 3) variants.push(lastName);
  }

  return [...new Set(variants)];
}

/**
 * Pick the best matching property ID from a list of search results.
 * Currently returns the first result; orchestrator validates via GIS.
 */
function pickBestMatch(results: ParsedSearchResult[], parsed: AddressComponents): string | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0].propertyId;

  // Score each result by how well its address matches the input
  const inputNum = parsed.streetNumber;
  const inputStreet = parsed.streetName.toUpperCase();
  const inputDir = parsed.direction;

  let bestId = results[0].propertyId;
  let bestScore = -1;

  for (const r of results) {
    let score = 0;
    const addr = (r.address ?? '').toUpperCase();

    if (!addr) {
      // No address info — give it a baseline score of 0
      if (bestScore < 0) { bestId = r.propertyId; bestScore = 0; }
      continue;
    }

    // Exact street number match (most important for lot selection)
    if (inputNum && addr.includes(inputNum)) score += 10;
    // Penalize if the address has a DIFFERENT number
    if (inputNum && !addr.includes(inputNum)) {
      const otherNum = addr.match(/^(\d+)/);
      if (otherNum && otherNum[1] !== inputNum) score -= 5;
    }

    // Street name word match
    const streetWords = inputStreet.split(/\s+/).filter(w => w.length > 1);
    for (const word of streetWords) {
      if (addr.includes(word)) score += 2;
    }

    // Direction match
    if (inputDir && addr.includes(inputDir)) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestId = r.propertyId;
    }
  }

  return bestId;
}

/**
 * Extract an owner name hint from an address for use when no owner
 * name is provided but the address contains a business name.
 * Returns null for residential/farm addresses.
 */
function extractOwnerHint(address?: string): string | null {
  return null; // No reliable heuristic for addresses alone
}

// ── Utility ──────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
