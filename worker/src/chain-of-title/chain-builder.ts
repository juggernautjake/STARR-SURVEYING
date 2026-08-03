// worker/src/chain-of-title/chain-builder.ts — Phase 11 Module J
// Deep chain of title engine. Traces ownership backward N generations,
// detects boundary changes over time, and performs vacancy analysis.
//
// Spec §11.11 — Deep Chain of Title Engine

import * as fs from 'fs';
import * as path from 'path';
import type { ChainLink, ChainOfTitle } from '../types/expansion.js';
// Why the chain stopped, and what it points at but does not contain (research plan R14).
import {
  describeTermination,
  findGaps,
  summariseChain,
  type IndexHorizon,
  type TerminationReason,
} from './chain-gaps.js';
// Going back to the clerk for the deeds the gap list names (research plan R14, second half).
import { walkBack, type WalkCandidate, type WalkResult, type WalkStop } from './chain-walker.js';
// And by CITATION — the errands the gap list writes (research plan R14, third half).
import { errandsFromGaps, runErrands, type ErrandDeps, type ErrandRunResult } from './chain-errands.js';

// ── Chain of Title Builder ──────────────────────────────────────────────────

/** Map the walker's stop onto the chain's own termination vocabulary (plan R14).
 *
 *  The two describe the same thing from different ends, and keeping one vocabulary means the packet
 *  never has to explain why a chain that was extended by a search reports its ending differently
 *  from one that was not. */
function walkStopToTermination(stop: WalkStop): TerminationReason {
  switch (stop) {
    case 'index_horizon':
    case 'reached_earliest_available':
      return 'reached_earliest_available';
    case 'circular_instrument':
      return 'circular_reference';
    case 'max_links':
    case 'budget_exhausted':
      return 'max_depth';
    case 'no_match_found':
    case 'ambiguous_match':
    default:
      // Both mean the same thing to a reader of the packet: the next deed was not obtained. The
      // walker's own `steps` carry which it was and what to do about it.
      return 'grantor_deed_not_found';
  }
}

export class ChainOfTitleBuilder {
  private maxDepth: number;
  private outputDir: string;
  /** Optional. Without it the builder behaves exactly as before — walks only harvested documents —
   *  which is what the standalone endpoint and the tests want. */
  private searchAsGrantee?: (grantee: string, before: string) => Promise<WalkCandidate[]>;
  /** Lets the run budget (R5) stop a walk mid-chain. */
  private mayContinue?: () => boolean;
  /** Citation searches for the gap list's errands. Absent means those errands are reported as
   *  "could not be searched" rather than run — which is the honest answer, and NOT "not found". */
  private errandDeps?: ErrandDeps;
  /** Ceiling on citation searches, separate from the name walk's own budget: they are different
   *  costs and one should not be able to consume the other's allowance. */
  private maxErrands?: number;

  constructor(
    maxDepth: number = 5,
    outputDir: string = '/tmp/analysis',
    opts: {
      searchAsGrantee?: (grantee: string, before: string) => Promise<WalkCandidate[]>;
      mayContinue?: () => boolean;
      fetchByVolumePage?: (volume: string, page: string) => Promise<WalkCandidate[]>;
      fetchByInstrument?: (instrument: string) => Promise<WalkCandidate[]>;
      maxErrands?: number;
    } = {},
  ) {
    this.maxDepth = maxDepth;
    this.outputDir = outputDir;
    this.searchAsGrantee = opts.searchAsGrantee;
    this.mayContinue = opts.mayContinue;
    this.maxErrands = opts.maxErrands;
    if (opts.fetchByVolumePage || opts.fetchByInstrument) {
      this.errandDeps = {
        fetchByVolumePage: opts.fetchByVolumePage,
        fetchByInstrument: opts.fetchByInstrument,
        log: (m) => console.log(m),
      };
    }
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
    /** What the county's index actually covers. Turns "we found nothing earlier" into "the clerk's
     *  index begins in 1902" — the difference between an unfinished job and a finished one. */
    horizon: IndexHorizon = {},
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
    const { chain, reason } = this.traceChain(currentOwner, allLinks);

    // Step 3b: Say why the walk ended, and list what the chain cites but does not contain (R14).
    let termination = describeTermination(reason, chain, horizon);
    let gaps = findGaps(chain);

    // Step 3c: If the chain ran out of HARVESTED documents rather than out of record, go back to the
    // clerk for the rest (plan R14, second half). Only for that one ending: hitting our own depth
    // limit or reaching the index horizon are not problems a search can solve, and searching anyway
    // would spend a run's budget re-proving what we already know.
    let walk: WalkResult | null = null;
    if (reason === 'grantor_deed_not_found' && this.searchAsGrantee && chain.length > 0) {
      const oldest = chain[chain.length - 1]!;
      walk = await walkBack(
        { grantor: oldest.grantor, recordingDate: oldest.recordingDate },
        { searchAsGrantee: this.searchAsGrantee, log: (m) => console.log(m) },
        { indexBeginsYear: horizon.indexBeginsYear, maxLinks: this.maxDepth, mayContinue: this.mayContinue },
      );

      for (const link of walk.links) {
        chain.push({
          instrument: link.instrument,
          type: link.documentType ?? 'deed',
          grantor: link.grantor,
          grantee: link.grantee,
          recordingDate: link.recordingDate,
          considerationAmount: null,
          legalDescription: '',
          acreage: null,
          boundaryCallsExtracted: false,
          boundaryChangesDetected: [],
          measurementSystem: 'unknown',
          datumDetected: null,
          // Recorded so the packet can say this link came from a search rather than from a document
          // somebody read — it is a name-and-date match until the instrument itself is fetched.
          source: 'clerk-search (chain walk)',
          imagePaths: [],
        } as unknown as ChainLink);
      }

      // Re-derive both from the extended chain: the walk's own stop is now the reason the chain
      // ends, and its gaps are whatever the longer chain still cites and lacks.
      termination = describeTermination(walkStopToTermination(walk.stop), chain, horizon);
      gaps = findGaps(chain);
    }

    // Step 3d: Run the errands the gap list wrote (plan R14, third half).
    //
    // Unlike the name walk above, this runs whatever the chain's ending was. A chain can reach the
    // sovereignty grant — a COMPLETE chain by every other measure — and still recite a partition
    // deed nobody ever pulled. The walk's stopping condition says nothing about those; they are
    // named instruments, and being named is what makes them fetchable.
    //
    // The searches are by CITATION, so nothing here is a guess: the deed itself supplied the volume
    // and page. That is also why this is cheap enough to run every time.
    let errands: ErrandRunResult | null = null;
    const { errands: worklist, unparseable } = errandsFromGaps(gaps);
    if (worklist.length > 0 || unparseable.length > 0) {
      errands = await runErrands(
        worklist,
        this.errandDeps ?? {},
        { maxSearches: this.maxErrands, mayContinue: this.mayContinue },
        unparseable,
      );
      console.log(`[ChainOfTitle] ${errands.statement}`);

      for (const { link, citationKey, citationRaw } of errands.resolved) {
        chain.push({
          instrument: link.instrument,
          type: link.documentType ?? 'deed',
          grantor: link.grantor,
          grantee: link.grantee,
          recordingDate: link.recordingDate,
          // The citation this answers. Without it the gap stays open even with the deed in hand,
          // because `VOL412PG88` and the county's own `V412P88` do not normalise to each other —
          // and the next run would fetch, and on a paid platform re-buy, a document we already have.
          resolvedCitations: [citationKey],
          considerationAmount: null,
          legalDescription: '',
          acreage: null,
          boundaryCallsExtracted: false,
          boundaryChangesDetected: [],
          measurementSystem: 'unknown',
          datumDetected: null,
          // Named separately from the name walk's links, and carrying the citation itself: this one
          // was fetched because an earlier deed pointed at it by volume and page, which is stronger
          // provenance than a name-and-date match. The packet should be able to say which deed sent
          // us for it.
          source: `clerk-search (cited as ${citationRaw})`,
          imagePaths: [],
        } as unknown as ChainLink);
      }

      if (errands.resolved.length > 0) {
        // Re-sort and re-derive: a fetched ancestor belongs in date order, and it may itself cite
        // instruments the chain still lacks. Those become the NEXT run's errands rather than being
        // chased here — one pass keeps the cost bounded and stated.
        chain.sort((a, b) => new Date(b.recordingDate).getTime() - new Date(a.recordingDate).getTime());
        gaps = findGaps(chain);
      }
    }

    const completeness = summariseChain(chain, termination, gaps);

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
      termination,
      gaps,
      completeness,
      // Every search the walk made, including the ones that found nothing. A walk that reports only
      // its successes cannot be diagnosed, and links it added are name-and-date matches until the
      // instruments themselves are fetched — the packet needs to be able to say so.
      chainWalk: walk
        ? { stop: walk.stop, statement: walk.statement, nextStep: walk.nextStep, steps: walk.steps, searchesMade: walk.searchesMade }
        : undefined,
      // Likewise every errand, including the ones that could not be run. "Could not be searched" and
      // "searched and absent" are different findings and are never totalled together.
      chainErrands: errands
        ? { statement: errands.statement, searchesMade: errands.searchesMade, counts: errands.counts, outcomes: errands.outcomes }
        : undefined,
    };

    // Save result
    const outputPath = path.join(
      this.outputDir,
      projectId,
      'chain_of_title.json',
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    // "Complete: N links traced" was printed whether the chain was finished or truncated at the
    // depth limit — the same lie the result object used to tell.
    console.log(`[ChainOfTitle] ${completeness.headline} Saved to ${outputPath}`);

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

  /** Walk backward, and SAY WHY IT STOPPED (plan R14).
   *
   *  Four endings used to produce the identical result — a chain of N links and nothing else: we
   *  reached the earliest record, we hit the depth limit, the grantor's deed was never harvested, or
   *  no starting deed existed at all. Only the first is a complete chain. A surveyor reading the
   *  packet could not tell which one they were holding. */
  private traceChain(
    currentOwner: string,
    allLinks: ChainLink[],
  ): { chain: ChainLink[]; reason: TerminationReason } {
    const chain: ChainLink[] = [];
    let targetGrantee = this.normalizeOwnerName(currentOwner);
    let depth = 0;

    while (depth < this.maxDepth) {
      // Guard: empty grantee name would match everything via includes(''), stop tracing
      if (!targetGrantee) {
        return { chain, reason: chain.length === 0 ? 'no_starting_deed' : 'reached_earliest_available' };
      }

      // Find the deed where this person is the grantee
      const link = allLinks.find(
        (l) =>
          l.type === 'deed' &&
          this.normalizeOwnerName(l.grantee).includes(targetGrantee) &&
          !chain.some((c) => c.instrument === l.instrument),
      );

      if (!link) {
        // The distinction that matters: nothing found on the FIRST pass means the chain never
        // started (a retrieval failure); nothing found later means the record we need was not
        // harvested — which is not the same as it not existing.
        return { chain, reason: chain.length === 0 ? 'no_starting_deed' : 'grantor_deed_not_found' };
      }

      chain.push(link);

      // Trace backward: the grantor of this deed is who we look for next
      const nextGrantee = this.normalizeOwnerName(link.grantor);
      if (!nextGrantee) {
        // No grantor named at all — for the earliest instrument this is usually the sovereignty
        // grant, which is the one ending that means the chain is finished.
        return { chain, reason: 'reached_earliest_available' };
      }
      // Same party on both sides: a correction deed or a transfer into a trust. The walk cannot
      // continue, but the record has not ended.
      if (nextGrantee === targetGrantee) return { chain, reason: 'circular_reference' };
      targetGrantee = nextGrantee;
      depth++;
    }

    // Ran out of OUR budget, not of record. Named separately because it is the one ending we can fix
    // by changing a number.
    return { chain, reason: 'max_depth' };
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
