'use client';
// lib/hub/components/WidgetEmpty.tsx
//
// Friendly "no data" body. Used by widgets whose data fetch resolved
// with an empty list. The copy belongs to the widget — this component
// is just the layout.

import React, { type ReactNode } from 'react';

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

export default function WidgetEmpty({ title, description, cta, icon }: WidgetEmptyProps) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'var(--hub-spc-2, 8px)',
        color: 'var(--theme-fg-secondary)',
        padding: 'var(--hub-spc-4, 16px)',
      }}
    >
      {icon && (
        <div aria-hidden style={{ fontSize: '1.75rem', opacity: 0.7 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 'var(--hub-font-base, 1rem)', fontWeight: 600, color: 'var(--theme-fg-primary)' }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{description}</div>
      )}
      {cta && <div style={{ marginTop: 'var(--hub-spc-2, 8px)' }}>{cta}</div>}
    </div>
  );
}
