'use client';
// lib/hub/components/WelcomeTip.tsx
//
// First-time tip shown above the widget grid when the user is
// rendering the persona-default seed (i.e., they've never saved a
// custom layout). Dismissal persists in localStorage so users only
// see it once. Matches the dismiss-once pattern from MobileBanner
// (Slice 151).
//
// Slice 196 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useState } from 'react';

export const WELCOME_TIP_DISMISS_KEY = 'starr-hub-welcome-dismissed';

export interface WelcomeTipProps {
  /** When false, the tip is hidden regardless of dismissal state.
   *  The HubCanvas threads `isSeeded` from the server-fetched layout
   *  so saved-layout users never see it. */
  show: boolean;
}

export default function WelcomeTip({ show }: WelcomeTipProps) {
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(localStorage.getItem(WELCOME_TIP_DISMISS_KEY) === '1');
  }, []);

  function dismiss() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(WELCOME_TIP_DISMISS_KEY, '1');
      } catch {
        /* swallow — quota / disabled storage */
      }
    }
    setDismissed(true);
  }

  if (!show || dismissed) return null;

  return (
    <div role="status" style={wrapperStyle}>
      <span aria-hidden style={iconStyle}>👋</span>
      <span style={messageStyle}>
        <strong>Welcome to your hub!</strong>{' '}
        These widgets are the recommended defaults for your role —
        click <code style={codeStyle}>✏️ Customize Hub</code> (top right) to rearrange,
        add, or remove anything.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome tip"
        style={dismissButtonStyle}
      >
        ×
      </button>
    </div>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

const wrapperStyle: React.CSSProperties = {
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
  background: 'color-mix(in srgb, var(--theme-info) 12%, var(--theme-bg-surface))',
  color: 'var(--theme-fg-primary)',
  border: '1px solid var(--theme-info)',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-3, 12px)',
  margin: '0 0 var(--hub-spc-3, 12px)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const iconStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  flexShrink: 0,
};

const messageStyle: React.CSSProperties = {
  flex: 1,
  lineHeight: 1.4,
};

const codeStyle: React.CSSProperties = {
  padding: '1px 6px',
  borderRadius: 4,
  background: 'var(--theme-bg-elevated)',
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  fontFamily: 'inherit',
};

const dismissButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--theme-fg-secondary)',
  fontSize: '1.25rem',
  padding: 4,
  lineHeight: 1,
  flexShrink: 0,
};
