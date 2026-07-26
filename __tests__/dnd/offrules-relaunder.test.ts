// __tests__/dnd/offrules-relaunder.test.ts — an off-rules spell cannot clear its own flag.
//
// Third instance of one shape this session, after the IG and PF2 level walkers: wherever an operation
// REPLACES what it is judged against, the thing under review sits in its own evidence.
//
// `add_spell` is an UPSERT BY NAME. `extraSpells` (fed from the sheet's known spells) makes a spell legal
// regardless of class list, because that is what a grant means. So re-adding an off-rules spell found
// itself already "granted", passed clean, and the upsert swapped the flagged copy for an unflagged one —
// erasing the `offRules` mark that recorded why it was unusual.
//
// The fix is narrow ON PURPOSE, and the first version was wrong. Excluding EVERY known spell from its own
// evidence closed the hole but broke the case the mechanism exists for — a subclass-granted spell being
// touched again was suddenly refused. A gate that blocks legal choices is the worse failure, because a
// player cannot work around it. Only spells ALREADY CARRYING A FLAG lose the bypass.
import { describe, it, expect } from 'vitest';
import { gateEdits } from '@/lib/dnd/rules-gate';

const CHAR = { className: 'Wizard', level: 3, abilities: { int: 16 }, featureNames: [], hasSpellcasting: true };
const addSpell = (name: string, level: number) => ({ op: 'add_spell' as const, name, level, description: '' });

describe('a legitimately granted spell keeps its bypass', () => {
  it('stays legal when touched again', () => {
    // Sacred Flame is a Cleric cantrip — off a Wizard's list, legal only because it was granted.
    const r = gateEdits([addSpell('Sacred Flame', 0)], {
      system: 'dnd5e-2024', enforce: true, ...CHAR, knownSpells: ['Sacred Flame'],
    });
    expect(r.refused).toHaveLength(0);
  });

  it('and that holds when the flagged list is present but does not name it', () => {
    const r = gateEdits([addSpell('Sacred Flame', 0)], {
      system: 'dnd5e-2024', enforce: true, ...CHAR,
      knownSpells: ['Sacred Flame'], offRulesSpells: ['Cure Wounds'],
    });
    expect(r.refused).toHaveLength(0);
  });
});

describe('an ALREADY-FLAGGED spell does not', () => {
  it('is refused rather than passing as "already granted"', () => {
    // The laundering attempt: the sheet holds Sacred Flame WITH an offRules mark, and the same spell is
    // re-added. Without the fix this passed and the upsert replaced the flagged copy with a clean one.
    const r = gateEdits([addSpell('Sacred Flame', 0)], {
      system: 'dnd5e-2024', enforce: true, ...CHAR,
      knownSpells: ['Sacred Flame'], offRulesSpells: ['Sacred Flame'],
    });
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0].reason).toMatch(/not on the Wizard spell list/i);
  });

  it('matches by name the way every picker does', () => {
    const r = gateEdits([addSpell('Sacred Flame', 0)], {
      system: 'dnd5e-2024', enforce: true, ...CHAR,
      knownSpells: ['Sacred Flame'], offRulesSpells: ['  sacred   flame '],
    });
    expect(r.refused).toHaveLength(1);
  });
});

describe('the flagged list changes nothing else', () => {
  it('an on-list spell is still fine even if somehow flagged', () => {
    // Losing the grant bypass is not the same as being refused: Fire Bolt is on the Wizard list and needs
    // no bypass at all.
    const r = gateEdits([addSpell('Fire Bolt', 0)], {
      system: 'dnd5e-2024', enforce: true, ...CHAR,
      knownSpells: ['Fire Bolt'], offRulesSpells: ['Fire Bolt'],
    });
    expect(r.refused).toHaveLength(0);
  });

  it('a grant still does not raise the slot ceiling', () => {
    // The bypass only ever covered the class-list check; the level ceiling is separate and unaffected.
    const r = gateEdits([addSpell('Wish', 9)], {
      system: 'dnd5e-2024', enforce: true, ...CHAR, knownSpells: ['Wish'],
    });
    expect(r.refused).toHaveLength(1);
  });

  it('omitting the list entirely preserves the previous behaviour', () => {
    const r = gateEdits([addSpell('Sacred Flame', 0)], {
      system: 'dnd5e-2024', enforce: true, ...CHAR, knownSpells: ['Sacred Flame'],
    });
    expect(r.refused).toHaveLength(0);
  });
});
