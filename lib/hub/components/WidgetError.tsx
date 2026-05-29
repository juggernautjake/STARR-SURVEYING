'use client';
// lib/hub/components/WidgetError.tsx
//
// Shown when a widget's data fetch fails. Has a Retry button + a Hide
// button. After 3 failures in 1 minute the widget calls onAutoHide on
// the consumer side (lands in Slice 148 — for now Hide is manual).
//
// Slice 91 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';

interface WidgetErrorProps {
  /** Human-readable description. Friendly version of the actual error
   *  (server reason if available, generic if not). */
  message: string;
  onRetry?: () => void;
  onHide?: () => void;
}

export default function WidgetError({ message, onRetry, onHide }: WidgetErrorProps) {
  return (
    <div
      role="alert"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--hub-spc-3, 12px)',
        padding: 'var(--hub-spc-4, 16px)',
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--theme-danger)' }}>
        Couldn&apos;t load this widget
      </div>
      <div style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>
        {message}
      </div>
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
        {onHide && (
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
