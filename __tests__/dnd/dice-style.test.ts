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

import { readFileSync as _rf } from 'node:fs';
import { join as _join } from 'node:path';

describe('per-skin sounds + spin animations (Area D4e)', () => {
  const audio = _rf(_join(process.cwd(), 'app/dnd/_sheet/lib/audio.ts'), 'utf8');
  const rollStage = _rf(_join(process.cwd(), 'app/dnd/_sheet/components/RollStage.tsx'), 'utf8');
  const theme = _rf(_join(process.cwd(), 'app/dnd/_sheet/styles/theme.css'), 'utf8');

  it('audio defines a distinct VOICE per skin and every SFX takes the skin', () => {
    for (const skin of ['futuristic', 'rugged', 'natural', 'fantasy', 'medieval']) {
      expect(audio).toContain(`${skin}: { wave:`);
    }
    expect(audio).toContain('export function tick(progress = 0, skin?: string)');
    expect(audio).toContain('export function tada(skin?: string)');
    expect(audio).toContain('export function errorBuzz(skin?: string)');
    expect(audio).toContain('function voice(skin?: string)');
  });

  it('RollStage passes the active roller skin into every SFX call', () => {
    expect(rollStage).toContain('tick(progress, roller)');
    expect(rollStage).toContain('errorBuzz(roller)');
    expect(rollStage).toContain('tada(roller)');
    expect(rollStage).toContain('blip(roller)');
    expect(rollStage).toContain('whoosh(roller)');
  });

  it('each non-futuristic skin has its own spinning-number animation', () => {
    for (const kf of ['ruggedTumble', 'naturalBob', 'fantasyFloat', 'medievalStamp']) {
      expect(theme).toContain(`@keyframes ${kf}`);
    }
    expect(theme).toContain("[data-dice-style='rugged'] .stage-spinning .stage-number");
    expect(theme).toContain('prefers-reduced-motion: reduce'); // honors reduced motion
  });
});
