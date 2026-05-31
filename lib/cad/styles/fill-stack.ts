// lib/cad/styles/fill-stack.ts
//
// cad-fill-stacking Slice 6 — pure helpers for the multi-layer infill
// stack. Sub-slice 6a (this module) ships the data model + migration
// + resolver helpers; sub-slice 6b wires the render path to walk the
// stack; sub-slice 6c surfaces the layer-list UI in PropertyPanel.
//
// Design contract:
//
//  1. `resolveFillStack(style)` is the canonical "what should I
//     render?" entrypoint. It returns a `FillLayer[]` that the
//     render path walks bottom-to-top. The returned array is FRESH
//     on every call (no shared references back to the input) so
//     callers can mutate it freely.
//  2. When `style.fillStack` is set, that array (with each layer
//     defaulted via `normalizeFillLayer`) is the source of truth.
//  3. When `style.fillStack` is absent, the legacy single-pattern
//     fields (`fillPattern`, `patternColor`, `patternDensity`, …)
//     project into a 1-element stack. This is the back-compat path
//     so every saved drawing renders unchanged.
//  4. A NONE/SOLID legacy fillPattern with NO solid `fillColor`
//     also has no infill to render → empty stack.
//
// Pure module: no React, no DOM, fully unit-testable.

import type { FeatureStyle, FillLayer, FillPattern } from '../types';

/** Apply layer-field defaults to a possibly-sparse layer record. */
export function normalizeFillLayer(partial: Partial<FillLayer> | undefined | null): FillLayer {
  const p = partial ?? {};
  return {
    pattern: (p.pattern ?? 'NONE') as FillPattern,
    color: p.color ?? null,
    density: typeof p.density === 'number' && Number.isFinite(p.density) ? p.density : 1,
    scale: typeof p.scale === 'number' && Number.isFinite(p.scale) ? p.scale : 1,
    rotation: typeof p.rotation === 'number' && Number.isFinite(p.rotation) ? p.rotation : 0,
    opacity: typeof p.opacity === 'number' && Number.isFinite(p.opacity)
      ? Math.max(0, Math.min(1, p.opacity))
      : 1,
    visible: p.visible !== false,
    brickWidth: p.brickWidth,
    brickHeight: p.brickHeight,
    waveAmplitude: p.waveAmplitude,
    wavePeriod: p.wavePeriod,
    dashLen: p.dashLen,
    gapLen: p.gapLen,
  };
}

/** Project legacy single-pattern FeatureStyle fields into one
 *  FillLayer. Returns null when there's nothing to project (no
 *  pattern AND no solid fillColor). The caller decides whether to
 *  wrap the result in a 1-element array. */
export function legacyStyleToFillLayer(style: FeatureStyle): FillLayer | null {
  const pattern = (style.fillPattern ?? 'NONE') as FillPattern;
  const hasPattern = pattern !== 'NONE' && pattern !== 'SOLID';
  // A pure SOLID legacy fill (fillColor set, no pattern) still needs
  // a stack representation so the stacked renderer can draw it. The
  // render path uses pattern === 'SOLID' to mean "fill the whole
  // polygon with `color`" (treated like a single uniform layer).
  const hasSolidWash = (style.fillColor !== null && style.fillColor !== undefined);
  if (!hasPattern && !hasSolidWash) return null;
  return normalizeFillLayer({
    pattern: hasPattern ? pattern : 'SOLID',
    color: hasPattern ? (style.patternColor ?? null) : (style.fillColor ?? null),
    density: style.patternDensity ?? 1,
    scale: style.patternScale ?? 1,
    rotation: style.patternRotation ?? 0,
    opacity: style.fillOpacity ?? 1,
    visible: true,
    brickWidth: style.brickWidth,
    brickHeight: style.brickHeight,
    waveAmplitude: style.waveAmplitude,
    wavePeriod: style.wavePeriod,
    dashLen: style.patternDashLen,
    gapLen: style.patternGapLen,
  });
}

/** Resolve the canonical stack the render path should walk. Returns
 *  a fresh array — never the same reference as `style.fillStack`. */
export function resolveFillStack(style: FeatureStyle): FillLayer[] {
  if (Array.isArray(style.fillStack)) {
    return style.fillStack.map((l) => normalizeFillLayer(l));
  }
  const legacy = legacyStyleToFillLayer(style);
  return legacy ? [legacy] : [];
}

/** Same as `resolveFillStack` but filters to the layers that should
 *  actually be drawn (visible + non-NONE pattern). The render path
 *  walks THIS list. */
export function resolveVisibleFillLayers(style: FeatureStyle): FillLayer[] {
  return resolveFillStack(style).filter((l) => l.visible && l.pattern !== 'NONE');
}

/** Append a new pattern-NONE layer to the stack. Returns the new
 *  stack (fresh array). Used by the "+ Add layer" button in
 *  PropertyPanel (sub-slice 6c). */
export function appendFillLayer(style: FeatureStyle, partial?: Partial<FillLayer>): FillLayer[] {
  const stack = resolveFillStack(style);
  stack.push(normalizeFillLayer({
    pattern: 'NONE',
    color: '#000000',
    opacity: 1,
    visible: true,
    ...partial,
  }));
  return stack;
}

/** Remove the layer at `index`. Returns the new stack (fresh array).
 *  Out-of-range index is a no-op (returns a copy of the current
 *  stack so callers can write it back unconditionally). */
export function removeFillLayerAt(style: FeatureStyle, index: number): FillLayer[] {
  const stack = resolveFillStack(style);
  if (index < 0 || index >= stack.length) return stack;
  stack.splice(index, 1);
  return stack;
}

/** Patch the layer at `index` with the provided fields. Returns the
 *  new stack (fresh array). Out-of-range index is a no-op. */
export function updateFillLayerAt(
  style: FeatureStyle,
  index: number,
  patch: Partial<FillLayer>,
): FillLayer[] {
  const stack = resolveFillStack(style);
  if (index < 0 || index >= stack.length) return stack;
  stack[index] = normalizeFillLayer({ ...stack[index], ...patch });
  return stack;
}
