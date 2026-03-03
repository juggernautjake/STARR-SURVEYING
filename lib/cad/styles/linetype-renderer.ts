// lib/cad/styles/linetype-renderer.ts — Render line types with dash patterns and inline symbols
import type { LineTypeDefinition, InlineSymbolConfig } from './types';
import { getSymbolById } from './symbol-library';
import { renderSymbol } from './symbol-renderer';

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
  if (screenPoints.length < 2) return;

  if (lineType.dashPattern.length === 0 && lineType.specialRenderer === 'NONE' && lineType.inlineSymbols.length === 0) {
    // Fast path: solid line
    g.lineStyle(weight, color, opacity);
    g.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i++) {
      g.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
  } else if (lineType.specialRenderer === 'WAVY') {
    renderWavyLine(g, screenPoints, color, weight, opacity);
  } else {
    if (lineType.dashPattern.length > 0) {
      renderDashedLine(g, screenPoints, lineType.dashPattern, color, weight, opacity);
    } else {
      g.lineStyle(weight, color, opacity);
      g.moveTo(screenPoints[0].x, screenPoints[0].y);
      for (let i = 1; i < screenPoints.length; i++) {
        g.lineTo(screenPoints[i].x, screenPoints[i].y);
      }
    }
  }

  // Render inline symbols (LOD: skip if interval < 6px)
  for (const config of lineType.inlineSymbols) {
    renderInlineSymbols(g, screenPoints, config, color, opacity, drawingScale, zoom);
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
): void {
  // Convert mm pattern to screen pixels (approx 2.5px per mm)
  const screenPattern = pattern.map(v => v * 2.5);
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
    const scaleFactor = config.scaleReferenceScale / Math.max(drawingScale, 1);
    const intervalFeet = config.scaleReferenceInterval * scaleFactor;
    intervalPx = intervalFeet * zoom;
  } else {
    intervalPx = config.interval * zoom;
  }

  const sizePx = config.symbolSize * 2.5;
  const minInterval = Math.max(sizePx * 3, 6);
  intervalPx = Math.max(intervalPx, minInterval);

  const symbolDef = getSymbolById(config.symbolId);
  if (!symbolDef) return;

  let distAccum = intervalPx / 2;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (segLen < 0.001) continue;
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);

    while (distAccum <= segLen) {
      const t = distAccum / segLen;
      const sx = p0.x + (p1.x - p0.x) * t;
      const sy = p0.y + (p1.y - p0.y) * t;

      let rotation = 0;
      if (config.symbolRotation === 'ALONG_LINE') rotation = angle * 180 / Math.PI;
      else if (config.symbolRotation === 'PERPENDICULAR') rotation = (angle * 180 / Math.PI) + 90;

      let ox = 0, oy = 0;
      if (config.side !== 'CENTER' && config.side !== 'BOTH') {
        const perpAngle = angle + Math.PI / 2;
        const offsetPx = (config.side === 'LEFT' ? -1 : 1) * sizePx * 0.8;
        ox = Math.cos(perpAngle) * offsetPx;
        oy = Math.sin(perpAngle) * offsetPx;
      }

      renderSymbol(g, symbolDef, sx + ox, sy + oy, sizePx, rotation, lineColor, opacity);

      if (config.side === 'BOTH') {
        const perpAngle = angle + Math.PI / 2;
        const offsetPx = sizePx * 0.8;
        renderSymbol(g, symbolDef,
          sx - Math.cos(perpAngle) * offsetPx,
          sy - Math.sin(perpAngle) * offsetPx,
          sizePx, rotation, lineColor, opacity);
      }

      distAccum += intervalPx;
    }
    distAccum -= segLen;
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
  const amplitude = weight * 3;
  const wavelength = weight * 12;
  const STEP = 3;
  let totalDist = 0;

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
      const wave = Math.sin((totalDist + segLen * t) / Math.max(wavelength, 1) * Math.PI * 2) * amplitude;
      const wx = bx + perpX * wave;
      const wy = by + perpY * wave;
      if (i === 0 && s === 0) g.moveTo(wx, wy);
      else g.lineTo(wx, wy);
    }
    totalDist += segLen;
  }
}
