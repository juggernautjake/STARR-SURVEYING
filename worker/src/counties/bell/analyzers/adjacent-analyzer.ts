/**
 * Bell County Adjacent Property Analyzer
 *
 * Orchestrates full research on all properties adjacent to the
 * target property. Uses GIS spatial queries to identify neighbors,
 * then runs the complete Bell County research pipeline on each.
 */

import type { AdjacentProperty, BellResearchResult } from '../types/research-result.js';
import { findAdjacentParcels, type GisSearchResult } from '../scrapers/gis-scraper.js';

// ── Types ────────────────────────────────────────────────────────────

export interface AdjacentAnalysisInput {
  /** Parcel boundary of the target property */
  parcelBoundary: number[][][];
  /** Target property ID (to exclude from adjacent results) */
  targetPropertyId: string;
}

export interface AdjacentAnalyzerProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Find and research all adjacent properties.
 * This is the "second button" — runs after the initial research.
 */
export async function analyzeAdjacentProperties(
  input: AdjacentAnalysisInput,
  onProgress: (p: AdjacentAnalyzerProgress) => void,
): Promise<AdjacentProperty[]> {
  const progress = (msg: string) => {
    onProgress({ phase: 'Adjacent', message: msg, timestamp: new Date().toISOString() });
  };

  // ── Step 1: Find adjacent parcels from GIS ─────────────────────────
  progress('Identifying adjacent parcels from GIS...');
  const adjacentParcels = await findAdjacentParcels(input.parcelBoundary, (p) => {
    onProgress(p);
  });

  // Exclude the target property
  const neighbors = adjacentParcels.filter(
    p => p.propertyId !== input.targetPropertyId,
  );

  progress(`Found ${neighbors.length} adjacent parcel(s)`);

  // ── Step 2: Build AdjacentProperty stubs with shared boundary ──────
  const results: AdjacentProperty[] = neighbors.map((parcel, idx) => {
    const direction = estimateDirection(input.parcelBoundary, parcel);
    const sharedBoundary = computeSharedBoundary(input.parcelBoundary, parcel.parcelBoundary ?? undefined);
    return {
      direction,
      propertyId: parcel.propertyId ?? `unknown-${idx}`,
      ownerName: parcel.ownerName ?? 'Unknown',
      research: null,
      sharedBoundary,
    };
  });

  // ── Step 3: Run full research on each (optional, user-triggered) ──
  // This would call runBellCountyResearch() for each adjacent property.
  // Since this can take 30 minutes, it should be triggered separately.
  // For now, we return the stubs with basic GIS data.

  progress(`Adjacent property analysis complete: ${results.length} neighbor(s) identified`);
  return results;
}

// ── Internal: Direction Estimation ───────────────────────────────────

function estimateDirection(
  targetBoundary: number[][][],
  neighbor: GisSearchResult,
): string {
  if (!neighbor.parcelBoundary || neighbor.parcelBoundary.length === 0) {
    return 'Adjacent';
  }

  // Compute centroids
  const targetCentroid = computeCentroid(targetBoundary);
  const neighborCentroid = computeCentroid(neighbor.parcelBoundary);

  if (!targetCentroid || !neighborCentroid) return 'Adjacent';

  // Determine cardinal direction
  const dLon = neighborCentroid.lon - targetCentroid.lon;
  const dLat = neighborCentroid.lat - targetCentroid.lat;
  const angle = Math.atan2(dLon, dLat) * 180 / Math.PI;

  if (angle >= -22.5 && angle < 22.5) return 'North';
  if (angle >= 22.5 && angle < 67.5) return 'Northeast';
  if (angle >= 67.5 && angle < 112.5) return 'East';
  if (angle >= 112.5 && angle < 157.5) return 'Southeast';
  if (angle >= 157.5 || angle < -157.5) return 'South';
  if (angle >= -157.5 && angle < -112.5) return 'Southwest';
  if (angle >= -112.5 && angle < -67.5) return 'West';
  return 'Northwest';
}

function computeCentroid(
  boundary: number[][][],
): { lat: number; lon: number } | null {
  if (boundary.length === 0 || boundary[0].length === 0) return null;

  let sumLon = 0, sumLat = 0, count = 0;
  for (const ring of boundary) {
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  }

  if (count === 0) return null;
  return { lon: sumLon / count, lat: sumLat / count };
}

// ── Shared Boundary Computation ─────────────────────────────────────
// Finds the boundary segments shared between target and neighbor parcels.
// Two segments are "shared" if their endpoints are within PROXIMITY_THRESHOLD
// degrees of each other (~3 feet at Texas latitudes).
//
// Returns a human-readable description of the shared boundary:
//   "Shared boundary: 3 segment(s), ~450 ft along South line"

const PROXIMITY_THRESHOLD = 0.00001; // ~1 meter / ~3 feet

function computeSharedBoundary(
  targetBoundary: number[][][],
  neighborBoundary: number[][][] | undefined,
): string | null {
  if (!neighborBoundary || neighborBoundary.length === 0) return null;
  if (targetBoundary.length === 0) return null;

  const targetRing = targetBoundary[0];
  const neighborRing = neighborBoundary[0];
  if (!targetRing || targetRing.length < 3 || !neighborRing || neighborRing.length < 3) return null;

  // Find target edge segments that have both endpoints near a neighbor edge
  const sharedSegments: { bearing: number; lengthFt: number }[] = [];

  for (let i = 0; i < targetRing.length - 1; i++) {
    const [tLon1, tLat1] = targetRing[i];
    const [tLon2, tLat2] = targetRing[i + 1];

    // Check if both endpoints of this target segment are close to the neighbor polygon
    const p1Near = isPointNearRing(tLon1, tLat1, neighborRing);
    const p2Near = isPointNearRing(tLon2, tLat2, neighborRing);

    if (p1Near && p2Near) {
      // Compute segment bearing and length
      const dLon = tLon2 - tLon1;
      const dLat = tLat2 - tLat1;
      const bearing = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
      // Approximate distance in feet (at ~31° latitude: 1° lat ≈ 364,000 ft, 1° lon ≈ 311,000 ft)
      const dLatFt = dLat * 364000;
      const dLonFt = dLon * 311000;
      const lengthFt = Math.sqrt(dLatFt * dLatFt + dLonFt * dLonFt);

      sharedSegments.push({ bearing, lengthFt });
    }
  }

  if (sharedSegments.length === 0) return null;

  const totalLengthFt = sharedSegments.reduce((sum, s) => sum + s.lengthFt, 0);
  const avgBearing = sharedSegments.reduce((sum, s) => sum + s.bearing, 0) / sharedSegments.length;

  // Determine cardinal direction of shared boundary
  let dirLabel: string;
  const b = avgBearing;
  if (b >= 337.5 || b < 22.5) dirLabel = 'North';
  else if (b >= 22.5 && b < 67.5) dirLabel = 'Northeast';
  else if (b >= 67.5 && b < 112.5) dirLabel = 'East';
  else if (b >= 112.5 && b < 157.5) dirLabel = 'Southeast';
  else if (b >= 157.5 && b < 202.5) dirLabel = 'South';
  else if (b >= 202.5 && b < 247.5) dirLabel = 'Southwest';
  else if (b >= 247.5 && b < 292.5) dirLabel = 'West';
  else dirLabel = 'Northwest';

  return `Shared boundary: ${sharedSegments.length} segment(s), ~${Math.round(totalLengthFt)} ft along ${dirLabel} line`;
}

function isPointNearRing(lon: number, lat: number, ring: number[][]): boolean {
  for (const [rLon, rLat] of ring) {
    if (Math.abs(lon - rLon) < PROXIMITY_THRESHOLD && Math.abs(lat - rLat) < PROXIMITY_THRESHOLD) {
      return true;
    }
  }
  // Also check if point is near any edge segment (not just vertices)
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const dist = pointToSegmentDistance(lon, lat, x1, y1, x2, y2);
    if (dist < PROXIMITY_THRESHOLD) return true;
  }
  return false;
}

function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}
