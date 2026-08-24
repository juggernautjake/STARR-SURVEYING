'use client';
// app/admin/components/ShellTheme.tsx — the chosen theme, on every admin page.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// Owner: *"make sure we actually have all of the different themes built out and that they look good
// and that they are applied as soon as they are selected by the user to all pages."*
//
// Eleven built-in themes exist, each a full palette in `app/styles/themes.css`, and they were only
// ever applied to **one page**. `ThemeProvider` renders a scoped `<div data-theme="…">`, and its
// only mount is `HubProviders` inside `HubMeClient` — the Hub. Pick "Forest Dark", and the Hub goes
// dark while every other page in the product stays default. The theme was not half-built; it was
// **applied at the wrong level**, which looks identical to being broken and is much easier to miss,
// because the page you change it on is the page it works on.
//
// This puts the attribute on an element that wraps the whole admin shell, so the same CSS-variable
// cascade the Hub relies on covers the sidebar, top bar, every page body and every dialog.
//
// ── WHY THE ATTRIBUTE IS SET ON <html>, NOT ON A WRAPPER DIV ────────────────────────────────────
//
// A wrapper only themes what is inside it. Dialogs, toasts, the command palette and the FAB pill are
// portalled to `document.body` — outside any wrapper the layout renders — so a wrapper would leave
// exactly the surfaces that float above the page unthemed. That is worse than no theme: a dark app
// with a white modal reads as a bug, where a uniformly light app just reads as light.
//
// ── AND WHY IT DOES NOT WAIT FOR THE NETWORK ────────────────────────────────────────────────────
//
// The preference is read from the Hub store, which the Hub hydrates from `/api/admin/me/hub-data`.
// On a first paint of some other page that store is empty, so this writes nothing and the default
// palette shows — correct, and not a flash of the wrong theme, because "no attribute" IS the
// default theme rather than a third state.
//
// A `localStorage` echo carries the choice across a hard navigation so a themed user does not see
// the default for one paint on every page load. It is a cache of a server-owned value: the store
// always wins once it arrives, and a stale echo can only be wrong until the next hydrate.

import { useCallback, useEffect } from 'react';
import { useHubStore } from '@/lib/hub/hub-store';
import { clampFontScale } from '@/lib/hub/validate-layout';
import { APPEARANCE_CHANGED, type AppearanceChange } from '@/lib/hub/appearance-broadcast';

/** Same key the picker writes through the store; kept here because this component must be able to
 *  read it before any Hub code has run on the page. */
const ECHO_KEY = 'starr-shell-theme';
/** The custom palette echo. Same contract as the theme echo: a cache of a server-owned value that
 *  can only ever be wrong until the next hydrate. */
const ECHO_PALETTE_KEY = 'starr-shell-palette';
const ECHO_DENSITY_KEY = 'starr-shell-density';
const ECHO_FONT_KEY = 'starr-shell-font-scale';

/**
 * The fourteen variables a custom palette sets, and the shape it arrives in.
 *
 * Phase T3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md. Written on
 * `<html>` rather than on a wrapper for exactly the reason the theme attribute is: dialogs, toasts
 * and the command palette are portalled to `document.body`, and a wrapper would leave the
 * surfaces that float above the page wearing the default palette — a dark app with a white modal,
 * which reads as a bug where a uniformly light app just reads as light.
 */
const PALETTE_VARS: Record<string, string> = {
  bgPage: '--theme-bg-page',
  bgSurface: '--theme-bg-surface',
  bgElevated: '--theme-bg-elevated',
  fgPrimary: '--theme-fg-primary',
  fgSecondary: '--theme-fg-secondary',
  fgMuted: '--theme-fg-muted',
  accent: '--theme-accent',
  accentFg: '--theme-accent-fg',
  border: '--theme-border',
  borderStrong: '--theme-border-strong',
  success: '--theme-success',
  warning: '--theme-warning',
  danger: '--theme-danger',
  info: '--theme-info',
};

/** A saved custom theme, flattened to the fourteen. Anchors and derived colours live in different
 *  places on the payload; every reader of it would otherwise re-learn that. */
function paletteOf(custom: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!custom) return null;
  const derived = (custom.derived ?? {}) as Record<string, string>;
  const flat: Record<string, string> = {
    bgPage: custom.bgPage as string,
    bgSurface: custom.bgSurface as string,
    fgPrimary: custom.fgPrimary as string,
    accent: custom.accent as string,
    ...derived,
  };
  return Object.values(flat).some(Boolean) ? flat : null;
}

function writePalette(palette: Record<string, string> | null): void {
  const el = document.documentElement;
  for (const [key, cssVar] of Object.entries(PALETTE_VARS)) {
    const value = palette?.[key];
    if (value) el.style.setProperty(cssVar, value);
    // Removed rather than left behind: switching from a custom theme back to a built-in must not
    // leave four inline variables winning over the stylesheet the built-in relies on.
    else el.style.removeProperty(cssVar);
  }
}

export default function ShellTheme() {
  const theme = useHubStore((s) => s.theme);
  const customTheme = useHubStore((s) => s.customTheme);
  const density = useHubStore((s) => s.density);
  const fontScale = useHubStore((s) => s.fontScale);

  // Paint the echoed value immediately, before the store has hydrated.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      const echoed = localStorage.getItem(ECHO_KEY);
      if (echoed && !document.documentElement.hasAttribute('data-theme')) {
        document.documentElement.setAttribute('data-theme', echoed);
        // A custom theme is fourteen values, not an attribute. Painting the attribute without them
        // is worse than painting nothing: `[data-theme="custom"]` aliases the app's static tokens
        // to `--theme-*` variables that would not exist yet.
        if (echoed === 'custom') {
          const raw = localStorage.getItem(ECHO_PALETTE_KEY);
          if (raw) { try { writePalette(JSON.parse(raw) as Record<string, string>); } catch { /* ignore */ } }
        }
      }
      const echoedDensity = localStorage.getItem(ECHO_DENSITY_KEY);
      if (echoedDensity && !document.documentElement.hasAttribute('data-density')) {
        document.documentElement.setAttribute('data-density', echoedDensity);
      }
      // Clamped even though we wrote it: localStorage is user-writable, and this value is a
      // multiplier on every font size in the shell.
      const echoedFont = localStorage.getItem(ECHO_FONT_KEY);
      if (echoedFont) {
        const n = Number.parseFloat(echoedFont);
        if (Number.isFinite(n)) {
          document.documentElement.style.setProperty('--hub-font-scale', String(clampFontScale(n)));
        }
      }
    } catch { /* private mode — the default palette is a fine outcome */ }
  }, []);

  // The authoritative pass. Runs on every change, which is what makes a pick apply instantly across
  // the shell rather than on the next page load.
  useEffect(() => {
    if (typeof document === 'undefined' || !theme) return;
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(ECHO_KEY, theme); } catch { /* ignore */ }

    const palette = theme === 'custom' ? paletteOf(customTheme as Record<string, unknown> | null) : null;
    writePalette(palette);
    try {
      if (palette) localStorage.setItem(ECHO_PALETTE_KEY, JSON.stringify(palette));
      else localStorage.removeItem(ECHO_PALETTE_KEY);
    } catch { /* private mode — the palette re-arrives on the next hydrate */ }
  }, [theme, customTheme]);

  useEffect(() => {
    if (typeof document === 'undefined' || !density) return;
    document.documentElement.setAttribute('data-density', density);
    try { localStorage.setItem(ECHO_DENSITY_KEY, density); } catch { /* ignore */ }
  }, [density]);

  // ── Font scale, CLAMPED on the way out as well as on the way in ─────────────────────────────
  //
  // `clampFontScale` (0.875–1.5) already runs server-side on save, so a value from the API is safe.
  // It is applied again here because this is not the only way a number reaches the page: the echo
  // below is `localStorage`, which is user-writable, survives a sign-out, and outlives any change
  // to the picker's own bounds. An unclamped multiplier does not degrade gracefully — at 5× the
  // top bar swallows the page and the controls that would let you fix it are the ones off-screen.
  //
  // The same clamp on both sides is deliberate rather than redundant: a second implementation of
  // the bounds is how they come to disagree, so this imports the one the server uses.
  useEffect(() => {
    if (typeof document === 'undefined' || fontScale == null) return;
    const safe = clampFontScale(fontScale);
    document.documentElement.style.setProperty('--hub-font-scale', String(safe));
    try { localStorage.setItem(ECHO_FONT_KEY, String(safe)); } catch { /* ignore */ }
  }, [fontScale]);

  /** One place that writes to `<html>`, so the three sources — store, event, fetch — cannot apply
   *  the same value three slightly different ways. */
  const apply = useCallback((c: AppearanceChange) => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    if (c.theme) {
      el.setAttribute('data-theme', c.theme);
      try { localStorage.setItem(ECHO_KEY, c.theme); } catch { /* ignore */ }
      // `customPalette` is only meaningful with a theme, and a theme change without one means the
      // person moved to a built-in — so the inline variables come off in the same breath.
      const palette = c.theme === 'custom' ? (c.customPalette ?? null) : null;
      writePalette(palette);
      try {
        if (palette) localStorage.setItem(ECHO_PALETTE_KEY, JSON.stringify(palette));
        else localStorage.removeItem(ECHO_PALETTE_KEY);
      } catch { /* ignore */ }
    }
    if (c.density) {
      el.setAttribute('data-density', c.density);
      try { localStorage.setItem(ECHO_DENSITY_KEY, c.density); } catch { /* ignore */ }
    }
    if (c.fontScale != null) {
      const safe = clampFontScale(c.fontScale);
      el.style.setProperty('--hub-font-scale', String(safe));
      try { localStorage.setItem(ECHO_FONT_KEY, String(safe)); } catch { /* ignore */ }
    }
  }, []);

  // ── The picker's change lands NOW ───────────────────────────────────────────────────────────
  //
  // The three pickers save to `/api/admin/me/hub-layout` and update their own local state. Neither
  // touches this store, so before this listener existed a chosen theme did nothing until the next
  // full load of the Hub — the only page that hydrates the store — and never at all on any other
  // page. The setting appeared broken while saving correctly.
  useEffect(() => {
    const onChange = (e: Event) => apply((e as CustomEvent<AppearanceChange>).detail ?? {});
    window.addEventListener(APPEARANCE_CHANGED, onChange);
    return () => window.removeEventListener(APPEARANCE_CHANGED, onChange);
  }, [apply]);

  // ── A hard load of any page, for a user whose store is empty ────────────────────────────────
  //
  // Only the Hub hydrates the store. Open `/admin/jobs` directly and `theme` is null forever, so
  // the shell would show the default no matter what was saved. The localStorage echo covers repeat
  // visits — but it has to be written once, and a new device has never written it.
  //
  // Fetched only when the store has nothing AND the echo has nothing, so the common path stays a
  // zero-request render. Failure is silent on purpose: the default palette is a correct outcome,
  // and an appearance preference is not worth an error message.
  useEffect(() => {
    if (typeof window === 'undefined' || theme) return;
    try { if (localStorage.getItem(ECHO_KEY)) return; } catch { /* private mode — just fetch */ }

    let cancelled = false;
    void fetch('/api/admin/me/hub-layout', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { layout?: (AppearanceChange & { customTheme?: Record<string, unknown> | null }) } | null) => {
        if (cancelled || !j?.layout) return;
        apply({ ...j.layout, customPalette: paletteOf(j.layout.customTheme) });
      })
      .catch(() => { /* the default palette is fine */ });
    return () => { cancelled = true; };
  }, [theme, apply]);

  return null;
}
