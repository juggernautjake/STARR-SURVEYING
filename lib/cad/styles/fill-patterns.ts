// lib/cad/styles/fill-patterns.ts
//
// Slice 235 of cad-label-backgrounds-and-textured-fills-2026-05-30.md.
// Pure-helper module that generates the per-frame primitives
// (dots + line segments) used by the closed-shape texture render
// path (Slice 236). Stays free of Pixi so it can be unit-tested with
// fixed seeds and re-used for SVG export later.

import type { FillPattern } from '../types';

export type Point2D = { x: number; y: number };

/** A single dot in a stipple fill — center + radius in screen pixels. */
export interface PatternDot {
  x: number;
  y: number;
  r: number;
}

/** A line segment in a hatch fill — start + end in screen pixels. */
export interface PatternLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Deterministic seedable RNG so test fixtures stay stable. */
export class SeededRng {
  private state: number;
  constructor(seed: number) {
    // Force non-zero state — mulberry32 collapses to 0 if seeded at 0.
    this.state = (seed | 0) || 0x9e3779b9;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Standard-normal sample via Box-Muller. */
  gaussian(mean = 0, stdDev = 1): number {
    const u = Math.max(this.next(), Number.EPSILON);
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + stdDev * z;
  }
}

export interface FillPatternConfig {
  /** Pattern type — picks the helper. */
  pattern: FillPattern;
  /** Density multiplier, 0.25 – 4. 1 = baseline spacing. */
  density: number;
  /** Deterministic seed (per-feature; recommend a hash of feature id). */
  seed: number;
  /** cad-fills Slice 1 — thickness multiplier, 0.25 – 4. 1 = baseline.
   *  Scales dot radius for the dot/gravel/sand families. Hatch / brick
   *  / wave stroke weight is applied by the render path via
   *  `patternLineWeight(scale)`. Optional → treated as 1. */
  scale?: number;
  /** cad-fill-rotation Slice 1 — pattern rotation in DEGREES around
   *  the bounding-box center. 0 (default) = the historical baseline
   *  (so existing drawings render unchanged). Rotation applies to
   *  every pattern (dots/gravel/hatch/brick/wave), so the surveyor
   *  can spin a brick course or a wave row to any angle without
   *  reaching for a different pattern type. */
  angle?: number;
  /** cad-fill-stacking Slice 3 — explicit brick dimensions in px.
   *  Optional ⇒ derived from density. Lets the user tune the brick
   *  width + height independently. */
  brickWidth?: number;
  brickHeight?: number;
  /** cad-fill-stacking Slice 3 — explicit wave dimensions in px.
   *  Optional ⇒ derived from density. `waveAmplitude` is wave height
   *  (peak deviation from the row centerline); `wavePeriod` is the
   *  wavelength (one full cycle). */
  waveAmplitude?: number;
  wavePeriod?: number;
}

/** Clamp a 0.25–4 multiplier; non-finite / non-positive → 1. */
function clampMultiplier(v: number | undefined): number {
  if (!Number.isFinite(v) || (v as number) <= 0) return 1;
  return Math.max(0.25, Math.min(4, v as number));
}

/** cad-fills Slice 1 — stroke weight (screen px) for hatch / brick /
 *  wave fills at a given thickness `scale`. Baseline 0.6 px at scale 1
 *  (the historical hardcoded weight). Pure so the render path + tests
 *  share one source of truth. */
export function patternLineWeight(scale: number | undefined): number {
  return 0.6 * clampMultiplier(scale);
}

/** Per-variant gravel tuning (mean dot radius, size jitter, and a
 *  cell-size multiplier that spaces dots out (>1) or packs them
 *  tighter (<1)). */
export interface GravelOpts {
  meanRadius: number;
  radiusStdDev: number;
  cellScale: number;
}

/** The three gravel-family presets the picker offers. DOT_GRAVEL is
 *  the original. */
export const GRAVEL_PRESETS: Record<'DOT_GRAVEL' | 'DOT_GRAVEL_FINE' | 'DOT_GRAVEL_COARSE' | 'DOT_SAND', GravelOpts> = {
  DOT_GRAVEL:        { meanRadius: 1.5, radiusStdDev: 0.6,  cellScale: 1 },
  DOT_GRAVEL_FINE:   { meanRadius: 1.0, radiusStdDev: 0.35, cellScale: 0.72 },
  DOT_GRAVEL_COARSE: { meanRadius: 2.4, radiusStdDev: 0.9,  cellScale: 1.5 },
  DOT_SAND:          { meanRadius: 0.7, radiusStdDev: 0.25, cellScale: 0.5 },
};

/** DOT_UNIFORM — fixed-radius dots on a jittered grid. Returns dots in
 *  screen-pixel coordinates spanning [0, width] x [0, height]. */
export function generateDotUniform(
  width: number,
  height: number,
  density: number,
  dotRadius: number,
  seed = 1,
  scale = 1,
): PatternDot[] {
  if (width <= 0 || height <= 0) return [];
  const rng = new SeededRng(seed);
  // Baseline spacing — every 16 px at density 1, scaled by density.
  const spacing = Math.max(4, 16 / Math.max(0.25, Math.min(4, density)));
  // cad-fills Slice 1 — thickness multiplier scales the dot radius.
  const r = Math.max(0.2, dotRadius * clampMultiplier(scale));
  const dots: PatternDot[] = [];
  for (let y = spacing * 0.5; y < height; y += spacing) {
    for (let x = spacing * 0.5; x < width; x += spacing) {
      // Slight grid jitter so the result reads as natural-ish stipple.
      const jx = x + (rng.next() - 0.5) * spacing * 0.15;
      const jy = y + (rng.next() - 0.5) * spacing * 0.15;
      dots.push({ x: jx, y: jy, r });
    }
  }
  return dots;
}

/** DOT_GRAVEL — Poisson-disk-ish sampling with Gaussian-jittered radii
 *  so the result looks like loose gravel rather than a uniform
 *  stipple. The user explicitly asked for "a slight range of sized
 *  dots that are spaced out — not totally random". `seed` makes the
 *  layout deterministic per feature so re-renders don't flicker. */
export function generateDotGravel(
  width: number,
  height: number,
  density: number,
  seed = 1,
  opts: GravelOpts = GRAVEL_PRESETS.DOT_GRAVEL,
  scale = 1,
): PatternDot[] {
  if (width <= 0 || height <= 0) return [];
  const rng = new SeededRng(seed);
  // Baseline: target ~1 dot per 64 px² at density 1, tuned per variant
  // via opts.cellScale (FINE packs tighter, COARSE spaces out).
  const clampedDensity = Math.max(0.25, Math.min(4, density));
  const targetCellSize = Math.max(4, (14 / clampedDensity) * opts.cellScale);
  // cad-fills Slice 1 — thickness multiplier scales dot radii.
  const thickness = clampMultiplier(scale);
  const meanRadius = opts.meanRadius * thickness; // px
  const radiusStdDev = opts.radiusStdDev * thickness; // px — "slight range of sizes"

  // Bridson-flavored Poisson-disk: walk a coarse grid and reject any
  // candidate too close to an existing accepted dot.
  const dots: PatternDot[] = [];
  // Each grid cell holds at most a few dots — use a flat map for speed.
  const cellSize = targetCellSize;
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const grid: (PatternDot | null)[] = new Array(cols * rows).fill(null);
  const cellIdx = (cx: number, cy: number) => cy * cols + cx;

  const minDist = targetCellSize * 0.85;
  const tooClose = (cx: number, cy: number, x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) {
      const ry = cy + dy;
      if (ry < 0 || ry >= rows) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const rx = cx + dx;
        if (rx < 0 || rx >= cols) continue;
        const existing = grid[cellIdx(rx, ry)];
        if (!existing) continue;
        const ddx = existing.x - x;
        const ddy = existing.y - y;
        if (ddx * ddx + ddy * ddy < minDist * minDist) return true;
      }
    }
    return false;
  };

  // Seed pass — walk cells in order, try one jittered candidate each.
  const samplesPerCell = Math.max(1, Math.round(2 * clampedDensity));
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      for (let s = 0; s < samplesPerCell; s++) {
        const x = (cx + rng.next()) * cellSize;
        const y = (cy + rng.next()) * cellSize;
        if (x >= width || y >= height) continue;
        if (tooClose(cx, cy, x, y)) continue;
        const r = Math.max(0.4, rng.gaussian(meanRadius, radiusStdDev));
        const dot: PatternDot = { x, y, r };
        grid[cellIdx(cx, cy)] = dot;
        dots.push(dot);
        break;
      }
    }
  }
  return dots;
}

/** Generic hatch — parallel lines at `angleDeg` (0 = horizontal,
 *  90 = vertical, 45 = diagonal-right). `spacing` is the perpendicular
 *  distance between adjacent lines in screen px. The line set extends
 *  from one corner of the bounding rect to the other so the caller can
 *  mask to the polygon shape. */
export function generateHatchLines(
  width: number,
  height: number,
  angleDeg: number,
  spacing: number,
): PatternLine[] {
  if (width <= 0 || height <= 0 || spacing <= 0) return [];
  const lines: PatternLine[] = [];
  const θ = (angleDeg * Math.PI) / 180;
  const cosθ = Math.cos(θ);
  const sinθ = Math.sin(θ);
  // Diagonal span: hatch lines span the rect's longest projection.
  const span = Math.abs(width * cosθ) + Math.abs(height * sinθ);
  const halfSpan = span / 2;
  const cx = width / 2;
  const cy = height / 2;
  // Walk perpendicular to the line direction.
  const perpX = -sinθ;
  const perpY = cosθ;
  // Run far enough that the line set covers all corners.
  const max = Math.ceil(Math.max(width, height) / spacing) + 2;
  for (let i = -max; i <= max; i++) {
    const offset = i * spacing;
    const baseX = cx + perpX * offset;
    const baseY = cy + perpY * offset;
    lines.push({
      x1: baseX - cosθ * halfSpan,
      y1: baseY - sinθ * halfSpan,
      x2: baseX + cosθ * halfSpan,
      y2: baseY + sinθ * halfSpan,
    });
  }
  return lines;
}

/** BRICK — alternating offset rectangles drawn as a line set.
 *  Returns the line segments forming the brick courses.
 *
 *  cad-fill-stacking Slice 3 — `brickWidth` / `brickHeight` are
 *  optional explicit overrides (in screen px). Either omitted ⇒
 *  derived from density the same as before, so existing drawings
 *  render unchanged. Both clamped to a sensible minimum so a slider
 *  pulled to zero doesn't crash the loop. */
export function generateBrickLines(
  width: number,
  height: number,
  density: number,
  brickWidth?: number,
  brickHeight?: number,
): PatternLine[] {
  if (width <= 0 || height <= 0) return [];
  const clamped = Math.max(0.25, Math.min(4, density));
  const courseHeight = Number.isFinite(brickHeight) && (brickHeight as number) >= 1
    ? Math.max(1, brickHeight as number)
    : Math.max(6, 12 / clamped);
  const courseWidth = Number.isFinite(brickWidth) && (brickWidth as number) >= 1
    ? Math.max(1, brickWidth as number)
    : courseHeight * 2;
  const lines: PatternLine[] = [];
  let row = 0;
  for (let y = 0; y <= height; y += courseHeight) {
    // Horizontal course line
    lines.push({ x1: 0, y1: y, x2: width, y2: y });
    // Vertical bricks, offset by half-brick every other row.
    const offset = row % 2 === 0 ? 0 : courseWidth / 2;
    for (let x = offset; x <= width; x += courseWidth) {
      const yEnd = Math.min(height, y + courseHeight);
      lines.push({ x1: x, y1: y, x2: x, y2: yEnd });
    }
    row++;
  }
  return lines;
}

/** WAVE — repeating sinusoidal rows. Returned as polylines flattened
 *  to a line set so the caller can stroke them through Graphics.
 *
 *  cad-fill-stacking Slice 3 — `amplitude` / `period` are optional
 *  explicit overrides (px). When omitted ⇒ derived from density the
 *  same as before. `amplitude` is wave HEIGHT (peak deviation from the
 *  row centerline); `period` is the wavelength (one full cycle). */
export function generateWaveLines(
  width: number,
  height: number,
  density: number,
  amplitude?: number,
  period?: number,
): PatternLine[] {
  if (width <= 0 || height <= 0) return [];
  const clamped = Math.max(0.25, Math.min(4, density));
  const rowSpacing = Math.max(8, 18 / clamped);
  const amp = Number.isFinite(amplitude) && (amplitude as number) >= 0
    ? Math.max(0, amplitude as number)
    : rowSpacing * 0.35;
  const wavelength = Number.isFinite(period) && (period as number) >= 1
    ? Math.max(1, period as number)
    : rowSpacing * 3.5;
  const segmentsPerWave = 12;
  const dx = wavelength / segmentsPerWave;
  const lines: PatternLine[] = [];
  for (let y = rowSpacing; y < height; y += rowSpacing) {
    let prev: Point2D = { x: 0, y: y + Math.sin(0) * amp };
    for (let x = dx; x <= width; x += dx) {
      const next = { x, y: y + Math.sin((x / wavelength) * Math.PI * 2) * amp };
      lines.push({ x1: prev.x, y1: prev.y, x2: next.x, y2: next.y });
      prev = next;
    }
  }
  return lines;
}

/** Top-level dispatcher used by the Pixi render path (Slice 236).
 *  Returns the dot set, the line set, or both — caller decides how
 *  each gets drawn (drawCircle for dots, moveTo/lineTo for lines).
 *  All output is in screen pixels relative to the bounding rect's
 *  top-left (0, 0). The caller is responsible for masking the output
 *  to the polygon's actual shape. */
export interface GeneratedPattern {
  dots: PatternDot[];
  lines: PatternLine[];
}

/** Generate the raw (unrotated) pattern primitives over an arbitrary
 *  rect. Split out so the rotated dispatcher can call it on an
 *  oversized rect and then transform primitives back into the
 *  original (width × height) frame. */
function rawPattern(
  w: number,
  h: number,
  config: FillPatternConfig,
  density: number,
  scale: number | undefined,
): GeneratedPattern {
  switch (config.pattern) {
    case 'SOLID':
    case 'NONE':
      return { dots: [], lines: [] };
    case 'DOT_UNIFORM':
      return { dots: generateDotUniform(w, h, density, 1.5, config.seed, scale), lines: [] };
    case 'DOT_GRAVEL':
      return { dots: generateDotGravel(w, h, density, config.seed, GRAVEL_PRESETS.DOT_GRAVEL, scale), lines: [] };
    case 'DOT_GRAVEL_FINE':
      return { dots: generateDotGravel(w, h, density, config.seed, GRAVEL_PRESETS.DOT_GRAVEL_FINE, scale), lines: [] };
    case 'DOT_GRAVEL_COARSE':
      return { dots: generateDotGravel(w, h, density, config.seed, GRAVEL_PRESETS.DOT_GRAVEL_COARSE, scale), lines: [] };
    case 'DOT_SAND':
      return { dots: generateDotGravel(w, h, density, config.seed, GRAVEL_PRESETS.DOT_SAND, scale), lines: [] };
    case 'DIAGONAL_LEFT':
      return { dots: [], lines: generateHatchLines(w, h, -45, hatchSpacing(density)) };
    case 'DIAGONAL_RIGHT':
      return { dots: [], lines: generateHatchLines(w, h, 45, hatchSpacing(density)) };
    case 'CROSSHATCH':
      return {
        dots: [],
        lines: [
          ...generateHatchLines(w, h, 45, hatchSpacing(density)),
          ...generateHatchLines(w, h, -45, hatchSpacing(density)),
        ],
      };
    case 'HORIZONTAL_LINES':
      return { dots: [], lines: generateHatchLines(w, h, 0, hatchSpacing(density)) };
    case 'VERTICAL_LINES':
      return { dots: [], lines: generateHatchLines(w, h, 90, hatchSpacing(density)) };
    // cad-fill-rotation Slice 4 — canonical hatch. Same base as
    // HORIZONTAL_LINES (0°); the dispatcher's rotation wrapper
    // applies `config.angle` to spin it anywhere. The 4 legacy
    // hatch ids stay above for back-compat with saved drawings.
    case 'LINES':
      return { dots: [], lines: generateHatchLines(w, h, 0, hatchSpacing(density)) };
    case 'BRICK':
      return { dots: [], lines: generateBrickLines(w, h, density, config.brickWidth, config.brickHeight) };
    case 'WAVE':
      return { dots: [], lines: generateWaveLines(w, h, density, config.waveAmplitude, config.wavePeriod) };
    default:
      return { dots: [], lines: [] };
  }
}

/** cad-fill-rotation Slice 1 — wrap any pattern with a rotation
 *  around the original (width × height) rect's center. We oversize
 *  the generation rect to the rect's diagonal so a rotated pattern
 *  still covers the polygon mask with no exposed wedges, then map
 *  the primitives back through (translate to oversize-origin →
 *  rotate around original center → translate by inset). 0° (no
 *  rotation) takes the fast path so existing renders are unchanged
 *  to the pixel. */
export function generateFillPattern(
  width: number,
  height: number,
  config: FillPatternConfig,
): GeneratedPattern {
  const density = Number.isFinite(config.density) && config.density > 0 ? config.density : 1;
  const scale = config.scale;
  const angleDeg = Number.isFinite(config.angle) ? (config.angle as number) : 0;
  const norm = ((angleDeg % 360) + 360) % 360;
  if (norm === 0 || width <= 0 || height <= 0) {
    return rawPattern(width, height, config, density, scale);
  }
  // Oversize to the bounding-square of the rotated rect. A square of
  // side = diagonal covers every possible rotation of the original
  // rect, with the original rect centered inside.
  const diag = Math.ceil(Math.sqrt(width * width + height * height));
  const genW = diag;
  const genH = diag;
  const insetX = (genW - width) / 2;
  const insetY = (genH - height) / 2;
  const raw = rawPattern(genW, genH, config, density, scale);
  const cx = genW / 2;
  const cy = genH / 2;
  const θ = (norm * Math.PI) / 180;
  const cosθ = Math.cos(θ);
  const sinθ = Math.sin(θ);
  const rot = (x: number, y: number): { x: number; y: number } => {
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * cosθ - dy * sinθ - insetX,
      y: cy + dx * sinθ + dy * cosθ - insetY,
    };
  };
  const rotatedDots: PatternDot[] = raw.dots.map((d) => {
    const p = rot(d.x, d.y);
    return { x: p.x, y: p.y, r: d.r };
  });
  const rotatedLines: PatternLine[] = raw.lines.map((ln) => {
    const a = rot(ln.x1, ln.y1);
    const b = rot(ln.x2, ln.y2);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
  return { dots: rotatedDots, lines: rotatedLines };
}

function hatchSpacing(density: number): number {
  const clamped = Math.max(0.25, Math.min(4, density));
  return Math.max(4, 10 / clamped);
}
