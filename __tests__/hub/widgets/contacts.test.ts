// __tests__/hub/widgets/contacts.test.ts
//
// contacts plan Slice 5 — locks the Contacts widget's pure helpers:
// `capForBucket` (row caps per size bucket) + `labelsPreview` (the
// row-subtitle label string, capped at 2 with a +N overflow tail).

import { describe, it, expect } from 'vitest';
import { capForBucket, labelsPreview } from '@/lib/hub/widgets/contacts';

describe('contacts — capForBucket', () => {
  it('tiny is the counter only (cap 0); larger buckets unlock the list', () => {
    expect(capForBucket('tiny')).toBe(0);
    expect(capForBucket('small')).toBe(3);
    expect(capForBucket('medium')).toBe(6);
    expect(capForBucket('large')).toBe(12);
    expect(capForBucket('xlarge')).toBe(24);
  });
});

describe('contacts — labelsPreview', () => {
  it('returns empty for no labels', () => {
    expect(labelsPreview([])).toBe('');
  });

  it('uses catalog display labels when available', () => {
    expect(labelsPreview(['recurring_customer'])).toBe('Recurring customer');
    expect(labelsPreview(['current_customer', 'recurring_customer']))
      .toBe('Current customer, Recurring customer');
  });

  it('falls back to the raw key for user-coined labels', () => {
    expect(labelsPreview(['realtor'])).toBe('realtor');
  });

  it('caps at 2 displayed labels with a +N tail', () => {
    expect(labelsPreview(['recurring_customer', 'employee', 'student', 'teacher']))
      .toBe('Recurring customer, Employee +2');
  });
});
