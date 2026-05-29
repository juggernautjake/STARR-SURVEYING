// lib/hub/widgets/_shared/stat-bucket.ts
//
// Shared bucket-aware helpers for "big number stat card" widgets:
// monthly-revenue, hours-this-week, pto-balance, and any future
// stat-style widget. Centralizes the font-size + label-color
// scaling so every stat reads consistently at the same bucket.
//
// Slice 211 of hub-grid-8x8-square-cells-2026-05-29.md.

import type { CSSProperties } from 'react';
import type { SizeBucket } from '@/lib/hub/size-bucket';

/** Returns the CSS for a stat widget's main number at the given
 *  bucket. The font scales with the cell area so a 1×1 cell
 *  fits the value cleanly + a 6×6 cell uses the space. The
 *  `color` defaults to `--theme-fg-primary`; pass an override
 *  for status-tinted stats (revenue → success, hours → primary). */
export function statNumberStyle(
  bucket: SizeBucket,
  color: string = 'var(--theme-fg-primary)',
): CSSProperties {
  const fontSize =
    bucket === 'tiny'   ? 'clamp(1.25rem, 3vw, 2rem)' :
    bucket === 'small'  ? 'var(--hub-font-xl, 1.25rem)' :
    bucket === 'medium' ? 'var(--hub-font-2xl, 1.5rem)' :
    bucket === 'large'  ? '2rem' :
                           '2.5rem';
  return {
    fontSize,
    fontWeight: 700,
    color,
    lineHeight: 1.1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

/** Centered flex column the tiny-bucket stat layout uses for
 *  every stat widget. Returned as a fresh object since callers
 *  often spread additional fields. */
export function tinyStatWrapStyle(): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 2,
  };
}

/** Small muted label rendered below the main number. */
export function tinyStatLabelStyle(): CSSProperties {
  return {
    fontSize: 'var(--hub-font-xs, 0.75rem)',
    color: 'var(--theme-fg-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };
}
