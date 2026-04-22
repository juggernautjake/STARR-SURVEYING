# Discovery Loop Improvements — Copilot Prompt

Copy and paste the entire prompt below into GitHub Copilot to implement all improvements at once.

---

## Prompt

```
I need you to implement 5 improvements to the iterative discovery loop system
in this codebase. The discovery loop is in worker/src/services/discovery-loop.ts
and integrated into the pipeline at worker/src/services/pipeline.ts. The loop
discovers new document identifiers (instrument numbers, owner names, volume/page
refs, plat cabinet/slide refs, subdivision names) from AI-extracted document
data and feeds them back into the search pipeline.

Read these files first to understand the current implementation:
- worker/src/services/discovery-loop.ts (the discovery state and extraction logic)
- worker/src/services/pipeline.ts (the main pipeline with the discovery loop integration)
- worker/src/services/bell-clerk.ts (clerk search functions)
- worker/src/types/index.ts (all type definitions)
- worker/src/services/ai-extraction.ts (AI document extraction)

Here are the 5 improvements to implement:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPROVEMENT 1: Volume/Page Search Support

The discovery loop tracks pendingVolumePages but pipeline.ts doesn't search them.

1a. In discovery-loop.ts, add a consumePendingVolumePages() function following
    the same pattern as consumePendingInstruments():

    export function consumePendingVolumePages(
      state: DiscoveryState,
      maxCount: number = 5,
    ): Array<{ volume: string; page: string }> {
      const batch: Array<{ volume: string; page: string }> = [];
      for (const key of Array.from(state.pendingVolumePages).slice(0, maxCount)) {
        const [volume, page] = key.split(':');
        batch.push({ volume, page });
      }
      markVolumePagesSearched(state, batch);
      return batch;
    }

1b. In bell-clerk.ts, add a new function searchClerkByVolumePage():

    export async function searchClerkByVolumePage(
      county: string,
      volume: string,
      page: string,
      logger: PipelineLogger,
    ): Promise<DocumentResult[]>

    Implementation details:
    - Get the base URL from getKofileBaseUrl(county)
    - Launch Playwright chromium browser (headless: true)
    - Navigate to the Kofile base URL
    - Look for a "Book Type" dropdown or "Advanced Search" link
    - Select "OPR" (Official Public Records) as the book type
    - Enter the volume number in the "Book" or "Volume" field
    - Enter the page number in the "Page" field
    - Submit the search form
    - Wait for results (use TYLER_SPA_RENDER_TIMEOUT_MS = 8000)
    - Parse the results table using the same column extraction pattern
      as _extractSearchResults()
    - Return DocumentResult[] with instrument numbers and metadata
    - Close the browser
    - Log all actions with logger.info('DOC-SEARCH', ...)

1c. In pipeline.ts, in the discovery loop (after the owner name search block),
    add:

    // Search by pending volume/page references
    const pendingVPs = consumePendingVolumePages(discoveryState);
    if (pendingVPs.length > 0 && kofile) {
      for (const vp of pendingVPs) {
        logger.info('Discovery', `Searching clerk by Vol ${vp.volume} Pg ${vp.page}`);
        try {
          const vpDocs = await searchClerkByVolumePage(input.county, vp.volume, vp.page, logger);
          // deduplicate, fetch images, push to iterationDocs
          // (same pattern as the owner name search block)
        } catch (err) {
          logger.warn('Discovery', `Vol/Page search failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    Import searchClerkByVolumePage from './bell-clerk.js' at the top of pipeline.ts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPROVEMENT 2: AI-Enhanced Identifier Extraction

Make Claude explicitly output cross-references in a structured format.

2a. In worker/src/types/index.ts, add to ExtractedBoundaryData:

    crossReferences?: Array<{
      type: 'instrument' | 'volumePage' | 'platRef' | 'deed' | 'survey' | 'easement';
      value: string;
      context: string;
      relationship: 'prior_deed' | 'referenced_plat' | 'easement' |
                     'survey' | 'amendment' | 'restriction' | 'subdivision_plat' | 'other';
    }>;

2b. In worker/src/services/ai-extraction.ts, find the Claude system prompt
    used for boundary extraction (the long template string with instructions
    like "Extract all boundary calls" and "Note ALL document references").
    Add this section to the prompt:

    "9. Extract ALL cross-references to other recorded documents. For each
    reference found in the text, output:
    - type: 'instrument', 'volumePage', 'platRef', 'deed', 'survey', or 'easement'
    - value: the reference number (e.g., '2019043440', 'Vol 7687 Pg 112', 'Cabinet A Slide 5')
    - context: brief description (e.g., 'prior deed from grantor', 'subdivision plat')
    - relationship: categorize as 'prior_deed', 'referenced_plat', 'easement',
      'survey', 'amendment', 'restriction', 'subdivision_plat', or 'other'

    Common patterns to look for:
    - 'being the same property conveyed by deed recorded as Instrument No. XXXXXXX'
    - 'according to the plat thereof recorded in Cabinet X, Slide Y'
    - 'subject to easements of record'
    - 'as shown on the plat recorded in Volume XXXX, Page XXX'
    - 'SAVE AND EXCEPT that portion conveyed by Instrument No. XXXXXXX'"

    Also add "crossReferences" to the JSON output schema in the prompt.

2c. In discovery-loop.ts extractNewIdentifiers(), add handling after the
    existing references loop:

    if (doc.extractedData?.crossReferences) {
      for (const xref of doc.extractedData.crossReferences) {
        if (xref.type === 'instrument' && xref.value) {
          const instrNum = xref.value.replace(/[-\s]/g, '');
          if (instrNum.length >= 7 && !state.searchedInstruments.has(instrNum) && !state.pendingInstruments.has(instrNum)) {
            state.pendingInstruments.add(instrNum);
            state.discoveryChain.push({
              iteration, sourceDocument: sourceLabel,
              identifierType: 'instrument', identifierValue: instrNum,
            });
            newCount++;
            logger.info('Discovery', `AI cross-ref from ${sourceLabel}: instrument ${instrNum} (${xref.relationship}: ${xref.context})`);
          }
        }
        // Similar handling for volumePage, platRef types
      }
    }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPROVEMENT 3: Deed Chain Prioritization

Not all discovered identifiers are equally important. Prior deeds in the chain
of title are more important than tangential easements.

3a. In discovery-loop.ts, add a priority field to DiscoveryEvent:

    export interface DiscoveryEvent {
      iteration: number;
      sourceDocument: string;
      identifierType: 'instrument' | 'owner' | 'volumePage' | 'platRef' | 'subdivision';
      identifierValue: string;
      priority: 'chain_of_title' | 'referenced' | 'tangential';
    }

3b. In discovery-loop.ts, add a priority map to DiscoveryState:

    /** Priority classification for pending identifiers */
    identifierPriority: Map<string, 'chain_of_title' | 'referenced' | 'tangential'>;

    Initialize it as `new Map()` in createDiscoveryState().

3c. When adding identifiers in extractNewIdentifiers(), classify priority:
    - chain_of_title: if the crossReference relationship is 'prior_deed',
      or if found via deed history, or if the text contains "being the same
      property" / "conveyed by" / "same land described in"
    - referenced: plat references, survey references, subdivision plats
    - tangential: easements, restrictions, rights-of-way, liens, HOA docs

    Store the priority: state.identifierPriority.set(identifierValue, priority)

3d. Add to DISCOVERY_DEFAULTS:
    MAX_TANGENTIAL_DOCUMENTS: 3

3e. Modify consumePendingInstruments() to sort by priority before slicing:

    export function consumePendingInstruments(state, maxCount): string[] {
      const all = Array.from(state.pendingInstruments);
      // Sort: chain_of_title first, then referenced, then tangential
      all.sort((a, b) => {
        const priorityOrder = { chain_of_title: 0, referenced: 1, tangential: 2 };
        const pa = priorityOrder[state.identifierPriority.get(a) ?? 'referenced'];
        const pb = priorityOrder[state.identifierPriority.get(b) ?? 'referenced'];
        return pa - pb;
      });
      const batch = all.slice(0, maxCount);
      markInstrumentsSearched(state, batch);
      return batch;
    }

3f. In the discovery loop in pipeline.ts, track tangential document count
    and stop fetching tangential docs when MAX_TANGENTIAL_DOCUMENTS is reached.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPROVEMENT 4: Cascade State Integration

The Bell County cascade (Stage 1) and discovery loop (after Stage 3) should
share identifier state bidirectionally.

4a. In pipeline.ts, after the Bell County cascade enrichment completes (near
    the line `bellKnownIds = cascadeState`), add code to seed the discovery
    state with cascade identifiers that weren't already in the initial seed:

    if (bellKnownIds) {
      // Seed discovery state with cascade-discovered identifiers
      for (const instrNum of bellKnownIds.instrumentNumbers) {
        if (!discoveryState.pendingInstruments.has(instrNum) &&
            !discoveryState.searchedInstruments.has(instrNum)) {
          discoveryState.pendingInstruments.add(instrNum);
        }
      }
      for (const owner of bellKnownIds.ownerNames) {
        const normalized = owner.toUpperCase().replace(/\s+/g, ' ').trim();
        if (!discoveryState.pendingOwnerNames.has(normalized) &&
            !discoveryState.searchedOwnerNames.has(normalized)) {
          discoveryState.pendingOwnerNames.add(normalized);
        }
      }
      for (const vp of bellKnownIds.volumePages) {
        const key = `${vp.volume}:${vp.page}`;
        if (!discoveryState.pendingVolumePages.has(key) &&
            !discoveryState.searchedVolumePages.has(key)) {
          discoveryState.pendingVolumePages.add(key);
        }
      }
      for (const pr of bellKnownIds.platRefs) {
        const key = `${pr.cabinet}:${pr.slide}`;
        if (!discoveryState.pendingPlatRefs.has(key) &&
            !discoveryState.searchedPlatRefs.has(key)) {
          discoveryState.pendingPlatRefs.add(key);
        }
      }
      logger.info('Discovery', `Seeded from Bell cascade: ${stateSummary(discoveryState)}`);
    }

    IMPORTANT: This code block needs to go AFTER the discoveryState is created
    (which happens right before Stage 2) and AFTER the Bell County cascade
    (which runs in Stage 1). Currently the discoveryState initialization
    happens after the cascade, so just add this seeding code right after
    the discoveryState creation, before Stage 2 Path A.

4b. After the discovery loop completes, feed new identifiers back into
    bellKnownIds (if it exists):

    if (bellKnownIds && discoveryState.totalNewIdentifiers > 0) {
      for (const instrNum of discoveryState.searchedInstruments) {
        if (!bellKnownIds.instrumentNumbers.includes(instrNum)) {
          bellKnownIds.instrumentNumbers.push(instrNum);
        }
      }
      for (const owner of discoveryState.searchedOwnerNames) {
        if (!bellKnownIds.ownerNames.includes(owner)) {
          bellKnownIds.ownerNames.push(owner);
        }
      }
      logger.info('Discovery', `Fed ${discoveryState.searchedInstruments.size} instruments and ${discoveryState.searchedOwnerNames.size} owners back into Bell cascade state`);
    }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPROVEMENT 5: Rate Limiting and Browser Session Management

The discovery loop opens Playwright browser sessions for each fetch.
Too many rapid requests to Tyler PublicSearch may trigger rate limiting.

5a. In discovery-loop.ts DISCOVERY_DEFAULTS, add:

    /** Delay between browser operations to avoid rate limiting (ms) */
    INTER_REQUEST_DELAY_MS: 2000,
    /** Max browser sessions per discovery iteration */
    MAX_BROWSER_SESSIONS_PER_ITERATION: 6,

5b. In pipeline.ts, in the discovery loop, add delays between browser calls.
    After each fetchDocumentImages() or searchClerkRecords() call, add:

    await new Promise(r => setTimeout(r, DISCOVERY_DEFAULTS.INTER_REQUEST_DELAY_MS));

5c. Track browser session count per iteration. In the discovery loop, add
    a counter:

    let browserSessionsThisIteration = 0;

    Before each fetch/search call, check:
    if (browserSessionsThisIteration >= DISCOVERY_DEFAULTS.MAX_BROWSER_SESSIONS_PER_ITERATION) {
      logger.info('Discovery', `Browser session limit reached (${browserSessionsThisIteration}) — deferring remaining searches to next iteration`);
      break;
    }
    browserSessionsThisIteration++;

5d. Add retry logic for rate limit errors. Wrap each fetchDocumentImages() call:

    const fetchWithRetry = async (county: string, instrNum: string, expectedPages: number) => {
      try {
        return await fetchDocumentImages(county, instrNum, expectedPages, logger);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/rate.?limit|too.?many|captcha|429/i.test(msg)) {
          logger.warn('Discovery', `Rate limited on ${instrNum} — waiting 10s and retrying once`);
          await new Promise(r => setTimeout(r, 10_000));
          return await fetchDocumentImages(county, instrNum, expectedPages, logger);
        }
        throw err;
      }
    };

    Use fetchWithRetry instead of direct fetchDocumentImages calls in the loop.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT CONSTRAINTS:
- Do NOT modify any functions outside of the ones mentioned above
- Do NOT change the Stage 0 or Stage 1 pipeline logic (only add the cascade
  seeding in improvement 4)
- All new functions must have comprehensive logging via the PipelineLogger
  (logger.info, logger.warn, logger.error with appropriate layer names)
- All browser operations must close the browser in a finally{} block
- All errors must be caught and logged as non-fatal — the discovery loop
  should never crash the pipeline
- Run `npx tsc --noEmit --project worker/tsconfig.json` after changes to
  verify there are no type errors
- Preserve all existing functionality — these are additive improvements only
```
