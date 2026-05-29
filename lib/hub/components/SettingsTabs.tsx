'use client';
// lib/hub/components/SettingsTabs.tsx
//
// Tab strip rendered inside the settings panel. Keyboard-accessible
// (Arrow keys + Home/End to navigate, Enter/Space to activate),
// matches the WAI-ARIA tab pattern.
//
// Slice 101 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useRef } from 'react';

export type SettingsTabId = 'layout' | 'style' | 'content' | 'interaction';

export interface SettingsTabsProps {
  activeTab: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
  /** When false, the Content tab is greyed out (used when the widget
   *  doesn't declare a SettingsForm). Falls back to Layout in that
   *  case. */
  contentTabEnabled?: boolean;
  /** id of the labelled-by element so screen readers announce the
   *  tab name on focus. */
  labelledById?: string;
}

const TAB_ORDER: SettingsTabId[] = ['layout', 'style', 'content', 'interaction'];
const TAB_LABELS: Record<SettingsTabId, string> = {
  layout:      'Layout',
  style:       'Style',
  content:     'Content',
  interaction: 'Interaction',
};

export default function SettingsTabs({
  activeTab,
  onChange,
  contentTabEnabled = true,
  labelledById,
}: SettingsTabsProps) {
  const refs = useRef<Record<SettingsTabId, HTMLButtonElement | null>>({
    layout: null, style: null, content: null, interaction: null,
  });

  // If content is disabled and currently active, fall back.
  useEffect(() => {
    if (activeTab === 'content' && !contentTabEnabled) {
      onChange('layout');
    }
  }, [activeTab, contentTabEnabled, onChange]);

  function focusTab(id: SettingsTabId) {
    refs.current[id]?.focus();
  }

  function handleKey(e: React.KeyboardEvent<HTMLButtonElement>, current: SettingsTabId) {
    const visible = TAB_ORDER.filter((t) => t !== 'content' || contentTabEnabled);
    const idx = visible.indexOf(current);
    if (idx === -1) return;
    let next: SettingsTabId | null = null;
    if (e.key === 'ArrowRight') next = visible[(idx + 1) % visible.length];
    else if (e.key === 'ArrowLeft') next = visible[(idx - 1 + visible.length) % visible.length];
    else if (e.key === 'Home') next = visible[0];
    else if (e.key === 'End') next = visible[visible.length - 1];
    if (next) {
      e.preventDefault();
      onChange(next);
      focusTab(next);
    }
  }

  return (
    <div role="tablist" aria-labelledby={labelledById} style={tablistStyle}>
      {TAB_ORDER.map((id) => {
        const disabled = id === 'content' && !contentTabEnabled;
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            ref={(el) => { refs.current[id] = el; }}
            role="tab"
            type="button"
            id={`hub-settings-tab-${id}`}
            aria-controls={`hub-settings-panel-${id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(id)}
            onKeyDown={(e) => handleKey(e, id)}
            style={isActive ? tabActiveStyle : disabled ? tabDisabledStyle : tabStyle}
          >
            {TAB_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

const tablistStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '0 var(--hub-spc-4, 16px)',
  borderBottom: '1px solid var(--theme-border)',
};

const tabStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: 'var(--theme-fg-secondary)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  cursor: 'pointer',
  marginBottom: -1,
};

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  color: 'var(--theme-fg-primary)',
  borderBottomColor: 'var(--theme-accent)',
  fontWeight: 600,
};

const tabDisabledStyle: React.CSSProperties = {
  ...tabStyle,
  cursor: 'not-allowed',
  opacity: 0.5,
};
