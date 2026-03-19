/**
 * Bell County Clerk Scraper
 *
 * Searches Bell County Clerk records via Kofile/GovOS PublicSearch
 * (bell.tx.publicsearch.us). Retrieves deeds, plats, easements,
 * restrictions, and all other recorded documents.
 *
 * Four search paths (tried in priority order):
 *
 *   Path A — Direct instrument number lookup (fastest, most precise)
 *             Uses searchByInstrument() from bell-clerk.ts service layer.
 *             Returns full document metadata + page images in ~5-15s.
 *
 *   Path B — Owner name Playwright SPA search
 *             Uses searchBellClerk() which handles the Kofile SPA interaction:
 *             API intercept, networkidle+window-state detection, result parsing.
 *             Returns list of DocumentRefs with instrument numbers for Path A follow-up.
 *
 *   Path C — Subdivision/plat search
 *             Uses searchBellClerkOwnerForPlatDeed() which specifically looks for
 *             plat and deed documents by subdivision name.
 *
 *   Path D — Volume/page reference lookup
 *             Constructs a search query from vol/page references in legal descriptions.
 *
 * All paths record screenshots and URLs visited for the research report.
 *
 * Integration note:
 *   This module wraps the proven bell-clerk.ts Playwright service layer.
 *   bell-clerk.ts is NOT modified by this code — it is imported as a library.
 *   All Playwright lifecycle (launch/close) is managed within bell-clerk.ts.
 *
 * Bell County Clerk URL reference (verified March 2026):
 *   Home: https://bell.tx.publicsearch.us
 *   Results: /results?department=RP&searchType=quickSearch&searchValue={value}
 *   Document: /doc/{instrumentId}/details
 */

import { BELL_ENDPOINTS, RATE_LIMITS, TIMEOUTS } from '../config/endpoints.js';
import { DOCUMENT_TYPE_SCORES } from '../config/field-maps.js';
import type { ScreenshotCapture } from '../types/research-result.js';
import { withRetry } from '../utils/retry.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ClerkSearchResult {
  /** All documents found, sorted by relevance */
  documents: ClerkDocument[];
  /** Screenshots captured during search */
  screenshots: ScreenshotCapture[];
  /** All URLs visited */
  urlsVisited: string[];
  /** Summary stats for logging */
  stats: {
    instrumentsFound: number;
    deedsFound: number;
    platsFound: number;
    imagesCaptured: number;
    searchPaths: string[];
  };
}

export interface ClerkDocument {
  instrumentNumber: string | null;
  volume: string | null;
  page: string | null;
  recordingDate: string | null;
  documentType: string;
  grantor: string | null;
  grantee: string | null;
  legalDescription: string | null;
  /** Page images as base64-encoded PNG strings */
  pageImages: string[];
  /** Source URL for this document */
  sourceUrl: string | null;
  /** Relevance score based on document type */
  relevanceScore: number;
}

export interface ClerkSearchInput {
  /** Instrument numbers to look up directly (Path A) */
  instrumentNumbers?: string[];
  /** Owner name for SPA search (Path B) */
  ownerName?: string;
  /** Subdivision name from legal description (Path C — plat search) */
  subdivisionName?: string;
  /** Volume/page references (Path D) */
  volumePages?: Array<{ volume: string; page: string }>;
  /** Maximum documents to retrieve (default: 50) */
  maxDocuments?: number;
  /** Whether to capture page images for all found documents (default: true) */
  captureImages?: boolean;
  /** Real project ID — used to bind scraper loggers to the project's live log registry */
  projectId?: string;
}

export interface ClerkScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Search Bell County Clerk for recorded documents.
 * Attempts all available search paths and deduplicates results.
 *
 * All paths feed newly discovered instrument numbers back into
 * the document image capture step, ensuring full coverage.
 */
export async function scrapeBellClerk(
  input: ClerkSearchInput,
  onProgress: (p: ClerkScraperProgress) => void,
): Promise<ClerkSearchResult> {
  const documents: ClerkDocument[] = [];
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];
  const maxDocs = input.maxDocuments ?? 50;
  const captureImages = input.captureImages !== false;
  const searchPaths: string[] = [];
  const startedAt = Date.now();

  console.log(`[ClerkScraper] scrapeBellClerk START: instruments=${input.instrumentNumbers?.length ?? 0}, owner="${input.ownerName ?? ''}", subdiv="${input.subdivisionName ?? ''}", volPages=${input.volumePages?.length ?? 0}, maxDocs=${maxDocs}, captureImages=${captureImages}`);

  const progress = (msg: string) => {
    const elapsed = Date.now() - startedAt;
    const logMsg = `[+${elapsed}ms] ${msg}`;
    console.log(`[ClerkScraper] ${logMsg}`);
    onProgress({ phase: 'Clerk', message: logMsg, timestamp: new Date().toISOString() });
  };

  /** Add a document if not already in the list (dedup by instrument number) */
  const addDocument = (doc: ClerkDocument) => {
    const existing = documents.find(d =>
      d.instrumentNumber && d.instrumentNumber === doc.instrumentNumber,
    );
    if (!existing) {
      documents.push(doc);
      return true;
    }
    // Merge: append any page images not already present in the existing record
    if (doc.pageImages.length > 0) {
      for (const img of doc.pageImages) {
        if (!existing.pageImages.includes(img)) {
          existing.pageImages.push(img);
        }
      }
    }
    return false;
  };

  // ── Path A: Direct Instrument Number Lookup ────────────────────────
  // This is the most precise path — instrument numbers come from CAD
  // deed history, previous research, or user input.
  if (input.instrumentNumbers && input.instrumentNumbers.length > 0) {
    searchPaths.push('Path-A-Instruments');
    const unique = [...new Set(input.instrumentNumbers)];
    progress(`Path A: Looking up ${unique.length} instrument number(s) directly`);

    for (const instrNum of unique) {
      if (documents.length >= maxDocs) break;

      progress(`  Fetching instrument: ${instrNum}`);
      const doc = await fetchInstrumentDocument(instrNum, captureImages, screenshots, urlsVisited, progress, input.projectId);
      if (doc) {
        const isNew = addDocument(doc);
        if (isNew) {
          progress(`  ✓ Found: ${doc.documentType} — ${instrNum} (${doc.grantor ?? '?'} → ${doc.grantee ?? '?'})`);
        }
      } else {
        progress(`  ✗ Not found: ${instrNum}`);
      }

      await delay(RATE_LIMITS.defaultDelay);
    }

    progress(`Path A complete: ${documents.length} document(s) found`);
  }

  // ── Path B: Owner Name SPA Search ──────────────────────────────────
  // The Kofile SPA requires Playwright for interactive search. The
  // bell-clerk.ts service layer handles all browser interaction.
  if (input.ownerName && documents.length < maxDocs) {
    searchPaths.push('Path-B-Owner');
    progress(`Path B: Searching clerk by owner name: "${input.ownerName}"`);

    const ownerDocs = await searchClerkByOwner(
      input.ownerName,
      maxDocs - documents.length,
      captureImages,
      screenshots,
      urlsVisited,
      progress,
      input.projectId,
    );

    let newCount = 0;
    for (const doc of ownerDocs) {
      if (addDocument(doc)) newCount++;
    }
    progress(`Path B complete: ${newCount} new document(s) found (${ownerDocs.length} total from owner search)`);
  }

  // ── Path C: Subdivision / Plat Search ─────────────────────────────
  // Searches for plat and deed records by subdivision name.
  // Used when we have a legal description containing a subdivision name.
  if (input.subdivisionName && documents.length < maxDocs) {
    searchPaths.push('Path-C-Subdivision');
    progress(`Path C: Searching clerk for subdivision/plat: "${input.subdivisionName}"`);

    const subdivDocs = await searchClerkBySubdivision(
      input.subdivisionName,
      captureImages,
      screenshots,
      urlsVisited,
      progress,
      input.projectId,
    );

    let newCount = 0;
    for (const doc of subdivDocs) {
      if (addDocument(doc)) newCount++;
    }
    progress(`Path C complete: ${newCount} new document(s) found for subdivision`);
  }

  // ── Path D: Volume/Page Lookup ─────────────────────────────────────
  if (input.volumePages && input.volumePages.length > 0 && documents.length < maxDocs) {
    searchPaths.push('Path-D-VolumePage');
    progress(`Path D: Looking up ${input.volumePages.length} volume/page reference(s)`);

    for (const vp of input.volumePages) {
      if (documents.length >= maxDocs) break;
      progress(`  Vol ${vp.volume} Pg ${vp.page}`);
      const doc = await fetchByVolumePage(vp.volume, vp.page, captureImages, screenshots, urlsVisited, progress, input.projectId);
      if (doc) {
        const isNew = addDocument(doc);
        if (isNew) {
          progress(`  ✓ Found: ${doc.documentType} — Vol ${vp.volume} Pg ${vp.page}`);
        }
      }
    }
  }

  // ── Sort by relevance ──────────────────────────────────────────────
  documents.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const deedsFound = documents.filter(d => /deed|warranty|conveyance|transfer/i.test(d.documentType)).length;
  const platsFound = documents.filter(d => /plat/i.test(d.documentType)).length;
  const imagesCaptured = documents.reduce((sum, d) => sum + d.pageImages.length, 0);

  progress(
    `Clerk search complete: ${documents.length} document(s) | ` +
    `deeds: ${deedsFound} | plats: ${platsFound} | images: ${imagesCaptured} | ` +
    `paths used: ${searchPaths.join(', ')}`,
  );

  return {
    documents,
    screenshots,
    urlsVisited,
    stats: { instrumentsFound: documents.length, deedsFound, platsFound, imagesCaptured, searchPaths },
  };
}

// ── Internal: Instrument Document Fetch ──────────────────────────────

/**
 * Fetch a single document by instrument number using bell-clerk.ts.
 * Retrieves metadata and optionally captures page images.
 */
async function fetchInstrumentDocument(
  instrumentNumber: string,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<ClerkDocument | null> {
  // NOTE: Do NOT push a constructed URL here — Tyler PublicSearch uses internal
  // doc IDs, not instrument numbers. We push the real URL after searchByInstrument
  // resolves the actual document page.
  progress(`    [fetchInstrument] Starting lookup for instrument ${instrumentNumber}`);
  console.log(`[ClerkScraper] fetchInstrumentDocument: instrument=${instrumentNumber}, captureImages=${captureImages}`);

  try {
    // Use the proven bell-clerk.ts service layer for Playwright interaction
    const { searchByInstrument, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `clerk-instr-${instrumentNumber}-${Date.now()}`);

    // Fetch document metadata first — this searches the clerk SPA and clicks
    // the result to get the real internal doc ID and URL
    progress(`    [fetchInstrument] Searching Bell Clerk SPA for instrument ${instrumentNumber}...`);
    const docRef = await searchByInstrument(instrumentNumber, logger);
    if (!docRef) {
      progress(`    [fetchInstrument] Instrument ${instrumentNumber} not found in Bell Clerk`);
      console.log(`[ClerkScraper] Instrument ${instrumentNumber}: NOT FOUND`);
      return null;
    }

    // Now we have the REAL document URL from the clerk SPA (with internal doc ID)
    const realDocUrl = docRef.url ?? BELL_ENDPOINTS.clerk.document(instrumentNumber);
    urlsVisited.push(realDocUrl);
    progress(`    [fetchInstrument] Found: ${docRef.documentType} — real URL: ${realDocUrl}`);
    console.log(`[ClerkScraper] Instrument ${instrumentNumber}: found type=${docRef.documentType}, url=${realDocUrl}, grantors=${docRef.grantors.join(',')}`)

    // Capture page images if requested
    let pageImages: string[] = [];
    if (captureImages) {
      try {
        progress(`    [fetchInstrument] Capturing page images for ${instrumentNumber}...`);
        console.log(`[ClerkScraper] fetchDocumentImages: instrument=${instrumentNumber}, maxPages=20`);
        const pages = await fetchDocumentImages(instrumentNumber, 20, logger);
        pageImages = pages.map(p => p.imageBase64).filter(Boolean);
        if (pageImages.length > 0) {
          progress(`    [fetchInstrument] ✓ Captured ${pageImages.length} page(s) for ${instrumentNumber}`);
          console.log(`[ClerkScraper] Instrument ${instrumentNumber}: captured ${pageImages.length} page(s), total bytes=${pageImages.reduce((s, p) => s + p.length, 0)}`);
        } else {
          progress(`    [fetchInstrument] ⚠ No page images captured for ${instrumentNumber} (viewer may not have loaded)`);
          console.warn(`[ClerkScraper] Instrument ${instrumentNumber}: 0 page images captured`);
        }
      } catch (imgErr) {
        const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
        progress(`    [fetchInstrument] ✗ Image capture failed for ${instrumentNumber}: ${msg}`);
        console.error(`[ClerkScraper] Instrument ${instrumentNumber}: image capture error: ${msg}`);
        // Continue without images — metadata is still valuable
      }
    }

    // Convert DocumentRef → ClerkDocument
    // Use the REAL URL from docRef (which has the internal doc ID), not a constructed one
    const result: ClerkDocument = {
      instrumentNumber: docRef.instrumentNumber,
      volume: docRef.volume,
      page: docRef.page,
      recordingDate: docRef.recordingDate,
      documentType: docRef.documentType,
      grantor: docRef.grantors[0] ?? null,
      grantee: docRef.grantees[0] ?? null,
      legalDescription: null, // Not in DocumentRef; extracted separately by deed analyzer
      pageImages,
      sourceUrl: realDocUrl,
      relevanceScore: getDocumentRelevance(docRef.documentType),
    };

    progress(`    [fetchInstrument] ✓ Complete: ${result.documentType} inst#${instrumentNumber} — ${pageImages.length} page(s), url=${realDocUrl}`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress(`    [fetchInstrument] Error fetching instrument ${instrumentNumber}: ${msg}`);
    console.error(`[ClerkScraper] fetchInstrumentDocument ERROR for ${instrumentNumber}: ${msg}`);
    if (/playwright|browser|chromium/i.test(msg)) {
      progress(`    [fetchInstrument] ↳ Playwright error — check browser installation on server`);
    }
    return null;
  }
}

// ── Internal: Owner Name SPA Search ──────────────────────────────────

/**
 * Search Bell County Clerk by owner name using Playwright SPA automation.
 * Delegates to searchBellClerk() from bell-clerk.ts which handles the
 * full Kofile PublicSearch SPA interaction.
 */
async function searchClerkByOwner(
  ownerName: string,
  maxDocs: number,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<ClerkDocument[]> {
  const documents: ClerkDocument[] = [];
  const nameVariants = formatOwnerNameVariants(ownerName);

  progress(`  [ownerSearch] Starting owner search for "${ownerName}" (${nameVariants.length} variant(s): ${nameVariants.join(', ')})`);
  console.log(`[ClerkScraper] searchClerkByOwner: owner="${ownerName}", maxDocs=${maxDocs}, variants=${nameVariants.join(',')}`);

  try {
    const { searchClerkRecords, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `clerk-owner-${Date.now()}`);

    for (const name of nameVariants) {
      if (documents.length >= maxDocs) break;
      progress(`  [ownerSearch] Trying owner variant: "${name}"`);
      console.log(`[ClerkScraper] Owner search variant: "${name}"`);

      const searchUrl = `${BELL_ENDPOINTS.clerk.results}?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(name)}`;
      urlsVisited.push(searchUrl);

      const docResults = await searchClerkRecords('bell', name, logger);
      const docRefs = docResults.map(d => d.ref);
      if (!docRefs || docRefs.length === 0) {
        progress(`  [ownerSearch] No results for "${name}"`);
        console.log(`[ClerkScraper] Owner variant "${name}": 0 results`);
        continue;
      }

      progress(`  [ownerSearch] Found ${docRefs.length} document(s) for "${name}" — fetching details...`);
      console.log(`[ClerkScraper] Owner variant "${name}": ${docRefs.length} results, types: ${docRefs.map(r => r.documentType).join(', ')}`);

      for (const ref of docRefs.slice(0, maxDocs - documents.length)) {
        const instrNum = ref.instrumentNumber ?? '';
        let pageImages: string[] = [];

        // Use the REAL URL from the search result (has internal doc ID), not a constructed one
        const realUrl = ref.url ?? null;
        if (realUrl) {
          progress(`  [ownerSearch] Doc ${instrNum}: real URL from search = ${realUrl}`);
        } else {
          progress(`  [ownerSearch] Doc ${instrNum}: ⚠ no URL from search result`);
          console.warn(`[ClerkScraper] Owner doc ${instrNum}: no URL in search result`);
        }

        if (captureImages && instrNum) {
          try {
            progress(`  [ownerSearch] Capturing pages for ${instrNum}...`);
            const pages = await fetchDocumentImages(instrNum, 10, logger);
            pageImages = pages.map(p => p.imageBase64).filter(Boolean);
            progress(`  [ownerSearch] ${instrNum}: ${pageImages.length} page(s) captured`);
            console.log(`[ClerkScraper] Owner doc ${instrNum}: ${pageImages.length} pages captured`);
          } catch (imgErr) {
            const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
            progress(`  [ownerSearch] ${instrNum}: image capture failed: ${msg}`);
            console.warn(`[ClerkScraper] Owner doc ${instrNum}: image capture error: ${msg}`);
          }
        }

        documents.push({
          instrumentNumber: ref.instrumentNumber,
          volume: ref.volume,
          page: ref.page,
          recordingDate: ref.recordingDate,
          documentType: ref.documentType,
          grantor: ref.grantors[0] ?? null,
          grantee: ref.grantees[0] ?? null,
          legalDescription: null,
          pageImages,
          // Use real URL from search results, NOT a constructed URL with instrument number
          sourceUrl: realUrl,
          relevanceScore: getDocumentRelevance(ref.documentType),
        });
      }

      if (documents.length > 0) {
        progress(`  [ownerSearch] ✓ Owner variant "${name}" yielded ${documents.length} document(s) — stopping search`);
        break;
      }
    }

    progress(`  [ownerSearch] Complete: ${documents.length} document(s) from owner search`);
    console.log(`[ClerkScraper] searchClerkByOwner complete: ${documents.length} docs found`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress(`  [ownerSearch] Error: ${msg}`);
    console.error(`[ClerkScraper] searchClerkByOwner ERROR: ${msg}`);
    if (/playwright|browser|chromium/i.test(msg)) {
      progress('  [ownerSearch] ↳ Playwright unavailable — clerk owner search skipped');
    }
  }

  return documents;
}

// ── Internal: Subdivision / Plat Search ──────────────────────────────

/**
 * Search for plat and deed records by subdivision name.
 * Uses searchBellClerkOwnerForPlatDeed() from bell-clerk.ts,
 * which is optimized for finding subdivision plat records.
 */
async function searchClerkBySubdivision(
  subdivisionName: string,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<ClerkDocument[]> {
  const documents: ClerkDocument[] = [];

  progress(`  [subdivSearch] Starting subdivision search for "${subdivisionName}"`);
  console.log(`[ClerkScraper] searchClerkBySubdivision: subdiv="${subdivisionName}"`);

  try {
    const { searchBellClerkOwnerForPlatDeed, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `clerk-subdiv-${Date.now()}`);

    const searchUrl = `${BELL_ENDPOINTS.clerk.results}?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(subdivisionName)}`;
    urlsVisited.push(searchUrl);

    const { platInstruments, deedInstruments, allDocuments } = await searchBellClerkOwnerForPlatDeed(
      subdivisionName,
      logger,
    );

    progress(`  [subdivSearch] "${subdivisionName}": ${allDocuments.length} docs total, ${platInstruments.length} plats, ${deedInstruments.length} deeds`);
    console.log(`[ClerkScraper] Subdivision "${subdivisionName}": ${allDocuments.length} docs, plats=[${platInstruments.join(',')}], deeds=[${deedInstruments.join(',')}]`);

    // Helper: look up the REAL URL from allDocuments by instrument number
    // Only fall back to constructed URL if absolutely no real URL is available
    const getDocUrl = (instrNum: string): string | null => {
      const ref = allDocuments.find(d => d.instrumentNumber === instrNum);
      if (ref?.url) {
        progress(`  [subdivSearch] ${instrNum}: using real URL from search = ${ref.url}`);
        return ref.url;
      }
      // No real URL available — log a warning
      console.warn(`[ClerkScraper] Subdivision doc ${instrNum}: no real URL from search, URL will be null`);
      progress(`  [subdivSearch] ${instrNum}: ⚠ no real URL from search result`);
      return null;
    };

    // Process plat instruments first (highest priority)
    for (const instrNum of platInstruments) {
      let pageImages: string[] = [];
      if (captureImages) {
        try {
          progress(`  [subdivSearch] Capturing plat pages for ${instrNum}...`);
          const pages = await fetchDocumentImages(instrNum, 15, logger);
          pageImages = pages.map(p => p.imageBase64).filter(Boolean);
          progress(`  [subdivSearch] ✓ Plat ${instrNum}: ${pageImages.length} pages captured`);
          console.log(`[ClerkScraper] Subdivision plat ${instrNum}: ${pageImages.length} pages`);
        } catch (imgErr) {
          const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
          progress(`  [subdivSearch] ✗ Plat ${instrNum}: image capture failed: ${msg}`);
          console.error(`[ClerkScraper] Subdivision plat ${instrNum}: image error: ${msg}`);
        }
      }

      // Get metadata from allDocuments if available
      const ref = allDocuments.find(d => d.instrumentNumber === instrNum);
      documents.push({
        instrumentNumber: instrNum,
        volume: ref?.volume ?? null,
        page: ref?.page ?? null,
        recordingDate: ref?.recordingDate ?? null,
        documentType: ref?.documentType ?? 'PLAT',
        grantor: ref?.grantors?.[0] ?? null,
        grantee: ref?.grantees?.[0] ?? null,
        legalDescription: null,
        pageImages,
        sourceUrl: getDocUrl(instrNum),
        relevanceScore: getDocumentRelevance('PLAT'),
      });
    }

    // Process deed instruments
    for (const instrNum of deedInstruments) {
      let pageImages: string[] = [];
      if (captureImages) {
        try {
          progress(`  [subdivSearch] Capturing deed pages for ${instrNum}...`);
          const pages = await fetchDocumentImages(instrNum, 10, logger);
          pageImages = pages.map(p => p.imageBase64).filter(Boolean);
          progress(`  [subdivSearch] ✓ Deed ${instrNum}: ${pageImages.length} pages captured`);
          console.log(`[ClerkScraper] Subdivision deed ${instrNum}: ${pageImages.length} pages`);
        } catch (imgErr) {
          const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
          progress(`  [subdivSearch] ✗ Deed ${instrNum}: image capture failed: ${msg}`);
          console.error(`[ClerkScraper] Subdivision deed ${instrNum}: image error: ${msg}`);
        }
      }

      const ref = allDocuments.find(d => d.instrumentNumber === instrNum);
      documents.push({
        instrumentNumber: instrNum,
        volume: ref?.volume ?? null,
        page: ref?.page ?? null,
        recordingDate: ref?.recordingDate ?? null,
        documentType: ref?.documentType ?? 'WARRANTY DEED',
        grantor: ref?.grantors?.[0] ?? null,
        grantee: ref?.grantees?.[0] ?? null,
        legalDescription: null,
        pageImages,
        sourceUrl: getDocUrl(instrNum),
        relevanceScore: getDocumentRelevance(ref?.documentType ?? 'WARRANTY DEED'),
      });
    }

    progress(`  [subdivSearch] Complete: ${documents.length} document(s) for subdivision "${subdivisionName}"`);
    console.log(`[ClerkScraper] searchClerkBySubdivision complete: ${documents.length} docs`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress(`  [subdivSearch] Error: ${msg}`);
    console.error(`[ClerkScraper] searchClerkBySubdivision ERROR: ${msg}`);
  }

  return documents;
}

// ── Internal: Volume/Page Fetch ───────────────────────────────────────

async function fetchByVolumePage(
  volume: string,
  page: string,
  captureImages: boolean,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<ClerkDocument | null> {
  // Try constructing a quick-search query with vol+page
  const query = `${volume}/${page}`;
  const searchUrl = `${BELL_ENDPOINTS.clerk.results}?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(query)}`;
  urlsVisited.push(searchUrl);

  progress(`  [volPage] Searching for Vol ${volume} Pg ${page}...`);
  console.log(`[ClerkScraper] fetchByVolumePage: vol=${volume}, page=${page}`);

  try {
    const { searchClerkRecords, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `clerk-volpg-${Date.now()}`);

    const docResults = await searchClerkRecords('bell', query, logger);
    const docRefs = docResults.map(d => d.ref);
    if (!docRefs || docRefs.length === 0) {
      progress(`  [volPage] No results for Vol ${volume} Pg ${page}`);
      console.log(`[ClerkScraper] Vol ${volume}/Pg ${page}: 0 results`);
      return null;
    }

    progress(`  [volPage] Found ${docRefs.length} result(s) for Vol ${volume} Pg ${page}`);

    // Pick the best matching result
    const match = docRefs.find(d => d.volume === volume && d.page === page) ?? docRefs[0];
    if (!match) return null;

    // Use the REAL URL from the search result
    const realUrl = match.url ?? null;
    progress(`  [volPage] Best match: ${match.documentType} inst#${match.instrumentNumber ?? '?'}, url=${realUrl ?? 'none'}`);
    console.log(`[ClerkScraper] Vol ${volume}/Pg ${page}: match type=${match.documentType}, inst=${match.instrumentNumber}, url=${realUrl}`);

    let pageImages: string[] = [];
    if (captureImages && match.instrumentNumber) {
      try {
        progress(`  [volPage] Capturing pages for ${match.instrumentNumber}...`);
        const pages = await fetchDocumentImages(match.instrumentNumber, 10, logger);
        pageImages = pages.map(p => p.imageBase64).filter(Boolean);
        progress(`  [volPage] ✓ ${match.instrumentNumber}: ${pageImages.length} page(s) captured`);
      } catch (imgErr) {
        const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
        progress(`  [volPage] ✗ ${match.instrumentNumber}: image capture failed: ${msg}`);
        console.error(`[ClerkScraper] Vol/page image error for ${match.instrumentNumber}: ${msg}`);
      }
    }

    return {
      instrumentNumber: match.instrumentNumber,
      volume: match.volume,
      page: match.page,
      recordingDate: match.recordingDate,
      documentType: match.documentType,
      grantor: match.grantors[0] ?? null,
      grantee: match.grantees[0] ?? null,
      legalDescription: null,
      pageImages,
      // Use real URL from search results, NOT a constructed URL
      sourceUrl: realUrl,
      relevanceScore: getDocumentRelevance(match.documentType),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress(`  [volPage] Vol/page lookup error (${volume}/${page}): ${msg}`);
    console.error(`[ClerkScraper] fetchByVolumePage ERROR for ${volume}/${page}: ${msg}`);
    return null;
  }
}

/**
 * Capture all page images for a document instrument number.
 * Uses Playwright via fetchDocumentImages() from bell-clerk.ts.
 * Returns base64-encoded PNG strings for each page.
 */
export async function captureDocumentPages(
  instrumentId: string,
  maxPages: number,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
  projectId?: string,
): Promise<string[]> {
  // NOTE: We don't push a constructed URL here — fetchDocumentImages uses
  // search+click to find the correct document page with the real internal ID.
  progress(`[capturePages] Capturing pages for document: ${instrumentId} (max ${maxPages})`);
  console.log(`[ClerkScraper] captureDocumentPages: instrument=${instrumentId}, maxPages=${maxPages}`);

  try {
    const { fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `clerk-pages-${instrumentId}-${Date.now()}`);

    const pages = await fetchDocumentImages(instrumentId, maxPages, logger);
    const images = pages.map(p => p.imageBase64).filter(Boolean);
    progress(`[capturePages] ✓ Captured ${images.length}/${pages.length} page(s) for ${instrumentId}`);
    console.log(`[ClerkScraper] captureDocumentPages ${instrumentId}: ${images.length} images captured`);

    // Push the actual viewer URL if we got one from the signed URLs
    if (pages.length > 0 && pages[0].signedUrl) {
      // The signed URL reveals the actual doc path — but use the search URL for reference
      const searchUrl = `${BELL_ENDPOINTS.clerk.results}?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(instrumentId)}`;
      urlsVisited.push(searchUrl);
    }

    return images;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress(`[capturePages] ✗ Document image capture failed for ${instrumentId}: ${msg}`);
    console.error(`[ClerkScraper] captureDocumentPages ERROR for ${instrumentId}: ${msg}`);
    return [];
  }
}

// ── Internal: Utilities ──────────────────────────────────────────────

function formatOwnerNameVariants(ownerName: string): string[] {
  const upper = ownerName.trim().toUpperCase();
  const variants = [upper];
  const parts = upper.split(/\s+/);

  const businessKeywords = ['LLC', 'INC', 'CORP', 'LTD', 'LP', 'TRUST', 'ESTATE',
    'FOUNDATION', 'SURVEYING', 'COMPANY', 'PARTNERS', 'ASSOCIATION', 'HOLDINGS'];
  const isBusiness = businessKeywords.some(kw => upper.includes(kw));

  if (!isBusiness && parts.length >= 2 && !upper.includes(',')) {
    // LAST, FIRST format (Bell Clerk stores names this way)
    variants.push(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`);
    // Try just the last name for broader matching
    if (parts[parts.length - 1].length > 3) {
      variants.push(parts[parts.length - 1]);
    }
  }

  // If already "LAST, FIRST", also try without comma
  if (upper.includes(',')) {
    const [last, rest] = upper.split(',').map(s => s.trim());
    if (rest) variants.push(`${rest} ${last}`);
  }

  return [...new Set(variants)];
}

function getDocumentRelevance(docType: string): number {
  const upper = docType.toUpperCase();
  for (const [type, score] of Object.entries(DOCUMENT_TYPE_SCORES)) {
    if (upper.includes(type)) return score;
  }
  return 10;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
