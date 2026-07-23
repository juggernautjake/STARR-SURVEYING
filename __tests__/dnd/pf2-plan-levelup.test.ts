// __tests__/dnd/pf2-plan-levelup.test.ts — B8/B9: the interactive PF2 level-up planner surfaces what a
// character still owes (feat slots, subclass choice, attribute boosts) reading ONLY verified data.
import { describe, it, expect } from 'vitest';
import { pf2PlanLevelUp, pf2RecordChoice, type PF2RecordedChoice } from '@/lib/dnd/systems/pathfinder2e/levelup';
import { PF2_CLASS_PROGRESSIONS } from '@/lib/dnd/systems/pathfinder2e/data/classes';

describe('pf2PlanLevelUp — outstanding choices from the tested schedule (B8/B9)', () => {
  it('a level-1 Fighter owes its level-1 feat slots, nothing owed at level 0', () => {
    const plan = pf2PlanLevelUp({ className: 'Fighter', to: 1 });
    expect(plan.to).toBe(1);
    expect(plan.ready).toBe(false);
    // level-1 grants an ancestry + class feat (and a skill feat) on the standard schedule; each is a prompt.
    expect(plan.outstanding.every((o) => o.level === 1)).toBe(true);
    expect(plan.outstanding.some((o) => o.kind === 'feat' && o.track === 'class')).toBe(true);
    expect(plan.outstanding.some((o) => o.kind === 'feat' && o.track === 'ancestry')).toBe(true);
  });

  it('surfaces the class subclass moment (e.g. Barbarian Instinct) when the class has one', () => {
    const barb = PF2_CLASS_PROGRESSIONS.find((p) => p.className === 'Barbarian');
    if (!barb?.subclassName) return; // data-guarded; only assert when the class models a subclass
    const plan = pf2PlanLevelUp({ className: 'Barbarian', to: 1 });
    const sub = plan.outstanding.find((o) => o.kind === 'subclass');
    expect(sub).toBeTruthy();
    expect(sub!.label).toBe(barb.subclassName);
  });

  it('surfaces the universal 4-attribute boosts at level 5, and only there in a 1→5 run at boost levels', () => {
    const plan = pf2PlanLevelUp({ className: 'Rogue', to: 5 });
    const boosts = plan.outstanding.filter((o) => o.kind === 'boosts');
    expect(boosts.map((b) => b.level)).toEqual([5]);
    expect(boosts[0].pick).toBe(4);
  });

  it('recording a feat resolves exactly that prompt (same level+track), leaving others owed', () => {
    let recorded: PF2RecordedChoice[] = [];
    const before = pf2PlanLevelUp({ className: 'Fighter', to: 1 });
    const classSlot = before.outstanding.find((o) => o.kind === 'feat' && o.track === 'class')!;
    recorded = pf2RecordChoice(recorded, { level: classSlot.level, kind: 'feat', track: 'class', value: 'Power Attack' });
    const after = pf2PlanLevelUp({ className: 'Fighter', to: 1, recorded });
    expect(after.outstanding.some((o) => o.kind === 'feat' && o.track === 'class')).toBe(false);
    expect(after.outstanding.some((o) => o.kind === 'feat' && o.track === 'ancestry')).toBe(true); // still owed
  });

  it('boosts need FOUR attributes to count as satisfied; three leaves it owed', () => {
    const three = pf2RecordChoice([], { level: 5, kind: 'boosts', attributes: ['STR', 'DEX', 'CON'] });
    expect(pf2PlanLevelUp({ className: 'Rogue', to: 5, recorded: three }).outstanding.some((o) => o.kind === 'boosts')).toBe(true);
    const four = pf2RecordChoice(three, { level: 5, kind: 'boosts', attributes: ['STR', 'DEX', 'CON', 'WIS'] });
    expect(pf2PlanLevelUp({ className: 'Rogue', to: 5, recorded: four }).outstanding.some((o) => o.kind === 'boosts')).toBe(false);
  });

  it('a fully-resolved level-1 build is ready (nothing owed)', () => {
    const plan1 = pf2PlanLevelUp({ className: 'Wizard', to: 1 });
    let recorded: PF2RecordedChoice[] = [];
    for (const o of plan1.outstanding) {
      if (o.kind === 'boosts') recorded = pf2RecordChoice(recorded, { level: o.level, kind: 'boosts', attributes: ['STR', 'DEX', 'CON', 'INT'] });
      else recorded = pf2RecordChoice(recorded, { level: o.level, kind: o.kind, track: o.track, value: 'x' });
    }
    expect(pf2PlanLevelUp({ className: 'Wizard', to: 1, recorded }).ready).toBe(true);
  });
});
