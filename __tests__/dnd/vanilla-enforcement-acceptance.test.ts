// __tests__/dnd/vanilla-enforcement-acceptance.test.ts — the doc's "Done means", checked directly.
//
// Each slice has its own tests. This file exists because slices can each pass while the PROPERTY
// the work was for still fails — the bug was reported as "a level-4 vanilla Wizard can add Wish",
// and the answer has to be no by EVERY route, not by most of them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gateEdits } from '@/lib/dnd/rules-gate';
import { buildGrantEdits, isGrantError } from '@/lib/dnd/library-grant';
import { spellEligibility } from '@/lib/dnd/spells/eligibility';
import { spellsForSystem } from '@/lib/dnd/spells';
import type { SheetEdit } from '@/lib/dnd/sheet-edits';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const catalog = spellsForSystem('dnd5e-2024');
const byName = (n: string) => catalog.find((s) => s.name.toLowerCase() === n.toLowerCase())!;

// The character from the bug report, and the three things they must not be able to reach.
const CHAR = { className: 'Wizard', level: 4 };
const FORBIDDEN = [
  ['Wish', 9, 'a spell far above their slots'],
  ['Sacred Flame', 0, 'a spell from another class'],
  ['Wall of Force', 5, 'a 5th-level spell they have no slot for'],
] as const;

const asEdit = (name: string, level: number): SheetEdit =>
  ({ op: 'add_spell', name, level, description: 'x' } as SheetEdit);

describe('“a vanilla level-4 Wizard CANNOT add it, by any route”', () => {
  for (const [name, level, why] of FORBIDDEN) {
    describe(`${name} — ${why}`, () => {
      it('route 1: the eligibility core says no', () => {
        expect(spellEligibility(byName(name), { system: 'dnd5e-2024', ...CHAR }).ok).toBe(false);
      });

      it('route 2: the AI edit path refuses it', () => {
        const r = gateEdits([asEdit(name, level)], { system: 'dnd5e-2024', enforce: true, ...CHAR, knownSpells: [] });
        expect(r.edits).toHaveLength(0);
        expect(r.refused).toHaveLength(1);
      });

      it('route 3: the library grant path refuses it', () => {
        const r = buildGrantEdits({ kind: 'spell', name, system: 'dnd5e-2024' },
          { enforce: true, character: { ...CHAR, knownSpells: [] } });
        expect(isGrantError(r)).toBe(true);
      });

      it('route 4: the picker disables the button rather than filtering the row away', () => {
        const src = read('app/dnd/_sheet/components/ui/SpellPicker.tsx');
        expect(src).toContain('disabled={blocked}');
        expect(src).toMatch(/if \(isVanilla && !elig\.ok && !isDM\) return/);
      });
    });
  }
});

describe('“a custom character can add all three, and each is visibly marked”', () => {
  for (const [name, level] of FORBIDDEN) {
    it(`${name} is allowed and marked`, () => {
      const r = gateEdits([asEdit(name, level)],
        { system: 'dnd5e-2024', enforce: false, unboundReason: 'custom-character', ...CHAR, knownSpells: [] });
      expect(r.refused).toHaveLength(0);
      expect((r.edits[0] as { offRules?: string }).offRules).toBeTruthy();
    });
  }

  it('and the sheet renders that marker', () => {
    expect(read('app/dnd/_sheet/components/SpellsPanel.tsx')).toContain('OffRulesMark');
  });
});

describe('“a DM can still grant anything, and it lands marked as granted”', () => {
  for (const [name, level] of FORBIDDEN) {
    it(`${name} reaches the sheet, labelled as a grant`, () => {
      const r = gateEdits([asEdit(name, level)],
        { system: 'dnd5e-2024', enforce: false, unboundReason: 'dm-grant', ...CHAR, knownSpells: [] });
      expect(r.edits).toHaveLength(1);
      expect((r.edits[0] as { offRules?: string }).offRules).toContain('granted by the DM');
    });
  }
});

describe('“subclass expanded lists still work — no legal choice is blocked”', () => {
  // The failure mode in the OTHER direction, and the worse one: a builder that blocks legal
  // choices is more broken than the permissiveness this work removed, because a player cannot
  // work around it.
  it('a spell already granted stays legal on the next look', () => {
    const r = gateEdits([asEdit('Sacred Flame', 0)],
      { system: 'dnd5e-2024', enforce: true, ...CHAR, knownSpells: ['Sacred Flame'] });
    expect(r.refused).toHaveLength(0);
  });

  it('but a grant does not raise the character’s slot ceiling', () => {
    // Being handed one off-list spell must not become a general licence.
    const r = gateEdits([asEdit('Wish', 9)],
      { system: 'dnd5e-2024', enforce: true, ...CHAR, knownSpells: ['Sacred Flame'] });
    expect(r.refused).toHaveLength(1);
  });

  it('ordinary class-appropriate spells are untouched at every level', () => {
    for (const [name, lvl] of [['Fire Bolt', 0], ['Magic Missile', 1], ['Misty Step', 2]] as const) {
      const r = gateEdits([asEdit(name, lvl)], { system: 'dnd5e-2024', enforce: true, ...CHAR, knownSpells: [] });
      expect(r.refused, `${name} must remain takeable`).toHaveLength(0);
    }
  });

  it('a non-caster is not handed a spell list by accident', () => {
    const r = gateEdits([asEdit('Magic Missile', 1)],
      { system: 'dnd5e-2024', enforce: true, className: 'Fighter', level: 4, knownSpells: [] });
    expect(r.refused).toHaveLength(1);
  });
});

describe('the enforcement cannot be turned off from outside', () => {
  it('neither route lets the request body decide whether rules apply', () => {
    for (const p of [
      'app/api/dnd/characters/[id]/ai-edit/route.ts',
      'app/api/dnd/characters/[id]/grant-content/route.ts',
    ]) {
      const src = read(p);
      expect(src, p).not.toMatch(/enforce:\s*body\./);
      expect(src, p).toContain('readActiveSlotMeta(');
    }
  });

  it('an unlabelled character is treated as vanilla, not custom', () => {
    // The whole chain's safe default. Getting this backwards would let every legacy sheet escape
    // silently — which is indistinguishable from never having built any of this.
    for (const p of [
      'app/api/dnd/characters/[id]/ai-edit/route.ts',
      'app/api/dnd/characters/[id]/grant-content/route.ts',
    ]) {
      expect(read(p), p).toContain(".kind ?? 'vanilla'");
    }
    expect(read('app/dnd/_sheet/state/store.tsx')).toContain("variantKind = 'vanilla'");
  });
});
