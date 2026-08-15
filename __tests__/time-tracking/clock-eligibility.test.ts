// __tests__/time-tracking/clock-eligibility.test.ts
//
// C0g — the successor to `__tests__/hub/work-mode-eligibility.test.ts`.
//
// The predicate survived Work Mode's retirement because it never meant what its old name said. It
// decides whether the site-wide clock-in pill renders — "is this person staff who work shifts" —
// and the roles it answers for are unchanged by the shell going away. What is locked here is that
// role set, because it now gates TIME TRACKING: a role wrongly dropped from it silently loses the
// ability to clock in, and clock-out rows are payroll hours.

import { describe, it, expect } from 'vitest';
import type { UserRole } from '@/lib/auth';
import {
  CLOCKABLE_ROLES,
  clockableRoles,
  isClockEligible,
} from '@/lib/time-tracking/clock-eligibility';

describe('isClockEligible', () => {
  it('is true for every role that works shifts', () => {
    for (const role of ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'] as UserRole[]) {
      expect(isClockEligible([role]), `${role} should clock in`).toBe(true);
    }
  });

  it('is false for roles that do not clock in', () => {
    // Students and teachers use the platform without working shifts.
    expect(isClockEligible(['student'] as UserRole[])).toBe(false);
    expect(isClockEligible(['teacher'] as UserRole[])).toBe(false);
  });

  it('is true when ANY held role clocks in', () => {
    expect(isClockEligible(['student', 'field_crew'] as UserRole[])).toBe(true);
  });

  it('is false for no roles at all', () => {
    expect(isClockEligible([])).toBe(false);
    expect(isClockEligible(null)).toBe(false);
    expect(isClockEligible(undefined)).toBe(false);
  });
});

describe('clockableRoles', () => {
  it('returns only the roles that clock in, preserving order', () => {
    expect(clockableRoles(['student', 'field_crew', 'teacher', 'drawer'] as UserRole[]))
      .toEqual(['field_crew', 'drawer']);
  });

  it('is empty rather than null for a caller with none', () => {
    expect(clockableRoles(['student'] as UserRole[])).toEqual([]);
    expect(clockableRoles(null)).toEqual([]);
  });
});

describe('CLOCKABLE_ROLES', () => {
  it('holds exactly the seven staff roles', () => {
    // Pinned deliberately. This set gates who can record payroll hours; a change to it should be a
    // decision somebody made on purpose, not a diff that slipped through.
    expect([...CLOCKABLE_ROLES].sort()).toEqual([
      'admin', 'developer', 'drawer', 'equipment_manager', 'field_crew', 'researcher', 'tech_support',
    ]);
  });
});
