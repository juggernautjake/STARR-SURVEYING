// worker/src/services/discovery-loop.ts — Iterative Discovery Loop
//
// Implements the "knowledge snowball" pattern: after Stage 2 retrieves documents
// and Stage 3 extracts data from them, any newly discovered identifiers (instrument
// numbers, owner names, volume/pages, plat references) are fed back into Stage 2
// for additional searches. This loop repeats until no new identifiers are found
// or a max iteration cap is reached.
//
// Example flow:
//   Iteration 0: Address → CAD finds owner "John Smith", instrument 2023-00456
//   Iteration 1: Fetch deed 2023-00456 → AI reads it, finds ref to plat CAB-A-123
//                 and prior deed 2019-00789 and grantor "Jane Doe"
//   Iteration 2: Fetch deed 2019-00789 → AI finds ref to survey ABSTRACT 101
//                 Search plat CAB-A-123 → found in plat repo
//   Iteration 3: No new identifiers → stop

import type { DocumentResult, DocumentReference, ExtractedBoundaryData } from '../types/index.js';
import type { PipelineLogger } from '../lib/logger.js';

// ── Discovery State ─────────────────────────────────────────────────────────

/** Tracks all discovered identifiers across iterations, with deduplication. */
export interface DiscoveryState {
  /** Instrument numbers discovered and not yet searched */
  pendingInstruments: Set<string>;
  /** Instrument numbers already searched (fetched or attempted) */
  searchedInstruments: Set<string>;

  /** Owner names discovered and not yet searched */
  pendingOwnerNames: Set<string>;
  /** Owner names already searched */
  searchedOwnerNames: Set<string>;

  /** Volume/page pairs discovered and not yet searched */
  pendingVolumePages: Set<string>; // stored as "vol:page" keys
  /** Volume/page pairs already searched */
  searchedVolumePages: Set<string>;

  /** Plat cabinet/slide refs discovered and not yet searched */
  pendingPlatRefs: Set<string>; // stored as "cabinet:slide" keys
  /** Plat cabinet/slide refs already searched */
  searchedPlatRefs: Set<string>;

  /** Subdivision names discovered */
  pendingSubdivisions: Set<string>;
  /** Subdivision names already searched */
  searchedSubdivisions: Set<string>;

  /** Current iteration number (0-based) */
  iteration: number;
  /** Total documents retrieved across all iterations */
  totalDocumentsRetrieved: number;
  /** Total new identifiers discovered across all iterations */
  totalNewIdentifiers: number;

  /** Track the chain of discovery for logging: what led to what */
  discoveryChain: DiscoveryEvent[];
}

export interface DiscoveryEvent {
  iteration: number;
  sourceDocument: string; // instrument number or description of source
  identifierType: 'instrument' | 'owner' | 'volumePage' | 'platRef' | 'subdivision';
  identifierValue: string;
}

// ── Configuration ───────────────────────────────────────────────────────────

export const DISCOVERY_DEFAULTS = {
  /** Maximum number of discovery iterations (including initial pass) */
  MAX_ITERATIONS: 4,

  /** Maximum total documents to retrieve across all iterations */
  MAX_TOTAL_DOCUMENTS: 30,

  /** Maximum new instrument numbers to search per iteration */
  MAX_INSTRUMENTS_PER_ITERATION: 8,

  /** Maximum new owner names to search per iteration */
  MAX_OWNERS_PER_ITERATION: 3,

  /** Maximum total time for the discovery loop (ms) */
  MAX_LOOP_DURATION_MS: 120_000, // 2 minutes

  /** Stop if an iteration discovers fewer than this many new identifiers */
  MIN_NEW_IDENTIFIERS_TO_CONTINUE: 1,
} as const;

// ── State Creation ──────────────────────────────────────────────────────────

/** Create a fresh DiscoveryState, optionally seeded with known identifiers. */
export function createDiscoveryState(seed?: {
  instrumentNumbers?: string[];
  ownerNames?: string[];
  volumePages?: Array<{ volume: string; page: string }>;
  platRefs?: Array<{ cabinet: string; slide: string }>;
  subdivisionNames?: string[];
}): DiscoveryState {
  const state: DiscoveryState = {
    pendingInstruments: new Set(),
    searchedInstruments: new Set(),
    pendingOwnerNames: new Set(),
    searchedOwnerNames: new Set(),
    pendingVolumePages: new Set(),
    searchedVolumePages: new Set(),
    pendingPlatRefs: new Set(),
    searchedPlatRefs: new Set(),
    pendingSubdivisions: new Set(),
    searchedSubdivisions: new Set(),
    iteration: 0,
    totalDocumentsRetrieved: 0,
    totalNewIdentifiers: 0,
    discoveryChain: [],
  };

  if (seed) {
    for (const n of seed.instrumentNumbers ?? []) state.pendingInstruments.add(n);
    for (const n of seed.ownerNames ?? []) state.pendingOwnerNames.add(normalizeOwnerName(n));
    for (const vp of seed.volumePages ?? []) state.pendingVolumePages.add(`${vp.volume}:${vp.page}`);
    for (const pr of seed.platRefs ?? []) state.pendingPlatRefs.add(`${pr.cabinet}:${pr.slide}`);
    for (const s of seed.subdivisionNames ?? []) state.pendingSubdivisions.add(s.toUpperCase());
  }

  return state;
}

// ── Identifier Extraction ───────────────────────────────────────────────────

/**
 * Extract new identifiers from AI-processed documents and add them to the
 * discovery state. Returns the count of genuinely new identifiers found.
 */
export function extractNewIdentifiers(
  state: DiscoveryState,
  documents: DocumentResult[],
  logger: PipelineLogger,
): number {
  let newCount = 0;
  const iteration = state.iteration;

  for (const doc of documents) {
    const sourceLabel = doc.ref.instrumentNumber ?? doc.ref.documentType;

    // 1. Extract from AI-extracted boundary data references
    if (doc.extractedData?.references) {
      for (const ref of doc.extractedData.references) {
        newCount += ingestReference(state, ref, sourceLabel, iteration, logger);
      }
    }

    // 2. Extract instrument numbers from grantor/grantee names on the document ref
    //    (these are metadata from clerk search results, not AI extraction)
    if (doc.ref.grantors.length > 0) {
      for (const grantor of doc.ref.grantors) {
        const normalized = normalizeOwnerName(grantor);
        if (normalized && !state.searchedOwnerNames.has(normalized) && !state.pendingOwnerNames.has(normalized)) {
          state.pendingOwnerNames.add(normalized);
          state.discoveryChain.push({
            iteration, sourceDocument: sourceLabel,
            identifierType: 'owner', identifierValue: grantor,
          });
          newCount++;
          logger.info('Discovery', `New grantor from ${sourceLabel}: "${grantor}"`);
        }
      }
    }
    if (doc.ref.grantees.length > 0) {
      for (const grantee of doc.ref.grantees) {
        const normalized = normalizeOwnerName(grantee);
        if (normalized && !state.searchedOwnerNames.has(normalized) && !state.pendingOwnerNames.has(normalized)) {
          state.pendingOwnerNames.add(normalized);
          state.discoveryChain.push({
            iteration, sourceDocument: sourceLabel,
            identifierType: 'owner', identifierValue: grantee,
          });
          newCount++;
          logger.info('Discovery', `New grantee from ${sourceLabel}: "${grantee}"`);
        }
      }
    }

    // 3. Parse instrument numbers, vol/page, and plat refs from OCR text
    if (doc.ocrText) {
      newCount += ingestFreeText(state, doc.ocrText, sourceLabel, iteration, 'OCR', logger);
    }

    // 4. Parse instrument numbers, vol/page, and plat refs from raw text content
    if (doc.textContent) {
      newCount += ingestFreeText(state, doc.textContent, sourceLabel, iteration, 'text', logger);
    }

    // 5. Extract subdivision name from lot/block data
    if (doc.extractedData?.lotBlock?.subdivision) {
      const subdiv = doc.extractedData.lotBlock.subdivision.toUpperCase();
      if (!state.searchedSubdivisions.has(subdiv) && !state.pendingSubdivisions.has(subdiv)) {
        state.pendingSubdivisions.add(subdiv);
        state.discoveryChain.push({
          iteration, sourceDocument: sourceLabel,
          identifierType: 'subdivision', identifierValue: subdiv,
        });
        newCount++;
        logger.info('Discovery', `New subdivision from ${sourceLabel}: "${subdiv}"`);
      }
    }
  }

  state.totalNewIdentifiers += newCount;
  return newCount;
}

/**
 * Ingest a single DocumentReference into the discovery state.
 * Returns 1 if a genuinely new identifier was added, 0 otherwise.
 */
function ingestReference(
  state: DiscoveryState,
  ref: DocumentReference,
  sourceLabel: string,
  iteration: number,
  logger: PipelineLogger,
): number {
  let newCount = 0;

  // Instrument number
  if (ref.instrumentNumber) {
    const instrNum = ref.instrumentNumber.trim();
    if (instrNum && !state.searchedInstruments.has(instrNum) && !state.pendingInstruments.has(instrNum)) {
      state.pendingInstruments.add(instrNum);
      state.discoveryChain.push({
        iteration, sourceDocument: sourceLabel,
        identifierType: 'instrument', identifierValue: instrNum,
      });
      newCount++;
      logger.info('Discovery', `New instrument ref from ${sourceLabel}: ${instrNum} (type: ${ref.type})`);
    }
  }

  // Volume/page
  if (ref.volume && ref.page) {
    const vpKey = `${ref.volume}:${ref.page}`;
    if (!state.searchedVolumePages.has(vpKey) && !state.pendingVolumePages.has(vpKey)) {
      state.pendingVolumePages.add(vpKey);
      state.discoveryChain.push({
        iteration, sourceDocument: sourceLabel,
        identifierType: 'volumePage', identifierValue: `Vol ${ref.volume} Pg ${ref.page}`,
      });
      newCount++;
      logger.info('Discovery', `New vol/page ref from ${sourceLabel}: Vol ${ref.volume} Pg ${ref.page}`);
    }
  }

  // Plat cabinet/slide
  const cabinet = ref.cabinet ?? (ref.cabinetSlide ? ref.cabinetSlide.split('/')[0] : null);
  const slide = ref.slide ?? (ref.cabinetSlide ? ref.cabinetSlide.split('/')[1] : null);
  if (cabinet && slide) {
    const prKey = `${cabinet}:${slide}`;
    if (!state.searchedPlatRefs.has(prKey) && !state.pendingPlatRefs.has(prKey)) {
      state.pendingPlatRefs.add(prKey);
      state.discoveryChain.push({
        iteration, sourceDocument: sourceLabel,
        identifierType: 'platRef', identifierValue: `Cabinet ${cabinet} Slide ${slide}`,
      });
      newCount++;
      logger.info('Discovery', `New plat ref from ${sourceLabel}: Cabinet ${cabinet} Slide ${slide}`);
    }
  }

  return newCount;
}

/**
 * Parse all three identifier types from a free-text string (OCR output, deed text, etc.)
 * and ingest them into the discovery state.
 *
 * @param state     The discovery state to mutate (pendingInstruments / pendingVolumePages / pendingPlatRefs)
 * @param text      Raw text to parse (ocrText, textContent, or any deed/plat narrative)
 * @param sourceLabel  Human-readable label for the document that provided this text —
 *                     stored in the discoveryChain for traceability
 * @param iteration Current discovery iteration number (stored in discoveryChain events)
 * @param textType  'OCR' for ocrText or 'text' for textContent — used only in log messages
 * @param logger    Pipeline logger
 * @returns         Count of genuinely new identifiers added to the pending sets
 *                  (zero if all parsed identifiers were already in the searched/pending sets)
 */
function ingestFreeText(
  state: DiscoveryState,
  text: string,
  sourceLabel: string,
  iteration: number,
  textType: 'OCR' | 'text',
  logger: PipelineLogger,
): number {
  let newCount = 0;

  // Instrument numbers
  const instruments = parseInstrumentNumbersFromText(text);
  for (const instrNum of instruments) {
    if (!state.searchedInstruments.has(instrNum) && !state.pendingInstruments.has(instrNum)) {
      state.pendingInstruments.add(instrNum);
      state.discoveryChain.push({
        iteration, sourceDocument: sourceLabel,
        identifierType: 'instrument', identifierValue: instrNum,
      });
      newCount++;
      logger.info('Discovery', `New instrument from ${textType} in ${sourceLabel}: ${instrNum}`);
    }
  }

  // Volume/page pairs (e.g. "Vol 7687 Pg 112", "OPR/7687/112")
  const volumePages = parseVolumePageFromText(text);
  for (const vp of volumePages) {
    const vpKey = `${vp.volume}:${vp.page}`;
    if (!state.searchedVolumePages.has(vpKey) && !state.pendingVolumePages.has(vpKey)) {
      state.pendingVolumePages.add(vpKey);
      state.discoveryChain.push({
        iteration, sourceDocument: sourceLabel,
        identifierType: 'volumePage', identifierValue: `Vol ${vp.volume} Pg ${vp.page}`,
      });
      newCount++;
      logger.info('Discovery', `New vol/page from ${textType} in ${sourceLabel}: Vol ${vp.volume} Pg ${vp.page}`);
    }
  }

  // Plat cabinet/slide refs (e.g. "Cabinet A Slide 5")
  const platRefs = parsePlatRefsFromText(text);
  for (const pr of platRefs) {
    const prKey = `${pr.cabinet}:${pr.slide}`;
    if (!state.searchedPlatRefs.has(prKey) && !state.pendingPlatRefs.has(prKey)) {
      state.pendingPlatRefs.add(prKey);
      state.discoveryChain.push({
        iteration, sourceDocument: sourceLabel,
        identifierType: 'platRef', identifierValue: `Cabinet ${pr.cabinet} Slide ${pr.slide}`,
      });
      newCount++;
      logger.info('Discovery', `New plat ref from ${textType} in ${sourceLabel}: Cabinet ${pr.cabinet} Slide ${pr.slide}`);
    }
  }

  return newCount;
}

/**
 * Consume pending volume/page pairs from the discovery state, up to maxCount.
 * Returns them as { volume, page } objects and marks them as searched.
 */
export function consumePendingVolumePages(
  state: DiscoveryState,
  maxCount: number = 5,
): Array<{ volume: string; page: string }> {
  const batch: Array<{ volume: string; page: string }> = [];
  for (const key of Array.from(state.pendingVolumePages).slice(0, maxCount)) {
    const [volume, page] = key.split(':');
    batch.push({ volume, page });
    state.pendingVolumePages.delete(key);
    state.searchedVolumePages.add(key);
  }
  return batch;
}

/**
 * Consume pending plat cabinet/slide refs from the discovery state, up to maxCount.
 * Returns them as { cabinet, slide } objects and marks them as searched.
 */
export function consumePendingPlatRefs(
  state: DiscoveryState,
  maxCount: number = 5,
): Array<{ cabinet: string; slide: string }> {
  const batch: Array<{ cabinet: string; slide: string }> = [];
  for (const key of Array.from(state.pendingPlatRefs).slice(0, maxCount)) {
    const [cabinet, slide] = key.split(':');
    batch.push({ cabinet, slide });
    state.pendingPlatRefs.delete(key);
    state.searchedPlatRefs.add(key);
  }
  return batch;
}

// ── Pending Check ───────────────────────────────────────────────────────────

/** Returns true if there are unsearched identifiers remaining. */
export function hasPendingSearches(state: DiscoveryState): boolean {
  return (
    state.pendingInstruments.size > 0 ||
    state.pendingOwnerNames.size > 0 ||
    state.pendingVolumePages.size > 0 ||
    state.pendingPlatRefs.size > 0 ||
    state.pendingSubdivisions.size > 0
  );
}

/** Returns a summary of pending searches for logging. */
export function pendingSummary(state: DiscoveryState): string {
  const parts: string[] = [];
  if (state.pendingInstruments.size > 0)
    parts.push(`${state.pendingInstruments.size} instrument(s)`);
  if (state.pendingOwnerNames.size > 0)
    parts.push(`${state.pendingOwnerNames.size} owner(s)`);
  if (state.pendingVolumePages.size > 0)
    parts.push(`${state.pendingVolumePages.size} vol/page(s)`);
  if (state.pendingPlatRefs.size > 0)
    parts.push(`${state.pendingPlatRefs.size} plat ref(s)`);
  if (state.pendingSubdivisions.size > 0)
    parts.push(`${state.pendingSubdivisions.size} subdivision(s)`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

/** Returns a full state summary for logging. */
export function stateSummary(state: DiscoveryState): string {
  return (
    `Iteration ${state.iteration} | ` +
    `Searched: ${state.searchedInstruments.size} instr, ${state.searchedOwnerNames.size} owners, ` +
    `${state.searchedVolumePages.size} vol/pg, ${state.searchedPlatRefs.size} plat refs, ` +
    `${state.searchedSubdivisions.size} subdiv | ` +
    `Pending: ${pendingSummary(state)} | ` +
    `${state.totalDocumentsRetrieved} docs total`
  );
}

/**
 * Mark instruments as searched (call after attempting to fetch them).
 * Moves them from pending to searched.
 */
export function markInstrumentsSearched(state: DiscoveryState, instruments: string[]): void {
  for (const n of instruments) {
    state.pendingInstruments.delete(n);
    state.searchedInstruments.add(n);
  }
}

/** Mark owner names as searched. */
export function markOwnersSearched(state: DiscoveryState, owners: string[]): void {
  for (const n of owners) {
    const normalized = normalizeOwnerName(n);
    state.pendingOwnerNames.delete(normalized);
    state.searchedOwnerNames.add(normalized);
  }
}

/** Mark volume/page pairs as searched. */
export function markVolumePagesSearched(state: DiscoveryState, vps: Array<{ volume: string; page: string }>): void {
  for (const vp of vps) {
    const key = `${vp.volume}:${vp.page}`;
    state.pendingVolumePages.delete(key);
    state.searchedVolumePages.add(key);
  }
}

/** Mark plat refs as searched. */
export function markPlatRefsSearched(state: DiscoveryState, refs: Array<{ cabinet: string; slide: string }>): void {
  for (const ref of refs) {
    const key = `${ref.cabinet}:${ref.slide}`;
    state.pendingPlatRefs.delete(key);
    state.searchedPlatRefs.add(key);
  }
}

/** Mark subdivisions as searched. */
export function markSubdivisionsSearched(state: DiscoveryState, subdivisions: string[]): void {
  for (const s of subdivisions) {
    state.pendingSubdivisions.delete(s.toUpperCase());
    state.searchedSubdivisions.add(s.toUpperCase());
  }
}

/**
 * Determine whether the discovery loop should continue.
 * Returns { shouldContinue, reason } for logging.
 */
export function shouldContinueDiscovery(
  state: DiscoveryState,
  loopStartTime: number,
  config: typeof DISCOVERY_DEFAULTS = DISCOVERY_DEFAULTS,
): { shouldContinue: boolean; reason: string } {
  if (state.iteration >= config.MAX_ITERATIONS) {
    return { shouldContinue: false, reason: `Max iterations reached (${config.MAX_ITERATIONS})` };
  }

  if (state.totalDocumentsRetrieved >= config.MAX_TOTAL_DOCUMENTS) {
    return { shouldContinue: false, reason: `Max documents reached (${state.totalDocumentsRetrieved}/${config.MAX_TOTAL_DOCUMENTS})` };
  }

  const elapsed = Date.now() - loopStartTime;
  if (elapsed >= config.MAX_LOOP_DURATION_MS) {
    return { shouldContinue: false, reason: `Time limit reached (${Math.round(elapsed / 1000)}s/${Math.round(config.MAX_LOOP_DURATION_MS / 1000)}s)` };
  }

  if (!hasPendingSearches(state)) {
    return { shouldContinue: false, reason: 'No pending searches — all identifiers exhausted' };
  }

  return { shouldContinue: true, reason: 'Pending searches remain' };
}

/**
 * Get the next batch of instruments to search, respecting per-iteration caps.
 * Moves them from pending → searched immediately.
 */
export function consumePendingInstruments(
  state: DiscoveryState,
  maxCount: number = DISCOVERY_DEFAULTS.MAX_INSTRUMENTS_PER_ITERATION,
): string[] {
  const batch = Array.from(state.pendingInstruments).slice(0, maxCount);
  markInstrumentsSearched(state, batch);
  return batch;
}

/** Get the next batch of owner names to search. */
export function consumePendingOwners(
  state: DiscoveryState,
  maxCount: number = DISCOVERY_DEFAULTS.MAX_OWNERS_PER_ITERATION,
): string[] {
  const batch = Array.from(state.pendingOwnerNames).slice(0, maxCount);
  markOwnersSearched(state, batch);
  return batch;
}

/** Get the next batch of subdivisions to search. */
export function consumePendingSubdivisions(
  state: DiscoveryState,
  maxCount: number = 3,
): string[] {
  const batch = Array.from(state.pendingSubdivisions).slice(0, maxCount);
  markSubdivisionsSearched(state, batch);
  return batch;
}

// ── Text Parsing ────────────────────────────────────────────────────────────

/**
 * Parse instrument numbers from free-form text (OCR output, deed text, etc.)
 * Handles common formats:
 *   - "Instrument No. 2019043440"
 *   - "recorded as instrument 2019-043440"
 *   - "Inst. #2019043440"
 *   - "Document Number: 2019043440"
 *   - Bare 10-digit numbers that look like clerk instrument numbers
 *   - "Inst No 2010043440 of Official Public Records"
 */
export function parseInstrumentNumbersFromText(text: string): string[] {
  const results = new Set<string>();

  // Prefixed patterns (most reliable)
  const prefixedPatterns = [
    /(?:Inst(?:rument)?|Doc(?:ument)?)\s*(?:No\.?|Number|#|:)\s*(\d[\d-]{6,})/gi,
    /(?:recorded\s+(?:as|under|in)\s+)(?:instrument|document)\s*(?:no\.?|number|#)?\s*(\d[\d-]{6,})/gi,
    /(?:O\.?P\.?R\.?|Official\s+Public\s+Records?)\s*(?:No\.?|#)?\s*(\d[\d-]{6,})/gi,
    /(?:County\s+Clerk.{0,20}?)(?:No\.?|#)\s*(\d[\d-]{6,})/gi,
  ];

  for (const pattern of prefixedPatterns) {
    for (const match of text.matchAll(pattern)) {
      const cleaned = match[1].replace(/-/g, '');
      if (cleaned.length >= 7 && cleaned.length <= 15) {
        results.add(cleaned);
      }
    }
  }

  // Bare 10-digit numbers (common Bell County format)
  // Be more conservative: exclude numbers that look like phone numbers,
  // dates, coordinates, or account IDs
  for (const match of text.matchAll(/\b(\d{10})\b/g)) {
    const num = match[1];
    // Skip if it looks like a phone number (starts with 1, area code pattern)
    if (/^1\d{9}$/.test(num)) continue;
    // Skip if surrounded by coordinate-like context
    const idx = match.index ?? 0;
    const surrounding = text.substring(Math.max(0, idx - 20), idx + 15);
    if (/°|latitude|longitude|coord/i.test(surrounding)) continue;
    results.add(num);
  }

  return Array.from(results);
}

/**
 * Parse volume/page references from text.
 */
export function parseVolumePageFromText(text: string): Array<{ volume: string; page: string }> {
  const results: Array<{ volume: string; page: string }> = [];
  const seen = new Set<string>();

  // "Vol 7687 Pg 112", "Volume 7687, Page 112"
  for (const match of text.matchAll(/Vol(?:ume)?\.?\s*(\d+)[,\s]*(?:Pg|Page)\.?\s*(\d+)/gi)) {
    const key = `${match[1]}:${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ volume: match[1], page: match[2] });
    }
  }

  // "OPR/7687/112"
  for (const match of text.matchAll(/OPR\/(\d+)\/(\d+)/gi)) {
    const key = `${match[1]}:${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ volume: match[1], page: match[2] });
    }
  }

  return results;
}

/**
 * Parse plat cabinet/slide references from text.
 */
export function parsePlatRefsFromText(text: string): Array<{ cabinet: string; slide: string }> {
  const results: Array<{ cabinet: string; slide: string }> = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(/(?:Cabinet|Cab)\.?\s*([A-Z])[\s,]*(?:Slide|Sl)\.?\s*(\d+)/gi)) {
    const key = `${match[1].toUpperCase()}:${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ cabinet: match[1].toUpperCase(), slide: match[2] });
    }
  }

  return results;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize an owner name for deduplication (uppercase, collapse whitespace). */
function normalizeOwnerName(name: string): string {
  return name.toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Determine which documents in a batch are "most recent" vs "historical".
 * The most recent deed/plat is the primary source for boundary data.
 * Historical documents provide chain-of-title context.
 */
export function classifyDocumentRecency(
  documents: DocumentResult[],
): { primary: DocumentResult[]; historical: DocumentResult[] } {
  // Sort by recording date descending (most recent first)
  const withDates = documents
    .filter(d => d.ref.recordingDate)
    .sort((a, b) => {
      const dateA = new Date(a.ref.recordingDate!).getTime();
      const dateB = new Date(b.ref.recordingDate!).getTime();
      return dateB - dateA; // Most recent first
    });

  const withoutDates = documents.filter(d => !d.ref.recordingDate);

  if (withDates.length === 0) {
    // Can't determine recency — treat all as primary
    return { primary: documents, historical: [] };
  }

  // The most recent deed and most recent plat are primary
  const primarySet = new Set<DocumentResult>();
  const mostRecentDeed = withDates.find(d => /deed|warranty|grant/i.test(d.ref.documentType));
  const mostRecentPlat = withDates.find(d => /plat/i.test(d.ref.documentType));

  if (mostRecentDeed) primarySet.add(mostRecentDeed);
  if (mostRecentPlat) primarySet.add(mostRecentPlat);

  // Documents without dates are treated as primary (we don't know their age)
  for (const d of withoutDates) primarySet.add(d);

  // If no deed or plat identified, use the most recent document
  if (primarySet.size === 0 && withDates.length > 0) {
    primarySet.add(withDates[0]);
  }

  const primary = documents.filter(d => primarySet.has(d));
  const historical = documents.filter(d => !primarySet.has(d));

  return { primary, historical };
}

/**
 * Generate a discovery chain summary for the final log — shows how
 * each identifier was discovered and what it led to.
 */
export function formatDiscoveryChain(state: DiscoveryState): string {
  if (state.discoveryChain.length === 0) return 'No cross-references discovered.';

  const lines: string[] = ['Discovery chain:'];
  const byIteration = new Map<number, DiscoveryEvent[]>();

  for (const event of state.discoveryChain) {
    if (!byIteration.has(event.iteration)) byIteration.set(event.iteration, []);
    byIteration.get(event.iteration)!.push(event);
  }

  for (const [iter, events] of byIteration) {
    lines.push(`  Iteration ${iter}:`);
    for (const e of events) {
      lines.push(`    ${e.sourceDocument} → ${e.identifierType}: ${e.identifierValue}`);
    }
  }

  return lines.join('\n');
}
