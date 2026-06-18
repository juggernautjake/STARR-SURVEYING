'use client';
// lib/hub/components/WidgetEmpty.tsx
//
// Friendly "no data" body. Used by widgets whose data fetch resolved
// with an empty list. The copy belongs to the widget — this component
// is just the layout.
//
// Slice S7 of widget-size-responsive-content-2026-06-18.md — adopts
// a self-measuring compact mode so the empty state reads cleanly at
// every size. Widgets don't have to pass the bucket; the component
// reads its own contentRect via the shared `useElementSize` hook and
// collapses to:
//   - tiny  (< 120px wide OR < 80px tall): icon + title only, no
//           description, no CTA, font dropped to the small ramp
//   - small (< 220px wide AND < 140px tall): icon (smaller) + title
//           + 1-line description; CTA suppressed so it doesn't
//           overflow.
//   - default: icon (1.75rem) + title + description + CTA below
// Spec lock: `pickEmptyVariant` is pure + exported.

import React, { useRef, type ReactNode } from 'react';
import { useElementSize } from '@/lib/hub/use-element-size';

interface WidgetEmptyProps {
  /** Big line — e.g., "All caught up!" or "No new messages". */
  title: string;
  /** Optional supporting line — usually a hint to take action. */
  description?: string;
  /** Optional CTA — pass a <Link> or <button>. */
  cta?: ReactNode;
  /** Optional emoji or lucide icon name (rendered as the symbol
   *  string). Keep small. */
  icon?: string;
}

export type WidgetEmptyVariant = 'tiny' | 'small' | 'default';

/** Pure helper — pick the compact variant from a measured rect.
 *  Exported + locked under vitest. */
export function pickEmptyVariant(widthPx: number, heightPx: number): WidgetEmptyVariant {
  if (widthPx <= 0 || heightPx <= 0) return 'default';
  if (widthPx < 120 || heightPx < 80) return 'tiny';
  if (widthPx < 220 && heightPx < 140) return 'small';
  return 'default';
}

export default function WidgetEmpty({ title, description, cta, icon }: WidgetEmptyProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { widthPx, heightPx } = useElementSize(ref);
  const variant = pickEmptyVariant(widthPx, heightPx);

  const iconFontSize = variant === 'tiny' ? '1.1rem' : variant === 'small' ? '1.35rem' : '1.75rem';
  const titleFontSize = variant === 'tiny' ? 'var(--hub-font-sm, 0.875rem)' : 'var(--hub-font-base, 1rem)';
  const showDescription = variant !== 'tiny' && description;
  const showCta = variant === 'default' && cta;

  return (
    <div
      ref={ref}
      data-testid="widget-empty"
      data-variant={variant}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: variant === 'tiny' ? 2 : 'var(--hub-spc-2, 8px)',
        color: 'var(--theme-fg-secondary)',
        padding: variant === 'tiny' ? 'var(--hub-spc-2, 8px)' : 'var(--hub-spc-4, 16px)',
        minWidth: 0,
      }}
    >
      {icon && (
        <div aria-hidden style={{ fontSize: iconFontSize, opacity: 0.7, lineHeight: 1 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: titleFontSize, fontWeight: 600, color: 'var(--theme-fg-primary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </div>
      {showDescription && (
        <div
          style={{
            fontSize: 'var(--hub-font-sm, 0.875rem)',
            display: '-webkit-box',
            WebkitLineClamp: variant === 'small' ? 1 : 3,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {description}
        </div>
      )}
      {showCta && <div style={{ marginTop: 'var(--hub-spc-2, 8px)' }}>{cta}</div>}
    </div>
  );
}
