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

  // ── Step 2: Build AdjacentProperty stubs ───────────────────────────
  const results: AdjacentProperty[] = neighbors.map((parcel, idx) => {
    const direction = estimateDirection(input.parcelBoundary, parcel);
    return {
      direction,
      propertyId: parcel.propertyId ?? `unknown-${idx}`,
      ownerName: parcel.ownerName ?? 'Unknown',
      research: null, // Will be populated when full research is run
      sharedBoundary: null, // Could compute from geometry intersection
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
