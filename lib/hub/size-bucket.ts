// lib/hub/size-bucket.ts
//
// Maps a widget's grid (w, h) to one of 5 size buckets. Widget
// components switch sub-renders based on the bucket so content
// adapts to the user's chosen size without clipping or empty padding.
//
// Buckets are computed from area (w × h) rather than width alone —
// a 3×3 widget has the same area as a 6×1.5 strip (well, 4×2), so it
// gets the same content treatment. The thresholds are tuned so the
// common widget sizes land in their intuitive buckets:
//
//   3×1 → tiny     (3 area)
//   4×1 → small    (4 area)
//   3×2 → small    (6 area)
//   6×1 → small    (6 area)
//   4×2 → medium   (8 area)
//   6×2 → medium   (12 area)
//   3×3 → medium   (9 area)
//   6×3 → large    (18 area)
//   8×2 → large    (16 area)
//  12×2 → large    (24 area)
//   8×4 → xlarge   (32 area)
//  12×3 → xlarge   (36 area)
//  12×4 → xlarge   (48 area)
//
// Slice 90 of customizable-hub-and-work-mode-2026-05-28.md.

export type SizeBucket = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';

/** Returns the size bucket for a widget of the given grid dimensions.
 *  Both `w` and `h` are expected to be positive integers; non-positive
 *  inputs are clamped to 1 so callers can't accidentally compute a
 *  bucket from a deleted widget. */
export function sizeBucket(w: number, h: number): SizeBucket {
  const safeW = Math.max(1, Math.floor(w));
  const safeH = Math.max(1, Math.floor(h));
  const area = safeW * safeH;
  if (area <= 3) return 'tiny';
  if (area <= 6) return 'small';
  if (area <= 12) return 'medium';
  if (area <= 24) return 'large';
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
