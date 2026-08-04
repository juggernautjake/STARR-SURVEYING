// FINANCE_TAX_AND_INTAKE Slice F1 — whose card paid for this.
//
// A receipt already carried `payment_last4` and nothing about the owner. Four digits cannot answer
// the question the books turn on — not "what was bought" but "whose money was it" — and the same
// coffee on three different cards is three different rows in three different places.
//
// These tests defend two things, and both are about refusing to be confidently wrong:
//   1. a reimbursement is never booked as a company expense at charge time;
//   2. a last4 "match" is never treated as an identification.

import { describe, it, expect } from 'vitest';
import {
  taxTreatmentForCard, matchCardByLast4, CARD_ROLE_OPTIONS,
  type PaymentCard, type CardRole,
} from '@/lib/finance/payment-cards';

const card = (over: Partial<PaymentCard> = {}): PaymentCard => ({
  id: 'c1', last4: '4242', brand: 'Visa', label: 'Company Amex',
  role: 'COMPANY', holderName: null, holderUserId: null, retiredAt: null, ...over,
});

describe('what a charge means depends on whose card it was', () => {
  it('books a company card as a company expense', () => {
    const t = taxTreatmentForCard(card({ role: 'COMPANY' }));
    expect(t.treatment).toBe('COMPANY_EXPENSE');
    expect(t.isCompanyExpenseNow).toBe(true);
    expect(t.needsResolution).toBe(false);
  });

  it("treats an owner's personal card as money owed to that owner, NOT a company expense", () => {
    // The distinction that matters most. Booking this as a direct expense overstates deductions and
    // leaves a real debt to a person unrecorded.
    const t = taxTreatmentForCard(card({ role: 'OWNER_PERSONAL', holderName: 'Dad' }));
    expect(t.treatment).toBe('REIMBURSEMENT_OWED');
    expect(t.isCompanyExpenseNow).toBe(false);
    expect(t.owedTo).toBe('Dad');
    expect(t.summary).toMatch(/reimbursement owed to Dad/i);
  });

  it("treats an employee's personal card the same way, owed to the employee", () => {
    const t = taxTreatmentForCard(card({ role: 'EMPLOYEE_PERSONAL', holderName: 'Jacob' }));
    expect(t.treatment).toBe('REIMBURSEMENT_OWED');
    expect(t.isCompanyExpenseNow).toBe(false);
    expect(t.owedTo).toBe('Jacob');
  });

  it("keeps a client's card out of the books entirely", () => {
    // Neither expense nor revenue. Booking it as ours invents both sides of a transaction that
    // never happened.
    const t = taxTreatmentForCard(card({ role: 'CLIENT', label: "Owner's card" }));
    expect(t.treatment).toBe('NOT_OUR_TRANSACTION');
    expect(t.isCompanyExpenseNow).toBe(false);
    expect(t.summary).toMatch(/not our transaction/i);
  });

  it('refuses to file an unknown card rather than defaulting it', () => {
    // The single most damaging thing this function could do is return a plausible default, because
    // the row would then look filed.
    const t = taxTreatmentForCard(card({ role: 'UNKNOWN', label: null, holderName: null }));
    expect(t.treatment).toBe('UNDETERMINED');
    expect(t.isCompanyExpenseNow).toBe(false);
    expect(t.needsResolution).toBe(true);
  });

  it('marks exactly one role as a company expense at charge time', () => {
    // Stated as a whole-set property so a role added later cannot quietly become deductible.
    const roles: CardRole[] = ['COMPANY', 'OWNER_PERSONAL', 'EMPLOYEE_PERSONAL', 'CLIENT', 'UNKNOWN'];
    const nowExpense = roles.filter((role) => taxTreatmentForCard(card({ role })).isCompanyExpenseNow);
    expect(nowExpense).toEqual(['COMPANY']);
  });

  it('gives every role a one-line summary a bookkeeper can act on', () => {
    for (const { role } of CARD_ROLE_OPTIONS) {
      const t = taxTreatmentForCard(card({ role }));
      expect(t.summary.length, role).toBeGreaterThan(10);
    }
  });
});

describe('matching a receipt to a card on file', () => {
  const cards: PaymentCard[] = [
    card({ id: 'a', last4: '4242', label: 'Company Amex', role: 'COMPANY' }),
    card({ id: 'b', last4: '4242', label: "Dad's Chase", role: 'OWNER_PERSONAL', holderName: 'Dad' }),
    card({ id: 'c', last4: '1881', label: 'Jacob personal', role: 'EMPLOYEE_PERSONAL', holderName: 'Jacob' }),
    card({ id: 'd', last4: '9000', label: 'Old company card', role: 'COMPANY', retiredAt: '2025-01-01' }),
  ];

  it('reports AMBIGUOUS when two cards share the digits', () => {
    // Ordinary in any wallet, and certain across a company card, two owners' and several employees'.
    const m = matchCardByLast4('4242', cards);
    expect(m.confidence).toBe('AMBIGUOUS');
    expect(m.candidates.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(m.needsReview).toBe(true);
  });

  it('still asks for confirmation when only one card matches', () => {
    // A single match is a suggestion, not an identification. Auto-applying it is how a charge on an
    // unregistered card silently inherits someone else's tax treatment.
    const m = matchCardByLast4('1881', cards);
    expect(m.confidence).toBe('SINGLE_CANDIDATE');
    expect(m.needsReview).toBe(true);
    expect(m.summary).toMatch(/confirm/i);
  });

  it('says plainly when the card is not on file', () => {
    // The useful case: a charge on a card nobody registered is what a bookkeeper most needs told,
    // and an empty field says nothing.
    const m = matchCardByLast4('7777', cards);
    expect(m.confidence).toBe('NOT_ON_FILE');
    expect(m.candidates).toEqual([]);
    expect(m.summary).toMatch(/not on file/i);
  });

  it('still matches retired cards', () => {
    // A receipt from March points at whatever card paid it. Dropping closed cards would silently
    // turn last year's filed receipts into "not on file".
    const m = matchCardByLast4('9000', cards);
    expect(m.candidates.map((c) => c.id)).toEqual(['d']);
    expect(m.summary).toMatch(/retired/i);
  });

  it('handles a receipt with no digits captured', () => {
    for (const bad of [null, undefined, '', '  ', '42', 'XXXX', '42423']) {
      const m = matchCardByLast4(bad, cards);
      expect(m.confidence, String(bad)).toBe('NO_LAST4');
      expect(m.needsReview, String(bad)).toBe(true);
    }
  });

  it('never returns a match that does not need review', () => {
    // The whole-file invariant: nothing here ever concludes on its own.
    for (const l4 of ['4242', '1881', '7777', '9000']) {
      expect(matchCardByLast4(l4, cards).needsReview, l4).toBe(true);
    }
  });
});
