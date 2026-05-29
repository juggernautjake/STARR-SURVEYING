'use client';
// lib/hub/components/MobileBanner.tsx
//
// Tiny "open on desktop to customize" banner shown above the hub
// canvas at <768px. Persists dismissal in localStorage so it doesn't
// re-nag every page load.
//
// Slice 151 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useState } from 'react';
import { HUB_EDIT_MODE_BREAKPOINT_PX } from './EditMode';

const DISMISS_KEY = 'hub-mobile-banner-dismissed';

export default function MobileBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    function tick() {
      if (typeof window === 'undefined') return;
      const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
      setShow(!dismissed && window.innerWidth < HUB_EDIT_MODE_BREAKPOINT_PX);
    }
    tick();
    window.addEventListener('resize', tick);
    return () => window.removeEventListener('resize', tick);
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      style={{
        padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
        background: 'color-mix(in srgb, var(--theme-info) 12%, var(--theme-bg-surface))',
        color: 'var(--theme-fg-primary)',
        border: '1px solid var(--theme-info)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        margin: '0 0 var(--hub-spc-3, 12px)',
        fontSize: 'var(--hub-font-sm, 0.875rem)',
      }}
    >
      <span>Open on desktop to customize your hub.</span>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1');
          setShow(false);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--theme-fg-secondary)',
          fontSize: '1rem',
          padding: 4,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
