'use client';
// lib/hub/components/settings/StyleTab.tsx
//
// Style tab. Wires the five WidgetColorMode values, the four
// WidgetStatusTint sub-options (visible only when mode='status'), the
// custom-color inputs (visible only when mode='custom'), the three
// border-radius options, and the 0-3 shadow depth slider.
//
// Live preview already lives at the top of the SettingsPanel — every
// edit here writes back through `onChange` which reuses the panel's
// `patchWidgetCustomization` plumbing.
//
// Slice 103 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import type {
  WidgetBorderRadius,
  WidgetColorMode,
  WidgetCustomization,
  WidgetShadowDepth,
  WidgetStatusTint,
} from '@/lib/hub/types';
import {
  BORDER_RADII,
  COLOR_MODES,
  SHADOW_DEPTHS,
  STATUS_TINTS,
} from '@/lib/hub/widget-color-modes';

export interface StyleTabProps {
  customization: WidgetCustomization;
  onChange: (next: WidgetCustomization) => void;
  instanceId: string;
}

export default function StyleTab({ customization, onChange, instanceId }: StyleTabProps) {
  const style = customization.style ?? {};
  const colorMode: WidgetColorMode = style.colorMode ?? 'inherit';
  const statusTint: WidgetStatusTint = style.statusTint ?? 'info';
  const borderRadius: WidgetBorderRadius = style.borderRadius ?? 'rounded';
  const shadowDepth: WidgetShadowDepth = style.shadowDepth ?? 0;

  function patchStyle(next: Partial<NonNullable<WidgetCustomization['style']>>) {
    onChange({
      ...customization,
      style: { ...style, ...next },
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Color mode</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {COLOR_MODES.map((m) => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <input
                type="radio"
                name={`colorMode-${instanceId}`}
                value={m.id}
                checked={colorMode === m.id}
                onChange={() => patchStyle({ colorMode: m.id })}
                style={{ marginTop: 4 }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{m.label}</span>
                <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
                  {m.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {colorMode === 'status' && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Status tint</legend>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_TINTS.map((t) => (
              <label key={t.id} style={tintPillStyle}>
                <input
                  type="radio"
                  name={`statusTint-${instanceId}`}
                  value={t.id}
                  checked={statusTint === t.id}
                  onChange={() => patchStyle({ statusTint: t.id })}
                />
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: 12,
                    background: `var(--theme-${t.id})`,
                    border: '1px solid var(--theme-border)',
                  }}
                />
                <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{t.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {colorMode === 'custom' && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Custom colors</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={colorRowStyle}>
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Background</span>
              <input
                type="color"
                value={style.customBg ?? '#FFFFFF'}
                onChange={(e) => patchStyle({ customBg: e.target.value })}
                aria-label="Custom background color"
              />
            </label>
            <label style={colorRowStyle}>
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Text</span>
              <input
                type="color"
                value={style.customFg ?? '#000000'}
                onChange={(e) => patchStyle({ customFg: e.target.value })}
                aria-label="Custom text color"
              />
            </label>
          </div>
        </fieldset>
      )}

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Border radius</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {BORDER_RADII.map((r) => (
            <label key={r.id} style={radiusOptionStyle}>
              <input
                type="radio"
                name={`borderRadius-${instanceId}`}
                value={r.id}
                checked={borderRadius === r.id}
                onChange={() => patchStyle({ borderRadius: r.id })}
              />
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 28,
                  height: 16,
                  background: 'var(--theme-bg-elevated)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: Math.min(r.px, 14),
                }}
              />
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Shadow depth</legend>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={shadowDepth}
            onChange={(e) => patchStyle({ shadowDepth: Number(e.target.value) as WidgetShadowDepth })}
            style={{ flex: 1 }}
            aria-label="Shadow depth"
          />
          <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', minWidth: 60 }}>
            {SHADOW_DEPTHS.find((s) => s.id === shadowDepth)?.label}
          </span>
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

const tintPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'var(--theme-bg-elevated)',
  border: '1px solid var(--theme-border)',
};

const radiusOptionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  border: '1px solid var(--theme-border)',
};

const colorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};
