// __tests__/dnd/ig-plan-levelup.test.ts — IG-2: the interactive IG level-up planner surfaces every
// player-choice gain from the scraped schedule as an outstanding prompt until it is recorded.
import { describe, it, expect } from 'vitest';
import { igPlanLevelUp, igRecordChoice, type IGRecordedChoice } from '@/lib/dnd/systems/intuitive-games/levelup';

describe('igPlanLevelUp (IG-2)', () => {
  it('a level-3 Freebooter owes its choice-gains but NOT the automatic grants', () => {
    const plan = igPlanLevelUp({ subclass: 'Freebooter', to: 3 });
    expect(plan.ready).toBe(false);
    const kinds = plan.outstanding.map((o) => o.kind);
    // choices owed across L2–L3: trait, general feat, ability-boosts, subclass-power, combat feat
    expect(kinds).toContain('trait');
    expect(kinds).toContain('feat-general');
    expect(kinds).toContain('ability-boosts');
    expect(kinds).toContain('subclass-power');
    expect(kinds).toContain('feat-combat');
    // automatic grants never block
    expect(kinds).not.toContain('subclass-defensive-power');
  });

  it('surfaces the subclass power options + capstone options on the prompts', () => {
    const plan = igPlanLevelUp({ subclass: 'Freebooter', to: 10 });
    const power = plan.outstanding.find((o) => o.kind === 'subclass-power')!;
    expect(power.options).toContain('Weapon Training');
    const cap = plan.outstanding.find((o) => o.kind === 'capstone')!;
    expect(cap.options).toContain('Legendary Attributes');
  });

  it('ability-boosts need `count` attributes to be satisfied', () => {
    const one: IGRecordedChoice[] = [{ level: 3, kind: 'ability-boosts', attributes: ['STR'] }];
    expect(igPlanLevelUp({ subclass: 'Sohei', to: 3, recorded: one }).outstanding.some((o) => o.kind === 'ability-boosts' && o.level === 3)).toBe(true);
    const two = igRecordChoice(one, { level: 3, kind: 'ability-boosts', attributes: ['STR', 'CON'] });
    expect(igPlanLevelUp({ subclass: 'Sohei', to: 3, recorded: two }).outstanding.some((o) => o.kind === 'ability-boosts' && o.level === 3)).toBe(false);
  });

  it('recording a feat resolves exactly that (level, kind) prompt, leaving others owed', () => {
    let rec: IGRecordedChoice[] = [];
    rec = igRecordChoice(rec, { level: 2, kind: 'feat-general', value: 'Toughness' });
    const plan = igPlanLevelUp({ subclass: 'Marksman', to: 2, recorded: rec });
    expect(plan.outstanding.some((o) => o.level === 2 && o.kind === 'feat-general')).toBe(false);
    expect(plan.outstanding.some((o) => o.level === 2 && o.kind === 'trait')).toBe(true); // still owed
  });

  it('a fully-resolved level-2 build is ready', () => {
    let rec: IGRecordedChoice[] = [];
    for (const o of igPlanLevelUp({ subclass: 'Marksman', to: 2 }).outstanding) {
      rec = igRecordChoice(rec, o.kind === 'ability-boosts'
        ? { level: o.level, kind: o.kind, attributes: ['STR', 'DEX'] }
        : { level: o.level, kind: o.kind, value: 'x' });
    }
    expect(igPlanLevelUp({ subclass: 'Marksman', to: 2, recorded: rec }).ready).toBe(true);
  });

  it('nothing is owed at level 1 (base build)', () => {
    expect(igPlanLevelUp({ subclass: 'Marksman', to: 1 }).outstanding).toEqual([]);
  });
});
