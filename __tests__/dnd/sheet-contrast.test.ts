// __tests__/dnd/sheet-contrast.test.ts — readability guarantees for the sheet skins.
//
// Two classes of bug this locks out, both reported on Jack's sheet:
//  1. The base stylesheet was written for the original DARK neon skin and hardcoded
//     `color: #fff` on panel text (stat values, ability scores, dice-log labels…). On a LIGHT
//     skin (Jack's parchment, Donata's) that is white-on-cream — unreadable.
//  2. Translucent fills/glows were written as rgba() LITERALS of the neon palette
//     (rgba(255,45,139,…)), which bypass the per-character theme entirely and bleed hot pink
//     onto characters whose palette contains no pink at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { themeToCssVars, rangorTheme, lazzuhTheme, donataTheme } from '@/app/dnd/_sheet/theme';

const CSS = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/styles/theme.css'), 'utf8');

// ── WCAG relative luminance + contrast ratio ──────────────────────────────────────
function srgbToLin(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('theme tokens drive every accent (no hardcoded palette literals)', () => {
  it('the stylesheet has no hardcoded neon/orange rgba literals outside :root fallbacks', () => {
    // Strip the :root block, whose literal triplets are the documented defaults.
    const body = CSS.replace(/:root\s*\{[\s\S]*?\}/, '');
    expect(body).not.toMatch(/rgba\(255, ?45, ?139,/);   // neon hot pink
    expect(body).not.toMatch(/rgba\(255, ?95, ?176,/);   // neon pink
    expect(body).not.toMatch(/rgba\(34, ?224, ?224,/);   // neon cyan
    expect(body).not.toMatch(/rgba\(139, ?92, ?246,/);   // neon violet
    expect(body).not.toMatch(/rgba\(181, ?80, ?31,/);    // the rulebook skin's old burnt orange
  });

  // The regression guard. Every round of "the text is unreadable" has been another hardcoded
  // literal left over from when this stylesheet was one character's dark neon sheet. Rather than
  // find them one bug report at a time, fail the build on a new one.
  it('the BASE stylesheet has no hardcoded text colour at all', () => {
    const lines = CSS.split(/\r?\n/);
    // Which rule does a line belong to? (last selector seen at or above it)
    let selector = '';
    const offenders: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\{\s*$/.test(line) || /\{/.test(line)) selector = line.trim();
      const m = /(^|\s)color:\s*(#[0-9a-fA-F]{3,6}|white)\s*[;!]/.exec(line);
      if (!m) continue;
      // Legitimately exempt:
      //  · .skin-* blocks — a bespoke skin may commit to its own fixed look
      //  · .stream-* / .sd-* — the streamer dock, which is a fixed dark chrome on every skin
      //  · ::selection — text on a solid accent fill
      if (/skin-|stream|\.sd-|::selection/.test(selector)) continue;
      offenders.push(`${i + 1}: ${selector} → ${line.trim()}`);
    }
    expect(offenders, `hardcoded text colours in the shared sheet (use var(--ink) or an accent token):\n${offenders.join('\n')}`).toEqual([]);
  });

  // An inline style beats EVERY stylesheet rule, including a skin's. `.sec-num` is a section
  // label that skins restyle completely — the candy skin makes it a filled magenta pill with
  // white text — so an inline `color` on one forced dark bronze onto that pill and made the DM
  // and "AI // Ask" labels unreadable. Shared components must not pin a colour on it.
  it('no shared component pins an inline colour on a .sec-num label', () => {
    const dir = path.join(process.cwd(), 'app/dnd/_sheet/components');
    const offenders: string[] = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/className="sec-num"\s+style=\{\{([^}]*)\}\}/g)) {
        if (/(^|[\s,])color:/.test(m[1])) offenders.push(`${f}: ${m[0].slice(0, 76)}`);
      }
    }
    expect(offenders, `these override their skin's section-label styling:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('themeToCssVars emits an r,g,b triplet matching every hex token', () => {
    const vars = themeToCssVars(rangorTheme) as Record<string, string>;
    // Asserts the INVARIANT (the triplet is derived from the hex), not a specific colour —
    // the palette gets retuned for contrast, and a test pinned to a hex just breaks each time.
    const hex = vars['--hotpink'];
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    const n = parseInt(hex.slice(1), 16);
    expect(vars['--hotpink-rgb']).toBe(`${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`);
    expect(vars['--ink-rgb']).toBeTruthy();
    // A non-hex token (rgba string) must not produce a bogus triplet.
    expect(vars['--line-rgb']).toBeUndefined();
  });

  it('every skin gets its OWN accent triplet — never the neon default', () => {
    const jack = themeToCssVars(rangorTheme) as Record<string, string>;
    const donata = themeToCssVars(donataTheme) as Record<string, string>;
    expect(jack['--hotpink-rgb']).not.toBe('255, 45, 139');
    expect(donata['--hotpink-rgb']).not.toBe(jack['--hotpink-rgb']);
  });
});

describe('panel text follows the theme ink, not hardcoded white', () => {
  // These sit on cards/panels/translucent tints — the ones reported as unreadable.
  const PANEL_RULES = [
    '.dnd-sheet .stat .big',        // AC / Save DC / Speed values
    '.dnd-sheet .ab .score',        // ability scores (Abilities tab)
    '.dnd-sheet .apill .asc',       // ability scores (stat rail) — STR/DEX/CON/INT/WIS/CHA
    '.dnd-sheet .inline-edit',      // the double-click-to-edit field
    '.dnd-sheet .tab.on',           // the active tab
    '.dnd-sheet .ability-name',
    '.dnd-sheet .res-head .rn',     // combat-tab resource labels
    '.dnd-sheet .tray-title',       // dice roller
    '.dnd-sheet .adv-seg button.on-flat',
    '.dnd-sheet .roll-entry .re-label',
    '.dnd-sheet .inv-name',
    '.dnd-sheet .card h3',
    '.dnd-sheet h2',
    '.dnd-sheet strong',
  ];
  it.each(PANEL_RULES)('%s uses var(--ink), not #fff', (sel) => {
    const i = CSS.indexOf(sel + ' {');
    expect(i, `${sel} exists`).toBeGreaterThan(-1);
    const block = CSS.slice(i, CSS.indexOf('}', i));
    expect(block, `${sel} must not hardcode white`).not.toMatch(/color:\s*#fff\b/);
    expect(block).toMatch(/color:\s*var\(--ink\)/);
  });
});

describe('Jack — stone & moss, readable, and not pink', () => {
  const c = rangorTheme.colors!;
  const CARD = c.panel!;

  it('carries no pink/orange accent', () => {
    // Every accent must be green/grey/bronze — i.e. never red-dominant like pink or orange.
    for (const token of ['pink', 'hotpink', 'teal', 'tealbright'] as const) {
      const h = c[token]!.replace('#', '');
      const n = parseInt(h, 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      expect(g, `${token} (${c[token]}) should be green-dominant, not pink/orange`).toBeGreaterThanOrEqual(r);
      expect(r + b, `${token} should not be a hot magenta`).toBeLessThan(g * 2.4);
    }
  });

  it('body ink is AAA on the card and the page', () => {
    expect(contrast(c.ink!, CARD)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.ink!, c.void!)).toBeGreaterThanOrEqual(7);
  });

  it('every accent that renders TEXT clears AA (4.5:1) on the card', () => {
    for (const token of ['hotpink', 'tealbright', 'gold', 'muted', 'violet-2', 'danger'] as const) {
      expect(contrast(c[token]!, CARD), `${token} (${c[token]}) on ${CARD}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('muted-2 (labels only) still clears AA-large', () => {
    expect(contrast(c['muted-2']!, CARD)).toBeGreaterThanOrEqual(3);
  });
});

describe('the dark skin stays readable too (the ink swap must not regress it)', () => {
  it("Lazzuh's ink is AAA on his panel", () => {
    expect(contrast(lazzuhTheme.colors!.ink!, lazzuhTheme.colors!.panel!)).toBeGreaterThanOrEqual(7);
  });
  it("Donata's ink is AAA on her panel", () => {
    expect(contrast(donataTheme.colors!.ink!, donataTheme.colors!.panel!)).toBeGreaterThanOrEqual(7);
  });
});
