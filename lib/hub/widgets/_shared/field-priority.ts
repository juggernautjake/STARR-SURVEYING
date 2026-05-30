// lib/hub/widgets/_shared/field-priority.ts
//
// Slice 3 of hub-widget-excellence-02-shared-infra. Standardizes the
// "show more as the widget grows" rule so every widget's size-aware
// field logic reads the same way (master checklist criterion 3).
//
// A widget declares its fields in priority order (most important
// first); `pickFields` returns the prefix that fits the current size
// bucket. tiny = the single most important field, small = the top few,
// medium/large/xlarge = progressively more. Pure + deterministic.

import type { SizeBucket } from '@/lib/hub/size-bucket';

/** Default per-bucket cap on how many priority-ordered fields render.
 *  tiny → 1, small → 3, medium → 5, large → 8, xlarge → all (Infinity).
 *  Widgets that need a different curve pass their own `caps`. */
export const DEFAULT_FIELD_CAPS: Readonly<Record<SizeBucket, number>> = {
  tiny: 1,
  small: 3,
  medium: 5,
  large: 8,
  xlarge: Infinity,
};

/** How many fields a bucket shows, given a cap table. Clamped to >= 0. */
export function fieldCountForBucket(
  bucket: SizeBucket,
  caps: Readonly<Record<SizeBucket, number>> = DEFAULT_FIELD_CAPS,
): number {
  const cap = caps[bucket];
  if (cap === Infinity) return Infinity;
  return Math.max(0, Math.floor(cap));
}

/**
 * Returns the subset of `fields` to render at `bucket`.
 *
 * `fields` MUST already be in priority order (most important first) —
 * the function takes the prefix that fits the bucket's cap, so the
 * single most-important field always survives down to `tiny` and each
 * larger bucket is a superset of the smaller one.
 *
 * @param fields  priority-ordered field list (any item type)
 * @param bucket  the widget's current size bucket
 * @param caps    optional per-bucket cap override (defaults to
 *                DEFAULT_FIELD_CAPS)
 */
export function pickFields<T>(
  fields: readonly T[],
  bucket: SizeBucket,
  caps: Readonly<Record<SizeBucket, number>> = DEFAULT_FIELD_CAPS,
): T[] {
  const count = fieldCountForBucket(bucket, caps);
  if (count === Infinity) return fields.slice();
  return fields.slice(0, count);
}
