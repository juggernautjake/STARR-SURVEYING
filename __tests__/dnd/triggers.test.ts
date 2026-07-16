// __tests__/dnd/triggers.test.ts — event-triggered reactions (Slice 15), the tested pure core.
//
// The motivating case, verbatim: "an enemy that when they attack us and hit us, the armor does a
// certain amount of damage back." That's a Trigger, not an Effect — event-driven, rolls dice, targets
// someone else. These tests pin the collection + gating + description; surfacing is a read of this.
import { describe, it, expect } from 'vitest';
import { collectTriggers, triggersForEvent, describeTrigger, TRIGGER_EVENT_LABEL } from '@/lib/dnd/effects/triggers';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, Trigger } from '@/app/dnd/_sheet/types';

const barbs: Trigger = {
  id: 't1', on: 'hit_by_melee', label: 'Spiked Barbs',
  action: { kind: 'damage', dice: '1d6', damageType: 'piercing' },
  limit: { per: 'round', max: 1 },
};

function spiked(equipped = true): Character {
  const c = blankCharacter('Thornmail');
  c.inventory = [{ id: 'armor', name: 'Spiked Armour', desc: '', qty: 1, tags: [], equipped, triggers: [barbs] }] as Character['inventory'];
  return c;
}

describe('triggers are collected from active sources', () => {
  it('an equipped item\'s trigger is active, sourced to the item', () => {
    const [t] = collectTriggers(spiked());
    expect(t?.label).toBe('Spiked Barbs');
    expect(t?.source).toBe('Spiked Armour');
    expect(t?.sourceKind).toBe('item');
  });

  it('an UNequipped item contributes no trigger (same active-rule as effects)', () => {
    expect(collectTriggers(spiked(false))).toHaveLength(0);
  });

  it('a feature trigger only counts at/above its unlock level', () => {
    const c = blankCharacter('Ret');
    c.meta = { ...c.meta, level: 3 };
    c.features = [
      { id: 'f', name: 'Hellish Rebuke', source: 'Class', body: [], unlockLevel: 5, triggers: [{ id: 'x', on: 'you_are_crit', label: 'Rebuke', action: { kind: 'damage', dice: '2d10', damageType: 'fire' } }] },
    ] as Character['features'];
    expect(collectTriggers(c)).toHaveLength(0); // level 3 < unlock 5
    c.meta.level = 6;
    expect(collectTriggers(c)).toHaveLength(1);
  });

  it('a condition-gated trigger only fires while that condition is active', () => {
    const c = spiked();
    c.inventory[0].triggers = [{ ...barbs, condition: 'raging' }];
    expect(collectTriggers(c)).toHaveLength(0);              // not raging
    expect(collectTriggers(c, ['raging'])).toHaveLength(1);  // raging
  });
});

describe('triggersForEvent filters by the event that fired', () => {
  it('returns the barbs on hit_by_melee, nothing on turn_start', () => {
    expect(triggersForEvent(spiked(), 'hit_by_melee')).toHaveLength(1);
    expect(triggersForEvent(spiked(), 'turn_start')).toHaveLength(0);
  });
});

describe('describeTrigger reads clearly, with its limit', () => {
  it('renders the retaliation as a prompt-ready line', () => {
    expect(describeTrigger(barbs)).toBe('1d6 piercing damage (1/round)');
  });
  it('every event has a human label (a guard against adding an event and forgetting the UI)', () => {
    for (const e of ['hit_by_melee', 'you_crit', 'reduced_to_zero'] as const) {
      expect(TRIGGER_EVENT_LABEL[e]).toBeTruthy();
    }
  });
});

describe('the Reactions panel surfaces triggers (Slice 15 render home)', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');
  it('reads collectTriggers, groups by event, and is mounted on the sheet', () => {
    const panel = read('app/dnd/_sheet/components/Reactions.tsx');
    expect(panel).toContain('collectTriggers(char)');
    expect(panel).toContain('describeTrigger');
    expect(panel).toContain('TRIGGER_EVENT_LABEL');
    expect(panel).toContain('if (!triggers.length) return null'); // no empty box
    expect(read('app/dnd/_sheet/App.tsx')).toContain('<Reactions />');
  });
});
