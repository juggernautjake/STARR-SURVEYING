// lib/cad/operations/offset-metadata.ts
//
// Per-feature metadata that marks an offset feature + carries
// everything Phase 2's PropertyPanel inspector + Slice 5's
// recompute-offset-feature helper need to re-run the offset engine
// against the original source.
//
// Stored under `Feature.properties` (a free-form `Record<string,
// string | number | boolean>`) so save/load round-trips happen for
// free via the existing drawing JSON serialization — no schema
// migration.
//
// Slice 3 of cad-offset-tool-2026-05-29.md.

import type { Feature, LinearUnit } from '@/lib/cad/types';

/** Stable property keys. Exported so consumers don't typo them in
 *  string literals. */
export const OFFSET_PROPS = {
  sourceId:       'offsetSourceId',
  distance:       'offsetDistance',
  unit:           'offsetUnit',
  side:           'offsetSide',
  cornerHandling: 'offsetCornerHandling',
} as const;

export interface OffsetMetadata {
  /** Feature id this offset was generated from. */
  sourceId: string;
  /** Distance the user typed (in `unit`, NOT canonical feet). The
   *  feet value can be recomputed via `distanceToFeet(distance, unit)`
   *  in `apply-offset-from-panel.ts`. */
  distance: number;
  /** Unit the user picked when typing the distance. */
  unit: LinearUnit;
  /** Side of the source the offset was laid on. When the user picked
   *  `BOTH`, two features are emitted, each tagged with its actual
   *  resolved side. */
  side: 'LEFT' | 'RIGHT';
  /** Corner-handling mode used by the engine. Needed so the
   *  re-compute path in Slice 5 reproduces the original shape exactly. */
  cornerHandling: 'MITER' | 'ROUND' | 'CHAMFER';
}

/** Returns the offset metadata embedded in `feature.properties`, or
 *  `null` when the feature isn't an offset. Validates each field's
 *  type so a hand-edited JSON drawing can't crash the inspector. */
export function getOffsetMetadata(feature: Feature): OffsetMetadata | null {
  const p = feature.properties;
  if (!p) return null;
  const sourceId = p[OFFSET_PROPS.sourceId];
  const distance = p[OFFSET_PROPS.distance];
  const unit = p[OFFSET_PROPS.unit];
  const side = p[OFFSET_PROPS.side];
  const cornerHandling = p[OFFSET_PROPS.cornerHandling];

  if (typeof sourceId !== 'string' || sourceId.length === 0) return null;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0) return null;
  if (typeof unit !== 'string' || !isLinearUnit(unit)) return null;
  if (side !== 'LEFT' && side !== 'RIGHT') return null;
  if (cornerHandling !== 'MITER' && cornerHandling !== 'ROUND' && cornerHandling !== 'CHAMFER') {
    return null;
  }

  return { sourceId, distance, unit, side, cornerHandling };
}

/** Convenience: `getOffsetMetadata(feature) !== null`. */
export function isOffsetFeature(feature: Feature): boolean {
  return getOffsetMetadata(feature) !== null;
}

/** Return a new feature with the offset metadata merged into
 *  `properties`. Pure (doesn't mutate `feature`). Used by
 *  `applyInteractiveOffset` to stamp each emitted feature so the
 *  PropertyPanel inspector + the live-edit propagator can find it
 *  later. */
export function stampOffsetMetadata(
  feature: Feature,
  metadata: OffsetMetadata,
): Feature {
  return {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      [OFFSET_PROPS.sourceId]:       metadata.sourceId,
      [OFFSET_PROPS.distance]:       metadata.distance,
      [OFFSET_PROPS.unit]:           metadata.unit,
      [OFFSET_PROPS.side]:           metadata.side,
      [OFFSET_PROPS.cornerHandling]: metadata.cornerHandling,
    },
  };
}

// ─── Internals ─────────────────────────────────────────────────────────

function isLinearUnit(s: string): s is LinearUnit {
  return s === 'FT' || s === 'IN' || s === 'MILE' || s === 'M' || s === 'CM' || s === 'MM';
}
