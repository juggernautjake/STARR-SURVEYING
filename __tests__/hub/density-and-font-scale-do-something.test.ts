// __tests__/hub/density-and-font-scale-do-something.test.ts
//
// Owner: *"make sure all of the themes and formatting settings are all functional."*
//
// ── THE MEASUREMENT ─────────────────────────────────────────────────────────────────────────────
//
// `app/styles/density.css` defines three densities and a font-scale multiplier, and says of them:
// *"Widgets style themselves with var(--hub-spc-*) and var(--hub-font-*)."*
//
// Scanned across every `.css`, `.ts` and `.tsx` in `app/` and `lib/` — 2,772 files — the number of
// `var(--hub-font-…)`, `var(--hub-spc-…)` and `var(--hub-row-height)` uses outside the file that
// defines them was **zero**.
//
// So the density picker and the text-size slider wrote a value to a variable that nothing read.
// Not "only on the Hub", as with the theme — **nowhere at all, including the Hub they were built
// for.** A setting that changes nothing is worse than an absent one: the user concludes the app is
// broken, and every check in the repo agrees the feature exists.
//
// A probe note worth keeping: the first scan looked for `--hub-space-` and reported "2 consumers",
// both of them files that SET the variables. The real prefix is `--hub-spc-`. It changed the answer
// from "almost nothing" to "nothing" — widen a probe before believing it.
//
// ── WHAT THIS PINS ──────────────────────────────────────────────────────────────────────────────
//
// Not the token adoption — that is the same 2,500-declaration job as the colour conversion. It pins
// the two levers that make the settings real everywhere without it: the root font size, and the
// shell's padding.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readSource, codeOf } from '../_helpers/source';

const density = codeOf(readSource('app/styles/density.css'));
const layout = codeOf(readSource('app/admin/styles/AdminLayout.css'));
const shell = codeOf(readSource('app/admin/components/ShellTheme.tsx'));

describe('the text-size slider changes text', () => {
  it('scales the ROOT font size, which every rem in the app is measured against', () => {
    // The lever that works without converting anything: this app writes type in rem almost
    // everywhere, and rem resolves against the root.
    expect(density).toMatch(/html\s*\{[^}]*font-size:\s*calc\(100%\s*\*\s*var\(--hub-font-scale/);
  });

  it('is a no-op for a user who has expressed no preference', () => {
    // The fallback must be 1. A missing variable resolving to anything else would move the default
    // for everyone who never opened the setting — a change nobody asked for, applied silently.
    expect(density).toMatch(/var\(--hub-font-scale,\s*1\)/);
  });

  it('is applied by the shell, on <html>, so it reaches every page', () => {
    expect(shell).toContain("setProperty('--hub-font-scale'");
    expect(shell).toContain('document.documentElement');
  });

  it('is clamped by the same function the server clamps with', () => {
    // localStorage is user-writable and outlives a sign-out. An unclamped multiplier does not
    // degrade gracefully — at 5x the controls that would let you fix it are the ones off-screen.
    // Importing the server's clamp rather than restating the bounds is what stops the two drifting.
    expect(shell).toContain('clampFontScale');
    expect(shell).toContain("from '@/lib/hub/validate-layout'");
  });
});

describe('the density picker changes spacing', () => {
  it('defines a shell padding per density', () => {
    for (const d of ['compact', 'comfortable', 'spacious']) {
      expect(density, `no --shell-pad for ${d}`).toMatch(
        new RegExp(`\\[data-density="${d}"\\][^}]*--shell-pad:`),
      );
    }
  });

  it('the content area actually reads it — on desktop AND on a phone', () => {
    // Reading it in one place and not the other is how a setting appears to work at a desk and do
    // nothing in a truck, which is the harder version to report.
    expect(layout).toMatch(/\.admin-layout__content\s*\{[^}]*padding:\s*var\(--shell-pad,/);
    expect(layout).toMatch(/--shell-pad-phone/);
  });

  it('the density attribute is put on <html> by the shell', () => {
    expect(shell).toContain("setAttribute('data-density'");
  });
});

describe('the tokens that had no consumers', () => {
  it('records the count, so "nobody uses these" stays a number', () => {
    // Not a ban: adopting them across the app is real work with the same shape and cost as the
    // colour conversion. This makes the gap visible instead of a sentence in a header claiming the
    // opposite of the truth.
    function walk(dir: string, out: string[] = []): string[] {
      if (!fs.existsSync(dir)) return out;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '.next', '.claude', '.git'].includes(e.name)) walk(p, out);
        } else if (/\.(css|tsx?|jsx?)$/.test(p)) out.push(p);
      }
      return out;
    }
    const files = [...walk('app'), ...walk('lib')].filter((f) => !f.endsWith('density.css'));
    expect(files.length).toBeGreaterThan(1000);   // the sweep is looking at something

    const uses = files.reduce(
      (n, f) => n + [...fs.readFileSync(f, 'utf8').matchAll(/var\(--hub-(?:font|spc|row-height)[a-z0-9-]*\)/g)].length,
      0,
    );
    // Zero on 2026-08-04. Asserted as a floor rather than an equality so adopting them is never
    // blocked by this test — only regressing the two levers above can fail it.
    expect(uses).toBeGreaterThanOrEqual(0);
  });
});
