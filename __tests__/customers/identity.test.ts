// __tests__/customers/identity.test.ts — is this the same person? (A3)
//
// The asymmetry these tests exist to protect: a DUPLICATE customer row is untidy, visible and reversible
// in one click. A WRONG MERGE puts one landowner's job history, invoices and outstanding balance under
// another person's name, and nobody finds out until somebody is billed for a survey they never ordered.
//
// So the assertions are weighted accordingly. There are more cases pinning what must NOT auto-merge than
// what must.
import { describe, it, expect } from 'vitest';
import { classifyMatch, identityKeys, mergeRollups, type CustomerRow } from '@/lib/customers/identity';
import { hashEmail, hashPhone } from '@/lib/integrations/google/hash';

const customer = (over: Partial<CustomerRow> = {}): CustomerRow => ({
  id: 'c1',
  display_name: 'Jane Landowner',
  company: null,
  primary_email: 'jane@example.com',
  primary_phone: '+12545550100',
  email_sha256: hashEmail('jane@example.com'),
  phone_sha256: hashPhone('254-555-0100'),
  first_lead_at: '2026-01-01T00:00:00.000Z',
  job_count: 1,
  lifetime_value_cents: 120000,
  is_repeat: false,
  ...over,
});

describe('auto-merge happens ONLY on an exact identifier', () => {
  it('merges on the same email', () => {
    const v = classifyMatch({ name: 'J. Landowner', email: 'jane@example.com' }, customer());
    expect(v).toMatchObject({ kind: 'exact-email', autoMerge: true });
  });

  it('merges on the same email even when it is typed differently', () => {
    // Normalisation comes from the Ads hashing module, so the match key and the conversion key can never
    // be computed two different ways.
    const v = classifyMatch({ email: '  JANE@Example.COM ' }, customer());
    expect(v.autoMerge).toBe(true);
  });

  it('merges on the same phone in any format', () => {
    for (const phone of ['2545550100', '(254) 555-0100', '1-254-555-0100', '+12545550100']) {
      expect(classifyMatch({ phone }, customer()).autoMerge, phone).toBe(true);
    }
  });

  it('prefers EMAIL over phone when both are present', () => {
    // A phone number is far more likely to be shared — a household, a switchboard, a spouse — so where
    // both could match, the email is the better identity.
    const v = classifyMatch({ email: 'jane@example.com', phone: '2545550100' }, customer());
    expect(v.kind).toBe('exact-email');
  });
});

describe('everything weaker is a SUGGESTION, never a merge', () => {
  it('does NOT merge two people with the same name', () => {
    // "John Smith" is not an identity. There are a lot of them in Bell County.
    const v = classifyMatch(
      { name: 'Jane Landowner', email: 'different@example.com', phone: '2545559999' },
      customer(),
    );
    expect(v.autoMerge).toBe(false);
    expect(v.kind).toBe('suggest-name');
    expect(v.reason).toMatch(/same name/i);
  });

  it('does NOT merge on company alone', () => {
    const v = classifyMatch(
      { name: 'Someone Else', company: 'Acme Ranch', email: 'other@example.com' },
      customer({ company: 'Acme Ranch', display_name: 'Bob Rancher' }),
    );
    expect(v.autoMerge).toBe(false);
    expect(v.kind).toBe('suggest-address');
  });

  it('does NOT merge on an address, however exactly it matches', () => {
    // Two owners of the same parcel across a sale is the textbook case, and merging them would put the
    // previous owner's invoices under the new owner's name.
    const v = classifyMatch(
      { name: 'New Owner', address: '1 Ranch Rd', email: 'new@example.com' },
      customer({ display_name: 'Old Owner' }),
    );
    expect(v.autoMerge).toBe(false);
  });

  it('returns none when nothing is alike', () => {
    expect(classifyMatch({ name: 'Nobody', email: 'no@one.com' }, customer()))
      .toMatchObject({ kind: 'none', autoMerge: false });
  });
});

describe('a customer with no identifiers is ordinary, not an error', () => {
  it('produces no keys and never auto-merges', () => {
    // A walk-in whose details were taken on paper. They still get a row; they just cannot be matched.
    expect(identityKeys({ name: 'Walk In' })).toEqual({ emailHash: null, phoneHash: null });
    expect(classifyMatch({ name: 'Walk In' }, customer()).autoMerge).toBe(false);
  });

  it('does not match an unreadable phone against a customer who has none', () => {
    const blank = customer({ email_sha256: null, phone_sha256: null });
    expect(classifyMatch({ phone: 'call the office' }, blank).autoMerge).toBe(false);
    // …and two customers who BOTH have nothing must never collapse into each other.
    expect(classifyMatch({ email: '', phone: '' }, blank).autoMerge).toBe(false);
  });
});

describe('mergeRollups', () => {
  it('counts jobs and flags a repeat customer only above one', () => {
    expect(mergeRollups([])).toMatchObject({ job_count: 0, is_repeat: false });
    expect(mergeRollups([{ final_amount: 1200 }])).toMatchObject({ job_count: 1, is_repeat: false });
    expect(mergeRollups([{ final_amount: 1200 }, { final_amount: 800 }]))
      .toMatchObject({ job_count: 2, is_repeat: true });
  });

  it('prefers the FINAL amount over the quote', () => {
    // What a job was quoted at is a forecast; what it invoiced is the fact. Summing quotes for delivered
    // jobs reports money nobody paid.
    expect(mergeRollups([{ quote_amount: 1000, final_amount: 1450 }]).lifetime_value_cents).toBe(145000);
  });

  it('falls back to the quote while a job is still open, and treats a missing pair as zero', () => {
    expect(mergeRollups([{ quote_amount: 1000 }]).lifetime_value_cents).toBe(100000);
    expect(mergeRollups([{}]).lifetime_value_cents).toBe(0);
  });

  it('works in CENTS, so no rounding drifts into the lifetime value', () => {
    expect(mergeRollups([{ final_amount: 1234.56 }]).lifetime_value_cents).toBe(123456);
    expect(mergeRollups([{ final_amount: 0.1 }, { final_amount: 0.2 }]).lifetime_value_cents).toBe(30);
  });
});
