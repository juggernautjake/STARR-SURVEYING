/**
 * Bell County Plat Drawing Generator
 *
 * Generates an AI-assisted plat drawing with selectable layers.
 * Uses the parcel boundary from GIS, extracted bearings/distances
 * from deeds and plats, and user-selected layer options.
 *
 * The drawing is generated as SVG for easy rendering and printing.
 * Each layer is a separate SVG group that can be toggled on/off.
 */

import type { BellResearchResult, PlatLayer } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface PlatDrawingInput {
  research: BellResearchResult;
  enabledLayers: string[];
  /** Paper size for the drawing */
  paperSize: 'letter' | 'legal' | 'tabloid' | 'ansi-d';
  /** Scale (e.g., "1:100", "1:200") */
  scale?: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Generate a plat drawing as SVG with togglable layers.
 *
 * TODO: Full implementation will:
 *   1. Project GIS parcel coordinates to page coordinates
 *   2. Draw property boundary with bearings & distances
 *   3. Overlay easement zones
 *   4. Mark monument locations
 *   5. Add ROW lines
 *   6. Label adjacent owners
 *   7. Add north arrow, scale bar, title block
 *   8. Generate layer-separated SVG
 */
export async function generatePlatDrawing(
  input: PlatDrawingInput,
  anthropicApiKey: string,
): Promise<PlatLayer[]> {
  const layers: PlatLayer[] = [];

  // Each layer will contain SVG group data
  const boundary = input.research.property.parcelBoundary;

  if (boundary && boundary.length > 0) {
    // Convert GIS coordinates to SVG path
    const svgPath = parcelToSvgPath(boundary, input.paperSize);

    layers.push({
      name: 'property-boundary',
      description: 'Property boundary with bearings & distances',
      enabled: input.enabledLayers.includes('property-boundary'),
      drawingData: svgPath,
    });
  }

  // Placeholder layers — will be populated with actual data
  layers.push({
    name: 'monuments',
    description: 'Found and called monuments',
    enabled: input.enabledLayers.includes('monuments'),
    drawingData: '', // TODO: Extract from plat analysis
  });

  layers.push({
    name: 'easements',
    description: 'Easements (utility, drainage, ROW)',
    enabled: input.enabledLayers.includes('easements'),
    drawingData: '', // TODO: Generate from easement data
  });

  layers.push({
    name: 'row-lines',
    description: 'Right-of-way lines',
    enabled: input.enabledLayers.includes('row-lines'),
    drawingData: '', // TODO: Generate from TxDOT data
  });

  layers.push({
    name: 'adjacent-lots',
    description: 'Adjacent lot lines and owners',
    enabled: input.enabledLayers.includes('adjacent-lots'),
    drawingData: '', // TODO: Generate from adjacent property data
  });

  return layers;
}

// ── Internal: Coordinate Projection ──────────────────────────────────

function parcelToSvgPath(
  boundary: number[][][],
  paperSize: string,
): string {
  if (boundary.length === 0 || boundary[0].length === 0) return '';

  // Get paper dimensions in pixels (at 96 DPI)
  const dims = PAPER_SIZES[paperSize] ?? PAPER_SIZES['letter'];

  // Compute bounding box of parcel
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const ring of boundary) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  // Add 10% margin
  const dLon = (maxLon - minLon) * 0.1;
  const dLat = (maxLat - minLat) * 0.1;
  minLon -= dLon; maxLon += dLon;
  minLat -= dLat; maxLat += dLat;

  // Scale to fit paper with margins
  const margin = 50;
  const drawWidth = dims.width - 2 * margin;
  const drawHeight = dims.height - 2 * margin;

  const scaleX = drawWidth / (maxLon - minLon);
  const scaleY = drawHeight / (maxLat - minLat);
  const scale = Math.min(scaleX, scaleY);

  // Build SVG path
  const paths: string[] = [];
  for (const ring of boundary) {
    const points = ring.map(([lon, lat]) => {
      const x = margin + (lon - minLon) * scale;
      const y = margin + (maxLat - lat) * scale; // Flip Y axis
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    paths.push(`M ${points.join(' L ')} Z`);
  }

  return `<g id="property-boundary" stroke="#000" stroke-width="2" fill="none"><path d="${paths.join(' ')}" /></g>`;
}

const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  'letter':  { width: 816, height: 1056 },   // 8.5 x 11 @ 96 DPI
  'legal':   { width: 816, height: 1344 },   // 8.5 x 14
  'tabloid': { width: 1056, height: 1632 },  // 11 x 17
  'ansi-d':  { width: 2112, height: 3264 },  // 22 x 34
};
