// worker/src/services/document-harvester.ts
// Phase 2: DocumentHarvester — multi-county clerk automation orchestrator.
//
// Takes Phase 1 PropertyIdentity output and systematically downloads every
// available free document for the target property, its subdivision lots, and
// all identifiable adjacent properties.
//
// Supported clerk systems:
//   Kofile/PublicSearch — ~80+ Texas counties (Bell, Williamson, Travis, …)
//   CountyFusion/Cott   — ~40+ Texas counties (index-only, no free images)
//   Tyler/Odyssey       — ~30+ Texas counties (varies by county config)
//   TexasFile           — universal fallback for all 254 counties (index-only)
//
// Spec §2.5 — Document Harvesting Orchestrator

import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type DocumentType,
} from '../adapters/clerk-adapter.js';
import {
  filterAndRankResults,
  type ScoringContext,
} from './document-intelligence.js';
import { getClerkAdapter } from './clerk-registry.js';

/** Default cost estimate when `getDocumentPricing()` is not called (most Kofile counties) */
const DEFAULT_PRICE_PER_PAGE = 1.00;

// ── Service-layer types ───────────────────────────────────────────────────────
// These are the internal types used by the harvester.  They are richer than
// the API wire-format types in types/document-harvest.ts (e.g. images carry
// full DocumentImage metadata rather than plain file paths).

export interface HarvestInput {
  projectId: string;
  propertyId: string;
  owner: string;
  county: string;
  /** 5-digit Texas FIPS code — required for routing to the correct adapter */
  countyFIPS: string;
  subdivisionName?: string;
  relatedPropertyIds?: string[];
  deedReferences?: { instrumentNumber: string; type: string; date?: string }[];
  /** Adjacent owner names from Phase 1 CAD data or Phase 3 plat analysis */
  adjacentOwners?: string[];
}

export interface HarvestedDocument {
  instrumentNumber: string;
  documentType: DocumentType;
  recordingDate: string;
  grantors: string[];
  grantees: string[];
  pages: number;
  images: DocumentImage[];
  isWatermarked: boolean;
  source: string;
  purchaseAvailable: boolean;
  estimatedPurchasePrice?: number;
  /** Which scope this document was found under */
  relevance: 'target' | 'subdivision' | 'adjacent' | 'related';
  /** Human-readable explanation of why this document is relevant */
  relevanceNote?: string;
}

export interface HarvestResult {
  status: 'complete' | 'partial' | 'failed';
  documents: {
    target:      HarvestedDocument[];
    subdivision: HarvestedDocument[];
    adjacent:    Record<string, HarvestedDocument[]>;
  };
  documentIndex: {
    totalDocumentsFound:           number;
    totalPagesDownloaded:          number;
    totalPagesAvailableForPurchase: number;
    estimatedPurchaseCost:         number;
    sources:                       string[];
    failedSearches:                number;
    searchesPerformed:             number;
  };
  timing: Record<string, number>;
  errors: string[];
}

// ── DocumentHarvester ─────────────────────────────────────────────────────────

export class DocumentHarvester {
  // ── Per-harvest mutable state — reset at the start of each harvest() call ─────
  //
  // Using per-call local tracking avoids state bleed when the same harvester
  // instance is reused across multiple projects.
  private errors: string[] = [];
  private searchCount = 0;
  private failedSearchCount = 0;
  /** Active clerk adapter — set at the start and torn down in the finally block */
  private adapter: ClerkAdapter | null = null;

  async harvest(input: HarvestInput): Promise<HarvestResult> {
    // ── Reset per-harvest state ────────────────────────────────────────────────
    // Ensures a reused DocumentHarvester instance starts clean for each project.
    // this.adapter is reset here so that if getClerkAdapter() below throws, the
    // finally block's null check correctly prevents calling destroySession() on a
    // stale adapter from a previous run.
    this.errors = [];
    this.searchCount = 0;
    this.failedSearchCount = 0;
    this.adapter = null;

    const startTime = Date.now();
    const phaseTimings: Record<string, number> = {};

    const allDocs: {
      target:      HarvestedDocument[];
      subdivision: HarvestedDocument[];
      adjacent:    Record<string, HarvestedDocument[]>;
    } = { target: [], subdivision: [], adjacent: {} };

    // Scoring context shared across all phases — fix currentYear once per session
    const scoringCtx: ScoringContext = {
      targetOwner:     input.owner,
      subdivisionName: input.subdivisionName,
      adjacentOwners:  input.adjacentOwners,
      knownInstruments: input.deedReferences?.map((r) => r.instrumentNumber),
      currentYear:     new Date().getFullYear(),
    };

    // Global deduplication set — same instrument# may appear in multiple searches
    const seenInstruments = new Set<string>();

    // Select the clerk adapter for this county.  Routing: Kofile → CountyFusion
    // → Tyler → TexasFile.  The adapter is stored on the instance so private
    // helpers can access it without passing it as a parameter.
    this.adapter = this.getClerkAdapter(input.countyFIPS, input.county);

    // initSession() is inside the try block so the finally-block destroySession()
    // always runs even if browser launch fails (prevents process handle leaks).
    try {
      await this.adapter.initSession();

      // ═══════════════════════════════════════════════════════════════
      //  PHASE A: TARGET PROPERTY DOCUMENTS
      // ═══════════════════════════════════════════════════════════════

      const phaseAStart = Date.now();
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  HARVESTING: ${input.owner} (${input.county} County)`);
      console.log(`  FIPS: ${input.countyFIPS} | Project: ${input.projectId}`);
      console.log(`${'='.repeat(60)}\n`);

      // A1: Known instrument numbers from Phase 1 CAD detail page
      if (input.deedReferences?.length) {
        console.log(`[Harvest/A] ${input.deedReferences.length} known instrument(s) from Phase 1`);
        for (const ref of input.deedReferences) {
          console.log(
            `[Harvest/A1] Instrument: ${ref.instrumentNumber} (${ref.type})`,
          );
          if (seenInstruments.has(ref.instrumentNumber)) continue;
          const docs = await this.searchAndDownload(ref.instrumentNumber, 'target');
          docs.forEach((d) => { seenInstruments.add(d.instrumentNumber); });
          allDocs.target.push(...docs);
          await this.rateLimit();
        }
      }

      // A2: Grantee search — finds all documents recorded TO this owner
      console.log(`[Harvest/A2] Grantee search: ${input.owner}`);
      const granteeResults = await this.searchByName(input.owner, 'grantee');
      for (const { result } of filterAndRankResults(granteeResults, scoringCtx)) {
        if (seenInstruments.has(result.instrumentNumber)) continue;
        const docs = await this.downloadDocumentImages(result, 'target');
        docs.forEach((d) => { seenInstruments.add(d.instrumentNumber); });
        allDocs.target.push(...docs);
        await this.rateLimit();
      }

      // A3: Grantor search — finds conveyances, easement grants, etc. BY this owner
      console.log(`[Harvest/A3] Grantor search: ${input.owner}`);
      const grantorResults = await this.searchByName(input.owner, 'grantor');
      for (const { result } of filterAndRankResults(grantorResults, scoringCtx)) {
        if (seenInstruments.has(result.instrumentNumber)) continue;
        const docs = await this.downloadDocumentImages(result, 'target');
        docs.forEach((d) => { seenInstruments.add(d.instrumentNumber); });
        allDocs.target.push(...docs);
        await this.rateLimit();
      }

      phaseTimings.targetMs = Date.now() - phaseAStart;
      console.log(
        `[Harvest/A] Done — ${allDocs.target.length} target docs in ${phaseTimings.targetMs}ms`,
      );

      // ═══════════════════════════════════════════════════════════════
      //  PHASE B: SUBDIVISION DOCUMENTS
      // ═══════════════════════════════════════════════════════════════

      if (input.subdivisionName) {
        const phaseBStart = Date.now();
        console.log(`\n[Harvest/B] === SUBDIVISION: ${input.subdivisionName} ===`);

        // B1: Master plat
        console.log(`[Harvest/B1] Plat search for subdivision`);
        try {
          const platResults = await this.adapter.searchByGranteeName(
            input.subdivisionName,
            { documentTypes: ['plat', 'replat', 'amended_plat'] },
          );
          this.searchCount++;

          for (const result of platResults) {
            if (seenInstruments.has(result.instrumentNumber)) continue;
            const docs = await this.downloadDocumentImages(result, 'subdivision');
            docs.forEach((d) => { d.relevanceNote = 'Subdivision plat'; seenInstruments.add(d.instrumentNumber); });
            allDocs.subdivision.push(...docs);
            await this.rateLimit();
          }
        } catch (e) {
          this.failedSearchCount++;
          this.errors.push(`Subdivision plat search failed: ${e}`);
          console.warn(`[Harvest/B1] Plat search failed:`, e);
        }

        // B2: Restrictive covenants / CC&Rs
        console.log(`[Harvest/B2] Restrictive covenant search`);
        try {
          const covenantResults = await this.adapter.searchByGranteeName(
            input.subdivisionName,
            { documentTypes: ['restrictive_covenant', 'deed_restriction', 'ccr'] },
          );
          this.searchCount++;

          for (const result of covenantResults) {
            if (seenInstruments.has(result.instrumentNumber)) continue;
            const docs = await this.downloadDocumentImages(result, 'subdivision');
            docs.forEach((d) => { d.relevanceNote = 'Restrictive covenants'; seenInstruments.add(d.instrumentNumber); });
            allDocs.subdivision.push(...docs);
            await this.rateLimit();
          }
        } catch (e) {
          this.failedSearchCount++;
          this.errors.push(`Subdivision covenant search failed: ${e}`);
          console.warn(`[Harvest/B2] Covenant search failed:`, e);
        }

        // B3: Easement dedications
        const easementTerms = [
          input.subdivisionName,
          `${input.subdivisionName} EASEMENT`,
        ];
        for (const term of easementTerms) {
          try {
            const easementResults = await this.adapter.searchByGranteeName(term, {
              documentTypes: ['easement', 'utility_easement', 'drainage_easement'],
            });
            this.searchCount++;

            for (const result of easementResults) {
              if (seenInstruments.has(result.instrumentNumber)) continue;
              const docs = await this.downloadDocumentImages(result, 'subdivision');
              docs.forEach((d) => { d.relevanceNote = 'Subdivision easement'; seenInstruments.add(d.instrumentNumber); });
              allDocs.subdivision.push(...docs);
              await this.rateLimit();
            }
          } catch (e) {
            // Non-fatal — continue with other easement term variants
            console.warn(`[Harvest/B3] Easement search for "${term}" failed:`, e);
          }
        }

        phaseTimings.subdivisionMs = Date.now() - phaseBStart;
        console.log(
          `[Harvest/B] Done — ${allDocs.subdivision.length} subdivision docs in ${phaseTimings.subdivisionMs}ms`,
        );
      }

      // ═══════════════════════════════════════════════════════════════
      //  PHASE C: ADJACENT PROPERTY DOCUMENTS
      // ═══════════════════════════════════════════════════════════════

      if (input.adjacentOwners?.length) {
        const phaseCStart = Date.now();
        console.log(`\n[Harvest/C] === ADJACENT: ${input.adjacentOwners.length} owner(s) ===`);

        for (const adjOwner of input.adjacentOwners) {
          console.log(`[Harvest/C] Processing adjacent owner: ${adjOwner}`);
          allDocs.adjacent[adjOwner] = [];

          // Search both grantee and grantor directions to find all recorded
          // documents for the adjacent parcel (grantee finds acquisitions;
          // grantor finds conveyances, easement grants, etc.)
          const adjGranteeResults = await this.searchByName(adjOwner, 'grantee');
          const adjGrantorResults = await this.searchByName(adjOwner, 'grantor');

          const adjResults = deduplicate([...adjGranteeResults, ...adjGrantorResults]);

          // Score with the adjacent owner as the focal point, filter (skip < 20),
          // sort by relevance, cap at 5 downloads per adjacent owner
          const ranked = filterAndRankResults(
            adjResults,
            { ...scoringCtx, targetOwner: adjOwner },
            5,
          );

          console.log(
            `[Harvest/C] ${adjOwner}: ${adjResults.length} raw → ${ranked.length} ranked`,
          );

          for (const { result } of ranked) {
            if (seenInstruments.has(result.instrumentNumber)) continue;
            const docs = await this.downloadDocumentImages(result, 'adjacent');
            docs.forEach((d) => {
              d.relevanceNote = `Adjacent property: ${adjOwner}`;
              seenInstruments.add(d.instrumentNumber);
            });
            allDocs.adjacent[adjOwner].push(...docs);
            await this.rateLimit();
          }
        }

        phaseTimings.adjacentMs = Date.now() - phaseCStart;
        const adjTotal = Object.values(allDocs.adjacent).reduce((s, a) => s + a.length, 0);
        console.log(
          `[Harvest/C] Done — ${adjTotal} adjacent docs in ${phaseTimings.adjacentMs}ms`,
        );
      }

    } finally {
      // destroySession() is always called — even if initSession() failed — to
      // prevent orphaned browser processes.
      if (this.adapter) {
        await this.adapter.destroySession().catch((e) => {
          console.warn(`[Harvest] destroySession() failed (non-fatal):`, e);
        });
      }
    }

    // ── Build summary index ──────────────────────────────────────────────────

    const allDocFlat: HarvestedDocument[] = [
      ...allDocs.target,
      ...allDocs.subdivision,
      ...Object.values(allDocs.adjacent).flat(),
    ];

    const totalPages = allDocFlat.reduce((sum, d) => sum + d.images.length, 0);
    const totalMs = Date.now() - startTime;

    console.log(
      `\n[Harvest] COMPLETE — ${allDocFlat.length} docs, ${totalPages} pages, ` +
      `${this.errors.length} error(s), ${totalMs}ms`,
    );

    return {
      status: this.errors.length === 0 ? 'complete' : 'partial',
      documents: allDocs,
      documentIndex: {
        totalDocumentsFound:           allDocFlat.length,
        totalPagesDownloaded:          totalPages,
        totalPagesAvailableForPurchase: totalPages,
        estimatedPurchaseCost:         totalPages * DEFAULT_PRICE_PER_PAGE,
        sources:     [...new Set(allDocFlat.map((d) => d.source))],
        failedSearches:    this.failedSearchCount,
        searchesPerformed: this.searchCount,
      },
      timing: { totalMs, ...phaseTimings },
      errors: this.errors,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async searchByName(
    name: string,
    type: 'grantee' | 'grantor',
  ): Promise<ClerkDocumentResult[]> {
    try {
      this.searchCount++;
      return type === 'grantee'
        ? await this.adapter!.searchByGranteeName(name)
        : await this.adapter!.searchByGrantorName(name);
    } catch (e) {
      this.failedSearchCount++;
      this.errors.push(`Search failed for ${type} "${name}": ${e}`);
      console.warn(`[Harvest] ${type} search failed for "${name}":`, e);
      return [];
    }
  }

  private async searchAndDownload(
    instrumentNo: string,
    relevance: 'target' | 'subdivision' | 'adjacent',
  ): Promise<HarvestedDocument[]> {
    try {
      this.searchCount++;
      const results = await this.adapter!.searchByInstrumentNumber(instrumentNo);

      if (results.length === 0) {
        console.warn(`[Harvest] No record found for instrument# ${instrumentNo}`);
        this.errors.push(`No document found for instrument# ${instrumentNo}`);
        return [];
      }

      return this.downloadDocumentImages(results[0], relevance);
    } catch (e) {
      this.failedSearchCount++;
      this.errors.push(`Failed to retrieve instrument# ${instrumentNo}: ${e}`);
      console.warn(`[Harvest] Instrument# ${instrumentNo} retrieval failed:`, e);
      return [];
    }
  }

  private async downloadDocumentImages(
    result: ClerkDocumentResult,
    relevance: 'target' | 'subdivision' | 'adjacent',
  ): Promise<HarvestedDocument[]> {
    try {
      const images = await this.adapter!.getDocumentImages(result.instrumentNumber);

      return [{
        instrumentNumber:     result.instrumentNumber,
        documentType:         result.documentType,
        recordingDate:        result.recordingDate,
        grantors:             result.grantors,
        grantees:             result.grantees,
        pages:                images.length,
        images,
        isWatermarked:        images[0]?.isWatermarked ?? true,
        source:               result.source,
        purchaseAvailable:    true,
        estimatedPurchasePrice: images.length * DEFAULT_PRICE_PER_PAGE,
        relevance,
        relevanceNote:        images.length === 0
          ? 'Index only — no preview images available'
          : undefined,
      }];
    } catch (e) {
      this.errors.push(
        `Image download failed for ${result.instrumentNumber}: ${e}`,
      );
      console.warn(
        `[Harvest] Image download failed for ${result.instrumentNumber}:`, e,
      );
      return [];
    }
  }

  /**
   * Select the best available clerk adapter for a given county.
   * Routes via ClerkRegistry: Kofile → CountyFusion → Tyler → TexasFile.
   *
   * Protected so test subclasses can inject a mock adapter without
   * requiring `@ts-expect-error`.
   */
  protected getClerkAdapter(
    countyFIPS: string,
    countyName: string,
  ): ClerkAdapter {
    return getClerkAdapter(countyFIPS, countyName);
  }

  /**
   * Polite rate-limiting between clerk system requests.
   * 3–5 second random delay to avoid overwhelming county servers.
   *
   * Protected so test subclasses can replace this with a no-op to speed
   * up unit tests without suppressing type errors.
   */
  protected async rateLimit(): Promise<void> {
    const delay = 3_000 + Math.random() * 2_000;
    await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
  }
}

// ── Module-level deduplication helper ──────────────────────────────────────────

/**
 * Remove duplicate ClerkDocumentResult entries by instrumentNumber.
 * Used to merge grantee + grantor result lists before scoring.
 */
function deduplicate(results: ClerkDocumentResult[]): ClerkDocumentResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.instrumentNumber)) return false;
    seen.add(r.instrumentNumber);
    return true;
  });
}
