// __tests__/admin/employee-profile-ep1.test.ts
//
// Slice EP1 (employee-profile-buildout-2026-06-17) — personal-info
// fields on the employee profile. Coverage:
//
//   • deriveAge pure helper (Date math, leap years, future DOB).
//   • Migration 310 adds the DOB / gender / pronouns / bio columns.
//   • API POST allows self-edit of the four new fields.
//   • ProfilePanel renders the view + edit modes with stable testids.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deriveAge } from '../../app/admin/profile/ProfilePanel';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('deriveAge (pure helper)', () => {
  it('returns null for missing / unparseable input', () => {
    expect(deriveAge(null)).toBeNull();
    expect(deriveAge(undefined)).toBeNull();
    expect(deriveAge('')).toBeNull();
    expect(deriveAge('not-a-date')).toBeNull();
  });

  it('floors the age so a same-day-of-year still returns the integer year count', () => {
    const now = new Date('2026-06-17T12:00:00Z');
    expect(deriveAge('1990-06-17', now)).toBe(36);
  });

  it("rounds down a partial year (birthday later in the year)", () => {
    const now = new Date('2026-06-17T12:00:00Z');
    // Birthday in October — they are still 35 in June.
    expect(deriveAge('1990-10-01', now)).toBe(35);
  });

  it('returns null for a DOB in the future', () => {
    const now = new Date('2026-06-17T12:00:00Z');
    expect(deriveAge('2099-01-01', now)).toBeNull();
  });

  it('accepts a full ISO timestamp too', () => {
    const now = new Date('2026-06-17T12:00:00Z');
    expect(deriveAge('1990-06-17T00:00:00Z', now)).toBe(36);
  });
});

describe('Migration 310_employee_profile_personal_info.sql', () => {
  const SQL = read('seeds/310_employee_profile_personal_info.sql');

  it('adds date_of_birth, gender, pronouns, bio with the IF NOT EXISTS guard', () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS date_of_birth\s+DATE/);
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS gender\s+TEXT/);
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS pronouns\s+TEXT/);
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS bio\s+TEXT/);
  });

  it('targets the public.employee_profiles table', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.employee_profiles/);
  });
});

describe('API /api/admin/payroll/employees — self-edit allow list (EP1)', () => {
  const SRC = read('app/api/admin/payroll/employees/route.ts');

  it('includes date_of_birth, gender, pronouns, bio in the non-admin allowed list', () => {
    expect(SRC).toMatch(/date_of_birth: normalizeDob\(profileData\.date_of_birth\)/);
    expect(SRC).toMatch(/gender: normalizeText\(profileData\.gender\)/);
    expect(SRC).toMatch(/pronouns: normalizeText\(profileData\.pronouns\)/);
    expect(SRC).toMatch(/bio: normalizeText\(profileData\.bio\)/);
  });

  it("declares the normalizeText helper (trim, '' → null, undefined passthrough)", () => {
    expect(SRC).toMatch(/function normalizeText\(value: unknown\): string \| null \| undefined/);
    expect(SRC).toMatch(/return trimmed === '' \? null : trimmed/);
  });

  it("declares the normalizeDob helper (accepts YYYY-MM-DD or ISO)", () => {
    expect(SRC).toMatch(/function normalizeDob\(value: unknown\): string \| null \| undefined/);
    expect(SRC).toMatch(/value\.match\(\/\^\(\\d\{4\}-\\d\{2\}-\\d\{2\}\)\//);
  });
});

describe('ProfilePanel — personal info card + edit form (EP1)', () => {
  const SRC = read('app/admin/profile/ProfilePanel.tsx');

  it('extends the Profile interface with the four personal-info fields', () => {
    expect(SRC).toMatch(/date_of_birth\?: string \| null/);
    expect(SRC).toMatch(/gender\?: string \| null/);
    expect(SRC).toMatch(/pronouns\?: string \| null/);
    expect(SRC).toMatch(/bio\?: string \| null/);
  });

  it('renders the Personal info card with a stable testid', () => {
    expect(SRC).toMatch(/data-testid="profile-personal-info"/);
  });

  it('renders the four read-mode fields + the derived age line', () => {
    expect(SRC).toMatch(/data-testid="profile-personal-dob"/);
    expect(SRC).toMatch(/data-testid="profile-personal-age"/);
    expect(SRC).toMatch(/data-testid="profile-personal-gender"/);
    expect(SRC).toMatch(/data-testid="profile-personal-pronouns"/);
    expect(SRC).toMatch(/data-testid="profile-personal-bio"/);
  });

  it("the Edit button hydrates the draft from the current profile + opens edit mode", () => {
    expect(SRC).toMatch(/data-testid="profile-personal-edit"[\s\S]*?setPersonalEditing\(true\)/);
    expect(SRC).toMatch(/date_of_birth: profile\?\.date_of_birth \?\? ''/);
  });

  it("the form POSTs the four fields to /api/admin/payroll/employees", () => {
    expect(SRC).toMatch(/data-testid="profile-personal-form"/);
    expect(SRC).toMatch(/'\/api\/admin\/payroll\/employees'/);
    expect(SRC).toMatch(/date_of_birth: personalDraft\.date_of_birth \|\| null/);
    expect(SRC).toMatch(/gender: personalDraft\.gender \|\| null/);
    expect(SRC).toMatch(/pronouns: personalDraft\.pronouns \|\| null/);
    expect(SRC).toMatch(/bio: personalDraft\.bio \|\| null/);
  });
});
