/**
 * Bell County Clerk Scraper
 *
 * Searches Bell County Clerk records via Kofile/GovOS PublicSearch
 * (bell.tx.publicsearch.us). Retrieves deeds, plats, easements,
 * restrictions, and all other recorded documents.
 *
 * Three search paths:
 *   A. Direct instrument number lookup (fastest, most precise)
 *   B. Document type + date range search
 *   C. Owner name search (Playwright SPA interaction)
 *
 * Also captures page images from the document viewer.
 */

import { BELL_ENDPOINTS, RATE_LIMITS, TIMEOUTS } from '../config/endpoints';
import { DOCUMENT_TYPE_SCORES } from '../config/field-maps';
import type { ScreenshotCapture, DeedRecord } from '../types/research-result';

// ── Types ────────────────────────────────────────────────────────────

export interface ClerkSearchResult {
  /** All documents found */
  documents: ClerkDocument[];
  /** Screenshots captured during search */
  screenshots: ScreenshotCapture[];
  /** All URLs visited */
  urlsVisited: string[];
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
  /** Page images (base64 PNG) */
  pageImages: string[];
  /** Source URL for this document */
  sourceUrl: string | null;
  /** Relevance score based on document type */
  relevanceScore: number;
}

export interface ClerkSearchInput {
  /** Instrument numbers to look up directly */
  instrumentNumbers?: string[];
  /** Owner name for SPA search */
  ownerName?: string;
  /** Volume/page references */
  volumePages?: Array<{ volume: string; page: string }>;
  /** Maximum documents to retrieve */
  maxDocuments?: number;
}

export interface ClerkScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Search Bell County Clerk for recorded documents.
 * Uses all available identifiers to find relevant documents.
 */
export async function scrapeBellClerk(
  input: ClerkSearchInput,
  onProgress: (p: ClerkScraperProgress) => void,
): Promise<ClerkSearchResult> {
  const documents: ClerkDocument[] = [];
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];
  const maxDocs = input.maxDocuments ?? 50;

  const progress = (msg: string) => {
    onProgress({ phase: 'Clerk', message: msg, timestamp: new Date().toISOString() });
  };

  // ── Path A: Direct Instrument Number Lookup ────────────────────────
  if (input.instrumentNumbers && input.instrumentNumbers.length > 0) {
    progress(`Looking up ${input.instrumentNumbers.length} instrument number(s)...`);

    for (const instrNum of input.instrumentNumbers) {
      if (documents.length >= maxDocs) break;

      const doc = await lookupByInstrumentNumber(instrNum, screenshots, urlsVisited, progress);
      if (doc) {
        documents.push(doc);
        progress(`Found: ${doc.documentType} — ${instrNum}`);
      }

      await delay(RATE_LIMITS.defaultDelay);
    }
  }

  // ── Path B: Owner Name SPA Search ──────────────────────────────────
  if (input.ownerName && documents.length < maxDocs) {
    progress(`Searching clerk records by owner: ${input.ownerName}`);
    const ownerDocs = await searchByOwnerName(
      input.ownerName,
      maxDocs - documents.length,
      screenshots,
      urlsVisited,
      progress,
    );
    documents.push(...ownerDocs);
  }

  // ── Path C: Volume/Page Lookup ─────────────────────────────────────
  if (input.volumePages && input.volumePages.length > 0) {
    progress(`Looking up ${input.volumePages.length} volume/page reference(s)...`);

    for (const vp of input.volumePages) {
      if (documents.length >= maxDocs) break;

      const doc = await lookupByVolumePage(vp.volume, vp.page, screenshots, urlsVisited, progress);
      if (doc && !documents.find(d => d.instrumentNumber === doc.instrumentNumber)) {
        documents.push(doc);
      }
    }
  }

  // Sort by relevance score (most relevant first)
  documents.sort((a, b) => b.relevanceScore - a.relevanceScore);

  progress(`Clerk search complete: ${documents.length} document(s) found`);

  return { documents, screenshots, urlsVisited };
}

// ── Internal: Instrument Number Lookup ───────────────────────────────

async function lookupByInstrumentNumber(
  instrumentNumber: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
): Promise<ClerkDocument | null> {
  // Try the direct URL approach first
  const searchUrl = `${BELL_ENDPOINTS.clerk.results}?department=RP&limit=50&offset=0&searchOcrText=false&searchType=quickSearch&search=${encodeURIComponent(instrumentNumber)}`;
  urlsVisited.push(searchUrl);

  // PublicSearch is a React SPA — direct HTTP won't work for search results.
  // We need Playwright for the interactive search, but can try SuperSearch API.
  const superSearchResult = await trySuperSearch(instrumentNumber, screenshots, urlsVisited);
  if (superSearchResult) return superSearchResult;

  // Fall back to Playwright-based search
  return searchWithPlaywright(instrumentNumber, 'instrument', screenshots, urlsVisited, progress);
}

// ── Internal: Volume/Page Lookup ─────────────────────────────────────

async function lookupByVolumePage(
  volume: string,
  page: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
): Promise<ClerkDocument | null> {
  // SuperSearch with volume/page reference
  const query = `volume:${volume} page:${page}`;
  return trySuperSearch(query, screenshots, urlsVisited);
}

// ── Internal: Owner Name Search ──────────────────────────────────────

async function searchByOwnerName(
  ownerName: string,
  maxDocs: number,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
): Promise<ClerkDocument[]> {
  const documents: ClerkDocument[] = [];

  // Format owner name for search
  const nameVariants = formatOwnerNameVariants(ownerName);

  for (const name of nameVariants) {
    if (documents.length >= maxDocs) break;

    progress(`Trying owner name variant: "${name}"`);
    const results = await searchWithPlaywright(name, 'owner', screenshots, urlsVisited, progress);
    if (results) {
      documents.push(results);
    }
  }

  return documents;
}

// ── Internal: SuperSearch API ────────────────────────────────────────

async function trySuperSearch(
  query: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): Promise<ClerkDocument | null> {
  urlsVisited.push(BELL_ENDPOINTS.clerk.superSearch);

  try {
    const resp = await fetch(BELL_ENDPOINTS.clerk.superSearch, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        query,
        department: 'RP',
        limit: 10,
      }),
      signal: AbortSignal.timeout(TIMEOUTS.httpRequest),
    });

    if (!resp.ok) return null;
    const data = await resp.json() as { results?: Array<Record<string, unknown>> };

    if (data.results && data.results.length > 0) {
      const first = data.results[0];
      return {
        instrumentNumber: String(first.instrumentNumber ?? first.docNumber ?? ''),
        volume: first.volume ? String(first.volume) : null,
        page: first.page ? String(first.page) : null,
        recordingDate: first.recordingDate ? String(first.recordingDate) : null,
        documentType: String(first.documentType ?? first.docType ?? 'UNKNOWN'),
        grantor: first.grantor ? String(first.grantor) : null,
        grantee: first.grantee ? String(first.grantee) : null,
        legalDescription: first.legalDescription ? String(first.legalDescription) : null,
        pageImages: [],
        sourceUrl: BELL_ENDPOINTS.clerk.document(String(first.instrumentNumber ?? '')),
        relevanceScore: getDocumentRelevance(String(first.documentType ?? '')),
      };
    }
  } catch {
    // SuperSearch may not be available — fall through
  }

  return null;
}

// ── Internal: Playwright Search ──────────────────────────────────────

async function searchWithPlaywright(
  query: string,
  searchType: 'instrument' | 'owner',
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
): Promise<ClerkDocument | null> {
  // TODO: Implement Playwright-based search of bell.tx.publicsearch.us
  // This will:
  // 1. Launch Chromium
  // 2. Navigate to PublicSearch
  // 3. Enter search query
  // 4. Parse results from the SPA
  // 5. Click into each document
  // 6. Capture page screenshots
  // 7. Extract document metadata
  //
  // The existing bell-clerk.ts has most of this logic — it will be
  // migrated here in Phase 1.

  progress(`Playwright search not yet migrated for query: "${query}"`);
  return null;
}

// ── Internal: Document Image Capture ─────────────────────────────────

/**
 * Capture all pages of a document from the PublicSearch viewer.
 * Uses Playwright to navigate through document pages and screenshot each one.
 */
export async function captureDocumentPages(
  instrumentId: string,
  maxPages: number,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
  progress: (msg: string) => void,
): Promise<string[]> {
  const docUrl = BELL_ENDPOINTS.clerk.document(instrumentId);
  urlsVisited.push(docUrl);
  progress(`Capturing pages for document: ${instrumentId}`);

  // TODO: Implement multi-page document capture
  // This will use Playwright to:
  // 1. Navigate to the document viewer
  // 2. Detect page count
  // 3. Navigate through each page
  // 4. Screenshot each page at highest resolution
  // 5. Return base64-encoded PNG array
  //
  // Existing logic in bell-clerk.ts captureAllDocumentPages()
  // will be migrated here.

  return [];
}

// ── Internal: Utilities ──────────────────────────────────────────────

function formatOwnerNameVariants(ownerName: string): string[] {
  const variants = [ownerName.toUpperCase()];
  const parts = ownerName.trim().split(/\s+/);

  // Business entities stay as-is
  const businessKeywords = ['LLC', 'INC', 'CORP', 'LTD', 'LP', 'TRUST', 'ESTATE', 'FOUNDATION', 'SURVEYING', 'COMPANY'];
  const isBusiness = businessKeywords.some(kw => ownerName.toUpperCase().includes(kw));

  if (!isBusiness && parts.length >= 2 && !ownerName.includes(',')) {
    // LAST, FIRST format
    variants.push(`${parts[parts.length - 1].toUpperCase()}, ${parts.slice(0, -1).join(' ').toUpperCase()}`);
    // Just last name
    variants.push(parts[parts.length - 1].toUpperCase());
  }

  return [...new Set(variants)];
}

function getDocumentRelevance(docType: string): number {
  const upper = docType.toUpperCase();
  for (const [type, score] of Object.entries(DOCUMENT_TYPE_SCORES)) {
    if (upper.includes(type)) return score;
  }
  return 10; // Default low score for unknown types
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
