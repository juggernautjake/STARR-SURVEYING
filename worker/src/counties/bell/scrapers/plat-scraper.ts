/**
 * Bell County Plat Scraper
 *
 * Searches for plat records from three layered sources, tried in order:
 *
 *   Layer 1 — Bell County free plat repository (bellcountytx.com / cms3.revize.com)
 *             Fastest and best quality — unwatermarked PDFs, no authentication.
 *             Uses county-plats.ts multi-layer fetch strategy:
 *               Layer 0: Direct CDN URL construction (no scraping, ~1-2s)
 *               Layer 1: bellcountytx.com alphabetical index page scrape (~5-15s)
 *               Layer 2: Name variation retries
 *
 *   Layer 2 — Bell County Clerk (Kofile PublicSearch)
 *             Searches for plat document types by subdivision name, instrument number,
 *             or cabinet/slide reference using Playwright SPA automation.
 *
 *   Layer 3 — Instrument number plat type detection
 *             When we have instrument numbers from deed history, checks if any
 *             are plats by examining their document type in the clerk system.
 *
 * All layers run and results are merged (deduplicated by source/name).
 *
 * Bell County plat URL patterns (verified March 2026):
 *   Direct CDN: https://cms3.revize.com/revize/bellcountytx/
 *               county_government/county_clerk/docs/plats/{LETTER}/{NAME}.pdf
 *   Index page: https://www.bellcountytx.com/county_government/county_clerk/{letter}.php
 */

import { BELL_ENDPOINTS, RATE_LIMITS, TIMEOUTS } from '../config/endpoints.js';
import type { ScreenshotCapture, PlatRecord } from '../types/research-result.js';
import { withRetry } from '../utils/retry.js';

// ── Types ────────────────────────────────────────────────────────────

export interface PlatSearchInput {
  /** Subdivision name from legal description (drives all three layers) */
  subdivisionName?: string;
  /** Additional subdivision name variants to try */
  subdivisionVariants?: string[];
  /** Instrument numbers that may reference plats */
  instrumentNumbers?: string[];
  /** Owner name for searching plat records */
  ownerName?: string;
  /** Legal description (to extract additional plat references) */
  legalDescription?: string;
  /** Whether to capture full page images (default: true) */
  captureImages?: boolean;
  /** Real project ID — used to bind scraper loggers to the project's live log registry */
  projectId?: string;
}

export interface PlatSearchResult {
  plats: PlatRecord[];
  screenshots: ScreenshotCapture[];
  urlsVisited: string[];
  /** Deed instrument numbers discovered during plat search (owner/subdivision clerk searches).
   *  These are NOT fetched by the plat scraper — the orchestrator should fetch them separately. */
  deedInstruments: string[];
  /** Other document instrument numbers (dedications, easements, etc.) found during plat search. */
  otherInstruments: string[];
  stats: {
    repositoryFound: number;
    clerkFound: number;
    instrumentsChecked: number;
    refsExtracted: number;
    searchNames: string[];
  };
}

export interface PlatScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Search for all available Bell County plat records.
 * Tries the free repository first, falls back to clerk search.
 */
export async function scrapeBellPlats(
  input: PlatSearchInput,
  onProgress: (p: PlatScraperProgress) => void,
): Promise<PlatSearchResult> {
  const plats: PlatRecord[] = [];
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];
  const captureImages = input.captureImages !== false;
  const startedAt = Date.now();

  const progress = (msg: string) => {
    const elapsed = Date.now() - startedAt;
    onProgress({ phase: 'Plats', message: `[+${elapsed}ms] ${msg}`, timestamp: new Date().toISOString() });
  };

  /** Add a plat if not already present (dedup by platName + source) */
  const addPlat = (plat: PlatRecord): boolean => {
    // Deduplicate by instrument number (primary key) OR by name+source
    const exists = plats.find(
      p => (plat.instrumentNumber && p.instrumentNumber === plat.instrumentNumber) ||
           (p.name === plat.name && p.source === plat.source),
    );
    if (!exists) { plats.push(plat); return true; }
    return false;
  };

  // ── Collect all subdivision names to search ────────────────────────
  // We gather: input.subdivisionName, input.subdivisionVariants,
  // names extracted from legal description, and owner-based names.
  const searchNames = new Set<string>();
  if (input.subdivisionName) searchNames.add(input.subdivisionName.toUpperCase().trim());
  for (const v of (input.subdivisionVariants ?? [])) {
    if (v.trim()) searchNames.add(v.toUpperCase().trim());
  }

  // Extract plat references and additional names from legal description
  const platRefs = input.legalDescription
    ? extractPlatReferences(input.legalDescription)
    : [];
  for (const ref of platRefs) {
    if (ref.platName) searchNames.add(ref.platName.toUpperCase().trim());
  }
  if (platRefs.length > 0) {
    progress(`Extracted ${platRefs.length} plat reference(s) from legal description`);
  }

  const searchNamesList = [...searchNames];
  if (searchNamesList.length === 0 && (!input.instrumentNumbers || input.instrumentNumbers.length === 0)) {
    progress('No plat search names or instrument numbers provided — skipping plat search');
    return {
      plats, screenshots, urlsVisited, deedInstruments: [], otherInstruments: [],
      stats: { repositoryFound: 0, clerkFound: 0, instrumentsChecked: 0, refsExtracted: 0, searchNames: [] },
    };
  }

  progress(`Plat search targets: ${searchNamesList.join(', ') || '(none)'} + ${input.instrumentNumbers?.length ?? 0} instrument(s)`);

  // ── Layer 1: Bell County Free Plat Repository ──────────────────────
  let repositoryFound = 0;
  if (searchNamesList.length > 0) {
    progress(`Layer 1: Searching Bell County plat repository for ${searchNamesList.length} name(s)...`);

    for (const name of searchNamesList) {
      progress(`  Searching repository for: "${name}"`);
      const repPlats = await searchPlatRepository(name, captureImages, screenshots, urlsVisited, progress, input.projectId);
      for (const p of repPlats) {
        if (addPlat(p)) {
          repositoryFound++;
          progress(`  ✓ Found in repository: "${p.name}" (${p.source})`);
        }
      }
    }

    progress(`Layer 1 complete: ${repositoryFound} plat(s) found in repository`);
  }

  // ── Layer 2: Bell County Clerk (Kofile SPA) ────────────────────────
  let clerkFound = 0;
  const discoveredDeedInstruments: string[] = [];
  const discoveredOtherInstruments: string[] = [];

  // Search by subdivision name in clerk
  for (const name of searchNamesList) {
    if (clerkFound >= 10) break; // Cap to prevent runaway searching
    progress(`  Layer 2A: Clerk search for subdivision "${name}"`);
    const result = await searchClerkForPlats(name, captureImages, screenshots, urlsVisited, progress, input.projectId);
    for (const p of result.plats) {
      if (addPlat(p)) clerkFound++;
    }
    discoveredDeedInstruments.push(...result.deedInstruments);
    discoveredOtherInstruments.push(...result.otherInstruments);
  }

  // Search by owner name in clerk (for properties without subdivision)
  if (input.ownerName && plats.length === 0) {
    progress(`  Layer 2B: Clerk search by owner "${input.ownerName}" for plats`);
    const result = await searchClerkForPlats(input.ownerName, captureImages, screenshots, urlsVisited, progress, input.projectId);
    for (const p of result.plats) {
      if (addPlat(p)) clerkFound++;
    }
    discoveredDeedInstruments.push(...result.deedInstruments);
    discoveredOtherInstruments.push(...result.otherInstruments);
  }

  // Look up plats by cabinet/slide references from legal description
  for (const ref of platRefs) {
    if (ref.cabinetSlide) {
      progress(`  Layer 2C: Cabinet/Slide lookup: ${ref.cabinetSlide}`);
      const p = await searchByCabinetSlide(ref.cabinetSlide, captureImages, screenshots, urlsVisited, progress, input.projectId);
      if (p && addPlat(p)) clerkFound++;
    }
    if (ref.volume && ref.page) {
      progress(`  Layer 2D: Volume/Page lookup: Vol ${ref.volume} Pg ${ref.page}`);
      const p = await searchByVolumePage(ref.volume, ref.page, captureImages, screenshots, urlsVisited, progress, input.projectId);
      if (p && addPlat(p)) clerkFound++;
    }
  }

  progress(`Layer 2 complete: ${clerkFound} new plat(s) found in clerk`);

  // ── Layer 3: Instrument Number Plat Type Detection ─────────────────
  let instrumentsChecked = 0;
  if (input.instrumentNumbers && input.instrumentNumbers.length > 0) {
    progress(`Layer 3: Checking ${input.instrumentNumbers.length} instrument(s) for plat records...`);
    for (const instrNum of input.instrumentNumbers) {
      // Skip instruments already captured by earlier layers to avoid re-downloading images
      if (plats.some(p => p.instrumentNumber === instrNum)) {
        progress(`    Instrument ${instrNum} already captured — skipping Layer 3 check`);
        instrumentsChecked++;
        continue;
      }
      const p = await checkInstrumentForPlat(instrNum, captureImages, screenshots, urlsVisited, progress, input.projectId);
      instrumentsChecked++;
      if (p && addPlat(p)) {
        progress(`  ✓ Instrument ${instrNum} is a plat: ${p.name}`);
      }
    }
  }

  progress(
    `Plat search complete: ${plats.length} total plat(s) found | ` +
    `repository: ${repositoryFound} | clerk: ${clerkFound} | ` +
    `instruments checked: ${instrumentsChecked}`,
  );

  // Dedup deed/other instruments
  const uniqueDeeds = [...new Set(discoveredDeedInstruments)];
  const uniqueOther = [...new Set(discoveredOtherInstruments)];
  if (uniqueDeeds.length > 0) {
    progress(`Deed instruments discovered during plat search: ${uniqueDeeds.join(', ')}`);
  }
  if (uniqueOther.length > 0) {
    progress(`Other instruments discovered during plat search: ${uniqueOther.join(', ')}`);
  }

  return {
    plats,
    screenshots,
    urlsVisited,
    deedInstruments: uniqueDeeds,
    otherInstruments: uniqueOther,
    stats: { repositoryFound, clerkFound, instrumentsChecked, refsExtracted: platRefs.length, searchNames: searchNamesList },
  };
}

// ── Internal: Plat Reference Extraction ──────────────────────────────

interface PlatReference {
  type: 'cabinet_slide' | 'volume_page' | 'plat_name';
  cabinetSlide?: string;
  volume?: string;
  page?: string;
  platName?: string;
}

/**
 * Extract all plat references from a Bell CAD legal description.
 * Handles Cabinet/Slide, Volume/Page, OPR, and plat name patterns.
 */
export function extractPlatReferences(legalDesc: string): PlatReference[] {
  const refs: PlatReference[] = [];

  // Cabinet/Slide pattern: "CAB A, SL 123" or "CABINET A-1, SLIDE 45"
  const cabSlidePattern = /CAB(?:INET)?\s*([A-Z0-9]+[-]?[A-Z0-9]*)\s*,?\s*SL(?:IDE)?\s*(\d+)/gi;
  let match;
  while ((match = cabSlidePattern.exec(legalDesc)) !== null) {
    refs.push({ type: 'cabinet_slide', cabinetSlide: `${match[1]}-${match[2]}` });
  }

  // Volume/Page pattern: "VOL 123, PG 45" or "V. 123, P. 45" or "VOLUME 7687 PAGE 112"
  const volPagePattern = /VOL(?:UME)?\.?\s*(\d+)\s*[,/]?\s*P(?:AGE|G)?\.?\s*(\d+)/gi;
  while ((match = volPagePattern.exec(legalDesc)) !== null) {
    refs.push({ type: 'volume_page', volume: match[1], page: match[2] });
  }

  // OPR format: OPR/7687/112
  const oprPattern = /OPR\/(\d+)\/(\d+)/gi;
  while ((match = oprPattern.exec(legalDesc)) !== null) {
    refs.push({ type: 'volume_page', volume: match[1], page: match[2] });
  }

  // Plat name: "PLAT OF [name]" or "FINAL PLAT OF [name]"
  const platNamePattern = /(?:FINAL\s+)?PLAT\s+OF\s+(.+?)(?:\s+(?:RECORDED|FILED|IN|VOL|CAB|SEC|BLK|LOT))/gi;
  while ((match = platNamePattern.exec(legalDesc)) !== null) {
    const name = match[1].trim();
    if (name.length > 3) refs.push({ type: 'plat_name', platName: name });
  }

  return refs;
}

/**
 * Extract subdivision name from a Bell CAD legal description.
 * Exported so the orchestrator can pass it to the plat scraper.
 */
export function extractSubdivisionNameFromLegal(legalDesc: string): string | null {
  if (!legalDesc) return null;
  const upper = legalDesc.toUpperCase().trim();

  // Reject personal property / non-plat descriptions
  if (/^BUSINESS\s+PERSONAL\s+PROPERTY/i.test(upper)) return null;
  if (/^MINERAL/i.test(upper)) return null;
  if (/^ABSTRACT\b/i.test(upper) && !/ADDITION|SUBDIVISION|ESTATES?/i.test(upper)) return null;

  // Pattern 1: Ends with ADDITION/SUBDIVISION/ESTATES/etc. keyword
  const additionMatch = upper.match(
    /(.+?\b(?:ADDITION|SUBDIVISION|ESTATES?|SECTION|PHASE\s*\d*|UNIT\s*\d*|REPLAT|ANNEX(?:ATION)?|RANCH|VILLAGE|HEIGHTS|ACRES\s+ADDITION))\b/i,
  );
  if (additionMatch) {
    const cleaned = additionMatch[1].trim()
      .replace(/^LOT\s+\S+\s+(?:BLK|BLOCK)\s+\S+\s+/i, '').trim();
    if (cleaned.length > 5) return cleaned;
  }

  // Pattern 2: "LOT N BLK M SUBDIVISION NAME"
  const lotBlkMatch = upper.match(/LOT\s+\S+\s+(?:BLK|BLOCK)\s+\S+\s+(.+)/i);
  if (lotBlkMatch) {
    const name = lotBlkMatch[1].replace(/,.*$/, '').trim();
    if (name.length > 5 && !/^\d+$/.test(name)) return name;
  }

  return null;
}


// ── Internal: Confidence helper ─────────────────────────────────────

import type { ConfidenceRating } from '../types/confidence.js';

function makeConfidence(score: number): ConfidenceRating {
  const tier = score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  return {
    score,
    tier: tier as 'high' | 'medium' | 'low',
    factors: {
      sourceReliability: score,
      dataUsefulness: score,
      crossValidation: 0,
      sourceName: 'Bell County',
      validatedBy: [],
      contradictedBy: [],
    },
  };
}

// ── Internal: Layer 1 — County Plat Repository ───────────────────────

/**
 * Search the Bell County free plat repository using county-plats.ts.
 * Uses multi-layer strategy: direct CDN URL → index scrape → variants.
 */
async function searchPlatRepository(
  subdivisionName: string,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<PlatRecord[]> {
  const plats: PlatRecord[] = [];

  try {
    // Use the proven county-plats.ts service layer
    const { fetchBestMatchingPlat, extractSubdivisionName } = await import('../../../services/county-plats.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `plat-repo-${Date.now()}`);

    // The county-plats.ts service expects the subdivision name, not the full legal description.
    // Use it directly since we already extracted the name.
    progress(`    Fetching from repository: "${subdivisionName}"`);
    const result = await fetchBestMatchingPlat('bell', subdivisionName, logger);

    if (!result) {
      progress(`    Repository: no match for "${subdivisionName}"`);
      return [];
    }

    progress(`    ✓ Repository hit: "${result.name}" from ${result.source}`);
    urlsVisited.push(result.url ?? '');

    plats.push({
      name: result.name ?? subdivisionName,
      date: null,
      instrumentNumber: null,
      images: captureImages ? [result.base64] : [],
      aiAnalysis: null,
      sourceUrl: result.url ?? null,
      source: result.source ?? 'Bell County Plat Repository (bellcountytx.com)',
      confidence: makeConfidence(0.9),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress(`    Repository error for "${subdivisionName}": ${msg}`);
    if (/cannot find module|import/i.test(msg)) {
      progress(`    ↳ county-plats.ts service not available — check module path`);
    }
  }

  return plats;
}

// ── Internal: Layer 2 — Clerk Plat Search ────────────────────────────

/** Result from searchClerkForPlats — includes deed/other instruments discovered during search */
interface ClerkPlatSearchResult {
  plats: PlatRecord[];
  deedInstruments: string[];
  otherInstruments: string[];
}

/**
 * Search Bell County Clerk for plat documents by name.
 * Uses searchBellClerkOwnerForPlatDeed() which identifies plats, deeds, and other docs.
 * Returns plats AND passes back deed/other instrument numbers so the orchestrator
 * can fetch them separately.
 */
async function searchClerkForPlats(
  name: string,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<ClerkPlatSearchResult> {
  const plats: PlatRecord[] = [];
  let deedInstruments: string[] = [];
  let otherInstruments: string[] = [];

  try {
    const { searchBellClerkOwnerForPlatDeed, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `plat-clerk-${Date.now()}`);

    urlsVisited.push(`${BELL_ENDPOINTS.clerk.results}?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(name)}`);

    const result = await searchBellClerkOwnerForPlatDeed(name, logger);
    deedInstruments = result.deedInstruments;
    otherInstruments = result.otherInstruments;

    for (const instrNum of result.platInstruments) {
      let pageImages: string[] = [];
      if (captureImages) {
        try {
          progress(`    Capturing plat pages: ${instrNum}`);
          const pages = await fetchDocumentImages(instrNum, 15, logger);
          pageImages = pages.map(p => p.imageBase64).filter(Boolean);
          progress(`    ✓ ${pageImages.length} page(s) for instrument ${instrNum}`);
        } catch (imgErr) {
          progress(`    ✗ Image capture failed for ${instrNum}: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`);
        }
      }

      // Use the correct Kofile internal document URL from allDocuments (not constructed from instrument number)
      const docRef = result.allDocuments.find(d => d.instrumentNumber === instrNum);
      const docUrl = docRef?.url ?? BELL_ENDPOINTS.clerk.document(instrNum);
      urlsVisited.push(docUrl);
      plats.push({
        name,
        date: null,
        instrumentNumber: instrNum,
        images: pageImages,
        aiAnalysis: null,
        sourceUrl: docUrl,
        source: 'Bell County Clerk (bell.tx.publicsearch.us)',
        confidence: makeConfidence(0.85),
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress(`    Clerk plat search error for "${name}": ${msg}`);
  }

  return { plats, deedInstruments, otherInstruments };
}

// ── Internal: Cabinet/Slide Lookup ───────────────────────────────────

async function searchByCabinetSlide(
  cabinetSlide: string,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<PlatRecord | null> {
  const query = `Cabinet ${cabinetSlide.replace('-', ' Slide ')}`;
  const searchUrl = `${BELL_ENDPOINTS.clerk.results}?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(query)}`;
  urlsVisited.push(searchUrl);

  try {
    const { searchClerkRecords, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `plat-cab-${Date.now()}`);

    const docResults = await searchClerkRecords('bell', query, logger);
    const docRefs = docResults.map(d => d.ref);
    if (!docRefs || docRefs.length === 0) return null;

    // Pick a plat document type
    const platRef = docRefs.find(d => /plat/i.test(d.documentType)) ?? docRefs[0];
    const instrNum = platRef.instrumentNumber ?? '';

    let pageImages: string[] = [];
    if (captureImages && instrNum) {
      try {
        const pages = await fetchDocumentImages(instrNum, 15, logger);
        pageImages = pages.map(p => p.imageBase64).filter(Boolean);
      } catch { /* continue */ }
    }

    return {
      name: cabinetSlide,
      date: platRef.recordingDate,
      instrumentNumber: instrNum || null,
      images: pageImages,
      aiAnalysis: null,
      sourceUrl: platRef.url ?? (instrNum ? BELL_ENDPOINTS.clerk.document(instrNum) : null),
      source: 'Bell County Clerk (Cabinet/Slide)',
      confidence: makeConfidence(0.85),
    };
  } catch (err) {
    progress(`Cabinet/Slide lookup error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Internal: Volume/Page Lookup ──────────────────────────────────────

async function searchByVolumePage(
  volume: string,
  page: string,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<PlatRecord | null> {
  const query = `${volume}/${page}`;
  urlsVisited.push(`${BELL_ENDPOINTS.clerk.results}?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(query)}`);

  try {
    const { searchClerkRecords, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `plat-volpg-${Date.now()}`);

    const docResults = await searchClerkRecords('bell', query, logger);
    const docRefs = docResults.map(d => d.ref);
    if (!docRefs || docRefs.length === 0) return null;

    const platRef = docRefs.find(d => /plat/i.test(d.documentType))
      ?? docRefs.find(d => d.volume === volume && d.page === page)
      ?? docRefs[0];

    const instrNum = platRef.instrumentNumber ?? '';
    let pageImages: string[] = [];
    if (captureImages && instrNum) {
      try {
        const pages = await fetchDocumentImages(instrNum, 15, logger);
        pageImages = pages.map(p => p.imageBase64).filter(Boolean);
      } catch { /* continue */ }
    }

    return {
      name: `Vol ${volume} Pg ${page}`,
      date: platRef.recordingDate,
      instrumentNumber: instrNum || null,
      images: pageImages,
      aiAnalysis: null,
      sourceUrl: platRef.url ?? (instrNum ? BELL_ENDPOINTS.clerk.document(instrNum) : null),
      source: 'Bell County Clerk (Volume/Page)',
      confidence: makeConfidence(0.8),
    };
  } catch (err) {
    progress(`Vol/Page lookup error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Internal: Layer 3 — Instrument Plat Check ────────────────────────

/**
 * Check whether a known instrument number is a plat document.
 * If it is, fetch images and return as a PlatRecord.
 */
async function checkInstrumentForPlat(
  instrumentNumber: string,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<PlatRecord | null> {
  try {
    const { searchByInstrument, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `plat-instr-${Date.now()}`);

    const constructedUrl = BELL_ENDPOINTS.clerk.document(instrumentNumber);
    urlsVisited.push(constructedUrl);
    const docRef = await searchByInstrument(instrumentNumber, logger);
    if (!docRef) return null;

    // Only treat it as a plat if the document type indicates it
    const isPlat = /\bplat\b|final\s*plat|amended\s*plat|replat/i.test(docRef.documentType);
    if (!isPlat) return null;

    progress(`    Instrument ${instrumentNumber} is a plat: ${docRef.documentType}`);

    let pageImages: string[] = [];
    if (captureImages) {
      try {
        const pages = await fetchDocumentImages(instrumentNumber, 15, logger);
        pageImages = pages.map(p => p.imageBase64).filter(Boolean);
        progress(`    ✓ ${pageImages.length} page(s) for plat ${instrumentNumber}`);
      } catch { /* continue */ }
    }

    return {
      name: docRef.grantors[0] ?? instrumentNumber,
      date: docRef.recordingDate,
      instrumentNumber,
      images: pageImages,
      aiAnalysis: null,
      sourceUrl: docRef.url ?? constructedUrl,
      source: 'Bell County Clerk (instrument lookup)',
      confidence: makeConfidence(0.95),
    };
  } catch (err) {
    progress(`    Instrument plat check error for ${instrumentNumber}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
