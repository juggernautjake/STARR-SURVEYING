// lib/cad/styles/linetype-renderer.ts — Render line types with dash patterns and inline symbols
import type { LineTypeDefinition, InlineSymbolConfig } from './types';
import { getSymbolById } from './symbol-library';
import { renderSymbol } from './symbol-renderer';

/**
 * Pixels per mm at screen resolution. Used to convert mm dash pattern values
 * to screen-space pixels. This is an approximation assuming ~96 DPI screen.
 */
export const MM_TO_PX = 3.78;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderLineWithType(
  g: any,
  lineType: LineTypeDefinition,
  screenPoints: { x: number; y: number }[],
  color: number,
  weight: number,
  opacity: number,
  drawingScale: number,
  zoom: number,
): void {
  if (!g || !lineType || screenPoints.length < 2) return;

  // Filter out any NaN or infinite coordinates
  const validPoints = screenPoints.filter(p => isFinite(p.x) && isFinite(p.y));
  if (validPoints.length < 2) return;

  const safeWeight = Math.max(0, isFinite(weight) ? weight : 1);
  const safeOpacity = Math.max(0, Math.min(1, isFinite(opacity) ? opacity : 1));

  if (lineType.dashPattern.length === 0 && lineType.specialRenderer === 'NONE' && lineType.inlineSymbols.length === 0) {
    // Fast path: solid line
    g.lineStyle(safeWeight, color, safeOpacity);
    g.moveTo(validPoints[0].x, validPoints[0].y);
    for (let i = 1; i < validPoints.length; i++) {
      g.lineTo(validPoints[i].x, validPoints[i].y);
    }
  } else if (lineType.specialRenderer === 'WAVY') {
    renderWavyLine(g, validPoints, color, safeWeight, safeOpacity);
  } else {
    if (lineType.dashPattern.length > 0) {
      renderDashedLine(g, validPoints, lineType.dashPattern, color, safeWeight, safeOpacity, zoom);
    } else {
      g.lineStyle(safeWeight, color, safeOpacity);
      g.moveTo(validPoints[0].x, validPoints[0].y);
      for (let i = 1; i < validPoints.length; i++) {
        g.lineTo(validPoints[i].x, validPoints[i].y);
      }
    }
  }

  // Render inline symbols (LOD: skip if interval < 6px)
  for (const config of lineType.inlineSymbols) {
    renderInlineSymbols(g, validPoints, config, color, safeOpacity, drawingScale, zoom);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderDashedLine(
  g: any,
  points: { x: number; y: number }[],
  pattern: number[],
  color: number,
  weight: number,
  opacity: number,
  zoom: number,
): void {
  if (pattern.length === 0) return;

  // Convert mm dash-pattern values to screen pixels using zoom-aware scaling.
  // At zoom=1 (100%), 1 unit = 1 screen pixel; MM_TO_PX converts mm → px.
  // Clamp to a minimum of 1px per dash so the line is always visible.
  const scale = Math.max(zoom * MM_TO_PX, 0.1);
  const screenPattern = pattern.map(v => Math.max(v * scale, 1));
  g.lineStyle(weight, color, opacity);

  let patternIdx = 0;
  let patternProgress = 0;
  let drawing = true;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (segLen < 0.001) continue;
    const dx = (p1.x - p0.x) / segLen;
    const dy = (p1.y - p0.y) / segLen;

    let traveled = 0;
    let cx = p0.x, cy = p0.y;

    if (drawing) g.moveTo(cx, cy);

    while (traveled < segLen) {
      const remaining = screenPattern[patternIdx] - patternProgress;
      const segRemaining = segLen - traveled;
      const step = Math.min(remaining, segRemaining);

      cx += dx * step;
      cy += dy * step;
      traveled += step;
      patternProgress += step;

      if (drawing) g.lineTo(cx, cy);

      if (patternProgress >= screenPattern[patternIdx] - 0.0001) {
        patternProgress = 0;
        patternIdx = (patternIdx + 1) % screenPattern.length;
        drawing = !drawing;
        if (drawing) g.moveTo(cx, cy);
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderInlineSymbols(
  g: any,
  points: { x: number; y: number }[],
  config: InlineSymbolConfig,
  lineColor: number,
  opacity: number,
  drawingScale: number,
  zoom: number,
): void {
  let intervalPx: number;
  if (config.intervalMode === 'SCALE_DEPENDENT') {
    const scaleFactor = config.scaleReferenceScale / Math.max(Math.abs(drawingScale), 1);
    const intervalFeet = config.scaleReferenceInterval * scaleFactor;
    intervalPx = intervalFeet * zoom;
  } else {
    intervalPx = config.interval * zoom;
  }

  const sizePx = Math.max(config.symbolSize * MM_TO_PX, 0.5);
  // Enforce a minimum interval so symbols never overlap catastrophically
  const minInterval = Math.max(sizePx * 2, 6);
  intervalPx = Math.max(intervalPx, minInterval);

  const symbolDef = getSymbolById(config.symbolId);
  if (!symbolDef) return;

  // Start half an interval in so symbols are centred along the line
  let distAccum = intervalPx / 2;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (segLen < 0.001) {
      // Zero-length segment: don't advance distAccum so we don't lose our position
      continue;
    }
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);

    while (distAccum <= segLen) {
      const t = distAccum / segLen;
      const sx = p0.x + (p1.x - p0.x) * t;
      const sy = p0.y + (p1.y - p0.y) * t;

      let rotation = 0;
      if (config.symbolRotation === 'ALONG_LINE') rotation = angle * 180 / Math.PI;
      else if (config.symbolRotation === 'PERPENDICULAR') rotation = (angle * 180 / Math.PI) + 90;

      const perpAngle = angle + Math.PI / 2;
      let ox = 0, oy = 0;
      if (config.side === 'LEFT' || config.side === 'RIGHT') {
        const sign = config.side === 'LEFT' ? -1 : 1;
        const offsetPx = sign * sizePx * 0.8;
        ox = Math.cos(perpAngle) * offsetPx;
        oy = Math.sin(perpAngle) * offsetPx;
      }

      renderSymbol(g, symbolDef, sx + ox, sy + oy, sizePx, rotation, lineColor, opacity);

      if (config.side === 'BOTH') {
        const offsetPx = sizePx * 0.8;
        renderSymbol(g, symbolDef,
          sx - Math.cos(perpAngle) * offsetPx,
          sy - Math.sin(perpAngle) * offsetPx,
          sizePx, rotation, lineColor, opacity);
      }

      distAccum += intervalPx;
    }
    // Carry over the remaining fractional distance to the next segment
    distAccum = Math.max(distAccum - segLen, 0);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderWavyLine(
  g: any,
  points: { x: number; y: number }[],
  color: number,
  weight: number,
  opacity: number,
): void {
  g.lineStyle(weight, color, opacity);
  // Clamp amplitude so very thick lines don't produce absurdly large waves
  const amplitude = Math.min(weight * 3, 8);
  const wavelength = Math.max(weight * 12, 4);
  const STEP = 3;
  let totalDist = 0;
  let firstPoint = true;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (segLen < 0.001) continue;
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);
    const steps = Math.ceil(segLen / STEP);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const bx = p0.x + (p1.x - p0.x) * t;
      const by = p0.y + (p1.y - p0.y) * t;
      const wave = Math.sin((totalDist + segLen * t) / wavelength * Math.PI * 2) * amplitude;
      const wx = bx + perpX * wave;
      const wy = by + perpY * wave;
      if (firstPoint) {
        g.moveTo(wx, wy);
        firstPoint = false;
      } else {
        g.lineTo(wx, wy);
      }
    }
    totalDist += segLen;
  }
}
