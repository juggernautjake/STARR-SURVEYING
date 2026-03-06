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

/**
 * Lookup table: Texas 5-digit FIPS code → County name.
 * Used by inferCounty() to identify the county from Kofile/Tyler source strings
 * of the form "kofile_48027" without requiring the county to be passed separately.
 *
 * Covers all 254 Texas counties (FIPS 48001–48507, odds-only in official list).
 *
 * @public Exported for unit tests.
 */
export const TEXAS_FIPS_COUNTY: Record<string, string> = {
  '48001': 'Anderson', '48003': 'Andrews', '48005': 'Angelina', '48007': 'Aransas',
  '48009': 'Archer', '48011': 'Armstrong', '48013': 'Atascosa', '48015': 'Austin',
  '48017': 'Bailey', '48019': 'Bandera', '48021': 'Bastrop', '48023': 'Baylor',
  '48025': 'Bee', '48027': 'Bell', '48029': 'Bexar', '48031': 'Blanco',
  '48033': 'Borden', '48035': 'Bosque', '48037': 'Bowie', '48039': 'Brazoria',
  '48041': 'Brazos', '48043': 'Brewster', '48045': 'Briscoe', '48047': 'Brooks',
  '48049': 'Brown', '48051': 'Burleson', '48053': 'Burnet', '48055': 'Caldwell',
  '48057': 'Calhoun', '48059': 'Callahan', '48061': 'Cameron', '48063': 'Camp',
  '48065': 'Carson', '48067': 'Cass', '48069': 'Castro', '48071': 'Chambers',
  '48073': 'Cherokee', '48075': 'Childress', '48077': 'Clay', '48079': 'Cochran',
  '48081': 'Coke', '48083': 'Coleman', '48085': 'Collin', '48087': 'Collingsworth',
  '48089': 'Colorado', '48091': 'Comal', '48093': 'Comanche', '48095': 'Concho',
  '48097': 'Cooke', '48099': 'Coryell', '48101': 'Cottle', '48103': 'Crane',
  '48105': 'Crockett', '48107': 'Crosby', '48109': 'Culberson', '48111': 'Dallam',
  '48113': 'Dallas', '48115': 'Dawson', '48117': 'Deaf Smith', '48119': 'Delta',
  '48121': 'Denton', '48123': 'DeWitt', '48125': 'Dickens', '48127': 'Dimmit',
  '48129': 'Donley', '48131': 'Duval', '48133': 'Eastland', '48135': 'Ector',
  '48137': 'Edwards', '48139': 'Ellis', '48141': 'El Paso', '48143': 'Erath',
  '48145': 'Falls', '48147': 'Fannin', '48149': 'Fayette', '48151': 'Fisher',
  '48153': 'Floyd', '48155': 'Foard', '48157': 'Fort Bend', '48159': 'Franklin',
  '48161': 'Freestone', '48163': 'Frio', '48165': 'Gaines', '48167': 'Galveston',
  '48169': 'Garza', '48171': 'Gillespie', '48173': 'Glasscock', '48175': 'Goliad',
  '48177': 'Gonzales', '48179': 'Gray', '48181': 'Grayson', '48183': 'Gregg',
  '48185': 'Grimes', '48187': 'Guadalupe', '48189': 'Hale', '48191': 'Hall',
  '48193': 'Hamilton', '48195': 'Hansford', '48197': 'Hardeman', '48199': 'Hardin',
  '48201': 'Harris', '48203': 'Harrison', '48205': 'Hartley', '48207': 'Haskell',
  '48209': 'Hays', '48211': 'Hemphill', '48213': 'Henderson', '48215': 'Hidalgo',
  '48217': 'Hill', '48219': 'Hockley', '48221': 'Hood', '48223': 'Hopkins',
  '48225': 'Houston', '48227': 'Howard', '48229': 'Hudspeth', '48231': 'Hunt',
  '48233': 'Hutchinson', '48235': 'Irion', '48237': 'Jack', '48239': 'Jackson',
  '48241': 'Jasper', '48243': 'Jeff Davis', '48245': 'Jefferson', '48247': 'Jim Hogg',
  '48249': 'Jim Wells', '48251': 'Johnson', '48253': 'Jones', '48255': 'Karnes',
  '48257': 'Kaufman', '48259': 'Kendall', '48261': 'Kenedy', '48263': 'Kent',
  '48265': 'Kerr', '48267': 'Kimble', '48269': 'King', '48271': 'Kinney',
  '48273': 'Kleberg', '48275': 'Knox', '48277': 'Lamar', '48279': 'Lamb',
  '48281': 'Lampasas', '48283': 'La Salle', '48285': 'Lavaca', '48287': 'Lee',
  '48289': 'Leon', '48291': 'Liberty', '48293': 'Limestone', '48295': 'Lipscomb',
  '48297': 'Live Oak', '48299': 'Llano', '48301': 'Loving', '48303': 'Lubbock',
  '48305': 'Lynn', '48307': 'McCulloch', '48309': 'McLennan', '48311': 'McMullen',
  '48313': 'Madison', '48315': 'Marion', '48317': 'Martin', '48319': 'Mason',
  '48321': 'Matagorda', '48323': 'Maverick', '48325': 'Medina', '48327': 'Menard',
  '48329': 'Midland', '48331': 'Milam', '48333': 'Mills', '48335': 'Mitchell',
  '48337': 'Montague', '48339': 'Montgomery', '48341': 'Moore', '48343': 'Morris',
  '48345': 'Motley', '48347': 'Nacogdoches', '48349': 'Navarro', '48351': 'Newton',
  '48353': 'Nolan', '48355': 'Nueces', '48357': 'Ochiltree', '48359': 'Oldham',
  '48361': 'Orange', '48363': 'Palo Pinto', '48365': 'Panola', '48367': 'Parker',
  '48369': 'Parmer', '48371': 'Pecos', '48373': 'Polk', '48375': 'Potter',
  '48377': 'Presidio', '48379': 'Rains', '48381': 'Randall', '48383': 'Reagan',
  '48385': 'Real', '48387': 'Red River', '48389': 'Reeves', '48391': 'Refugio',
  '48393': 'Roberts', '48395': 'Robertson', '48397': 'Rockwall', '48399': 'Runnels',
  '48401': 'Rusk', '48403': 'Sabine', '48405': 'San Augustine', '48407': 'San Jacinto',
  '48409': 'San Patricio', '48411': 'San Saba', '48413': 'Schleicher', '48415': 'Scurry',
  '48417': 'Shackelford', '48419': 'Shelby', '48421': 'Sherman', '48423': 'Smith',
  '48425': 'Somervell', '48427': 'Starr', '48429': 'Stephens', '48431': 'Sterling',
  '48433': 'Stonewall', '48435': 'Sutton', '48437': 'Swisher', '48439': 'Tarrant',
  '48441': 'Taylor', '48443': 'Terrell', '48445': 'Terry', '48447': 'Throckmorton',
  '48449': 'Titus', '48451': 'Tom Green', '48453': 'Travis', '48455': 'Trinity',
  '48457': 'Tyler', '48459': 'Upshur', '48461': 'Upton', '48463': 'Uvalde',
  '48465': 'Val Verde', '48467': 'Van Zandt', '48469': 'Victoria', '48471': 'Walker',
  '48473': 'Waller', '48475': 'Ward', '48477': 'Washington', '48479': 'Webb',
  '48481': 'Wharton', '48483': 'Wheeler', '48485': 'Wichita', '48487': 'Wilbarger',
  '48489': 'Willacy', '48491': 'Williamson', '48493': 'Wilson', '48495': 'Winkler',
  '48497': 'Wise', '48499': 'Wood', '48501': 'Yoakum', '48503': 'Young',
  '48505': 'Zapata', '48507': 'Zavala',
};

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
        notes:                this.capNotes(plat.notes, 20, 'subdivision'),
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
    // County can be inferred from the harvest result's document source fields.
    // Source identifiers from Kofile/Tyler are of the form "kofile_48027" where
    // 48027 is the 5-digit Texas FIPS code for Bell County.
    //
    // NOTE: The cleanest long-term solution is to store the county on HarvestResult
    // itself (see TODO note in Phase 3 spec).  Until that happens we use FIPS lookup.
    const sources = harvest.documentIndex.sources;
    for (const s of sources) {
      // Try FIPS-code extraction first (e.g., "kofile_48027", "tyler_48027")
      const fipsMatch = s.match(/\b48(\d{3})\b/);
      if (fipsMatch) {
        const county = TEXAS_FIPS_COUNTY[`48${fipsMatch[1]}`];
        if (county) return county;
      }
      // Fall back to bare county-name substring match
      const nameMatch = s.match(/[a-z_-]+/i);
      if (nameMatch) {
        const slug = nameMatch[0].replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase();
        for (const [, name] of Object.entries(TEXAS_FIPS_COUNTY)) {
          if (name.toLowerCase() === slug) return name;
        }
      }
    }
    return '';
  }

  /** Cap a string[] to `limit` items and warn if truncation occurred. */
  private capNotes(notes: string[], limit: number, context: string): string[] {
    if (notes.length <= limit) return notes;
    this.logger.warn(
      'AIDocumentAnalyzer',
      `${context}: truncating notes array from ${notes.length} to ${limit} items`,
    );
    return notes.slice(0, limit);
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
