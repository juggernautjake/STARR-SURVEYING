// __tests__/dnd/consume-plan.test.ts — the pure consumption plan (Slice 12).
//
// planConsume decides WHAT using a consumable does; the Inventory component executes it. These pin
// the acceptance cases from the request: a pure-heal potion resolves and leaves NO lasting effect;
// a buff potion snapshots an ActiveEffect with its label + duration; note-only still consumes.
import { describe, it, expect } from 'vitest';
import { planConsume } from '@/lib/dnd/effects/consume';
import type { InvItem } from '@/app/dnd/_sheet/types';
import type { Effect } from '@/app/dnd/_sheet/engine/effects';

const c = (over: Partial<InvItem> & { name: string; consumable: InvItem['consumable'] }): InvItem =>
  ({ id: over.name.toLowerCase(), desc: '', qty: 1, tags: [], ...over }) as InvItem;

describe('planConsume', () => {
  it('a heal potion rolls now and leaves NO lasting effect', () => {
    const plan = planConsume(c({ name: 'Potion of Healing', consumable: { effect: { kind: 'heal', dice: '2d4+2' } } }));
    expect(plan.instant).toEqual({ kind: 'heal', dice: '2d4+2' });
    expect(plan.activeEffect).toBeNull(); // a pure-heal potion never appears in Active Effects
    expect(plan.consumes).toBe(true);
  });

  it('a temp-HP potion is an instant of kind temp', () => {
    const plan = planConsume(c({ name: 'Potion of Vitality', consumable: { effect: { kind: 'temp', dice: '3d4' } } }));
    expect(plan.instant).toEqual({ kind: 'temp', dice: '3d4' });
    expect(plan.activeEffect).toBeNull();
  });

  it('a buff potion snapshots an ActiveEffect with its label, effects and duration', () => {
    const plan = planConsume(c({
      name: 'Potion of Storm Giant Strength',
      consumable: { effect: { kind: 'buff', effects: [{ target: 'ability_str', operation: 'set', value: 29 }], duration: '1 hour' } },
    }));
    expect(plan.instant).toBeNull();
    expect(plan.activeEffect).toEqual({
      label: 'Potion of Storm Giant Strength',
      effects: [{ target: 'ability_str', operation: 'set', value: 29 }],
      duration: '1 hour',
      source: 'Potion of Storm Giant Strength',
    });
    expect(plan.consumes).toBe(true);
  });

  it('SNAPSHOTS the buff effects — editing the item afterwards never mutates the running effect', () => {
    // Slice 12's data-model invariant: an ActiveEffect outlives its item and is frozen at use time. Drink
    // one of a stack (the item remains), then have the DM/AI edit the item's own effect — the plan already
    // captured must not change with it. Aliasing the item's array would silently rewrite a buff mid-session.
    const buffEffects: Effect[] = [{ target: 'ability_str', operation: 'set', value: 29 }];
    const item = c({
      name: 'Potion of Storm Giant Strength',
      qty: 2,
      consumable: { effect: { kind: 'buff', effects: buffEffects, duration: '1 hour' } },
    });
    const plan = planConsume(item);
    // the item is later edited (a changed value AND a brand-new effect appended)
    buffEffects[0].value = 1;
    buffEffects.push({ target: 'ac', operation: 'add', value: 5 });
    // the captured ActiveEffect is untouched — a snapshot, not a pointer back into the item…
    expect(plan.activeEffect!.effects).toEqual([{ target: 'ability_str', operation: 'set', value: 29 }]);
    // …and it is a distinct array object, so no future mutation can reach it.
    expect(plan.activeEffect!.effects).not.toBe(buffEffects);
  });

  it('a status potion records the named condition as the ActiveEffect label (no stat effects)', () => {
    const plan = planConsume(c({ name: 'Potion of Invisibility', consumable: { effect: { kind: 'status', status: 'Invisible', duration: '1 hour' } } }));
    expect(plan.activeEffect).toEqual({ label: 'Invisible', effects: [], duration: '1 hour', source: 'Potion of Invisibility' });
  });

  it('a status potion with no named condition records nothing but still consumes', () => {
    const plan = planConsume(c({ name: 'Mystery Vial', consumable: { effect: { kind: 'status' } } }));
    expect(plan.activeEffect).toBeNull();
    expect(plan.consumes).toBe(true);
  });

  it("a buff's stray `dice` is still ignored — the instant kind IS the consumable's heal/temp kind", () => {
    // A `buff` never rolls an instant, even if it carries dice: the instant heal/temp is decided by the
    // consumable's own kind, not by the mere presence of a dice field. (The heal+buff COMBO is expressed as
    // a heal/temp that ALSO carries `effects` — see the next test — not as a buff with stray dice.)
    const plan = planConsume(c({
      name: 'Combo Draught',
      consumable: { effect: { kind: 'buff', dice: '2d4+2', effects: [{ target: 'ac', operation: 'add', value: 2 }], duration: '1 hour' } },
    }));
    expect(plan.instant).toBeNull(); // no instant heal — buff never rolls, even with dice present
    expect(plan.activeEffect?.effects).toEqual([{ target: 'ac', operation: 'add', value: 2 }]);
    expect(plan.consumes).toBe(true);
  });

  it('the BOTH case: a heal that also carries `effects` heals now AND leaves a lasting buff (DND_RULES 1405)', () => {
    // The data-model case the doc calls out: a potion that instant-heals 2d4+2 AND grants a 1-hour STR buff.
    // planConsume now returns BOTH an instant (rolled + gone) and a snapshotted ActiveEffect (survives the
    // item), and the component applies each in its own branch — one drink, both outcomes, qty −1 once.
    const plan = planConsume(c({
      name: 'Draught of Heroism',
      consumable: { effect: { kind: 'heal', dice: '2d4+2', effects: [{ target: 'ability_str', operation: 'set', value: 21 }], duration: '1 hour' } },
    }));
    expect(plan.instant).toEqual({ kind: 'heal', dice: '2d4+2' }); // heals now
    expect(plan.activeEffect).toEqual({ // AND a lasting buff that outlives the potion
      label: 'Draught of Heroism',
      effects: [{ target: 'ability_str', operation: 'set', value: 21 }],
      duration: '1 hour',
      source: 'Draught of Heroism',
    });
    expect(plan.consumes).toBe(true);
  });

  it('the BOTH case snapshots too — editing the item afterwards never mutates the buff the heal left running', () => {
    const effects: Effect[] = [{ target: 'ability_str', operation: 'set', value: 21 }];
    const plan = planConsume(c({
      name: 'Draught of Heroism', qty: 2,
      consumable: { effect: { kind: 'temp', dice: '1d4', effects, duration: '1 hour' } },
    }));
    effects[0].value = 1; // the item is later edited
    expect(plan.activeEffect!.effects).toEqual([{ target: 'ability_str', operation: 'set', value: 21 }]);
    expect(plan.activeEffect!.effects).not.toBe(effects); // distinct array — a snapshot, not a pointer
  });

  it('a custom (note-only) consumable resolves nothing but is still consumed (DM adjudicates)', () => {
    const plan = planConsume(c({ name: 'Strange Brew', consumable: { effect: { kind: 'custom', note: 'Ask the DM.' } } }));
    expect(plan.instant).toBeNull();
    expect(plan.activeEffect).toBeNull();
    expect(plan.consumes).toBe(true);
  });

  it('a heal with no dice consumes but rolls nothing', () => {
    const plan = planConsume(c({ name: 'Flat Tonic', consumable: { effect: { kind: 'heal' } } }));
    expect(plan.instant).toBeNull();
    expect(plan.consumes).toBe(true);
  });

  it('an item with no consumable data is a no-op — nothing resolves and qty is untouched', () => {
    const plan = planConsume({ name: 'Rope', qty: 1, consumable: undefined });
    expect(plan).toEqual({ instant: null, activeEffect: null, consumes: false });
  });

  it('a consumable at qty 0 does not decrement below zero', () => {
    const plan = planConsume(c({ name: 'Empty', qty: 0, consumable: { effect: { kind: 'heal', dice: '1d4' } } }));
    expect(plan.consumes).toBe(false);
    expect(plan.instant).toEqual({ kind: 'heal', dice: '1d4' }); // decision is independent of stock
  });
});
