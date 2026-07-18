// __tests__/dnd/ledger-attunement.test.ts — characterization guard for how the ledger treats an
// attuned-but-UNEQUIPPED item.
//
// Context (DND_RULES_PLATFORM Slice 10, open finding): the codebase disagrees on whether attunement
// ALONE (attuned, not worn) should activate an item's effects — the older `collectItemEffects` /
// `deriveAc` paths say equipped-OR-attuned, while the ledger uses equipped-only. Resolving THAT split
// is a flagged product decision (does wearing matter, or just attuning?), left for the owner.
//
// This test does NOT resolve that. It pins two things:
//   1. The LEDGER (source of the sheet's STR/abilities/most numbers) is INTERNALLY CONSISTENT — an
//      attuned-but-unworn item contributes nothing (neither STR nor AC via `value('ac')`), a worn item
//      everything. If someone changes the ledger's attunement handling, this fails loudly for review.
//   2. ⚠ BUT the split-brain IS user-visible today, and this pins it so the owner's decision is informed:
//      the sheet's DISPLAYED AC comes from `deriveAc` (`store.acInfo`), NOT `ledger.value('ac')`, and
//      `deriveAc` uses equipped-OR-attuned while the ledger uses equipped-only. So on the actual sheet an
//      attuned-but-unworn item's AC bonus applies while its STR bonus does not — exactly "AC moved but STR
//      didn't". (An earlier version of this file wrongly claimed the sheet "can never show the split-brain"
//      because it only checked `ledger.value('ac')`, which the sheet does not display for AC.)
import { describe, it, expect } from 'vitest';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { deriveAc } from '@/app/dnd/_sheet/lib/derive-ac';
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

describe('⚠ the split-brain IS user-visible today (deriveAc drives the sheet AC, not the ledger)', () => {
  it('an attuned-but-unworn item: deriveAc APPLIES its AC while the ledger WITHHOLDS its STR', () => {
    const c = withCloak(false, true); // attuned, not worn
    // The ledger (the STR source) withholds the whole item — STR unchanged.
    expect(buildLedger(c).value('ability_str', 10)).toBe(10);
    // But deriveAc — what the store's `acInfo` and thus CombatPanel actually DISPLAY for AC — uses
    // equipped-OR-attuned, so the cloak's +1 AC applies. The sheet shows AC moved (11) but STR didn't (10).
    const ac = deriveAc(c.inventory, /* dexMod */ 0, /* manualAc */ 10, c.activeEffects);
    expect(ac.ac).toBe(11);
    // The resolution the owner picks (BLOCKERS.md §A attunement) should make these two agree — either by
    // giving deriveAc the ledger's equipped-only predicate, or the ledger deriveAc's equipped-or-attuned one.
  });

  it('a worn item: deriveAc and the ledger AGREE (both apply the +1 AC) — the divergence is only the attuned-unworn edge', () => {
    const c = withCloak(true, true);
    expect(deriveAc(c.inventory, 0, 10, c.activeEffects).ac).toBe(11);
    expect(buildLedger(c).value('ac', 10)).toBe(11);
  });
});
