'use client';
// lib/hub/components/settings/LayoutTab.tsx
//
// Layout tab of the widget settings panel. Surfaces:
//   - SizeGridPicker — 12×4 visual size picker
//   - Show-title checkbox
//   - Title override input
//   - Density override radio (compact / comfortable / spacious / inherit)
//
// Each control writes back through `onChange` which the settings
// panel pipes into `useHubStore.patchWidgetCustomization`. The hub
// store's compactor reflows after a size change so the new dimensions
// don't collide with neighbours.
//
// Slice 102 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useState, useTransition } from 'react';
import type { Density, WidgetCustomization, WidgetInstance } from '@/lib/hub/types';
import { getWidget } from '@/lib/hub/widget-registry';
import { compactLayout } from '@/lib/hub/grid-math';
import { HUB_GRID_COLS } from '@/lib/hub/grid-model';
import { useHubStore } from '@/lib/hub/hub-store';
import SizeGridPicker from './SizeGridPicker';

export interface LayoutTabProps {
  instance: WidgetInstance;
  customization: WidgetCustomization;
  onChange: (next: WidgetCustomization) => void;
}

const DENSITY_LABELS: Record<Density | 'inherit', string> = {
  inherit:      'Inherit from page',
  compact:      'Compact',
  comfortable:  'Comfortable',
  spacious:     'Spacious',
};

export default function LayoutTab({ instance, customization, onChange }: LayoutTabProps) {
  const definition = getWidget(instance.type);
  const minSize = definition?.minSize ?? { w: 1, h: 1 };
  // Slice 209 — fallback caps follow the 8×8 grid.
  const maxSize = definition?.maxSize ?? { w: 8, h: 8 };

  const showTitle = customization.layout?.showTitle ?? true;
  const titleOverride = customization.layout?.titleOverride ?? '';
  const density = customization.layout?.density ?? 'inherit';

  const draftWidgets = useHubStore((s) => s.draftWidgets);
  const setDraftWidgets = useHubStore((s) => s.setDraftWidgets);

  // Slice 205 — keep the typed title in local state so the keystroke
  // updates the input instantly; the heavier store flush + every
  // re-render it triggers (SettingsPanel, PreviewFrame, the
  // corresponding WidgetGrid cell) runs as a non-urgent transition
  // so React can interrupt it for the next keystroke. The
  // useEffect resyncs the local value when the upstream customization
  // changes from a different source (e.g. settings reset).
  const [localTitle, setLocalTitle] = useState(titleOverride);
  const [, startTransition] = useTransition();
  useEffect(() => {
    setLocalTitle(titleOverride);
  }, [titleOverride]);

  function handleTitleChange(value: string) {
    setLocalTitle(value);
    startTransition(() => {
      onChange({
        ...customization,
        layout: { ...customization.layout, titleOverride: value },
      });
    });
  }

  function commitSize(next: { w: number; h: number }) {
    // Resize writes back to the draft layout directly + reflows so
    // neighbours don't overlap.
    if (!draftWidgets) return;
    const updated = draftWidgets.map((w) =>
      w.id === instance.id ? { ...w, w: next.w, h: next.h } : w,
    );
    const compacted = compactLayout(updated, HUB_GRID_COLS);
    setDraftWidgets(compacted);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Size</legend>
        <SizeGridPicker
          value={{ w: instance.w, h: instance.h }}
          minSize={minSize}
          maxSize={maxSize}
          onChange={commitSize}
        />
      </fieldset>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={showTitle}
          onChange={(e) =>
            onChange({
              ...customization,
              layout: { ...customization.layout, showTitle: e.target.checked },
            })
          }
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Show widget title
        </span>
      </label>

      <label>
        <span style={legendStyle}>Custom title (optional)</span>
        <input
          type="text"
          value={localTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Defaults to the catalog label"
          style={textInputStyle}
        />
      </label>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Density override</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['inherit', 'compact', 'comfortable', 'spacious'] as const).map((d) => (
            <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name={`density-${instance.id}`}
                value={d}
                checked={density === d}
                onChange={() => {
                  // 'inherit' = remove the override; any other writes it.
                  const layout = { ...customization.layout };
                  if (d === 'inherit') {
                    delete layout.density;
                  } else {
                    layout.density = d;
                  }
                  onChange({ ...customization, layout });
                }}
              />
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
                {DENSITY_LABELS[d]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

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

const textInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};
