// __tests__/dnd/dice-style.test.ts — Area D1. The dice-roller visual style is a campaign/player preference.
// Source-anchors that the store exposes the effective preferences, the tray applies the chosen style as a
// data attribute, and the stylesheet themes all four non-default styles — so a refactor that dropped the
// theming (or a style) fails here. 'futuristic' stays the default (the base .tray look).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const store = readFileSync(join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
const tray = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/DiceTray.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'app/dnd/_sheet/styles/theme.css'), 'utf8');

describe('dice roller style preference (D1)', () => {
  it('the store context exposes the effective preferences', () => {
    expect(store).toMatch(/preferences: EffectivePreferences/);
    expect(store).toMatch(/preferences: prefs/);
  });

  it('the dice tray applies the chosen style as a data attribute (on the tray and the FAB)', () => {
    expect(tray).toContain('preferences.diceRollerStyle.value');
    expect(tray.match(/data-dice-style=\{diceStyle\}/g)?.length).toBe(2); // open tray + minimized FAB
  });

  it('the stylesheet themes every non-default style; futuristic is the default base look', () => {
    for (const style of ['rugged', 'natural', 'fantasy', 'medieval']) {
      expect(css).toContain(`.tray[data-dice-style='${style}']`);
    }
    // futuristic is intentionally NOT a data-attribute override — it's the base .tray.
    expect(css).not.toContain("data-dice-style='futuristic'");
  });
});
