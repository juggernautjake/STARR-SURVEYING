// __tests__/dnd/ledger-set-max.test.ts — characterization guard for the ledger's `set` semantics.
//
// The ledger resolves a `set`/`set_base` as `Math.max(base, override)` — a `set` can RAISE a value but
// never LOWER it below the character's own base. This is a deliberate, documented choice:
//   • Items: a Belt of Giant Strength "sets STR to 21" but "has no effect if your STR is already ≥ 21"
//     (targets.ts) — so a lesser buff must not lower a stronger character. The max rule is correct here.
//   • Forms: the transform code leans on the same rule ("the set-max rule already stops a dumb beast from
//     lowering you", transform.test.ts) for MENTAL stats — though keepMental is the real mechanism there.
//
// The tension (flagged for the owner, NOT resolved here): by D&D RAW, Wild Shape REPLACES your physical
// stats with the beast's even when LOWER — a druid with STR 20 who turns into a rat becomes STR 2. Today
// the max rule keeps them at 20. Whether a form should be able to lower a physical stat (replace vs. max
// for form-sourced sets) is a rules-correctness decision with the same shape as the attunement one — it
// touches the ledger's core resolution, so it needs a deliberate call, not an autonomous guess.
//
// This test pins the CURRENT behavior so it's explicit and testable, and so implementing any future
// decision fails here and gets reviewed.
import { describe, it, expect } from 'vitest';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, CharForm } from '@/app/dnd/_sheet/types';

function withForm(baseStr: number, formStr: number): Character {
  const c = blankCharacter('Shifter');
  c.abilities = { ...c.abilities, str: baseStr };
  c.forms = [
    { id: 'base', name: 'Base', subtitle: '', cls: '', unlockLevel: 1, gating: 'held', flavor: '', bullets: [] },
    { id: 'form', name: 'Form', subtitle: '', cls: '', unlockLevel: 1, gating: 'held', flavor: '', bullets: [],
      effects: [{ target: 'ability_str', operation: 'set', value: formStr }] },
  ] as CharForm[];
  c.activeFormId = 'form';
  return c;
}

describe('`set` raises but does not lower below the base (max semantics)', () => {
  it('a stronger set RAISES the value (Belt of Giant Strength on a weaker hero)', () => {
    expect(buildLedger(withForm(10, 19)).value('ability_str', 10)).toBe(19);
  });

  it('a lesser set does NOT lower a stronger character (the item rule this exists for)', () => {
    // Base STR 20, an effect sets STR to 15 → stays 20. Correct for a Belt of Giant Strength.
    expect(buildLedger(withForm(20, 15)).value('ability_str', 20)).toBe(20);
  });

  it('CURRENT (flagged) behavior: a weaker FORM also cannot lower physical stats', () => {
    // A Rat form (STR 2) on a STR-20 hero. By RAW Wild Shape would make them STR 2; today the max rule
    // keeps 20. Pinned so the rules-correctness decision (replace vs max for forms) is explicit and any
    // fix is reviewed. See ledger-set-max.test.ts header + DND_RULES_PLATFORM Slice 18.
    expect(buildLedger(withForm(20, 2)).value('ability_str', 20)).toBe(20);
  });
});
