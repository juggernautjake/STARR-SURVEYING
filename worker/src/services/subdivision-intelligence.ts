// worker/src/services/subdivision-intelligence.ts — Phase 4 Orchestrator
// The SubdivisionIntelligenceEngine takes Phase 3 output (PropertyIntelligence)
// and builds a complete SubdivisionModel with every lot's metes and bounds,
// every interior division line, every common element, and subdivision-wide analysis.
//
// Spec §4.1–4.10 — Phase 4: Subdivision & Plat Intelligence

import fs from 'fs';
import path from 'path';
import { SubdivisionClassifier } from './subdivision-classifier.js';
import { LotEnumerator } from './lot-enumerator.js';
import { InteriorLineAnalyzer, type AnalyzableLot } from './interior-line-analyzer.js';
import { reconcileAreas } from './area-reconciliation.js';
import { AdjacencyBuilder } from './adjacency-builder.js';
import { SubdivisionAIAnalysis } from './subdivision-ai-analysis.js';
import type { CADAdapter } from '../adapters/cad-adapter.js';
import type { ClerkAdapter } from '../adapters/clerk-adapter.js';
import type { BoundaryCall, ExtractedBoundaryData } from '../types/index.js';
import type {
  SubdivisionModel,
  SubdivisionLot,
  SubdivisionReserve,
  CommonElements,
  RestrictiveCovenants,
  LotRelationships,
  SubdivisionWideAnalysis,
  InteriorLine,
  LotInventoryEntry,
  ClosureData,
} from '../types/subdivision.js';

// ── Phase 3 Input Shape ─────────────────────────────────────────────────────
// The intelligence JSON written by Phase 3's AI extraction pipeline.

export interface PropertyIntelligenceInput {
  projectId: string;
  property: {
    propertyId: string;
    owner: string | null;
    legalDescription: string | null;
    acreage: number | null;
    county: string;
    subdivisionName: string | null;
    isSubdivision: boolean;
    relatedPropertyIds: string[];
    deedReferences: { instrumentNumber: string; type: string; date: string | null }[];
  };
  extraction: {
    type: string;
    datum: string;
    pointOfBeginning: { description: string; referenceMonument: string | null };
    calls: BoundaryCall[];
    area: { raw: string; value: number | null; unit: string } | null;
    lotBlock: { lot: string; block: string; subdivision: string; phase: string | null } | null;
    confidence: number;
  } | null;
  platAnalysis: {
    lots: {
      lotId: string;
      name: string;
      acreage: number | null;
      sqft: number | null;
      boundaryCalls: BoundaryCall[];
      curves: BoundaryCall[];
      confidence: number;
    }[];
    surveyor: { name: string | null; rpls: string | null; surveyDate: string | null; firmAddress: string | null } | null;
    parentTract: { description: string | null; abstractSurvey: string | null; deedInstrument: string | null } | null;
    datum: { system: string; zone: string | null; units: string; scaleFactor: number | null } | null;
    pointOfBeginning: { northing: number | null; easting: number | null; monumentDescription: string | null } | null;
    totalArea: { acreage: number | null; sqft: number | null } | null;
    perimeter: { calls: BoundaryCall[] } | null;
    platImagePaths: string[];
    commonElements: {
      roads: { name: string; type: string; rowWidth: number | null; serves: string[] }[];
      drainageEasements: { width: number | null; location: string }[];
      utilityEasements: { width: number | null; location: string; providers: string[] }[];
    } | null;
    restrictiveCovenants: {
      instrument: string | null;
      knownRestrictions: string[];
      source: string;
    } | null;
    setbacks: { front?: number; side?: number; rear?: number } | null;
  } | null;
  deedAnalysis: {
    grantor: string | null;
    grantee: string | null;
    calledAcreage: number | null;
    metesAndBounds: BoundaryCall[];
  } | null;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class SubdivisionIntelligenceEngine {
  private apiKey: string;
  private cadAdapter: CADAdapter | null;
  private clerkAdapter: ClerkAdapter | null;

  constructor(opts?: {
    apiKey?: string;
    cadAdapter?: CADAdapter;
    clerkAdapter?: ClerkAdapter;
  }) {
    this.apiKey = opts?.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.cadAdapter = opts?.cadAdapter ?? null;
    this.clerkAdapter = opts?.clerkAdapter ?? null;
  }

  /**
   * Main entry point.  Reads the Phase 3 intelligence JSON and produces a
   * complete SubdivisionModel.
   */
  async analyze(
    projectId: string,
    intelligencePath: string,
  ): Promise<SubdivisionModel> {
    const startTime = Date.now();
    let aiCalls = 0;
    const errors: string[] = [];

    console.log(`[Subdivision] Starting analysis for ${projectId}`);

    // ── Load Phase 3 output ──────────────────────────────────────────────
    if (!fs.existsSync(intelligencePath)) {
      return this.failedModel(`Intelligence file not found: ${intelligencePath}`, startTime);
    }

    let input: PropertyIntelligenceInput;
    try {
      input = JSON.parse(fs.readFileSync(intelligencePath, 'utf-8'));
    } catch (e) {
      return this.failedModel(`Failed to parse intelligence JSON: ${e}`, startTime);
    }

    const prop = input.property;
    const plat = input.platAnalysis;
    const deed = input.deedAnalysis;
    const extraction = input.extraction;

    // ── STEP 1: Subdivision Detection & Classification ───────────────────
    console.log('[Subdivision] Step 1: Classification...');

    const classifier = new SubdivisionClassifier();
    const classResult = classifier.classifyFromLegalDescription(
      prop.legalDescription || '',
      plat ? { lots: plat.lots.map((l) => ({ name: l.name, acreage: l.acreage ?? undefined })) } : undefined,
    );

    if (classResult.classification === 'standalone_tract') {
      console.log('[Subdivision] Property is a standalone tract — not a subdivision.');
      return this.failedModel('Property is not part of a subdivision', startTime);
    }

    const subdivisionName = classResult.subdivisionName || prop.subdivisionName || 'Unknown Subdivision';
    console.log(`[Subdivision] Classified as "${classResult.classification}": ${subdivisionName}`);

    // Search for plat amendments
    let amendments: { instrument: string; type: string; date: string }[] = [];
    if (this.clerkAdapter) {
      try {
        amendments = await classifier.searchForAmendments(subdivisionName, this.clerkAdapter);
        console.log(`[Subdivision] Found ${amendments.length} plat amendments`);
      } catch (e) {
        errors.push(`Amendment search failed: ${e}`);
      }
    }

    // ── STEP 2: All-Lot Enumeration ─────────────────────────────────────
    console.log('[Subdivision] Step 2: Lot enumeration...');

    let lotInventory: LotInventoryEntry[] = [];
    const platLots = plat?.lots.map((l) => ({
      name: l.name,
      acreage: l.acreage ?? undefined,
      sqft: l.sqft ?? undefined,
    })) || [];

    if (this.cadAdapter && prop.relatedPropertyIds.length > 0) {
      const enumerator = new LotEnumerator();
      try {
        lotInventory = await enumerator.enumerateAllLots(
          this.cadAdapter,
          subdivisionName,
          prop.relatedPropertyIds,
          platLots,
        );
        console.log(`[Subdivision] Enumerated ${lotInventory.length} lots`);
      } catch (e) {
        errors.push(`Lot enumeration failed: ${e}`);
      }
    }

    // If CAD enumeration failed or wasn't available, use plat lots directly
    if (lotInventory.length === 0 && platLots.length > 0) {
      lotInventory = platLots.map((l) => ({
        lotName: l.name,
        platAcreage: l.acreage,
        platSqFt: l.sqft,
        isOnPlat: true,
        isInCAD: false,
        matchConfidence: 50,
        status: 'plat_only' as const,
      }));
    }

    // ── STEP 3: Per-Lot Deep Extraction ─────────────────────────────────
    console.log('[Subdivision] Step 3: Per-lot extraction...');

    const subdivisionLots: SubdivisionLot[] = [];
    const subdivisionReserves: SubdivisionReserve[] = [];

    for (const inv of lotInventory) {
      const platLot = plat?.lots.find(
        (l) => l.name.toUpperCase() === inv.lotName.toUpperCase(),
      );

      const isReserve = /reserve/i.test(inv.lotName);
      const lotId = inv.lotName
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      if (isReserve) {
        subdivisionReserves.push({
          reserveId: lotId,
          name: inv.lotName,
          purpose: 'drainage_and_utility',
          acreage: inv.platAcreage ?? inv.cadAcreage ?? null,
          sqft: inv.platSqFt ?? null,
          maintainedBy: 'HOA or developer',
          restrictions: 'No building permitted',
          boundaryCalls: platLot?.boundaryCalls || [],
          confidence: platLot?.confidence ?? 50,
        });
      } else {
        const acreage = inv.platAcreage ?? inv.cadAcreage ?? null;
        const sqft = inv.platSqFt ?? (acreage ? acreage * 43560 : null);

        subdivisionLots.push({
          lotId,
          name: inv.lotName,
          lotType: this.inferLotType(inv),
          acreage,
          sqft,
          owner: inv.cadOwner ?? null,
          cadPropertyId: inv.cadPropertyId ?? null,
          status: this.inferDevelopmentStatus(inv),
          position: null,
          frontsOn: null,
          frontage: null,
          depth: null,
          shape: null,
          boundaryCalls: platLot?.boundaryCalls || [],
          curves: platLot?.curves || [],
          closure: null,
          setbacks: plat?.setbacks ?? null,
          easements: [],
          adjacentLots: {},
          sharedBoundaries: [],
          buildableArea: null,
          confidence: platLot?.confidence ?? (inv.matchConfidence > 0 ? inv.matchConfidence : 50),
        });
      }
    }

    // ── STEP 4: Interior Line Analysis ──────────────────────────────────
    console.log('[Subdivision] Step 4: Interior line analysis...');

    const analyzer = new InteriorLineAnalyzer();
    const analyzableLots: AnalyzableLot[] = subdivisionLots.map((l) => ({
      lotId: l.lotId,
      name: l.name,
      boundaryCalls: l.boundaryCalls,
      curves: l.curves,
    }));

    const interiorLines = analyzer.analyzeInteriorLines(analyzableLots);
    console.log(`[Subdivision] Found ${interiorLines.length} interior lines`);

    // Update shared boundaries on each lot
    for (const line of interiorLines) {
      const lotA = subdivisionLots.find((l) => l.lotId === line.lotA);
      const lotB = subdivisionLots.find((l) => l.lotId === line.lotB);

      if (lotA) {
        lotA.sharedBoundaries.push({
          withLot: line.lotB,
          calls: [line.lineId],
          agreement: this.lineStatusToAgreement(line.overallStatus),
        });
      }
      if (lotB) {
        lotB.sharedBoundaries.push({
          withLot: line.lotA,
          calls: [line.lineId],
          agreement: this.lineStatusToAgreement(line.overallStatus),
        });
      }
    }

    // ── STEP 5: Common Element Mapping ──────────────────────────────────
    console.log('[Subdivision] Step 5: Common element mapping...');

    const commonElements: CommonElements = {
      roads: (plat?.commonElements?.roads || []).map((r) => ({
        name: r.name,
        type: r.type === 'private' ? 'private' as const : 'public' as const,
        dedicatedTo: r.type === 'public' ? 'public_use' : null,
        rowWidth: r.rowWidth,
        pavementWidth: null,
        within: 'subdivision',
        serves: r.serves,
      })),
      drainageEasements: (plat?.commonElements?.drainageEasements || []).map((d) => ({
        width: d.width,
        location: d.location,
        flowDirection: null,
        outfall: null,
      })),
      utilityEasements: (plat?.commonElements?.utilityEasements || []).map((u) => ({
        width: u.width,
        location: u.location,
        providers: u.providers,
      })),
      accessEasements: [],
    };

    // ── STEP 6: Plat Amendment Chain ────────────────────────────────────
    console.log('[Subdivision] Step 6: Plat amendment chain...');
    // amendments were already fetched in Step 1

    const platAmendments = amendments
      .filter((a) => a.type !== 'replat')
      .map((a) => ({ instrument: a.instrument, type: a.type, date: a.date }));
    const replats = amendments
      .filter((a) => a.type === 'replat')
      .map((a) => ({ instrument: a.instrument, type: a.type, date: a.date }));

    // ── STEP 7: Restrictive Covenant Extraction ─────────────────────────
    console.log('[Subdivision] Step 7: Restrictive covenants...');

    const restrictiveCovenants: RestrictiveCovenants = {
      instrument: plat?.restrictiveCovenants?.instrument ?? null,
      available: !!plat?.restrictiveCovenants?.instrument,
      knownRestrictions: plat?.restrictiveCovenants?.knownRestrictions || [],
      source: (plat?.restrictiveCovenants?.source as RestrictiveCovenants['source']) || 'plat_notes',
    };

    // ── STEP 8: Subdivision-Wide Validation ─────────────────────────────
    console.log('[Subdivision] Step 8: Validation & reconciliation...');

    // Area reconciliation
    const statedAcreage = plat?.totalArea?.acreage ?? prop.acreage ?? 0;
    const allElements = [
      ...subdivisionLots.map((l) => ({
        name: l.name,
        sqft: l.sqft ?? undefined,
        acreage: l.acreage ?? undefined,
        lotType: l.lotType,
      })),
      ...subdivisionReserves.map((r) => ({
        name: r.name,
        sqft: r.sqft ?? undefined,
        acreage: r.acreage ?? undefined,
        lotType: 'reserve',
      })),
    ];

    const roadDedications = commonElements.roads
      .filter((r) => r.rowWidth)
      .map((r) => ({
        name: r.name,
        // Estimate: ROW width * average lot depth (rough approximation)
        estimatedSqFt: (r.rowWidth || 50) * 200,
      }));

    const areaResult = reconcileAreas(statedAcreage, allElements, roadDedications);

    // Build adjacency matrix
    let adjacencyMatrix: Record<string, Record<string, string>> = {};
    const allLotNames = [
      ...subdivisionLots.map((l) => l.name),
      ...subdivisionReserves.map((r) => r.name),
    ];

    // Try AI-based adjacency if plat images are available
    if (plat?.platImagePaths?.[0] && this.apiKey) {
      try {
        const adjBuilder = new AdjacencyBuilder();
        const adjResult = await adjBuilder.buildFromAI(
          plat.platImagePaths[0],
          allLotNames,
          this.apiKey,
        );
        aiCalls++;

        // Convert to simplified adjacency matrix
        for (const [lotId, adj] of Object.entries(adjResult.adjacencies)) {
          adjacencyMatrix[lotId] = {};
          for (const [dir, neighbors] of Object.entries(adj)) {
            for (const neighbor of neighbors as string[]) {
              adjacencyMatrix[lotId][neighbor] = dir;
            }
          }
        }

        // Also update lot adjacentLots
        for (const lot of subdivisionLots) {
          const adj = adjResult.adjacencies[lot.lotId];
          if (adj) {
            const allNeighbors: Record<string, string> = {};
            for (const [dir, neighbors] of Object.entries(adj)) {
              for (const n of neighbors as string[]) {
                allNeighbors[dir] = n;
              }
            }
            lot.adjacentLots = allNeighbors;
          }
        }
      } catch (e) {
        errors.push(`Adjacency AI analysis failed: ${e}`);
      }
    }

    // Build shared boundary index
    const sharedBoundaryIndex = interiorLines.map((line) => ({
      lotA: line.lotA,
      lotB: line.lotB,
      calls: [line.lineId],
      length: line.callFromA?.distance?.value ?? 0,
      verified: line.overallStatus === 'verified' || line.overallStatus === 'close_match',
    }));

    const lotRelationships: LotRelationships = {
      adjacencyMatrix,
      sharedBoundaryIndex,
    };

    // Subdivision-wide analysis
    const lotsWithBounds = subdivisionLots.filter((l) => l.boundaryCalls.length > 0);
    const subdivisionAnalysis: SubdivisionWideAnalysis = {
      completeness: {
        allLotsIdentified: lotInventory.every((l) => l.status === 'matched'),
        allLotsHaveBounds: lotsWithBounds.length === subdivisionLots.length,
        allReservesIdentified: subdivisionReserves.length > 0 || !classResult.hasReserves,
        perimeterComplete: (plat?.perimeter?.calls?.length ?? 0) > 0,
        allInteriorLinesResolved: interiorLines.every(
          (l) => l.overallStatus === 'verified' || l.overallStatus === 'close_match',
        ),
        missingData: this.identifyMissingData(subdivisionLots, subdivisionReserves, interiorLines),
      },
      internalConsistency: {
        lotAreaSum: areaResult.computedLotSumSqFt,
        statedTotalArea: areaResult.statedTotalSqFt,
        areaDifference: areaResult.unaccountedSqFt,
        areaDifferencePct: areaResult.unaccountedPct,
        status: areaResult.status,
        notes: areaResult.notes.join('; ') || 'Area reconciliation within tolerance',
      },
      developmentStatus: Object.fromEntries([
        ...subdivisionLots.map((l) => [l.lotId, l.status]),
        ...subdivisionReserves.map((r) => [r.reserveId, 'undeveloped_reserve']),
      ]),
    };

    // ── AI Holistic Analysis (optional — requires plat image + API key) ──
    let aiAnalysisResult = null;
    if (plat?.platImagePaths?.[0] && this.apiKey) {
      try {
        console.log('[Subdivision] Running AI holistic analysis...');
        const aiAnalyzer = new SubdivisionAIAnalysis(this.apiKey);
        aiAnalysisResult = await aiAnalyzer.analyzeSubdivision(
          plat.platImagePaths,
          lotInventory,
          interiorLines,
          {
            lots: (plat?.lots || []).map((l) => ({
              name: l.name,
              callCount: l.boundaryCalls.length,
              curveCount: l.curves.length,
              confidence: l.confidence,
            })),
          },
          deed
            ? {
                grantor: deed.grantor,
                grantee: deed.grantee,
                calledAcreage: deed.calledAcreage,
                metesAndBoundsCount: deed.metesAndBounds.length,
              }
            : null,
        );
        aiCalls++;
        console.log('[Subdivision] AI analysis complete');
      } catch (e) {
        errors.push(`AI subdivision analysis failed: ${e}`);
      }
    }

    // ── Determine plat instrument ────────────────────────────────────────
    const platRef = prop.deedReferences.find((r) => r.type === 'plat');

    // ── Assemble Final Model ────────────────────────────────────────────
    const totalMs = Date.now() - startTime;
    console.log(`[Subdivision] Complete: ${subdivisionLots.length} lots, ${subdivisionReserves.length} reserves in ${(totalMs / 1000).toFixed(1)}s`);

    const model: SubdivisionModel = {
      status: errors.length === 0 ? 'complete' : 'partial',

      subdivision: {
        name: subdivisionName,
        platInstrument: platRef?.instrumentNumber ?? classResult.platInstrument ?? null,
        platDate: platRef?.date ?? null,
        platType: classResult.classification,
        platAmendments,
        replats,
        surveyor: plat?.surveyor ?? { name: null, rpls: null, surveyDate: null, firmAddress: null },
        parentTract: plat?.parentTract ?? { description: null, abstractSurvey: prop.abstractSurvey ?? null, deedInstrument: null },
        datum: plat?.datum ?? { system: 'unknown', zone: null, units: 'US Survey Feet', scaleFactor: null, epoch: null },
        pointOfBeginning: plat?.pointOfBeginning ?? { northing: null, easting: null, monumentDescription: null },
        totalArea: {
          acreage: statedAcreage,
          sqft: statedAcreage ? statedAcreage * 43560 : null,
          computed: false,
        },
        perimeterLength: this.computePerimeterLength(plat?.perimeter?.calls || extraction?.calls || []),
        perimeter: {
          calls: plat?.perimeter?.calls || extraction?.calls || [],
          closure: null,
        },
      },

      lots: subdivisionLots,
      reserves: subdivisionReserves,
      commonElements,
      restrictiveCovenants,
      lotRelationships,
      subdivisionAnalysis,

      timing: { totalMs },
      aiCalls,
      errors,
    };

    // ── Persist result ──────────────────────────────────────────────────
    const outputDir = path.dirname(intelligencePath);
    const outputPath = path.join(outputDir, 'subdivision_model.json');
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));
      console.log(`[Subdivision] Saved to ${outputPath}`);
    } catch (e) {
      console.error(`[Subdivision] Failed to save model:`, e);
    }

    return model;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private failedModel(reason: string, startTime: number): SubdivisionModel {
    return {
      status: 'failed',
      subdivision: {
        name: '',
        platInstrument: null,
        platDate: null,
        platType: 'unknown',
        platAmendments: [],
        replats: [],
        surveyor: { name: null, rpls: null, surveyDate: null, firmAddress: null },
        parentTract: { description: null, abstractSurvey: null, deedInstrument: null },
        datum: { system: 'unknown', zone: null, units: 'US Survey Feet', scaleFactor: null, epoch: null },
        pointOfBeginning: { northing: null, easting: null, monumentDescription: null },
        totalArea: { acreage: null, sqft: null, computed: false },
        perimeterLength: null,
        perimeter: { calls: [], closure: null },
      },
      lots: [],
      reserves: [],
      commonElements: { roads: [], drainageEasements: [], utilityEasements: [], accessEasements: [] },
      restrictiveCovenants: { instrument: null, available: false, knownRestrictions: [], source: 'unknown' },
      lotRelationships: { adjacencyMatrix: {}, sharedBoundaryIndex: [] },
      subdivisionAnalysis: {
        completeness: {
          allLotsIdentified: false,
          allLotsHaveBounds: false,
          allReservesIdentified: false,
          perimeterComplete: false,
          allInteriorLinesResolved: false,
          missingData: [reason],
        },
        internalConsistency: {
          lotAreaSum: 0,
          statedTotalArea: 0,
          areaDifference: 0,
          areaDifferencePct: 0,
          status: 'discrepancy',
          notes: reason,
        },
        developmentStatus: {},
      },
      timing: { totalMs: Date.now() - startTime },
      aiCalls: 0,
      errors: [reason],
    };
  }

  private inferLotType(inv: LotInventoryEntry): SubdivisionLot['lotType'] {
    const name = inv.lotName.toUpperCase();
    if (/RESERVE/i.test(name)) return 'reserve';
    if (/COMMON\s*AREA/i.test(name)) return 'common_area';
    if (/OPEN\s*SPACE/i.test(name)) return 'open_space';
    // Default to residential for named lots
    return 'residential';
  }

  private inferDevelopmentStatus(inv: LotInventoryEntry): SubdivisionLot['status'] {
    if (inv.improvements && inv.improvements.length > 0) {
      return 'improved';
    }
    return 'vacant';
  }

  private lineStatusToAgreement(
    status: InteriorLine['overallStatus'],
  ): 'confirmed' | 'close_match' | 'discrepancy' | 'unverified' {
    switch (status) {
      case 'verified': return 'confirmed';
      case 'close_match': return 'close_match';
      case 'discrepancy': return 'discrepancy';
      default: return 'unverified';
    }
  }

  private computePerimeterLength(calls: BoundaryCall[]): number | null {
    if (calls.length === 0) return null;
    let total = 0;
    for (const call of calls) {
      if (call.distance?.value) {
        total += call.distance.value;
      } else if (call.curve?.arcLength?.value) {
        total += call.curve.arcLength.value;
      }
    }
    return total > 0 ? total : null;
  }

  private identifyMissingData(
    lots: SubdivisionLot[],
    reserves: SubdivisionReserve[],
    interiorLines: InteriorLine[],
  ): string[] {
    const missing: string[] = [];

    for (const lot of lots) {
      if (lot.boundaryCalls.length === 0) {
        missing.push(`${lot.name} — no boundary calls extracted`);
      }
      if (!lot.acreage && !lot.sqft) {
        missing.push(`${lot.name} — no area data`);
      }
    }

    for (const reserve of reserves) {
      if (reserve.boundaryCalls.length === 0) {
        missing.push(`${reserve.name} — no boundary calls extracted`);
      }
    }

    for (const line of interiorLines) {
      if (line.overallStatus === 'one_sided') {
        missing.push(
          `${line.lotA} / ${line.lotB} shared boundary — single source only`,
        );
      }
      if (line.overallStatus === 'discrepancy') {
        missing.push(
          `${line.lotA} / ${line.lotB} shared boundary — discrepancy detected`,
        );
      }
    }

    return missing;
  }
}
