'use client';
// lib/hub/components/WidgetSkeleton.tsx
//
// Pulsing skeleton placeholders shown while a widget is fetching its
// data. Built from a tiny set of `<SkeletonBlock>` primitives so each
// widget can compose its own shape matching its adaptive layout.

import React from 'react';

interface SkeletonBlockProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

/** A single pulsing rectangle. Use multiple in a flex column to mimic
 *  a row of text. */
export function SkeletonBlock({
  width = '100%',
  height = 14,
  borderRadius = 4,
  style,
}: SkeletonBlockProps) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        width,
        height,
        borderRadius,
        background: 'var(--theme-bg-elevated)',
        animation: 'widget-skeleton-pulse 1.6s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

/** A column of N pulsing lines — quick default skeleton for list-style
 *  widgets. */
export default function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--hub-spc-3, 12px)',
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} width={`${100 - i * 8}%`} />
      ))}
      <style>{`
        @keyframes widget-skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Loading"] > span {
            animation: none !important;
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
