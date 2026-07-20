// __tests__/dnd/mechanics-2024.test.ts — the core 2024 rules entries (S8).
// The value here is the edition deltas: 2024 rewrote several rules that a group carries a 2014
// habit straight through, and those are exactly the ones nobody looks up.
import { describe, it, expect } from 'vitest';
import {
  RULES_2024, MECHANIC_CATEGORIES, findRule2024, rulesByCategory, changedIn2024,
} from '@/lib/dnd/mechanics/dnd5e-2024';

describe('rule entries are well formed', () => {
  it('has a unique key and name for every rule', () => {
    const keys = RULES_2024.map((r) => r.key);
    const names = RULES_2024.map((r) => r.name.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('pairs every rule with a worked example containing real numbers', () => {
    for (const r of RULES_2024) {
      expect(r.rule.length, r.key).toBeGreaterThan(40);
      expect(r.example.length, r.key).toBeGreaterThan(40);
      expect(/\d/.test(r.example), `${r.key} example has no numbers`).toBe(true);
    }
  });

  it('uses only declared categories, and every category has entries', () => {
    for (const r of RULES_2024) expect(MECHANIC_CATEGORIES).toContain(r.category);
    // 'social' is declared but currently unused — assert the populated ones rather than
    // pretending coverage we don't have.
    for (const c of ['core', 'combat', 'action', 'movement', 'exploration', 'rest'] as const) {
      expect(rulesByCategory(c).length, c).toBeGreaterThan(0);
    }
  });

  it('attributes everything', () => {
    for (const r of RULES_2024) expect(r.source, r.key).toBe('PHB 2024');
  });
});

describe('the 2024 edition changes are captured', () => {
  it('flags surprise, which no longer costs a turn', () => {
    const s = findRule2024('surprise')!;
    expect(s.rule).toContain('DISADVANTAGE');
    expect(s.rule).toContain('does not lose its turn');
    expect(s.editionNote).toBeDefined();
  });

  it('flags exhaustion as a flat cumulative penalty', () => {
    const e = findRule2024('exhaustion')!;
    expect(e.rule).toContain('−2');
    expect(e.editionNote).toContain('2014');
  });

  it('flags grapple and shove as saves, not contested checks', () => {
    const u = findRule2024('unarmed-strike')!;
    expect(u.rule).toContain('saving throw');
    expect(u.editionNote).toContain('contested');
  });

  it('flags that spell attacks no longer crit', () => {
    expect(findRule2024('critical-hits')?.editionNote).toContain('spell attack');
  });

  it('flags Heroic Inspiration as a reroll, not advantage', () => {
    expect(findRule2024('heroic-inspiration')?.editionNote).toContain('reroll');
  });

  it('collects the changed rules for a "what is different" view', () => {
    const changed = changedIn2024();
    expect(changed.length).toBeGreaterThanOrEqual(6);
    for (const r of changed) expect(r.editionNote!.length).toBeGreaterThan(20);
  });
});

describe('lookups', () => {
  it('finds by key and by display name, case-insensitively', () => {
    expect(findRule2024('cover')?.name).toBe('Cover');
    expect(findRule2024('Death Saving Throws')?.key).toBe('death-saving-throws');
    expect(findRule2024('DEATH SAVING THROWS')?.key).toBe('death-saving-throws');
  });

  it('returns undefined for an unknown rule rather than guessing', () => {
    expect(findRule2024('how-do-i-win')).toBeUndefined();
  });
});
