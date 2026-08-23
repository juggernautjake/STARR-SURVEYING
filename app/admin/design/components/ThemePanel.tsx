'use client';
// app/admin/design/components/ThemePanel.tsx — pick a look, or build one from a colour.
//
// Phases T and P of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// Owner: *"I want to be able to make different themes and stuff to really get any look I want. I
// want to be able to create color palettes and stuff that we can set as the default for a theme and
// that will automatically be applied to the elements."*
//
// ── THREE WAYS IN, IN THE ORDER PEOPLE ACTUALLY WANT THEM ───────────────────────────────────────
//
//   1. **Pick one.** Six starting points. Most of the time this is the whole interaction.
//   2. **Grow one from a colour.** Choose a colour and a harmony; the palette and a matching theme
//      are generated, contrast-corrected, and applied. This is the owner's "set a palette as the
//      default for a theme and have it automatically applied" — one control, both halves.
//   3. **Change one token.** When neither of the above lands exactly, edit the twenty-eight.
//
// Every route ends in the same place: a token map on the artboard. There is no mode where the
// preview and the export could disagree, because there is only one representation.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Palette as PaletteIcon, Wand2, Check, AlertTriangle, Save } from 'lucide-react';
import {
  BUILT_IN_THEMES, THEME_TOKENS, TOKEN_GROUPS, themeContrastProblems,
  type Theme, type TokenName, type TokenGroup,
} from '@/lib/design/theme';
import {
  buildPalette, themeFromPalette, enforceContrast, HARMONIES,
  type Harmony, type Palette, type Adjustment,
} from '@/lib/design/palette';

interface Props {
  theme: Theme | null;
  onChange: (theme: Theme | null) => void;
  onClose: () => void;
}

export default function ThemePanel({ theme, onChange, onClose }: Props) {
  const [seed, setSeed] = useState('#1D3095');
  const [harmony, setHarmony] = useState<Harmony>('split-complementary');
  const [dark, setDark] = useState(false);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [openGroup, setOpenGroup] = useState<TokenGroup | null>(null);
  const [saved, setSaved] = useState<Array<{ id: string; name: string; tokens: Record<string, string>; paletteId: string | null }>>([]);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadLibrary = useCallback(() => {
    fetch('/api/admin/design/themes')
      .then((r) => r.json())
      .then((body) => setSaved(body.themes ?? []))
      .catch(() => { /* the built-ins are still there; a missing library is not a broken panel */ });
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  async function saveToLibrary() {
    if (!theme) return;
    setSaving(true);
    const name = saveName.trim() || theme.name || 'Untitled theme';
    // A new id when saving under a new name, so "save as" is the natural gesture rather than a
    // second control nobody finds.
    const id = saved.some((s) => s.id === theme.id) && name === theme.name
      ? theme.id
      : `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    await fetch('/api/admin/design/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: { id, name, tokens: theme.tokens, paletteId: palette?.id ?? theme.paletteId ?? null, isDark: dark },
        palette: palette ? { id: palette.id, name: palette.name, swatches: palette.swatches, seed, harmony } : undefined,
      }),
    }).catch(() => {});
    onChange({ ...theme, id, name });
    setSaveName('');
    setSaving(false);
    loadLibrary();
  }

  // Previewed live, so choosing a harmony shows what it does before it is applied.
  const preview = useMemo(() => buildPalette(seed, harmony, 'Preview'), [seed, harmony]);

  const problems = useMemo(
    () => (theme ? themeContrastProblems(theme, () => '#FFFFFF') : []),
    [theme],
  );

  function generate() {
    const built = buildPalette(seed, harmony, `${harmony} from ${seed}`);
    // The guard is not optional. An auto-assignment WILL eventually produce unreadable text, and a
    // generated theme looks deliberate — nobody reviews it as sceptically as one they mixed.
    const { theme: generated, adjustments: fixes } = enforceContrast(themeFromPalette(built, { dark }));
    setPalette(built);
    setAdjustments(fixes);
    onChange(generated);
  }

  function setToken(token: TokenName, value: string) {
    onChange({
      id: theme?.id ?? `t-${Date.now().toString(36)}`,
      name: theme?.name ?? 'Custom',
      paletteId: theme?.paletteId ?? null,
      tokens: { ...(theme?.tokens ?? {}), [token]: value },
    });
  }

  return (
    <section className="dsx-theme" aria-label="Theme">
      <header className="dsx-theme__head">
        <strong><PaletteIcon size={15} aria-hidden /> Theme</strong>
        <span>{theme ? theme.name : 'The app’s own colours'}</span>
        <button className="dsx__tool" onClick={onClose}>Close</button>
      </header>

      {/* ── 1. Pick one ──────────────────────────────────────────────────────────────────────── */}
      <div className="dsx-theme__section">
        <h4>Start from</h4>
        <div className="dsx-theme__presets">
          {BUILT_IN_THEMES.map((preset) => {
            const on = theme?.id === preset.id || (!theme && preset.id === 'starr-default');
            return (
              <button
                key={preset.id}
                className={`dsx-theme__preset${on ? ' is-on' : ''}`}
                onClick={() => onChange(preset.id === 'starr-default' ? null : { ...preset, builtIn: undefined })}
                title={preset.name}
              >
                {/* Three swatches say more about a theme than its name does. */}
                <span className="dsx-theme__chips">
                  <i style={{ background: preset.tokens['--theme-bg-page'] ?? 'var(--theme-bg-page)' }} />
                  <i style={{ background: preset.tokens['--theme-accent'] ?? 'var(--theme-accent)' }} />
                  <i style={{ background: preset.tokens['--theme-fg-primary'] ?? 'var(--theme-fg-primary)' }} />
                </span>
                <span className="dsx-theme__preset-name">{preset.name}</span>
                {on && <Check size={13} aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Grow one from a colour ────────────────────────────────────────────────────────── */}
      <div className="dsx-theme__section">
        <h4>Or build one from a colour</h4>
        <div className="dsx-theme__builder">
          <label className="dsx-theme__field">
            <span>Colour</span>
            <input type="color" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <label className="dsx-theme__field dsx-theme__field--grow">
            <span>Harmony</span>
            <select value={harmony} onChange={(e) => setHarmony(e.target.value as Harmony)}>
              {HARMONIES.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            </select>
          </label>
          <label className="dsx-theme__field">
            <span>Dark</span>
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
          </label>
          <button className="dsx__tool dsx__tool--primary" onClick={generate}>
            <Wand2 size={14} aria-hidden /> Apply
          </button>
        </div>

        <p className="dsx-theme__hint">{HARMONIES.find((h) => h.id === harmony)?.description}</p>

        {/* The palette this would produce, before committing to it. */}
        <div className="dsx-theme__swatches">
          {preview.swatches.map((s) => (
            <span key={`${s.name}-${s.value}`} className="dsx-theme__swatch" title={`${s.name} — ${s.value}`}>
              <i style={{ background: s.value }} />
            </span>
          ))}
        </div>

        {palette && (
          <p className="dsx-theme__hint">
            Palette <strong>{palette.name}</strong> — {palette.swatches.length} colours, applied to
            every element on the artboard.
          </p>
        )}

        {/* What the contrast guard had to change, said out loud. A generator that silently
          * "corrects" your colour is one you stop trusting the moment you notice. */}
        {adjustments.length > 0 && (
          <ul className="dsx-theme__adjustments">
            {adjustments.map((a) => (
              <li key={a.token}>
                <i style={{ background: a.from }} /> → <i style={{ background: a.to }} />
                <span>{a.why}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Readability of whatever is currently applied ──────────────────────────────────────── */}
      {problems.length > 0 && (
        <div className="dsx-theme__problems">
          <strong><AlertTriangle size={14} aria-hidden /> Hard to read</strong>
          <ul>
            {problems.map((p) => (
              <li key={p.label}>{p.label} — {p.ratio}:1, needs {p.needed}:1</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 3. Change one token ──────────────────────────────────────────────────────────────── */}
      <div className="dsx-theme__section">
        <h4>Every colour</h4>
        {TOKEN_GROUPS.map((group) => {
          const tokens = THEME_TOKENS.filter((t) => t.group === group.id);
          const isOpen = openGroup === group.id;
          return (
            <div key={group.id} className="dsx-theme__group">
              <button
                className="dsx-theme__group-head"
                onClick={() => setOpenGroup(isOpen ? null : group.id)}
                aria-expanded={isOpen}
              >
                <span>{group.label}</span>
                <span className="dsx-theme__group-chips">
                  {tokens.slice(0, 5).map((t) => (
                    <i key={t.name} style={{ background: theme?.tokens[t.name] ?? 'transparent' }} />
                  ))}
                </span>
              </button>
              {isOpen && (
                <div className="dsx-theme__tokens">
                  {tokens.map((t) => (
                    <label key={t.name} className="dsx-theme__token">
                      <input
                        type="color"
                        value={theme?.tokens[t.name] ?? '#ffffff'}
                        onChange={(e) => setToken(t.name, e.target.value)}
                      />
                      <span>{t.label}</span>
                      {/* An unset token falls through to the app's own value; saying so beats
                        * showing white and letting somebody think they set it. */}
                      {!theme?.tokens[t.name] && <em>app default</em>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Saved themes ─────────────────────────────────────────────────────────────────────
        * The library you copy FROM. A design keeps its own embedded copy, so tuning a theme here
        * never silently changes a page that was already designed with it — which is what makes it
        * safe to keep adjusting one after you have used it. */}
      {saved.length > 0 && (
        <div className="dsx-theme__section">
          <h4>Your themes</h4>
          <div className="dsx-theme__presets">
            {saved.map((s) => (
              <button
                key={s.id}
                className={`dsx-theme__preset${theme?.id === s.id ? ' is-on' : ''}`}
                onClick={() => onChange({ id: s.id, name: s.name, tokens: s.tokens, paletteId: s.paletteId })}
                title={`Use ${s.name}`}
              >
                <span className="dsx-theme__chips">
                  <i style={{ background: s.tokens['--theme-bg-page'] ?? 'var(--theme-bg-page)' }} />
                  <i style={{ background: s.tokens['--theme-accent'] ?? 'var(--theme-accent)' }} />
                  <i style={{ background: s.tokens['--theme-fg-primary'] ?? 'var(--theme-fg-primary)' }} />
                </span>
                <span className="dsx-theme__preset-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="dsx-theme__foot">
        <input
          className="dsx-theme__save-name"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder={theme?.name ?? 'Name this theme'}
          aria-label="Theme name"
        />
        <button
          className="dsx__tool dsx__tool--primary"
          disabled={!theme || saving}
          onClick={saveToLibrary}
          title="Save it so it can be used on other pages"
        >
          <Save size={14} aria-hidden /> {saving ? 'Saving…' : 'Save theme'}
        </button>
        <button className="dsx__tool" onClick={() => { onChange(null); setPalette(null); setAdjustments([]); }}>
          Back to the app’s colours
        </button>
      </footer>
    </section>
  );
}
