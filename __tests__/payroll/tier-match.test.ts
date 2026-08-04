// __tests__/payroll/tier-match.test.ts
//
// Fixtures are the firm's live `role_tiers.aliases`, `pay_rate_standards` and
// `role_pay_adjustments` as of 2026-08-04 — the exact rows the mismatch was found in.

import { describe, it, expect } from 'vitest';
import { matchTier, resolveTierKey, bandForTier, actingBonusFor } from '@/lib/payroll/tier-match';

const TIERS = [
  { role_key: 'intern', aliases: ['intern', 'Intern'] },
  { role_key: 'survey_tech', aliases: ['survey_tech', 'survey_technician', 'Survey Technician', 'survey technician'] },
  { role_key: 'instrument_op', aliases: ['instrument_op', 'instrument_operator', 'Instrument Operator'] },
  { role_key: 'party_chief', aliases: ['party_chief', 'Party Chief', 'party chief'] },
  { role_key: 'survey_drafter', aliases: ['survey_drafter', 'Survey Drafter', 'drafter'] },
  { role_key: 'rpls', aliases: ['rpls', 'RPLS', 'lead_rpls', 'Lead RPLS'] },
  { role_key: 'admin_staff', aliases: ['admin_staff', 'admin', 'office_tech', 'Office Technician'] },
];

const STANDARDS = [
  { job_title: 'survey_technician', min_rate: 15, max_rate: 25, default_rate: 18 },
  { job_title: 'instrument_operator', min_rate: 18, max_rate: 30, default_rate: 22 },
  { job_title: 'party_chief', min_rate: 22, max_rate: 40, default_rate: 28 },
  { job_title: 'survey_drafter', min_rate: 20, max_rate: 35, default_rate: 25 },
  { job_title: 'office_tech', min_rate: 16, max_rate: 28, default_rate: 20 },
  { job_title: 'lead_rpls', min_rate: 35, max_rate: 75, default_rate: 50 },
];

const ADJUSTMENTS = [
  { base_title: 'survey_technician', role_on_job: 'party_chief', adjustment_type: 'flat', adjustment_amount: 5 },
  { base_title: 'survey_technician', role_on_job: 'instrument_operator', adjustment_type: 'flat', adjustment_amount: 2 },
  { base_title: 'instrument_operator', role_on_job: 'party_chief', adjustment_type: 'flat', adjustment_amount: 3 },
  { base_title: 'survey_drafter', role_on_job: 'party_chief', adjustment_type: 'flat', adjustment_amount: 5 },
  { base_title: 'party_chief', role_on_job: 'lead_rpls', adjustment_type: 'flat', adjustment_amount: 10 },
];

describe('matchTier', () => {
  it('matches on the key itself', () => {
    expect(matchTier(TIERS, 'party_chief')?.role_key).toBe('party_chief');
  });

  it('bridges the vocabularies that would otherwise silently miss', () => {
    // These are the exact pairs that made `pay_rate_standards` and `role_tiers` fail to join.
    expect(matchTier(TIERS, 'survey_technician')?.role_key).toBe('survey_tech');
    expect(matchTier(TIERS, 'lead_rpls')?.role_key).toBe('rpls');
    expect(matchTier(TIERS, 'office_tech')?.role_key).toBe('admin_staff');
  });

  it('ignores case, spaces and separators', () => {
    expect(matchTier(TIERS, 'Party Chief')?.role_key).toBe('party_chief');
    expect(matchTier(TIERS, 'party chief')?.role_key).toBe('party_chief');
    expect(matchTier(TIERS, 'PARTY-CHIEF')?.role_key).toBe('party_chief');
  });

  it('returns null for an unknown title rather than guessing a grade', () => {
    // A wrong tier pays a wrong amount that looks deliberate; no tier shows as unset and gets fixed.
    expect(matchTier(TIERS, 'chief cartographer')).toBeNull();
    expect(matchTier(TIERS, '')).toBeNull();
    expect(matchTier(TIERS, null)).toBeNull();
  });
});

describe('resolveTierKey — the live tier_key trap', () => {
  it('falls back to job_title, which is where the firm’s only grade actually is today', () => {
    // Live row, 2026-08-04: tier_key NULL, job_title 'party_chief'. Reading tier_key alone finds no
    // tier for anybody and strips every role bonus — a pay cut with no error.
    expect(resolveTierKey({ tier_key: null, job_title: 'party_chief' })).toBe('party_chief');
  });

  it('prefers tier_key once the backfill lands', () => {
    expect(resolveTierKey({ tier_key: 'senior_rpls', job_title: 'party_chief' })).toBe('senior_rpls');
  });

  it('is null when neither is set, and survives a missing profile', () => {
    expect(resolveTierKey({ tier_key: null, job_title: null })).toBeNull();
    expect(resolveTierKey(null)).toBeNull();
  });
});

describe('bandForTier', () => {
  it('finds a band through the alias bridge', () => {
    expect(bandForTier(STANDARDS, TIERS, 'party_chief')).toEqual({ min: 22, max: 40 });
    // 'survey_tech' is the tier key; the band is filed under 'survey_technician'.
    expect(bandForTier(STANDARDS, TIERS, 'survey_tech')).toEqual({ min: 15, max: 25 });
    expect(bandForTier(STANDARDS, TIERS, 'rpls')).toEqual({ min: 35, max: 75 });
  });

  it('has no band for grades the standards table never covered', () => {
    // `role_tiers` has 14 grades; `pay_rate_standards` covers 6. No band is the truthful answer.
    expect(bandForTier(STANDARDS, TIERS, 'intern')).toBeNull();
    expect(bandForTier(STANDARDS, TIERS, null)).toBeNull();
  });

  it('refuses a degenerate band rather than flagging every rate as out of range', () => {
    const broken = [{ job_title: 'party_chief', min_rate: null, max_rate: null }];
    expect(bandForTier(broken, TIERS, 'party_chief')).toBeNull();
  });
});

describe('actingBonusFor', () => {
  it('pays a technician for running the crew', () => {
    expect(actingBonusFor(ADJUSTMENTS, 'survey_technician', 'party_chief')).toBe(5);
    expect(actingBonusFor(ADJUSTMENTS, 'party_chief', 'lead_rpls')).toBe(10);
  });

  it('works across the spelling mismatch, since the two columns are free text', () => {
    expect(actingBonusFor(ADJUSTMENTS, 'Survey Technician', 'Party Chief')).toBe(5);
  });

  it('pays nothing for working your own grade', () => {
    expect(actingBonusFor(ADJUSTMENTS, 'party_chief', 'party_chief')).toBe(0);
    expect(actingBonusFor(ADJUSTMENTS, 'party_chief', 'Party Chief')).toBe(0);
  });

  it('pays nothing for a pairing nobody configured', () => {
    expect(actingBonusFor(ADJUSTMENTS, 'intern', 'rpls')).toBe(0);
    expect(actingBonusFor(ADJUSTMENTS, null, 'party_chief')).toBe(0);
  });

  it('declines percentage adjustments instead of picking a base to apply them to', () => {
    const pct = [{ base_title: 'intern', role_on_job: 'party_chief', adjustment_type: 'percent', adjustment_amount: 20 }];
    expect(actingBonusFor(pct, 'intern', 'party_chief')).toBe(0);
  });
});
