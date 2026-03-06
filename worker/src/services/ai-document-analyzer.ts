// worker/src/services/ai-document-analyzer.ts
// Phase 3 Top-Level Orchestrator — AI Document Intelligence
//
// Takes the Phase 2 HarvestResult and runs every document through the
// AI extraction pipeline:
//   Pipeline A: AIPlatAnalyzer   — plat images → LotData[]
//   Pipeline B: AIDeedAnalyzer   — deed text → DeedChainEntry[]
//   Pipeline C: AIContextAnalyzer — all results → context, discrepancies, confidence
//
// Produces PropertyIntelligence saved to:
//   /tmp/analysis/{projectId}/property_intelligence.json
//
// Spec: STARR_RECON/PHASE_03_EXTRACTION.md §8

import fs from 'fs';
import path from 'path';
import { AIPlatAnalyzer } from './ai-plat-analyzer.js';
import { AIDeedAnalyzer } from './ai-deed-analyzer.js';
import { AIContextAnalyzer } from './ai-context-analyzer.js';
import { computeConfidenceSummary } from '../models/property-intelligence.js';
import type { PropertyIntelligence, AdjacentProperty, RoadInfo, EasementInfo } from '../models/property-intelligence.js';
import type { PlatAnalysisResult } from './ai-plat-analyzer.js';
import type { DeedAnalysisResult } from './ai-deed-analyzer.js';
import type { ContextAnalysisResult } from './ai-context-analyzer.js';
import type { HarvestResult, HarvestedDocument } from '../types/document-harvest.js';
import type { DocumentResult, DocumentRef } from '../types/index.js';
import type { PipelineLogger } from '../lib/logger.js';

// ── Constants ─────────────────────────────────────────────────────────────

/** Document types routed to Pipeline A (plat analysis) */
const PLAT_TYPES = new Set(['plat', 'replat', 'amended_plat', 'vacating_plat']);

/** Document types routed to Pipeline B (deed text extraction) */
const DEED_TYPES = new Set([
  'warranty_deed', 'special_warranty_deed', 'quitclaim_deed', 'deed_of_trust',
  'easement', 'utility_easement', 'access_easement', 'drainage_easement',
  'restrictive_covenant', 'deed_restriction', 'ccr',
  'right_of_way', 'dedication',
  'affidavit', 'correction_instrument',
  'oil_gas_lease', 'mineral_deed',
  'release_of_lien', 'mechanics_lien', 'vacation',
  'other',
]);

// ── Public interfaces ─────────────────────────────────────────────────────

export interface AnalyzeInput {
  projectId: string;
  /** Absolute path to Phase 2 harvest_result.json */
  harvestResultPath: string;
}

export interface AnalyzeResult {
  status: 'complete' | 'partial' | 'failed';
  intelligence: PropertyIntelligence | null;
  errors: string[];
  /** Absolute path where property_intelligence.json was saved */
  outputPath: string;
}

// ── AIDocumentAnalyzer class ──────────────────────────────────────────────

export class AIDocumentAnalyzer {
  private platAnalyzer: AIPlatAnalyzer;
  private deedAnalyzer: AIDeedAnalyzer;
  private contextAnalyzer: AIContextAnalyzer;
  private logger: PipelineLogger;

  constructor(apiKey: string, logger: PipelineLogger) {
    this.logger         = logger;
    this.platAnalyzer   = new AIPlatAnalyzer(apiKey, logger);
    this.deedAnalyzer   = new AIDeedAnalyzer(apiKey, logger);
    this.contextAnalyzer = new AIContextAnalyzer(apiKey, logger);
  }

  /**
   * Run the complete Phase 3 analysis pipeline.
   * Reads the Phase 2 harvest result, routes documents, runs all pipelines,
   * assembles PropertyIntelligence, and saves it to disk.
   */
  async analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const outputDir  = `/tmp/analysis/${input.projectId}`;
    const outputPath = path.join(outputDir, 'property_intelligence.json');

    this.logger.info('AIDocumentAnalyzer', `=== Phase 3 Analysis START: ${input.projectId} ===`);

    // ── Ensure output directory exists ────────────────────────────────────
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (err) {
      const msg = `Cannot create output directory ${outputDir}: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error('AIDocumentAnalyzer', msg);
      return { status: 'failed', intelligence: null, errors: [msg], outputPath };
    }

    // ── Load Phase 2 harvest result ────────────────────────────────────────
    let harvestResult: HarvestResult;
    try {
      const raw = fs.readFileSync(input.harvestResultPath, 'utf-8');
      harvestResult = JSON.parse(raw) as HarvestResult;
      this.logger.info(
        'AIDocumentAnalyzer',
        `Harvest result loaded: ${harvestResult.documentIndex.totalDocumentsFound} docs, ` +
        `${harvestResult.documentIndex.totalPagesDownloaded} pages`,
      );
    } catch (err) {
      const msg = `Cannot read harvest result at ${input.harvestResultPath}: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error('AIDocumentAnalyzer', msg);
      return { status: 'failed', intelligence: null, errors: [msg], outputPath };
    }

    // ── Document triage ────────────────────────────────────────────────────
    const platDocuments   = this.extractPlatDocuments(harvestResult);
    const deedDocuments   = this.extractDeedDocuments(harvestResult);

    this.logger.info(
      'AIDocumentAnalyzer',
      `Document triage: ${platDocuments.length} plat doc(s), ${deedDocuments.length} deed doc(s)`,
    );

    // ── Pipeline A: Plat Analysis ──────────────────────────────────────────
    let platResult: PlatAnalysisResult | null = null;
    let platApiCalls = 0;

    if (platDocuments.length > 0) {
      try {
        this.logger.info('AIDocumentAnalyzer', `Pipeline A: Analyzing ${platDocuments.length} plat document(s)`);
        const platImageBuffers = this.loadAllDocumentImages(platDocuments);

        if (platImageBuffers.length > 0) {
          platResult = await this.platAnalyzer.analyzePlat(platImageBuffers, input.projectId);
          platApiCalls = platResult.totalApiCalls;
          this.logger.info(
            'AIDocumentAnalyzer',
            `Pipeline A complete: ${platResult.lots.length} lots, ` +
            `${platResult.perimeterCalls.length} perimeter calls, ` +
            `${platApiCalls} API calls`,
          );
        } else {
          this.logger.warn('AIDocumentAnalyzer', 'Plat documents found but no images could be loaded');
          errors.push('Plat document images not available on disk — was Phase 2 run on this machine?');
        }
      } catch (err) {
        const msg = `Pipeline A (plat analysis) failed: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.error('AIDocumentAnalyzer', msg, err);
        errors.push(msg);
        // Continue to Pipeline B — partial result is better than nothing
      }
    } else {
      this.logger.warn('AIDocumentAnalyzer', 'No plat documents found in harvest result');
      errors.push('No plat documents available — Phase 3 plat analysis skipped');
    }

    // Use empty plat result if Pipeline A failed
    const safePlatResult = platResult ?? this.emptyPlatResult();

    // ── Pipeline B: Deed Analysis ─────────────────────────────────────────
    const deedResults: DeedAnalysisResult[] = [];
    let deedApiCalls = 0;

    for (const doc of deedDocuments) {
      try {
        this.logger.info('AIDocumentAnalyzer', `Pipeline B: Analyzing deed ${doc.instrumentNumber} (${doc.type})`);
        const docResults = this.harvestedDocToDocumentResults(doc);
        const result = await this.deedAnalyzer.analyzeDeed(
          docResults,
          input.projectId,
          doc.instrumentNumber,
        );
        deedResults.push(result);
        deedApiCalls += result.totalApiCalls;
      } catch (err) {
        const msg = `Pipeline B deed analysis failed for ${doc.instrumentNumber}: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.error('AIDocumentAnalyzer', msg, err);
        errors.push(msg);
        // Continue with remaining deeds
      }
    }

    this.logger.info(
      'AIDocumentAnalyzer',
      `Pipeline B complete: ${deedResults.length}/${deedDocuments.length} deeds analyzed, ` +
      `${deedApiCalls} API calls`,
    );

    // ── Pipeline C: Context Analysis ──────────────────────────────────────
    let contextResult: ContextAnalysisResult | null = null;
    let contextApiCalls = 0;

    try {
      this.logger.info('AIDocumentAnalyzer', 'Pipeline C: Context analysis');
      contextResult = await this.contextAnalyzer.analyzeContext(
        safePlatResult,
        deedResults,
        harvestResult,
      );
      contextApiCalls = contextResult.totalApiCalls;
      this.logger.info(
        'AIDocumentAnalyzer',
        `Pipeline C complete: type=${contextResult.propertyType}, ` +
        `${contextResult.discrepancies.length} discrepancies, ` +
        `confidence=${contextResult.confidenceSummary.overall}% (${contextResult.confidenceSummary.rating})`,
      );
    } catch (err) {
      const msg = `Pipeline C (context analysis) failed: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error('AIDocumentAnalyzer', msg, err);
      errors.push(msg);
    }

    // ── Assemble PropertyIntelligence ─────────────────────────────────────
    const totalApiCalls = platApiCalls + deedApiCalls + contextApiCalls;
    const durationMs    = Date.now() - startTime;

    const intelligence = this.assemblePropertyIntelligence(
      input.projectId,
      harvestResult,
      safePlatResult,
      deedResults,
      contextResult,
      totalApiCalls,
      durationMs,
    );

    // ── Save to disk ──────────────────────────────────────────────────────
    try {
      fs.writeFileSync(outputPath, JSON.stringify(intelligence, null, 2), 'utf-8');
      this.logger.info('AIDocumentAnalyzer', `Saved property_intelligence.json to ${outputPath}`);
    } catch (err) {
      const msg = `Failed to write output file ${outputPath}: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error('AIDocumentAnalyzer', msg);
      errors.push(msg);
    }

    const status = errors.length === 0 ? 'complete'
      : intelligence.lots.length > 0    ? 'partial'
      :                                   'failed';

    this.logger.info(
      'AIDocumentAnalyzer',
      `=== Phase 3 Analysis ${status.toUpperCase()}: ${input.projectId} — ` +
      `${intelligence.lots.length} lots, ${totalApiCalls} API calls, ${durationMs}ms ===`,
    );

    return { status, intelligence, errors, outputPath };
  }

  // ── Private: document routing ──────────────────────────────────────────

  /** Extract all plat documents from the harvest result for Pipeline A */
  private extractPlatDocuments(harvest: HarvestResult): HarvestedDocument[] {
    const docs: HarvestedDocument[] = [];

    // Target property plats
    docs.push(...harvest.documents.target.plats.filter(d => PLAT_TYPES.has(d.type)));

    // Subdivision master plat
    if (harvest.documents.subdivision.masterPlat &&
        PLAT_TYPES.has(harvest.documents.subdivision.masterPlat.type)) {
      // Only add if not already included
      const masterPlat = harvest.documents.subdivision.masterPlat;
      if (!docs.find(d => d.instrumentNumber === masterPlat.instrumentNumber)) {
        docs.push(masterPlat);
      }
    }

    return docs;
  }

  /** Extract all deed/easement/restriction documents for Pipeline B */
  private extractDeedDocuments(harvest: HarvestResult): HarvestedDocument[] {
    const docs: HarvestedDocument[] = [];

    docs.push(...harvest.documents.target.deeds.filter(d => DEED_TYPES.has(d.type)));
    docs.push(...harvest.documents.target.easements.filter(d => DEED_TYPES.has(d.type)));
    docs.push(...harvest.documents.target.restrictions.filter(d => DEED_TYPES.has(d.type)));
    docs.push(...harvest.documents.target.other.filter(d => DEED_TYPES.has(d.type)));
    docs.push(...harvest.documents.subdivision.restrictiveCovenants.filter(d => DEED_TYPES.has(d.type)));
    docs.push(...harvest.documents.subdivision.utilityEasements.filter(d => DEED_TYPES.has(d.type)));
    docs.push(...harvest.documents.subdivision.dedicationDocs.filter(d => DEED_TYPES.has(d.type)));

    // Deduplicate by instrument number
    const seen = new Set<string>();
    return docs.filter(d => {
      if (seen.has(d.instrumentNumber)) return false;
      seen.add(d.instrumentNumber);
      return true;
    });
  }

  /** Load all image buffers for a set of documents, skipping missing files */
  private loadAllDocumentImages(docs: HarvestedDocument[]): Buffer[] {
    const buffers: Buffer[] = [];
    for (const doc of docs) {
      for (const imgPath of doc.images) {
        if (!imgPath) continue;
        if (!fs.existsSync(imgPath)) {
          this.logger.warn('AIDocumentAnalyzer', `Image not found on disk: ${imgPath} — skipping`);
          continue;
        }
        try {
          buffers.push(fs.readFileSync(imgPath));
        } catch (err) {
          this.logger.warn('AIDocumentAnalyzer', `Cannot read image ${imgPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return buffers;
  }

  /**
   * Convert a HarvestedDocument into DocumentResult[] so AIDeedAnalyzer
   * can pass it to extractDocuments() from ai-extraction.ts.
   *
   * Phase 2 saves images to disk as PNGs. We load them as base64 here.
   * If images are not on disk (e.g., running on a different machine than
   * the worker that ran Phase 2), textContent will be empty and the
   * extraction will return minimal results.
   */
  private harvestedDocToDocumentResults(doc: HarvestedDocument): DocumentResult[] {
    const docRef: DocumentRef = {
      instrumentNumber: doc.instrumentNumber,
      volume:           null,
      page:             null,
      documentType:     doc.type,
      recordingDate:    doc.date ?? null,
      grantors:         doc.grantor ? [doc.grantor] : [],
      grantees:         doc.grantee ? [doc.grantee] : [],
      source:           doc.source,
      url:              null,
    };

    const pageScreenshots: import('../types/index.js').PageScreenshot[] = [];
    let imageBase64: string | null   = null;
    let imageFormat: 'png' | null    = null;

    // Load page images from disk
    let loadedPages = 0;
    for (let i = 0; i < doc.images.length; i++) {
      const imgPath = doc.images[i];
      if (!imgPath || !fs.existsSync(imgPath)) continue;
      try {
        const buf = fs.readFileSync(imgPath);
        const b64 = buf.toString('base64');
        pageScreenshots.push({
          pageNumber: i + 1,
          imageBase64: b64,
          width:  0,  // Width/height not needed for extraction
          height: 0,
        });
        if (!imageBase64) {
          imageBase64  = b64;
          imageFormat  = 'png';
        }
        loadedPages++;
      } catch {
        // Skip unreadable images
      }
    }

    if (loadedPages === 0) {
      this.logger.warn(
        'AIDocumentAnalyzer',
        `No images loaded for document ${doc.instrumentNumber} — ` +
        `extraction will have minimal data`,
      );
    }

    return [{
      ref:           docRef,
      textContent:   null,   // Phase 2 doesn't extract text; extraction does it
      imageBase64,
      imageFormat,
      ocrText:       null,
      extractedData: null,
      fromUserUpload: false,
      processingErrors: [],
      pageScreenshots,
    }];
  }

  // ── Private: assemble PropertyIntelligence ────────────────────────────

  private assemblePropertyIntelligence(
    projectId: string,
    harvest: HarvestResult,
    plat: PlatAnalysisResult,
    deeds: DeedAnalysisResult[],
    context: ContextAnalysisResult | null,
    totalApiCalls: number,
    durationMs: number,
  ): PropertyIntelligence {
    // ── Core property info ────────────────────────────────────────────────
    const si = plat.subdivisionInfo;
    const propertyType = context?.propertyType ?? 'unknown';
    const primaryDeed = deeds[0];

    // Estimate total acreage: prefer plat lots sum, then deed calledAcreage
    const totalAcreage = this.computeTotalAcreage(plat, deeds);

    const property: PropertyIntelligence['property'] = {
      name:            si.name ?? '',
      propertyType,
      totalAcreage,
      totalSqFt:       totalAcreage > 0 ? Math.round(totalAcreage * 43560) : undefined,
      county:          this.inferCounty(harvest),
      state:           'TX',
      abstractSurvey:  primaryDeed?.surveyReference,
      datum:           si.datum,
      coordinateZone:  si.coordinateZone,
      unitSystem:      si.unitSystem,
      scaleFactor:     si.scaleFactor,
      pointOfBeginning: si.pob ? {
        northing:    si.pob.northing,
        easting:     si.pob.easting,
        description: si.pob.description,
      } : undefined,
    };

    // ── Subdivision info ──────────────────────────────────────────────────
    const subdivision: PropertyIntelligence['subdivision'] | undefined =
      propertyType === 'subdivision' ? {
        name:                 si.name ?? '',
        platInstrument:       si.platInstrument,
        platDate:             si.platDate,
        surveyor:             si.surveyor,
        rpls:                 si.rpls,
        surveyDate:           si.surveyDate,
        totalLots:            si.totalLots ?? plat.lots.length,
        lotNames:             plat.lots.map(l => l.name),
        hasReserves:          si.hasReserves ?? plat.lots.some(l => l.lotType === 'reserve'),
        hasCommonAreas:       si.hasCommonAreas ?? plat.lots.some(l => l.lotType === 'common_area'),
        restrictiveCovenants: si.restrictiveCovenants,
        notes:                plat.notes.slice(0, 20),  // cap to avoid very long notes arrays
      } : undefined;

    // ── Adjacent properties ───────────────────────────────────────────────
    const adjacentProperties = this.buildAdjacentProperties(plat, deeds);

    // ── Roads ─────────────────────────────────────────────────────────────
    const roads = this.buildRoads(plat);

    // ── Easements ─────────────────────────────────────────────────────────
    const easements = this.buildEasements(plat, deeds);

    // ── Deed chain ────────────────────────────────────────────────────────
    const deedChain = deeds.map(d =>
      this.deedAnalyzer.toDeedChainEntry(d, this.guessDeedType(d)),
    );

    // ── Discrepancies ─────────────────────────────────────────────────────
    const discrepancies = context?.discrepancies ?? [];

    // ── Confidence summary ────────────────────────────────────────────────
    const confidenceSummary = context?.confidenceSummary ?? {
      ...computeConfidenceSummary(plat.lots, plat.perimeterCalls),
      biggestGap:               'Context analysis not available',
      recommendedAction:        'Run Phase 3 context analysis',
      documentRecommendations:  [],
    };

    // ── API call log ──────────────────────────────────────────────────────
    // Estimate token costs: ~$3/M input, ~$15/M output for claude-sonnet-4-5
    const estimatedTokens = totalApiCalls * 3500;  // rough estimate per call
    const estimatedCost   = (estimatedTokens / 1_000_000) * 15;  // output rate

    const aiCallLog: PropertyIntelligence['aiCallLog'] = {
      totalAPICalls: totalApiCalls,
      totalTokens:   estimatedTokens,
      totalCost:     parseFloat(estimatedCost.toFixed(4)),
      durationMs,
      callBreakdown: [
        { type: 'plat_vision',   calls: plat.totalApiCalls,          description: 'Adaptive Vision OCR + geometric analysis (Pipeline A)' },
        { type: 'deed_extract',  calls: deeds.reduce((n, d) => n + d.totalApiCalls, 0), description: 'Deed text extraction + metadata (Pipeline B)' },
        { type: 'context',       calls: context?.totalApiCalls ?? 0, description: 'Context analysis + discrepancy identification (Pipeline C)' },
      ],
    };

    return {
      projectId,
      generatedAt: new Date().toISOString(),
      version:     '3.0',
      property,
      subdivision,
      lots:             plat.lots,
      perimeterBoundary: {
        calls:         plat.perimeterCalls,
        closureStatus: 'unknown',  // Traverse closure computation is Phase 7
      },
      adjacentProperties,
      roads,
      easements,
      deedChain,
      discrepancies,
      confidenceSummary,
      aiCallLog,
    };
  }

  // ── Private: assembly helpers ─────────────────────────────────────────

  private computeTotalAcreage(plat: PlatAnalysisResult, deeds: DeedAnalysisResult[]): number {
    // Sum lot acreages if available
    const lotSum = plat.lots.reduce((s, l) => s + (l.acreage ?? 0), 0);
    if (lotSum > 0) return parseFloat(lotSum.toFixed(4));

    // Fall back to deed calledAcreage
    const deedAcreage = deeds.find(d => d.calledAcreage)?.calledAcreage;
    return deedAcreage ?? 0;
  }

  private inferCounty(harvest: HarvestResult): string {
    // County can be inferred from the harvest result's error messages or
    // document source fields. As a fallback we use an empty string.
    // TODO(Phase 4): pass county through HarvestResult metadata
    const sources = harvest.documentIndex.sources;
    for (const s of sources) {
      // Kofile/Tyler sources often include county slug (e.g., "kofile_48027")
      const m = s.match(/bell|travis|bexar|harris|dallas|tarrant/i);
      if (m) return m[0].charAt(0).toUpperCase() + m[0].slice(1).toLowerCase();
    }
    return '';
  }

  private buildAdjacentProperties(
    plat: PlatAnalysisResult,
    deeds: DeedAnalysisResult[],
  ): AdjacentProperty[] {
    const adjacentMap = new Map<string, AdjacentProperty>();

    // From plat adjacentOwners
    for (const ao of plat.adjacentOwners) {
      const key = ao.name.toLowerCase().trim();
      if (!key) continue;
      const dir = this.normalizeDirection(ao.direction);
      adjacentMap.set(key, {
        owner:            ao.name,
        calledAcreages:   ao.calledAcreage ? [ao.calledAcreage] : [],
        sharedBoundary:   dir,
        instrumentNumbers: [],
        volumePages:       [],
        hasBeenResearched: false,
        deedAvailable:     false,
        platAvailable:     false,
        sharedCalls:       [],
      });
    }

    // From deed calledFrom entries
    for (const deed of deeds) {
      for (const cf of deed.calledFrom) {
        const key = cf.name.toLowerCase().trim();
        if (!key) continue;
        const existing = adjacentMap.get(key);
        if (existing) {
          if (cf.acreage) existing.calledAcreages.push(cf.acreage);
          if (cf.reference) {
            // Try to parse instrument number from reference
            const instMatch = cf.reference.match(/(\d{6,12})/);
            if (instMatch && !existing.instrumentNumbers.includes(instMatch[1])) {
              existing.instrumentNumbers.push(instMatch[1]);
            }
          }
        } else {
          adjacentMap.set(key, {
            owner:            cf.name,
            calledAcreages:   cf.acreage ? [cf.acreage] : [],
            sharedBoundary:   this.normalizeDirection(cf.direction),
            instrumentNumbers: cf.reference ? [cf.reference] : [],
            volumePages:       [],
            hasBeenResearched: false,
            deedAvailable:     false,
            platAvailable:     false,
            sharedCalls:       [],
          });
        }
      }
    }

    return Array.from(adjacentMap.values());
  }

  private normalizeDirection(dir: string | undefined): AdjacentProperty['sharedBoundary'] {
    const valid: AdjacentProperty['sharedBoundary'][] = [
      'north', 'south', 'east', 'west',
      'northeast', 'northwest', 'southeast', 'southwest', 'multiple',
    ];
    const lower = (dir ?? '').toLowerCase().trim().replace(/[\s-]+/, '') as AdjacentProperty['sharedBoundary'];
    return valid.includes(lower) ? lower : 'multiple';
  }

  private buildRoads(plat: PlatAnalysisResult): RoadInfo[] {
    return plat.roads.map(r => ({
      name:               r.name,
      type:               this.normalizeRoadType(r.type),
      txdotDesignation:   r.name,
      maintainedBy:       this.inferMaintainedBy(r.type),
      estimatedROWWidth:  r.rowWidth,
      boundaryType:       'unknown' as const,
      notes:              [],
    }));
  }

  private normalizeRoadType(raw: string): RoadInfo['type'] {
    const map: Record<string, RoadInfo['type']> = {
      farm_to_market: 'farm_to_market',
      ranch_to_market: 'ranch_to_market',
      state_highway: 'state_highway',
      us_highway: 'us_highway',
      county_road: 'county_road',
      city_street: 'city_street',
      private_road: 'private_road',
      spur: 'spur',
      loop: 'loop',
      business: 'business',
    };
    return map[raw.toLowerCase()] ?? 'unknown';
  }

  private inferMaintainedBy(roadType: string): RoadInfo['maintainedBy'] {
    const lower = roadType.toLowerCase();
    if (lower.includes('farm') || lower.includes('ranch') || lower.includes('state') || lower.includes('us_') || lower.includes('interstate') || lower.includes('spur') || lower.includes('loop') || lower.includes('business')) return 'txdot';
    if (lower.includes('county')) return 'county';
    if (lower.includes('city') || lower.includes('street')) return 'city';
    if (lower.includes('private')) return 'private';
    return 'unknown';
  }

  private buildEasements(
    plat: PlatAnalysisResult,
    deeds: DeedAnalysisResult[],
  ): EasementInfo[] {
    const easements: EasementInfo[] = [];

    // From plat easements
    for (const e of plat.easements) {
      easements.push({
        type:       this.normalizeEasementType(e.type),
        width:      e.width,
        location:   e.location,
        source:     'plat_text',
        confidence: 70,
      });
    }

    // From deed easements mentioned
    for (const deed of deeds) {
      for (const em of deed.easementsMentioned) {
        // Avoid exact duplicates
        if (easements.find(ex => ex.location === em)) continue;
        easements.push({
          type:       this.normalizeEasementType(''),
          location:   em,
          source:     'deed_text',
          confidence: 65,
        });
      }
    }

    return easements;
  }

  private normalizeEasementType(raw: string): EasementInfo['type'] {
    const lower = raw.toLowerCase();
    if (lower.includes('utility'))      return 'utility';
    if (lower.includes('drain'))        return 'drainage';
    if (lower.includes('access'))       return 'access';
    if (lower.includes('conserv'))      return 'conservation';
    if (lower.includes('pipeline'))     return 'pipeline';
    if (lower.includes('power') || lower.includes('electric')) return 'powerline';
    if (lower.includes('sidewalk'))     return 'sidewalk';
    if (lower.includes('landscape'))    return 'landscape';
    return 'other';
  }

  private guessDeedType(deed: DeedAnalysisResult): string {
    // Use the rawExtraction type if available
    return deed.rawExtraction?.type ?? 'deed';
  }

  private emptyPlatResult(): PlatAnalysisResult {
    return {
      lots:            [],
      perimeterCalls:  [],
      adjacentOwners:  [],
      roads:           [],
      easements:       [],
      subdivisionInfo: {},
      lineTable:       [],
      curveTable:      [],
      notes:           [],
      totalApiCalls:   0,
      durationMs:      0,
    };
  }
}
