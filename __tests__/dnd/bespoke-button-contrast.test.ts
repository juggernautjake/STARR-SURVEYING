// __tests__/dnd/bespoke-button-contrast.test.ts — `.btn` must be readable on the bespoke (PF2/IG) sheets.
//
// Found by MEASURING contrast during the template/skin sweep (final-QA walkthrough, slice 18) rather than
// looking at the page: the PF2 sheet's "＋ Weapon" button computed to `rgb(15,20,25)` on `rgb(1,10,19)` —
// **1.08:1**. Not hard to read; invisible.
//
// The tokens were never wrong. `--ink` and `--hx-text` both resolved to `#f0e6d2` right down to the
// button — nothing was reading them. `.btn` is styled in `theme.css`, which the bespoke sheets
// deliberately do NOT import (its element rules bleed onto the hextech panels), so those nine buttons
// matched no colour rule at all and inherited the page's base `#0f1419` onto a near-black panel.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CSS = read('app/dnd/_sheet/styles/bespokeButtons.css');

describe('the bespoke sheets style their own .btn', () => {
  it('colours it from a token, with a literal fallback', () => {
    // The fallback matters: if the token ever fails to resolve the button must still be legible rather
    // than inheriting the page's dark body colour again.
    //
    // The ORDER changed 2026-07-26 and the reason is measured. `--hx-text` first was this file's original
    // fix (1.08:1 on the dark bespoke panels) and it broke the LIGHT skins: `skinHxVars` is not applied at
    // that scope, so `--hx-text` fell through to its literal cream while the fill went light with the skin —
    // 1.12–1.90:1 across ~20 controls. `--ink` comes first now because `shellVarsFromHx` derives it from the
    // skin alongside the surface tokens, so it tracks the surface in BOTH directions; on the dark bespoke
    // sheets it already resolves to `#f0e6d2`, so the original fix is preserved by the same expression.
    // See bespoke-button-ink.test.ts.
    // Matched from `.btn {` rather than from `.sheet-shell .btn {`: the rule is now a selector GROUP,
    // because `.sheet-shell` is the Codex/Dashboard/Play wrapper and never existed on the Classic view —
    // so Classic matched none of these rules and kept inheriting `#0f1419` at 1.08:1 (P11-4). The
    // `.bespoke-sheet` marker covers every format; which selectors are in the group is asserted below.
    expect(CSS).toMatch(/\.btn\s*\{[^}]*color:\s*var\(--ink,\s*var\(--hx-text,\s*#f0e6d2\)\)/s);
  });

  it('reaches the CLASSIC view too, not only the shells', () => {
    // The regression this pins is silent: `.sheet-shell` matches nothing on Classic, so the buttons simply
    // go unstyled and inherit a near-black. Nothing errors; the text is just invisible on a dark skin.
    expect(CSS).toContain('.bespoke-sheet .btn');
    for (const file of ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, `${file} must mark its Classic root`).toContain('bespoke-sheet');
    }
  });

  it('is scoped to .sheet-shell, not to a bare element rule', () => {
    // Scoping is the whole reason theme.css was excluded in the first place — this must not reintroduce
    // the bleed it was avoiding.
    // Checked per comma-separated PART, not per rule. The old version matched the whole multi-line
    // selector group as one string and only looked at how it started — so appending an unscoped selector
    // to an existing group would have sailed through the very check meant to prevent it.
    // Comments stripped FIRST. This file's header prose contains `{` and lines beginning with `*`, and the
    // scan happily read one of those as a selector and failed on it. Recurring rule in this repo: a source
    // assertion runs against a comment-stripped copy, or it ends up asserting things about the prose.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const group of rules.match(/^[^{}]*\{/gm) ?? []) {
      for (const sel of group.replace(/\{$/, '').split(',')) {
        const s = sel.trim();
        if (!s) continue;
        expect(
          s.startsWith('.sheet-shell') || s.startsWith('.bespoke-sheet'),
          `unscoped selector: ${s}`,
        ).toBe(true);
      }
    }
  });

  it('covers the disabled and hover states too', () => {
    expect(CSS).toMatch(/\.sheet-shell \.btn:disabled/);
    expect(CSS).toMatch(/\.sheet-shell \.btn:hover:not\(:disabled\)/);
  });

  it('is imported by BOTH bespoke sheets — one would leave the other invisible', () => {
    for (const f of ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx']) {
      expect(read(f), `${f} does not import bespokeButtons.css`).toContain("styles/bespokeButtons.css'");
    }
  });

  it('those sheets still do NOT import theme.css — the fix must not undo the reason for the gap', () => {
    for (const f of ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx']) {
      expect(read(f)).not.toContain("styles/theme.css'");
    }
  });

  it('the panels really do use the class this styles', () => {
    // If the panels stopped using `.btn`, this stylesheet would be dead weight rather than a fix.
    const pf2 = read('app/dnd/_ui/pf2/usePf2Panels.tsx');
    expect(pf2).toContain('className="btn tiny"');
  });
});
