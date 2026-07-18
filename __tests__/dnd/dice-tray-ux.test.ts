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

  it('dragging pins the tray’s width so it never shrinks/reflows when it detaches to float', () => {
    // Owner: dragging made the roller "slightly smaller and messed up its interior formatting".
    expect(tray).toContain('dragWidth');
    expect(tray).toContain('dragWidth.current = rect.width'); // capture the docked width at drag start
    expect(tray).toMatch(/setPos\(\{ x: rect\.left, y: rect\.top, w: rect\.width \}\)/);
    expect(tray).toContain('width: pos.w'); // and apply it to the floating tray
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
