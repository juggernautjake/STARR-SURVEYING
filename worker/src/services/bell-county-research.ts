// worker/src/services/bell-county-research.ts
// Bell County Property Research Orchestrator — Multi-Wave Cascading Enrichment
//
// This module implements the "search graph" pattern for Bell County properties:
// any identifier we discover (address, property ID, owner name, instrument number)
// automatically seeds the next wave of searches, building a complete picture of
// the property without requiring the caller to know which searches to run.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ENRICHMENT CASCADE
// ═══════════════════════════════════════════════════════════════════════════════
//
// Wave 0  INPUT SEEDING
//   Address → normalized variants
//   Property ID → direct lookup queue
//   Owner name → owner search queue
//   Instrument numbers → document fetch queue
//
// Wave 1  CAD SEARCHES (parallel where possible)
//   Direct ID lookup   (if property ID known)
//   Address search     (if address known, no ID yet)
//   Owner name search  (Bell CAD "By Owner" tab, if owner known)
//
// Wave 2  CAD ENRICHMENT (from Wave 1 results)
//   Deed history extraction   → new instrument numbers
//   Related property lookup   → properties at same address or owner
//   Personal property pivot   → find owner's real estate accounts
//
// Wave 3  CLERK DOCUMENT RETRIEVAL (parallel channels)
//   Channel A: Instrument numbers (exact, fast)
//   Channel B: Plat archive (free, unwatermarked — bellcountytx.com)
//   Channel C: Owner name search (Kofile SPA, fallback)
//
// Wave 4  CROSS-REFERENCE ENRICHMENT
//   If related properties found → re-run Wave 1/2 for each (depth-limited)
//   If new instrument numbers found → re-enqueue for Channel A
//
// ═══════════════════════════════════════════════════════════════════════════════
// BELL COUNTY PROPERTY TYPES
// ═══════════════════════════════════════════════════════════════════════════════
//
//   R  / C   — Standard real property → address → CAD → Plat / Deed
//   AG       — Agricultural land     → FM/rural address → CAD → Deed chain
//   MH       — Mobile home           → address → CAD → link to land account
//   BP / P   — Personal property     → owner pivot → find land account
//   M        — Mineral interest      → surface tract cross-ref
//   U        — Utility/pipeline      → easement chain
//
// All types fall through to clerk search if CAD lookup fails.

import type { PipelineLogger } from '../lib/logger.js';
import type {
  PropertyIdResult,
  DeedHistoryEntry,
  SearchDiagnostics,
  DocumentResult,
  DocumentRef,
} from '../types/index.js';
import { parseDeedReferences } from './pipeline.js';
import {
  classifyBellProperty,
  extractSubdivisionNameFromLegal,
  isBellCountyRuralAddress,
  extractBellCountyRouteNumber,
  normalizeBellCountyAddress,
} from './bell-county-classifier.js';
import type { BellPropertyClassification } from './bell-county-classifier.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Bell CAD base URL for detail page lookups */
const BELL_CAD_BASE = 'https://biscad.bellcad.org';

/** Current tax year for CAD lookups */
const CURRENT_YEAR = new Date().getFullYear();

/** Maximum depth for related-property cross-reference to prevent infinite loops */
const MAX_CROSS_REF_DEPTH = 2;

/** Maximum number of related properties to follow per depth level */
const MAX_RELATED_PER_DEPTH = 5;

/** Request timeout for CAD detail page fetches (ms) */
const CAD_FETCH_TIMEOUT_MS = 15_000;

/** Delay between CAD requests to avoid rate-limiting (ms) */
const CAD_POLITENESS_DELAY_MS = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Everything we know about a Bell County property at any point in the search.
 * Fields accumulate as we run more searches.  Every set is deduplicated.
 */
export interface BellCountyKnownIdentifiers {
  // ── Address identifiers ───────────────────────────────────────────────────
  /** Normalized address variants tried against CAD */
  addresses: string[];
  /** Raw input address (un-normalized) */
  rawAddress: string | null;
  /** Whether the address appears to be a rural/FM-road address */
  isRuralAddress: boolean;
  /** FM/CR/SH route number if rural (e.g., "436" for FM 436) */
  ruralRouteNumber: string | null;

  // ── CAD identifiers ───────────────────────────────────────────────────────
  /** Bell CAD property IDs (numeric strings, e.g., "498826") */
  propertyIds: string[];
  /** Bell CAD geographic IDs */
  geoIds: string[];
  /** Map sheet IDs (e.g., "61B01") — used to filter owner search results */
  mapIds: string[];

  // ── Owner identifiers ─────────────────────────────────────────────────────
  /** All known owner names (may include multiple if related parcels found) */
  ownerNames: string[];
  /** Bell CAD owner IDs */
  ownerIds: string[];
  /** Mailing addresses from CAD owner records */
  mailingAddresses: string[];

  // ── Property data ─────────────────────────────────────────────────────────
  /** Legal descriptions discovered (one per property account) */
  legalDescriptions: string[];
  /** Property type codes (R, C, AG, MH, BP, P, M, U, X) */
  propertyTypeCodes: string[];
  /** Acreage values from all discovered accounts */
  acreageValues: number[];
  /** Site/situs addresses from CAD */
  situsAddresses: string[];

  // ── Document identifiers ──────────────────────────────────────────────────
  /** Instrument numbers from legal descriptions, deed history, and clerk search */
  instrumentNumbers: string[];
  /** Volume/page references */
  volumePages: Array<{ volume: string; page: string }>;
  /** Plat cabinet/slide references */
  platRefs: Array<{ cabinet: string; slide: string }>;

  // ── Subdivision/survey info ───────────────────────────────────────────────
  /** Subdivision or addition names (for plat archive search) */
  subdivisionNames: string[];
  /** Abstract survey names */
  abstractSurveyNames: string[];

  // ── Classification ────────────────────────────────────────────────────────
  /** Classifications for each discovered property account */
  classifications: BellPropertyClassification[];

  // ── Related properties ────────────────────────────────────────────────────
  /** Property IDs of related accounts (same owner OR same address) */
  relatedPropertyIds: string[];
  /** Flag: at least one account is personal property (BP/P) */
  hasPersonalProperty: boolean;
  /** Flag: at least one account is real estate */
  hasRealProperty: boolean;
}

/** Result of the full Bell County cascading research run */
export interface BellCountyResearchResult {
  /** Final accumulated state */
  knownIds: BellCountyKnownIdentifiers;
  /** Primary property result (best match for the input) */
  primaryProperty: PropertyIdResult | null;
  /** All property accounts found (including related) */
  allProperties: PropertyIdResult[];
  /** All document results collected during research */
  documents: DocumentResult[];
  /** Search diagnostics from CAD search */
  searchDiagnostics: SearchDiagnostics;
  /** Property classification of the primary property */
  classification: BellPropertyClassification | null;
  /** Ordered list of search waves executed (for debugging / log display) */
  searchWavesRun: string[];
  /** Warnings accumulated during research */
  warnings: string[];
  /** Total research duration in milliseconds */
  duration_ms: number;
}

/** Input for Bell County research — all fields optional except at least one identifier */
export interface BellCountyResearchInput {
  address?: string;
  propertyId?: string;
  ownerName?: string;
  instrumentNumbers?: string[];
  /** If true, follow related property IDs for cross-reference */
  followRelatedProperties?: boolean;
  /** Maximum depth for related-property cascade (default 1) */
  maxCrossRefDepth?: number;
}

// ── State Initializer ─────────────────────────────────────────────────────────

/**
 * Create an empty BellCountyKnownIdentifiers object.
 * Seeds it with any pre-known information from the input.
 */
export function createSearchState(
  input: BellCountyResearchInput,
): BellCountyKnownIdentifiers {
  const raw = input.address ?? null;
  const isRural = raw ? isBellCountyRuralAddress(raw) : false;
  const routeNum = raw ? extractBellCountyRouteNumber(raw) : null;

  const state: BellCountyKnownIdentifiers = {
    addresses: raw ? normalizeBellCountyAddress(raw) : [],
    rawAddress: raw,
    isRuralAddress: isRural,
    ruralRouteNumber: routeNum,
    propertyIds: input.propertyId ? [input.propertyId] : [],
    geoIds: [],
    mapIds: [],
    ownerNames: input.ownerName ? [input.ownerName.trim().toUpperCase()] : [],
    ownerIds: [],
    mailingAddresses: [],
    legalDescriptions: [],
    propertyTypeCodes: [],
    acreageValues: [],
    situsAddresses: [],
    instrumentNumbers: input.instrumentNumbers ? [...new Set(input.instrumentNumbers)] : [],
    volumePages: [],
    platRefs: [],
    subdivisionNames: [],
    abstractSurveyNames: [],
    classifications: [],
    relatedPropertyIds: [],
    hasPersonalProperty: false,
    hasRealProperty: false,
  };

  return state;
}

// ── State Mutation Helpers ─────────────────────────────────────────────────────

/** Add a value to an array only if it is not already present (string dedup). */
function addUnique<T>(arr: T[], value: T): void {
  if (!arr.includes(value)) arr.push(value);
}

/** Add multiple unique values to an array. */
function addAllUnique<T>(arr: T[], values: T[]): void {
  for (const v of values) addUnique(arr, v);
}

/**
 * Ingest a PropertyIdResult into the known-identifiers state.
 * Updates ALL relevant fields — IDs, owner info, legal desc, instruments, etc.
 */
export function ingestCADResult(
  state: BellCountyKnownIdentifiers,
  result: PropertyIdResult,
  logger: PipelineLogger,
): void {
  const tag = `[BellCountyResearch] ingestCADResult(${result.propertyId})`;

  // Property / geo IDs
  addUnique(state.propertyIds, result.propertyId);
  if (result.geoId) addUnique(state.geoIds, result.geoId);
  if (result.mapId) addUnique(state.mapIds, result.mapId);

  // Owner
  if (result.ownerName) {
    const normalized = result.ownerName.trim().toUpperCase();
    if (!state.ownerNames.includes(normalized)) {
      state.ownerNames.push(normalized);
      logger.info('BellResearch', `${tag}: owner "${normalized}"`);
    }
  }
  if (result.ownerId) addUnique(state.ownerIds, result.ownerId);
  if (result.mailingAddress) addUnique(state.mailingAddresses, result.mailingAddress);

  // Property data
  if (result.legalDescription) {
    addUnique(state.legalDescriptions, result.legalDescription);

    // Extract instrument refs from legal description
    const refs = parseDeedReferences(result.legalDescription);
    addAllUnique(state.instrumentNumbers, refs.instrumentNumbers);
    for (const vp of refs.volumePages) {
      if (!state.volumePages.some((x) => x.volume === vp.volume && x.page === vp.page)) {
        state.volumePages.push(vp);
      }
    }
    for (const pr of refs.platRefs) {
      if (!state.platRefs.some((x) => x.cabinet === pr.cabinet && x.slide === pr.slide)) {
        state.platRefs.push(pr);
      }
    }

    // Extract subdivision / survey names
    const subdivName = extractSubdivisionNameFromLegal(result.legalDescription);
    if (subdivName) {
      addUnique(state.subdivisionNames, subdivName);
      logger.info('BellResearch', `${tag}: subdivision "${subdivName}"`);
    }
  }
  if (result.propertyType) addUnique(state.propertyTypeCodes, result.propertyType.toUpperCase());
  if (result.acreage != null) addUnique(state.acreageValues, result.acreage);
  if (result.situsAddress) addUnique(state.situsAddresses, result.situsAddress);

  // Instrument numbers from deed history rows
  if (result.deedHistory && result.deedHistory.length > 0) {
    for (const entry of result.deedHistory) {
      if (entry.instrumentNumber) addUnique(state.instrumentNumbers, entry.instrumentNumber);
      if (entry.volume && entry.page) {
        const vp = { volume: entry.volume, page: entry.page };
        if (!state.volumePages.some((x) => x.volume === vp.volume && x.page === vp.page)) {
          state.volumePages.push(vp);
        }
      }
    }
    logger.info('BellResearch', `${tag}: ${result.deedHistory.length} deed history entries → ` +
      `${state.instrumentNumbers.length} total instruments`);
  }

  // Instrument numbers from the explicit field (CAD detail page extraction)
  if (result.instrumentNumbers && result.instrumentNumbers.length > 0) {
    addAllUnique(state.instrumentNumbers, result.instrumentNumbers);
  }

  // Classify the property
  const classification = classifyBellProperty(
    result.propertyType,
    result.legalDescription,
    result.ownerName,
  );
  state.classifications.push(classification);

  // Update flags
  if (classification.isPersonalProperty) state.hasPersonalProperty = true;
  else state.hasRealProperty = true;

  logger.info('BellResearch',
    `${tag}: type=${classification.typeCode} cat=${classification.landCategory} ` +
    `isPlatted=${classification.isPlatted} instruments=${state.instrumentNumbers.length}`);
}

/**
 * Merge an array of DeedHistoryEntry items into the known-identifiers state.
 * Used when we extract deed history from a property detail page separately.
 */
export function ingestDeedHistory(
  state: BellCountyKnownIdentifiers,
  history: DeedHistoryEntry[],
  logger: PipelineLogger,
): void {
  let newInstruments = 0;
  for (const entry of history) {
    if (entry.instrumentNumber) {
      const before = state.instrumentNumbers.length;
      addUnique(state.instrumentNumbers, entry.instrumentNumber);
      if (state.instrumentNumbers.length > before) newInstruments++;
    }
    if (entry.volume && entry.page) {
      const vp = { volume: entry.volume, page: entry.page };
      if (!state.volumePages.some((x) => x.volume === vp.volume && x.page === vp.page)) {
        state.volumePages.push(vp);
      }
    }
  }
  if (newInstruments > 0) {
    logger.info('BellResearch',
      `ingestDeedHistory: +${newInstruments} new instrument(s) → ` +
      `${state.instrumentNumbers.length} total`);
  }
}

// ── CAD Detail Page Fetcher ────────────────────────────────────────────────────

/**
 * Fetch a Bell CAD property detail page by property ID.
 *
 * Parses: owner name, legal description, acreage, geo ID, property type,
 * mailing address, deed history table, instrument numbers.
 *
 * This is a lightweight HTTP-only fetch (no Playwright) — suitable for
 * enrichment fetches where we already have the property ID.
 *
 * Returns null on network error or if no useful data could be parsed.
 */
export async function fetchBellCADDetail(
  propertyId: string,
  logger: PipelineLogger,
): Promise<PropertyIdResult | null> {
  const attempt = logger.attempt(
    'BellCAD-Detail',
    BELL_CAD_BASE,
    'HTTP-GET',
    propertyId,
  );

  const url = `${BELL_CAD_BASE}/Property/View/${propertyId}?year=${CURRENT_YEAR}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': BELL_CAD_BASE,
      },
      signal: AbortSignal.timeout(CAD_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      attempt.fail(`HTTP ${response.status} for property ${propertyId}`);
      return null;
    }

    const html = await response.text();

    if (!html || html.length < 200) {
      attempt.fail(`Empty response for property ${propertyId}`);
      return null;
    }

    // ── Parse owner name ──────────────────────────────────────────────────
    // BIS table row: <td>Owner</td><td>VALUE</td>
    const ownerMatch =
      html.match(/<td[^>]*>\s*(?:Owner|Owner\s*Name)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i) ??
      html.match(/(?:Owner|Owner\s*Name)\s*:?\s*(?:<[^>]*>\s*)*([A-Z][A-Z\s,&.'-]+)/);
    const ownerName = ownerMatch
      ? ownerMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      : null;

    // ── Parse legal description ────────────────────────────────────────────
    let legalDescription: string | null = null;
    const legalRow = html.match(
      /<td[^>]*>\s*Legal\s*(?:Description|Desc\.?)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    );
    if (legalRow) {
      const raw = legalRow[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      // Filter out the standard BIS disclaimer text
      if (raw.length > 5 && !/appraisal district|should be verified|legal purpose/i.test(raw)) {
        legalDescription = raw;
      }
    }
    if (!legalDescription) {
      // Fallback: generic "Legal Description:" pattern
      const fallback = html.match(
        /Legal\s*(?:Description|Desc)\.?\s*:?\s*(?:<[^>]*>\s*)*([^<]{10,})/i,
      );
      if (fallback) {
        const candidate = fallback[1].trim();
        if (!/appraisal district|should be verified/i.test(candidate)) {
          legalDescription = candidate;
        }
      }
    }

    // ── Parse acreage ──────────────────────────────────────────────────────
    const acreageMatch = html.match(/(?:Acreage|Acres|Land\s*Acres)\s*:?\s*(?:<[^>]*>\s*)*?([\d,.]+)/i);
    const acreage = acreageMatch ? parseFloat(acreageMatch[1].replace(/,/g, '')) : null;

    // ── Parse geo ID ───────────────────────────────────────────────────────
    const geoMatch = html.match(
      /<td[^>]*>\s*(?:GEO\s*ID|Geographic\s*ID)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    ) ?? html.match(/(?:GEO\s*ID|Geographic\s*ID)\s*:?\s*(?:<[^>]*>\s*)*([^\s<]{3,})/i);
    // Strip all HTML tags (including multi-line tags) then take only word chars/hyphens
    const geoId = geoMatch
      ? geoMatch[1].replace(/<[\s\S]*?>/g, '').replace(/[^\w\d\s\-_.]/g, '').trim() || null
      : null;

    // ── Parse property type ────────────────────────────────────────────────
    const typeMatch = html.match(
      /<td[^>]*>\s*(?:Property|Prop)\s*Type\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    );
    const propertyType = typeMatch
      ? typeMatch[1].replace(/<[\s\S]*?>/g, '').replace(/[^\w\d\s]/g, '').trim().toUpperCase() || null
      : null;

    // ── Parse situs address ────────────────────────────────────────────────
    const situsMatch = html.match(
      /<td[^>]*>\s*(?:Situs\s*Address|Property\s*Address|Location)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    );
    const situsAddress = situsMatch
      ? situsMatch[1].replace(/<[\s\S]*?>/g, ' ').replace(/\s+/g, ' ').trim() || null
      : null;

    // ── Parse map ID ───────────────────────────────────────────────────────
    const mapMatch = html.match(
      /<td[^>]*>\s*Map\s*(?:ID|Sheet|Ref)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    );
    // Map IDs are alphanumeric grid references — strip everything else
    const mapId = mapMatch
      ? mapMatch[1].replace(/<[\s\S]*?>/g, '').replace(/[^\w\d]/g, '').trim() || undefined
      : undefined;

    // ── Parse mailing address ──────────────────────────────────────────────
    const mailMatch = html.match(
      /<td[^>]*>\s*Mailing\s*Address\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    );
    const mailingAddress = mailMatch
      ? mailMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      : undefined;

    // ── Parse deed history table ───────────────────────────────────────────
    const deedHistory: DeedHistoryEntry[] = [];
    // BIS deed history table rows: Date | Type | Instrument | Vol | Pg | Grantor | Grantee
    const deedRows = html.matchAll(
      /<tr[^>]*>(?:\s*<td[^>]*>([\s\S]*?)<\/td>){4,}<\/tr>/gi,
    );
    for (const row of deedRows) {
      // Heuristic: look for instrument-number-like patterns in the row
      const cells = [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map((c) => c[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
      const instrCell = cells.find((c) => /^\d{7,10}$/.test(c.trim()));
      const dateCell = cells.find((c) =>
        /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(c.trim()),
      );
      if (instrCell) {
        deedHistory.push({
          instrumentNumber: instrCell,
          deedDate: dateCell ?? undefined,
          grantor: cells[cells.length - 2] ?? undefined,
          grantee: cells[cells.length - 1] ?? undefined,
        });
      }
    }

    // ── Instrument numbers from page text ─────────────────────────────────
    const instrMatches = [...html.matchAll(/\b(\d{9,10})\b/g)].map((m) => m[1]);
    const instrumentNumbers = [...new Set([
      ...deedHistory.map((d) => d.instrumentNumber).filter(Boolean) as string[],
      ...instrMatches,
    ])];

    if (!ownerName && !legalDescription) {
      attempt.fail(`No owner or legal description parsed for property ${propertyId}`);
      return null;
    }

    attempt.success(1,
      `owner="${ownerName}" legal="${legalDescription?.slice(0, 40)}..." ` +
      `deedHistory=${deedHistory.length} instruments=${instrumentNumbers.length}`);

    return {
      propertyId,
      geoId,
      ownerName,
      legalDescription,
      acreage: acreage && !isNaN(acreage) ? acreage : null,
      propertyType,
      situsAddress,
      source: 'Bell CAD (HTTP detail)',
      layer: 'BellCAD-Detail',
      matchConfidence: 1.0,
      validationNotes: ['Bell County CAD direct property ID lookup'],
      instrumentNumbers: instrumentNumbers.length > 0 ? instrumentNumbers : undefined,
      mapId,
      mailingAddress,
      deedHistory: deedHistory.length > 0 ? deedHistory : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    attempt.fail(`Fetch error for ${propertyId}: ${msg}`);

    // If it's a timeout, surface that clearly for diagnostics
    if (/timeout|abort/i.test(msg)) {
      logger.warn('BellResearch',
        `CAD detail page timed out for ${propertyId} — site may be slow or down`);
    }
    return null;
  }
}

// ── Owner Search via CAD ──────────────────────────────────────────────────────

/**
 * Search Bell CAD by owner name using the public HTTP search API.
 *
 * Bell CAD supports a "By Owner" search at:
 *   GET /api/Search/GetPropertySearchByOwner?ownerName=NAME&take=50&skip=0
 *
 * Returns an array of property accounts matching the owner name.
 * This is used for enrichment — to find ALL of an owner's Bell County properties.
 *
 * Does NOT require Playwright — pure HTTP.
 */
export async function searchBellCADByOwner(
  ownerName: string,
  logger: PipelineLogger,
  options: {
    maxResults?: number;
    mapIdPrefix?: string;
  } = {},
): Promise<PropertyIdResult[]> {
  const { maxResults = 20, mapIdPrefix } = options;
  const attempt = logger.attempt(
    'BellCAD-OwnerSearch',
    BELL_CAD_BASE,
    'HTTP-API',
    ownerName,
  );

  const results: PropertyIdResult[] = [];

  try {
    // Bell CAD paginated owner search API (verified March 2026)
    const take = Math.min(maxResults, 50);
    const url = `${BELL_CAD_BASE}/api/Search/GetPropertySearchByOwner` +
      `?ownerName=${encodeURIComponent(ownerName)}&take=${take}&skip=0`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': BELL_CAD_BASE,
      },
      signal: AbortSignal.timeout(CAD_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      attempt.fail(`HTTP ${response.status} for owner search "${ownerName}"`);
      return [];
    }

    const data = await response.json() as unknown;

    // Parse BIS API response (array of property records)
    const rows: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>)?.PropertySearchResults as Record<string, unknown>[] ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      attempt.skip(`No results for owner "${ownerName}"`);
      return [];
    }

    for (const row of rows.slice(0, maxResults)) {
      const propId = String(
        row['PropertyId'] ?? row['propertyId'] ?? row['PROP_ID'] ?? '',
      );
      if (!propId || propId === 'undefined') continue;

      const mapId = String(row['MapId'] ?? row['mapId'] ?? row['MAP_ID'] ?? '');

      // Filter by map ID prefix if provided (geographic filtering for Type P pivot)
      if (mapIdPrefix && mapId && !mapId.startsWith(mapIdPrefix)) continue;

      const ownerStr = String(
        row['OwnerName'] ?? row['ownerName'] ?? row['OWN_NAME'] ?? '',
      ).trim();
      const legalStr = String(
        row['LegalDescription'] ?? row['legalDescription'] ?? row['LEGAL_DESC'] ?? '',
      ).trim();
      const acreStr = String(row['LandAcres'] ?? row['landAcres'] ?? row['LAND_ACRES'] ?? '');
      const acreage = parseFloat(acreStr.replace(/,/g, ''));
      const typeCode = String(
        row['PropertyType'] ?? row['propertyType'] ?? row['PROP_TYPE'] ?? '',
      ).trim().toUpperCase();
      const geoId = String(row['GeoId'] ?? row['geoId'] ?? row['GEO_ID'] ?? '').trim();
      const situsAddr = String(
        row['SitusAddress'] ?? row['situsAddress'] ?? row['SITUS_ADDR'] ?? '',
      ).trim();

      results.push({
        propertyId: propId,
        geoId: geoId || null,
        ownerName: ownerStr || null,
        legalDescription: legalStr || null,
        acreage: !isNaN(acreage) && acreage > 0 ? acreage : null,
        propertyType: typeCode || null,
        situsAddress: situsAddr || null,
        source: 'Bell CAD (owner search API)',
        layer: 'BellCAD-OwnerSearch',
        matchConfidence: 0.85,
        validationNotes: [`Owner name search: "${ownerName}"`],
        mapId: mapId || undefined,
      });
    }

    attempt.success(results.length, `${results.length} property account(s) for "${ownerName}"`);
    return results;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    attempt.fail(`Owner search error for "${ownerName}": ${msg}`);

    if (/timeout|abort/i.test(msg)) {
      logger.warn('BellResearch', `CAD owner search timed out — site may be slow`);
    }
    return [];
  }
}

// ── Related Property Discovery ────────────────────────────────────────────────

/**
 * Find related properties for a given property — same owner or same situs address.
 *
 * Runs two parallel queries:
 *   1. Owner-name search (may return multiple parcels owned by same entity)
 *   2. Address search (may find other accounts at same physical location)
 *
 * Results are deduplicated and the source property ID is excluded.
 */
export async function findRelatedBellProperties(
  state: BellCountyKnownIdentifiers,
  sourcePropertyId: string,
  logger: PipelineLogger,
): Promise<PropertyIdResult[]> {
  const related: PropertyIdResult[] = [];
  const seenIds = new Set([sourcePropertyId, ...state.propertyIds]);

  // Search by each known owner name
  for (const ownerName of state.ownerNames.slice(0, 3)) {
    if (!ownerName) continue;

    logger.info('BellResearch', `Searching related properties for owner: "${ownerName}"`);
    const mapPrefix = state.mapIds[0]?.slice(0, 4) ?? undefined;

    const ownerResults = await searchBellCADByOwner(ownerName, logger, {
      maxResults: 20,
      mapIdPrefix: mapPrefix,
    });

    for (const r of ownerResults) {
      if (seenIds.has(r.propertyId)) continue;
      seenIds.add(r.propertyId);
      related.push(r);
    }

    // Small delay between requests
    if (state.ownerNames.indexOf(ownerName) < state.ownerNames.length - 1) {
      await new Promise((r) => setTimeout(r, CAD_POLITENESS_DELAY_MS));
    }
  }

  // Deduplicate and cap
  const deduped = related.slice(0, MAX_RELATED_PER_DEPTH);
  if (deduped.length > 0) {
    logger.info('BellResearch',
      `Found ${deduped.length} related property account(s) (owner search)`);
  }

  return deduped;
}

// ── Personal Property Pivot ────────────────────────────────────────────────────

/**
 * When a Bell CAD lookup returns a personal property (BP/P) account, pivot to
 * find the real estate accounts at the same location.
 *
 * Strategy:
 *   1. Use the owner name from the BP account to search for R/C/AG accounts
 *   2. Filter by Map ID prefix for geographic matching
 *   3. If no results, try the input address owner name
 *
 * Returns the real estate accounts found, or empty array if none.
 */
export async function pivotPersonalPropertyToLand(
  bpResult: PropertyIdResult,
  state: BellCountyKnownIdentifiers,
  logger: PipelineLogger,
): Promise<PropertyIdResult[]> {
  logger.info('BellResearch',
    `Pivoting BP/P account ${bpResult.propertyId} ` +
    `(owner: "${bpResult.ownerName ?? 'unknown'}") to land accounts…`);

  const searchNames = [
    ...(bpResult.ownerName ? [bpResult.ownerName] : []),
    ...state.ownerNames,
  ].filter(Boolean) as string[];

  if (searchNames.length === 0) {
    logger.warn('BellResearch', 'Cannot pivot personal property — no owner name known');
    return [];
  }

  const mapPrefix = bpResult.mapId?.slice(0, 4) ?? state.mapIds[0]?.slice(0, 4) ?? undefined;
  const allFound: PropertyIdResult[] = [];
  const seenIds = new Set([bpResult.propertyId]);

  for (const name of searchNames.slice(0, 2)) {
    const found = await searchBellCADByOwner(name, logger, {
      maxResults: 20,
      mapIdPrefix: mapPrefix,
    });

    for (const r of found) {
      if (seenIds.has(r.propertyId)) continue;
      // Only keep non-personal-property accounts
      const typeCode = (r.propertyType ?? '').toUpperCase();
      if (typeCode === 'BP' || typeCode === 'P') continue;
      seenIds.add(r.propertyId);
      allFound.push(r);
    }

    await new Promise((r) => setTimeout(r, CAD_POLITENESS_DELAY_MS));
  }

  logger.info('BellResearch',
    `BP pivot found ${allFound.length} land account(s)` +
    (mapPrefix ? ` (map prefix: ${mapPrefix})` : ''));

  return allFound;
}

// ── State Summary ─────────────────────────────────────────────────────────────

/**
 * Build a human-readable summary of a BellCountyKnownIdentifiers state for logging.
 */
export function summarizeSearchState(state: BellCountyKnownIdentifiers): string {
  const parts: string[] = [];
  if (state.propertyIds.length > 0)    parts.push(`IDs=[${state.propertyIds.join(',')}]`);
  if (state.ownerNames.length > 0)     parts.push(`owners=[${state.ownerNames.slice(0,2).join('|')}]`);
  if (state.legalDescriptions.length)  parts.push(`legal=${state.legalDescriptions.length}`);
  if (state.instrumentNumbers.length)  parts.push(`instrs=${state.instrumentNumbers.length}`);
  if (state.subdivisionNames.length)   parts.push(`subdivs=[${state.subdivisionNames.slice(0,2).join('|')}]`);
  if (state.relatedPropertyIds.length) parts.push(`related=${state.relatedPropertyIds.length}`);
  parts.push(`realProp=${state.hasRealProperty} bpp=${state.hasPersonalProperty}`);
  return parts.join(' · ');
}

// ── Primary Property Selector ─────────────────────────────────────────────────

/**
 * Select the best primary property from an array of CAD results.
 *
 * Priority:
 *   1. Highest match confidence
 *   2. Real property (R/C/AG) over personal property (BP/P)
 *   3. Most data (has legalDescription AND acreage AND ownerName)
 */
export function selectPrimaryProperty(
  results: PropertyIdResult[],
): PropertyIdResult | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  return results.slice().sort((a, b) => {
    // Personal property accounts rank lower
    const aIsBP = /^(BP|P)$/i.test(a.propertyType ?? '');
    const bIsBP = /^(BP|P)$/i.test(b.propertyType ?? '');
    if (aIsBP && !bIsBP) return 1;
    if (!aIsBP && bIsBP) return -1;

    // Higher confidence first
    if (b.matchConfidence !== a.matchConfidence) return b.matchConfidence - a.matchConfidence;

    // More data is better
    const scoreA = (a.legalDescription ? 1 : 0) + (a.acreage != null ? 1 : 0) + (a.ownerName ? 1 : 0);
    const scoreB = (b.legalDescription ? 1 : 0) + (b.acreage != null ? 1 : 0) + (b.ownerName ? 1 : 0);
    return scoreB - scoreA;
  })[0];
}

// ── Cascading Search Orchestrator ─────────────────────────────────────────────

/**
 * Run the full Bell County cascading enrichment search.
 *
 * This is the top-level function called by the pipeline.  It orchestrates
 * all waves of enrichment and returns a comprehensive result.
 *
 * The function is designed to be fault-tolerant: failures in individual
 * waves are caught, logged, and do not abort the whole search.
 *
 * @param input      Search inputs (address, propertyId, ownerName, etc.)
 * @param logger     Pipeline logger (all actions are logged)
 * @returns          Full research result with all discovered identifiers
 */
export async function runBellCountyCascadeSearch(
  input: BellCountyResearchInput,
  logger: PipelineLogger,
): Promise<BellCountyResearchResult> {
  const startTime = Date.now();
  const wavesRun: string[] = [];
  const warnings: string[] = [];
  const allProperties: PropertyIdResult[] = [];
  const documents: DocumentResult[] = [];
  let primaryProperty: PropertyIdResult | null = null;

  // Initialize diagnostic structure
  const searchDiagnostics: SearchDiagnostics = {
    variantsGenerated: [],
    variantsTried: [],
    partialSearches: [],
    searchDuration_ms: 0,
  };

  // Validate input — must have at least one identifier
  if (!input.address && !input.propertyId && !input.ownerName) {
    const warn = 'BellCountyCascadeSearch: no address, propertyId, or ownerName provided — nothing to search';
    logger.warn('BellResearch', warn);
    warnings.push(warn);
    return {
      knownIds: createSearchState(input),
      primaryProperty: null,
      allProperties: [],
      documents: [],
      searchDiagnostics,
      classification: null,
      searchWavesRun: [],
      warnings,
      duration_ms: Date.now() - startTime,
    };
  }

  // ── Wave 0: Seed state ─────────────────────────────────────────────────────
  const state = createSearchState(input);
  logger.info('BellResearch', `Wave 0 — Seeding state: ${summarizeSearchState(state)}`);
  wavesRun.push('Wave0:Seed');

  // ── Wave 1: Direct property ID lookup ─────────────────────────────────────
  if (state.propertyIds.length > 0) {
    logger.info('BellResearch', `Wave 1A — Direct CAD lookup for ${state.propertyIds.length} property ID(s)`);
    wavesRun.push('Wave1A:DirectID');

    for (const propId of state.propertyIds.slice(0, 3)) {
      const result = await fetchBellCADDetail(propId, logger);
      if (result) {
        ingestCADResult(state, result, logger);
        allProperties.push(result);
        logger.info('BellResearch',
          `Wave 1A: found property ${propId} — owner="${result.ownerName}" ` +
          `type=${result.propertyType} legal="${result.legalDescription?.slice(0, 50)}..."`);
      } else {
        warnings.push(`Direct CAD lookup failed for property ID ${propId}`);
      }
      await new Promise((r) => setTimeout(r, CAD_POLITENESS_DELAY_MS));
    }
  }

  // ── Wave 1B: Owner name search (if property IDs not yet found) ─────────────
  if (allProperties.length === 0 && state.ownerNames.length > 0) {
    logger.info('BellResearch',
      `Wave 1B — Owner name search: ${state.ownerNames.slice(0, 2).join(', ')}`);
    wavesRun.push('Wave1B:OwnerSearch');

    for (const ownerName of state.ownerNames.slice(0, 2)) {
      const found = await searchBellCADByOwner(ownerName, logger, { maxResults: 20 });
      for (const r of found) {
        if (!allProperties.find((p) => p.propertyId === r.propertyId)) {
          allProperties.push(r);
          ingestCADResult(state, r, logger);
        }
      }
    }
  }

  // ── Wave 2: Personal property pivot ───────────────────────────────────────
  // If all found accounts are personal property, pivot to find land accounts
  const onlyBP = allProperties.length > 0 &&
    allProperties.every((p) => /^(BP|P)$/i.test(p.propertyType ?? ''));

  if (onlyBP) {
    logger.info('BellResearch',
      `Wave 2 — All ${allProperties.length} account(s) are personal property → pivoting to land`);
    wavesRun.push('Wave2:BPPivot');

    const bpResult = allProperties[0];
    const landAccounts = await pivotPersonalPropertyToLand(bpResult, state, logger);

    if (landAccounts.length > 0) {
      for (const r of landAccounts) {
        if (!allProperties.find((p) => p.propertyId === r.propertyId)) {
          allProperties.push(r);
          ingestCADResult(state, r, logger);
        }
      }
      logger.info('BellResearch',
        `Wave 2 pivot: found ${landAccounts.length} land account(s) — proceeding with those`);
    } else {
      logger.warn('BellResearch',
        'Wave 2 pivot: no land accounts found — using personal property result as-is');
      warnings.push(
        'Only personal property (BP/P) accounts found. ' +
        'Real estate record could not be located automatically. ' +
        'Provide the land owner name via ownerName to retry.',
      );
    }
  }

  // ── Wave 3: Enrich new property IDs discovered in Waves 1-2 ───────────────
  // If Wave 1B or Wave 2 found property IDs that we haven't fetched detail for yet,
  // fetch those now to get full legal descriptions and deed histories.
  const unenrichedIds = allProperties
    .filter((p) => !p.deedHistory && !p.instrumentNumbers)
    .map((p) => p.propertyId);

  if (unenrichedIds.length > 0 && unenrichedIds.length <= 5) {
    logger.info('BellResearch',
      `Wave 3 — Enriching ${unenrichedIds.length} property account(s) with full detail`);
    wavesRun.push('Wave3:DetailEnrich');

    for (const propId of unenrichedIds) {
      const detail = await fetchBellCADDetail(propId, logger);
      if (detail) {
        // Replace the shallow result with the enriched one
        const idx = allProperties.findIndex((p) => p.propertyId === propId);
        if (idx !== -1) allProperties[idx] = detail;
        ingestCADResult(state, detail, logger);
      }
      await new Promise((r) => setTimeout(r, CAD_POLITENESS_DELAY_MS));
    }
  }

  // ── Wave 4: Related property cross-reference ───────────────────────────────
  const followRelated = input.followRelatedProperties ?? true;
  const maxDepth = Math.min(
    input.maxCrossRefDepth ?? MAX_CROSS_REF_DEPTH,
    MAX_CROSS_REF_DEPTH,
  );

  if (followRelated && allProperties.length > 0 && maxDepth >= 1) {
    const primaryId = allProperties[0]?.propertyId;
    if (primaryId && state.ownerNames.length > 0) {
      logger.info('BellResearch',
        `Wave 4 — Related property search (owner: ${state.ownerNames[0]})`);
      wavesRun.push('Wave4:RelatedParcels');

      const related = await findRelatedBellProperties(state, primaryId, logger);
      for (const r of related) {
        if (!allProperties.find((p) => p.propertyId === r.propertyId)) {
          allProperties.push(r);
          state.relatedPropertyIds.push(r.propertyId);
          ingestCADResult(state, r, logger);
          logger.info('BellResearch',
            `Wave 4: related parcel ${r.propertyId} ` +
            `(type=${r.propertyType} legal="${r.legalDescription?.slice(0, 40)}...")`);
        }
      }
    }
  }

  // ── Select primary property ────────────────────────────────────────────────
  primaryProperty = selectPrimaryProperty(allProperties);

  // ── Log final state ────────────────────────────────────────────────────────
  const finalSummary = summarizeSearchState(state);
  logger.info('BellResearch',
    `Cascade complete: ${allProperties.length} account(s) found · ${finalSummary}`);

  searchDiagnostics.searchDuration_ms = Date.now() - startTime;

  // ── Classification of primary property ────────────────────────────────────
  const classification = primaryProperty
    ? classifyBellProperty(
        primaryProperty.propertyType,
        primaryProperty.legalDescription,
        primaryProperty.ownerName,
      )
    : null;

  if (classification) {
    logger.info('BellResearch',
      `Primary property classification: type=${classification.typeCode} ` +
      `category=${classification.landCategory} ` +
      `strategy="${classification.strategyRationale}"`);
    logger.info('BellResearch',
      `  plat=${classification.isPlatted} ` +
      `abstract=${classification.hasAbstractSurvey} ` +
      `commercial=${classification.isCommercial} ` +
      `rural=${classification.isRuralAcreage}`);
  }

  return {
    knownIds: state,
    primaryProperty,
    allProperties,
    documents,
    searchDiagnostics,
    classification,
    searchWavesRun: wavesRun,
    warnings,
    duration_ms: Date.now() - startTime,
  };
}

// ── Pipeline Integration Helper ────────────────────────────────────────────────

/**
 * Merge a BellCountyResearchResult into a pipeline-stage accumulator.
 *
 * Used by pipeline.ts Stage 1 to merge cascade results into the standard
 * PropertyIdResult + SearchDiagnostics return shape.
 *
 * The primary property is returned; the full knownIds state is embedded
 * in the result's validationNotes for downstream Stage 2 enrichment.
 */
export function mergeCascadeIntoPipeline(
  cascadeResult: BellCountyResearchResult,
  logger: PipelineLogger,
): {
  property: PropertyIdResult | null;
  diagnostics: SearchDiagnostics;
  allProperties: PropertyIdResult[];
} {
  const { primaryProperty, allProperties, searchDiagnostics, knownIds, warnings } = cascadeResult;

  // Emit any accumulated warnings through the pipeline logger
  for (const w of warnings) {
    logger.warn('BellResearch', w);
  }

  if (!primaryProperty) {
    logger.warn('BellResearch',
      `mergeCascadeIntoPipeline: no primary property found ` +
      `(${allProperties.length} total, ${knownIds.propertyIds.length} IDs known)`);
    return { property: null, diagnostics: searchDiagnostics, allProperties };
  }

  // Enrich the primary property result with ALL instrument numbers found across
  // all discovered accounts.  This feeds Stage 2's document fetch.
  const enrichedInstruments = [
    ...(primaryProperty.instrumentNumbers ?? []),
    ...knownIds.instrumentNumbers,
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  const enrichedPrimary: PropertyIdResult = {
    ...primaryProperty,
    instrumentNumbers: enrichedInstruments.length > 0 ? enrichedInstruments : undefined,
  };

  logger.info('BellResearch',
    `Cascade → pipeline: primary=${enrichedPrimary.propertyId} ` +
    `instruments=${enrichedInstruments.length} ` +
    `related=${knownIds.relatedPropertyIds.length} ` +
    `subdivisions=${knownIds.subdivisionNames.length}`);

  return {
    property: enrichedPrimary,
    diagnostics: searchDiagnostics,
    allProperties,
  };
}
