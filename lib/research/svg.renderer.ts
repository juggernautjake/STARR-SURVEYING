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

  // Defs: standard patterns + dynamic fill pattern instances
  parts.push(renderDefs(viewMode));
  parts.push(`<defs>${renderFillPatternDefs(elements)}</defs>`);

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

// ── Fill Pattern IDs ─────────────────────────────────────────────────────────

/**
 * Returns the SVG pattern ID for a given fillPattern key and feature class.
 * Each feature class gets its own uniquely-colored pattern instance.
 */
export function getFillPatternId(fillPattern: string, featureClass: string): string {
  const safe = featureClass.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `fp-${fillPattern}-${safe}`;
}

/**
 * Generate SVG <pattern> defs for fill patterns used by elements in this drawing.
 * Called once per render; patterns are keyed by (fillPattern, fillColor) combos.
 */
function renderFillPatternDefs(elements: DrawingElement[]): string {
  const seen = new Set<string>();
  const defs: string[] = [];

  for (const el of elements) {
    const fp = (el.style as ElementStyle & { fillPattern?: string; fillColor?: string }).fillPattern;
    if (!fp || fp === 'solid') continue;
    const color = (el.style as ElementStyle & { fillColor?: string }).fillColor || el.style.stroke || '#000000';
    const key = `${fp}::${color}::${el.feature_class}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const id = getFillPatternId(fp, el.feature_class);
    const esc = escapeXml(color);

    switch (fp) {
      case 'hatch-ne30': {
        // Diagonal lines at ~30° NE (northeast)
        defs.push(
          `<pattern id="${id}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(30)">` +
          `<line x1="0" y1="0" x2="0" y2="10" stroke="${esc}" stroke-width="1"/>` +
          `</pattern>`
        );
        break;
      }
      case 'hatch-nw30': {
        // Diagonal lines at ~30° NW (northwest) = rotate(-30) = rotate(150)
        defs.push(
          `<pattern id="${id}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(150)">` +
          `<line x1="0" y1="0" x2="0" y2="10" stroke="${esc}" stroke-width="1"/>` +
          `</pattern>`
        );
        break;
      }
      case 'dots-5': defs.push(renderDotPattern(id, esc, 14, 1.0)); break;
      case 'dots-10': defs.push(renderDotPattern(id, esc, 10, 1.2)); break;
      case 'dots-25': defs.push(renderDotPattern(id, esc, 8, 1.6)); break;
      case 'dots-50': defs.push(renderDotPattern(id, esc, 6, 2.0)); break;
      case 'dots-75': defs.push(renderDotPattern(id, esc, 5, 2.8)); break;
    }
  }

  return defs.join('\n');
}

function renderDotPattern(id: string, color: string, spacing: number, radius: number): string {
  return (
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${spacing}" height="${spacing}">` +
    `<circle cx="${spacing / 2}" cy="${spacing / 2}" r="${radius}" fill="${color}"/>` +
    `</pattern>`
  );
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
    ? ` data-element-id="${escapeXml(String(element.id))}" data-feature="${escapeXml(String(element.feature_class))}" data-confidence="${escapeXml(String(element.confidence_score ?? ''))}" role="button" tabindex="0"`
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
      // Resolve fill: pattern takes precedence over flat color.
      // getFillPatternId() already sanitizes the feature class, so no escapeXml needed.
      const fp = (style as ElementStyle & { fillPattern?: string }).fillPattern;
      const fill = fp && fp !== 'solid'
        ? `url(#${getFillPatternId(fp, element.feature_class)})`
        : (style.fill || 'none');
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
  // Scale symbol size based on stroke width (which was already scaled for canvas)
  const size = Math.max(8, style.strokeWidth * 3);
  const crosshairExtra = Math.max(3, size * 0.4);
  const crosshairStroke = Math.max(1, style.strokeWidth * 0.4);

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
    crosshair = `<line x1="${x - size - crosshairExtra}" y1="${y}" x2="${x + size + crosshairExtra}" y2="${y}" stroke="${style.stroke}" stroke-width="${crosshairStroke}"/>` +
      `<line x1="${x}" y1="${y - size - crosshairExtra}" x2="${x}" y2="${y + size + crosshairExtra}" stroke="${style.stroke}" stroke-width="${crosshairStroke}"/>`;
  }

  // Monument label — scale font size with symbol
  const label = attrs.display as string || '';
  const labelFontSize = Math.max(14, size * 1.8);
  const labelSvg = label
    ? `<text x="${x}" y="${y + size + labelFontSize + 4}" font-size="${labelFontSize}" font-family="Arial" fill="#333" text-anchor="middle">${escapeXml(label)}</text>`
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
      // User-modified elements: purple to clearly show tampering
      if (element.user_modified) {
        return {
          ...baseStyle,
          stroke: '#7C3AED', // purple
          strokeWidth: baseStyle.strokeWidth + 0.5,
          fill: element.style.fill !== 'none' ? '#7C3AED' : 'none',
          opacity: 1,
        };
      }
      // Color based on confidence score
      const color = getConfidenceColor(element.confidence_score);
      // Stroke width scales with confidence — higher confidence = thicker
      const widthBoost = element.confidence_score >= 90 ? 0.5
        : element.confidence_score < 40 ? -0.25 : 0;
      // Opacity varies: low confidence elements appear more transparent
      const confOpacity = element.confidence_score >= 75 ? 1
        : element.confidence_score >= 55 ? 0.85
        : element.confidence_score >= 35 ? 0.65
        : 0.45;
      return {
        ...baseStyle,
        stroke: color,
        strokeWidth: Math.max(0.5, baseStyle.strokeWidth + widthBoost),
        fill: element.style.fill !== 'none' ? color : 'none',
        opacity: confOpacity,
      };
    }

    case 'discrepancy': {
      // Highlight elements with discrepancies
      const hasDisc = element.discrepancy_ids.length > 0;
      // Also highlight user-modified elements in discrepancy view
      if (element.user_modified && !hasDisc) {
        return {
          ...baseStyle,
          stroke: '#7C3AED',
          strokeWidth: baseStyle.strokeWidth + 0.5,
          opacity: 0.8,
        };
      }
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
  const s = Math.max(1, canvasWidth / 1200);
  const w = Math.round(400 * s);
  const h = Math.round(160 * s);
  const x = canvasWidth - w - Math.round(20 * s);
  const y = canvasHeight - h - Math.round(20 * s);

  const fields = titleBlock.fields as Record<string, string> || {};
  const fs = (base: number) => Math.round(base * s);
  const sw = Math.max(0.5, s * 0.5);

  return `<g class="title-block">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" stroke="#000" stroke-width="${sw * 3}"/>
  <line x1="${x}" y1="${y + fs(30)}" x2="${x + w}" y2="${y + fs(30)}" stroke="#000" stroke-width="${sw * 1.5}"/>
  <line x1="${x}" y1="${y + fs(60)}" x2="${x + w}" y2="${y + fs(60)}" stroke="#000" stroke-width="${sw}"/>
  <line x1="${x}" y1="${y + fs(90)}" x2="${x + w}" y2="${y + fs(90)}" stroke="#000" stroke-width="${sw}"/>
  <line x1="${x}" y1="${y + fs(120)}" x2="${x + w}" y2="${y + fs(120)}" stroke="#000" stroke-width="${sw}"/>
  <line x1="${x + w / 2}" y1="${y + fs(60)}" x2="${x + w / 2}" y2="${y + h}" stroke="#000" stroke-width="${sw}"/>
  <text x="${x + w / 2}" y="${y + fs(22)}" font-size="${fs(14)}" font-family="Arial" font-weight="bold" fill="#000" text-anchor="middle">${escapeXml(fields.project_name || 'Untitled Survey')}</text>
  <text x="${x + w / 2}" y="${y + fs(50)}" font-size="${fs(9)}" font-family="Arial" fill="#333" text-anchor="middle">${escapeXml(fields.address || '')}</text>
  <text x="${x + fs(8)}" y="${y + fs(78)}" font-size="${fs(8)}" font-family="Arial" fill="#333">County: ${escapeXml(fields.county || '')}</text>
  <text x="${x + w / 2 + fs(8)}" y="${y + fs(78)}" font-size="${fs(8)}" font-family="Arial" fill="#333">State: ${escapeXml(fields.state || 'Texas')}</text>
  <text x="${x + fs(8)}" y="${y + fs(108)}" font-size="${fs(8)}" font-family="Arial" fill="#333">Date: ${escapeXml(fields.date || new Date().toLocaleDateString())}</text>
  <text x="${x + w / 2 + fs(8)}" y="${y + fs(108)}" font-size="${fs(8)}" font-family="Arial" fill="#333">Scale: ${escapeXml(fields.scale || '')}</text>
  <text x="${x + fs(8)}" y="${y + fs(138)}" font-size="${fs(8)}" font-family="Arial" fill="#333">Surveyor: ${escapeXml(fields.surveyor || '')}</text>
  <text x="${x + w / 2 + fs(8)}" y="${y + fs(138)}" font-size="${fs(8)}" font-family="Arial" fill="#333">Sheet: ${escapeXml(fields.sheet || '1 of 1')}</text>
  <text x="${x + fs(8)}" y="${y + h - fs(6)}" font-size="${fs(7)}" font-family="Arial" fill="#999">Generated by Starr Surveying AI Research Tool</text>
</g>`;
}

// ── North Arrow ──────────────────────────────────────────────────────────────

function renderNorthArrow(canvasWidth: number, canvasHeight: number): string {
  // Scale north arrow proportional to canvas size so it's visible
  const s = Math.max(1, canvasWidth / 1200);
  const x = canvasWidth - Math.round(60 * s);
  const y = Math.round(60 * s);

  return `<g class="north-arrow" transform="translate(${x}, ${y}) scale(${s})">
  <line x1="0" y1="30" x2="0" y2="-25" stroke="#000" stroke-width="2"/>
  <polygon points="0,-30 -6,-18 0,-22 6,-18" fill="#000"/>
  <text x="0" y="-34" font-size="14" font-family="Arial" font-weight="bold" fill="#000" text-anchor="middle">N</text>
</g>`;
}

// ── Scale Bar ────────────────────────────────────────────────────────────────

function renderScaleBar(
  scale: number,
  units: string,
  canvasWidth: number,
  canvasHeight: number
): string {
  const s = Math.max(1, canvasWidth / 1200);
  const x = Math.round(40 * s);
  const y = canvasHeight - Math.round(40 * s);

  // Determine a nice round bar length
  const barFeet = scale <= 50 ? 50 : scale <= 100 ? 100 : scale <= 200 ? 200 : 500;
  const barPixels = barFeet / (scale || 100) * 100 * s;
  const sw = Math.max(1.5, s);
  const fs = Math.round(8 * s);

  return `<g class="scale-bar" transform="translate(${x}, ${y})">
  <line x1="0" y1="0" x2="${barPixels}" y2="0" stroke="#000" stroke-width="${sw}"/>
  <line x1="0" y1="${-5 * s}" x2="0" y2="${5 * s}" stroke="#000" stroke-width="${sw * 0.66}"/>
  <line x1="${barPixels}" y1="${-5 * s}" x2="${barPixels}" y2="${5 * s}" stroke="#000" stroke-width="${sw * 0.66}"/>
  <line x1="${barPixels / 2}" y1="${-3 * s}" x2="${barPixels / 2}" y2="${3 * s}" stroke="#000" stroke-width="${sw * 0.33}"/>
  <text x="0" y="${15 * s}" font-size="${fs}" font-family="Arial" fill="#000" text-anchor="middle">0</text>
  <text x="${barPixels}" y="${15 * s}" font-size="${fs}" font-family="Arial" fill="#000" text-anchor="middle">${barFeet} ${units}</text>
  <text x="${barPixels / 2}" y="${-8 * s}" font-size="${fs}" font-family="Arial" fill="#666" text-anchor="middle">Scale: 1" = ${scale}'</text>
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

  // User-modified indicator
  svg += `<rect x="0" y="${barHeight + 26}" width="12" height="8" rx="1" fill="#7C3AED"/>`;
  svg += `<text x="16" y="${barHeight + 33}" font-size="7" font-family="Arial" fill="#6B7280">= User Modified</text>`;

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
