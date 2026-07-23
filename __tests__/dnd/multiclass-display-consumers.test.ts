// __tests__/dnd/multiclass-display-consumers.test.ts — MC-5e-5 display routing anti-drift.
//
// The multiclass split ("Fighter 3 / Wizard 2") must show wherever the sheet prints the character's class.
// Three DISPLAY consumers were routed through `classDisplayFor` — the Hero (Classic/Codex header), the
// PlayLayout subtitle (Play format), and the App footer (the classic overview footer line). A refactor that
// drops any of them would silently regress a multiclass character back to showing only its primary class.
// This pins each consumer to the resolver, and pins the resolver's own behaviour end-to-end.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classDisplayFor } from '@/lib/dnd/classes/multiclass-resolve';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('every class-display consumer routes through classDisplayFor (MC-5e-5)', () => {
  it('the Hero header (Classic/Codex) resolves the class through classDisplayFor for multiclass', () => {
    const hero = read('app/dnd/_sheet/components/Hero.tsx');
    expect(hero).toContain("import { classDisplayFor } from '@/lib/dnd/classes/multiclass-resolve'");
    // multiclass branch feeds classDisplayFor; the ledger identity override still reads first.
    expect(hero).toMatch(/isMulti\s*\?\s*classDisplayFor\(system, char\.meta\)\s*:\s*char\.meta\.className/);
  });

  it('the Play subtitle resolves the class through classDisplayFor', () => {
    const play = read('app/dnd/_sheet/codex/PlayLayout.tsx');
    expect(play).toContain("import { classDisplayFor } from '@/lib/dnd/classes/multiclass-resolve'");
    expect(play).toContain('classDisplayFor(system, meta)');
  });

  it('the App footer shows the split for multiclass and species+class+level for single-class', () => {
    const app = read('app/dnd/_sheet/App.tsx');
    expect(app).toContain("import { classDisplayFor } from '@/lib/dnd/classes/multiclass-resolve'");
    expect(app).toContain('classDisplayFor(system ?? \'\', char.meta)');
    // single-class path preserved exactly (species + className + level)
    expect(app).toContain('[char.meta.species, char.meta.className, char.meta.level]');
  });
});

describe('classDisplayFor is the one answer all three print', () => {
  it('single-class → class · subclass; multiclass → the split', () => {
    expect(classDisplayFor('dnd5e-2014', { className: 'Fighter', subclass: 'Champion' })).toBe('Fighter · Champion');
    expect(
      classDisplayFor('dnd5e-2014', {
        className: 'Fighter',
        classes: [{ classKey: 'fighter', level: 3 }, { classKey: 'wizard', level: 2 }],
      }),
    ).toBe('Fighter 3 / Wizard 2');
  });
});
