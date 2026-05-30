// __tests__/contacts/labels.test.ts
//
// contacts plan Slice 1 — locks the default catalog + normalize
// behavior so a user typing "Recurring Customer" or "RECURRING" or
// "recurring-customer" all collapse to the same storage key.

import { describe, it, expect } from 'vitest';
import {
  CONTACT_LABELS,
  findContactLabel,
  isKnownLabel,
  normalizeLabel,
  JOB_CONTACT_ROLES,
} from '@/lib/contacts/labels';

describe('CONTACT_LABELS catalog', () => {
  it('ships the seven labels the user named, in the user\'s order', () => {
    expect(CONTACT_LABELS.map((l) => l.id)).toEqual([
      'potential_customer',
      'current_customer',
      'recurring_customer',
      'former_customer',
      'employee',
      'student',
      'teacher',
    ]);
  });

  it('every entry has a label + description', () => {
    for (const entry of CONTACT_LABELS) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('findContactLabel resolves by id; missing ids return undefined', () => {
    expect(findContactLabel('recurring_customer')?.label).toBe('Recurring customer');
    expect(findContactLabel('not-a-label')).toBeUndefined();
  });

  it('isKnownLabel is true for catalog ids only', () => {
    expect(isKnownLabel('teacher')).toBe(true);
    expect(isKnownLabel('realtor')).toBe(false); // user-coined; still allowed but not catalog
  });
});

describe('normalizeLabel', () => {
  it('lowercases + collapses whitespace + dashes', () => {
    expect(normalizeLabel('Recurring Customer')).toBe('recurring_customer');
    expect(normalizeLabel('RECURRING')).toBe('recurring');
    expect(normalizeLabel('recurring-customer')).toBe('recurring_customer');
    expect(normalizeLabel('  current   customer  ')).toBe('current_customer');
  });

  it('strips stray punctuation', () => {
    expect(normalizeLabel('Realtor!')).toBe('realtor');
    expect(normalizeLabel('VIP*')).toBe('vip');
  });

  it('collapses runs of underscores + trims edges', () => {
    expect(normalizeLabel('__weird___label__')).toBe('weird_label');
  });

  it('returns null on empty / all-punctuation input', () => {
    expect(normalizeLabel('')).toBeNull();
    expect(normalizeLabel('   ')).toBeNull();
    expect(normalizeLabel('!!!')).toBeNull();
  });

  it('round-trips every catalog id', () => {
    for (const entry of CONTACT_LABELS) {
      expect(normalizeLabel(entry.label)).toBe(entry.id);
    }
  });
});

describe('JOB_CONTACT_ROLES', () => {
  it('ships the relationship-on-a-job vocabulary the picker offers', () => {
    expect(JOB_CONTACT_ROLES.map((r) => r.id)).toContain('client');
    expect(JOB_CONTACT_ROLES.map((r) => r.id)).toContain('realtor');
    expect(JOB_CONTACT_ROLES.map((r) => r.id)).toContain('other');
  });
});
