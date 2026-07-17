// __tests__/dnd/effect-ledger.test.ts — the spine of Part II (Slice 10).
//
// The ledger answers "what is this number, and why?" for every value on the sheet. These tests
// pin the properties the rest of Part II is built on — above all that effects are OVERLAYS and
// the stored character is never touched.
import { describe, it, expect } from 'vitest';
import { buildLedger, collectSources } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, InvItem } from '@/app/dnd/_sheet/types';
import type { Effect } from '@/app/dnd/_sheet/engine/effects';

function item(over: Partial<InvItem> & { name: string; effects: Effect[] }): InvItem {
  return {
    id: over.name.toLowerCase().replace(/\W+/g, '-'),
    desc: '',
    qty: 1,
    tags: [],
    equipped: true, // the common case under test; pass equipped: false to override
    ...over,
  } as InvItem;
}

function hero(): Character {
  const c = blankCharacter('Rangor');
  c.meta = { ...c.meta, level: 5 };
  c.abilities = { ...c.abilities, str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
  c.combat = { ...c.combat, ac: 15, speed: 30, maxHp: 44 };
  return c;
}

describe('the no-op case is exact (every existing sheet depends on it)', () => {
  // If a character with no effects derived even slightly differently, swapping the sheet's reads
  // onto the ledger would silently change every character in the database.
  const c = hero();
  const led = buildLedger(c);

  it('reports the stored values unchanged', () => {
    expect(led.value('ability_str')).toBe(16);
    expect(led.value('ac')).toBe(15);
    expect(led.value('speed_walk')).toBe(30);
    expect(led.value('hp_max')).toBe(44);
  });

  it('marks nothing as modified', () => {
    for (const t of ['ability_str', 'ac', 'speed_walk', 'hp_max']) {
      expect(led.isModified(t), `${t} should be untouched`).toBe(false);
    }
    expect(led.sources).toEqual([]);
  });
});

describe('numbers resolve by a documented order, not by luck', () => {
  it('adds stack from multiple sources', () => {
    const c = hero();
    c.inventory = [
      item({ name: 'Belt of the Bear', effects: [{ target: 'ability_str', operation: 'add', value: 2 }] }),
      item({ name: 'Gauntlets', effects: [{ target: 'ability_str', operation: 'add', value: 1 }] }),
    ];
    expect(buildLedger(c).value('ability_str')).toBe(19); // 16 + 2 + 1
  });

  it('the HIGHEST set wins, and cannot drag a better value down', () => {
    // Storm Giant Strength sets 29. Drinking a lesser potion that sets 21 must NOT reduce you.
    const c = hero();
    c.inventory = [
      item({ name: 'Storm Giant Strength', effects: [{ target: 'ability_str', operation: 'set', value: 29 }] }),
      item({ name: 'Hill Giant Strength', effects: [{ target: 'ability_str', operation: 'set', value: 21 }] }),
    ];
    expect(buildLedger(c).value('ability_str')).toBe(29);
  });

  it('a set never lowers the base', () => {
    const c = hero();
    c.abilities = { ...c.abilities, str: 20 };
    c.inventory = [item({ name: 'Hill Giant Strength', effects: [{ target: 'ability_str', operation: 'set', value: 21 }] })];
    expect(buildLedger(c).value('ability_str')).toBe(21);
    c.abilities = { ...c.abilities, str: 24 }; // already better than the potion
    expect(buildLedger(c).value('ability_str')).toBe(24);
  });

  it('adds stack ON TOP of the winning override', () => {
    const c = hero();
    c.inventory = [
      item({ name: 'Hill Giant Strength', effects: [{ target: 'ability_str', operation: 'set', value: 21 }] }),
      item({ name: 'Belt of the Bear', effects: [{ target: 'ability_str', operation: 'add', value: 2 }] }),
    ];
    expect(buildLedger(c).value('ability_str')).toBe(23);
  });

  it('advantage and disadvantage cancel to a flat roll', () => {
    const c = hero();
    c.inventory = [
      item({ name: 'Boots of Elvenkind', effects: [{ target: 'skill.stealth', operation: 'advantage' }] }),
      item({ name: 'Clanking Mail', effects: [{ target: 'skill.stealth', operation: 'disadvantage' }] }),
    ];
    const f = buildLedger(c).rollFlags('skill.stealth');
    expect(f.advantage && f.disadvantage).toBe(true); // both → the caller rolls flat
  });
});

describe('DERIVED targets resolve against the CALLER\'s base', () => {
  // The bug this pins: a spell save DC, a skill total and an initiative bonus are not stored on
  // the sheet — the caller computes them and passes them in. `final` had already collapsed to
  // `0 + bonus` for those, so `value('spell_save_dc', 15)` with a +1 item returned 1. Every
  // derived number on the sheet would have been silently wrong the moment it was wired up, and
  // the original tests missed it because they only covered targets WITH stored bases.
  it('adds to a caller-supplied base rather than replacing it', () => {
    const c = hero();
    c.inventory = [item({ name: 'Rod of the Pact Keeper', effects: [{ target: 'spell_save_dc', operation: 'add', value: 1 }] })];
    expect(buildLedger(c).value('spell_save_dc', 15)).toBe(16); // not 1
  });

  it('works for every derived family', () => {
    const c = hero();
    c.inventory = [
      item({ name: 'Cloak of Protection', effects: [{ target: 'all_saves', operation: 'add', value: 1 }] }),
      item({ name: 'Boots', effects: [{ target: 'skill.stealth', operation: 'add', value: 2 }] }),
      item({ name: 'Bracers', effects: [{ target: 'attack_roll', operation: 'add', value: 1 }] }),
    ];
    const led = buildLedger(c);
    expect(led.value('all_saves', 4)).toBe(5);
    expect(led.value('skill.stealth', 3)).toBe(5);
    expect(led.value('attack_roll', 6)).toBe(7);
  });

  it('an untouched derived target returns the caller\'s base unchanged', () => {
    const led = buildLedger(hero());
    expect(led.value('spell_save_dc', 15)).toBe(15);
    expect(led.value('skill.stealth', 3)).toBe(3);
  });

  it('a set on a derived target cannot lower the caller\'s base', () => {
    const c = hero();
    c.inventory = [item({ name: 'Cap', effects: [{ target: 'spell_save_dc', operation: 'set', value: 13 }] })];
    const led = buildLedger(c);
    expect(led.value('spell_save_dc', 17)).toBe(17); // the base already beats the set
    expect(led.value('spell_save_dc', 11)).toBe(13);
  });
});

describe('removing a source restores the base EXACTLY', () => {
  // This is the property that makes "take the pendant off and you are you again" free. If it
  // fails, every unequip needs undo bookkeeping and the whole design collapses.
  it('unequipping reverts, and the stored character was never touched', () => {
    const c = hero();
    const before = structuredClone(c);
    c.inventory = [item({ name: 'Belt', effects: [{ target: 'ability_str', operation: 'add', value: 2 }] })];

    expect(buildLedger(c).value('ability_str')).toBe(18);

    // The ledger must not have mutated the model it read.
    expect(c.abilities.str).toBe(16);

    c.inventory[0].equipped = false;
    expect(buildLedger(c).value('ability_str')).toBe(16);
    expect(c.abilities).toEqual(before.abilities);
  });
});

describe('a source only counts when it should', () => {
  it('an unequipped item contributes nothing', () => {
    const c = hero();
    c.inventory = [item({ name: 'Belt', equipped: false, effects: [{ target: 'ability_str', operation: 'add', value: 2 }] })];
    expect(buildLedger(c).value('ability_str')).toBe(16);
  });

  it('an attuned item must ALSO be equipped', () => {
    const c = hero();
    c.inventory = [item({ name: 'Ring', attuned: true, equipped: false, effects: [{ target: 'ac', operation: 'add', value: 1 }] })];
    expect(buildLedger(c).value('ac')).toBe(15);
    c.inventory[0].equipped = true;
    expect(buildLedger(c).value('ac')).toBe(16);
  });

  it('a conditional effect waits for its condition', () => {
    const c = hero();
    c.inventory = [item({ name: 'Wrath Blade', effects: [{ target: 'speed_walk', operation: 'add', value: 10, condition: 'raging' }] })];
    expect(buildLedger(c).value('speed_walk')).toBe(30);
    expect(buildLedger(c, { active: ['raging'] }).value('speed_walk')).toBe(40);
  });

  it("a feature above the character's level does not apply", () => {
    // Otherwise a level-20 capstone silently buffs a level-5 character.
    const c = hero();
    c.features = [
      { id: 'f1', name: 'Now', source: 'Class', body: [''], unlockLevel: 1, effects: [{ target: 'ac', operation: 'add', value: 1 }] },
      { id: 'f2', name: 'Later', source: 'Class', body: [''], unlockLevel: 20, effects: [{ target: 'ac', operation: 'add', value: 5 }] },
    ];
    expect(buildLedger(c).value('ac')).toBe(16);
  });
});

describe('the ledger explains itself (the panel and the tooltip are reads, not re-derivations)', () => {
  it('names every contributing source with plain-English labels', () => {
    const c = hero();
    c.inventory = [item({ name: 'Belt of the Bear', effects: [{ target: 'ability_str', operation: 'add', value: 2 }] })];
    c.activeEffects = [{ id: 'ae1', label: 'Rage', effects: [{ target: 'ability_str', operation: 'add', value: 2 }] }];

    const led = buildLedger(c);
    expect(led.value('ability_str')).toBe(20);
    expect(led.isModified('ability_str')).toBe(true);

    const why = led.explain('ability_str');
    expect(why.map((c) => c.source)).toEqual(['Belt of the Bear', 'Rage']);
    expect(why.map((c) => c.label)).toEqual(['+2 STR', '+2 STR']);
    expect(why.map((c) => c.delta)).toEqual([2, 2]);
  });

  it('marks a suppressed contribution rather than hiding it', () => {
    // "My belt says +2 but my STR didn't move" is exactly the confusion the panel exists to end,
    // so a `set` that lost must still be listed — flagged as contributing nothing.
    const c = hero();
    c.inventory = [
      item({ name: 'Storm Giant Strength', effects: [{ target: 'ability_str', operation: 'set', value: 29 }] }),
      item({ name: 'Hill Giant Strength', effects: [{ target: 'ability_str', operation: 'set', value: 21 }] }),
    ];
    const why = buildLedger(c).explain('ability_str');
    expect(why.find((c) => c.source === 'Hill Giant Strength')?.suppressed).toBe(true);
    expect(why.find((c) => c.source === 'Storm Giant Strength')?.suppressed).toBeFalsy();
  });

  it('collects resistances and proficiencies with their sources', () => {
    const c = hero();
    c.inventory = [
      item({ name: 'Dragon Scale', effects: [{ target: 'resistance', operation: 'resistance', value: 'fire' }] }),
      item({ name: 'Ring of Learning', effects: [{ target: 'proficiency', operation: 'grant_proficiency', value: 'dwarvish' }] }),
    ];
    const led = buildLedger(c);
    expect(led.collected('resistance')).toEqual([{ value: 'fire', source: 'Dragon Scale' }]);
    expect(led.collected('grant_proficiency')).toEqual([{ value: 'dwarvish', source: 'Ring of Learning' }]);
  });
});

describe('movement is per-mode, and speed_all means what it says', () => {
  it('a fly speed can exist while the walking speed is 0', () => {
    const c = hero();
    c.combat = { ...c.combat, speed: 0 };
    c.activeEffects = [{ id: 'p', label: 'Potion of Flying', effects: [{ target: 'speed_fly', operation: 'set', value: 60 }] }];
    const led = buildLedger(c);
    expect(led.value('speed_walk')).toBe(0);
    expect(led.value('speed_fly')).toBe(60);
  });

  it('grants a burrow speed (the requested "tunneling speed")', () => {
    const c = hero();
    c.activeEffects = [{ id: 'p', label: 'Potion of Delving', effects: [{ target: 'speed_burrow', operation: 'set', value: 20 }] }];
    expect(buildLedger(c).value('speed_burrow')).toBe(20);
  });

  it('speed_all fans out to every mode the character actually has', () => {
    const c = hero();
    c.inventory = [
      item({ name: 'Wings', effects: [{ target: 'speed_fly', operation: 'set', value: 30 }] }),
      item({ name: 'Haste', effects: [{ target: 'speed_all', operation: 'add', value: 10 }] }),
    ];
    const led = buildLedger(c);
    expect(led.value('speed_walk')).toBe(40);
    expect(led.value('speed_fly')).toBe(40);
    // It must not invent a mode the character doesn't have.
    expect(led.byTarget.speed_burrow).toBeUndefined();
  });
});

describe('identity effects overlay and never mutate', () => {
  it('an item can rename you without touching the stored name', () => {
    const c = hero();
    c.inventory = [item({ name: 'Pendant of Zul', effects: [{ target: 'name', operation: 'set', value: 'Zul the Devourer' }] })];

    const led = buildLedger(c);
    expect(led.identity('name')).toEqual({ value: 'Zul the Devourer', source: 'Pendant of Zul' });
    // The whole architectural rule in one assertion: if this ever fails, an autosave between
    // equip and unequip leaves the character permanently renamed with the real one gone.
    expect(c.meta.name).toBe('Rangor');

    c.inventory[0].equipped = false;
    expect(buildLedger(c).identity('name')).toBeNull();
  });

  it('one item can rewrite several identity fields at once', () => {
    const c = hero();
    c.inventory = [
      item({
        name: 'The Boot',
        effects: [
          { target: 'name', operation: 'set', value: 'Someone Else' },
          { target: 'species', operation: 'set', value: 'Bear' },
          { target: 'class', operation: 'set', value: 'Druid' },
          { target: 'gender', operation: 'set', value: 'female' },
          { target: 'profession', operation: 'set', value: 'Baker' },
        ],
      }),
    ];
    const led = buildLedger(c);
    expect(led.identity('species')?.value).toBe('Bear');
    expect(led.identity('class')?.value).toBe('Druid');
    expect(led.identity('gender')?.value).toBe('female');
    expect(led.identity('profession')?.value).toBe('Baker');
    expect(led.identity('ability_str')).toBeNull(); // not an identity target
  });
});

describe('collectSources sees every kind of source', () => {
  it('distinguishes worn, attuned, consumed and feature sources', () => {
    const c = hero();
    c.inventory = [
      item({ name: 'Worn', effects: [{ target: 'ac', operation: 'add', value: 1 }] }),
      item({ name: 'Attuned', attuned: true, effects: [{ target: 'ac', operation: 'add', value: 1 }] }),
    ];
    c.activeEffects = [{ id: 'ae', label: 'Potion', source: 'Potion of Strength', effects: [{ target: 'ability_str', operation: 'add', value: 2 }] }];
    c.features = [{ id: 'f', name: 'Feat', source: 'Class', body: [''], effects: [{ target: 'ac', operation: 'add', value: 1 }] }];

    expect(collectSources(c).map((s) => s.kind)).toEqual(['item', 'attuned', 'consumed', 'feature']);
  });

  it('ignores items and features that carry no mechanics', () => {
    const c = hero();
    c.inventory = [item({ name: 'A rock', effects: [] })];
    c.features = [{ id: 'f', name: 'Flavour', source: 'Bio', body: ['prose only'] }];
    expect(collectSources(c)).toEqual([]);
  });
});

describe('one item, any number of effects of any mix — the "boot that rewrites you" (no special code)', () => {
  // The architecture claim the doc makes: an item is just a bag of effects, and the ledger resolves each
  // by its target + operation with NO per-item logic. So a SINGLE item carrying fifteen effects across
  // every family — ability, AC, two movement modes, max HP, initiative, saves, a skill advantage, the
  // three damage defenses, a condition-save advantage, a cross-class feature, a sense, an identity overlay
  // — must resolve them ALL from one buildLedger pass, each attributed to the one item, and hand them ALL
  // back the instant it comes off. If any of this needed special-casing, this is where it would show.
  const REWRITER = (): InvItem =>
    item({
      name: 'Boots of Rewriting',
      effects: [
        { target: 'ability_str', operation: 'add', value: 2 },
        { target: 'ac', operation: 'add', value: 1 },
        { target: 'speed_walk', operation: 'add', value: 10 },
        { target: 'speed_fly', operation: 'set', value: 60 },
        { target: 'hp_max', operation: 'add', value: 5 },
        { target: 'initiative', operation: 'add', value: 2 },
        { target: 'all_saves', operation: 'add', value: 1 },
        { target: 'skill.stealth', operation: 'advantage' },
        { target: 'resistance', operation: 'resistance', value: 'fire' },
        { target: 'immunity', operation: 'immunity', value: 'poison' },
        { target: 'vulnerability', operation: 'vulnerability', value: 'cold' },
        { target: 'condition_advantage', operation: 'condition_advantage', value: 'poison' },
        { target: 'grant_feature', operation: 'set', value: 'Rage (Barbarian)' },
        { target: 'grant_sense', operation: 'set', value: 'darkvision 60' },
        { target: 'name', operation: 'set', value: 'The Rewritten' },
      ] as Effect[],
    });

  it('resolves all fifteen effects from one pass, each sourced to the single item', () => {
    const c = hero();
    c.inventory = [REWRITER()];
    const led = buildLedger(c);

    // numbers (add stacks onto the sheet base; set overrides)
    expect(led.value('ability_str')).toBe(18);
    expect(led.value('ac')).toBe(16);
    expect(led.value('speed_walk')).toBe(40);
    expect(led.value('speed_fly')).toBe(60);
    expect(led.value('hp_max')).toBe(49);
    expect(led.value('initiative', 0)).toBe(2);
    expect(led.value('all_saves', 0)).toBe(1);
    // roll flag
    expect(led.rollFlags('skill.stealth').advantage).toBe(true);
    // collected damage defenses
    expect(led.collected('resistance').map((r) => r.value)).toEqual(['fire']);
    expect(led.collected('immunity').map((r) => r.value)).toEqual(['poison']);
    expect(led.collected('vulnerability').map((r) => r.value)).toEqual(['cold']);
    // explained refs + the condition-save advantage
    expect(led.explain('condition_advantage')[0].effect.value).toBe('poison');
    expect(led.explain('grant_feature')[0].effect.value).toBe('Rage (Barbarian)');
    expect(led.explain('grant_sense')[0].effect.value).toBe('darkvision 60');
    // identity overlay
    expect(led.identity('name')?.value).toBe('The Rewritten');

    // ONE source, despite fifteen effects — the "no special code" invariant made concrete.
    expect(led.sources).toHaveLength(1);
    // and every attribution points back to that same one item.
    for (const s of [
      led.collected('resistance')[0].source,
      led.explain('grant_feature')[0].source,
      led.identity('name')?.source,
    ]) expect(s).toBe('Boots of Rewriting');
  });

  it('hands every one of them back the instant the boot comes off', () => {
    const c = hero();
    c.inventory = [REWRITER()];
    c.inventory[0].equipped = false; // an unworn item contributes nothing
    const led = buildLedger(c);
    expect(led.value('ability_str')).toBe(16);
    expect(led.value('ac')).toBe(15);
    expect(led.value('speed_walk')).toBe(30);
    expect(led.value('speed_fly')).toBe(0);
    expect(led.value('hp_max')).toBe(44);
    expect(led.value('all_saves', 0)).toBe(0);
    expect(led.rollFlags('skill.stealth').advantage).toBe(false);
    expect(led.collected('resistance')).toEqual([]);
    expect(led.explain('grant_feature')).toEqual([]);
    expect(led.identity('name')).toBeNull();
    expect(led.sources).toEqual([]);
  });
});
