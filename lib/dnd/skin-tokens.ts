// lib/dnd/skin-tokens.ts — bridge the picker-selectable skins onto the bespoke sheets.
//
// THE PROBLEM this closes: skins (SHEET_STYLES) restyled the 5e engine (via `.dnd-sheet.skin-<id>`
// in _sheet/styles/theme.css) but did NOTHING to the bespoke Pathfinder 2e and Intuitive Games
// sheets. Those two render entirely off the Hextech `--hx-*` CSS variables, whose default values are
// declared on the /dnd page's `.root`/`.siteChrome` and INHERITED down into the sheets. So the skin
// picker looked broken for PF2/IG characters: pick "Neon Odyssey" and nothing changed.
//
// THE BRIDGE: for a given `sheet_type`, produce a set of `--hx-*` overrides and set them as inline
// custom properties on the sheet's OWN outermost wrapper. Because CSS custom properties cascade, every
// `var(--hx-…)` deep inside the sheet re-resolves to the skin's value — no per-element restyling, no
// touching the sheet's markup beyond one `style` on the root. The 5e engine is untouched; this is a
// second, independent path for the two bespoke sheets only.
//
// WHY DERIVE, NOT HAND-MAINTAIN: the Hextech token set is ~14 variables and there are 5 skins. Rather
// than hand-write 70 hex values (and re-check them by eye), we derive every step programmatically from
// each skin's 4-colour `swatch` (bg / panel / accent / gold) with a small lighten/darken helper, so a
// swatch tweak in sheet-styles.ts flows through automatically.
//
// CONTRAST IS NON-NEGOTIABLE (the crucial correctness point): the LIGHT skins (streamer/donata/jack)
// have a near-white background, and the default `--hx-text` is a near-white cream — invisible on them.
// A naive palette flip would render an unreadable sheet. So every token that paints TEXT (body text,
// muted text, section-title gold, roll-value accent) is passed through a WCAG-style contrast clamp
// against the panel it sits on, darkening (on light skins) or lightening (on dark skins) until it is
// legible. That is the whole reason this file bothers with a luminance computation.
import type { CSSProperties } from 'react';
import { SHEET_STYLES } from './sheet-styles';

// ── tiny hex-colour math ───────────────────────────────────────────────────────
// Kept local + dependency-free (this module is imported by client sheets). All ops work on plain
// #rrggbb strings; #rgb shorthand is expanded first.

/** Parse `#rgb` or `#rrggbb` → [r,g,b] 0-255. Falls back to black on anything unparseable so a bad
 *  swatch degrades to a dark, still-readable sheet rather than throwing inside render. */
function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [0, 0, 0];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

/** Linear-mix `hex` toward `target` by `amount` (0 = hex, 1 = target). The primitive under lighten/darken. */
function mix(hex: string, target: [number, number, number], amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const [r, g, b] = toRgb(hex);
  return toHex([r + (target[0] - r) * a, g + (target[1] - g) * a, b + (target[2] - b) * a]);
}

/** Blend toward white / black. Used for the darker/lighter STEPS around each swatch colour
 *  (e.g. gold-2 → a darker gold-1 → the darkest gold-0, or bg → a lightened navy-1). */
const lighten = (hex: string, amount: number) => mix(hex, [255, 255, 255], amount);
const darken = (hex: string, amount: number) => mix(hex, [0, 0, 0], amount);

/** WCAG relative luminance (sRGB → linear). Basis for both the contrast ratio and the "is this a light
 *  colour?" test that decides which way a clamp should push. */
function luminance(hex: string): number {
  const chan = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

/** WCAG contrast ratio between two colours (1 … 21). */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Return `fg`, or a nudged version of it, that meets `ratio` against `bg`. The push direction is chosen
 * by the BACKGROUND's luminance: on a light panel we darken the foreground toward black; on a dark panel
 * we lighten it toward white — i.e. we always move AWAY from the background. Steps are small and capped
 * (the clamp), so a colour that can't reach the ratio lands at its darkest/lightest extreme rather than
 * looping forever — readable in the worst case, and never a hang inside render.
 */
function ensureContrast(fg: string, bg: string, ratio: number): string {
  const pushDark = luminance(bg) > 0.4; // light background → darken the ink; dark background → lighten it
  let out = fg;
  // 24 steps of 4% is enough to cross from any mid-tone to near-black/near-white while staying granular
  // enough that we stop as soon as the ratio is met (so we don't over-darken and lose the hue).
  for (let i = 0; i < 24 && contrast(out, bg) < ratio; i++) {
    out = pushDark ? darken(out, 0.04) : lighten(out, 0.04);
  }
  return out;
}

/**
 * Map a chosen `sheet_type` skin to the `--hx-*` overrides that restyle the bespoke PF2/IG sheets.
 *
 * Returns an EMPTY object for `default` (Hextech) and for any unknown/blank id: the default is the
 * baseline token set already declared on `.root`, so emitting nothing keeps it pixel-identical to today.
 * For every other skin it derives a full override set from the swatch, with the text-bearing tokens
 * contrast-clamped against the panel.
 *
 * Typed `CSSProperties` (with a cast) so it drops straight into a sheet's `style={{ ...skinHxVars(t) }}`;
 * TS doesn't model `--custom` keys on CSSProperties, hence the single cast at the return.
 */
export function skinHxVars(sheetType: string | undefined): CSSProperties {
  const style = SHEET_STYLES.find((s) => s.id === sheetType);
  // default IS the baseline; unknown ids fall back to the baseline too (fail safe, not blank).
  if (!style || style.id === 'default') return {};

  const { bg, panel, accent, gold } = style.swatch;
  const light = style.light === true;

  // Background steps. The screen/panel gradients read navy-1 (top) → navy-0 (bottom); we want a subtle,
  // same-hue step, not a flip. Dark skins lighten the step (a faint glow up top); light skins darken it
  // slightly so the gradient is perceptible without blowing out to pure white.
  const navy0 = bg;
  const navy1 = light ? darken(bg, 0.05) : lighten(bg, 0.06);
  const navy2 = light ? darken(bg, 0.04) : lighten(bg, 0.05);

  // Panel + its lighter companion (framed-panel gradient top) + the hairline border. On dark skins the
  // border is a lightened panel; on light skins it must be a DARKENED panel to be a visible line at all.
  const panel2 = light ? darken(panel, 0.05) : lighten(panel, 0.08);
  const line = light ? darken(panel, 0.32) : lighten(panel, 0.14);

  // Gold ramp (0 darkest … 3 lightest), all derived from the swatch's `gold`. gold-2 is the workhorse —
  // it paints section titles as TEXT on the panel — so it's the one we contrast-clamp. On light skins a
  // bright yellow-gold on near-white is illegible, so the clamp quietly deepens it to an amber that reads;
  // on dark skins the clamp is a no-op (the swatch golds already pop on the dark panels).
  const gold2 = ensureContrast(gold, panel, light ? 4 : 3);
  const gold1 = darken(gold2, 0.16);
  const gold0 = darken(gold2, light ? 0.34 : 0.45);
  // gold-3 is the "brightest" gold (title-gradient top, portrait glows). On dark skins it lightens toward
  // cream as usual; on a LIGHT skin it must NOT drift toward the near-white panel, so we hold it at gold-2
  // (kept legible) instead of lightening it into invisibility.
  const gold3 = light ? gold2 : lighten(gold2, 0.4);

  // Accent → teal ramp. teal-1 is used both as an accent border AND as roll-result / interactive text,
  // so clamp it for legibility too; teal-2 is its darker partner (borders, gradients).
  const teal1 = ensureContrast(accent, panel, light ? 4 : 3);
  const teal2 = darken(teal1, light ? 0.2 : 0.28);

  // Ink. THIS is the make-or-break pair for light skins. Body text must clear ~7:1 (AA for body) against
  // the panel; muted/secondary text clears ~4.5:1. On dark skins we lift a swatch-tinted near-white; on
  // light skins we derive a very dark, same-hue ink from the background and let the clamp finish the job.
  const text = light
    ? ensureContrast(darken(bg, 0.86), panel, 7) // dark ink from the light bg's own hue
    : ensureContrast(lighten(gold, 0.85), panel, 7); // near-white, faintly warmed by the skin's gold
  const muted = ensureContrast(mix(text, toRgb(panel), 0.42), panel, 4.5);

  const vars: Record<string, string> = {
    '--hx-navy-0': navy0,
    '--hx-navy-1': navy1,
    '--hx-navy-2': navy2,
    '--hx-panel': panel,
    '--hx-panel-2': panel2,
    '--hx-line': line,
    '--hx-gold-0': gold0,
    '--hx-gold-1': gold1,
    '--hx-gold-2': gold2,
    '--hx-gold-3': gold3,
    '--hx-teal-1': teal1,
    '--hx-teal-2': teal2,
    '--hx-text': text,
    '--hx-muted': muted,
    // --hx-danger is intentionally left to inherit the default red: it reads on both dark and light panels,
    // and skins don't ship a "danger" swatch to derive one from.
  };

  // Recessed "well" fills (stat cells, inputs, section cards). ONLY overridden for LIGHT skins: on dark
  // skins the default near-black navy recess already reads correctly against the dark panel (verified), so
  // we leave it inheriting. On a LIGHT skin that same near-black becomes a grey veil that buries the muted
  // labels sitting on it — so we swap in a whisper-soft BLACK-on-light recess (a few % alpha), which keeps
  // the recess subtle AND leaves the dark ink on top fully legible. Alphas mirror the soft/·/strong scale.
  if (light) {
    vars['--hx-inset-soft'] = 'rgba(0, 0, 0, 0.03)';
    vars['--hx-inset'] = 'rgba(0, 0, 0, 0.05)';
    vars['--hx-inset-strong'] = 'rgba(0, 0, 0, 0.08)';
  }
  // TS's CSSProperties has no index signature for `--custom` keys; the cast is the standard way to hand
  // React inline CSS custom properties. The values are all plain strings, so this is sound.
  return vars as CSSProperties;
}

/** The baseline `--hx-*` values declared on `.root` in hextech.module.css — used when the skin is
 *  `default` (where `skinHxVars` emits nothing) so the shell bridge below still has real colours to
 *  derive RGB triplets from. Keep in sync with that stylesheet's defaults. */
const HX_DEFAULTS = {
  navy0: '#010a13',
  panel: '#0b1a2c',
  line: '#1e2d3d',
  gold3: '#f0e6d2',
  teal1: '#0ac8b9',
  text: '#f0e6d2',
  muted: '#a09b8c',
} as const;

/**
 * THE SHELL TOKEN BRIDGE (T-SHELL-TOKENS). The shared format shells (Codex/Dashboard/Play) style
 * themselves with the 5e engine's theme variables — `--gold`, `--ink`, `--line`, `--muted`,
 * `--tealbright`, and the `rgba(var(--panel-rgb), …)` / `var(--void-rgb)` TRIPLETS. Those live on the
 * `.dnd-sheet` root and do NOT exist inside the bespoke PF2/IG sheets, which render off `--hx-*`
 * instead. So dropping a shell into a PF2/IG sheet would strip its colours.
 *
 * This maps the character's chosen skin to that shell token set, reusing `skinHxVars` for the actual
 * colours (so the shell inherits the skin's light/dark exactly, contrast-clamps and all) and falling
 * back to the baseline `--hx-*` defaults for the `default` skin. The RGB triplets — which pure CSS
 * cannot derive from a hex `--hx-*` var — are computed here in JS. A bespoke sheet renders a shell as
 * `<div style={shellThemeVars(sheetType)}><CodexShell …/></div>` and every `var(--gold)` inside then
 * resolves to the skin's gold. This is why "skin compatibility is free" holds across systems, not just
 * within 5e.
 */
export function shellThemeVars(sheetType: string | undefined): CSSProperties {
  const hx = skinHxVars(sheetType) as Record<string, string>;
  // For a named skin, take the computed value; for `default` (empty map) take the baseline.
  const gold3 = hx['--hx-gold-3'] ?? HX_DEFAULTS.gold3;
  const text = hx['--hx-text'] ?? HX_DEFAULTS.text;
  const muted = hx['--hx-muted'] ?? HX_DEFAULTS.muted;
  const line = hx['--hx-line'] ?? HX_DEFAULTS.line;
  const teal1 = hx['--hx-teal-1'] ?? HX_DEFAULTS.teal1;
  const panel = hx['--hx-panel'] ?? HX_DEFAULTS.panel;
  const navy0 = hx['--hx-navy-0'] ?? HX_DEFAULTS.navy0;
  const trip = (hex: string) => toRgb(hex).join(', ');

  const vars: Record<string, string> = {
    '--gold': gold3,
    '--ink': text,
    '--muted': muted,
    '--line': line,
    // The shells use `--line-strong` only for a slightly heavier divider; the skin ships one line
    // colour, so reuse it (a subtle rule is better than an invented, possibly-clashing one).
    '--line-strong': line,
    '--tealbright': teal1,
    // Danger has no skin swatch to derive from; defer to the sheet's own `--hx-danger` (which itself
    // inherits a red that reads on both dark and light panels).
    '--danger': 'var(--hx-danger, #b4453c)',
    '--font-display': 'var(--hx-font-display)',
    // The triplets pure CSS can't produce from a hex var.
    '--panel-rgb': trip(panel),
    '--void-rgb': trip(navy0),
    // Decorative accents a few shell rules reach for; harmonise them to the skin's teal rather than
    // leaving the 5e hot-pink/violet, which would clash with a re-skinned sheet.
    '--hotpink': teal1,
    '--hotpink-rgb': trip(teal1),
    '--violet-rgb': trip(teal1),
  };
  return vars as CSSProperties;
}
