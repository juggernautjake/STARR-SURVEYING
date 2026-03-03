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
 */
export function resolveStyle(
  feature: Feature,
  codeMapping: CodeStyleMapping | null,
  layer: Layer,
  globalDefaults: GlobalStyleConfig,
): ResolvedStyle {
  const fs = feature.style;

  return {
    color:          (fs.color           ?? codeMapping?.lineColor    ?? layer.color         ?? '#000000'),
    opacity:        (fs.opacity         ?? 1),
    lineTypeId:     (fs.lineTypeId      ?? codeMapping?.lineTypeId   ?? layer.lineTypeId    ?? 'SOLID'),
    lineWeight:     (fs.lineWeight      ?? codeMapping?.lineWeight   ?? layer.lineWeight    ?? 0.25),
    symbolId:       (fs.symbolId        ?? codeMapping?.symbolId     ?? 'GENERIC_CROSS'),
    symbolSize:     (fs.symbolSize      ?? codeMapping?.symbolSize   ?? 2.0),
    symbolRotation: (fs.symbolRotation  ?? 0),
    labelVisible:   (fs.labelVisible    ?? codeMapping?.labelVisible ?? globalDefaults.showPointLabels),
    labelFormat:    (fs.labelFormat     ?? codeMapping?.labelFormat  ?? '{code}'),
  };
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

/** Resolve effective opacity */
export function resolveOpacity(feature: Feature): number {
  return feature.style.opacity ?? 1;
}
