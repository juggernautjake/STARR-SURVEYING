// __tests__/dnd/pf2-sheet-spells.test.ts — the PF2 sheet SHOWS what the character has (S13b).
//
// The sheet rendered slot COUNTS with no way to see which spells filled them: a caster could read
// "3 rank-2 slots" and not learn a single spell they knew. Storage arrived with add_spell; this is
// the other half — content that reaches the sheet but never renders is content the player does not
// have.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyPf2Edit } from '@/lib/dnd/systems/pathfinder2e/edit';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

// The Spellcasting section moved into the PF2 panel set (usePf2Panels, T-5a); the Classic shell
// (PF2Sheet) is now thin. Read both so these render anchors hold wherever the string lives.
const src = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/PF2Sheet.tsx'), 'utf8')
  + fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/pf2/usePf2Panels.tsx'), 'utf8');

describe('spells render on the sheet', () => {
  it('reads the stored spell list', () => {
    expect(src).toContain('pf2.spellcasting.spells');
  });

  it('groups by rank, the way a caster actually prepares', () => {
    expect(src).toContain('Cantrips');
    expect(src).toMatch(/Rank \$\{rank\}/);
  });

  it('marks focus spells, which are not cast from slots', () => {
    expect(src).toContain('s.focus');
    expect(src).toContain('Focus Points');
  });

  it('distinguishes prepared from merely known — only for prepared casters', () => {
    // A spontaneous caster's repertoire is always castable, so dimming their spells would be
    // wrong. The distinction only exists for prepared casters.
    expect(src).toContain("pf2.spellcasting.kind === 'prepared'");
    expect(src).toContain('Known, not prepared today');
  });

  it('renders nothing at all when the character has no spells', () => {
    // A Fighter should not get an empty "Spells" heading.
    expect(src).toMatch(/\(pf2\.spellcasting\.spells\?\.length \?\? 0\) > 0/);
  });
});

describe('off-rules content is flagged on the PF2 sheet', () => {
  it('marks both feats and spells', () => {
    expect(src).toContain('OffRulesMark');
    expect(src).toContain('reason={f.offRules}');
    expect(src).toContain('reason={s.offRules}');
  });

  it('the marker survives the trip from the edit onto the sheet', () => {
    // End-to-end: a marker set by the gate and dropped before storage would be worse than no
    // marker, since every consumer would then read the content as legal.
    const c = applyPf2Edit(blankPF2Character('T'), {
      op: 'add_spell', name: 'Wall of Stone', rank: 5, offRules: 'granted by the DM — rank 5',
    });
    expect(c.spellcasting.spells?.[0].offRules).toContain('granted by the DM');
  });
});
