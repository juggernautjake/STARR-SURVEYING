'use client';
// lib/hub/components/settings/CustomColorPicker.tsx
//
// Per-widget custom-color editor surfaced inside the Style tab when
// the user picks `colorMode = 'custom'`. Bg picker + auto-derived fg
// (with a manual override). WCAG contrast guard mirrors the
// global custom theme picker — fails AA = the swatch shows the bad
// ratio in red + the "Fix it" button lights up.
//
// Slice 107 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useMemo } from 'react';
import { useHubStore } from '@/lib/hub/hub-store';
import {
  adjustForegroundToTarget,
  parseHexColor,
  pickForegroundForBackground,
  toHexColor,
  WCAG_AA_BODY,
} from '@/lib/theme/contrast';
import { quickContrast } from '@/lib/hub/themes/custom';
import type { WidgetCustomization } from '@/lib/hub/types';

export interface CustomColorPickerProps {
  customization: WidgetCustomization;
  onChange: (next: WidgetCustomization) => void;
}

export default function CustomColorPicker({ customization, onChange }: CustomColorPickerProps) {
  const style = customization.style ?? {};
  const bgRaw = style.customBg ?? '#FFFFFF';
  const fgRaw = style.customFg ?? '';

  // When fg is blank, derive one from bg so the preview never renders
  // unreadable text out of the box.
  const fgEffective = useMemo(() => {
    if (fgRaw) return fgRaw;
    const bg = parseHexColor(bgRaw);
    return bg ? toHexColor(pickForegroundForBackground(bg)) : '#000000';
  }, [bgRaw, fgRaw]);

  const verdict = useMemo(() => quickContrast(bgRaw, fgEffective), [bgRaw, fgEffective]);
  const passing = verdict ? verdict.ratio >= WCAG_AA_BODY : false;

  const themeAccent = useHubStore((s) => s.theme); // not consumed yet; future warn copy

  function patchStyle(next: Partial<NonNullable<WidgetCustomization['style']>>) {
    onChange({ ...customization, style: { ...style, ...next } });
  }

  function autoFix() {
    const bg = parseHexColor(bgRaw);
    const fg = parseHexColor(fgEffective);
    if (!bg || !fg) return;
    const fixed = adjustForegroundToTarget(bg, fg, WCAG_AA_BODY);
    if (fixed) patchStyle({ customFg: toHexColor(fixed) });
  }

  function resetFg() {
    patchStyle({ customFg: undefined });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label style={rowStyle}>
        <span style={labelStyle}>Background</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="color"
            value={isValidHex(bgRaw) ? bgRaw : '#FFFFFF'}
            onChange={(e) => patchStyle({ customBg: e.target.value })}
            aria-label="Background"
          />
          <input
            type="text"
            value={bgRaw}
            onChange={(e) => patchStyle({ customBg: e.target.value })}
            style={textInputStyle}
          />
        </span>
      </label>

      <label style={rowStyle}>
        <span style={labelStyle}>Text</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="color"
            value={isValidHex(fgEffective) ? fgEffective : '#000000'}
            onChange={(e) => patchStyle({ customFg: e.target.value })}
            aria-label="Text"
          />
          <input
            type="text"
            value={fgRaw}
            placeholder={fgEffective}
            onChange={(e) => patchStyle({ customFg: e.target.value || undefined })}
            style={textInputStyle}
          />
          {fgRaw && (
            <button type="button" onClick={resetFg} style={linkButtonStyle} aria-label="Reset text color to auto-derived">
              auto
            </button>
          )}
        </span>
      </label>

      {verdict ? (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: passing ? 'var(--theme-success)' : 'var(--theme-danger)' }}>
            {verdict.ratio.toFixed(2)}:1 ({verdict.level})
          </strong>
          {!passing && (
            <button type="button" onClick={autoFix} style={secondaryButtonStyle}>
              Fix it
            </button>
          )}
        </div>
      ) : (
        <div role="status" style={{ color: 'var(--theme-danger)', fontSize: '0.85rem' }}>
          Enter valid hex colors to check contrast.
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--theme-fg-secondary)', margin: 0 }}>
        WCAG AA body text requires a contrast of at least {WCAG_AA_BODY}:1.
        {themeAccent === 'custom' && ' Your custom theme already enforces this on the page background.'}
      </p>
    </div>
  );
}

function isValidHex(s: string): boolean {
  return parseHexColor(s) !== null;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
};

const textInputStyle: React.CSSProperties = {
  width: 100,
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.85rem',
};

const linkButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--theme-accent)',
  cursor: 'pointer',
  fontSize: '0.75rem',
  textDecoration: 'underline',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: '0.85rem',
};
