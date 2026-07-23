// __tests__/dnd/roller-styling-crosssystem.test.ts — the animated rollers render STYLED on PF2/IG.
//
// The bug: the animated roller STAGES style from the 5e `--*` tokens, which resolved to nothing on the
// bespoke PF2/IG (`--hx-*`) sheets — so the roller looked like a "basic modal". Two guards: RollStage carries
// its own CSS (like the other stages), and the shell token bridge provides the COMPLETE set the stage CSS
// reaches for.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shellThemeVars } from '@/lib/dnd/skin-tokens';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('RollStage carries its own styling', () => {
  it('imports rollStage.css, like the other three stages import theirs', () => {
    expect(read('app/dnd/_sheet/components/RollStage.tsx')).toContain("import './rollers/rollStage.css'");
  });
  it('rollStage.css holds the Dice Core rules + keyframes', () => {
    const css = read('app/dnd/_sheet/components/rollers/rollStage.css');
    expect(css).toContain('.dnd-sheet .stage-core');
    expect(css).toContain('@keyframes ruggedTumble');
  });
});

describe('the shell token bridge provides every token the roller stages need', () => {
  // Union of the tokens the four stage CSS files reference — the roller renders wrong if any is missing.
  const NEEDED = [
    '--void', '--void-rgb', '--gold', '--gold-rgb', '--ink', '--muted', '--muted-2', '--line', '--line-strong',
    '--tealbright', '--tealbright-rgb', '--danger', '--danger-rgb', '--good', '--good-rgb', '--hotpink',
    '--hotpink-rgb', '--violet-rgb', '--violet-2', '--violet-2-rgb', '--panel-rgb', '--font-display', '--font-mono',
  ];
  it('shellThemeVars maps all of them (for a bespoke skin)', () => {
    const vars = shellThemeVars('hextech') as Record<string, string>;
    const missing = NEEDED.filter((t) => !(t in vars));
    expect(missing, `shell bridge is missing roller tokens: ${missing.join(', ')}`).toEqual([]);
  });
  it('the PF2 + IG Classic roots carry shellTokens so the floating roller inherits them', () => {
    for (const f of ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx']) {
      expect(read(f)).toMatch(/\.\.\.hxVars, \.\.\.shellTokens/);
    }
  });
});
