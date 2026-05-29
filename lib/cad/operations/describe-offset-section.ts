// lib/cad/operations/describe-offset-section.ts
//
// Pure helper that builds the descriptor the PropertyPanel uses to
// render its "Offset Source" section. Extracted from the panel so
// the data shape can be unit-tested without React + so Slice 5's
// recompute path can reuse the same source-resolution logic.
//
// Slice 4 of cad-offset-tool-2026-05-29.md.

import type { Feature } from '@/lib/cad/types';
import { getOffsetMetadata, type OffsetMetadata } from './offset-metadata';

export interface OffsetSectionDescriptor {
  /** The offset metadata stored on the selected feature. */
  metadata: OffsetMetadata;
  /** Human-readable label for the source feature, e.g. "LINE · 8f3a12bc". */
  sourceLabel: string;
  /** True when the source feature can no longer be found in the drawing
   *  store — the panel renders the section read-only + shows a stale-link
   *  warning. */
  sourceMissing: boolean;
}

/** Returns the descriptor needed to render the PropertyPanel's
 *  "Offset Source" section, or `null` when the feature isn't an
 *  offset.
 *
 *  `lookupFeature` is injected (not coupled to the drawing store)
 *  so the helper stays pure + testable. */
export function describeOffsetSection(
  feature: Feature,
  lookupFeature: (id: string) => Feature | undefined,
): OffsetSectionDescriptor | null {
  const metadata = getOffsetMetadata(feature);
  if (!metadata) return null;
  const source = lookupFeature(metadata.sourceId);
  return {
    metadata,
    sourceLabel: source
      ? buildSourceLabel(source)
      : `(deleted) · ${shortId(metadata.sourceId)}`,
    sourceMissing: !source,
  };
}

function buildSourceLabel(feature: Feature): string {
  return `${feature.type} · ${shortId(feature.id)}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
