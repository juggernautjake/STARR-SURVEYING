'use client';
// app/admin/profile/components/ThemePicker.tsx
//
// Hub theme picker, lives under the new "Themes" tab on /admin/profile.
// Renders one preview tile per registered built-in theme + a "Custom"
// option (placeholder until slice 106 wires the custom picker).
//
// Saving hits PUT /api/admin/me/hub-layout. The server writes the
// theme field — the rest of the layout JSON is preserved by sending
// the current widgets + active_persona unchanged in the same call.
//
// Slice 82 of customizable-hub-and-work-mode-2026-05-28.md.

import { useEffect, useState } from 'react';
import { allThemes, type ThemeDefinition } from '@/lib/hub/themes';
import '@/lib/hub/themes/register-builtins';
import type { HubLayoutRow, ThemeId } from '@/lib/hub/types';

interface ThemePickerProps {
  /** Initial theme — usually the saved value from
   *  `user_hub_layouts.theme` so the picker shows the right tile as
   *  active on first render. */
  initialThemeId: ThemeId;
}

export function ThemePicker({ initialThemeId }: ThemePickerProps) {
  const [selected, setSelected] = useState<ThemeId>(initialThemeId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [layout, setLayout] = useState<HubLayoutRow | null>(null);

  // Fetch the current layout once so we can echo widgets + active_persona
  // back to the API on save without clobbering them.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/me/hub-layout', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { layout: HubLayoutRow | null };
        if (!cancelled) setLayout(data.layout);
      } catch {
        /* layout fetch is best-effort; saving still works */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function applyTheme(themeId: ThemeId) {
    setSelected(themeId);
    setError(null);
    setSaving(true);
    try {
      const payload = {
        widgets: layout?.widgets ?? [],
        activePersona: layout?.activePersona ?? null,
        theme: themeId,
        customTheme: layout?.customTheme ?? null,
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
      setLayout(data.layout);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const themes = allThemes();

  return (
    <div className="admin-card">
      <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
        Hub theme
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--theme-fg-secondary)', margin: '0 0 1rem' }}>
        Picks the colour palette for your hub. Affects widgets, headings, and
        accent links. Saves immediately.
      </p>

      <div
        role="radiogroup"
        aria-label="Hub theme"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        {themes.map((theme) => (
          <ThemeTile
            key={theme.id}
            theme={theme}
            active={selected === theme.id}
            disabled={saving}
            onPick={() => applyTheme(theme.id)}
          />
        ))}
      </div>

      {error && (
        <div style={{
          padding: '0.5rem 0.75rem',
          borderRadius: 6,
          background: 'var(--color-error-bg)',
          color: 'var(--color-error)',
          fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}
      {savedFlash && (
        <div style={{ fontSize: '0.85rem', color: '#059669' }}>
          ✓ Saved.
        </div>
      )}
    </div>
  );
}

function ThemeTile({
  theme,
  active,
  disabled,
  onPick,
}: {
  theme: ThemeDefinition;
  active: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const { palette } = theme;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onPick}
      style={{
        textAlign: 'left',
        background: palette.bgSurface,
        color: palette.fgPrimary,
        border: `2px solid ${active ? palette.accent : palette.border}`,
        borderRadius: 10,
        padding: '0.75rem',
        cursor: disabled ? 'progress' : 'pointer',
        boxShadow: active ? `0 0 0 3px ${palette.accent}33` : 'none',
        transition: 'transform 0.1s ease-out',
      }}
    >
      <div style={{
        display: 'flex',
        gap: '0.25rem',
        marginBottom: '0.5rem',
      }}>
        <span style={{ width: 18, height: 18, borderRadius: 4, background: palette.bgPage, border: `1px solid ${palette.border}` }} aria-hidden />
        <span style={{ width: 18, height: 18, borderRadius: 4, background: palette.bgSurface, border: `1px solid ${palette.border}` }} aria-hidden />
        <span style={{ width: 18, height: 18, borderRadius: 4, background: palette.accent }} aria-hidden />
        <span style={{ width: 18, height: 18, borderRadius: 4, background: palette.success }} aria-hidden />
        <span style={{ width: 18, height: 18, borderRadius: 4, background: palette.warning }} aria-hidden />
        <span style={{ width: 18, height: 18, borderRadius: 4, background: palette.danger }} aria-hidden />
      </div>
      <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{theme.label}</div>
      <div style={{ fontSize: '0.78rem', color: palette.fgSecondary, marginTop: 2 }}>
        {theme.isDark ? 'Dark' : 'Light'}
      </div>
    </button>
  );
}
