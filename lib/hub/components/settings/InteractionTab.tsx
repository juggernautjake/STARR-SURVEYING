'use client';
// lib/hub/components/settings/InteractionTab.tsx
//
// Interaction tab. Click action (navigate / expand / none), click
// target (RoutePicker — only when action='navigate'), refresh
// interval (NumberStepper, seconds, 0 = manual only), "see all" link
// toggle, row actions toggle.
//
// Slice 104 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import type {
  WidgetClickAction,
  WidgetCustomization,
} from '@/lib/hub/types';
import NumberStepper from './components/NumberStepper';
import RoutePicker from './components/RoutePicker';
import ToggleGroup from './components/ToggleGroup';

export interface InteractionTabProps {
  customization: WidgetCustomization;
  onChange: (next: WidgetCustomization) => void;
}

const CLICK_ACTION_OPTIONS = [
  { value: 'navigate' as WidgetClickAction, label: 'Navigate' },
  { value: 'expand'   as WidgetClickAction, label: 'Expand' },
  { value: 'none'     as WidgetClickAction, label: 'None' },
] as const;

export default function InteractionTab({ customization, onChange }: InteractionTabProps) {
  const interaction = customization.interaction ?? {};
  const clickAction: WidgetClickAction = interaction.clickAction ?? 'none';
  const clickTarget = interaction.clickTarget ?? '';
  const refreshIntervalSec = interaction.refreshIntervalSec ?? 0;
  const showSeeAll = interaction.showSeeAllLink ?? false;
  const showRowActions = interaction.showRowActions ?? false;

  function patch(next: Partial<NonNullable<WidgetCustomization['interaction']>>) {
    onChange({ ...customization, interaction: { ...interaction, ...next } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Click action</legend>
        <ToggleGroup
          options={CLICK_ACTION_OPTIONS}
          value={clickAction}
          onChange={(v) => patch({ clickAction: v })}
          ariaLabel="Click action"
        />
      </fieldset>

      {clickAction === 'navigate' && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Navigate to</legend>
          <RoutePicker
            value={clickTarget}
            onChange={(href) => patch({ clickTarget: href })}
            ariaLabel="Search routes for click target"
          />
        </fieldset>
      )}

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Auto-refresh</legend>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NumberStepper
            value={refreshIntervalSec}
            min={0}
            max={3600}
            step={15}
            onChange={(n) => patch({ refreshIntervalSec: n })}
            ariaLabel="Refresh interval in seconds"
            suffix="sec"
          />
          <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
            {refreshIntervalSec === 0 ? 'Manual only' : `Every ${refreshIntervalSec}s`}
          </span>
        </div>
      </fieldset>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={showSeeAll}
          onChange={(e) => patch({ showSeeAllLink: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Show &quot;see all&quot; link in footer
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={showRowActions}
          onChange={(e) => patch({ showRowActions: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Show row hover actions
        </span>
      </label>
    </div>
  );
}

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  borderRadius: 6,
  padding: 'var(--hub-spc-3, 12px)',
  margin: 0,
};

const legendStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
  padding: '0 4px',
};
