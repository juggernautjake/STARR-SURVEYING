// __tests__/dnd/ledger-attunement.test.ts — characterization guard for how the ledger treats an
// attuned-but-UNEQUIPPED item.
//
// Context (DND_RULES_PLATFORM Slice 10, open finding): the codebase disagrees on whether attunement
// ALONE (attuned, not worn) should activate an item's effects — the older `collectItemEffects` /
// `deriveAc` paths say equipped-OR-attuned, while the ledger uses equipped-only. Resolving THAT split
// is a flagged product decision (does wearing matter, or just attuning?), left for the owner.
//
// This test does NOT resolve that. It pins the one thing that is not in question: the ledger — the
// source of truth for the sheet's displayed numbers — is INTERNALLY CONSISTENT. An attuned-but-unworn
// item contributes nothing at all (neither a STR bonus nor an AC bonus), and a worn item contributes
// everything. So the sheet can never show the split-brain "AC moved but STR didn't" on a single item.
// If someone changes the ledger's attunement handling (e.g. to implement the owner's decision), this
// fails loudly and deliberately — which is exactly when that change should be reviewed.
import { describe, it, expect } from 'vitest';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

function withCloak(equipped: boolean, attuned: boolean): Character {
  const c = blankCharacter('Test');
  c.abilities = { ...c.abilities, str: 10 };
  c.inventory = [{
    id: 'cloak', name: 'Cloak of the Bear', desc: '', qty: 1, tags: [],
    equipped, attuned,
    effects: [
      { target: 'ability_str', operation: 'add', value: 2 },
      { target: 'ac', operation: 'add', value: 1 },
    ],
  }] as Character['inventory'];
  return c;
}

describe('the ledger treats an attuned item uniformly across all its effects', () => {
  it('attuned but NOT worn → contributes nothing (not STR, not AC) — no split-brain', () => {
    const led = buildLedger(withCloak(false, true));
    expect(led.value('ability_str', 10)).toBe(10);
    expect(led.value('ac', 10)).toBe(10);
    expect(led.isModified('ability_str')).toBe(false);
    expect(led.isModified('ac')).toBe(false); // the key property: AC does NOT apply while STR doesn't
  });

  it('worn → contributes everything (STR and AC together)', () => {
    const led = buildLedger(withCloak(true, true));
    expect(led.value('ability_str', 10)).toBe(12);
    expect(led.value('ac', 10)).toBe(11);
  });

  it('worn without attunement still applies (the item does not require the ring finger to be a shirt)', () => {
    // Whether attunement is a PREREQUISITE is a separate concern; this pins that the equipped flag alone
    // activates the ledger, matching isEquipped-based resolution.
    const led = buildLedger(withCloak(true, false));
    expect(led.value('ability_str', 10)).toBe(12);
    expect(led.value('ac', 10)).toBe(11);
  });
});
