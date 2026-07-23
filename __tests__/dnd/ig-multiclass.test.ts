// __tests__/dnd/ig-multiclass.test.ts — MC-IG: the flagged multiclass house-rule (IG has none official).
// A Multiclass Dedication taken at a feat slot opens the dedicated subclass's powers at the power slots.
import { describe, it, expect } from 'vitest';
import {
  igMulticlassDedicationName,
  igMulticlassTargets,
  igDedicatedSubclasses,
  igSubclassPowerOptions,
  igPlanLevelUp,
  igRecordChoice,
  type IGRecordedChoice,
} from '@/lib/dnd/systems/intuitive-games/levelup';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';

describe('IG multiclass house-rule (MC-IG)', () => {
  it('targets are every OTHER catalogued subclass, never your own', () => {
    const targets = igMulticlassTargets('Freebooter');
    expect(targets).not.toContain('Freebooter');
    expect(targets).toContain('Arcanist'); // a subclass of another class
    // all targets are real subclasses
    const subclasses = new Set(IG_CLASS_DETAILS.filter((c) => /subclass of/i.test(c.classification || '')).map((c) => c.name));
    expect(targets.every((t) => subclasses.has(t))).toBe(true);
  });

  it('a dedication is read back from a recorded feat choice', () => {
    const rec: IGRecordedChoice[] = [{ level: 2, kind: 'feat-general', value: igMulticlassDedicationName('Arcanist') }];
    expect(igDedicatedSubclasses(rec)).toEqual(['Arcanist']);
  });

  it('a plain feat is NOT read as a dedication', () => {
    expect(igDedicatedSubclasses([{ level: 2, kind: 'feat-general', value: 'Toughness' }])).toEqual([]);
  });

  it('subclass-power options expand to include the dedicated subclass powers, labelled by provenance', () => {
    const opts = igSubclassPowerOptions('Freebooter', ['Arcanist']);
    const freebooter = IG_CLASS_DETAILS.find((c) => c.name === 'Freebooter')!;
    const arcanist = IG_CLASS_DETAILS.find((c) => c.name === 'Arcanist')!;
    for (const p of freebooter.powers ?? []) expect(opts).toContain(p); // own powers plain
    for (const p of arcanist.powers ?? []) expect(opts).toContain(`Arcanist: ${p}`); // dedicated labelled
  });

  it('end-to-end: after dedicating, the L3 subclass-power prompt offers the other subclass powers', () => {
    let rec: IGRecordedChoice[] = [];
    rec = igRecordChoice(rec, { level: 2, kind: 'feat-general', value: igMulticlassDedicationName('Arcanist') });
    const plan = igPlanLevelUp({ subclass: 'Freebooter', to: 3, recorded: rec });
    const power = plan.outstanding.find((o) => o.kind === 'subclass-power')!;
    expect(power.options?.some((o) => o.startsWith('Arcanist: '))).toBe(true);
  });

  it('without a dedication, subclass-power options are ONLY the own subclass (no leakage)', () => {
    const plan = igPlanLevelUp({ subclass: 'Freebooter', to: 3 });
    const power = plan.outstanding.find((o) => o.kind === 'subclass-power')!;
    expect(power.options?.some((o) => o.includes(': '))).toBe(false);
  });
});
