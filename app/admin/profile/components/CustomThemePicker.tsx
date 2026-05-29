'use client';
// app/admin/profile/components/CustomThemePicker.tsx
//
// 4-input custom theme builder. Users pick bg page / bg surface / fg
// primary / accent; the helper derives the other 8 colors + runs the
// WCAG contrast audit. Save is disabled until both primary-on-surface
// and primary-on-page clear AA. "Fix it" walks the foreground toward
// the closest accessible variant.
//
// Slice 106 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useMemo, useState } from 'react';
import {
  autoFixCustomTheme,
  buildCustomTheme,
  isCustomThemeAccessible,
  isHexColor,
  quickContrast,
  WCAG_AA_BODY,
} from '@/lib/hub/themes/custom';
import type { CustomThemePayload, HubLayoutRow } from '@/lib/hub/types';

const DEFAULT_INPUTS = {
  name: '',
  bgPage:    '#F8FAFC',
  bgSurface: '#FFFFFF',
  fgPrimary: '#0F172A',
  accent:    '#1D3095',
};

interface CustomThemePickerProps {
  /** Current saved layout — used to PUT alongside the new theme so
   *  the rest of the layout doesn't get clobbered. */
  layout: HubLayoutRow | null;
  /** Called when the save lands successfully. The picker doesn't
   *  navigate; the parent decides what to do (usually a Saved flash). */
  onSaved?: (saved: HubLayoutRow) => void;
}

export default function CustomThemePicker({ layout, onSaved }: CustomThemePickerProps) {
  const [inputs, setInputs] = useState(() => readInputsFromLayout(layout) ?? DEFAULT_INPUTS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed when the layout finishes loading.
  useEffect(() => {
    const seeded = readInputsFromLayout(layout);
    if (seeded) setInputs(seeded);
  }, [layout]);

  const allValid = useMemo(
    () => isHexColor(inputs.bgPage) && isHexColor(inputs.bgSurface) && isHexColor(inputs.fgPrimary) && isHexColor(inputs.accent),
    [inputs],
  );

  const customTheme = useMemo(() => (allValid ? buildCustomTheme(inputs) : null), [allValid, inputs]);
  const accessible = customTheme ? isCustomThemeAccessible(customTheme) : false;

  function patch(field: keyof typeof inputs, value: string) {
    setInputs((prev) => ({ ...prev, [field]: value }));
  }

  function applyAutoFix() {
    const fixed = autoFixCustomTheme(inputs);
    if (fixed) setInputs({ ...inputs, fgPrimary: fixed.fgPrimary });
  }

  async function save() {
    if (!customTheme || !accessible) return;
    setError(null);
    setSaving(true);
    try {
      const payload = {
        widgets: layout?.widgets ?? [],
        activePersona: layout?.activePersona ?? null,
        theme: 'custom' as const,
        customTheme,
        density: layout?.density ?? 'comfortable',
        fontScale: layout?.fontScale ?? 1.0,
        hubSettings: layout?.hubSettings ?? {},
      };
      const res = await fetch('/api/admin/me/hub-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(err?.error ?? `Save failed (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { layout: HubLayoutRow };
      onSaved?.(data.layout);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const primaryOnSurface = quickContrast(inputs.bgSurface, inputs.fgPrimary);
  const primaryOnPage = quickContrast(inputs.bgPage, inputs.fgPrimary);

  return (
    <div className="admin-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Custom theme</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--theme-fg-secondary)', margin: 0 }}>
        Pick four anchor colors; the rest auto-derive. Save unlocks once the body-text contrast clears WCAG AA ({WCAG_AA_BODY}:1).
      </p>

      <label>
        <span style={labelStyle}>Theme name (optional)</span>
        <input
          type="text"
          value={inputs.name}
          placeholder="Custom"
          onChange={(e) => patch('name', e.target.value)}
          style={textInputStyle}
        />
      </label>

      <div style={pickerGridStyle}>
        <ColorInput label="Page background" value={inputs.bgPage} onChange={(v) => patch('bgPage', v)} />
        <ColorInput label="Surface background" value={inputs.bgSurface} onChange={(v) => patch('bgSurface', v)} />
        <ColorInput label="Primary text" value={inputs.fgPrimary} onChange={(v) => patch('fgPrimary', v)} />
        <ColorInput label="Accent" value={inputs.accent} onChange={(v) => patch('accent', v)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ContrastBadge label="Body text on surface" verdict={primaryOnSurface} />
        <ContrastBadge label="Body text on page background" verdict={primaryOnPage} />
      </div>

      {customTheme && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
          <Swatch label="Elevated" hex={customTheme.derived.bgElevated} />
          <Swatch label="Secondary" hex={customTheme.derived.fgSecondary} />
          <Swatch label="Muted" hex={customTheme.derived.fgMuted} />
          <Swatch label="Accent text" hex={customTheme.derived.accentFg} />
          <Swatch label="Border" hex={customTheme.derived.border} />
          <Swatch label="Border strong" hex={customTheme.derived.borderStrong} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={save}
          disabled={!accessible || saving}
          style={{
            ...primaryButtonStyle,
            opacity: !accessible || saving ? 0.6 : 1,
            cursor: !accessible || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save theme'}
        </button>
        {!accessible && allValid && (
          <button type="button" onClick={applyAutoFix} style={secondaryButtonStyle}>
            Fix it
          </button>
        )}
      </div>

      {error && (
        <div role="alert" style={errorStyle}>{error}</div>
      )}
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  const valid = isHexColor(value);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="color"
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...textInputStyle, width: 96 }}
        />
        {!valid && <span style={{ fontSize: '0.75rem', color: 'var(--theme-danger)' }}>Invalid hex</span>}
      </div>
    </label>
  );
}

function ContrastBadge({ label, verdict }: { label: string; verdict: ReturnType<typeof quickContrast> }) {
  if (!verdict) return <span style={smallStyle}>{label}: —</span>;
  const passing = verdict.ratio >= WCAG_AA_BODY;
  return (
    <span style={smallStyle}>
      {label}: {' '}
      <strong style={{ color: passing ? 'var(--theme-success)' : 'var(--theme-danger)' }}>
        {verdict.ratio.toFixed(2)}:1 ({verdict.level})
      </strong>
    </span>
  );
}

function Swatch({ label, hex }: { label: string; hex: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span
        aria-hidden
        style={{ display: 'block', width: '100%', height: 32, borderRadius: 4, background: hex, border: '1px solid var(--theme-border)' }}
      />
      <span style={smallStyle}>{label}</span>
      <span style={{ ...smallStyle, fontFamily: 'monospace' }}>{hex}</span>
    </div>
  );
}

function readInputsFromLayout(layout: HubLayoutRow | null): typeof DEFAULT_INPUTS | null {
  const ct: CustomThemePayload | null = layout?.customTheme ?? null;
  if (!ct) return null;
  return {
    name: ct.name ?? '',
    bgPage: ct.bgPage,
    bgSurface: ct.bgSurface,
    fgPrimary: ct.fgPrimary,
    accent: ct.accent,
  };
}

// ─── Style fragments ───────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  marginBottom: 4,
};

const textInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.85rem',
};

const pickerGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: 12,
};

const smallStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--theme-fg-secondary)',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg)',
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 4,
  background: 'color-mix(in srgb, var(--theme-danger) 12%, var(--theme-bg-surface))',
  color: 'var(--theme-danger)',
  border: '1px solid var(--theme-danger)',
  fontSize: '0.85rem',
};
