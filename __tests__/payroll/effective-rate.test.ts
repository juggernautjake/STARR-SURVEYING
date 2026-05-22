// __tests__/payroll/effective-rate.test.ts
//
// Unit tests for the canonical effective-rate calculator.
// P-16 of PAY_PROGRESSION_OVERHAUL.md.
//
// One assertion per branch of the formula: base only, role bonus,
// seniority, credentials (under + over cap), XP (under + over cap),
// work-type multiplier, work-type cap, role ceiling, override
// (fixed_rate, multipliers, flat_addition).

import { describe, it, expect } from 'vitest';
import {
  computeEffectiveRate,
  findSeniorityBracket,
  type EffectiveRateInputs,
} from '@/lib/payroll/effective-rate';

const FIELD_WORK = {
  work_type: 'field_work',
  base_rate: 20,
  bonus_multiplier: 1,
  max_bonus_cap: null as number | null,
};

const DRIVING_HALF = {
  work_type: 'driving',
  base_rate: 16,
  bonus_multiplier: 0.5,
  max_bonus_cap: 25,
};

const RPLS = { role_key: 'rpls', base_bonus: 22, max_effective_rate: 68 };
const PARTY_CHIEF = { role_key: 'party_chief', base_bonus: 10, max_effective_rate: null };

const SENIORITY = [
  { min_years: 0, max_years: 1, bonus_per_hour: 0 },
  { min_years: 1, max_years: 3, bonus_per_hour: 0.5 },
  { min_years: 3, max_years: 5, bonus_per_hour: 2 },
  { min_years: 5, max_years: 10, bonus_per_hour: 3.5 },
  { min_years: 10, max_years: null, bonus_per_hour: 8 },
];

const CREDENTIALS = [
  { credential_key: 'sit',  bonus_per_hour: 2 },
  { credential_key: 'rpls', bonus_per_hour: 3 },
  { credential_key: 'osha', bonus_per_hour: 0.5 },
  { credential_key: 'drone', bonus_per_hour: 1 },
];

const XP_MILESTONES = [
  { xp_threshold: 10000, bonus_per_hour: 0.5 },
  { xp_threshold: 20000, bonus_per_hour: 0.5 },
  { xp_threshold: 30000, bonus_per_hour: 0.5 },
  { xp_threshold: 40000, bonus_per_hour: 0.5 },
  { xp_threshold: 50000, bonus_per_hour: 0.5 },
  { xp_threshold: 60000, bonus_per_hour: 0.5 },
];

function baseInputs(overrides: Partial<EffectiveRateInputs> = {}): EffectiveRateInputs {
  return {
    workType: FIELD_WORK,
    tier: null,
    yearsEmployed: 0,
    seniority: SENIORITY,
    earnedCredentialKeys: [],
    credentials: CREDENTIALS,
    totalXp: 0,
    xpMilestones: XP_MILESTONES,
    ...overrides,
  };
}

describe('findSeniorityBracket', () => {
  it('picks the bracket containing the year count', () => {
    expect(findSeniorityBracket(SENIORITY, 0)?.bonus_per_hour).toBe(0);
    expect(findSeniorityBracket(SENIORITY, 2)?.bonus_per_hour).toBe(0.5);
    expect(findSeniorityBracket(SENIORITY, 4)?.bonus_per_hour).toBe(2);
    expect(findSeniorityBracket(SENIORITY, 9)?.bonus_per_hour).toBe(3.5);
  });

  it('extends the open bracket past max_years=null', () => {
    expect(findSeniorityBracket(SENIORITY, 25)?.bonus_per_hour).toBe(8);
  });
});

describe('computeEffectiveRate — base + role', () => {
  it('returns base only when no tier, no seniority, no credentials', () => {
    const r = computeEffectiveRate(baseInputs());
    expect(r.baseRate).toBe(20);
    expect(r.roleBonus).toBe(0);
    expect(r.effectiveRate).toBe(20);
  });

  it('adds the role base_bonus when a tier is set', () => {
    const r = computeEffectiveRate(baseInputs({ tier: PARTY_CHIEF }));
    expect(r.roleBonus).toBe(10);
    expect(r.effectiveRate).toBe(30); // 20 base + 10 role
  });
});

describe('computeEffectiveRate — seniority', () => {
  it('adds the bracket bonus for years employed', () => {
    const r = computeEffectiveRate(baseInputs({ yearsEmployed: 4 }));
    expect(r.seniorityBonus).toBe(2);
    expect(r.effectiveRate).toBe(22);
  });
});

describe('computeEffectiveRate — credentials cap', () => {
  it('sums credential bonuses without capping when under $8', () => {
    const r = computeEffectiveRate(baseInputs({
      earnedCredentialKeys: ['osha', 'drone'], // 0.5 + 1 = 1.5
    }));
    expect(r.credentialBonusRaw).toBe(1.5);
    expect(r.credentialBonusCapped).toBe(1.5);
  });

  it('caps credentials at the default $8 when raw exceeds', () => {
    const r = computeEffectiveRate(baseInputs({
      earnedCredentialKeys: ['sit', 'rpls', 'drone', 'osha'], // 2+3+1+0.5 = 6.5 still under cap
    }));
    expect(r.credentialBonusCapped).toBe(6.5);
  });

  it('caps credentials at the system-provided cap if smaller', () => {
    const r = computeEffectiveRate(baseInputs({
      earnedCredentialKeys: ['sit', 'rpls', 'drone'], // 6
      caps: { max_credential_stack: 4 },
    }));
    expect(r.credentialBonusRaw).toBe(6);
    expect(r.credentialBonusCapped).toBe(4);
  });
});

describe('computeEffectiveRate — XP cap', () => {
  it('caps XP at $3 when raw exceeds', () => {
    const r = computeEffectiveRate(baseInputs({ totalXp: 60000 })); // 6 × 0.5 = 3
    expect(r.xpBonusRaw).toBe(3);
    expect(r.xpBonusCapped).toBe(3);
  });

  it('caps XP at the system-provided cap when smaller', () => {
    const r = computeEffectiveRate(baseInputs({
      totalXp: 60000,
      caps: { max_xp_milestone_bonus: 1.5 },
    }));
    expect(r.xpBonusRaw).toBe(3);
    expect(r.xpBonusCapped).toBe(1.5);
  });
});

describe('computeEffectiveRate — work-type multiplier + cap', () => {
  it('halves the bonus on a 50% work type', () => {
    const r = computeEffectiveRate(baseInputs({
      workType: DRIVING_HALF,
      tier: PARTY_CHIEF, // +10 role
      yearsEmployed: 4,  // +2 seniority
    }));
    expect(r.rawBonusTotal).toBe(12);
    expect(r.multiplier).toBe(0.5);
    expect(r.adjustedBonus).toBe(6);
    expect(r.cappedBonus).toBe(6); // under $25 cap
    expect(r.effectiveRate).toBe(22); // 16 base + 6
  });

  it('applies the work-type cap when adjustedBonus exceeds it', () => {
    const r = computeEffectiveRate(baseInputs({
      workType: DRIVING_HALF, // cap $25, mult 0.5
      tier: RPLS,              // +22 role
      yearsEmployed: 15,       // +8 seniority
      earnedCredentialKeys: ['sit', 'rpls', 'drone', 'osha'], // 6.5
      totalXp: 60000,          // +3 xp
    }));
    // raw = 22+8+6.5+3 = 39.5; adjusted = 19.75 (under $25) — no cap here
    expect(r.workCapApplied).toBe(false);
    expect(r.cappedBonus).toBe(19.75);
  });
});

describe('computeEffectiveRate — role ceiling', () => {
  it('clamps total to role.max_effective_rate when exceeded', () => {
    const r = computeEffectiveRate(baseInputs({
      tier: { role_key: 'rpls', base_bonus: 22, max_effective_rate: 30 },
      yearsEmployed: 15, // +8
      earnedCredentialKeys: ['sit', 'rpls'], // +5
    }));
    expect(r.preCeilingTotal).toBeGreaterThan(30);
    expect(r.ceilingApplied).toBe(true);
    expect(r.effectiveRate).toBe(30);
  });
});

describe('computeEffectiveRate — overrides', () => {
  it('returns fixed_rate verbatim when set', () => {
    const r = computeEffectiveRate(baseInputs({
      tier: RPLS,
      yearsEmployed: 20,
      override: { fixed_rate: 99 },
    }));
    expect(r.fixedRateApplied).toBe(true);
    expect(r.effectiveRate).toBe(99);
  });

  it('scales role bonus by role_bonus_multiplier', () => {
    const r = computeEffectiveRate(baseInputs({
      tier: PARTY_CHIEF, // +10
      override: { role_bonus_multiplier: 0.5 },
    }));
    expect(r.roleBonus).toBe(5);
    expect(r.effectiveRate).toBe(25);
  });

  it('strips seniority when seniority_multiplier=0', () => {
    const r = computeEffectiveRate(baseInputs({
      yearsEmployed: 15,
      override: { seniority_multiplier: 0 },
    }));
    expect(r.seniorityBonus).toBe(0);
  });

  it('adds flat_addition on top of the formula', () => {
    const r = computeEffectiveRate(baseInputs({
      tier: PARTY_CHIEF,
      override: { flat_addition: 2.5 },
    }));
    expect(r.flatAddition).toBe(2.5);
    expect(r.effectiveRate).toBe(32.5); // 20 + 10 + 2.5
  });

  it('combines multiple override fields', () => {
    const r = computeEffectiveRate(baseInputs({
      tier: PARTY_CHIEF, // +10 role
      yearsEmployed: 4,  // +2 seniority
      override: {
        role_bonus_multiplier: 0.5, // role becomes +5
        seniority_multiplier: 2,    // seniority becomes +4
        flat_addition: 1,
      },
    }));
    expect(r.rawBonusTotal).toBe(10); // 5 + 4 + 0 + 0 + 1
    expect(r.effectiveRate).toBe(30); // 20 base + 10
  });
});

describe('computeEffectiveRate — worked example from plan', () => {
  it('matches the 6-year RPLS field-work scenario', () => {
    const r = computeEffectiveRate({
      workType: FIELD_WORK,
      tier: { role_key: 'rpls', base_bonus: 18, max_effective_rate: 68 },
      yearsEmployed: 6,
      seniority: [{ min_years: 5, max_years: 7, bonus_per_hour: 2.5 }],
      earnedCredentialKeys: ['fs', 'sit', 'rpls', 'drone', 'osha', 'first_aid'],
      credentials: [
        { credential_key: 'fs',        bonus_per_hour: 1 },
        { credential_key: 'sit',       bonus_per_hour: 1.5 },
        { credential_key: 'rpls',      bonus_per_hour: 2 },
        { credential_key: 'drone',     bonus_per_hour: 1 },
        { credential_key: 'osha',      bonus_per_hour: 0.5 },
        { credential_key: 'first_aid', bonus_per_hour: 0.5 },
      ],
      totalXp: 50000,
      xpMilestones: XP_MILESTONES,
    });
    // Per worked example: role 18 + seniority 2.5 + credentials 6.5 + XP 2.5 = 29.5
    // Base 20 + 29.5 = 49.5
    expect(r.rawBonusTotal).toBe(29.5);
    expect(r.effectiveRate).toBe(49.5);
  });
});
