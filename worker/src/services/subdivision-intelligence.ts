// worker/src/services/subdivision-intelligence.ts — Phase 4 Orchestrator
// The SubdivisionIntelligenceEngine takes Phase 3 output (PropertyIntelligence)
// and builds a complete SubdivisionModel with every lot's metes and bounds,
// every interior division line, every common element, and subdivision-wide analysis.
//
// Spec §4.1–4.10 — Phase 4: Subdivision & Plat Intelligence
// Phase 5 handoff: SubdivisionModel.lotRelationships.adjacencyMatrix and
//   lots[].adjacentLots are consumed by Phase 5 (AdjacentResearchOrchestrator).

import fs from 'fs';
import path from 'path';
import { SubdivisionClassifier } from './subdivision-classifier.js';
import { LotEnumerator } from './lot-enumerator.js';
import { InteriorLineAnalyzer, type AnalyzableLot } from './interior-line-analyzer.js';
import { reconcileAreas } from './area-reconciliation.js';
import { AdjacencyBuilder } from './adjacency-builder.js';
import { SubdivisionAIAnalysis } from './subdivision-ai-analysis.js';
import { TraverseComputation } from './traverse-closure.js';
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

    // ── Input Validation ─────────────────────────────────────────────────
    if (!projectId || projectId.trim().length === 0) {
      return this.failedModel('projectId is required and cannot be empty', startTime);
    }
    if (!intelligencePath || intelligencePath.trim().length === 0) {
      return this.failedModel('intelligencePath is required and cannot be empty', startTime);
    }

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
    const traverseEngine = new TraverseComputation();

    for (const inv of lotInventory) {
      const platLot = plat?.lots.find(
        (l) => l.name.toUpperCase() === inv.lotName.toUpperCase(),
      );

      const isReserve = /reserve/i.test(inv.lotName);
      const isCommonArea = /common\s*area/i.test(inv.lotName);
      const isDrainageOrUtility = /drainage|utility|landscape|buffer|open\s*space/i.test(inv.lotName);
      const lotId = inv.lotName
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      if (isReserve || isCommonArea || isDrainageOrUtility) {
        // Determine reserve purpose from name
        const purpose = this.inferReservePurpose(inv.lotName);

        subdivisionReserves.push({
          reserveId: lotId,
          name: inv.lotName,
          purpose,
          acreage: inv.platAcreage ?? inv.cadAcreage ?? null,
          sqft: inv.platSqFt ?? (inv.platAcreage ? inv.platAcreage * 43560 : null),
          maintainedBy: 'HOA or developer',
          restrictions: this.inferReserveRestrictions(purpose),
          boundaryCalls: platLot?.boundaryCalls || [],
          confidence: platLot?.confidence ?? 50,
        });
      } else {
        const acreage = inv.platAcreage ?? inv.cadAcreage ?? null;
        const sqft = inv.platSqFt ?? (acreage ? acreage * 43560 : null);

        // Compute traverse closure for lots with boundary calls
        let closure: ClosureData | null = null;
        const allLotCalls = [...(platLot?.boundaryCalls || []), ...(platLot?.curves || [])];
        if (allLotCalls.length >= 3) {
          try {
            const traverseCalls = allLotCalls.map((c) => ({
              callId: String(c.sequence),
              bearing: c.bearing?.raw ?? null,
              distance: c.distance?.value ?? null,
              type: (c.curve ? 'curve' : 'straight') as 'straight' | 'curve',
              curve: c.curve ? {
                chordBearing: c.curve.chordBearing?.raw,
                chordDistance: c.curve.chordDistance?.value,
                arcLength: c.curve.arcLength?.value,
              } : undefined,
            }));
            const closureResult = traverseEngine.computeTraverse(traverseCalls);
            closure = {
              errorNorthing: closureResult.errorNorthing,
              errorEasting: closureResult.errorEasting,
              errorDistance: closureResult.errorDistance,
              closureRatio: closureResult.closureRatio,
              status: closureResult.status,
            };
          } catch (e) {
            // If traverse computation fails, closure remains null
            console.warn(`[Subdivision] Closure computation failed for ${inv.lotName}:`, e);
          }
        }

        // Estimate frontage and depth from boundary calls
        // Use plat commonElements for road names (commonElements built in Step 5, use plat source here)
        const roadNames = plat?.commonElements?.roads?.map((r) => r.name) || [];
        const { frontage, depth, shape, frontsOn } = this.estimateLotGeometry(
          platLot?.boundaryCalls || [],
          platLot?.curves || [],
          roadNames,
        );

        // Estimate buildable area after setbacks
        const setbacks = plat?.setbacks ?? null;
        const buildableArea = this.computeBuildableArea(sqft, frontage, depth, setbacks);

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
          frontsOn,
          frontage,
          depth,
          shape,
          boundaryCalls: platLot?.boundaryCalls || [],
          curves: platLot?.curves || [],
          closure,
          setbacks,
          easements: [],
          adjacentLots: {},
          sharedBoundaries: [],
          buildableArea,
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
    // Covenants are assembled at model creation after source validation (below).

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

    // ── Compute Perimeter Closure ────────────────────────────────────────
    console.log('[Subdivision] Computing perimeter closure...');
    const perimeterCalls = plat?.perimeter?.calls || extraction?.calls || [];
    let perimeterClosure: ClosureData | null = null;
    if (perimeterCalls.length >= 3) {
      try {
        const perimTraverseCalls = perimeterCalls.map((c) => ({
          callId: String(c.sequence),
          bearing: c.bearing?.raw ?? null,
          distance: c.distance?.value ?? null,
          type: (c.curve ? 'curve' : 'straight') as 'straight' | 'curve',
          curve: c.curve ? {
            chordBearing: c.curve.chordBearing?.raw,
            chordDistance: c.curve.chordDistance?.value,
            arcLength: c.curve.arcLength?.value,
          } : undefined,
        }));
        const perimResult = traverseEngine.computeTraverse(perimTraverseCalls);
        perimeterClosure = {
          errorNorthing: perimResult.errorNorthing,
          errorEasting: perimResult.errorEasting,
          errorDistance: perimResult.errorDistance,
          closureRatio: perimResult.closureRatio,
          status: perimResult.status,
        };
        if (perimResult.status === 'poor') {
          errors.push(
            `Subdivision perimeter traverse closure is poor: ${perimResult.closureRatio}. ` +
            `Error distance: ${perimResult.errorDistance.toFixed(3)}'`,
          );
          console.warn(
            `[Subdivision] WARNING: Poor perimeter closure (${perimResult.closureRatio}) — ` +
            `error dist ${perimResult.errorDistance.toFixed(3)}'`,
          );
        } else {
          console.log(
            `[Subdivision] Perimeter closure: ${perimResult.closureRatio} (${perimResult.status})`,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[Subdivision] Perimeter closure computation failed:', msg);
        errors.push(`Perimeter closure computation failed: ${msg}`);
      }
    }

    // ── Assemble Final Model ────────────────────────────────────────────
    const totalMs = Date.now() - startTime;
    console.log(`[Subdivision] Complete: ${subdivisionLots.length} lots, ${subdivisionReserves.length} reserves in ${(totalMs / 1000).toFixed(1)}s`);

    // Validate and sanitize restrictive covenants source field
    const validCovenantSources = ['plat_notes', 'ccr_document', 'deed_restrictions', 'unknown'] as const;
    type CovenantSource = RestrictiveCovenants['source'];
    const rawSource = plat?.restrictiveCovenants?.source;
    const isValidSource = (s: string | undefined | null): s is CovenantSource =>
      validCovenantSources.includes((s ?? '') as CovenantSource);
    const covenantSource: CovenantSource = isValidSource(rawSource) ? rawSource : 'plat_notes';

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
        parentTract: plat?.parentTract ?? { description: null, abstractSurvey: plat?.parentTract?.abstractSurvey ?? null, deedInstrument: null },
        datum: plat?.datum ? { ...plat.datum, epoch: null } : { system: 'unknown', zone: null, units: 'US Survey Feet', scaleFactor: null, epoch: null },
        pointOfBeginning: plat?.pointOfBeginning ?? { northing: null, easting: null, monumentDescription: null },
        totalArea: {
          acreage: statedAcreage,
          sqft: statedAcreage ? statedAcreage * 43560 : null,
          computed: false,
        },
        perimeterLength: this.computePerimeterLength(perimeterCalls),
        perimeter: {
          calls: perimeterCalls,
          closure: perimeterClosure,
        },
      },

      lots: subdivisionLots,
      reserves: subdivisionReserves,
      commonElements,
      restrictiveCovenants: {
        instrument: plat?.restrictiveCovenants?.instrument ?? null,
        available: !!plat?.restrictiveCovenants?.instrument,
        knownRestrictions: plat?.restrictiveCovenants?.knownRestrictions || [],
        source: covenantSource,
      },
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

  /**
   * Infer the purpose of a reserve from its name.
   * Covers Texas subdivision common reserve categories.
   */
  private inferReservePurpose(name: string): string {
    const upper = name.toUpperCase();
    if (/DRAINAGE|DETENTION|RETENTION|FLOODWAY|STORMWATER/i.test(upper)) return 'drainage';
    if (/UTILITY|UTILITIES|ELECTRIC|GAS|WATER|SEWER|TELECOM/i.test(upper)) return 'utility';
    if (/LANDSCAPE|BUFFER|GREENBELT|PARK|OPEN\s*SPACE/i.test(upper)) return 'open_space';
    if (/ACCESS|INGRESS|EGRESS|DRIVE/i.test(upper)) return 'access';
    if (/COMMON\s*AREA|AMENITY|CLUBHOUSE|POOL/i.test(upper)) return 'common_area';
    if (/RIGHT.OF.WAY|ROW\b|ROAD|STREET|ALLEY/i.test(upper)) return 'right_of_way';
    return 'drainage_and_utility'; // Default for generic reserves
  }

  /**
   * Return a restriction string based on reserve purpose.
   */
  private inferReserveRestrictions(purpose: string): string {
    switch (purpose) {
      case 'drainage':
      case 'drainage_and_utility':
        return 'No building permitted; no grading that impedes drainage flow';
      case 'utility':
        return 'No permanent structures; utility easement access required';
      case 'open_space':
      case 'common_area':
        return 'Common use only; no individual ownership; maintained by HOA';
      case 'access':
        return 'Ingress/egress easement; no obstructions';
      case 'right_of_way':
        return 'Public right-of-way; no private improvements';
      default:
        return 'No building permitted';
    }
  }

  /**
   * Estimate lot geometry (frontage, depth, shape, frontsOn road) from boundary calls.
   * Uses the pattern of call lengths and the `along` descriptor to identify road frontage.
   * NOTE: This is a heuristic approximation. Exact values require CAD coordinate processing.
   */
  private estimateLotGeometry(
    boundaryCalls: BoundaryCall[],
    curves: BoundaryCall[],
    roadNames: string[],
  ): { frontage: number | null; depth: number | null; shape: string | null; frontsOn: string | null } {
    if (boundaryCalls.length === 0) {
      return { frontage: null, depth: null, shape: null, frontsOn: null };
    }

    let frontage: number | null = null;
    let frontsOn: string | null = null;

    // Strategy 1: Find call with "along" field matching a road name
    const allCalls = [...boundaryCalls, ...curves];
    for (const call of allCalls) {
      if (!call.along) continue;
      const alUpper = call.along.toUpperCase();

      // Check if along references a road (FM, CR, Road, Street, etc.)
      const isRoadRef =
        /\bFM\s*\d+|\bCR\s*\d+|\bSH\s*\d+|\bUS\s*\d+|\bIH\s*\d+|\bROAD\b|\bST\b|\bAVE\b|\bDR\b|\bBLVD\b|\bHWY\b|\bLN\b|\bWAY\b/i.test(alUpper) ||
        roadNames.some((r) => alUpper.includes(r.toUpperCase()));

      if (isRoadRef && call.distance?.value) {
        frontage = call.distance.value;
        frontsOn = call.along;
        break;
      }
    }

    // Strategy 2: If no road reference found, use shortest side as frontage (common for residential)
    if (frontage === null && boundaryCalls.length >= 3) {
      const distValues = boundaryCalls
        .map((c) => c.distance?.value ?? 0)
        .filter((d) => d > 0)
        .sort((a, b) => a - b);
      if (distValues.length >= 2) {
        frontage = distValues[0]; // Shortest call = frontage (typical for rectangular lots)
      }
    }

    // Estimate depth from longest perpendicular call
    let depth: number | null = null;
    if (boundaryCalls.length >= 3) {
      const distValues = boundaryCalls
        .map((c) => c.distance?.value ?? 0)
        .filter((d) => d > 0)
        .sort((a, b) => b - a);
      if (distValues.length >= 1) {
        depth = distValues[0]; // Longest call ≈ depth
      }
    }

    // Classify shape based on call count and curve count
    const totalCallCount = boundaryCalls.length + curves.length;
    let shape: string | null = null;
    if (curves.length > 0) {
      shape = 'irregular_with_curves';
    } else if (totalCallCount === 4) {
      shape = 'rectangular_or_trapezoidal';
    } else if (totalCallCount === 5 || totalCallCount === 6) {
      shape = 'irregular_polygon';
    } else if (totalCallCount > 6) {
      shape = 'complex_polygon';
    } else if (totalCallCount === 3) {
      shape = 'triangular';
    }

    return { frontage, depth, shape, frontsOn };
  }

  /**
   * Estimate buildable area after subtracting setbacks.
   * NOTE: This is a rough approximation — real buildable area requires
   * survey-grade lot geometry and confirmed setback measurements from plat.
   */
  private computeBuildableArea(
    sqft: number | null,
    frontage: number | null,
    depth: number | null,
    setbacks: { front?: number; side?: number; rear?: number } | null,
  ): SubdivisionLot['buildableArea'] {
    if (!sqft || sqft <= 0) {
      return {
        estimated: true,
        sqft: null,
        reductionReasons: ['No area data available'],
      };
    }

    // If we have frontage + depth + setbacks, compute estimated buildable envelope
    if (frontage && depth && setbacks) {
      const front = setbacks.front ?? 0;
      const rear = setbacks.rear ?? 0;
      const side = setbacks.side ?? 0;

      const buildableWidth = Math.max(0, frontage - side * 2);
      const buildableDepth = Math.max(0, depth - front - rear);
      const buildableSqft = Math.round(buildableWidth * buildableDepth);

      const reductionReasons: string[] = [];
      if (front > 0) reductionReasons.push(`Front setback: ${front}'`);
      if (rear > 0) reductionReasons.push(`Rear setback: ${rear}'`);
      if (side > 0) reductionReasons.push(`Side setbacks: ${side}' each`);

      return {
        estimated: true,
        sqft: buildableSqft > 0 ? buildableSqft : null,
        reductionReasons,
      };
    }

    // Fallback: estimate 60% of lot as buildable (rough rule of thumb)
    return {
      estimated: true,
      sqft: Math.round(sqft * 0.6),
      reductionReasons: ['Estimated at 60% of lot area; setback data unavailable'],
    };
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
      if (lot.closure?.status === 'poor') {
        missing.push(`${lot.name} — poor traverse closure (ratio ${lot.closure.closureRatio})`);
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
