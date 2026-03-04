// lib/cad/styles/style-cascade.ts — 4-tier style resolution engine
import type { Feature, Layer } from '../types';
import type { CodeStyleMapping, GlobalStyleConfig, ResolvedStyle } from './types';

/**
 * Resolve the effective style for a feature.
 * Priority (first non-null wins):
 *   1. Feature-level override (user manually set this)
 *   2. Point-code default (from code-to-style mapping)
 *   3. Layer style (the layer's default settings)
 *   4. Global fallback
 *
 * If the layer is frozen the feature should not be rendered at all — callers
 * should call `canFeatureBeRendered` before calling this function.
 */
export function resolveStyle(
  feature: Feature,
  codeMapping: CodeStyleMapping | null,
  layer: Layer,
  globalDefaults: GlobalStyleConfig,
): ResolvedStyle {
  if (!feature || !layer) {
    // Defensive fallback — should never happen with valid data
    return {
      color: '#000000', opacity: 1, lineTypeId: 'SOLID', lineWeight: 0.25,
      symbolId: 'GENERIC_CROSS', symbolSize: 2.0, symbolRotation: 0,
      labelVisible: false, labelFormat: '{code}',
    };
  }

  const fs = feature.style;

  return {
    color:          (fs.color           ?? codeMapping?.lineColor    ?? layer.color         ?? '#000000'),
    opacity:        (typeof fs.opacity === 'number' ? fs.opacity : 1),
    lineTypeId:     (fs.lineTypeId      ?? codeMapping?.lineTypeId   ?? layer.lineTypeId    ?? 'SOLID'),
    lineWeight:     (fs.lineWeight      ?? codeMapping?.lineWeight   ?? layer.lineWeight    ?? 0.25),
    symbolId:       (fs.symbolId        ?? codeMapping?.symbolId     ?? 'GENERIC_CROSS'),
    symbolSize:     (fs.symbolSize      ?? codeMapping?.symbolSize   ?? 2.0),
    symbolRotation: (typeof fs.symbolRotation === 'number' ? fs.symbolRotation : 0),
    labelVisible:   (fs.labelVisible    ?? codeMapping?.labelVisible ?? globalDefaults.showPointLabels),
    labelFormat:    (fs.labelFormat     ?? codeMapping?.labelFormat  ?? '{code}'),
  };
}

/**
 * Returns true if the feature is on a layer that is currently visible and not frozen.
 * Frozen layers are completely excluded from rendering, selection, and snap.
 */
export function canFeatureBeRendered(layer: Layer): boolean {
  return layer.visible && !layer.frozen;
}

/**
 * Returns true if the user can edit features on this layer
 * (visible, not locked, not frozen).
 */
export function canFeatureBeEdited(layer: Layer): boolean {
  return layer.visible && !layer.locked && !layer.frozen;
}

/**
 * Resolve the line color specifically (used for line features).
 */
export function resolveLineColor(
  feature: Feature,
  codeMapping: CodeStyleMapping | null,
  layer: Layer,
): string {
  return feature.style.color ?? codeMapping?.lineColor ?? layer.color ?? '#000000';
}

/** Resolve effective opacity — always returns a valid 0-1 value. */
export function resolveOpacity(feature: Feature): number {
  const op = feature.style.opacity;
  return typeof op === 'number' && isFinite(op) ? Math.max(0, Math.min(1, op)) : 1;
}
