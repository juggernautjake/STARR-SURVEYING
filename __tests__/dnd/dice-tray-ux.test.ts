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

  it('auto-expands the minimized dock when a roll is triggered (watches activeRoll.token)', () => {
    // The window chrome (minimize/restore) now lives in the shared FloatingRoller dock; DiceTray only
    // asks it to pop open on a fresh roll via the dock context, so the roll animation is never hidden.
    expect(tray).toContain('const rollToken = activeRoll?.token');
    expect(tray).toMatch(/useEffect\(\(\) => \{\s*if \(rollToken != null\) dock\.expand\(\)/);
    expect(tray).toContain('const dock = useRollerDock()');
  });

  it('no longer owns its own float/drag/minimize — that folded into the shared dock (R-2)', () => {
    // The floating window is now ONE implementation (useFloatingDock/FloatingRoller); DiceTray must not
    // carry a second, competing one, so its old pos/drag/FAB/minimize state is gone.
    const code = tray.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('tray-fab');
    expect(code).not.toContain('setPos');
    expect(code).not.toContain('dragWidth');
    expect(code).not.toContain('.floating');
  });
});

describe('per-skin number-display styling (D4d)', () => {
  const rollStage = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/RollStage.tsx'), 'utf8');

  it('RollStage takes the roller skin + defines per-skin display modes', () => {
    expect(rollStage).toContain('function RollStage({ roller = ');
    expect(rollStage).toContain('DISPLAY_MODES');
    // futuristic cycles everything; the others do not
    expect(rollStage).toMatch(/futuristic: \{ cycleColor: true, cycleFont: true, rotate: true \}/);
    expect(rollStage).toMatch(/natural: \{ cycleColor: false, cycleFont: false, rotate: false, color: 'var\(--tealbright\)'/);
  });

  it('the spin + landing honour the mode (cycle vs stable/mono), crit/fumble stay semantic', () => {
    expect(rollStage).toContain('mode.cycleColor ? randOf(NEON) : (mode.color');
    expect(rollStage).toContain('mode.cycleFont ? randOf(FONTS) : (mode.font');
    expect(rollStage).toContain("fumble ? 'var(--danger)' : crit ? 'var(--gold)'"); // crit/fumble semantic on every skin
  });

  it('DiceTray passes the active skin to RollStage', () => {
    expect(tray).toContain('<RollStage roller={diceStyle} />');
  });
});

describe('recordMode preference drives the entry panel default (Area R — was unused)', () => {
  it('reads preferences.recordMode and defaults the entry panel open + to the matching mode', () => {
    expect(tray).toContain('const recordMode = preferences.recordMode.value');
    expect(tray).toContain("useState(recordMode !== 'auto')"); // manual/irl → panel open by default
    expect(tray).toContain("useState<'fold' | 'log'>(recordMode === 'irl' ? 'log' : 'fold')"); // irl → Record IRL, else Fold
  });
})
