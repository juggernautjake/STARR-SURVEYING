// __tests__/dnd/roller-tab-contrast.test.ts — why the roller bar's labels are NOT on a body-text token.
//
// The 11px labels in the roller template bar measure 2.78:1 (dark skins) / 2.83:1 (light) — sub-AA, and a
// real if minor defect. Slice 19 "fixed" it by switching them to `--hx-text`. Slice 21 computed what that
// actually did and reverted it.
//
// The trap: every text token in this app is contrast-clamped against the SKIN'S PANEL — that clamp is the
// whole reason `skin-tokens.ts` computes luminance ("CONTRAST IS NON-NEGOTIABLE … the LIGHT skins have a
// near-white background, and the default --hx-text is a near-white cream"). But this bar does not sit on
// the skin's panel. It sits on the ROLLER, which is dark on every skin. So on the three light skins the
// body-text token is near-black, and the "fix" was strictly worse than the thing it replaced.
//
// This file pins the ARITHMETIC behind that decision, so the swap cannot be made again by inspection.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skinHxVars, shellThemeVars } from '@/lib/dnd/skin-tokens';
import { composite, contrastRatio } from '@/lib/dnd/theme-contrast';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/rollers/RollerTemplateBar.tsx'), 'utf8');
const LIGHT_SKINS = ['streamer', 'donata', 'jack'];

/** The tab's own 3%-white fill over the roller's dark surface. */
const TAB_BG = (() => {
  const c = composite({ r: 255, g: 255, b: 255, a: 0.03 }, { r: 12, g: 12, b: 22, a: 1 });
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
})();

describe('body-text tokens are the WRONG choice on the roller surface', () => {
  it.each(LIGHT_SKINS)('%s: --hx-text is near-black, so it would be invisible there', (skin) => {
    const text = (skinHxVars(skin) as Record<string, string>)['--hx-text'];
    expect(text, `${skin} should define --hx-text`).toBeTruthy();
    expect(contrastRatio(text, TAB_BG)!).toBeLessThan(1.5);
  });

  it.each(LIGHT_SKINS)('%s: the shell --ink fails the same way — it is not an alternative', (skin) => {
    const ink = (shellThemeVars(skin) as Record<string, string>)['--ink'];
    expect(ink).toBeTruthy();
    expect(contrastRatio(ink, TAB_BG)!).toBeLessThan(1.5);
  });

  it.each(LIGHT_SKINS)('%s: --hx-muted, dim as it is, is several times better', (skin) => {
    const v = skinHxVars(skin) as Record<string, string>;
    const muted = contrastRatio(v['--hx-muted'], TAB_BG)!;
    const text = contrastRatio(v['--hx-text'], TAB_BG)!;
    expect(muted).toBeGreaterThan(text * 2);
  });

  it('on DARK skins the body token would indeed be better — which is how the trap is set', () => {
    // Checking only a dark skin is exactly what made the swap look correct.
    const v = skinHxVars('lazzuh') as Record<string, string>;
    expect(contrastRatio(v['--hx-text'], TAB_BG)!).toBeGreaterThan(contrastRatio(v['--hx-muted'], TAB_BG)!);
  });
});

describe('the component reflects that decision', () => {
  it('keeps --hx-muted for the inactive label', () => {
    expect(SRC).toMatch(/color: on \? 'var\(--hx-teal-1, #0ac8b9\)' : 'var\(--hx-muted, #93a1b5\)'/);
  });
  it('and does not use a panel-clamped body token here', () => {
    expect(SRC).not.toMatch(/color:[^\n]*var\(--hx-text/);
    expect(SRC).not.toMatch(/color:[^\n]*var\(--ink/);
  });
  it('records why, so the swap is not re-attempted from the dark-skin view alone', () => {
    expect(SRC).toContain('clamped against the SKIN');
    expect(SRC).toMatch(/1\.13–1\.17:1/);
  });
  it('still carries selection state accessibly, not by colour alone', () => {
    expect(SRC).toContain('aria-pressed={on}');
    expect(SRC).toMatch(/border: on \?/);
  });
});
