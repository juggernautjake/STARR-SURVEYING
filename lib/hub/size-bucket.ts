// lib/hub/size-bucket.ts
//
// Maps a widget's grid (w, h) to one of 5 size buckets. Widget
// components switch sub-renders based on the bucket so content
// adapts to the user's chosen size without clipping or empty padding.
//
// Buckets are computed from area (w × h). Tuned for the 8×8 square-
// cell grid (Slice 209) so the common widget sizes land in their
// intuitive buckets:
//
//   1×1 → tiny     (1 area — single square pip)
//   2×1 → tiny     (2 area)
//   2×2 → small    (4 area)
//   3×2 → small    (6 area)
//   4×2 → medium   (8 area)
//   3×3 → medium   (9 area)
//   4×3 → medium   (12 area)
//   6×3 → large    (18 area)
//   4×4 → large    (16 area)
//   8×3 → xlarge   (24 area, max-width strip)
//   6×4 → xlarge   (24 area)
//   8×8 → xlarge   (64 area, full-canvas)
//
// Slice 209 rebalanced these from the old 12×4 thresholds so a
// 1×1 still lands in tiny + a 4×4 (the new "comfortable big") is
// firmly in the large bucket.

export type SizeBucket = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';

/** Returns the size bucket for a widget of the given grid dimensions.
 *  Both `w` and `h` are expected to be positive integers; non-positive
 *  inputs are clamped to 1 so callers can't accidentally compute a
 *  bucket from a deleted widget. */
export function sizeBucket(w: number, h: number): SizeBucket {
  const safeW = Math.max(1, Math.floor(w));
  const safeH = Math.max(1, Math.floor(h));
  const area = safeW * safeH;
  if (area <= 2) return 'tiny';
  if (area <= 6) return 'small';
  if (area <= 12) return 'medium';
  if (area <= 20) return 'large';
  return 'xlarge';
}

/** True when bucket A is strictly larger than bucket B. Used for layout
 *  fallback ordering (e.g., "if I can't render at small, try tiny"). */
export function bucketIsLarger(a: SizeBucket, b: SizeBucket): boolean {
  return BUCKET_ORDER[a] > BUCKET_ORDER[b];
}

/** All buckets in ascending order. Useful for iterating through
 *  fallbacks. */
export const ALL_BUCKETS: ReadonlyArray<SizeBucket> = [
  'tiny', 'small', 'medium', 'large', 'xlarge',
];

const BUCKET_ORDER: Record<SizeBucket, number> = {
  tiny: 0,
  small: 1,
  medium: 2,
  large: 3,
  xlarge: 4,
};
