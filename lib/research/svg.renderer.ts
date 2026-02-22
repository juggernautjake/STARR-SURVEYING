// lib/research/svg.renderer.ts — SVG renderer for plat drawings
// Converts drawing_elements into a complete SVG document.
// Runs both server-side (export) and client-side (display).

import type {
  RenderedDrawing,
  DrawingElement,
  ElementStyle,
  ViewMode,
  FeatureClass,
} from '@/types/research';
import { getConfidenceColor } from './confidence';

// ── Render Options ───────────────────────────────────────────────────────────

export interface RenderOptions {
  showTitleBlock: boolean;
  showNorthArrow: boolean;
  showScaleBar: boolean;
  showLegend: boolean;
  showConfidenceBar: boolean;
  interactive: boolean; // add data-* attributes for click handlers
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  showTitleBlock: true,
  showNorthArrow: true,
  showScaleBar: true,
  showLegend: false,
  showConfidenceBar: false,
  interactive: true,
};

// ── Main Renderer ────────────────────────────────────────────────────────────

/**
 * Render a complete SVG document from a drawing and its elements.
 */
export function renderDrawingSVG(
  drawing: RenderedDrawing,
  elements: DrawingElement[],
  viewMode: ViewMode = 'standard',
  options: Partial<RenderOptions> = {}
): string {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const { width, height, scale, units } = drawing.canvas_config;

  const parts: string[] = [];

  // SVG opening tag
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:${drawing.canvas_config.background || '#FFFFFF'}">`
  );

  // Defs: patterns, markers, gradients
  parts.push(renderDefs(viewMode));

  // Render elements sorted by z_index
  const sorted = [...elements].sort((a, b) => a.z_index - b.z_index);

  for (const element of sorted) {
    if (!element.visible) continue;
    const style = getElementStyle(element, viewMode);
    parts.push(renderElement(element, style, viewMode, opts.interactive));
  }

  // Title block
  if (opts.showTitleBlock && drawing.title_block) {
    parts.push(renderTitleBlock(drawing.title_block as Record<string, unknown>, width, height));
  }

  // North arrow
  if (opts.showNorthArrow) {
    parts.push(renderNorthArrow(width, height));
  }

  // Scale bar
  if (opts.showScaleBar) {
    parts.push(renderScaleBar(scale, units, width, height));
  }

  // Legend (feature view)
  if (viewMode === 'feature' && opts.showLegend) {
    parts.push(renderFeatureLegend(elements));
  }

  // Confidence bar (confidence view)
  if (viewMode === 'confidence' && opts.showConfidenceBar) {
    parts.push(renderConfidenceBar(width, height));
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// ── SVG Defs ─────────────────────────────────────────────────────────────────

function renderDefs(viewMode: ViewMode): string {
  return `<defs>
  <!-- Hatch patterns -->
  <pattern id="hatch-diagonal" patternUnits="userSpaceOnUse" width="8" height="8">
    <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#000" stroke-width="0.5" opacity="0.3"/>
  </pattern>
  <pattern id="hatch-cross" patternUnits="userSpaceOnUse" width="8" height="8">
    <path d="M0,4 h8 M4,0 v8" stroke="#000" stroke-width="0.5" opacity="0.3"/>
  </pattern>
  <!-- Monument markers -->
  <marker id="monument-circle" markerWidth="8" markerHeight="8" refX="4" refY="4">
    <circle cx="4" cy="4" r="3" fill="#CC0000" stroke="#000" stroke-width="0.5"/>
  </marker>
  <marker id="monument-square" markerWidth="8" markerHeight="8" refX="4" refY="4">
    <rect x="1" y="1" width="6" height="6" fill="#CC0000" stroke="#000" stroke-width="0.5"/>
  </marker>
  <marker id="monument-triangle" markerWidth="10" markerHeight="10" refX="5" refY="8">
    <polygon points="5,1 1,9 9,9" fill="#0000CC" stroke="#000" stroke-width="0.5"/>
  </marker>
  <!-- Arrow marker for north arrow -->
  <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#000"/>
  </marker>
</defs>`;
}

// ── Element Rendering ────────────────────────────────────────────────────────

function renderElement(
  element: DrawingElement,
  style: ElementStyle,
  viewMode: ViewMode,
  interactive: boolean
): string {
  const dataAttrs = interactive
    ? ` data-element-id="${element.id}" data-feature="${element.feature_class}" data-confidence="${element.confidence_score}" role="button" tabindex="0"`
    : '';

  const geom = element.geometry;

  switch (element.element_type) {
    case 'line': {
      const g = geom as { type: 'line'; start: [number, number]; end: [number, number] };
      return `<line${dataAttrs} x1="${g.start[0]}" y1="${g.start[1]}" x2="${g.end[0]}" y2="${g.end[1]}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" stroke-dasharray="${style.strokeDasharray || ''}" opacity="${style.opacity}"/>`;
    }

    case 'curve': {
      if (!element.svg_path) return '';
      return `<path${dataAttrs} d="${element.svg_path}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" stroke-dasharray="${style.strokeDasharray || ''}" fill="none" opacity="${style.opacity}"/>`;
    }

    case 'polyline': {
      const g = geom as { type: 'polygon'; points: [number, number][] };
      const pts = g.points.map(p => `${p[0]},${p[1]}`).join(' ');
      return `<polyline${dataAttrs} points="${pts}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" fill="none" opacity="${style.opacity}"/>`;
    }

    case 'polygon': {
      const g = geom as { type: 'polygon'; points: [number, number][] };
      const pts = g.points.map(p => `${p[0]},${p[1]}`).join(' ');
      const fill = style.fill || 'none';
      return `<polygon${dataAttrs} points="${pts}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" fill="${fill}" opacity="${style.opacity}"/>`;
    }

    case 'point': {
      return renderMonumentSymbol(element, style, dataAttrs);
    }

    case 'label': {
      const g = geom as { type: 'label'; position: [number, number]; anchor: string };
      const rotation = (element.attributes as Record<string, unknown>).rotation as number || 0;
      const text = escapeXml(String((element.attributes as Record<string, unknown>).text || ''));
      const textAnchor = g.anchor === 'end' ? 'end' : g.anchor === 'start' ? 'start' : 'middle';
      const transform = rotation !== 0 ? ` transform="rotate(${rotation}, ${g.position[0]}, ${g.position[1]})"` : '';

      return `<text${dataAttrs} x="${g.position[0]}" y="${g.position[1]}" font-size="${style.fontSize || 8}" font-family="${style.fontFamily || 'Arial'}" fill="${style.stroke}" text-anchor="${textAnchor}"${transform}>${text}</text>`;
    }

    case 'dimension': {
      // Dimension line: start → end with offset text
      const g = geom as { type: 'line'; start: [number, number]; end: [number, number] };
      const midX = (g.start[0] + g.end[0]) / 2;
      const midY = (g.start[1] + g.end[1]) / 2;
      const text = escapeXml(String((element.attributes as Record<string, unknown>).text || ''));

      return `<g${dataAttrs}>` +
        `<line x1="${g.start[0]}" y1="${g.start[1]}" x2="${g.end[0]}" y2="${g.end[1]}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" marker-end="url(#arrow)"/>` +
        `<text x="${midX}" y="${midY - 4}" font-size="${style.fontSize || 7}" font-family="${style.fontFamily || 'Arial'}" fill="${style.stroke}" text-anchor="middle">${text}</text>` +
        `</g>`;
    }

    case 'symbol': {
      const g = geom as { type: 'point'; position: [number, number] };
      const symbolType = (element.attributes as Record<string, unknown>).symbol_type as string || 'circle';
      return renderSymbol(g.position, symbolType, style, dataAttrs);
    }

    case 'hatch': {
      const g = geom as { type: 'polygon'; points: [number, number][] };
      const pts = g.points.map(p => `${p[0]},${p[1]}`).join(' ');
      const pattern = (element.attributes as Record<string, unknown>).pattern as string || 'hatch-diagonal';
      return `<polygon${dataAttrs} points="${pts}" fill="url(#${pattern})" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" opacity="${style.opacity}"/>`;
    }

    case 'callout': {
      const g = geom as { type: 'label'; position: [number, number]; anchor: string };
      const text = escapeXml(String((element.attributes as Record<string, unknown>).text || ''));
      const padding = 4;
      const approxWidth = text.length * 5;

      return `<g${dataAttrs}>` +
        `<rect x="${g.position[0] - approxWidth / 2 - padding}" y="${g.position[1] - 12}" width="${approxWidth + padding * 2}" height="16" rx="3" fill="#FFFDE7" stroke="#F59E0B" stroke-width="0.5"/>` +
        `<text x="${g.position[0]}" y="${g.position[1]}" font-size="${style.fontSize || 7}" font-family="${style.fontFamily || 'Arial'}" fill="#92400E" text-anchor="middle">${text}</text>` +
        `</g>`;
    }

    default:
      return '';
  }
}

// ── Monument Symbols ─────────────────────────────────────────────────────────

function renderMonumentSymbol(
  element: DrawingElement,
  style: ElementStyle,
  dataAttrs: string
): string {
  const geom = element.geometry as { type: 'point'; position: [number, number] };
  const [x, y] = geom.position;
  const attrs = element.attributes as Record<string, unknown>;
  const monType = (attrs.type as string || '').toLowerCase();
  const condition = attrs.condition as string || 'unknown';
  const size = 5;

  // Different symbol shapes based on monument type
  let shape: string;
  if (monType.includes('iron') || monType.includes('rebar')) {
    // Circle for iron rod/pipe
    const fill = condition === 'found' ? style.fill || '#CC0000' : 'none';
    shape = `<circle cx="${x}" cy="${y}" r="${size}" fill="${fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>`;
  } else if (monType.includes('concrete') || monType.includes('stone')) {
    // Square for concrete/stone
    const fill = condition === 'found' ? style.fill || '#CC0000' : 'none';
    shape = `<rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" fill="${fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>`;
  } else if (monType.includes('pk') || monType.includes('nail') || monType.includes('mag')) {
    // Triangle for PK/mag nails
    const fill = condition === 'found' ? '#0000CC' : 'none';
    shape = `<polygon points="${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}" fill="${fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>`;
  } else {
    // Default: diamond
    const fill = condition === 'found' ? style.fill || '#666666' : 'none';
    shape = `<polygon points="${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}" fill="${fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>`;
  }

  // Add crosshair for "found" monuments
  let crosshair = '';
  if (condition === 'found') {
    crosshair = `<line x1="${x - size - 2}" y1="${y}" x2="${x + size + 2}" y2="${y}" stroke="${style.stroke}" stroke-width="0.5"/>` +
      `<line x1="${x}" y1="${y - size - 2}" x2="${x}" y2="${y + size + 2}" stroke="${style.stroke}" stroke-width="0.5"/>`;
  }

  // Monument label
  const label = attrs.display as string || '';
  const labelSvg = label
    ? `<text x="${x}" y="${y + size + 12}" font-size="6" font-family="Arial" fill="#333" text-anchor="middle">${escapeXml(label)}</text>`
    : '';

  return `<g${dataAttrs} class="monument">${shape}${crosshair}${labelSvg}</g>`;
}

// ── Symbol Rendering ─────────────────────────────────────────────────────────

function renderSymbol(
  position: [number, number],
  symbolType: string,
  style: ElementStyle,
  dataAttrs: string
): string {
  const [x, y] = position;
  const s = 4;

  switch (symbolType) {
    case 'tree':
      return `<g${dataAttrs}><circle cx="${x}" cy="${y}" r="${s}" fill="#228B22" stroke="#006400" stroke-width="0.5"/></g>`;
    case 'utility_pole':
      return `<g${dataAttrs}><circle cx="${x}" cy="${y}" r="2" fill="#FF8C00"/><line x1="${x - s}" y1="${y}" x2="${x + s}" y2="${y}" stroke="#FF8C00" stroke-width="1"/></g>`;
    case 'fire_hydrant':
      return `<g${dataAttrs}><polygon points="${x},${y - s} ${x - s},${y + s} ${x + s},${y + s}" fill="#EF4444" stroke="#991B1B" stroke-width="0.5"/></g>`;
    case 'manhole':
      return `<g${dataAttrs}><circle cx="${x}" cy="${y}" r="${s}" fill="none" stroke="#666" stroke-width="1"/><line x1="${x - s}" y1="${y}" x2="${x + s}" y2="${y}" stroke="#666" stroke-width="0.5"/><line x1="${x}" y1="${y - s}" x2="${x}" y2="${y + s}" stroke="#666" stroke-width="0.5"/></g>`;
    default:
      return `<g${dataAttrs}><circle cx="${x}" cy="${y}" r="3" fill="${style.fill || '#999'}" stroke="${style.stroke}" stroke-width="0.5"/></g>`;
  }
}

// ── View Mode Styling ────────────────────────────────────────────────────────

function getElementStyle(element: DrawingElement, viewMode: ViewMode): ElementStyle {
  const baseStyle = element.style;

  switch (viewMode) {
    case 'confidence': {
      // Color based on confidence score
      const color = getConfidenceColor(element.confidence_score);
      return {
        ...baseStyle,
        stroke: color,
        fill: element.style.fill !== 'none' ? color : 'none',
      };
    }

    case 'discrepancy': {
      // Highlight elements with discrepancies
      const hasDisc = element.discrepancy_ids.length > 0;
      if (hasDisc) {
        return {
          ...baseStyle,
          stroke: '#EF4444',
          strokeWidth: baseStyle.strokeWidth + 1,
          opacity: 1,
        };
      }
      return { ...baseStyle, opacity: 0.4 };
    }

    case 'feature':
    case 'standard':
    case 'custom':
    default:
      return baseStyle;
  }
}

// ── Title Block ──────────────────────────────────────────────────────────────

function renderTitleBlock(
  titleBlock: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number
): string {
  const x = canvasWidth - 420;
  const y = canvasHeight - 180;
  const w = 400;
  const h = 160;

  const fields = titleBlock.fields as Record<string, string> || {};

  return `<g class="title-block">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" stroke="#000" stroke-width="1.5"/>
  <line x1="${x}" y1="${y + 30}" x2="${x + w}" y2="${y + 30}" stroke="#000" stroke-width="0.75"/>
  <line x1="${x}" y1="${y + 60}" x2="${x + w}" y2="${y + 60}" stroke="#000" stroke-width="0.5"/>
  <line x1="${x}" y1="${y + 90}" x2="${x + w}" y2="${y + 90}" stroke="#000" stroke-width="0.5"/>
  <line x1="${x}" y1="${y + 120}" x2="${x + w}" y2="${y + 120}" stroke="#000" stroke-width="0.5"/>
  <line x1="${x + w / 2}" y1="${y + 60}" x2="${x + w / 2}" y2="${y + h}" stroke="#000" stroke-width="0.5"/>
  <text x="${x + w / 2}" y="${y + 22}" font-size="14" font-family="Arial" font-weight="bold" fill="#000" text-anchor="middle">${escapeXml(fields.project_name || 'Untitled Survey')}</text>
  <text x="${x + w / 2}" y="${y + 50}" font-size="9" font-family="Arial" fill="#333" text-anchor="middle">${escapeXml(fields.address || '')}</text>
  <text x="${x + 8}" y="${y + 78}" font-size="8" font-family="Arial" fill="#333">County: ${escapeXml(fields.county || '')}</text>
  <text x="${x + w / 2 + 8}" y="${y + 78}" font-size="8" font-family="Arial" fill="#333">State: ${escapeXml(fields.state || 'Texas')}</text>
  <text x="${x + 8}" y="${y + 108}" font-size="8" font-family="Arial" fill="#333">Date: ${escapeXml(fields.date || new Date().toLocaleDateString())}</text>
  <text x="${x + w / 2 + 8}" y="${y + 108}" font-size="8" font-family="Arial" fill="#333">Scale: ${escapeXml(fields.scale || '')}</text>
  <text x="${x + 8}" y="${y + 138}" font-size="8" font-family="Arial" fill="#333">Surveyor: ${escapeXml(fields.surveyor || '')}</text>
  <text x="${x + w / 2 + 8}" y="${y + 138}" font-size="8" font-family="Arial" fill="#333">Sheet: ${escapeXml(fields.sheet || '1 of 1')}</text>
  <text x="${x + 8}" y="${y + h - 6}" font-size="7" font-family="Arial" fill="#999">Generated by Starr Surveying AI Research Tool</text>
</g>`;
}

// ── North Arrow ──────────────────────────────────────────────────────────────

function renderNorthArrow(canvasWidth: number, canvasHeight: number): string {
  const x = canvasWidth - 60;
  const y = 60;

  return `<g class="north-arrow" transform="translate(${x}, ${y})">
  <line x1="0" y1="30" x2="0" y2="-25" stroke="#000" stroke-width="1.5"/>
  <polygon points="0,-30 -6,-18 0,-22 6,-18" fill="#000"/>
  <text x="0" y="-34" font-size="12" font-family="Arial" font-weight="bold" fill="#000" text-anchor="middle">N</text>
</g>`;
}

// ── Scale Bar ────────────────────────────────────────────────────────────────

function renderScaleBar(
  scale: number,
  units: string,
  canvasWidth: number,
  canvasHeight: number
): string {
  const x = 40;
  const y = canvasHeight - 40;

  // Determine a nice round bar length
  const barFeet = scale <= 50 ? 50 : scale <= 100 ? 100 : scale <= 200 ? 200 : 500;
  const barPixels = barFeet / (scale || 100) * 100;

  return `<g class="scale-bar" transform="translate(${x}, ${y})">
  <line x1="0" y1="0" x2="${barPixels}" y2="0" stroke="#000" stroke-width="1.5"/>
  <line x1="0" y1="-5" x2="0" y2="5" stroke="#000" stroke-width="1"/>
  <line x1="${barPixels}" y1="-5" x2="${barPixels}" y2="5" stroke="#000" stroke-width="1"/>
  <line x1="${barPixels / 2}" y1="-3" x2="${barPixels / 2}" y2="3" stroke="#000" stroke-width="0.5"/>
  <text x="0" y="15" font-size="7" font-family="Arial" fill="#000" text-anchor="middle">0</text>
  <text x="${barPixels}" y="15" font-size="7" font-family="Arial" fill="#000" text-anchor="middle">${barFeet} ${units}</text>
  <text x="${barPixels / 2}" y="-8" font-size="7" font-family="Arial" fill="#666" text-anchor="middle">Scale: 1" = ${scale}'</text>
</g>`;
}

// ── Feature Legend ───────────────────────────────────────────────────────────

const FEATURE_COLORS: Record<string, { label: string; stroke: string; dash?: string }> = {
  property_boundary: { label: 'Property Boundary', stroke: '#000000' },
  easement:          { label: 'Easement', stroke: '#CC0000', dash: '10,5' },
  setback:           { label: 'Setback Line', stroke: '#0066CC', dash: '5,5' },
  right_of_way:      { label: 'Right of Way', stroke: '#666666', dash: '15,5,5,5' },
  road:              { label: 'Road', stroke: '#8B4513' },
  building:          { label: 'Building', stroke: '#333333' },
  fence:             { label: 'Fence Line', stroke: '#228B22', dash: '4,4' },
  utility:           { label: 'Utility', stroke: '#FF8C00', dash: '8,3,2,3' },
  monument:          { label: 'Monument', stroke: '#CC0000' },
};

function renderFeatureLegend(elements: DrawingElement[]): string {
  const usedFeatures = new Set(elements.map(e => e.feature_class));
  const legendItems = Object.entries(FEATURE_COLORS)
    .filter(([key]) => usedFeatures.has(key as FeatureClass));

  if (legendItems.length === 0) return '';

  const x = 40;
  const y = 40;
  const lineH = 18;

  let svg = `<g class="legend" transform="translate(${x}, ${y})">`;
  svg += `<rect x="-8" y="-16" width="180" height="${legendItems.length * lineH + 28}" rx="4" fill="#FFFFFF" fill-opacity="0.9" stroke="#D1D5DB" stroke-width="0.5"/>`;
  svg += `<text x="0" y="-2" font-size="9" font-family="Arial" font-weight="bold" fill="#374151">Legend</text>`;

  legendItems.forEach(([, info], idx) => {
    const iy = idx * lineH + 16;
    svg += `<line x1="0" y1="${iy}" x2="25" y2="${iy}" stroke="${info.stroke}" stroke-width="2" stroke-dasharray="${info.dash || ''}"/>`;
    svg += `<text x="32" y="${iy + 4}" font-size="8" font-family="Arial" fill="#374151">${info.label}</text>`;
  });

  svg += '</g>';
  return svg;
}

// ── Confidence Color Bar ─────────────────────────────────────────────────────

function renderConfidenceBar(canvasWidth: number, canvasHeight: number): string {
  const x = canvasWidth - 200;
  const y = 40;
  const barWidth = 160;
  const barHeight = 12;

  const stops = [
    { offset: '0%', color: '#EF4444' },
    { offset: '25%', color: '#F97316' },
    { offset: '50%', color: '#F59E0B' },
    { offset: '75%', color: '#2563EB' },
    { offset: '100%', color: '#059669' },
  ];

  let svg = `<g class="confidence-bar" transform="translate(${x}, ${y})">`;
  svg += `<rect x="-8" y="-16" width="${barWidth + 16}" height="48" rx="4" fill="#FFFFFF" fill-opacity="0.9" stroke="#D1D5DB" stroke-width="0.5"/>`;
  svg += `<text x="0" y="-2" font-size="9" font-family="Arial" font-weight="bold" fill="#374151">Confidence</text>`;

  // Gradient bar
  svg += `<defs><linearGradient id="conf-gradient">`;
  for (const stop of stops) {
    svg += `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`;
  }
  svg += `</linearGradient></defs>`;
  svg += `<rect x="0" y="6" width="${barWidth}" height="${barHeight}" rx="2" fill="url(#conf-gradient)"/>`;

  // Labels
  svg += `<text x="0" y="${barHeight + 20}" font-size="7" font-family="Arial" fill="#6B7280">0%</text>`;
  svg += `<text x="${barWidth / 2}" y="${barHeight + 20}" font-size="7" font-family="Arial" fill="#6B7280" text-anchor="middle">50%</text>`;
  svg += `<text x="${barWidth}" y="${barHeight + 20}" font-size="7" font-family="Arial" fill="#6B7280" text-anchor="end">100%</text>`;
  svg += '</g>';

  return svg;
}

// ── XML Escape ───────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
