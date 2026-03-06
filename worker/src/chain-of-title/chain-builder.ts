// worker/src/chain-of-title/chain-builder.ts — Phase 11 Module J
// Deep chain of title engine. Traces ownership backward N generations,
// detects boundary changes over time, and performs vacancy analysis.
//
// Spec §11.11 — Deep Chain of Title Engine

import * as fs from 'fs';
import * as path from 'path';
import type { ChainLink, ChainOfTitle } from '../types/expansion.js';

// ── Chain of Title Builder ──────────────────────────────────────────────────

export class ChainOfTitleBuilder {
  private maxDepth: number;
  private outputDir: string;

  constructor(maxDepth: number = 5, outputDir: string = '/tmp/analysis') {
    this.maxDepth = maxDepth;
    this.outputDir = outputDir;
  }

  /**
   * Build the chain of title for a property.
   * Starts from the current deed and traces backward through grantor/grantee chains.
   *
   * @param projectId Project identifier
   * @param currentOwner Current owner name
   * @param documents Array of harvested documents with extracted data
   * @param extractionData Phase 3 AI extraction results
   */
  async buildChain(
    projectId: string,
    currentOwner: string,
    documents: any[],
    extractionData: any,
  ): Promise<ChainOfTitle> {
    console.log(
      `[ChainOfTitle] Building chain for ${currentOwner} (max depth: ${this.maxDepth})`,
    );

    // Step 1: Extract chain links from documents
    const allLinks = this.extractChainLinks(documents, extractionData);

    // Step 2: Order by recording date (newest first)
    allLinks.sort(
      (a, b) =>
        new Date(b.recordingDate).getTime() -
        new Date(a.recordingDate).getTime(),
    );

    // Step 3: Build chain by tracing grantor/grantee relationships
    const chain = this.traceChain(currentOwner, allLinks);

    // Step 4: Analyze boundary evolution
    const boundaryEvolution = this.analyzeBoundaryEvolution(chain);

    // Step 5: Detect measurement system transitions
    const measurementSystemTransitions =
      this.detectMeasurementTransitions(chain);

    // Step 6: Track acreage history
    const acreageHistory = this.buildAcreageHistory(chain);

    // Step 7: Extract easement grants
    const easementGrants = this.extractEasementGrants(chain, documents);

    // Step 8: Perform vacancy analysis
    const vacancyAnalysis = this.analyzeVacancy(chain);

    const result: ChainOfTitle = {
      propertyId: projectId,
      chain,
      depth: chain.length,
      oldestRecord:
        chain.length > 0 ? chain[chain.length - 1].recordingDate : '',
      boundaryEvolution,
      measurementSystemTransitions,
      acreageHistory,
      easementGrants,
      vacancyAnalysis,
    };

    // Save result
    const outputPath = path.join(
      this.outputDir,
      projectId,
      'chain_of_title.json',
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(
      `[ChainOfTitle] Complete: ${chain.length} links traced, saved to ${outputPath}`,
    );

    return result;
  }

  // ── Extract Chain Links from Documents ──────────────────────────────────

  private extractChainLinks(
    documents: any[],
    extractionData: any,
  ): ChainLink[] {
    const links: ChainLink[] = [];

    for (const doc of documents) {
      if (!doc.instrument) continue;

      const extraction = extractionData?.documents?.find(
        (d: any) => d.instrument === doc.instrument,
      );

      const link: ChainLink = {
        instrument: doc.instrument,
        type: doc.type || 'deed',
        grantor: extraction?.grantor || doc.grantor || '',
        grantee: extraction?.grantee || doc.grantee || '',
        recordingDate: doc.recordingDate || '',
        considerationAmount: extraction?.consideration || null,
        legalDescription: extraction?.legalDescription || '',
        acreage: extraction?.acreage || doc.acreage || null,
        boundaryCallsExtracted: !!(extraction?.calls?.length > 0),
        boundaryChangesDetected: [],
        measurementSystem: this.detectMeasurementSystem(
          extraction?.legalDescription || '',
          doc.recordingDate || '',
        ),
        datumDetected: this.detectDatum(
          extraction?.legalDescription || '',
          doc.recordingDate || '',
        ),
        source: doc.source || '',
        imagePaths: doc.imagePaths || [],
      };

      links.push(link);
    }

    return links;
  }

  // ── Trace Chain ─────────────────────────────────────────────────────────

  private traceChain(
    currentOwner: string,
    allLinks: ChainLink[],
  ): ChainLink[] {
    const chain: ChainLink[] = [];
    let targetGrantee = this.normalizeOwnerName(currentOwner);
    let depth = 0;

    while (depth < this.maxDepth) {
      // Find the deed where this person is the grantee
      const link = allLinks.find(
        (l) =>
          l.type === 'deed' &&
          this.normalizeOwnerName(l.grantee).includes(targetGrantee) &&
          !chain.some((c) => c.instrument === l.instrument),
      );

      if (!link) break;

      chain.push(link);

      // Trace backward: the grantor of this deed is who we look for next
      targetGrantee = this.normalizeOwnerName(link.grantor);
      depth++;
    }

    return chain;
  }

  // ── Boundary Evolution Analysis ─────────────────────────────────────────

  private analyzeBoundaryEvolution(
    chain: ChainLink[],
  ): ChainOfTitle['boundaryEvolution'] {
    const evolution: ChainOfTitle['boundaryEvolution'] = [];

    for (let i = 0; i < chain.length - 1; i++) {
      const newer = chain[i];
      const older = chain[i + 1];
      const changes: string[] = [];

      // Check acreage changes
      if (
        newer.acreage &&
        older.acreage &&
        Math.abs(newer.acreage - older.acreage) > 0.01
      ) {
        const diff = newer.acreage - older.acreage;
        changes.push(
          `Acreage changed from ${older.acreage.toFixed(4)} to ${newer.acreage.toFixed(4)} ` +
          `(${diff > 0 ? '+' : ''}${diff.toFixed(4)} acres)`,
        );
      }

      // Check measurement system changes
      if (
        newer.measurementSystem !== older.measurementSystem &&
        older.measurementSystem !== 'unknown'
      ) {
        changes.push(
          `Measurement system changed from ${older.measurementSystem} to ${newer.measurementSystem}`,
        );
      }

      // Check datum changes
      if (
        newer.datumDetected !== older.datumDetected &&
        older.datumDetected !== 'unknown'
      ) {
        changes.push(
          `Datum changed from ${older.datumDetected} to ${newer.datumDetected}`,
        );
      }

      // Check for easement references in legal description
      const easementKeywords = [
        'easement',
        'right-of-way',
        'right of way',
        'reserved',
        'except',
        'less and except',
      ];
      for (const keyword of easementKeywords) {
        if (
          newer.legalDescription.toLowerCase().includes(keyword) &&
          !older.legalDescription.toLowerCase().includes(keyword)
        ) {
          changes.push(
            `New ${keyword} reference appears in legal description`,
          );
        }
      }

      if (changes.length > 0) {
        evolution.push({
          period: `${older.recordingDate} to ${newer.recordingDate}`,
          changes,
        });
        newer.boundaryChangesDetected = changes;
      }
    }

    return evolution;
  }

  // ── Measurement System Detection ────────────────────────────────────────

  private detectMeasurementSystem(
    legalDescription: string,
    recordingDate: string,
  ): ChainLink['measurementSystem'] {
    const desc = legalDescription.toLowerCase();

    if (desc.includes('vara') || desc.includes('varas')) return 'varas';
    if (desc.includes('meter') || desc.includes('metres')) return 'meters';
    if (desc.includes('feet') || desc.includes('foot') || desc.includes("'"))
      return 'feet';

    // Historical heuristic: pre-1900 Texas deeds often used varas
    if (recordingDate) {
      const year = parseInt(recordingDate.slice(0, 4));
      if (year < 1900) return 'varas';
    }

    return 'unknown';
  }

  private detectMeasurementTransitions(
    chain: ChainLink[],
  ): ChainOfTitle['measurementSystemTransitions'] {
    const transitions: ChainOfTitle['measurementSystemTransitions'] = [];

    for (let i = 0; i < chain.length - 1; i++) {
      if (
        chain[i].measurementSystem !== chain[i + 1].measurementSystem &&
        chain[i].measurementSystem !== 'unknown' &&
        chain[i + 1].measurementSystem !== 'unknown'
      ) {
        transitions.push({
          date: chain[i].recordingDate,
          from: chain[i + 1].measurementSystem,
          to: chain[i].measurementSystem,
        });
      }
    }

    return transitions;
  }

  // ── Datum Detection ─────────────────────────────────────────────────────

  private detectDatum(
    legalDescription: string,
    recordingDate: string,
  ): ChainLink['datumDetected'] {
    const desc = legalDescription.toLowerCase();

    if (desc.includes('nad83') || desc.includes('nad 83')) return 'NAD83';
    if (desc.includes('nad27') || desc.includes('nad 27')) return 'NAD27';
    if (desc.includes('magnetic')) return 'magnetic';

    // Historical heuristic: NAD83 adopted in Texas ~1986
    if (recordingDate) {
      const year = parseInt(recordingDate.slice(0, 4));
      if (year < 1986) return 'NAD27';
      if (year >= 1990) return 'NAD83';
    }

    return 'unknown';
  }

  // ── Acreage History ─────────────────────────────────────────────────────

  private buildAcreageHistory(
    chain: ChainLink[],
  ): ChainOfTitle['acreageHistory'] {
    const history: ChainOfTitle['acreageHistory'] = [];
    let previousAcreage: number | null = null;

    // Process oldest to newest
    for (const link of [...chain].reverse()) {
      if (link.acreage) {
        const change =
          previousAcreage !== null ? link.acreage - previousAcreage : 0;
        let reason = '';

        if (Math.abs(change) > 0.01 && previousAcreage !== null) {
          if (change < 0) {
            reason =
              'Acreage decreased — possible road widening, easement grant, or lot split';
          } else {
            reason = 'Acreage increased — possible survey correction or addition';
          }
        }

        history.push({
          date: link.recordingDate,
          acreage: link.acreage,
          change,
          reason,
        });

        previousAcreage = link.acreage;
      }
    }

    return history;
  }

  // ── Easement Grant Extraction ───────────────────────────────────────────

  private extractEasementGrants(
    chain: ChainLink[],
    documents: any[],
  ): ChainOfTitle['easementGrants'] {
    const grants: ChainOfTitle['easementGrants'] = [];

    // Check chain for easement references
    for (const link of chain) {
      const desc = link.legalDescription.toLowerCase();

      // Look for "reserved unto grantor" patterns
      if (desc.includes('reserved') || desc.includes('easement')) {
        grants.push({
          instrument: link.instrument,
          date: link.recordingDate,
          grantee: link.grantor, // Grantor typically reserves easements
          purpose: this.extractEasementPurpose(link.legalDescription),
          width: this.extractEasementWidth(link.legalDescription),
          location: this.extractEasementLocation(link.legalDescription),
        });
      }
    }

    // Check dedicated easement documents
    const easementDocs = documents.filter((d) => d.type === 'easement');
    for (const doc of easementDocs) {
      grants.push({
        instrument: doc.instrument,
        date: doc.recordingDate || '',
        grantee: doc.grantee || '',
        purpose: doc.purpose || 'utility',
        width: doc.width || null,
        location: doc.location || '',
      });
    }

    return grants;
  }

  // ── Vacancy Analysis ────────────────────────────────────────────────────

  private analyzeVacancy(
    chain: ChainLink[],
  ): ChainOfTitle['vacancyAnalysis'] {
    // Look at the oldest deed to find the parent tract size
    const oldest = chain[chain.length - 1];
    const parentTractSize = oldest?.acreage || 0;

    // Current acreage
    const current = chain[0];
    const accountedFor = current?.acreage || 0;

    // Look for multiple conveyances out of the parent tract
    let totalConveyedOut = 0;
    const grantor = oldest?.grantee || '';

    for (const link of chain) {
      if (
        link.grantor &&
        this.normalizeOwnerName(link.grantor).includes(
          this.normalizeOwnerName(grantor),
        ) &&
        link.acreage
      ) {
        totalConveyedOut += link.acreage;
      }
    }

    const unaccounted = Math.max(0, parentTractSize - totalConveyedOut);
    let vacancyRisk: ChainOfTitle['vacancyAnalysis']['vacancyRisk'] = 'none';

    if (unaccounted > 1 && parentTractSize > 0) {
      const ratio = unaccounted / parentTractSize;
      if (ratio > 0.1) vacancyRisk = 'high';
      else if (ratio > 0.05) vacancyRisk = 'medium';
      else if (ratio > 0.01) vacancyRisk = 'low';
    }

    return {
      totalConveyedOut,
      parentTractSize,
      accountedFor,
      unaccountedAcreage: unaccounted,
      vacancyRisk,
    };
  }

  // ── String Helpers ──────────────────────────────────────────────────────

  private normalizeOwnerName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .trim();
  }

  private extractEasementPurpose(description: string): string {
    const desc = description.toLowerCase();
    if (desc.includes('utility')) return 'utility';
    if (desc.includes('drainage')) return 'drainage';
    if (desc.includes('access')) return 'access';
    if (desc.includes('pipeline')) return 'pipeline';
    if (desc.includes('electric') || desc.includes('power')) return 'electric';
    if (desc.includes('water')) return 'water';
    if (desc.includes('sewer') || desc.includes('sanitary')) return 'sewer';
    return 'general';
  }

  private extractEasementWidth(description: string): number | null {
    const match = description.match(/(\d+)['\s-]*(?:foot|feet|ft)/i);
    return match ? parseInt(match[1]) : null;
  }

  private extractEasementLocation(description: string): string {
    const desc = description.toLowerCase();
    if (desc.includes('north')) return 'north line';
    if (desc.includes('south')) return 'south line';
    if (desc.includes('east')) return 'east line';
    if (desc.includes('west')) return 'west line';
    if (desc.includes('rear')) return 'rear line';
    if (desc.includes('front')) return 'front line';
    return 'location not specified';
  }
}
