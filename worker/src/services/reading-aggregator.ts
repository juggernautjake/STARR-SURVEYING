// worker/src/services/reading-aggregator.ts — Phase 7 Step 1
// Collects every reading for every boundary call from all upstream phases
// into a unified ReadingSet structure.
//
// Spec §7.3 — Reading Aggregation Engine
//
// Unit normalization: All distances are stored in FEET regardless of source
// unit. Varas (Texas vara = 33⅓ inches = 2.7778 ft) and chains (Gunter's
// chain = 66 ft) are converted at collection time so that traverse arithmetic
// is always consistent. The original unit is preserved for reference in
// sourceDetail.

import type { BoundaryCall } from '../types/index.js';
import type { BoundaryReading, ReadingSet } from '../types/reconciliation.js';

// ── Unit Conversion Constants ───────────────────────────────────────────────

/** Texas vara (the standard used in historic Texas surveys) — exactly 33⅓ inches */
export const VARA_TO_FEET = 1000 / 360; // ≈ 2.7778 ft per vara

/** Gunter's surveyor's chain — exactly 66 feet */
export const CHAIN_TO_FEET = 66;

/** Normalize any linear measurement to feet. Returns the value unchanged if already in feet.
 *  Traversal and reconciliation always operate in feet.
 */
export function normalizeToFeet(
  value: number | null | undefined,
  unit: 'feet' | 'varas' | 'chains',
): number | null {
  if (value == null || !isFinite(value)) return null;
  if (unit === 'varas') return Math.round(value * VARA_TO_FEET * 1000) / 1000;
  if (unit === 'chains') return value * CHAIN_TO_FEET;
  return value; // already feet
}

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
    /** Per-call visual measurements from AI visual geometry analysis (geo-reconcile.ts).
     *  These become plat_geometric readings — useful as tiebreakers but imprecise. */
    calls?: { callId: string; bearing: string; distance: number; type: string; confidence: number }[];
  } | null;
  /** Full-plat overview analysis (lower confidence than per-segment extraction).
   *  Produced when Phase 3 runs a holistic visual pass over the entire plat image.
   *  These become plat_overview readings — less precise but cover calls missed by
   *  per-segment analysis. */
  platOverview?: {
    calls?: {
      callId: string;
      bearing?: string;
      distance?: number;
      unit?: 'feet' | 'varas' | 'chains';
      type?: 'straight' | 'curve';
      confidence?: number;
      along?: string;
    }[];
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

    // SOURCE 1: Phase 3 — Plat Segment Extraction (primary — per-call OCR)
    this.collectPlatSegmentReadings(intelligence, sets);

    // SOURCE 2: Phase 3 — Plat Overview Extraction (lower-confidence holistic pass)
    this.collectPlatOverviewReadings(intelligence, sets);

    // SOURCE 3: Phase 3 — Plat Geometric Analysis (AI visual protractor/ruler)
    this.collectPlatGeometricReadings(intelligence, sets);

    // SOURCE 4: Phase 3 — Deed Extraction (metes & bounds from deed text)
    this.collectDeedReadings(intelligence, sets);

    // SOURCE 5: Phase 4 — Interior Line Verification (shared boundaries)
    if (subdivisionModel) {
      this.collectInteriorLineReadings(subdivisionModel, sets);
    }

    // SOURCE 6: Phase 5 — Adjacent Reversed Calls and chain-of-title
    if (crossValidation) {
      this.collectAdjacentReadings(crossValidation, sets);
    }

    // SOURCE 7: Phase 6 — TxDOT ROW (authoritative road geometry)
    if (rowReport) {
      this.collectROWReadings(rowReport, sets);
    }

    // Flag sets with type conflicts and authoritative sources.
    // These flags are used by source-weighting.ts to apply special adjustments.
    for (const [, set] of sets) {
      const types = new Set(set.readings.map((r) => r.type));
      set.hasConflictingTypes = types.size > 1;
      set.hasAuthoritative = set.readings.some((r) => r.source === 'txdot_row');
    }

    return sets;
  }

  // ── Source 1: Plat Segment OCR ──────────────────────────────────────────
  // Primary reading source — per-call OCR from watermarked plat image segments.
  // Distances are normalized to feet for consistent traverse arithmetic.

  private collectPlatSegmentReadings(
    intel: IntelligenceInput,
    sets: Map<string, ReadingSet>,
  ): void {
    const allCalls = this.getAllCalls(intel);
    for (const call of allCalls) {
      const callId = call.callId ?? `call_${call.sequence}`;
      const set = this.getOrCreateSet(sets, callId, call.along ?? undefined);

      const rawUnit = (call.distance?.unit as 'feet' | 'varas' | 'chains') || 'feet';
      const rawDist = call.distance?.value ?? null;
      // Normalize distance to feet — varas and chains are converted
      const distFeet = normalizeToFeet(rawDist, rawUnit);
      const unitNote = rawUnit !== 'feet' ? ` [${rawDist} ${rawUnit} → ${distFeet} ft]` : '';

      set.readings.push({
        source: 'plat_segment',
        callId,
        bearing: call.bearing?.raw ?? null,
        distance: distFeet,
        unit: 'feet', // always stored in feet
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
        sourceDetail: `Plat segment OCR — call #${call.sequence}${unitNote}`,
      });
    }
  }

  // ── Source 2: Plat Overview Extraction ─────────────────────────────────
  // Lower-confidence holistic pass over the full plat image.
  // Produces plat_overview readings when Phase 3 includes a full-plat
  // overview analysis. These readings have lower weight than per-segment
  // plat_segment readings but capture calls that segment analysis missed.

  private collectPlatOverviewReadings(
    intel: IntelligenceInput,
    sets: Map<string, ReadingSet>,
  ): void {
    const overviewCalls = intel.platOverview?.calls;
    if (!overviewCalls || overviewCalls.length === 0) return;

    for (const ov of overviewCalls) {
      if (!ov.callId) continue; // skip calls without a callId

      const set = this.getOrCreateSet(sets, ov.callId, ov.along);

      const rawUnit = ov.unit || 'feet';
      const rawDist = ov.distance ?? null;
      const distFeet = normalizeToFeet(rawDist, rawUnit);
      const unitNote = rawUnit !== 'feet' ? ` [${rawDist} ${rawUnit} → ${distFeet} ft]` : '';

      set.readings.push({
        source: 'plat_overview',
        callId: ov.callId,
        bearing: ov.bearing ?? null,
        distance: distFeet,
        unit: 'feet',
        type: ov.type || 'straight',
        confidence: ov.confidence ?? 40,
        sourcePhase: 3,
        sourceDetail: `Full-plat overview extraction${unitNote}`,
      });
    }
  }

  // ── Source 3: Plat Geometric Analysis ───────────────────────────────────
  // AI visual measurement using protractor and ruler against the plat image.
  // Less precise than OCR extraction; useful as a tiebreaker only.

  private collectPlatGeometricReadings(
    intel: IntelligenceInput,
    sets: Map<string, ReadingSet>,
  ): void {
    const geoAnalysis = intel.geometricAnalysis;
    if (!geoAnalysis?.calls) return;

    for (const geo of geoAnalysis.calls) {
      if (!geo.callId) continue; // defensive: skip calls without callId

      const set = this.getOrCreateSet(sets, geo.callId);
      set.readings.push({
        source: 'plat_geometric',
        callId: geo.callId,
        bearing: geo.bearing || null,
        distance: geo.distance != null ? geo.distance : null, // already assumed feet
        unit: 'feet',
        type: (geo.type as 'straight' | 'curve') || 'straight',
        confidence: geo.confidence || 40,
        sourcePhase: 3,
        sourceDetail: 'AI geometric measurement (visual protractor/ruler)',
      });
    }
  }

  // ── Source 4: Deed Extraction ───────────────────────────────────────────
  // Metes & bounds extracted from deed text. Matched to plat calls by
  // bearing/distance proximity. Distances normalized to feet.

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

      const rawUnit = (deedCall.distance?.unit as 'feet' | 'varas' | 'chains') || 'feet';
      const rawDist = deedCall.distance?.value ?? null;
      const distFeet = normalizeToFeet(rawDist, rawUnit);
      const unitNote = rawUnit !== 'feet' ? ` [${rawDist} ${rawUnit} → ${distFeet} ft]` : '';

      set.readings.push({
        source: 'deed_extraction',
        callId: matchedCallId,
        bearing: deedCall.bearing?.raw ?? null,
        distance: distFeet,
        unit: 'feet',
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
        sourceDetail: `Deed metes & bounds — call #${deedCall.sequence}${unitNote}`,
      });
    }
  }

  // ── Source 5: Interior Line Verification ────────────────────────────────
  // Shared boundaries between subdivision lots provide an independent
  // distance measurement. Verified shared lines get 85% confidence.

  private collectInteriorLineReadings(
    subModel: SubdivisionInput,
    sets: Map<string, ReadingSet>,
  ): void {
    const interiorLines = subModel.lotRelationships?.sharedBoundaryIndex || [];
    for (const line of interiorLines) {
      if (!line.calls || !Array.isArray(line.calls)) continue;
      for (const callId of line.calls) {
        const set = this.getOrCreateSet(sets, callId);

        // Interior line length provides a second distance measurement.
        // Bearing is often absent in the shared-boundary index — that is expected.
        if (line.length > 0) {
          set.readings.push({
            source: 'subdivision_interior',
            callId,
            bearing: null, // interior index rarely includes bearing
            distance: line.length, // already in feet from Phase 4
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

  // ── Source 6: Adjacent Reversed Calls ───────────────────────────────────
  // Bearings reversed from adjacent property deeds (Phase 5).
  // A neighbor's "S 04°37'58\" E" becomes our "N 04°37'58\" W" —
  // an independent confirmation of the shared boundary bearing.

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

      // Chain of title readings (older descriptions that changed between recordings).
      // Distance is normalized to feet; very old surveys may use varas.
      for (const chain of adj.chainOfTitle || []) {
        if (!chain.boundaryDescriptionChanged || !chain.metesAndBounds) continue;

        for (const chainCall of chain.metesAndBounds) {
          if (!chainCall.isSharedBoundary || !chainCall.bearing) continue;
          const matchId = chainCall.matchedCallId || `chain_${chain.instrument}`;
          const set = this.getOrCreateSet(sets, matchId);

          const chainUnit = (chainCall.unit as 'feet' | 'varas' | 'chains') || 'feet';
          const chainDistFeet = normalizeToFeet(chainCall.distance ?? null, chainUnit);
          const chainUnitNote = chainUnit !== 'feet' ? ` [${chainCall.distance} ${chainUnit} → ${chainDistFeet} ft]` : '';

          set.readings.push({
            source: 'adjacent_chain',
            callId: matchId,
            bearing: this.reverseBearingStr(chainCall.bearing),
            distance: chainDistFeet,
            unit: 'feet',
            type: (chainCall.type as 'straight' | 'curve') || 'straight',
            confidence: 40,
            sourcePhase: 5,
            sourceDetail: `Historical deed — ${chain.grantor || '?'} → ${chain.grantee || '?'} (${chain.date || '?'})${chainUnitNote}`,
          });
        }
      }
    }
  }

  // ── Source 7: TxDOT ROW ─────────────────────────────────────────────────
  //
  // Generates two types of readings from Phase 6 ROW data:
  //   a) txdot_row — authoritative geometry when TxDOT confirms straight/curved
  //      alignment. Weight = 0.95 — near-conclusive for road boundaries.
  //   b) county_road_default — for county-maintained roads without TxDOT data.
  //      Creates a virtual reading set representing the county ROW assumption.
  //      Weight = 0.20 — used as last-resort baseline only.
  //
  // TxDOT readings are only attached to EXISTING sets whose `along` field
  // contains the road name. This avoids creating orphaned road-only call sets
  // that have no corresponding plat or deed calls.

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
