// lib/hub/widgets/_shared/simple-list-widget.ts
//
// Shared bucket-cap helper for list-style widgets. Widgets that just
// render N rows of items can reuse this rather than redeclaring the
// same 5-case switch.
//
// Slice 124 of customizable-hub-and-work-mode-2026-05-28.md.

import type { SizeBucket } from '@/lib/hub/size-bucket';

export interface BucketCaps {
  tiny: number;
  small: number;
  medium: number;
  large: number;
  xlarge: number;
}

export function bucketCap(bucket: SizeBucket, caps: BucketCaps): number {
  return caps[bucket];
}
