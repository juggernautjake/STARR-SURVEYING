// __tests__/payroll/tier-match.test.ts
//
// Job titles, not pay grades. Under the simple pay model a grade is a label; it does not affect
// money. Fixtures are the firm's live `role_tiers.aliases` as of 2026-08-04.

import { describe, it, expect } from 'vitest';
import { matchTier, resolveTierKey } from '@/lib/payroll/tier-match';

const TIERS = [
  { role_key: 'intern', aliases: ['intern', 'Intern'] },
  { role_key: 'survey_tech', aliases: ['survey_tech', 'survey_technician', 'Survey Technician', 'survey technician'] },
  { role_key: 'instrument_op', aliases: ['instrument_op', 'instrument_operator', 'Instrument Operator'] },
  { role_key: 'party_chief', aliases: ['party_chief', 'Party Chief', 'party chief'] },
  { role_key: 'survey_drafter', aliases: ['survey_drafter', 'Survey Drafter', 'drafter'] },
  { role_key: 'rpls', aliases: ['rpls', 'RPLS', 'lead_rpls', 'Lead RPLS'] },
  { role_key: 'admin_staff', aliases: ['admin_staff', 'admin', 'office_tech', 'Office Technician'] },
];

describe('matchTier', () => {
  it('matches on the key itself', () => {
    expect(matchTier(TIERS, 'party_chief')?.role_key).toBe('party_chief');
  });

  it('bridges the vocabularies that would otherwise silently miss', () => {
    // A mismatched join returns no row rather than an error, so these three would have shown a
    // blank job title with nothing anywhere saying why.
    expect(matchTier(TIERS, 'survey_technician')?.role_key).toBe('survey_tech');
    expect(matchTier(TIERS, 'lead_rpls')?.role_key).toBe('rpls');
    expect(matchTier(TIERS, 'office_tech')?.role_key).toBe('admin_staff');
  });

  it('ignores case, spaces and separators', () => {
    expect(matchTier(TIERS, 'Party Chief')?.role_key).toBe('party_chief');
    expect(matchTier(TIERS, 'party chief')?.role_key).toBe('party_chief');
    expect(matchTier(TIERS, 'PARTY-CHIEF')?.role_key).toBe('party_chief');
  });

  it('returns null for an unknown title rather than guessing', () => {
    // A wrong grade next to somebody's name reads as deliberate; a blank one reads as "not set"
    // and gets fixed.
    expect(matchTier(TIERS, 'chief cartographer')).toBeNull();
    expect(matchTier(TIERS, '')).toBeNull();
    expect(matchTier(TIERS, null)).toBeNull();
  });
});

describe('resolveTierKey — the live tier_key trap', () => {
  it('falls back to job_title, which is where the firm’s only title actually is today', () => {
    // Live row, 2026-08-04: tier_key NULL, job_title 'party_chief'. Reading tier_key alone shows
    // nobody a job title at all.
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
