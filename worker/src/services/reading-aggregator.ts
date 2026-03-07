// worker/src/services/reading-aggregator.ts — Phase 7 Step 1
// Collects every reading for every boundary call from all upstream phases
// into a unified ReadingSet structure.
//
// Spec §7.3 — Reading Aggregation Engine

import type { BoundaryCall } from '../types/index.js';
import type { BoundaryReading, ReadingSet } from '../types/reconciliation.js';

// ── Phase Input Shapes (loose — adapts to whatever upstream phases produce) ──

export interface IntelligenceInput {
  extraction?: {
    calls?: BoundaryCall[];
    confidence?: number;
  } | null;
  platAnalysis?: {
    lots?: { lotId: string; name: string; boundaryCalls: BoundaryCall[]; curves: BoundaryCall[] }[];
    perimeter?: { calls: BoundaryCall[] } | null;
  } | null;
  deedAnalysis?: {
    metesAndBounds?: BoundaryCall[];
  } | null;
  geometricAnalysis?: {
    calls?: { callId: string; bearing: string; distance: number; type: string; confidence: number }[];
  } | null;
}

export interface SubdivisionInput {
  lotRelationships?: {
    sharedBoundaryIndex?: {
      lotA: string;
      lotB: string;
      calls: string[];
      length: number;
      verified: boolean;
    }[];
  };
  lots?: {
    lotId: string;
    name: string;
    boundaryCalls: BoundaryCall[];
    sharedBoundaries?: { withLot: string; calls: string[]; agreement: string }[];
  }[];
}

export interface CrossValidationInput {
  adjacentProperties?: {
    owner?: string;
    crossValidation?: {
      callComparisons?: {
        callId: string;
        theirReversed?: string;
        theirDistance?: number;
        status?: string;
      }[];
    };
    chainOfTitle?: {
      instrument?: string;
      grantor?: string;
      grantee?: string;
      date?: string;
      boundaryDescriptionChanged?: boolean;
      metesAndBounds?: {
        bearing?: string;
        distance?: number;
        unit?: string;
        type?: string;
        isSharedBoundary?: boolean;
        matchedCallId?: string;
      }[];
    }[];
  }[];
}

export interface ROWReportInput {
  roads?: {
    name: string;
    controlSection?: string;
    maintainedBy?: 'txdot' | 'county' | 'city' | 'private' | 'unknown';
    propertyBoundaryResolution?: {
      txdotConfirms?: 'curved' | 'straight';
    };
    rowData?: {
      source?: string;
      rowWidth?: number | null;
      curves?: { radius: number; arcLength?: number; direction?: 'left' | 'right' }[];
    };
  }[];
}

// ── Reading Aggregator ──────────────────────────────────────────────────────

export class ReadingAggregator {

  aggregate(
    intelligence: IntelligenceInput,
    subdivisionModel: SubdivisionInput | null,
    crossValidation: CrossValidationInput | null,
    rowReport: ROWReportInput | null,
  ): Map<string, ReadingSet> {
    const sets = new Map<string, ReadingSet>();

    // SOURCE 1: Phase 3 — Plat Segment Extraction
    this.collectPlatSegmentReadings(intelligence, sets);

    // SOURCE 2: Phase 3 — Plat Geometric Analysis
    this.collectPlatGeometricReadings(intelligence, sets);

    // SOURCE 3: Phase 3 — Deed Extraction
    this.collectDeedReadings(intelligence, sets);

    // SOURCE 4: Phase 4 — Interior Line Verification
    if (subdivisionModel) {
      this.collectInteriorLineReadings(subdivisionModel, sets);
    }

    // SOURCE 5: Phase 5 — Adjacent Reversed Calls
    if (crossValidation) {
      this.collectAdjacentReadings(crossValidation, sets);
    }

    // SOURCE 6: Phase 6 — TxDOT ROW
    if (rowReport) {
      this.collectROWReadings(rowReport, sets);
    }

    // Flag sets with type conflicts and authoritative sources
    for (const [, set] of sets) {
      const types = new Set(set.readings.map((r) => r.type));
      set.hasConflictingTypes = types.size > 1;
      set.hasAuthoritative = set.readings.some((r) => r.source === 'txdot_row');
    }

    return sets;
  }

  // ── Source 1: Plat Segment OCR ──────────────────────────────────────────

  private collectPlatSegmentReadings(
    intel: IntelligenceInput,
    sets: Map<string, ReadingSet>,
  ): void {
    const allCalls = this.getAllCalls(intel);
    for (const call of allCalls) {
      const callId = call.callId ?? `call_${call.sequence}`;
      const set = this.getOrCreateSet(sets, callId, call.along ?? undefined);

      set.readings.push({
        source: 'plat_segment',
        callId,
        bearing: call.bearing?.raw ?? null,
        distance: call.distance?.value ?? null,
        unit: (call.distance?.unit as 'feet' | 'varas' | 'chains') || 'feet',
        type: call.curve ? 'curve' : 'straight',
        curve: call.curve
          ? {
              radius: call.curve.radius?.value ?? 0,
              arcLength: call.curve.arcLength?.value,
              delta: call.curve.delta?.raw,
              chordBearing: call.curve.chordBearing?.raw,
              chordDistance: call.curve.chordDistance?.value,
            }
          : undefined,
        confidence: call.confidence ?? 65,
        sourcePhase: 3,
        sourceDetail: `Plat segment OCR — call #${call.sequence}`,
      });
    }
  }

  // ── Source 2: Plat Geometric Analysis ───────────────────────────────────

  private collectPlatGeometricReadings(
    intel: IntelligenceInput,
    sets: Map<string, ReadingSet>,
  ): void {
    const geoAnalysis = intel.geometricAnalysis;
    if (!geoAnalysis?.calls) return;

    for (const geo of geoAnalysis.calls) {
      const set = this.getOrCreateSet(sets, geo.callId);
      set.readings.push({
        source: 'plat_geometric',
        callId: geo.callId,
        bearing: geo.bearing,
        distance: geo.distance,
        unit: 'feet',
        type: (geo.type as 'straight' | 'curve') || 'straight',
        confidence: geo.confidence || 40,
        sourcePhase: 3,
        sourceDetail: 'AI geometric measurement (visual protractor/ruler)',
      });
    }
  }

  // ── Source 3: Deed Extraction ───────────────────────────────────────────

  private collectDeedReadings(
    intel: IntelligenceInput,
    sets: Map<string, ReadingSet>,
  ): void {
    const deedMB = intel.deedAnalysis?.metesAndBounds || [];
    const allCalls = this.getAllCalls(intel);

    for (const deedCall of deedMB) {
      const matchedCallId = this.matchDeedCallToPlat(deedCall, allCalls);
      if (!matchedCallId) continue;

      const set = this.getOrCreateSet(sets, matchedCallId);
      set.readings.push({
        source: 'deed_extraction',
        callId: matchedCallId,
        bearing: deedCall.bearing?.raw ?? null,
        distance: deedCall.distance?.value ?? null,
        unit: (deedCall.distance?.unit as 'feet' | 'varas' | 'chains') || 'feet',
        type: deedCall.curve ? 'curve' : 'straight',
        curve: deedCall.curve
          ? {
              radius: deedCall.curve.radius?.value ?? 0,
              arcLength: deedCall.curve.arcLength?.value,
              delta: deedCall.curve.delta?.raw,
              chordBearing: deedCall.curve.chordBearing?.raw,
              chordDistance: deedCall.curve.chordDistance?.value,
            }
          : undefined,
        confidence: deedCall.confidence ?? 80,
        sourcePhase: 3,
        sourceDetail: `Deed metes & bounds — call #${deedCall.sequence}`,
      });
    }
  }

  // ── Source 4: Interior Line Verification ────────────────────────────────

  private collectInteriorLineReadings(
    subModel: SubdivisionInput,
    sets: Map<string, ReadingSet>,
  ): void {
    const interiorLines = subModel.lotRelationships?.sharedBoundaryIndex || [];
    for (const line of interiorLines) {
      if (!line.calls || !Array.isArray(line.calls)) continue;
      for (const callId of line.calls) {
        const set = this.getOrCreateSet(sets, callId);

        // Interior line verification provides a second measurement from the adjacent lot
        // The length data and verified status give us an alternative reading
        if (line.length > 0) {
          set.readings.push({
            source: 'subdivision_interior',
            callId,
            bearing: null, // Interior lines don't always have bearing data in the index
            distance: line.length,
            unit: 'feet',
            type: 'straight',
            confidence: line.verified ? 85 : 50,
            sourcePhase: 4,
            sourceDetail: `Interior line verification (${line.lotA} ↔ ${line.lotB})`,
          });
        }
      }
    }
  }

  // ── Source 5: Adjacent Reversed Calls ───────────────────────────────────

  private collectAdjacentReadings(
    crossVal: CrossValidationInput,
    sets: Map<string, ReadingSet>,
  ): void {
    for (const adj of crossVal.adjacentProperties || []) {
      const cv = adj.crossValidation;
      if (!cv?.callComparisons) continue;

      for (const comp of cv.callComparisons) {
        if (!comp.theirReversed) continue;

        const set = this.getOrCreateSet(sets, comp.callId);
        set.readings.push({
          source: 'adjacent_reversed',
          callId: comp.callId,
          bearing: comp.theirReversed,
          distance: comp.theirDistance ?? null,
          unit: 'feet',
          type: 'straight',
          confidence:
            comp.status === 'confirmed' ? 90 :
            comp.status === 'close_match' ? 75 :
            comp.status === 'marginal' ? 50 : 30,
          sourcePhase: 5,
          sourceDetail: `Adjacent deed reversed — ${adj.owner || 'unknown'}`,
        });
      }

      // Chain of title readings (older descriptions)
      for (const chain of adj.chainOfTitle || []) {
        if (!chain.boundaryDescriptionChanged || !chain.metesAndBounds) continue;

        for (const chainCall of chain.metesAndBounds) {
          if (!chainCall.isSharedBoundary || !chainCall.bearing) continue;
          const matchId = chainCall.matchedCallId || `chain_${chain.instrument}`;
          const set = this.getOrCreateSet(sets, matchId);
          set.readings.push({
            source: 'adjacent_chain',
            callId: matchId,
            bearing: this.reverseBearingStr(chainCall.bearing),
            distance: chainCall.distance ?? null,
            unit: (chainCall.unit as 'feet' | 'varas' | 'chains') || 'feet',
            type: (chainCall.type as 'straight' | 'curve') || 'straight',
            confidence: 40,
            sourcePhase: 5,
            sourceDetail: `Historical deed — ${chain.grantor || '?'} → ${chain.grantee || '?'} (${chain.date || '?'})`,
          });
        }
      }
    }
  }

  // ── Source 6: TxDOT ROW ─────────────────────────────────────────────────
  //
  // Generates two types of readings:
  //   a) txdot_row — authoritative geometry when TxDOT confirms straight/curved
  //   b) county_road_default — for county-maintained roads without TxDOT data
  //      Creates a virtual reading set for the road boundary call, used by
  //      Phase 7 as a low-weight baseline for county road boundaries.

  private collectROWReadings(
    rowReport: ROWReportInput,
    sets: Map<string, ReadingSet>,
  ): void {
    for (const road of rowReport.roads || []) {
      const resolution = road.propertyBoundaryResolution;
      const roadName = road.name.toUpperCase();

      // ── Case A: TxDOT-confirmed geometry ──────────────────────────────────
      if (resolution) {
        for (const [callId, set] of sets) {
          const isAlongThisRoad = set.along && set.along.toUpperCase().includes(roadName);
          if (!isAlongThisRoad) continue;

          if (resolution.txdotConfirms === 'curved' && road.rowData?.curves) {
            for (const curve of road.rowData.curves) {
              set.readings.push({
                source: 'txdot_row',
                callId,
                bearing: null,
                distance: null,
                unit: 'feet',
                type: 'curve',
                curve: {
                  radius: curve.radius,
                  arcLength: curve.arcLength,
                  direction: curve.direction,
                },
                confidence: 95,
                sourcePhase: 6,
                sourceDetail: `TxDOT ROW — ${road.name} (CSJ: ${road.controlSection || 'n/a'})`,
              });
            }
          } else if (resolution.txdotConfirms === 'straight') {
            const existingStraight = set.readings.find(
              (r) => r.type === 'straight' && r.bearing,
            );
            if (existingStraight) {
              set.readings.push({
                source: 'txdot_row',
                callId,
                bearing: existingStraight.bearing,
                distance: existingStraight.distance,
                unit: 'feet',
                type: 'straight',
                confidence: 90,
                sourcePhase: 6,
                sourceDetail: `TxDOT confirms straight alignment — ${road.name}`,
              });
            }
          }
        }
      }

      // ── Case B: County/city/private road with no TxDOT resolution ─────────
      // For county-maintained roads, Phase 6 applied county default ROW widths.
      // Create a virtual reading so downstream phases know the ROW assumption.
      // Only adds a reading if the road is county-maintained and has rowData.
      if (
        !resolution &&
        road.maintainedBy === 'county' &&
        road.rowData?.rowWidth
      ) {
        const virtualCallId = `row_county_${road.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase()}`;
        const set = this.getOrCreateSet(sets, virtualCallId, road.name);
        set.readings.push({
          source: 'county_road_default',
          callId: virtualCallId,
          bearing: null,
          distance: null,
          unit: 'feet',
          type: 'straight',
          confidence: 20, // low confidence — generic assumption
          sourcePhase: 6,
          sourceDetail: `County ROW default — ${road.name} (${road.rowData.rowWidth}' standard)`,
        });
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private getAllCalls(intel: IntelligenceInput): BoundaryCall[] {
    const calls: BoundaryCall[] = [];

    // Perimeter calls from extraction
    if (intel.extraction?.calls) {
      calls.push(...intel.extraction.calls);
    }

    // Plat perimeter
    if (intel.platAnalysis?.perimeter?.calls) {
      // Avoid duplicates — only add if extraction didn't provide calls
      if (calls.length === 0) {
        calls.push(...intel.platAnalysis.perimeter.calls);
      }
    }

    // Per-lot calls
    if (intel.platAnalysis?.lots) {
      for (const lot of intel.platAnalysis.lots) {
        calls.push(...lot.boundaryCalls, ...lot.curves);
      }
    }

    return calls;
  }

  private getOrCreateSet(
    sets: Map<string, ReadingSet>,
    callId: string,
    along?: string,
  ): ReadingSet {
    let set = sets.get(callId);
    if (!set) {
      set = {
        callId,
        along,
        readings: [],
        hasConflictingTypes: false,
        hasAuthoritative: false,
      };
      sets.set(callId, set);
    }
    if (along && !set.along) set.along = along;
    return set;
  }

  private matchDeedCallToPlat(
    deedCall: BoundaryCall,
    platCalls: BoundaryCall[],
  ): string | null {
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const platCall of platCalls) {
      let score = 0;

      // Type match
      const deedType = deedCall.curve ? 'curve' : 'straight';
      const platType = platCall.curve ? 'curve' : 'straight';
      if (deedType === platType) score += 10;

      // Compare bearings
      const deedBearing = deedCall.bearing?.decimalDegrees;
      const platBearing = platCall.bearing?.decimalDegrees;
      if (deedBearing != null && platBearing != null) {
        const diff = Math.abs(deedBearing - platBearing);
        if (diff < 0.5) score += 40;
        else if (diff < 2.0) score += 20;
      }

      // Compare distances
      const deedDist = deedCall.distance?.value;
      const platDist = platCall.distance?.value;
      if (deedDist != null && platDist != null) {
        const diff = Math.abs(deedDist - platDist);
        if (diff < 1.0) score += 30;
        else if (diff < 5.0) score += 15;
      }

      const callId = platCall.callId ?? `call_${platCall.sequence}`;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = callId;
      }
    }

    return bestScore >= 50 ? bestMatch : null;
  }

  private reverseBearingStr(bearing: string): string {
    const m = bearing.match(
      /([NS])\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*([EW])/i,
    );
    if (!m) return bearing;

    const ns = m[1].toUpperCase() === 'N' ? 'S' : 'N';
    const ew = m[5].toUpperCase() === 'E' ? 'W' : 'E';
    const deg = m[2].padStart(2, '0');
    const min = m[3].padStart(2, '0');
    const sec = (m[4] || '00').padStart(2, '0');

    return `${ns} ${deg}°${min}'${sec}" ${ew}`;
  }
}
