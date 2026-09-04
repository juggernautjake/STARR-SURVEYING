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
import { mapBounded } from '../../../infra/bounded-map.js';

/**
 * Capture several instruments at once, politely (E5d).
 *
 * Returns images in INPUT order plus a parallel array of error messages, so the assembly loops
 * below stay exactly as they were: index in, document out. Splitting images from errors rather
 * than returning a discriminated union keeps those loops from having to branch on a shape.
 *
 * An empty list short-circuits, so captureImages === false costs nothing at all.
 */
async function captureInstruments(
  instruments: readonly string[],
  capture: (instrumentNumber: string) => Promise<string[]>,
): Promise<{ images: Array<string[]>; errors: Array<string | null> }> {
  if (instruments.length === 0) return { images: [], errors: [] };
  const results = await mapBounded(instruments, (n) => capture(n));
  return {
    images: results.map((r) => (r.ok ? r.value : [])),
    errors: results.map((r) => (r.ok ? null : (r.error instanceof Error ? r.error.message : String(r.error)))),
  };
}

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
  /**
   * Property identifiers for early relevance filtering in Path B (owner search).
   * When provided, documents from the owner search will be checked against these
   * identifiers BEFORE downloading page images. Documents that clearly belong to
   * a different property (different abstract, different subdivision, etc.) will be
   * skipped entirely, saving significant time and cost.
   */
  propertyIdentifiers?: {
    abstractNumber?: string | null;
    surveyName?: string | null;
    acreage?: number | null;
    subdivisionName?: string | null;
    lotNumber?: string | null;
    legalDescription?: string | null;
    situsAddress?: string | null;
  };
  /**
   * When true, skip Path B (owner name search) entirely.
   * Use this in Phase 2B½ to avoid re-running the full owner search
   * when we only need to fetch specific instrument numbers.
   */
  skipOwnerSearch?: boolean;
  /** Aborted by the caller when the run's time is up: no further page captures are started.
   *  Run 4 (2026-09-04) kept launching browsers for five minutes after the run had ended. */
  signal?: AbortSignal;
  /** Called the moment a document is captured, so a caller whose deadline expires mid-search
   *  keeps what was captured (six plats and five deeds were discarded at the ceiling on run 4). */
  onDocument?: (doc: ClerkDocument) => void;
  /** Called as each search path finishes (A instruments, B owner, C subdivision, D volume/page),
   *  so a caller whose deadline cuts the step short can say WHICH part did not finish. On run 5
   *  the subject's own deed chain (A + B) had finished; only the subdivision sweep was cut. */
  onPathComplete?: (path: 'A' | 'B' | 'C' | 'D') => void;
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
      input.onDocument?.(doc);
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
    if (input.ownerName) {
      progress(`  Owner filter active: "${input.ownerName}" — instruments whose parties don't match will be skipped`);
    }

    let skippedCount = 0;
    const skippedInstruments: string[] = [];
    for (const instrNum of unique) {
      if (documents.length >= maxDocs) break;

      progress(`  Fetching instrument: ${instrNum}`);
      const doc = await fetchInstrumentDocument(
        instrNum, captureImages, screenshots, urlsVisited, progress,
        input.projectId, input.ownerName, // Pass owner for pre-download validation
      );
      if (doc) {
        // Skip documents pre-filtered as irrelevant (owner mismatch, wrong parcel).
        // These come back with relevanceScore=0 and empty pageImages — the metadata
        // was retrieved but page images were NOT downloaded (saving ~2-5 minutes).
        if (doc.relevanceScore === 0 && doc.pageImages.length === 0) {
          skippedCount++;
          skippedInstruments.push(instrNum);
          progress(`  ✗ SKIPPED: ${doc.documentType} — ${instrNum}`);
          progress(`    Reason: Parties "${doc.grantor ?? '?'}" / "${doc.grantee ?? '?'}" don't match target owner "${input.ownerName}"`);
          progress(`    This instrument likely belongs to a neighboring parcel, not our property`);
        } else {
          const isNew = addDocument(doc);
          if (isNew) {
            progress(`  ✓ KEPT: ${doc.documentType} — ${instrNum} (${doc.grantor ?? '?'} → ${doc.grantee ?? '?'})`);
          }
        }
      } else {
        progress(`  ✗ Not found: ${instrNum}`);
      }

      await delay(RATE_LIMITS.defaultDelay);
    }

    if (skippedCount > 0) {
      progress(`Path A complete: ${documents.length} document(s) kept, ${skippedCount} skipped as unrelated [${skippedInstruments.join(', ')}]`);
    } else {
      progress(`Path A complete: ${documents.length} document(s) found — all matched target owner`);
    }
    input.onPathComplete?.('A');
  }

  // ── Path B: Owner Name SPA Search ──────────────────────────────────
  // The Kofile SPA requires Playwright for interactive search. The
  // bell-clerk.ts service layer handles all browser interaction.
  if (input.ownerName && documents.length < maxDocs && !input.skipOwnerSearch) {
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
      input.propertyIdentifiers,
    );

    let newCount = 0;
    for (const doc of ownerDocs) {
      if (addDocument(doc)) newCount++;
    }
    progress(`Path B complete: ${newCount} new document(s) found (${ownerDocs.length} total from owner search)`);
    input.onPathComplete?.('B');
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
      { signal: input.signal, onDocument: input.onDocument },
    );

    let newCount = 0;
    for (const doc of subdivDocs) {
      if (addDocument(doc)) newCount++;
    }
    progress(`Path C complete: ${newCount} new document(s) found for subdivision`);
    input.onPathComplete?.('C');
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
  /** If set, verify grantor/grantee matches before downloading pages */
  expectedOwnerName?: string,
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
    console.log(`[ClerkScraper] Instrument ${instrumentNumber}: found type=${docRef.documentType}, url=${realDocUrl}, grantors=[${docRef.grantors.join(',')}], grantees=[${docRef.grantees.join(',')}]`);

    // ── Pre-download owner validation ──
    // If we know the expected owner, verify the instrument's parties match
    // BEFORE downloading potentially 20+ page images (~2 min each).
    // This catches unrelated instruments from neighboring GIS parcels.
    if (expectedOwnerName && (docRef.grantors.length > 0 || docRef.grantees.length > 0)) {
      const targetOwner = expectedOwnerName.toUpperCase().replace(/[,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
      const allParties = [...docRef.grantors, ...docRef.grantees].map(p =>
        p.toUpperCase().replace(/[,.\-]/g, ' ').replace(/\s+/g, ' ').trim()
      );
      const ownerWords = targetOwner.split(' ').filter(w => w.length > 2);
      // Check if any significant word from the target owner appears in any party
      const matchesOwner = ownerWords.some(word =>
        allParties.some(party => party.includes(word))
      );

      if (!matchesOwner) {
        progress(`    [fetchInstrument] ⚠ OWNER MISMATCH — skipping page download`);
        progress(`    [fetchInstrument]   Expected: "${expectedOwnerName}"`);
        progress(`    [fetchInstrument]   Found: grantors=[${docRef.grantors.join(', ')}], grantees=[${docRef.grantees.join(', ')}]`);
        console.log(`[ClerkScraper] PRE-FILTER SKIP: Instrument ${instrumentNumber} parties [${allParties.join('; ')}] do not match owner "${expectedOwnerName}"`);
        // Return metadata-only record (no page images) so it's logged but not analyzed
        return {
          instrumentNumber,
          volume: docRef.volume ?? null,
          page: docRef.page ?? null,
          recordingDate: docRef.recordingDate ?? null,
          documentType: docRef.documentType ?? 'Unknown',
          grantor: docRef.grantors[0] ?? null,
          grantee: docRef.grantees[0] ?? null,
          legalDescription: null,
          pageImages: [], // No images — skipped due to owner mismatch
          sourceUrl: realDocUrl,
          relevanceScore: 0, // Mark as irrelevant
        };
      }
      progress(`    [fetchInstrument] ✓ Owner match confirmed in parties`);
    }

    // Capture page images if requested
    let pageImages: string[] = [];
    if (captureImages) {
      try {
        progress(`    [fetchInstrument] Capturing page images for ${instrumentNumber}...`);
        console.log(`[ClerkScraper] fetchDocumentImages: instrument=${instrumentNumber}, maxPages=20`);
        // `docRef.url`, NOT `realDocUrl`. They differ in exactly the way that matters here:
        // realDocUrl falls back to BELL_ENDPOINTS.clerk.document(instrumentNumber), which BUILDS
        // /doc/{instrumentNumber} — and Tyler's /doc/ takes an internal document id, so that
        // constructed URL 404s or opens the wrong record. Only the URL read from the search
        // results is safe to navigate to directly; when it is absent, the search path runs.
        const pages = await fetchDocumentImages(instrumentNumber, 20, logger, 'bell', undefined, docRef.url ?? undefined);
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
  propertyIdentifiers?: ClerkSearchInput['propertyIdentifiers'],
): Promise<ClerkDocument[]> {
  const documents: ClerkDocument[] = [];
  const nameVariants = formatOwnerNameVariants(ownerName);

  const hasPropertyFilter = propertyIdentifiers && (
    propertyIdentifiers.abstractNumber || propertyIdentifiers.subdivisionName ||
    propertyIdentifiers.lotNumber || propertyIdentifiers.legalDescription
  );

  progress(`  [ownerSearch] Starting owner search for "${ownerName}" (${nameVariants.length} variant(s): ${nameVariants.join(', ')})`);
  if (hasPropertyFilter) {
    progress(`  [ownerSearch] Early relevance filter active: abstract=${propertyIdentifiers!.abstractNumber ?? '?'}, subdiv="${propertyIdentifiers!.subdivisionName ?? '?'}", lot=${propertyIdentifiers!.lotNumber ?? '?'}`);
  }
  console.log(`[ClerkScraper] searchClerkByOwner: owner="${ownerName}", maxDocs=${maxDocs}, variants=${nameVariants.join(',')}, hasPropertyFilter=${!!hasPropertyFilter}`);

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

      progress(`  [ownerSearch] Found ${docRefs.length} document(s) for "${name}" — filtering before download...`);
      console.log(`[ClerkScraper] Owner variant "${name}": ${docRefs.length} results, types: ${docRefs.map(r => r.documentType).join(', ')}`);

      // ── Early relevance filtering BEFORE image download ──────────
      // When property identifiers are available, check each document's
      // metadata (property description, grantor/grantee) against the
      // known property identifiers. Documents that clearly belong to a
      // different property (different abstract/OPR, different subdivision)
      // are skipped entirely — saving 1-2 minutes per document.
      let skippedByFilter = 0;
      for (const ref of docRefs.slice(0, maxDocs - documents.length + 10)) { // +10 buffer for filtered docs
        if (documents.length >= maxDocs) break;
        const instrNum = ref.instrumentNumber ?? '';
        let pageImages: string[] = [];

        // ── Pre-download relevance check ──────────────────────────
        // Use document metadata available from search results to skip
        // documents that clearly belong to a different property.
        // The DocumentRef has: instrumentNumber, volume, page, documentType,
        // recordingDate, grantors, grantees, source, url.
        // We also check any textContent from search results if available.
        if (hasPropertyFilter) {
          // Check the document result's textContent or any available property description
          const docResult = docResults.find(d => d.ref === ref);
          const textContent = docResult?.textContent ?? '';
          const propDesc = textContent.toUpperCase();
          const targetAbstract = propertyIdentifiers!.abstractNumber?.replace(/^[A0]*/, '') ?? null;

          // Check 1: If document text content mentions a DIFFERENT abstract number, skip it
          if (targetAbstract && propDesc.length > 10) {
            const abstractMatch = propDesc.match(/A(?:BSTRACT\s*(?:NO\.?\s*)?)?(\d+)/i);
            if (abstractMatch) {
              const docAbstract = abstractMatch[1].replace(/^0+/, '');
              if (docAbstract !== targetAbstract.replace(/^0+/, '')) {
                skippedByFilter++;
                progress(`  [ownerSearch] SKIP ${instrNum} (${ref.documentType}): different abstract ${docAbstract} vs target ${targetAbstract}`);
                continue;
              }
            }
          }

          // Check 2: Skip documents where the owner appears as GRANTOR and GRANTEE
          // names don't match our target owner at all (e.g., "JORDAN MICHAEL A"
          // appearing with "SPRING EQ LLC" is likely a different JORDAN property)
          // NOTE: We intentionally keep this conservative — only skip if we have
          // very strong evidence of a different property. The post-AI filter (Phase 3C)
          // handles ambiguous cases.
        }

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
            const pages = await fetchDocumentImages(instrNum, 10, logger, 'bell', undefined, realUrl ?? undefined);
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

      // Aggregate filter summary
      const reviewed = Math.min(docRefs.length, maxDocs - documents.length + 10 + skippedByFilter);
      progress(`  [ownerSearch] Filter summary for "${name}": reviewed=${reviewed}, kept=${documents.length}, skipped=${skippedByFilter}` +
        (skippedByFilter > 0 ? ' (abstract/property mismatch)' : ''));

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
  opts: { signal?: AbortSignal; onDocument?: (doc: ClerkDocument) => void } = {},
): Promise<ClerkDocument[]> {
  const documents: ClerkDocument[] = [];
  /** Push AND hand to the caller now — the caller's deadline may expire before this returns. */
  const file = (doc: ClerkDocument) => { documents.push(doc); opts.onDocument?.(doc); };
  /** Before every page capture: the run's time may have run out while the previous one ran. */
  const stillAllowed = (what: string) => {
    if (opts.signal?.aborted) throw new Error(`${what} not started — the run's time ran out`);
  };

  progress(`  [subdivSearch] Starting subdivision search for "${subdivisionName}"`);
  console.log(`[ClerkScraper] searchClerkBySubdivision: subdiv="${subdivisionName}"`);

  try {
    const { searchBellClerkOwnerForPlatDeed, fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `clerk-subdiv-${Date.now()}`);

    const searchUrl = `${BELL_ENDPOINTS.clerk.results}?department=RP&searchType=quickSearch&searchValue=${encodeURIComponent(subdivisionName)}`;
    urlsVisited.push(searchUrl);

    const { platInstruments, deedInstruments, otherInstruments, allDocuments } = await searchBellClerkOwnerForPlatDeed(
      subdivisionName,
      logger,
    );

    progress(`  [subdivSearch] "${subdivisionName}": ${allDocuments.length} docs total, ${platInstruments.length} plats, ${deedInstruments.length} deeds, ${otherInstruments.length} other`);
    console.log(`[ClerkScraper] Subdivision "${subdivisionName}": ${allDocuments.length} docs, plats=[${platInstruments.join(',')}], deeds=[${deedInstruments.join(',')}], other=[${otherInstruments.join(',')}]`);

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

    // ── E5d: capture first, BOUNDED; then assemble in order ────────────────────────
    //
    // Was one await fetchDocumentImages per instrument, strictly sequential — eleven documents
    // meant eleven round trips end to end. captureInstruments runs a few at a time and returns
    // the results in INPUT order, so the assembly loop below is unchanged and `documents` still
    // reads plats, then deeds, then other.
    //
    // The limit is small BY POLICY, not by hardware. capacity.ts caps concurrent runs because
    // "these are small government servers, and the fastest way to lose access to a county portal
    // is to look like a load test" — that judgement applies inside a run too. A run that gets the
    // firm banned from Bell County is not a faster run.
    //
    // Errors stay per-document: a failure is recorded against its instrument and the other
    // captures continue, exactly as the per-item try/catch did before. Promise.all would have
    // turned one unreachable document into zero documents.
    const platCaptures = await captureInstruments(
      captureImages ? platInstruments : [],
      async (instrNum) => {
        stillAllowed(`plat ${instrNum}`);
        progress(`  [subdivSearch] Capturing plat pages for ${instrNum}...`);
        const pages = await fetchDocumentImages(instrNum, 15, logger, 'bell', undefined, getDocUrl(instrNum) ?? undefined);
        const imgs = pages.map(p => p.imageBase64).filter(Boolean);
        progress(`  [subdivSearch] ✓ Plat ${instrNum}: ${imgs.length} pages captured`);
        console.log(`[ClerkScraper] Subdivision plat ${instrNum}: ${imgs.length} pages`);
        return imgs;
      },
    );

    for (const [idx, instrNum] of platInstruments.entries()) {
      const pageImages = captureImages ? (platCaptures.images[idx] ?? []) : [];
      const capErr = platCaptures.errors[idx];
      if (capErr) {
        progress(`  [subdivSearch] ✗ Plat ${instrNum}: image capture failed: ${capErr}`);
        console.error(`[ClerkScraper] Subdivision plat ${instrNum}: image error: ${capErr}`);
      }
      // Get metadata from allDocuments if available
      const ref = allDocuments.find(d => d.instrumentNumber === instrNum);
      file({
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

    // ── E5d: capture first, BOUNDED; then assemble in order ────────────────────────
    //
    // Was one await fetchDocumentImages per instrument, strictly sequential — eleven documents
    // meant eleven round trips end to end. captureInstruments runs a few at a time and returns
    // the results in INPUT order, so the assembly loop below is unchanged and `documents` still
    // reads plats, then deeds, then other.
    //
    // The limit is small BY POLICY, not by hardware. capacity.ts caps concurrent runs because
    // "these are small government servers, and the fastest way to lose access to a county portal
    // is to look like a load test" — that judgement applies inside a run too. A run that gets the
    // firm banned from Bell County is not a faster run.
    //
    // Errors stay per-document: a failure is recorded against its instrument and the other
    // captures continue, exactly as the per-item try/catch did before. Promise.all would have
    // turned one unreachable document into zero documents.
    const deedCaptures = await captureInstruments(
      captureImages ? deedInstruments : [],
      async (instrNum) => {
        stillAllowed(`deed ${instrNum}`);
        progress(`  [subdivSearch] Capturing deed pages for ${instrNum}...`);
        const pages = await fetchDocumentImages(instrNum, 10, logger, 'bell', undefined, getDocUrl(instrNum) ?? undefined);
        const imgs = pages.map(p => p.imageBase64).filter(Boolean);
        progress(`  [subdivSearch] ✓ Deed ${instrNum}: ${imgs.length} pages captured`);
        console.log(`[ClerkScraper] Subdivision deed ${instrNum}: ${imgs.length} pages`);
        return imgs;
      },
    );

    for (const [idx, instrNum] of deedInstruments.entries()) {
      const pageImages = captureImages ? (deedCaptures.images[idx] ?? []) : [];
      const capErr = deedCaptures.errors[idx];
      if (capErr) {
        progress(`  [subdivSearch] ✗ Deed ${instrNum}: image capture failed: ${capErr}`);
        console.error(`[ClerkScraper] Subdivision deed ${instrNum}: image error: ${capErr}`);
      }
      const ref = allDocuments.find(d => d.instrumentNumber === instrNum);
      file({
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

    // ── E5d: capture first, BOUNDED; then assemble in order ────────────────────────
    //
    // Was one await fetchDocumentImages per instrument, strictly sequential — eleven documents
    // meant eleven round trips end to end. captureInstruments runs a few at a time and returns
    // the results in INPUT order, so the assembly loop below is unchanged and `documents` still
    // reads plats, then deeds, then other.
    //
    // The limit is small BY POLICY, not by hardware. capacity.ts caps concurrent runs because
    // "these are small government servers, and the fastest way to lose access to a county portal
    // is to look like a load test" — that judgement applies inside a run too. A run that gets the
    // firm banned from Bell County is not a faster run.
    //
    // Errors stay per-document: a failure is recorded against its instrument and the other
    // captures continue, exactly as the per-item try/catch did before. Promise.all would have
    // turned one unreachable document into zero documents.
    // ── ONLY THE "OTHER" DOCUMENTS THAT ARE ABOUT THE LAND ─────────────────────────────────
    //
    // A subdivision search returns everything ever filed against the subdivision's name. On run 4
    // that was 37 "other" documents — mechanic's liens, releases, partial releases — for a whole
    // neighbourhood, downloaded at 30–80 s each ahead of the subject's own deed search, until the
    // ceiling fell. A lien is about money owed on someone else's lot; it cannot move a boundary.
    // Easements, rights of way, restrictions, dedications, replats and amendments can, and those
    // are kept. What is skipped is named in the log, so nobody mistakes "not downloaded" for
    // "not on record".
    const isAboutTheLand = (type: string) =>
      /EASEMENT|RIGHT[\s-]*OF[\s-]*WAY|R\.?O\.?W\.?|RESTRICT|COVENANT|DEDICAT|REPLAT|PLAT|VACAT|AMEND|BOUNDARY|SURVEY|AGREEMENT|ABANDON/i.test(type) &&
      !/LIEN|RELEASE|DEED OF TRUST|ASSIGNMENT|UCC|MECHANIC/i.test(type);
    const typeOf = (instrNum: string) => allDocuments.find(d => d.instrumentNumber === instrNum)?.documentType ?? 'OTHER';
    const landOthers = otherInstruments.filter((n) => isAboutTheLand(typeOf(n))).slice(0, 8);
    const skippedOthers = otherInstruments.filter((n) => !landOthers.includes(n));
    if (skippedOthers.length > 0) {
      const byType = new Map<string, number>();
      for (const n of skippedOthers) byType.set(typeOf(n), (byType.get(typeOf(n)) ?? 0) + 1);
      progress(
        `  [subdivSearch] ${skippedOthers.length} subdivision document(s) indexed but not downloaded — ` +
        `about money or another lot, not the land: ${[...byType].map(([t, c]) => `${t} ×${c}`).join(', ')}`,
      );
    }
    const otherCaptures = await captureInstruments(
      captureImages ? landOthers : [],
      async (instrNum) => {
        stillAllowed(`document ${instrNum}`);
        const oref = allDocuments.find(d => d.instrumentNumber === instrNum);
        const otherDocType = oref?.documentType ?? 'Other Document';
        progress(`  [subdivSearch] Capturing ${otherDocType} pages for ${instrNum}...`);
        const pages = await fetchDocumentImages(instrNum, 10, logger, 'bell', undefined, getDocUrl(instrNum) ?? undefined);
        const imgs = pages.map(p => p.imageBase64).filter(Boolean);
        progress(`  [subdivSearch] ✓ ${otherDocType} ${instrNum}: ${imgs.length} pages captured`);
        console.log(`[ClerkScraper] Subdivision ${otherDocType} ${instrNum}: ${imgs.length} pages`);
        return imgs;
      },
    );

    for (const [idx, instrNum] of landOthers.entries()) {
      const pageImages = captureImages ? (otherCaptures.images[idx] ?? []) : [];
      const capErr = otherCaptures.errors[idx];
      if (capErr) {
        progress(`  [subdivSearch] ✗ Other ${instrNum}: image capture failed: ${capErr}`);
        console.error(`[ClerkScraper] Subdivision other ${instrNum}: image error: ${capErr}`);
      }
      const ref = allDocuments.find(d => d.instrumentNumber === instrNum);
      file({
        instrumentNumber: instrNum,
        volume: ref?.volume ?? null,
        page: ref?.page ?? null,
        recordingDate: ref?.recordingDate ?? null,
        documentType: ref?.documentType ?? 'OTHER',
        grantor: ref?.grantors?.[0] ?? null,
        grantee: ref?.grantees?.[0] ?? null,
        legalDescription: null,
        pageImages,
        sourceUrl: getDocUrl(instrNum),
        relevanceScore: getDocumentRelevance(ref?.documentType ?? 'OTHER'),
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
        const pages = await fetchDocumentImages(match.instrumentNumber, 10, logger, 'bell', undefined, realUrl ?? undefined);
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
  const t0 = Date.now();
  progress(`[capturePages] Capturing pages for document: ${instrumentId} (max ${maxPages})`);
  console.log(`[ClerkScraper] captureDocumentPages: instrument=${instrumentId}, maxPages=${maxPages}`);

  try {
    const { fetchDocumentImages } = await import('../../../services/bell-clerk.js');
    const { PipelineLogger } = await import('../../../lib/logger.js');
    const logger = new PipelineLogger(projectId ?? `clerk-pages-${instrumentId}-${Date.now()}`);

    const pages = await fetchDocumentImages(instrumentId, maxPages, logger);
    const images = pages.map(p => p.imageBase64).filter(Boolean);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const totalKb = images.reduce((sum, img) => sum + Math.round(img.length * 3 / 4 / 1024), 0);
    progress(`[capturePages] ✓ Captured ${images.length}/${pages.length} page(s) for ${instrumentId} in ${elapsed}s (${totalKb}KB)`);
    console.log(`[ClerkScraper] captureDocumentPages ${instrumentId}: ${images.length} images, ${totalKb}KB, ${elapsed}s`);

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
