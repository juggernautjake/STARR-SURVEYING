// __tests__/finance/card-input.test.ts
//
// The registry was readable and unwritable for months, so `payment_cards` holds zero rows and every
// card receipt flags "not on file". These tests cover the writer that closes that — specifically the
// three judgements where the obvious implementation is wrong:
//
//   * a blank string is not an answer (it satisfies NOT NULL and tells us nothing);
//   * an unanswered card is UNKNOWN, never assumed to be the company's;
//   * an edit must be checked against the row it will PRODUCE, not the fields it happens to mention.
import { describe, it, expect } from 'vitest';
import { validateCardInput } from '@/lib/finance/card-input';

describe('creating a card', () => {
  it('accepts the ordinary case', () => {
    const r = validateCardInput({ last4: '4054', label: 'Company Amex', brand: 'Amex', role: 'COMPANY' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.last4).toBe('4054');
      expect(r.values.role).toBe('COMPANY');
    }
  });

  it('takes the digits out of however the number was typed', () => {
    // "···· 4054" and "x4054" are the same card. Rejecting them teaches people to fight the form.
    for (const typed of ['···· 4054', 'x4054', '**** 4054', ' 4054 ']) {
      const r = validateCardInput({ last4: typed, role: 'COMPANY' });
      expect(r.ok, `"${typed}" should be accepted`).toBe(true);
      if (r.ok) expect(r.values.last4).toBe('4054');
    }
  });

  it('refuses a card with no number', () => {
    const r = validateCardInput({ label: 'Some card' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/last four/i);
  });

  it('names what it received when the number is the wrong length', () => {
    // "Invalid input" sends the user back to guess. Naming the digits shows them the typo.
    const r = validateCardInput({ last4: '405' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('405');
      expect(r.error).toContain('3 digit');
    }
  });

  it('defaults an unanswered card to UNKNOWN, not to the company', () => {
    // A card assumed to be the company's is a card whose charges are booked as expenses without
    // anybody deciding that. UNKNOWN renders as a question on the registry page.
    const r = validateCardInput({ last4: '4054' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.role).toBe('UNKNOWN');
  });

  it('rejects a role that is not one of the five', () => {
    expect(validateCardInput({ last4: '4054', role: 'PARTNER' }).ok).toBe(false);
  });
});

describe('a personal card has to say whose it is', () => {
  it('rejects one with no holder', () => {
    const r = validateCardInput({ last4: '4054', role: 'EMPLOYEE_PERSONAL' });
    expect(r.ok).toBe(false);
    // The constraint's reason, not its name — the raw Postgres text is indistinguishable from the
    // site being broken.
    if (!r.ok) expect(r.error).toMatch(/owed back/i);
  });

  it('rejects a blank holder, which would satisfy the database and mean nothing', () => {
    const r = validateCardInput({ last4: '4054', role: 'OWNER_PERSONAL', holder_name: '   ' });
    expect(r.ok).toBe(false);
  });

  it('accepts one identified by a linked user rather than a typed name', () => {
    const r = validateCardInput({
      last4: '4054', role: 'EMPLOYEE_PERSONAL', holder_user_id: '2b0f0e2e-0000-4000-8000-000000000000',
    });
    expect(r.ok).toBe(true);
  });

  it('does not demand a holder for a company or client card', () => {
    expect(validateCardInput({ last4: '4054', role: 'COMPANY' }).ok).toBe(true);
    expect(validateCardInput({ last4: '4054', role: 'CLIENT' }).ok).toBe(true);
  });
});

describe('editing a card', () => {
  it('does not require the number to be resent', () => {
    // An edit that only changes the role must not have to restate fields it is not touching —
    // demanding them is how an edit form quietly overwrites something nobody looked at.
    const r = validateCardInput({ role: 'COMPANY' }, { mode: 'edit', currentRole: 'UNKNOWN' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.last4).toBeUndefined();
  });

  it('allows a card to become personal when it already names a holder', () => {
    const r = validateCardInput(
      { role: 'OWNER_PERSONAL' },
      { mode: 'edit', currentRole: 'UNKNOWN', currentHolder: 'Jacob Maddux' },
    );
    expect(r.ok).toBe(true);
  });

  it('refuses the same change when the card names nobody', () => {
    // The row that would RESULT is invalid, even though the request mentions only the role.
    const r = validateCardInput(
      { role: 'OWNER_PERSONAL' },
      { mode: 'edit', currentRole: 'UNKNOWN', currentHolder: null },
    );
    expect(r.ok).toBe(false);
  });

  it('refuses clearing the holder off a card that is already personal', () => {
    const r = validateCardInput(
      { holder_name: '' },
      { mode: 'edit', currentRole: 'EMPLOYEE_PERSONAL', currentHolder: 'Jacob Maddux' },
    );
    expect(r.ok).toBe(false);
  });

  it('leaves fields alone that the edit did not mention', () => {
    const r = validateCardInput({ label: 'Fuel card' }, { mode: 'edit', currentRole: 'COMPANY' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.label).toBe('Fuel card');
      expect('brand' in r.values).toBe(false);
      expect('role' in r.values).toBe(false);
    }
  });

  it('turns a cleared optional field into NULL rather than an empty string', () => {
    const r = validateCardInput({ brand: '' }, { mode: 'edit', currentRole: 'COMPANY' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.brand).toBeNull();
  });
});
