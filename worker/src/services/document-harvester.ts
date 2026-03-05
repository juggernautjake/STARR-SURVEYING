// worker/src/services/document-harvester.ts
// Phase 2: DocumentHarvester — multi-county clerk automation orchestrator.
//
// Takes Phase 1 PropertyIdentity output and systematically downloads every
// available free document for the target property, its subdivision lots, and
// all identifiable adjacent properties.
//
// Supported clerk systems:
//   Kofile/PublicSearch — ~80+ Texas counties (Bell, Williamson, Travis, …)
//   TexasFile           — universal fallback for all 254 counties (index-only)
//   CountyFusion/Cott   — ~40+ counties (TODO: CottSystemsAdapter)
//   Tyler/Odyssey       — ~30+ counties (TODO: TylerClerkAdapter)
//
// Spec §2.5 — Document Harvesting Orchestrator

import { KofileClerkAdapter } from '../adapters/kofile-clerk-adapter.js';
import { TexasFileAdapter } from '../adapters/texasfile-adapter.js';
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
  private adapter: ClerkAdapter | null = null;
  private errors: string[] = [];
  private searchCount = 0;
  private failedSearchCount = 0;

  async harvest(input: HarvestInput): Promise<HarvestResult> {
    const startTime = Date.now();
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

    // Select and initialise the clerk adapter for this county
    this.adapter = this.getClerkAdapter(input.countyFIPS, input.county);
    await this.adapter.initSession();

    try {
      // ═══════════════════════════════════════════════════════════════
      //  PHASE A: TARGET PROPERTY DOCUMENTS
      // ═══════════════════════════════════════════════════════════════

      console.log(`\n${'='.repeat(60)}`);
      console.log(`  HARVESTING: ${input.owner} (${input.county} County)`);
      console.log(`${'='.repeat(60)}\n`);

      // A1: Known instrument numbers from Phase 1 CAD detail page
      if (input.deedReferences?.length) {
        for (const ref of input.deedReferences) {
          console.log(
            `[Harvest] Looking up known instrument: ${ref.instrumentNumber} (${ref.type})...`,
          );
          if (seenInstruments.has(ref.instrumentNumber)) continue;
          const docs = await this.searchAndDownload(
            ref.instrumentNumber,
            'target',
          );
          docs.forEach((d) => { seenInstruments.add(d.instrumentNumber); });
          allDocs.target.push(...docs);
          await this.rateLimit();
        }
      }

      // A2: Grantee search — finds all documents recorded TO this owner
      console.log(
        `[Harvest] Searching all documents for grantee: ${input.owner}...`,
      );
      const granteeResults = await this.searchByName(input.owner, 'grantee');
      for (const { result } of filterAndRankResults(granteeResults, scoringCtx)) {
        if (seenInstruments.has(result.instrumentNumber)) continue;
        const docs = await this.downloadDocumentImages(result, 'target');
        docs.forEach((d) => { seenInstruments.add(d.instrumentNumber); });
        allDocs.target.push(...docs);
        await this.rateLimit();
      }

      // A3: Grantor search — finds conveyances, easement grants, etc. BY this owner
      console.log(
        `[Harvest] Searching all documents for grantor: ${input.owner}...`,
      );
      const grantorResults = await this.searchByName(input.owner, 'grantor');
      for (const { result } of filterAndRankResults(grantorResults, scoringCtx)) {
        if (seenInstruments.has(result.instrumentNumber)) continue;
        const docs = await this.downloadDocumentImages(result, 'target');
        docs.forEach((d) => { seenInstruments.add(d.instrumentNumber); });
        allDocs.target.push(...docs);
        await this.rateLimit();
      }

      // ═══════════════════════════════════════════════════════════════
      //  PHASE B: SUBDIVISION DOCUMENTS
      // ═══════════════════════════════════════════════════════════════

      if (input.subdivisionName) {
        console.log(`\n[Harvest] === SUBDIVISION: ${input.subdivisionName} ===`);

        // B1: Master plat
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

        // B2: Restrictive covenants / CC&Rs
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
          } catch {
            // Non-fatal — continue with other easement term variants
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  PHASE C: ADJACENT PROPERTY DOCUMENTS
      // ═══════════════════════════════════════════════════════════════

      if (input.adjacentOwners?.length) {
        for (const adjOwner of input.adjacentOwners) {
          console.log(`\n[Harvest] === ADJACENT: ${adjOwner} ===`);
          allDocs.adjacent[adjOwner] = [];

          const adjResults = await this.searchByName(adjOwner, 'grantee');

          // Score with the adjacent owner as the focal point, filter (skip < 20),
          // sort by relevance, cap at 5 downloads per adjacent owner
          const ranked = filterAndRankResults(
            adjResults,
            { ...scoringCtx, targetOwner: adjOwner },
            5,
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
      }

    } finally {
      await this.adapter.destroySession();
    }

    // ── Build summary index ──────────────────────────────────────────────────

    const allDocFlat: HarvestedDocument[] = [
      ...allDocs.target,
      ...allDocs.subdivision,
      ...Object.values(allDocs.adjacent).flat(),
    ];

    const totalPages = allDocFlat.reduce((sum, d) => sum + d.images.length, 0);

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
      timing: { totalMs: Date.now() - startTime },
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
        this.errors.push(`No document found for instrument# ${instrumentNo}`);
        return [];
      }

      return this.downloadDocumentImages(results[0], relevance);
    } catch (e) {
      this.failedSearchCount++;
      this.errors.push(`Failed to retrieve instrument# ${instrumentNo}: ${e}`);
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
      return [];
    }
  }

  /**
   * Select the best available clerk adapter for a given county.
   * Priority: Kofile (known FIPS) → TexasFile (universal fallback).
   *
   * TODO: add CountyFusion/Cott adapter (~40 counties)
   * TODO: add Tyler/Odyssey adapter (~30 counties)
   */
  private getClerkAdapter(
    countyFIPS: string,
    countyName: string,
  ): ClerkAdapter {
    // Kofile/PublicSearch — ~80+ Texas counties
    // Most counties follow the standard *.tx.publicsearch.us subdomain pattern
    // and will be handled by the default config in KofileClerkAdapter.
    return new KofileClerkAdapter(countyFIPS, countyName);
  }

  /**
   * Polite rate-limiting between clerk system requests.
   * 3–5 second random delay to avoid overwhelming county servers.
   */
  private async rateLimit(): Promise<void> {
    const delay = 3_000 + Math.random() * 2_000;
    await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
  }
}
