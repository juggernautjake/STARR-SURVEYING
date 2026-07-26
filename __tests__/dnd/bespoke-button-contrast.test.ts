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
  it('colours it from the hextech token, with a literal fallback', () => {
    // The fallback matters: if the token ever fails to resolve the button must still be legible rather
    // than inheriting the page's dark body colour again.
    expect(CSS).toMatch(/\.sheet-shell \.btn\s*\{[^}]*color:\s*var\(--hx-text,\s*#f0e6d2\)/s);
  });

  it('is scoped to .sheet-shell, not to a bare element rule', () => {
    // Scoping is the whole reason theme.css was excluded in the first place — this must not reintroduce
    // the bleed it was avoiding.
    for (const sel of CSS.match(/^\.[^{]+\{/gm) ?? []) {
      expect(sel.trim().startsWith('.sheet-shell'), `unscoped selector: ${sel.trim()}`).toBe(true);
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
