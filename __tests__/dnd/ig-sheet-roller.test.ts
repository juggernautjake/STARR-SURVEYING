// __tests__/dnd/ig-sheet-roller.test.ts — Area R1b/IGS6. The IG sheet's in-app roller: tapping a save,
// skill, or attack rolls it through the shared engine and shows the result in a banner. Source-anchors the
// wiring so a refactor that dropped the interactivity (back to static numbers) fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sheet = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGSheet.tsx'), 'utf8');

describe('IG sheet is interactive — tap to roll (R1b / IGS6)', () => {
  it('uses the shared roll engine (resolveD20Roll + rollNaturalD20), not a bespoke roller', () => {
    expect(sheet).toContain("from '@/lib/dnd/roll'");
    expect(sheet).toContain('resolveD20Roll({ natural: rollNaturalD20()');
  });

  it('shows the last roll in a result banner (total + natural + crit/fumble)', () => {
    expect(sheet).toContain('lastRoll');
    expect(sheet).toMatch(/lastRoll\.result\.total/);
    expect(sheet).toMatch(/lastRoll\.result\.(critical|fumble)/);
  });

  it('saves, skills, AND attacks are all tap-to-roll', () => {
    expect(sheet).toMatch(/rollLine\(`\$\{s\} save`/);         // saves
    expect(sheet).toMatch(/rollLine\(`\$\{s\.name\} \(\$\{s\.ability\}\)`/); // skills
    expect(sheet).toMatch(/rollLine\(`\$\{a\.name\} attack`/); // attacks
  });
});
