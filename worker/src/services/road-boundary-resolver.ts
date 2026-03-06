// worker/src/services/road-boundary-resolver.ts — Phase 6 §6.8
// AI-driven road boundary conflict resolution.
//
// Resolves the common surveying discrepancy:
//   - DEED (often older): shows straight-line road boundaries
//   - PLAT (often newer, surveyor-prepared): shows curved road boundaries
//   - TxDOT ArcGIS geometry: authoritative answer
//
// This is the core value-add of Phase 6. The AI resolver combines
// TxDOT parcel geometry, centerline curvature analysis, RPAM screenshots,
// and deed/plat descriptions to determine which source is correct and why.
//
// NOTES:
//   - ANTHROPIC_API_KEY must be set for AI conflict resolution
//   - AI model from RESEARCH_AI_MODEL env var (default: claude-sonnet-4-5-20250929)
//   - Always check response.ok before parsing AI response (Phase 3/4 pattern)
//   - Returns a "unknown" resolution on any failure — never throws
//
// Spec §6.8

import type { BoundaryCall } from '../types/index.js';
import type { TxDOTRowFeature, TxDOTCenterlineFeature } from './txdot-row.js';
import type { RPAMResult } from './txdot-rpam-client.js';
import type { ClassifiedRoad } from './road-classifier.js';
import type { PipelineLogger } from '../lib/logger.js';

// AI model — always read from environment
const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoadBoundaryResolution {
  roadName: string;
  /** Summary of how the deed describes this road boundary */
  deedDescription: string;
  /** Summary of how the plat describes this road boundary */
  platDescription: string;
  /** What TxDOT geometry indicates ('straight'|'curved'|'mixed'|'unknown') */
  txdotConfirms: 'straight' | 'curved' | 'mixed' | 'unknown';
  /** AI-generated explanation of why the sources differ */
  explanation: string;
  /** Confidence in the resolution (0–100) */
  confidence: number;
  /** Plain-English recommendation for the surveyor */
  recommendation: string;
  /** If this resolution closes an existing discrepancy, links to it */
  resolvedDiscrepancy?: {
    discrepancyId: string;
    previousConfidence: number;
    newConfidence: number;
  };
}

// ── RoadBoundaryResolver ──────────────────────────────────────────────────────

export class RoadBoundaryResolver {
  private logger: PipelineLogger;
  private apiKey: string;

  constructor(logger: PipelineLogger) {
    this.logger = logger;
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  }

  /**
   * Resolve whether a road boundary is straight or curved using all available evidence.
   *
   * Priority of evidence (highest to lowest):
   *   1. TxDOT centerline geometry (objective — vertex count / bearing change algorithm)
   *   2. TxDOT ROW parcel geometry
   *   3. RPAM AI screenshot analysis
   *   4. AI synthesis of deed + plat descriptions
   *
   * @param road                   Classified road (from road-classifier.ts)
   * @param deedCalls              BoundaryCall[] from deed that runs along this road
   * @param platCalls              BoundaryCall[] from plat that runs along this road
   * @param rowFeatures            TxDOT ROW parcel features from ArcGIS
   * @param centerlineFeatures     TxDOT centerline features from ArcGIS
   * @param rpamResult             RPAM screenshot analysis (or null)
   * @param existingDiscrepancies  discrepancies[] from property_intelligence.json
   */
  async resolve(
    road: ClassifiedRoad,
    deedCalls: BoundaryCall[],
    platCalls: BoundaryCall[],
    rowFeatures: TxDOTRowFeature[],
    centerlineFeatures: TxDOTCenterlineFeature[],
    rpamResult: RPAMResult | null,
    existingDiscrepancies: Array<{ id?: string; callSequence?: number | null; description: string; category?: string; severity?: string }>,
  ): Promise<RoadBoundaryResolution> {
    this.logger.info(
      'RoadBoundaryResolver',
      `Resolving ${road.name}: ${deedCalls.length} deed calls, ${platCalls.length} plat calls, ` +
      `${rowFeatures.length} ROW features, ${centerlineFeatures.length} centerline features`,
    );

    // ── Step 1: Analyze TxDOT geometry (objective algorithm) ─────────────────
    const txdotGeomResult = this.analyzeTxDOTGeometry(rowFeatures, centerlineFeatures);

    // ── Step 2: Build evidence summary ───────────────────────────────────────
    const deedDesc = this.describeCalls(deedCalls, 'deed');
    const platDesc = this.describeCalls(platCalls, 'plat');
    const txdotDesc = this.describeTxDOTData(rowFeatures, centerlineFeatures, txdotGeomResult);
    const rpamDesc = rpamResult
      ? `RPAM analysis: ${rpamResult.aiAnalysis.slice(0, 300)}` +
        (rpamResult.isCurved ? ' [CURVED indicated]' : '') +
        (rpamResult.rowWidth ? ` ROW width: ${rpamResult.rowWidth}'` : '')
      : 'RPAM: not available';

    // ── Step 3: Find matching discrepancy ─────────────────────────────────────
    const roadNameUpper = road.name.toUpperCase();
    const matchingDiscrepancy = existingDiscrepancies.find(
      (d) =>
        (d.category === 'road_geometry' || d.description.toUpperCase().includes(roadNameUpper)) &&
        d.description.toUpperCase().includes(roadNameUpper),
    );

    // ── Step 4: Determine confidence and result ───────────────────────────────

    // If TxDOT geometry is definitive (straight or curved), high confidence — no AI needed
    if (txdotGeomResult !== 'unknown') {
      const confidence = this.computeConfidence(txdotGeomResult, deedCalls, platCalls, rpamResult);
      const recommendation = this.buildRecommendation(road.name, txdotGeomResult, deedDesc, platDesc);

      const resolution: RoadBoundaryResolution = {
        roadName:       road.name,
        deedDescription: deedDesc,
        platDescription: platDesc,
        txdotConfirms:  txdotGeomResult,
        explanation:    `TxDOT centerline geometry analysis indicates a ${txdotGeomResult} boundary for ${road.name}. ${txdotDesc}`,
        confidence,
        recommendation,
      };

      if (matchingDiscrepancy?.id) {
        resolution.resolvedDiscrepancy = {
          discrepancyId:    matchingDiscrepancy.id,
          previousConfidence: 45,
          newConfidence:    confidence,
        };
      }

      return resolution;
    }

    // ── Step 5: Use AI to synthesize all evidence ─────────────────────────────
    if (this.apiKey) {
      const aiResult = await this.runAIResolution(
        road.name, deedDesc, platDesc, txdotDesc, rpamDesc,
      );
      if (aiResult) {
        const resolution: RoadBoundaryResolution = {
          roadName:        road.name,
          deedDescription: deedDesc,
          platDescription: platDesc,
          txdotConfirms:   aiResult.confirms as RoadBoundaryResolution['txdotConfirms'],
          explanation:     aiResult.explanation,
          confidence:      aiResult.confidence,
          recommendation:  aiResult.recommendation,
        };

        if (matchingDiscrepancy?.id) {
          resolution.resolvedDiscrepancy = {
            discrepancyId:    matchingDiscrepancy.id,
            previousConfidence: 45,
            newConfidence:    aiResult.confidence,
          };
        }

        return resolution;
      }
    }

    // ── Step 6: Fallback — cannot determine ────────────────────────────────────
    return {
      roadName:        road.name,
      deedDescription: deedDesc,
      platDescription: platDesc,
      txdotConfirms:   'unknown',
      explanation:     `Insufficient data to determine whether ${road.name} boundary is straight or curved. ` +
        (deedCalls.length === 0 ? 'No deed calls found for this road. ' : '') +
        (rowFeatures.length === 0 ? 'No TxDOT ROW features found in ArcGIS for this location. ' : '') +
        'Manual field survey or TxDOT district office contact recommended.',
      confidence:      20,
      recommendation:  `Contact TxDOT ${road.highwaySystem ?? ''} district office for ROW plat. ` +
        'Check county deed records for original ROW dedication.',
    };
  }

  // ── Private: TxDOT geometry analysis ─────────────────────────────────────────

  /**
   * Analyze TxDOT ROW parcel and centerline features to detect curvature.
   *
   * Algorithm (§6.8 spec):
   *   For each centerline path:
   *     For each consecutive vertex trio (i, i+1, i+2):
   *       bearing1 = computeBearing(v[i], v[i+1])
   *       bearing2 = computeBearing(v[i+1], v[i+2])
   *       diff = |bearing2 - bearing1| mod 360 (smallest angle)
   *       if diff > 2.0 degrees → curved
   *   Return 'straight' if no 2°+ bearing change found
   */
  analyzeTxDOTGeometry(
    rowFeatures: TxDOTRowFeature[],
    centerlineFeatures: TxDOTCenterlineFeature[],
  ): 'straight' | 'curved' | 'mixed' | 'unknown' {
    if (centerlineFeatures.length === 0 && rowFeatures.length === 0) return 'unknown';

    const results: ('straight' | 'curved')[] = [];

    // Primary: analyze centerline features
    for (const feature of centerlineFeatures) {
      if (!feature.geometry) continue;

      const geom = feature.geometry;
      if (geom.type === 'LineString') {
        const coords = geom.coordinates as number[][];
        if (coords.length >= 3 && this.detectCurvatureInPath(coords)) {
          results.push('curved');
        } else if (coords.length >= 2) {
          results.push('straight');
        }
      } else if (geom.type === 'MultiLineString') {
        const coords = geom.coordinates as number[][][];
        for (const line of coords) {
          if (line.length >= 3 && this.detectCurvatureInPath(line)) {
            results.push('curved');
          } else if (line.length >= 2) {
            results.push('straight');
          }
        }
      }
    }

    // Secondary: analyze ROW parcel polygon vertices for curvature evidence
    if (results.length === 0) {
      for (const feature of rowFeatures) {
        if (!feature.geometry) continue;
        const geom = feature.geometry;
        if (geom.type === 'Polygon') {
          const ring = (geom.coordinates as number[][][])[0] ?? [];
          // Polygon with many vertices along one edge suggests curved boundary
          if (ring.length > 6 && this.detectCurvatureInPath(ring)) {
            results.push('curved');
          }
        }
      }
    }

    if (results.length === 0) return 'unknown';
    const hasCurved   = results.includes('curved');
    const hasStraight = results.includes('straight');
    if (hasCurved && hasStraight) return 'mixed';
    if (hasCurved) return 'curved';
    return 'straight';
  }

  /**
   * Detect curvature in a path by looking for >2° bearing changes between consecutive segments.
   * A path with a >2° bearing change between any two consecutive segments is considered curved.
   */
  private detectCurvatureInPath(coords: number[][]): boolean {
    if (coords.length < 3) return false;

    for (let i = 0; i < coords.length - 2; i++) {
      const bearing1 = this.computeBearing(coords[i], coords[i + 1]);
      const bearing2 = this.computeBearing(coords[i + 1], coords[i + 2]);

      // Compute the angular difference, handling the 0°/360° wraparound.
      // Example: bearing1=359°, bearing2=1° → abs diff = 358° → after % 360 still 358°
      // → min(358, 360-358) = min(358, 2) = 2° (correct — just a 2° change near North).
      let diff = Math.abs(bearing2 - bearing1) % 360;
      diff = Math.min(diff, 360 - diff); // take smaller of the two arcs around the circle

      if (diff > 2.0) return true; // 2-degree threshold per spec §6.8
    }
    return false;
  }

  /**
   * Compute the bearing (azimuth) from point `from` to point `to`.
   * Coordinates are [longitude, latitude] (GeoJSON convention).
   * Returns degrees 0–360 (0=North, 90=East, 180=South, 270=West).
   */
  private computeBearing(from: number[], to: number[]): number {
    const lat1 = (from[1] * Math.PI) / 180;
    const lat2 = (to[1] * Math.PI) / 180;
    const dLon = ((to[0] - from[0]) * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;

    return (bearing + 360) % 360;
  }

  // ── Private: AI resolution ────────────────────────────────────────────────────

  private async runAIResolution(
    roadName: string,
    deedDesc: string,
    platDesc: string,
    txdotDesc: string,
    rpamDesc: string,
  ): Promise<{ confirms: string; explanation: string; confidence: number; recommendation: string } | null> {
    const prompt = `You are a licensed land surveyor resolving a road boundary discrepancy.

ROAD: ${roadName}
DEED DESCRIPTION: ${deedDesc}
PLAT DESCRIPTION: ${platDesc}
TxDOT ARCGIS DATA: ${txdotDesc}
TxDOT RPAM DATA: ${rpamDesc}

QUESTION: Is the ${roadName} boundary at this location STRAIGHT or CURVED?

Common explanation: Deeds written before a road widening often show straight lines because the original acquisition used straight-line bearings. After widening, the new plat shows curves because the modern survey properly measured the curved ROW boundary.

Respond ONLY with this JSON (no markdown):
{
  "confirms": "straight" | "curved" | "mixed" | "unknown",
  "explanation": "One paragraph explaining why the sources differ and which is correct",
  "confidence": 0-100,
  "recommendation": "One sentence: which document (deed or plat) to use for this boundary and why"
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        this.logger.warn('RoadBoundaryResolver', `AI HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      };

      if (data.error) {
        this.logger.warn('RoadBoundaryResolver', `AI API error: ${data.error.message}`);
        return null;
      }

      const text = (data.content?.[0]?.text ?? '').replace(/```json?|```/g, '').trim();
      const parsed = JSON.parse(text) as {
        confirms: string;
        explanation: string;
        confidence: number;
        recommendation: string;
      };

      return parsed;
    } catch (e) {
      this.logger.warn('RoadBoundaryResolver', `AI resolution failed: ${e}`);
      return null;
    }
  }

  // ── Private: helpers ─────────────────────────────────────────────────────────

  /** Summarize boundary calls as a human-readable string */
  private describeCalls(calls: BoundaryCall[], source: string): string {
    if (calls.length === 0) return `No ${source} calls found for this road`;

    const curveCount    = calls.filter((c) => c.curve !== null).length;
    const straightCount = calls.length - curveCount;
    const hasCurves     = curveCount > 0;
    const hasStraight   = straightCount > 0;

    const geometry = hasCurves && hasStraight
      ? `MIXED (${curveCount} curves, ${straightCount} straight)`
      : hasCurves
        ? `CURVED (${curveCount} curve call${curveCount > 1 ? 's' : ''})`
        : `STRAIGHT (${straightCount} straight call${straightCount > 1 ? 's' : ''})`;

    return `${source.toUpperCase()}: ${calls.length} calls — ${geometry}`;
  }

  /** Summarize TxDOT ArcGIS data as a human-readable string */
  private describeTxDOTData(
    rowFeatures: TxDOTRowFeature[],
    centerlineFeatures: TxDOTCenterlineFeature[],
    geometryResult: string,
  ): string {
    if (rowFeatures.length === 0 && centerlineFeatures.length === 0) {
      return 'TxDOT ArcGIS: No features found for this location';
    }

    const widths = rowFeatures
      .map((f) => f.properties.ROW_WIDTH)
      .filter((w): w is number => typeof w === 'number' && w > 0);
    const maxWidth = widths.length > 0 ? Math.max(...widths) : null;

    const csjs = rowFeatures
      .map((f) => f.properties.CSJ)
      .filter(Boolean);

    const totalVertices = centerlineFeatures.reduce((sum, f) => {
      if (!f.geometry) return sum;
      if (f.geometry.type === 'LineString') return sum + (f.geometry.coordinates as number[][]).length;
      if (f.geometry.type === 'MultiLineString') {
        return sum + (f.geometry.coordinates as number[][][]).reduce((s, line) => s + line.length, 0);
      }
      return sum;
    }, 0);

    return (
      `TxDOT ArcGIS: ${rowFeatures.length} ROW feature(s), ` +
      (maxWidth ? `ROW width: ${maxWidth}'` : 'unknown width') +
      (csjs.length > 0 ? `, CSJ: ${csjs[0]}` : '') +
      `, ${centerlineFeatures.length} centerline feature(s) with ${totalVertices} vertices` +
      `, geometry analysis: ${geometryResult.toUpperCase()}`
    );
  }

  /** Compute overall confidence based on available evidence */
  private computeConfidence(
    txdotResult: 'straight' | 'curved' | 'mixed',
    deedCalls: BoundaryCall[],
    platCalls: BoundaryCall[],
    rpamResult: RPAMResult | null,
  ): number {
    let confidence = 60; // base: TxDOT geometry is authoritative

    // RPAM confirms TxDOT geometry → higher confidence
    if (rpamResult?.isCurved && txdotResult === 'curved') confidence += 15;
    if (rpamResult && !rpamResult.isCurved && txdotResult === 'straight') confidence += 15;

    // Plat agrees with TxDOT → higher confidence
    const platHasCurves = platCalls.some((c) => c.curve !== null);
    if (platHasCurves && txdotResult === 'curved') confidence += 10;
    if (!platHasCurves && platCalls.length > 0 && txdotResult === 'straight') confidence += 10;

    // Mixed result → lower confidence
    if (txdotResult === 'mixed') confidence -= 20;

    return Math.min(95, Math.max(20, confidence));
  }

  /** Build a plain-English recommendation */
  private buildRecommendation(
    roadName: string,
    txdotResult: 'straight' | 'curved' | 'mixed',
    deedDesc: string,
    platDesc: string,
  ): string {
    if (txdotResult === 'curved') {
      return (
        `Use the curved boundary from the plat for ${roadName}. ` +
        `TxDOT geometry confirms the road is curved; the deed's straight-line calls ` +
        `likely predate the current road geometry.`
      );
    }
    if (txdotResult === 'straight') {
      return (
        `The ${roadName} boundary appears straight per TxDOT geometry. ` +
        `Verify that both deed and plat describe straight lines; if not, field-verify with survey.`
      );
    }
    return (
      `${roadName} shows mixed geometry. Field survey recommended to determine ` +
      `whether the boundary is straight or curved at the subject parcel's frontage.`
    );
  }
}
