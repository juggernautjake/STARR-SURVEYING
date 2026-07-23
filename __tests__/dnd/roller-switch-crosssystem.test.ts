// __tests__/dnd/roller-switch-crosssystem.test.ts — switching roller templates works on EVERY system.
//
// The bug: the 5e picker had no `onPick`, so it fell back to a full page RELOAD that didn't reliably apply
// the choice (it snapped back to Dice Core); PF2/IG used local state a remount could reset. The fix drives
// the chosen template from a per-character CLIENT CACHE (`effectiveRollerChoice`/`rememberRollerChoice`) and
// wires `onPick` on all three mounts, so a click switches the roller instantly and it sticks — no reload.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { effectiveRollerChoice, rememberRollerChoice } from '@/lib/dnd/rollerChoice';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the roller-choice cache', () => {
  it('returns the layout default until a choice is made, then the choice — surviving re-reads', () => {
    const id = 'char-switch-test';
    expect(effectiveRollerChoice(id, undefined, 'classic')).toBe('core'); // default
    rememberRollerChoice(id, 'board');
    expect(effectiveRollerChoice(id, undefined, 'classic')).toBe('board'); // the pick wins
    expect(effectiveRollerChoice(id, 'sigil', 'codex')).toBe('board'); // even over the saved value + layout
  });
});

describe('every system wires instant onPick switching (no reload)', () => {
  const mounts: [string, string][] = [
    ['5e (App)', 'app/dnd/_sheet/App.tsx'],
    ['PF2', 'app/dnd/_ui/pf2/usePf2Panels.tsx'],
    ['IG', 'app/dnd/_ui/ig/useIgPanels.tsx'],
  ];
  for (const [name, path] of mounts) {
    it(`${name} passes onPick + resolves via effectiveRollerChoice`, () => {
      const src = read(path);
      expect(src).toMatch(/onPick=\{(pickRoller|setRollerId)\}/); // the picker switches live
      expect(src).toContain('effectiveRollerChoice(');
      expect(src).toContain('rememberRollerChoice(');
    });
  }
});
