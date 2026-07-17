// __tests__/dnd/system-rules.test.ts — the deterministic per-system rules catalog carries the
// correct, non-cross-contaminated mechanics and is always available (no embeddings/DB).
import { describe, it, expect } from 'vitest';
import { rulesForSystem, systemRulesBlock, expectedProfBonus, systemRulesSummary } from '@/lib/dnd/system-rules';
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';

describe('system rules catalog (grounding)', () => {
  it('has authoritative rules for every seeded system', () => {
    for (const s of GAME_SYSTEMS) {
      const r = rulesForSystem(s.key);
      expect(r, s.key).toBeTruthy();
      expect(r!.source).toBeTruthy();
      expect(r!.keyFacts.length).toBeGreaterThan(2);
    }
    expect(rulesForSystem(SYSTEM_AMBIGUOUS)).toBeNull();
    expect(rulesForSystem('nonsense')).toBeNull();
  });

  it('the rules block always carries the system’s real numbers (no embeddings needed)', () => {
    const b14 = systemRulesBlock('dnd5e-2014');
    expect(b14).toMatch(/D&D 5e \(2014\)/);
    expect(b14).toMatch(/Point Buy/);
    expect(b14).toMatch(/floor\(\(score − 10\) \/ 2\)/);
    expect(b14).toMatch(/Proficiency Bonus/);
  });

  it('encodes the 2014 vs 2024 differences (exhaustion + where ability boosts come from)', () => {
    const b14 = systemRulesBlock('dnd5e-2014');
    const b24 = systemRulesBlock('dnd5e-2024');
    expect(b14).toMatch(/TIERED table/i);           // 2014 exhaustion
    expect(b24).toMatch(/SINGLE stacking/i);         // 2024 exhaustion
    expect(b14).toMatch(/come from your RACE/i);     // 2014 ability boosts
    expect(b24).toMatch(/come from your BACKGROUND/i); // 2024 ability boosts
    expect(b24).toMatch(/Weapon Mastery/);           // 2024-only
    expect(b14).toMatch(/Weapon Mastery does NOT exist in 2014/); // and 2014 says it's absent
  });

  it('encodes Pathfinder 2e’s structurally different math (level-to-proficiency, 3 saves, 3 actions)', () => {
    const pf = systemRulesBlock('pathfinder2e');
    expect(pf).toMatch(/Untrained.*Trained.*Expert.*Master.*Legendary/s);
    expect(pf).toMatch(/adds your LEVEL/i);
    expect(pf).toMatch(/Fortitude, Reflex, Will/);
    expect(pf).toMatch(/THREE actions/);
    expect(pf).toMatch(/DEGREES OF SUCCESS/);
    expect(pf).toMatch(/Do NOT import 5e/i);
  });

  it('the ambiguous block forbids any system-specific numbers', () => {
    const b = systemRulesBlock(SYSTEM_AMBIGUOUS);
    expect(b).toMatch(/SYSTEM-AMBIGUOUS/);
    expect(b).toMatch(/NEVER import/i);
    expect(b).toMatch(/Pathfinder 2e/);
  });

  it('expectedProfBonus matches 5e progression and is null for rank-based PF2', () => {
    expect(expectedProfBonus('dnd5e-2014', 1)).toBe(2);
    expect(expectedProfBonus('dnd5e-2014', 5)).toBe(3);
    expect(expectedProfBonus('dnd5e-2024', 9)).toBe(4);
    expect(expectedProfBonus('dnd5e-2014', 17)).toBe(6);
    expect(expectedProfBonus('dnd5e-2014', 99)).toBe(6); // clamped to level 20
    expect(expectedProfBonus('pathfinder2e', 5)).toBeNull();
    expect(expectedProfBonus(SYSTEM_AMBIGUOUS, 5)).toBeNull();
  });

  it('the PB_5E table is RAW-correct at EVERY level, both editions (not just the tier corners)', () => {
    // expectedProfBonus reads PB_5E as a table lookup, so an interior-cell typo (e.g. L6 = 4) would slip
    // past the corner checks above. Pin every level against the RAW formula: +2 at 1–4, then +1 per 4
    // levels (floor((level−1)/4)+2), identical in 2014 and 2024.
    for (let level = 1; level <= 20; level++) {
      const raw = Math.floor((level - 1) / 4) + 2;
      expect(expectedProfBonus('dnd5e-2014', level), `2014 L${level}`).toBe(raw);
      expect(expectedProfBonus('dnd5e-2024', level), `2024 L${level}`).toBe(raw);
    }
  });

  it('summary labels the system + source', () => {
    expect(systemRulesSummary('dnd5e-2024')).toMatch(/D&D 5e \(2024\)/);
    expect(systemRulesSummary(SYSTEM_AMBIGUOUS)).toMatch(/ambiguous/i);
  });
});
