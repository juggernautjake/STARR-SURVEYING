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

import type { BellResearchResult, PlatLayer } from '../types/research-result';

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
 * Produces an SVG with up to 5 layers:
 *   1. property-boundary — parcel outline projected from GIS coordinates
 *   2. monuments         — iron rods / pipes / concrete corners
 *   3. easements         — shaded easement corridors
 *   4. row-lines         — right-of-way dashed lines from TxDOT data
 *   5. adjacent-lots     — neighbouring parcel outlines with owner labels
 */
export async function generatePlatDrawing(
  input: PlatDrawingInput,
  _anthropicApiKey: string,
): Promise<PlatLayer[]> {
  const layers: PlatLayer[] = [];
  const boundary = input.research.property.parcelBoundary;

  // ── Layer 1: Property boundary ────────────────────────────────────
  if (boundary && boundary.length > 0) {
    const svgPath = parcelToSvgPath(boundary, input.paperSize);
    layers.push({
      name: 'property-boundary',
      description: 'Property boundary with bearings & distances',
      enabled: input.enabledLayers.includes('property-boundary'),
      drawingData: svgPath,
    });
  } else {
    layers.push({
      name: 'property-boundary',
      description: 'Property boundary with bearings & distances',
      enabled: false,
      drawingData: '',
    });
  }

  // ── Layer 2: Monuments ────────────────────────────────────────────
  const monumentSvg = buildMonumentLayer(input.research, input.paperSize);
  layers.push({
    name: 'monuments',
    description: 'Found and called monuments',
    enabled: input.enabledLayers.includes('monuments'),
    drawingData: monumentSvg,
  });

  // ── Layer 3: Easements ────────────────────────────────────────────
  const easementSvg = buildEasementLayer(input.research, input.paperSize);
  layers.push({
    name: 'easements',
    description: 'Easements (utility, drainage, ROW)',
    enabled: input.enabledLayers.includes('easements'),
    drawingData: easementSvg,
  });

  // ── Layer 4: ROW lines ────────────────────────────────────────────
  const rowSvg = buildRowLayer(input.research, input.paperSize);
  layers.push({
    name: 'row-lines',
    description: 'Right-of-way lines',
    enabled: input.enabledLayers.includes('row-lines'),
    drawingData: rowSvg,
  });

  // ── Layer 5: Adjacent lots ────────────────────────────────────────
  const adjSvg = buildAdjacentLayer(input.research, input.paperSize);
  layers.push({
    name: 'adjacent-lots',
    description: 'Adjacent lot lines and owners',
    enabled: input.enabledLayers.includes('adjacent-lots'),
    drawingData: adjSvg,
  });

  return layers;
}

// ── Internal: Coordinate Projection ──────────────────────────────────

function parcelToSvgPath(
  boundary: number[][][],
  paperSize: string,
): string {
  if (boundary.length === 0 || boundary[0].length === 0) return '';

  const { dims, margin } = getPaperLayout(paperSize);
  const { scaleX, scaleY, minLon, maxLat } = computeProjection(boundary, dims, margin);
  const scale = Math.min(scaleX, scaleY);

  const paths: string[] = [];
  for (const ring of boundary) {
    const points = ring.map(([lon, lat]) => {
      const x = margin + (lon - minLon) * scale;
      const y = margin + (maxLat - lat) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    paths.push(`M ${points.join(' L ')} Z`);
  }

  return `<g id="property-boundary" stroke="#000" stroke-width="2" fill="none"><path d="${paths.join(' ')}" /></g>`;
}

// ── Internal: Monument Layer ──────────────────────────────────────────

/**
 * Render a monument symbol (×) at the corner positions of the property
 * boundary and annotate with any named monument from plat AI analysis.
 *
 * Without precise monument coordinates (which require field survey or
 * deed parsing), we mark the GIS parcel corners as "called" positions.
 */
function buildMonumentLayer(research: BellResearchResult, paperSize: string): string {
  const boundary = research.property.parcelBoundary;
  if (!boundary || boundary.length === 0) return '';

  const { dims, margin } = getPaperLayout(paperSize);
  const { scaleX, scaleY, minLon, maxLat } = computeProjection(boundary, dims, margin);
  const scale = Math.min(scaleX, scaleY);

  // Collect monument labels from plat AI analysis
  const allMonuments: string[] = [];
  for (const plat of research.plats.plats) {
    if (plat.aiAnalysis?.monuments) {
      allMonuments.push(...plat.aiAnalysis.monuments);
    }
  }

  const elements: string[] = [];
  const corners = boundary[0] ?? [];
  // Label only the first 8 corners to avoid clutter
  corners.slice(0, 8).forEach(([lon, lat], idx) => {
    const x = margin + (lon - minLon) * scale;
    const y = margin + (maxLat - lat) * scale;
    const monLabel = allMonuments[idx] ?? 'COR';
    // Draw a small × at each corner
    const s = 5;
    elements.push(
      `<line x1="${(x - s).toFixed(1)}" y1="${(y - s).toFixed(1)}" x2="${(x + s).toFixed(1)}" y2="${(y + s).toFixed(1)}" />`,
      `<line x1="${(x + s).toFixed(1)}" y1="${(y - s).toFixed(1)}" x2="${(x - s).toFixed(1)}" y2="${(y + s).toFixed(1)}" />`,
      `<text x="${(x + 7).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="8" font-family="sans-serif">${escSvg(monLabel.slice(0, 30))}</text>`,
    );
  });

  if (elements.length === 0) return '';
  return `<g id="monuments" stroke="#8B4513" stroke-width="1.5" fill="none" font-size="8">${elements.join('')}</g>`;
}

// ── Internal: Easement Layer ──────────────────────────────────────────

/**
 * Render easements as semi-transparent shaded bands along the property
 * boundary edges where easement descriptions reference road frontage.
 *
 * Without precise easement coordinate data, we render a 20px buffer
 * inside the boundary on all sides and label each distinct easement type.
 */
function buildEasementLayer(research: BellResearchResult, paperSize: string): string {
  const easements = research.easementsAndEncumbrances.easements;
  const boundary = research.property.parcelBoundary;

  if (easements.length === 0) return '';
  if (!boundary || boundary.length === 0) {
    // No geometry — render a text legend only
    return buildLegendOnlyGroup('easements', easements.map(e => `${e.type}${e.width ? ' (' + e.width + ')' : ''}`));
  }

  const { dims, margin } = getPaperLayout(paperSize);
  const { scaleX, scaleY, minLon, maxLat } = computeProjection(boundary, dims, margin);
  const scale = Math.min(scaleX, scaleY);

  // Build an inset path (offset 15px inside the boundary) to represent easement zone
  const elements: string[] = [];
  const inset = 15;
  const corners = boundary[0] ?? [];
  if (corners.length >= 3) {
    const pts = corners.map(([lon, lat]) => ({
      x: margin + (lon - minLon) * scale,
      y: margin + (maxLat - lat) * scale,
    }));
    // Simple inside offset approximation: shrink each point toward centroid
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const insetPts = pts.map(p => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: p.x - (dx / len) * inset, y: p.y - (dy / len) * inset };
    });
    const d = `M ${insetPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} Z`;
    elements.push(`<path d="${d}" fill="rgba(255,165,0,0.2)" stroke="#FFA500" stroke-width="1" stroke-dasharray="4,3" />`);
  }

  // Add labels for each easement
  const labelY = margin + 20;
  easements.slice(0, 5).forEach((e, i) => {
    elements.push(
      `<text x="${margin}" y="${(labelY + i * 14).toFixed(1)}" font-size="9" font-family="sans-serif" fill="#7B3F00">${escSvg(e.type + (e.width ? ' (' + e.width + ')' : ''))}</text>`,
    );
  });

  return `<g id="easements" font-size="9">${elements.join('')}</g>`;
}

// ── Internal: ROW Layer ───────────────────────────────────────────────

/**
 * Render TxDOT right-of-way as a dashed line offset from the nearest
 * property boundary edge.  Without precise ROW coordinate data, we
 * offset the nearest boundary edge by `rowWidth` feet (approximated
 * to pixels at a typical 1:200 scale = 0.48 px/ft).
 */
function buildRowLayer(research: BellResearchResult, paperSize: string): string {
  const txdot = research.easementsAndEncumbrances.txdot;
  const boundary = research.property.parcelBoundary;

  if (!txdot) return '';

  if (!boundary || boundary.length === 0) {
    // Text legend only
    const label = `TxDOT ROW: ${txdot.highwayName ?? 'highway'}${txdot.rowWidth ? ' — ' + txdot.rowWidth + 'ft' : ''}`;
    return buildLegendOnlyGroup('row-lines', [label]);
  }

  const { dims, margin } = getPaperLayout(paperSize);
  const { scaleX, scaleY, minLon, maxLat } = computeProjection(boundary, dims, margin);
  const scale = Math.min(scaleX, scaleY);

  const corners = boundary[0] ?? [];
  if (corners.length < 2) return '';

  // Find the edge closest to the bottom of the page (southernmost — typically facing road)
  let southIdx = 0;
  let maxY = -Infinity;
  const pts = corners.map(([lon, lat]) => ({
    x: margin + (lon - minLon) * scale,
    y: margin + (maxLat - lat) * scale,
  }));
  pts.forEach((p, i) => { if (p.y > maxY) { maxY = p.y; southIdx = i; } });

  const p1 = pts[southIdx];
  const p2 = pts[(southIdx + 1) % pts.length];

  // Offset downward (away from property) by ~20px to represent ROW line
  const rowOffset = 20;
  const elements: string[] = [
    `<line x1="${p1.x.toFixed(1)}" y1="${(p1.y + rowOffset).toFixed(1)}" ` +
    `x2="${p2.x.toFixed(1)}" y2="${(p2.y + rowOffset).toFixed(1)}" ` +
    `stroke="#CC0000" stroke-width="2" stroke-dasharray="8,4" />`,
    `<text x="${Math.min(p1.x, p2.x).toFixed(1)}" y="${(Math.max(p1.y, p2.y) + rowOffset + 14).toFixed(1)}" ` +
    `font-size="9" font-family="sans-serif" fill="#CC0000">` +
    `${escSvg((txdot.highwayName ?? 'ROW') + (txdot.rowWidth ? ' (' + txdot.rowWidth + 'ft ROW)' : ''))}</text>`,
  ];

  return `<g id="row-lines">${elements.join('')}</g>`;
}

// ── Internal: Adjacent Lots Layer ─────────────────────────────────────

/**
 * Render any adjacent properties already found in the research result.
 * The adjacent parcels are listed as annotations near the corresponding
 * boundary edges.  Full geometry is not available without running a
 * separate adjacent-parcel GIS query, so we render text labels only.
 */
function buildAdjacentLayer(research: BellResearchResult, paperSize: string): string {
  const adjacent = research.adjacentProperties;
  if (adjacent.length === 0) return '';

  const { dims, margin } = getPaperLayout(paperSize);
  const boundary = research.property.parcelBoundary;

  const elements: string[] = [];

  if (!boundary || boundary.length === 0) {
    return buildLegendOnlyGroup('adjacent-lots', adjacent.map(a => `${a.direction}: ${a.ownerName} (${a.propertyId})`));
  }

  const { scaleX, scaleY, minLon, maxLat } = computeProjection(boundary, dims, margin);
  const scale = Math.min(scaleX, scaleY);
  const corners = boundary[0] ?? [];
  const pts = corners.map(([lon, lat]) => ({
    x: margin + (lon - minLon) * scale,
    y: margin + (maxLat - lat) * scale,
  }));

  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

  // Map compass directions to offset multipliers
  const dirOffsets: Record<string, [number, number]> = {
    north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
    northeast: [1, -1], northwest: [-1, -1], southeast: [1, 1], southwest: [-1, 1],
  };

  adjacent.slice(0, 8).forEach(adj => {
    const dirKey = adj.direction.toLowerCase().replace(/\s+/g, '');
    const [ox, oy] = dirOffsets[dirKey] ?? [0, 0];
    const lx = cx + ox * 80;
    const ly = cy + oy * 50;
    elements.push(
      `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" ` +
      `font-size="8" font-family="sans-serif" fill="#444">${escSvg(adj.ownerName.slice(0, 25))}</text>`,
      `<text x="${lx.toFixed(1)}" y="${(ly + 11).toFixed(1)}" text-anchor="middle" ` +
      `font-size="7" font-family="sans-serif" fill="#666">${escSvg('(' + adj.propertyId + ')')}</text>`,
    );
  });

  return `<g id="adjacent-lots">${elements.join('')}</g>`;
}

// ── Internal: Layout Helpers ──────────────────────────────────────────

const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  'letter':  { width: 816,  height: 1056 },  // 8.5 × 11 @ 96 DPI
  'legal':   { width: 816,  height: 1344 },  // 8.5 × 14
  'tabloid': { width: 1056, height: 1632 },  // 11 × 17
  'ansi-d':  { width: 2112, height: 3264 },  // 22 × 34
};

function getPaperLayout(paperSize: string): { dims: { width: number; height: number }; margin: number } {
  const dims = PAPER_SIZES[paperSize] ?? PAPER_SIZES['letter'];
  return { dims, margin: 50 };
}

function computeProjection(
  boundary: number[][][],
  dims: { width: number; height: number },
  margin: number,
): { scaleX: number; scaleY: number; minLon: number; maxLon: number; minLat: number; maxLat: number } {
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
  const dLon = (maxLon - minLon) * 0.1 || 0.0001;
  const dLat = (maxLat - minLat) * 0.1 || 0.0001;
  minLon -= dLon; maxLon += dLon;
  minLat -= dLat; maxLat += dLat;

  const drawWidth  = dims.width  - 2 * margin;
  const drawHeight = dims.height - 2 * margin;
  const scaleX = drawWidth  / (maxLon - minLon);
  const scaleY = drawHeight / (maxLat - minLat);

  return { scaleX, scaleY, minLon, maxLon, minLat, maxLat };
}

/** Render a text-only legend group when no geometry is available. */
function buildLegendOnlyGroup(id: string, lines: string[]): string {
  if (lines.length === 0) return '';
  const items = lines.slice(0, 6).map((l, i) =>
    `<text x="10" y="${20 + i * 14}" font-size="9" font-family="sans-serif">${escSvg(l)}</text>`,
  ).join('');
  return `<g id="${id}">${items}</g>`;
}

/** Escape characters that are special in SVG text content. */
function escSvg(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
