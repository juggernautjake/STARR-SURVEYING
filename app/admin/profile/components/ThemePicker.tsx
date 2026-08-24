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

import { useCallback, useEffect, useState } from 'react';
import { allThemes, type ThemeDefinition } from '@/lib/hub/themes';
import '@/lib/hub/themes/register-builtins';
import type { HubLayoutRow, ThemeId } from '@/lib/hub/types';
import { broadcastAppearanceChange } from '@/lib/hub/appearance-broadcast';

interface ThemePickerProps {
  /** Initial theme — usually the saved value from
   *  `user_hub_layouts.theme` so the picker shows the right tile as
   *  active on first render. */
  initialThemeId: ThemeId;
}

/**
 * A theme built in the Page Designer that this person may choose.
 *
 * Phase T3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md. Offered here
 * when it belongs to a theme family whose layout is the design of record for its page — the rule
 * lives in `lib/design/portal-themes.ts` and is explained there.
 */
interface DesignerTheme {
  id: string;
  name: string;
  palette: ThemeDefinition['palette'];
  fromRoute: string | null;
  fromDesign: string;
}

/** The saved payload shape for a designer theme. Anchors plus derived, same as a hand-built custom
 *  theme, so nothing downstream needs to know which of the two it is. */
function payloadFor(theme: DesignerTheme) {
  const p = theme.palette;
  return {
    name: theme.name,
    designThemeId: theme.id,
    bgPage: p.bgPage,
    bgSurface: p.bgSurface,
    fgPrimary: p.fgPrimary,
    accent: p.accent,
    derived: {
      bgElevated: p.bgElevated,
      fgSecondary: p.fgSecondary,
      fgMuted: p.fgMuted,
      accentFg: p.accentFg,
      border: p.border,
      borderStrong: p.borderStrong,
      success: p.success,
      warning: p.warning,
      danger: p.danger,
      info: p.info,
    },
  };
}

export function ThemePicker({ initialThemeId }: ThemePickerProps) {
  const [selected, setSelected] = useState<ThemeId>(initialThemeId);
  const [designerThemes, setDesignerThemes] = useState<DesignerTheme[]>([]);
  // ── PREVIEW (T5) ────────────────────────────────────────────────────────────────────────────
  //
  // Owner: *"a theme is a big change to look at for the first time after applying it."*
  //
  // Previewing writes the same variables the shell writes and saves nothing. That is what makes it
  // an honest preview: it is not a swatch approximating the theme, it IS the theme, applied to the
  // page you are standing on — and cancelling puts back exactly what was there, because what was
  // there is a saved value the shell can re-apply from the store.
  const [previewing, setPreviewing] = useState<DesignerTheme | ThemeDefinition | null>(null);
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
      // Tell the shell, so the change lands on <html> now rather than on the next full page
      // load of the Hub — the only page that hydrates the store this picker used to rely on.
      broadcastAppearanceChange({
        theme: data.layout.theme, density: data.layout.density, fontScale: data.layout.fontScale,
        // Explicitly null: moving from a designer theme back to a built-in has to take the inline
        // variables off `<html>`, or the built-in's stylesheet loses to fourteen leftovers and the
        // pick appears to do nothing.
        customPalette: null,
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    // Best-effort: no designer themes is the ordinary state, and a portal settings page must not
    // fail because a build tool's table is empty or unreachable.
    void fetch('/api/admin/me/design-themes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setDesignerThemes(b?.themes ?? []))
      .catch(() => {});
  }, []);

  /** Paint a theme without saving it, and put the saved one back on cancel. */
  const preview = useCallback((theme: DesignerTheme | ThemeDefinition | null) => {
    setPreviewing(theme);
    if (!theme) {
      // Re-broadcasting the SAVED values rather than reversing the preview by hand: the shell owns
      // how a theme is applied, and a second implementation of "undo the paint" is how the two come
      // to disagree about what the saved state looks like.
      broadcastAppearanceChange({
        theme: layout?.theme ?? selected,
        customPalette: (layout?.customTheme ?? null) as unknown as Record<string, string> | null,
      });
      return;
    }
    const isDesigner = 'fromDesign' in theme;
    broadcastAppearanceChange({
      theme: isDesigner ? 'custom' : (theme as ThemeDefinition).id,
      customPalette: isDesigner ? { ...(theme as DesignerTheme).palette } : null,
    });
  }, [layout, selected]);

  async function applyDesignerTheme(theme: DesignerTheme) {
    setPreviewing(null);
    setSelected('custom');
    setError(null);
    setSaving(true);
    try {
      const payload = {
        widgets: layout?.widgets ?? [],
        activePersona: layout?.activePersona ?? null,
        theme: 'custom' as ThemeId,
        customTheme: payloadFor(theme),
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
      broadcastAppearanceChange({
        theme: 'custom',
        customPalette: { ...theme.palette },
        density: data.layout.density,
        fontScale: data.layout.fontScale,
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const themes = allThemes();
  const activeDesignerId = (layout?.customTheme as { designThemeId?: string } | null)?.designThemeId ?? null;

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

      {/* ── Themes from the Page Designer (T3) ────────────────────────────────────────────────
        * Only shown when there are any. An empty section headed "from the Page Designer" would ask
        * every employee to wonder what the Page Designer is. */}
      {designerThemes.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
            From the Page Designer
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--theme-fg-secondary)', margin: '0 0 0.75rem' }}>
            Themes built for pages whose design is the current record. Preview one before you commit
            to it — a theme is a lot to look at for the first time after applying it.
          </p>
          <div
            role="radiogroup"
            aria-label="Designer themes"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}
          >
            {designerThemes.map((theme) => (
              <div key={theme.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <ThemeTile
                  theme={{ id: theme.id as never, label: theme.name, isDark: isDarkPalette(theme.palette), palette: theme.palette }}
                  active={selected === 'custom' && activeDesignerId === theme.id}
                  disabled={saving}
                  onPick={() => void applyDesignerTheme(theme)}
                />
                <button
                  type="button"
                  onClick={() => preview(previewing && 'id' in previewing && previewing.id === theme.id ? null : theme)}
                  style={{
                    fontSize: '0.78rem', padding: '0.3rem 0.5rem', borderRadius: 6,
                    border: '1px solid var(--theme-border)', background: 'transparent',
                    color: 'var(--theme-fg-secondary)', cursor: 'pointer',
                  }}
                >
                  {previewing && 'id' in previewing && previewing.id === theme.id ? 'Stop preview' : 'Preview'}
                </button>
                {theme.fromRoute && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--theme-fg-muted)' }}>
                    from {theme.fromRoute}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The preview bar. Fixed, because a preview you cannot get out of without finding the
        * control that started it is a trap rather than a preview. */}
      {previewing && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 60,
          padding: '0.6rem 0.9rem', borderRadius: 10,
          background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-primary)',
          border: '1px solid var(--theme-border-strong)', boxShadow: '0 8px 24px rgba(0,0,0,.24)',
        }}>
          <span style={{ fontSize: '0.85rem' }}>
            Previewing <strong>{'name' in previewing ? previewing.name : previewing.label}</strong> — nothing is saved yet.
          </span>
          <button
            type="button"
            onClick={() => { const t = previewing; setPreviewing(null); if (t && 'fromDesign' in t) void applyDesignerTheme(t as DesignerTheme); }}
            style={{
              fontSize: '0.85rem', padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none',
              background: 'var(--theme-accent)', color: 'var(--theme-accent-fg)', cursor: 'pointer',
            }}
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => preview(null)}
            style={{
              fontSize: '0.85rem', padding: '0.35rem 0.7rem', borderRadius: 6,
              border: '1px solid var(--theme-border)', background: 'transparent',
              color: 'var(--theme-fg-primary)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

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

/** Light or dark, from the page background's own luminance. A designer theme does not declare
 *  which it is, and guessing from its name would be guessing. */
function isDarkPalette(palette: ThemeDefinition['palette']): boolean {
  const hex = (palette.bgPage || '#ffffff').replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return false;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
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
