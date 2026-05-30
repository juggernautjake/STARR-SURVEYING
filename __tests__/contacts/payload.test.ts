// __tests__/contacts/payload.test.ts
//
// contacts plan Slice 2 — locks the pure payload sanitizers the
// contacts CRUD routes call: trim every text field, normalize labels,
// drop empty/punctuation-only labels + dedupe, require name on
// create.

import { describe, it, expect } from 'vitest';
import {
  sanitizeContactInput,
  sanitizeJobLinkInput,
  sanitizeLabels,
} from '@/lib/contacts/payload';

describe('sanitizeLabels', () => {
  it('normalizes + dedupes', () => {
    expect(sanitizeLabels([
      'Recurring Customer', 'recurring-customer', 'RECURRING',
    ])).toEqual(['recurring_customer', 'recurring']);
  });

  it('drops empty + punctuation-only entries', () => {
    expect(sanitizeLabels(['', '   ', '!!!', 'Realtor'])).toEqual(['realtor']);
  });

  it('handles null / empty input', () => {
    expect(sanitizeLabels(null)).toEqual([]);
    expect(sanitizeLabels([])).toEqual([]);
  });
});

describe('sanitizeContactInput — required name on insert', () => {
  it('fails when name is missing on create', () => {
    const result = sanitizeContactInput({ email: 'a@b.com' }, { requireName: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('name');
  });

  it('fails when name is empty whitespace on create', () => {
    const result = sanitizeContactInput({ name: '   ' }, { requireName: true });
    expect(result.ok).toBe(false);
  });

  it('passes when name is present on create', () => {
    const result = sanitizeContactInput({ name: '  Jane Realtor ' }, { requireName: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('Jane Realtor');
  });

  it('omits name on update when not requireName + not provided', () => {
    const result = sanitizeContactInput({ email: 'a@b.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBeUndefined();
  });
});

describe('sanitizeContactInput — text-field nullification + label cleanup', () => {
  it('trims every text field; blanks become null', () => {
    const result = sanitizeContactInput({
      name: 'Jane Realtor',
      email: '  jane@x.com  ',
      phone: '',
      company: '   ',
      title: 'Realtor',
      city: 'Austin',
      state: 'TX',
      zip: '',
      notes: '   Repeat client. ',
      labels: ['Recurring Customer', 'realtor'],
    }, { requireName: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: 'Jane Realtor',
        email: 'jane@x.com',
        phone: null,
        company: null,
        title: 'Realtor',
        city: 'Austin',
        state: 'TX',
        zip: null,
        notes: 'Repeat client.',
        labels: ['recurring_customer', 'realtor'],
      });
    }
  });

  it('empty input yields all-null payload + empty labels', () => {
    const result = sanitizeContactInput({ name: 'X' }, { requireName: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: 'X',
        email: null, phone: null, company: null, title: null,
        address: null, city: null, state: null, zip: null,
        notes: null, labels: [],
      });
    }
  });
});

describe('sanitizeJobLinkInput', () => {
  it('fails without job_id', () => {
    const result = sanitizeJobLinkInput({ role: 'realtor' });
    expect(result.ok).toBe(false);
  });

  it('defaults role to "client" when omitted', () => {
    const result = sanitizeJobLinkInput({ job_id: 'j1' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.role).toBe('client');
  });

  it('trims notes; empty notes become null', () => {
    const result = sanitizeJobLinkInput({ job_id: 'j1', notes: '   ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.notes).toBeNull();
  });

  it('keeps a non-empty role + notes', () => {
    const result = sanitizeJobLinkInput({ job_id: 'j1', role: 'realtor', notes: 'pre-qualified buyer' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ job_id: 'j1', role: 'realtor', notes: 'pre-qualified buyer' });
    }
  });
});
