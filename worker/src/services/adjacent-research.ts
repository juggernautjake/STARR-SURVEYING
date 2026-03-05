// worker/src/services/adjacent-research.ts
// Adjacent Property Research System — Starr Software Spec v2.0 §12
//
// Implements the 6-step per-adjacent-property workflow:
//   Step 1: Search county clerk by instrument# / vol-pg / owner name
//   Step 2: Identify correct document (match acreage, legal description)
//   Step 3: Download preview (watermarked images)
//   Step 4: Extract metes & bounds via AI
//   Step 5: Identify shared boundary calls (bearing reversal + tolerance)
//   Step 6: Check for associated plats
//
// + Shared boundary cross-validation with the tolerance tables from the spec:
//   Bearings: ≤0°0'30" → CONFIRMED | ≤0°5' → CLOSE MATCH | ≤0°30' → MARGINAL | >0°30' → DISCREPANCY
//   Distances: ≤0.5ft → CONFIRMED  | ≤2.0ft → CLOSE MATCH | ≤5.0ft → MARGINAL  | >5.0ft → DISCREPANCY

import type { ExtractedBoundaryData, BoundaryCall } from '../types/index.js';
import type { PipelineLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdjacentPropertyCandidate {
  ownerName: string;
  calledAcreage: string | null;
  recordingRef: {
    instrumentNumber: string | null;
    volume:           string | null;
    page:             string | null;
  };
  direction: string | null;
  /** Which boundary calls of the TARGET property border this owner */
  borderCallSeqs: number[];
}

export interface SharedBoundaryCall {
  /** Sequence number in the TARGET property's boundary */
  targetSeq: number;
  targetBearing: string | null;
  targetDistance_ft: number | null;
  /** The neighbor's corresponding call (bearing reversed) */
  neighborBearing: string | null;
  neighborDistance_ft: number | null;
  bearingDiff_deg:  number | null;
  distanceDiff_ft:  number | null;
  bearingRating:   SharedBoundaryRating;
  distanceRating:  SharedBoundaryRating;
  /** Overall agreement rating for this shared call */
  overallRating: SharedBoundaryRating;
}

export type SharedBoundaryRating = 'CONFIRMED' | 'CLOSE_MATCH' | 'MARGINAL' | 'DISCREPANCY' | 'UNKNOWN';

export interface AdjacentPropertyResult {
  candidate:         AdjacentPropertyCandidate;
  status:            'researched' | 'not_found' | 'skipped' | 'error';
  extractedBoundary: ExtractedBoundaryData | null;
  sharedBoundaryCalls: SharedBoundaryCall[];
  /** How many shared calls are CONFIRMED */
  confirmedCount: number;
  /** How many shared calls are in DISCREPANCY */
  discrepancyCount: number;
  errorMessage: string | null;
}

export interface AdjacentResearchResult {
  adjacentProperties: AdjacentPropertyResult[];
  totalCandidates:    number;
  researched:         number;
  confirmedShared:    number;
  discrepantShared:   number;
  /** Total additional API calls made */
  apiCallCount: number;
}

// ── Shared boundary tolerance tables (spec §12) ────────────────────────────────

/**
 * Apply the spec's bearing tolerance table:
 *   ≤ 0°00'30"  → CONFIRMED
 *   ≤ 0°05'00"  → CLOSE_MATCH
 *   ≤ 0°30'00"  → MARGINAL
 *   > 0°30'00"  → DISCREPANCY
 */
function rateBearingDiff(diffDeg: number): SharedBoundaryRating {
  const diffMin = diffDeg * 60;  // convert to minutes for comparison
  if (diffMin <= 0.5)  return 'CONFIRMED';     // ≤ 0°00'30"
  if (diffMin <= 5.0)  return 'CLOSE_MATCH';   // ≤ 0°05'00"
  if (diffMin <= 30.0) return 'MARGINAL';      // ≤ 0°30'00"
  return 'DISCREPANCY';
}

/**
 * Apply the spec's distance tolerance table:
 *   ≤ 0.5 ft  → CONFIRMED
 *   ≤ 2.0 ft  → CLOSE_MATCH
 *   ≤ 5.0 ft  → MARGINAL
 *   > 5.0 ft  → DISCREPANCY
 */
function rateDistanceDiff(diffFt: number): SharedBoundaryRating {
  if (diffFt <= 0.5) return 'CONFIRMED';
  if (diffFt <= 2.0) return 'CLOSE_MATCH';
  if (diffFt <= 5.0) return 'MARGINAL';
  return 'DISCREPANCY';
}

function overallRating(bearing: SharedBoundaryRating, distance: SharedBoundaryRating): SharedBoundaryRating {
  const order: SharedBoundaryRating[] = ['CONFIRMED', 'CLOSE_MATCH', 'MARGINAL', 'DISCREPANCY', 'UNKNOWN'];
  const bIdx = order.indexOf(bearing);
  const dIdx = order.indexOf(distance);
  return order[Math.max(bIdx, dIdx)];
}

// ── Bearing math ──────────────────────────────────────────────────────────────

/**
 * Parse "N 45°28'15\" E" → decimal degrees azimuth (0–360, clockwise from N).
 * Returns null if unparseable.
 */
function parseAzimuth(raw: string): number | null {
  const m = raw.match(/([NS])\s*(\d+)[°\s]\s*(\d+)?[''\s]?\s*(\d+(?:\.\d+)?)?[""']?\s*([EW])/i);
  if (!m) return null;

  const ns = m[1].toUpperCase();
  const ew = m[5].toUpperCase();
  const d  = parseFloat(m[2] ?? '0');
  const mi = parseFloat(m[3] ?? '0');
  const s  = parseFloat(m[4] ?? '0');
  const deg = d + mi / 60 + s / 3600;

  if (ns === 'N' && ew === 'E') return deg;
  if (ns === 'S' && ew === 'E') return 180 - deg;
  if (ns === 'S' && ew === 'W') return 180 + deg;
  if (ns === 'N' && ew === 'W') return 360 - deg;
  return deg;
}

/**
 * Reverse a bearing: N 30°15'22" E → S 30°15'22" W
 * Works on azimuth: azimuth + 180° (mod 360)
 */
function reverseAzimuth(azimuthDeg: number): number {
  return (azimuthDeg + 180) % 360;
}

/**
 * Smallest angular difference between two azimuths (0–180°).
 */
function angularDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// ── Extract adjacent property candidates from boundary data ───────────────────

/**
 * Parse the extracted boundary data for adjacent property information.
 * Adjacent owners appear in:
 *  1. boundary.calls[].along = "along the R.K. Gaines 4-acre tract"
 *  2. boundary.references[] with type = 'deed' and a description mentioning an owner
 *
 * Also accepts a raw adjacent-properties array from the text-synthesis step.
 */
export function extractAdjacentCandidates(
  boundary: ExtractedBoundaryData | null,
  rawAdjacentProperties?: Array<{
    ownerName: string;
    calledAcreage?: string | null;
    recordingReference?: string | null;
    direction?: string | null;
  }>,
): AdjacentPropertyCandidate[] {
  const candidates: AdjacentPropertyCandidate[] = [];
  const seen = new Set<string>();

  // From synthesis step (most complete source)
  if (rawAdjacentProperties) {
    for (const ap of rawAdjacentProperties) {
      const key = ap.ownerName.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);

      // Parse recording reference if present
      let instrumentNumber: string | null = null;
      let volume: string | null = null;
      let page: string | null = null;
      const ref = ap.recordingReference ?? '';
      const instMatch = ref.match(/Inst\.?\s*#?\s*([\d-]+)/i);
      const volMatch  = ref.match(/Vol\.?\s*(\d+)/i);
      const pgMatch   = ref.match(/Pg\.?\s*(\d+)/i);
      if (instMatch) instrumentNumber = instMatch[1];
      if (volMatch)  volume            = volMatch[1];
      if (pgMatch)   page              = pgMatch[1];

      candidates.push({
        ownerName:     ap.ownerName,
        calledAcreage: ap.calledAcreage ?? null,
        recordingRef:  { instrumentNumber, volume, page },
        direction:     ap.direction ?? null,
        borderCallSeqs: [],
      });
    }
  }

  // From boundary call "along" descriptions
  for (const call of (boundary?.calls ?? [])) {
    if (!call.along) continue;
    // Look for owner name patterns: "along the Smith 10-acre tract"
    const ownerMatch = call.along.match(/(?:along\s+(?:the\s+)?)?([A-Z][a-zA-Z .'-]+(?:\s+\d+[\.\d]*[\s-]*acre)?)/);
    if (!ownerMatch) continue;
    const name = ownerMatch[1].trim().replace(/\s+\d[\d.]*[\s-]*acre\s*$/i, '').trim();
    const key  = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);

    // Find or update existing candidate with this call sequence
    const existing = candidates.find(c => c.ownerName.toLowerCase() === key);
    if (existing) {
      existing.borderCallSeqs.push(call.sequence);
    } else {
      candidates.push({
        ownerName:     name,
        calledAcreage: null,
        recordingRef:  { instrumentNumber: null, volume: null, page: null },
        direction:     null,
        borderCallSeqs: [call.sequence],
      });
    }
  }

  // From document references (deeds mention the called-from tract)
  for (const ref of (boundary?.references ?? [])) {
    if (ref.type !== 'deed' || !ref.description) continue;
    // Look for owner names in descriptions like "from the Gaines 46-acre tract"
    const ownerMatch = ref.description.match(/(?:from|called|of)\s+(?:the\s+)?([A-Z][a-zA-Z .']+?)(?:\s+\d[\d.]*[\s-]*acre|\s+tract|\s*,)/i);
    if (!ownerMatch) continue;
    const name = ownerMatch[1].trim();
    const key  = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      ownerName:     name,
      calledAcreage: null,
      recordingRef: {
        instrumentNumber: ref.instrumentNumber,
        volume:           ref.volume,
        page:             ref.page,
      },
      direction:     null,
      borderCallSeqs: [],
    });
  }

  return candidates;
}

// ── Shared boundary cross-validation ────────────────────────────────────────────

/**
 * Compare the TARGET property's boundary calls against the NEIGHBOR's boundary calls.
 * Finds shared calls using bearing reversal + distance tolerance.
 *
 * For each target call that borders the neighbor (by borderCallSeqs or general proximity):
 *   1. Get target bearing as azimuth
 *   2. Reverse it: add 180° mod 360
 *   3. Find neighbor call with matching reversed bearing (within tolerance)
 *   4. Compare distances
 *   5. Rate the match per spec tolerance tables
 */
export function crossValidateSharedBoundary(
  targetBoundary: ExtractedBoundaryData,
  neighborBoundary: ExtractedBoundaryData,
  borderCallSeqs: number[],    // which target calls border this neighbor (empty = try all)
  logger: PipelineLogger,
): SharedBoundaryCall[] {
  const results: SharedBoundaryCall[] = [];

  // Which target calls to compare (all calls if borderCallSeqs is empty)
  const targetCalls = borderCallSeqs.length > 0
    ? targetBoundary.calls.filter(c => borderCallSeqs.includes(c.sequence))
    : targetBoundary.calls;

  for (const targetCall of targetCalls) {
    if (!targetCall.bearing) continue;

    const targetAz = parseAzimuth(targetCall.bearing.raw);
    if (targetAz === null) continue;

    const reversedAz  = reverseAzimuth(targetAz);
    const targetDist  = targetCall.distance?.value ?? null;

    // Find the best-matching neighbor call
    let bestNeighbor: BoundaryCall | null = null;
    let bestDiff = Infinity;

    for (const nc of neighborBoundary.calls) {
      if (!nc.bearing) continue;
      const neighborAz = parseAzimuth(nc.bearing.raw);
      if (neighborAz === null) continue;

      const diff = angularDiff(reversedAz, neighborAz);
      // Only consider calls within 0°30' bearing tolerance (the widest spec tolerance)
      if (diff < bestDiff && diff <= 0.5) {   // 0.5° = 30 minutes
        bestDiff     = diff;
        bestNeighbor = nc;
      }
    }

    const neighborDist = bestNeighbor?.distance?.value ?? null;
    const distDiff     = (targetDist !== null && neighborDist !== null)
      ? Math.abs(targetDist - neighborDist)
      : null;

    const bearingRating  = bestNeighbor ? rateBearingDiff(bestDiff)         : 'UNKNOWN';
    const distanceRating = distDiff     !== null ? rateDistanceDiff(distDiff) : 'UNKNOWN';
    const overall        = overallRating(bearingRating, distanceRating);

    if (bestNeighbor || targetDist !== null) {
      logger.info('AdjacentResearch',
        `Shared call seq=${targetCall.sequence}: bearing diff=${bestDiff.toFixed(4)}° → ${bearingRating}` +
        (distDiff !== null ? `, dist diff=${distDiff.toFixed(2)}ft → ${distanceRating}` : ', no distance') +
        ` (overall: ${overall})`);

      results.push({
        targetSeq:           targetCall.sequence,
        targetBearing:       targetCall.bearing.raw,
        targetDistance_ft:   targetDist,
        neighborBearing:     bestNeighbor?.bearing?.raw ?? null,
        neighborDistance_ft: neighborDist,
        bearingDiff_deg:     bestNeighbor ? bestDiff : null,
        distanceDiff_ft:     distDiff,
        bearingRating,
        distanceRating,
        overallRating:       overall,
      });
    }
  }

  return results;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Run the adjacent property research workflow for all identified neighbors.
 *
 * The actual clerk search + document download + AI extraction is delegated to
 * callbacks so the caller (pipeline.ts) can inject the appropriate county adapter.
 *
 * @param candidates       Adjacent property candidates (from extractAdjacentCandidates)
 * @param targetBoundary   Target property's extracted boundary
 * @param searchAndExtract Async callback: given a candidate, returns extracted boundary or null
 * @param logger           Pipeline logger
 * @param maxConcurrent    Max concurrent research tasks (default 2 per spec)
 */
export async function runAdjacentPropertyResearch(
  candidates: AdjacentPropertyCandidate[],
  targetBoundary: ExtractedBoundaryData | null,
  searchAndExtract: (
    candidate: AdjacentPropertyCandidate,
    logger: PipelineLogger,
  ) => Promise<ExtractedBoundaryData | null>,
  logger: PipelineLogger,
  maxConcurrent = 2,
): Promise<AdjacentResearchResult> {
  logger.info('AdjacentResearch',
    `Starting adjacent property research: ${candidates.length} candidates, ` +
    `max ${maxConcurrent} concurrent`);

  if (candidates.length === 0) {
    return {
      adjacentProperties: [],
      totalCandidates:    0,
      researched:         0,
      confirmedShared:    0,
      discrepantShared:   0,
      apiCallCount:       0,
    };
  }

  const results: AdjacentPropertyResult[] = [];
  let apiCallCount = 0;

  // Process candidates in batches of maxConcurrent
  for (let i = 0; i < candidates.length; i += maxConcurrent) {
    const batch = candidates.slice(i, i + maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map(async (candidate): Promise<AdjacentPropertyResult> => {
        logger.info('AdjacentResearch', `Researching "${candidate.ownerName}"...`);

        try {
          const neighborBoundary = await searchAndExtract(candidate, logger);
          apiCallCount++;  // at minimum 1 call per candidate

          if (!neighborBoundary) {
            return {
              candidate,
              status:              'not_found',
              extractedBoundary:   null,
              sharedBoundaryCalls: [],
              confirmedCount:      0,
              discrepancyCount:    0,
              errorMessage:        'No boundary data found for this property',
            };
          }

          // Cross-validate shared boundary
          const sharedCalls = targetBoundary
            ? crossValidateSharedBoundary(
                targetBoundary,
                neighborBoundary,
                candidate.borderCallSeqs,
                logger,
              )
            : [];

          const confirmedCount   = sharedCalls.filter(s => s.overallRating === 'CONFIRMED' || s.overallRating === 'CLOSE_MATCH').length;
          const discrepancyCount = sharedCalls.filter(s => s.overallRating === 'DISCREPANCY').length;

          logger.info('AdjacentResearch',
            `"${candidate.ownerName}": ${sharedCalls.length} shared calls, ` +
            `${confirmedCount} confirmed, ${discrepancyCount} discrepancies`);

          return {
            candidate,
            status:              'researched',
            extractedBoundary:   neighborBoundary,
            sharedBoundaryCalls: sharedCalls,
            confirmedCount,
            discrepancyCount,
            errorMessage:        null,
          };

        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('AdjacentResearch', `"${candidate.ownerName}" failed: ${msg}`);
          return {
            candidate,
            status:              'error',
            extractedBoundary:   null,
            sharedBoundaryCalls: [],
            confirmedCount:      0,
            discrepancyCount:    0,
            errorMessage:        msg,
          };
        }
      }),
    );

    for (const settled of batchResults) {
      results.push(settled.status === 'fulfilled' ? settled.value : {
        candidate:           batch[batchResults.indexOf(settled)],
        status:              'error',
        extractedBoundary:   null,
        sharedBoundaryCalls: [],
        confirmedCount:      0,
        discrepancyCount:    0,
        errorMessage:        'Promise rejected unexpectedly',
      });
    }
  }

  const researched       = results.filter(r => r.status === 'researched').length;
  const confirmedShared  = results.reduce((s, r) => s + r.confirmedCount, 0);
  const discrepantShared = results.reduce((s, r) => s + r.discrepancyCount, 0);

  logger.info('AdjacentResearch',
    `Research complete: ${researched}/${candidates.length} found, ` +
    `${confirmedShared} confirmed shared calls, ${discrepantShared} discrepancies`);

  return {
    adjacentProperties: results,
    totalCandidates:    candidates.length,
    researched,
    confirmedShared,
    discrepantShared,
    apiCallCount,
  };
}
