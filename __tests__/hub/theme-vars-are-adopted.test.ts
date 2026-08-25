// __tests__/hub/theme-vars-are-adopted.test.ts
//
// Owner, 2026-08-04: *"make sure all of the themes and formatting settings are all functional and
// all look good on every page."*
//
// ── THE MEASUREMENT THAT ANSWERS IT, AND IT IS NOT FLATTERING ───────────────────────────────────
//
// Eleven themes exist, each a complete 14-variable palette. `data-theme` now sits on `<html>`, so
// the cascade reaches every page. And measured the same day: **4,199 hardcoded colour declarations
// across admin CSS, and ZERO uses of `var(--theme-*)`.**
//
// The variables were consumed only by Hub widgets. So the honest state was: pick a dark theme, and
// the Hub's widgets go dark while the shell and every other page stay white. **That is worse than
// no theme**, because half the screen changes and half does not, which reads as a rendering fault
// rather than a setting.
//
// ── WHY THIS IS A RATCHET AND NOT A BAN ─────────────────────────────────────────────────────────
//
// Converting 4,000 declarations is not a slice. Each one needs its contrast checked against eleven
// palettes, and a blanket find-and-replace is precisely how you get white text on a white card —
// a "fix" that passes every structural check and is unusable.
//
// So the count is recorded and required to move in one direction, the same shape as the AI-spend
// and orphan-module ratchets. It makes the gap a number somebody can watch fall instead of an
// adjective in a planning document.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.claude'].includes(e.name)) walk(p, out);
    } else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}

/** Admin + global stylesheets. `/dnd` and `/AndrewAsh` run their own theme systems and are not part
 *  of this question — including them would inflate the count with work that is already done
 *  differently. */
const files = walk('app').filter((f) => !f.includes('dnd') && !f.includes('AndrewAsh'));

/** Comments stripped before counting. Fifth time today a check in this repo would otherwise have
 *  read prose as code — the note above literally contains the words it counts. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '');

const HARDCODED = /(?:^|;|\{)\s*(?:background(?:-color)?|color)\s*:\s*(?:#[0-9a-fA-F]{3,8}|white|black|rgb\()/g;

function counts() {
  let hardcoded = 0;
  let themed = 0;
  for (const f of files) {
    const src = code(fs.readFileSync(f, 'utf8'));
    hardcoded += [...src.matchAll(HARDCODED)].length;
    themed += [...src.matchAll(/var\(--theme-/g)].length;
  }
  return { hardcoded, themed };
}

describe('the themes are actually consumed', () => {
  it('the sweep is looking at something', () => {
    // A file list that silently became empty would make every assertion below pass forever.
    expect(files.length).toBeGreaterThan(20);
  });

  it('the shell reads its colours from the theme', () => {
    // The specific surfaces converted first, because they are on screen on every single page. Each
    // keeps its old colour as the fallback, so the default theme is unchanged and only a chosen
    // theme overrides it.
    const layout = code(fs.readFileSync('app/admin/styles/AdminLayout.css', 'utf8'));
    expect(layout, 'the app background ignores the theme').toMatch(/\.admin-layout\s*\{[^}]*var\(--theme-bg-page/);
    expect(layout, 'the top bar ignores the theme').toMatch(/\.admin-topbar\s*\{[^}]*var\(--theme-bg-surface/);
    // The fallback is the point: no theme selected must look exactly as it did.
    expect(layout).toMatch(/var\(--theme-bg-page,\s*#F3F4F6\)/);
  });

  it('uses the theme variables at all', () => {
    // It was zero. A single adoption is not success, but zero was the state that made the picker
    // a lie, and this is the assertion that stops it returning to zero.
    expect(counts().themed).toBeGreaterThan(0);
  });

  it('does not let the hardcoded-colour backlog grow', () => {
    // ── THE RATCHET ──────────────────────────────────────────────────────────────────────────────
    // Measured 4,199 on 2026-08-04, before any conversion. Tighten this number as pages are
    // converted; it must never be raised. A ratchet that follows the work down is the only kind
    // that keeps meaning anything — this repo has already found one quietly buying itself headroom.
    // **4,199 → 2,579 → 2,291 the same day**, across 47 stylesheets. Tightened as the work lands
    // rather than left at the old figure: a ratchet that does not follow the work down is a
    // ceiling, and this repo has already caught one quietly buying itself headroom.
    //
    // **Then back up to 2,297, deliberately.** Six declarations inside `@media print` blocks were
    // converted by the sweep and then returned to literals: **paper is not themed.** A dark palette
    // would print a black page — and the calendar's print stylesheet exists precisely to force
    // white background and black text regardless of what is on screen. Three tests caught it, which
    // is the print rule defending itself.
    //
    // So this number is not "how much is left to do". It is "how much is still hardcoded", and a
    // small part of that is correct and must stay: print blocks, brand colours, status colours, and
    // white text on dark buttons. **The floor is not zero**, and pretending otherwise would push
    // somebody to convert the six that must not be.
    //
    // ── 2026-08-12: 2,346 → back to 2,297, and the ceiling was NOT raised ────────────────────────
    //
    // This test had been red for days. 47 of the 49 were two stylesheets added on 2026-08-07 —
    // `app/admin/marketing/Marketing.css` and `app/admin/finances/overview/FinanceOverview.css` —
    // and every other stylesheet added since 2026-08-01 contributed **zero**, so the discipline was
    // holding everywhere else.
    //
    // Both were converted, and doing so fixed a real bug rather than only a count: each carried its
    // own `@media (prefers-color-scheme: dark)` overrides. That media query reads the OPERATING
    // SYSTEM, while this app sets `--theme-*` from the skin the USER chose — so somebody on the
    // light skin with a dark laptop got dark banners on a light page. Those blocks are deleted, not
    // re-tokenised: the tokens follow whichever theme is actually active, which is what the blocks
    // were badly approximating. The last two were an XP pill and the fieldbook panel from the
    // mobile-topbar work, both painting a surface with a literal next to an already-tokenised border.
    // ── 2026-08-23: 2,297 → 2,306, and this raise is a CLASSIFICATION, not a surrender ───────────
    //
    // The Page Designer (`app/admin/design/DesignStudio.css`) arrived with 46. Thirty-six were an
    // ordinary theming bug — panels, toolbars, the palette and the inspector painting themselves
    // white on a page whose theme the user chose — and those are converted the same way as every
    // sheet before them.
    //
    // The remaining ten are a category this ratchet has not had to name before: **ink drawn ON a
    // mockup rather than on a themed surface.** The fold line, the safe-area hatching, the resize
    // handles, the size badge and the magenta snap guides are all painted over an artboard that
    // represents somebody else's screen. Theming them would be an actual defect in two ways: the
    // same design would look different to two people, and the studio exports these primitives to
    // standalone HTML (`dsPrimitiveStyles()` in lib/design/export.ts) where no `--theme-*` variable
    // exists at all, so the file on disk would stop matching the canvas it came from.
    //
    // The other two of the ten are the cases this test's own note already blesses: a warning
    // banner's amber, and white on brand navy.
    //
    // The rule for the next person is unchanged and worth stating plainly: a surface a USER looks
    // at follows the theme; a surface that DEPICTS another screen does not.
    const { hardcoded } = counts();
    expect(
      hardcoded,
      `Hardcoded colours in admin CSS rose to ${hardcoded}. Every one is a surface that will NOT ` +
        `follow the user's theme. New styling should use var(--theme-*) with the literal as its ` +
        `fallback, which is how the shell and the eleven converted sheets were done.`,
    ).toBeLessThanOrEqual(2306);
  });

  it('never wraps a fallback inside another fallback', () => {
    // `var(--theme-border, var(--theme-border, #E5E7EB))` — produced by re-running the conversion
    // over an already-converted file. It still renders correctly, which is why it is worth a test:
    // nothing would ever surface it, and it quietly makes the file unreadable and the next
    // conversion pass unverifiable.
    const doubles: string[] = [];
    for (const f of files) {
      if (/var\(--theme-[a-z-]+,\s*var\(/.test(fs.readFileSync(f, 'utf8'))) doubles.push(f);
    }
    expect(doubles, `Nested theme fallbacks in:\n  ${doubles.join('\n  ')}`).toEqual([]);
  });

  it('every conversion keeps the original colour as its fallback', () => {
    // ── THE PROPERTY THAT MADE A 1,900-DECLARATION CHANGE SAFE ──────────────────────────────────
    //
    // Each conversion is `#HEX` → `var(--theme-x, #HEX)`. So unwrapping every fallback must
    // reproduce the file exactly as it was — which is a *mechanical proof* that a user who has not
    // chosen a theme sees byte-identical CSS, rather than a promise that someone eyeballed it.
    //
    // It is asserted here as a shape rather than a diff, because the pre-conversion files are gone:
    // no `var(--theme-…)` may carry a fallback that is anything other than a literal colour. A bare
    // `var(--theme-fg-primary)` with no fallback is what a careless conversion produces, and it
    // renders as *unstyled* wherever the variable is not set.
    // ── ONE EXEMPTION, AND IT IS THE ONE PLACE THE RULE CANNOT APPLY ────────────────────────────
    //
    // Inside a `[data-theme="…"]` block in themes.css, a `var(--theme-…)` reference points at a
    // variable the SAME block defines three lines above it. There is no state in which it is unset,
    // and a fallback there would be a second hard-coded palette to keep in sync.
    //
    // This is where the static tokens are aliased to the theme — `--color-text-primary:
    // var(--theme-fg-primary)` and its siblings — which is what makes hundreds of rules that read
    // `--color-text-*` follow the theme instead of staying near-black under a dark one.
    //
    // The rule above still holds everywhere it is about: a page with no `data-theme` never enters
    // these blocks, so it still resolves the original literals and still renders byte-identically.
    // References in themes.css OUTSIDE a theme block — in `:root`, say — are still checked.
    const insideThemeBlock = (src: string, at: number): boolean => {
      const before = src.slice(0, at);
      const open = before.lastIndexOf('[data-theme');
      if (open === -1) return false;
      // Still inside it only if no `}` has closed the block since it opened.
      return !before.slice(open).includes('}');
    };

    const noFallback: string[] = [];
    for (const f of files) {
      const src = code(fs.readFileSync(f, 'utf8'));
      const isThemes = f.replace(/\\/g, '/').endsWith('app/styles/themes.css');
      for (const m of src.matchAll(/var\(--theme-[a-z-]+([^)]*)\)/g)) {
        const arg = m[1].trim();
        if (arg !== '') continue;
        if (isThemes && insideThemeBlock(src, m.index ?? 0)) continue;
        noFallback.push(`${path.basename(f)}: ${m[0]}`);
      }
    }
    expect(
      noFallback.slice(0, 20),
      'A theme variable with no fallback renders as nothing when the variable is unset — the ' +
        'conversion must always keep the original literal:\n  ' + noFallback.slice(0, 20).join('\n  '),
    ).toEqual([]);
  });

  it('every built-in theme has a palette — none silently falls through', () => {
    // `forest-dark` was a valid ThemeId, an option in the picker, and had NO `[data-theme]` block:
    // selecting it fell through to `:root` and did nothing, which is indistinguishable from a broken
    // picker. Found by counting blocks against the type, so a twelfth theme cannot be added to the
    // list and forgotten in the stylesheet.
    const themes = fs.readFileSync('app/styles/themes.css', 'utf8');
    const types = fs.readFileSync('lib/hub/types.ts', 'utf8');
    const declared = /export type BuiltinThemeId =([\s\S]*?);/.exec(types)?.[1] ?? '';
    const ids = [...declared.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);

    const defined = new Set([...themes.matchAll(/\[data-theme="([a-z0-9-]+)"\]/g)].map((m) => m[1]));
    const missing = ids.filter((id) => !defined.has(id));
    expect(
      missing,
      `These themes are offered and have no palette, so choosing them does nothing: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every theme is readable — AA text on every surface it can land on', () => {
    // ── THE ASSERTION BEHIND "the themes look good on every page" ────────────────────────────────
    //
    // W9b converted ~1,900 declarations so that surfaces and neutral text follow the palette. That
    // makes readability a property OF THE PALETTE rather than of each page: every converted card is
    // `--theme-bg-surface` carrying `--theme-fg-primary/secondary/muted`, so if a palette's own
    // pairs pass, every converted page passes with it — and if one fails, it fails everywhere at
    // once, which is exactly the kind of breakage that would otherwise be found by a person.
    //
    // 4.5:1 for body text and 3.0:1 for muted are the WCAG AA thresholds. Muted is held to the
    // large-text bar deliberately: it is used for timestamps and secondary labels, never for
    // anything a decision depends on.
    const themes = fs.readFileSync('app/styles/themes.css', 'utf8');

    const luminance = (hex: string) => {
      const h = hex.replace('#', '');
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      const [r, g, b] = [0, 2, 4]
        .map((i) => parseInt(full.substr(i, 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    const failures: string[] = [];
    let checked = 0;
    for (const m of themes.matchAll(/\[data-theme="([a-z0-9-]+)"\]\s*\{([^}]*)\}/g)) {
      const [, id, body] = m;
      const get = (name: string) =>
        new RegExp(`--theme-${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(body)?.[1] ?? null;

      // `fg-muted` sat at 3.0 and that floor is what let the defect through: three palettes shipped a
      // muted foreground measuring 4.34, 4.29 and 4.30:1 against their own elevated surface, and the
      // guard called them fine. Muted text is still TEXT at a normal size, so it owes 4.5:1 like the
      // rest — a table head nobody can read is not a subtle design choice.
      for (const [fgName, min] of [['fg-primary', 4.5], ['fg-secondary', 4.5], ['fg-muted', 4.5]] as const) {
        const fg = get(fgName);
        if (!fg) continue;
        for (const bgName of ['bg-surface', 'bg-page', 'bg-elevated']) {
          const bg = get(bgName);
          if (!bg) continue;
          checked++;
          const r = ratio(fg, bg);
          if (r < min) failures.push(`${id}: ${fgName} on ${bgName} = ${r.toFixed(2)} (needs ${min})`);
        }
      }
    }

    // The sweep must have looked at something — a regex that stopped matching would pass silently.
    expect(checked).toBeGreaterThan(80);
    expect(failures, `Unreadable colour pairs — these break every converted page at once:\n  ${failures.join('\n  ')}`)
      .toEqual([]);
  });

  it('the CSS and the TypeScript registry offer the same themes', () => {
    // Two sources for one palette, and that is how `forest-dark` hid in plain sight: the CSS block
    // is what PAINTS, this registry is what the picker LISTS and what `useThemeColors()` reads. It
    // was missing from both, and neither could reveal the other's gap.
    //
    // `register-builtins.ts` even said "All 10 built-in themes registered" next to a type declaring
    // eleven. Nothing compared them; this does.
    const registry = fs.readFileSync('lib/hub/themes/register-builtins.ts', 'utf8');
    const types = fs.readFileSync('lib/hub/types.ts', 'utf8');
    const declared = /export type BuiltinThemeId =([\s\S]*?);/.exec(types)?.[1] ?? '';
    const ids = [...declared.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);

    const unregistered = ids.filter((id) => !new RegExp(`import '\\./${id}'`).test(registry));
    expect(
      unregistered,
      `Declared as themes but never registered, so the picker cannot offer them: ${unregistered.join(', ')}`,
    ).toEqual([]);

    // …and each registered import must be a file that exists, or the side-effect import throws.
    for (const id of ids) {
      expect(fs.existsSync(path.join('lib/hub/themes', `${id}.ts`)), `lib/hub/themes/${id}.ts is missing`).toBe(true);
    }
  });

  it('every theme defines the FULL variable set', () => {
    // A partially-defined theme inherits the light fallback for whatever it omits — so a dark theme
    // missing `--theme-fg-primary` renders near-black text on a near-black card. That is a worse
    // failure than a missing theme, because it looks deliberate.
    const themes = fs.readFileSync('app/styles/themes.css', 'utf8');
    const root = /:root\s*\{([^}]*)\}/.exec(themes)?.[1] ?? '';
    const required = [...root.matchAll(/(--theme-[a-z-]+)\s*:/g)].map((m) => m[1]);
    expect(required.length).toBe(14);

    const incomplete: string[] = [];
    for (const m of themes.matchAll(/\[data-theme="([a-z0-9-]+)"\]\s*\{([^}]*)\}/g)) {
      // ── `custom` DEFINES NOTHING, AND THAT IS ITS DESIGN ────────────────────────────────────────
      //
      // A custom palette — a theme somebody built, or one from the Page Designer — varies per user,
      // so it cannot be written into a stylesheet. Its fourteen values are set inline on `<html>` by
      // `ShellTheme`, and this block exists only to alias the app's static tokens to them (see the
      // next test). Requiring the fourteen here would mean writing a palette into the one theme
      // whose whole point is not having one.
      //
      // The failure this test guards against is covered for `custom` elsewhere:
      // `paletteFromTokens` fills every one of the fourteen from the theme's own colours before it
      // is ever saved, and `__tests__/design/retrace-and-gaps.test.ts` asserts that.
      if (m[1] === 'custom') continue;
      const have = new Set([...m[2].matchAll(/(--theme-[a-z-]+)\s*:/g)].map((x) => x[1]));
      const missing = required.filter((v) => !have.has(v));
      if (missing.length) incomplete.push(`${m[1]} (missing ${missing.join(', ')})`);
    }
    expect(incomplete, `Incomplete palettes fall back to the LIGHT defaults:\n  ${incomplete.join('\n  ')}`)
      .toEqual([]);
  });

  it('the custom theme aliases the static tokens, or its text stays where the light theme left it', () => {
    // Phase T3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
    //
    // The eleven built-ins each alias `--color-text-*` and friends to their `--theme-*` values,
    // which is what stopped a dark theme from leaving hundreds of rules painting near-black text on
    // a near-black page. `custom` had no block at all, so it inherited exactly that defect — a
    // custom dark theme moved the surfaces and left the words behind, and read as the custom-theme
    // feature being broken rather than as a missing stylesheet block.
    const themes = fs.readFileSync('app/styles/themes.css', 'utf8');
    const block = /\[data-theme="custom"\]\s*\{([^}]*)\}/.exec(themes)?.[1];
    expect(block, 'app/styles/themes.css has no [data-theme="custom"] block').toBeTruthy();

    const aliases = ['--color-text-primary', '--color-bg-app', '--color-bg-card', '--color-brand-navy', '--text-primary'];
    const missing = aliases.filter((name) => !new RegExp(`${name}\\s*:`).test(block ?? ''));
    expect(missing, `A custom theme would leave these reading the light defaults: ${missing.join(', ')}`)
      .toEqual([]);
  });
});

// ── A TOKEN THAT WAS NEVER DEFINED IS A FALLBACK NOBODY MEANT TO SHIP ──────────────────────────
//
// Three separate defects on 2026-08-24 were the same mistake: a rule reading a `--theme-*` custom
// property that this repository has never defined anywhere. CSS answers a missing variable with the
// fallback, silently and forever, so the rule looks converted, reviews as converted, and paints a
// literal on every palette:
//
//   --theme-fg            4 rules in AdminTimeLogs.css, painting #111827 on every theme
//   --theme-brand-subtle  5 rules across AdminJobs.css and AdminProjects.css, painting #EBF0FF
//
// Both were found by measuring rendered pages, which is expensive and needs a browser. The names
// are checkable for free.
describe('every --theme-* a stylesheet reads is a token that exists', () => {
  it('has no rule reading a property no theme block defines', () => {
    const files = [
      'app/styles/themes.css',
      'app/styles/tokens.css',
      'app/styles/globals.css',
    ].map((f) => fs.readFileSync(f, 'utf8'));

    // Everything DEFINED, from any source: the theme blocks, the base tokens, the :root fallback.
    const defined = new Set<string>();
    for (const src of files) {
      for (const m of src.matchAll(/^\s*(--theme-[a-z0-9-]+)\s*:/gm)) defined.add(m[1]);
    }
    expect(defined.size).toBeGreaterThan(10);

    // Everything READ, across every stylesheet the admin shell loads.
    const cssFiles: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.css')) cssFiles.push(full);
      }
    };
    walk('app');
    expect(cssFiles.length).toBeGreaterThan(10);

    const missing: string[] = [];
    for (const file of cssFiles) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/var\(\s*(--theme-[a-z0-9-]+)/g)) {
        if (!defined.has(m[1])) missing.push(`${file.split(String.fromCharCode(92)).join('/')}: ${m[1]}`);
      }
    }

    expect(
      [...new Set(missing)],
      'These rules read a --theme-* property nothing defines, so they paint their literal fallback on '
      + 'every palette. Either define the token in every block of themes.css, or use one that exists.',
    ).toEqual([]);
  });
});
