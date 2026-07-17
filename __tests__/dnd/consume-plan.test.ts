// __tests__/dnd/consume-plan.test.ts — the pure consumption plan (Slice 12).
//
// planConsume decides WHAT using a consumable does; the Inventory component executes it. These pin
// the acceptance cases from the request: a pure-heal potion resolves and leaves NO lasting effect;
// a buff potion snapshots an ActiveEffect with its label + duration; note-only still consumes.
import { describe, it, expect } from 'vitest';
import { planConsume } from '@/lib/dnd/effects/consume';
import type { InvItem } from '@/app/dnd/_sheet/types';

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

  it('a status potion records the named condition as the ActiveEffect label (no stat effects)', () => {
    const plan = planConsume(c({ name: 'Potion of Invisibility', consumable: { effect: { kind: 'status', status: 'Invisible', duration: '1 hour' } } }));
    expect(plan.activeEffect).toEqual({ label: 'Invisible', effects: [], duration: '1 hour', source: 'Potion of Invisibility' });
  });

  it('a status potion with no named condition records nothing but still consumes', () => {
    const plan = planConsume(c({ name: 'Mystery Vial', consumable: { effect: { kind: 'status' } } }));
    expect(plan.activeEffect).toBeNull();
    expect(plan.consumes).toBe(true);
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
