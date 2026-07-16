// __tests__/dnd/triggers.test.ts — event-triggered reactions (Slice 15), the tested pure core.
//
// The motivating case, verbatim: "an enemy that when they attack us and hit us, the armor does a
// certain amount of damage back." That's a Trigger, not an Effect — event-driven, rolls dice, targets
// someone else. These tests pin the collection + gating + description; surfacing is a read of this.
import { describe, it, expect } from 'vitest';
import { collectTriggers, triggersForEvent, describeTrigger, cleanTriggers, TRIGGER_EVENT_LABEL } from '@/lib/dnd/effects/triggers';
import { applySheetEdits } from '@/lib/dnd/sheet-edits';
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

describe('the AI can author triggers on items, validated (Slice 15)', () => {
  it('add_item with triggers round-trips to an active, surfaced trigger', () => {
    // The AI sends triggers without an id (cleanTriggers mints one) — cast the raw payload as the AI's is.
    const out = applySheetEdits(blankCharacter('Ash'), [{
      op: 'add_item', name: 'Spiked Armour', equipped: true,
      triggers: [{ on: 'hit_by_melee', label: 'Barbs', action: { kind: 'damage', dice: '1d6', damageType: 'piercing' }, limit: { per: 'round', max: 1 } }],
    } as unknown as import('@/lib/dnd/sheet-edits').SheetEdit]);
    const item = out.inventory.find((i) => i.name === 'Spiked Armour')!;
    expect(item.triggers).toHaveLength(1);
    expect(collectTriggers(out)).toHaveLength(1); // active because equipped
  });

  it('cleanTriggers drops a bogus event or missing label, never coerces', () => {
    expect(cleanTriggers([{ on: 'when_i_win', label: 'X', action: { kind: 'damage' } }])).toHaveLength(0); // bad event
    expect(cleanTriggers([{ on: 'you_hit', action: { kind: 'damage' } }])).toHaveLength(0);                // no label
    const ok = cleanTriggers([{ on: 'you_hit', label: 'Riposte', action: { kind: 'wat' } }]);              // bad action.kind → prompt
    expect(ok).toHaveLength(1);
    expect(ok[0].action.kind).toBe('prompt');
    expect(ok[0].id).toBeTruthy();
  });
})

describe('the manual trigger builder gives players parity with the AI (Slice 15)', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');
  it('TriggerRows edits the same Trigger shape and is mounted in ItemBuilder', () => {
    const rows = read('app/dnd/_sheet/components/ui/TriggerRows.tsx');
    expect(rows).toContain('TRIGGER_EVENT_LABEL'); // event picker from the registry
    expect(rows).toContain('describeTrigger');     // live preview, same renderer as the panel
    expect(rows).toContain('+ Add reaction');
    const builder = read('app/dnd/_sheet/components/ItemBuilder.tsx');
    expect(builder).toContain('<TriggerRows');
    expect(builder).toContain('cleanTriggers(clean.triggers)'); // validated on save, like the AI path
  });
});
