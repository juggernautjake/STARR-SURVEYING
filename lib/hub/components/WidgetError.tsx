'use client';
// lib/hub/components/WidgetError.tsx
//
// Shown when a widget's data fetch fails. Has a Retry button + a Hide
// button. After 3 failures in 1 minute the widget calls onAutoHide on
// the consumer side (lands in Slice 148 — for now Hide is manual).
//
// Slice 91 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice S7 of widget-size-responsive-content-2026-06-18.md — adopts
// the same self-measuring compact mode WidgetEmpty uses. At tiny
// sizes (< 120px wide OR < 80px tall) the layout collapses to a
// single ⚠ icon + retry chip; small sizes keep the headline but
// drop the message line; default shows the full alert.
// Spec lock: `pickErrorVariant` is pure + exported.

import React, { useRef } from 'react';
import { useElementSize } from '@/lib/hub/use-element-size';

interface WidgetErrorProps {
  /** Human-readable description. Friendly version of the actual error
   *  (server reason if available, generic if not). */
  message: string;
  onRetry?: () => void;
  onHide?: () => void;
}

export type WidgetErrorVariant = 'tiny' | 'small' | 'default';

/** Pure helper — pick the compact variant from a measured rect.
 *  Mirrors `pickEmptyVariant` so the empty / error states collapse at
 *  the same thresholds. Exported + locked under vitest. */
export function pickErrorVariant(widthPx: number, heightPx: number): WidgetErrorVariant {
  if (widthPx <= 0 || heightPx <= 0) return 'default';
  if (widthPx < 120 || heightPx < 80) return 'tiny';
  if (widthPx < 220 && heightPx < 140) return 'small';
  return 'default';
}

export default function WidgetError({ message, onRetry, onHide }: WidgetErrorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { widthPx, heightPx } = useElementSize(ref);
  const variant = pickErrorVariant(widthPx, heightPx);

  if (variant === 'tiny') {
    return (
      <div
        ref={ref}
        role="alert"
        data-testid="widget-error"
        data-variant="tiny"
        title={message}
        style={tinyWrapStyle}
      >
        <span aria-hidden style={{ fontSize: '1.1rem' }}>⚠️</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Retry"
            title="Retry"
            style={tinyRetryStyle}
          >
            ↻
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="alert"
      data-testid="widget-error"
      data-variant={variant}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--hub-spc-3, 12px)',
        padding: 'var(--hub-spc-4, 16px)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--theme-danger)', fontWeight: 600 }}>
        <span aria-hidden>⚠️</span>
        <span>Couldn&apos;t load this widget</span>
      </div>
      {variant !== 'small' && (
        <div
          data-testid="widget-error-message"
          style={{
            fontSize: 'var(--hub-font-sm, 0.875rem)',
            color: 'var(--theme-fg-secondary)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--hub-spc-2, 8px)', marginTop: 'auto' }}>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--theme-border)',
              background: 'var(--theme-bg-elevated)',
              color: 'var(--theme-fg-primary)',
              cursor: 'pointer',
              fontSize: 'var(--hub-font-sm, 0.875rem)',
            }}
          >
            Retry
          </button>
        )}
        {onHide && variant === 'default' && (
          <button
            type="button"
            onClick={onHide}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--theme-fg-muted)',
              cursor: 'pointer',
              fontSize: 'var(--hub-font-sm, 0.875rem)',
            }}
          >
            Hide
          </button>
        )}
      </div>
    </div>
  );
}

const tinyWrapStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: 'var(--hub-spc-2, 8px)',
  color: 'var(--theme-danger)',
};
const tinyRetryStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 999,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: '0.8rem',
  lineHeight: 1,
};
