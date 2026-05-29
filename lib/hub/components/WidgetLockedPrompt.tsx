'use client';
// lib/hub/components/WidgetLockedPrompt.tsx
//
// Body content for a widget whose subscription bundle has lapsed.
// Renders inside the existing WidgetFrame chrome — the saved layout
// keeps the widget around so the user sees what they lost + a clear
// upgrade path back.
//
// Slice 183 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import Link from 'next/link';
import type { BundleId } from '@/lib/saas/bundles';
import { BUNDLES } from '@/lib/saas/bundles';

export default function WidgetLockedPrompt({ requiredBundle }: { requiredBundle: BundleId }) {
  const meta = BUNDLES[requiredBundle];
  return (
    <div role="region" aria-label="Locked widget" style={style}>
      <span aria-hidden style={{ fontSize: '1.75rem' }}>🔒</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--hub-font-base, 1rem)' }}>
          {meta?.label ?? requiredBundle} required
        </span>
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)', textAlign: 'center' }}>
          This widget needs the {meta?.label ?? requiredBundle} bundle. Reactivate it to bring back the data.
        </span>
      </div>
      <Link href="/admin/billing" style={ctaStyle}>Upgrade</Link>
    </div>
  );
}

const style: React.CSSProperties = {
  height: '100%', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  gap: 'var(--hub-spc-2, 8px)', padding: 'var(--hub-spc-4, 16px)',
  textAlign: 'center',
};

const ctaStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', borderRadius: 6,
  background: 'var(--theme-accent)', color: 'var(--theme-accent-fg)',
  fontWeight: 600, fontSize: 'var(--hub-font-sm, 0.875rem)',
  textDecoration: 'none',
};
