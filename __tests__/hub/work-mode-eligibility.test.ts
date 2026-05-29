// __tests__/hub/work-mode-eligibility.test.ts
//
// Coverage for the role-gating that decides whether the "Enter Work
// Mode" button renders + which work modes appear in the role picker.

import { describe, it, expect } from 'vitest';
import {
  isWorkModeEligible,
  eligibleWorkModeRoles,
  WORK_MODE_ROLES,
} from '@/lib/hub/work-mode-eligibility';
import type { UserRole } from '@/lib/auth';

describe('isWorkModeEligible', () => {
  it('returns true for a field crew member', () => {
    expect(isWorkModeEligible(['field_crew'])).toBe(true);
  });

  it('returns true for an admin', () => {
    expect(isWorkModeEligible(['admin'])).toBe(true);
  });

  it('returns true for a drafter', () => {
    expect(isWorkModeEligible(['drawer'])).toBe(true);
  });

  it('returns true for a researcher', () => {
    expect(isWorkModeEligible(['researcher'])).toBe(true);
  });

  it('returns true for an equipment manager', () => {
    expect(isWorkModeEligible(['equipment_manager'])).toBe(true);
  });

  it('returns true if ANY role is eligible (multi-role user)', () => {
    expect(isWorkModeEligible(['employee', 'field_crew'])).toBe(true);
    expect(isWorkModeEligible(['student', 'drawer'])).toBe(true);
  });

  it('returns false for a student-only user', () => {
    expect(isWorkModeEligible(['student'])).toBe(false);
  });

  it('returns false for a teacher-only user', () => {
    expect(isWorkModeEligible(['teacher'])).toBe(false);
  });

  it('returns false for a guest', () => {
    expect(isWorkModeEligible(['guest'])).toBe(false);
  });

  it('returns false for null / undefined / empty inputs', () => {
    expect(isWorkModeEligible(null)).toBe(false);
    expect(isWorkModeEligible(undefined)).toBe(false);
    expect(isWorkModeEligible([])).toBe(false);
  });
});

describe('eligibleWorkModeRoles', () => {
  it('returns only the eligible subset', () => {
    const out: UserRole[] = eligibleWorkModeRoles(['admin', 'student', 'field_crew']);
    expect(out).toContain('admin');
    expect(out).toContain('field_crew');
    expect(out).not.toContain('student');
  });

  it('returns an empty array when no roles are eligible', () => {
    expect(eligibleWorkModeRoles(['student', 'teacher'])).toEqual([]);
  });

  it('returns an empty array for null/undefined/empty', () => {
    expect(eligibleWorkModeRoles(null)).toEqual([]);
    expect(eligibleWorkModeRoles(undefined)).toEqual([]);
    expect(eligibleWorkModeRoles([])).toEqual([]);
  });
});

describe('WORK_MODE_ROLES set', () => {
  it('contains exactly the documented role list', () => {
    const expected: UserRole[] = [
      'admin', 'developer', 'field_crew', 'drawer',
      'researcher', 'equipment_manager', 'tech_support',
    ];
    expect(WORK_MODE_ROLES.size).toBe(expected.length);
    for (const r of expected) {
      expect(WORK_MODE_ROLES.has(r)).toBe(true);
    }
  });

  it('explicitly excludes student / teacher / employee / guest', () => {
    expect(WORK_MODE_ROLES.has('student')).toBe(false);
    expect(WORK_MODE_ROLES.has('teacher')).toBe(false);
    expect(WORK_MODE_ROLES.has('employee')).toBe(false);
    expect(WORK_MODE_ROLES.has('guest')).toBe(false);
  });
});
