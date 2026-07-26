// __tests__/dnd/bespoke-button-ink.test.ts — `.btn`'s ink follows the surface, in both directions.
//
// This file guards one rule that has now been broken three separate times in three days, each time by a
// different author-me reaching for the nearest-looking token:
//
//   1. the bespoke PF2/IG sheets — buttons matched no colour rule and inherited the page's near-black onto a
//      near-black panel: **1.08:1**. Fixed by `bespokeButtons.css`, which set `--hx-text`.
//   2. the roller dock (slice 24) — inline styles used `--hx-muted` on a surface painted from `--panel-rgb`:
//      **2.59:1** on a light skin.
//   3. these same buttons on the LIGHT skins (slice 25/26) — `--hx-text` fell through to its literal cream
//      `#f0e6d2` because `skinHxVars` is not applied at that scope, while the fill went light with the skin:
//      **1.12–1.90:1** across ~20 controls on a jack-skinned sheet.
//
// THE RULE: a component's ink comes from the token family that paints the surface under it. `--ink`/`--muted`/
// `--gold` are the SHELL family, which `shellVarsFromHx` derives from the skin at the same place and time as
// `--panel-rgb` — so they track the surface. The `--hx-*` family is a different thing and may be absent
// entirely, which is why it belongs in the fallback and never in front.
//
// Browser-measured after the fix: jack 27 buttons / 0 failing (was ~20 failing), PF2 Orin 5/0 (`＋ Weapon`
// 11.01:1, the sheet this file was written for — no regression), and the residue on donata/perrin is entirely
// the coloured `.teal`/`.danger` variants, which are a separate brand-fill decision.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CSS = read('app/dnd/_sheet/styles/bespokeButtons.css');

describe('the shared bespoke button takes the shell ink first', () => {
  it('base colour is --ink, then --hx-text, then a literal', () => {
    expect(CSS).toContain('color: var(--ink, var(--hx-text, #f0e6d2));');
  });

  it('hover follows the same order with the gold', () => {
    expect(CSS).toContain('color: var(--gold, var(--hx-gold-2, #c8aa6e));');
  });

  it('never puts the sheet family in FRONT of the shell family', () => {
    // `var(--hx-text, var(--ink, …))` would reinstate bug #3 everywhere, because the hextech literal always
    // resolves — the fallback would never be reached.
    expect(CSS).not.toContain('var(--hx-text, var(--ink');
    expect(CSS).not.toContain('var(--hx-gold-2, var(--gold');
  });

  it('keeps the original 1.08:1 fix explained, not just fixed', () => {
    // The dark-sheet reason has to stay legible or someone will "simplify" the fallback chain away.
    expect(CSS).toContain('1.08:1');
    expect(CSS).toMatch(/1\.12–1\.90:1/);
  });
});

describe('the same rule in the two components that broke it', () => {
  it('the roller bar takes the shell muted/ink first', () => {
    const bar = read('app/dnd/_sheet/components/rollers/RollerTemplateBar.tsx');
    expect(bar).toContain("'var(--muted, var(--hx-muted, #93a1b5))'");
    expect(bar).toContain("'var(--ink, var(--hx-text, #e8e6f0))'");
  });

  it('the campaigns panel states the ink of the DARK panel it sits on', () => {
    // The mirror case: that panel is hextech-module dark on every skin, so it wants the hextech family —
    // which is the same rule (ink from the surface's family), not an exception to it.
    const panel = read('app/dnd/_ui/CharacterCampaigns.tsx');
    expect(panel).toContain("color: 'var(--hx-text, #f0e6d2)'");
  });
});
