// __tests__/dnd/roller-tab-contrast.test.ts — which token family the roller bar's labels take, and why.
//
// THE HISTORY MATTERS, because this file used to argue the opposite and the argument rested on a surface that
// does not exist:
//
//   · slice 18 measured the 11px labels at 2.78:1 — a real defect.
//   · slice 19 switched them to `--hx-text`. Slice 21 computed that this was worse, reverted it, and concluded
//     the bar "sits on the ROLLER, which is dark on every skin".
//   · slice 23 made `.fld` panel-derived (`--hx-panel-rgb`) and declared the clamp's precondition restored.
//   · 2026-07-26 someone finally opened a browser. **The dock is not dark on a light skin, and slice 23's
//     token never reached it.** Measured on a live streamer-skinned sheet: `.fld`'s gradient resolved to
//     `rgba(255,250,254,.98)` — near-WHITE — because `.fld` reads `--panel-rgb`, which the SHELL bridge
//     derives from the skin; meanwhile `--hx-panel` was still the default `#0b1a2c`, `--hx-muted` the default
//     `#a09b8c`, and `--hx-panel-rgb` was EMPTY. Light ink on a near-white dock: 2.59:1.
//
// The previous version of this file computed everything against `composite(3% white, rgb(12,12,22))` — an
// assumed dark roller. That fiction is what let three consecutive slices reason confidently and be wrong. The
// backgrounds below are MEASURED from the DOM, counting gradient stops — which the first measuring attempt
// also forgot, producing numbers that looked like a regression.
//
// Slice 21's surviving lesson is intact and now provable: do not pick this token by looking at one skin. The
// fix is structural — the ink comes from the same family as the surface.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skinHxVars, shellThemeVars } from '@/lib/dnd/skin-tokens';
import { contrastRatio } from '@/lib/dnd/theme-contrast';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/rollers/RollerTemplateBar.tsx'), 'utf8');

/** Composited tab-pill backgrounds and resolved inks, read from a real browser on live characters. */
const MEASURED = {
  streamer: { bg: '#faf6fa', active: '#d9eff1', muted: '#8a3f7c', ink: '#5a1050' },
  jack: { bg: '#f6f3ea', active: '#d5ede3', muted: '#524c3f', ink: '#232019' },
  donata: { bg: '#faf9f5', active: '#d9f2ec', muted: '#6f5566', ink: '#3a2140' },
  lazzuh: { bg: '#111d2c', active: '#0a2f3a', muted: '#a09b8c', ink: '#f0e6d2' },
} as const;
/** The default `--hx-muted` — what the bar actually resolved to on every one of those sheets. */
const HX_DEFAULT_MUTED = '#a09b8c';
const LIGHT = ['streamer', 'jack', 'donata'] as const;

describe('the shell family is legible on the dock that actually renders', () => {
  for (const [skin, m] of Object.entries(MEASURED)) {
    it(`${skin}: the inactive label clears AA`, () => {
      const r = contrastRatio(m.muted, m.bg)!;
      expect(r, `${skin}: ${m.muted} on ${m.bg} → ${r}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${skin}: the active label clears AA too`, () => {
      expect(contrastRatio(m.ink, m.active)!).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('the sheet family\'s DEFAULT is what was failing, and only on light skins', () => {
  for (const skin of LIGHT) {
    it(`${skin}: the old --hx-muted default was sub-AA there`, () => {
      const r = contrastRatio(HX_DEFAULT_MUTED, MEASURED[skin].bg)!;
      expect(r, `${HX_DEFAULT_MUTED} on ${MEASURED[skin].bg} → ${r}`).toBeLessThan(4.5);
    });
  }

  it('on a DARK skin it was fine — which is exactly how the trap stayed set for three slices', () => {
    expect(contrastRatio(HX_DEFAULT_MUTED, MEASURED.lazzuh.bg)!).toBeGreaterThanOrEqual(4.5);
  });

  it('and the accent could not be the active label either', () => {
    // Measured 1.76:1 on the near-white dock, which is why the active tab uses ink plus a teal border/tint.
    expect(contrastRatio('#0ac8b9', MEASURED.streamer.active)!).toBeLessThan(4.5);
  });
});

describe('the skin bridge really does supply the ink the dock needs', () => {
  // The structural claim: `shellVarsFromHx` sets `--panel-rgb` (the dock's surface) AND `--ink`/`--muted`
  // from the same skin, so taking the ink from that family is correct by construction rather than by luck.
  for (const skin of LIGHT) {
    it(`${skin}: the shell bridge emits both the surface triplet and its ink`, () => {
      const shell = shellThemeVars(skin) as unknown as Record<string, string>;
      expect(shell['--panel-rgb']).toBeTruthy();
      expect(shell['--ink']).toBeTruthy();
      expect(shell['--muted']).toBeTruthy();
    });
  }

  it('the sheet family is a different thing and may be ABSENT — hence the fallback order', () => {
    // `skinHxVars` is not applied at the scope the dock lives in on a 5e sheet; that is why `--muted` comes
    // first and `--hx-muted` second, and never the reverse.
    const hx = skinHxVars('streamer') as unknown as Record<string, string>;
    expect(hx['--hx-muted']).toBeTruthy();
    expect(SRC).not.toContain('var(--hx-muted, var(--muted');
  });
});

describe('the component reflects the corrected decision', () => {
  it('inactive takes the shell muted, with the sheet family as fallback', () => {
    expect(SRC).toContain("'var(--muted, var(--hx-muted, #93a1b5))'");
  });

  it('active takes the ink, not the accent', () => {
    expect(SRC).toContain("'var(--ink, var(--hx-text, #e8e6f0))'");
  });

  it('records the measurement, so nobody re-reasons from an assumed dark dock', () => {
    expect(SRC).toContain('rgba(255,250,254,.98)');
    expect(SRC).toMatch(/2\.59:1/);
    expect(SRC).toContain('THE INK COMES FROM THE SAME TOKEN FAMILY AS THE SURFACE');
  });

  it('still carries selection state accessibly, not by colour alone', () => {
    expect(SRC).toContain('aria-pressed={on}');
    expect(SRC).toMatch(/border: on \?/);
  });
});
