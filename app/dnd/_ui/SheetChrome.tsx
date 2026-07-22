'use client';
// SheetChrome — the unified STYLE · TEMPLATE · THEME chip picker (U-4).
//
// The owner's ask: the three sheet axes chosen the SAME way — highlighted chips in one block at the top,
// on every character, every system — replacing the two collapsible dropdowns (Style/Template) and the
// in-sheet 5e THEME row. This is that block: three labelled rows of chips in the `SkinSwitch` idiom
// (a row label + `//`, then chips, the active one highlighted, colour axes carrying a swatch).
//
// It is page chrome (rendered above every sheet), so it styles from `--hx-*` + `hextech.module.css`
// rather than the 5e-scoped `.dnd-sheet` classes, and it works for EVERY system because each chip POSTs
// that axis's own endpoint — Style → `sheet_type` PATCH, Template → `/layout`, Theme → `/theme` — then
// full-reloads (the 5e store reads these fields and a soft refresh does not re-hydrate them). The option
// lists are the same catalogs the sheet uses, so the block can never offer something a sheet can't render.
import { useState } from 'react';
import styles from './hextech.module.css';
import { SHEET_STYLES } from '@/lib/dnd/sheet-styles';
import { templatesForSystem } from '@/lib/dnd/sheet-templates';
import { themeVariantsFor } from '@/app/dnd/_sheet/theme';

type Axis = 'style' | 'template' | 'theme';

export default function SheetChrome({
  characterId,
  system,
  currentSkin,
  currentTemplate,
  currentTheme,
  canWrite = true,
}: {
  characterId: string;
  system: string;
  /** `character.sheet_type` (the STYLE). 'generic' is treated as the 'default' skin. */
  currentSkin?: string;
  /** `data.sheetLayout` (the TEMPLATE), defaults to 'classic'. */
  currentTemplate?: string;
  /** `data.skinVariant` (the THEME); unset → the style's first/native palette. */
  currentTheme?: string;
  canWrite?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const skin = currentSkin === 'generic' || !currentSkin ? 'default' : currentSkin;
  const templates = templatesForSystem(system);
  const activeTemplate = currentTemplate && templates.some((t) => t.id === currentTemplate) ? currentTemplate : 'classic';
  const themes = themeVariantsFor(skin);
  const activeTheme = currentTheme && themes.some((t) => t.key === currentTheme) ? currentTheme : themes[0]?.key;

  async function post(axis: Axis, value: string) {
    const key = `${axis}:${value}`;
    setBusy(key); setErr(null);
    try {
      // Style is a column (generic PATCH); template + theme live in `data` and have their own endpoints.
      const req = axis === 'style'
        ? fetch(`/api/dnd/characters/${characterId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet_type: value }) })
        : fetch(`/api/dnd/characters/${characterId}/${axis === 'template' ? 'layout' : 'theme'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(axis === 'template' ? { layout: value } : { theme: value }) });
      const r = await req;
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Could not apply that choice.'); setBusy(null); return; }
      window.location.reload();
    } catch {
      setErr('Network error — please try again.'); setBusy(null);
    }
  }

  const chip = (opts: { axis: Axis; value: string; label: string; active: boolean; swatch?: string }) => {
    const { axis, value, label, active, swatch } = opts;
    return (
      <button
        key={`${axis}:${value}`}
        type="button"
        disabled={!!busy || !canWrite}
        onClick={() => post(axis, value)}
        aria-pressed={active}
        title={label}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
          fontSize: 12, lineHeight: 1.2, cursor: busy || !canWrite ? 'default' : 'pointer',
          fontFamily: 'var(--hx-font-display, inherit)', letterSpacing: '0.02em',
          border: active ? '1px solid var(--hx-teal-1, #0ac8b9)' : '1px solid var(--hx-line, rgba(255,255,255,0.14))',
          background: active ? 'rgba(10,200,185,0.14)' : 'rgba(255,255,255,0.03)',
          color: active ? 'var(--hx-teal-1, #0ac8b9)' : 'var(--hx-text, #e8e0cf)',
          opacity: active ? 1 : 0.82,
        }}
      >
        {swatch && <span aria-hidden style={{ width: 11, height: 11, borderRadius: '50%', background: swatch, border: '1px solid rgba(255,255,255,0.35)', boxShadow: active ? `0 0 7px ${swatch}` : 'none' }} />}
        {label}
        {busy === `${axis}:${value}` && <span aria-hidden>…</span>}
      </button>
    );
  };

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '6px 0' };
  const labelStyle: React.CSSProperties = { fontFamily: 'var(--hx-font-display)', fontSize: 12, color: 'var(--hx-gold-2)', letterSpacing: '0.08em', minWidth: 84 };

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px', display: 'grid', gap: 2 }}>
      <div style={rowStyle}>
        <span style={labelStyle}>STYLE //</span>
        {SHEET_STYLES.map((s) => chip({ axis: 'style', value: s.id, label: s.label, active: s.id === skin, swatch: s.swatch?.accent ?? s.swatch?.gold }))}
      </div>

      {templates.length > 1 && (
        <div style={rowStyle}>
          <span style={labelStyle}>TEMPLATE //</span>
          {templates.map((t) => chip({ axis: 'template', value: t.id, label: t.label, active: t.id === activeTemplate }))}
        </div>
      )}

      {themes.length > 1 && (
        <div style={rowStyle}>
          <span style={labelStyle}>THEME //</span>
          {themes.map((v) => {
            const c = v.theme.colors ?? {};
            const swatch = c.hotpink ?? c.gold ?? c.tealbright ?? undefined;
            return chip({ axis: 'theme', value: v.key, label: v.label, active: v.key === activeTheme, swatch });
          })}
        </div>
      )}

      {err && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
      {!canWrite && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>Style, template, and theme are set by the character’s owner or DM.</p>}
    </div>
  );
}
