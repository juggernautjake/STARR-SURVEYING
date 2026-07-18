// __tests__/dnd/dice-tray-ux.test.ts — the dice tray's in-roller UX (owner 2026-07-18): a style selector on
// the roller itself, and auto-opening the minimized tray when a roll is triggered from the sheet.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tray = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/DiceTray.tsx'), 'utf8');

describe('dice tray UX', () => {
  it('has an in-tray style selector over all five roller styles, overriding the preference', () => {
    expect(tray).toContain("['futuristic', 'rugged', 'natural', 'fantasy', 'medieval']");
    expect(tray).toContain('setStyleOverride');
    expect(tray).toContain('styleOverride ?? preferences.diceRollerStyle.value');
    expect(tray).toMatch(/data-dice-style=\{diceStyle\}/);
  });

  it('auto-opens the minimized tray when a roll is triggered (watches activeRoll.token)', () => {
    expect(tray).toContain('const rollToken = activeRoll?.token');
    expect(tray).toMatch(/useEffect\(\(\) => \{\s*if \(rollToken != null\) setOpen\(true\)/);
  });
});
