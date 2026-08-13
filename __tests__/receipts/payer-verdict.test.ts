// __tests__/receipts/payer-verdict.test.ts
//
// Owner, 2026-08-13: *"maybe one of the employees paid for something without using the business
// card. They might have used their own personal card. In which case we might reimburse them, or
// maybe not depending. We might want to disregard the receipt entirely from our taxes because it
// might have just been a personal purchase."*
//
// The three outcomes in that sentence are the three these tests hold apart. They are easy to
// collapse into one ("it wasn't our card"), and collapsing them either invents a debt to an employee
// or quietly deducts somebody's groceries.
import { describe, it, expect } from 'vitest';
import { payerVerdict } from '@/lib/receipts/payer-verdict';

const COMPANY = { id: 'c1', label: 'Company Amex', last4: '4054', role: 'COMPANY' };
const EMPLOYEE = { id: 'c2', label: 'Dave personal', last4: '9911', role: 'EMPLOYEE_PERSONAL', holder_name: 'Dave Ruiz' };
const CLIENT = { id: 'c3', label: 'Acme Corp card', last4: '3312', role: 'CLIENT' };
const CONFIRMED = '2026-08-13T10:00:00Z';

describe('a card nobody recognises', () => {
  const r = { card_match_status: 'not_on_file' as const };

  it('says the card is not recognised, in those words', () => {
    expect(payerVerdict(r).summary).toMatch(/NOT recognised/);
  });

  it('asks whose card it was and whether it was business', () => {
    expect(payerVerdict(r).needsDecision).toBe(true);
    expect(payerVerdict(r).question).toMatch(/whose card.*business/i);
  });

  it('still counts as an expense, and says so, until somebody says otherwise', () => {
    // Deliberate, and it must match the finance queries: they exclude `expense_nature = 'personal'`
    // and let NULL through. Every expense total also filters to approved/exported, so a receipt only
    // gets here after a bookkeeper approved it. Excluding it instead would shrink the firm's
    // deductions every time the extractor could not read four digits — silently.
    expect(payerVerdict(r).countsAsExpense).toBe(true);
    expect(payerVerdict(r).summary).toMatch(/counts as a business expense unless you say otherwise/i);
  });

  it('names all three things it could be, rather than guessing one', () => {
    const s = payerVerdict(r).summary;
    expect(s).toMatch(/company card nobody has added/i);
    expect(s).toMatch(/own card used for the business/i);
    expect(s).toMatch(/personal purchase/i);
  });

  it('drops out of the totals the moment it is called personal', () => {
    expect(payerVerdict({ ...r, expense_nature: 'personal' }).countsAsExpense).toBe(false);
  });

  it('counts once confirmed as a business purchase', () => {
    const answered = payerVerdict({ ...r, expense_nature: 'business' });
    expect(answered.needsDecision).toBe(false);
    expect(answered.countsAsExpense).toBe(true);
    expect(answered.summary).toMatch(/add the card/i);
  });
});

describe('an employee’s own card', () => {
  const base = { card_match_status: 'on_file' as const, card: EMPLOYEE, card_confirmed_at: CONFIRMED };

  it('will not decide reimbursement on its own', () => {
    // The whole point: the card role says whose money it was, not whether the purchase was ours.
    const v = payerVerdict(base);
    expect(v.needsDecision).toBe(true);
    expect(v.question).toMatch(/business, or personal/i);
    expect(v.reimbursementOwedTo).toBeNull();
  });

  it('owes them the money once the purchase is confirmed as business', () => {
    const v = payerVerdict({ ...base, expense_nature: 'business' });
    expect(v.reimbursementOwedTo).toBe('Dave Ruiz');
    expect(v.countsAsExpense).toBe(true);
    expect(v.summary).toMatch(/owed back to them/i);
  });

  it('owes them nothing, and deducts nothing, when it was personal', () => {
    const v = payerVerdict({ ...base, expense_nature: 'personal' });
    expect(v.reimbursementOwedTo).toBeNull();
    expect(v.countsAsExpense).toBe(false);
    expect(v.needsDecision).toBe(false);
  });

  it('stops asking once a person has answered', () => {
    // Somebody who has said "that was my own dinner" should not be asked again on every visit.
    expect(payerVerdict({ ...base, expense_nature: 'personal' }).question).toBeNull();
  });
});

describe('a personal purchase is disregarded whatever card paid for it', () => {
  it('holds even on the company card', () => {
    // The owner buying something personal on the company card is the case that would otherwise slip
    // through: the card check is perfectly happy and the purchase is still not the business's.
    const v = payerVerdict({
      card_match_status: 'on_file', card: COMPANY, card_confirmed_at: CONFIRMED,
      expense_nature: 'personal',
    });
    expect(v.countsAsExpense).toBe(false);
    expect(v.summary).toMatch(/kept out of every expense and tax total/i);
  });
});

describe('a match is not a confirmation', () => {
  it('refuses to file on four printed digits alone', () => {
    const v = payerVerdict({ card_match_status: 'on_file', card: COMPANY });
    expect(v.needsDecision).toBe(true);
    expect(v.countsAsExpense).toBe(false);
    expect(v.summary).toMatch(/suggestion rather than an identifier/i);
  });

  it('says why it matters more when the suggestion is a personal card', () => {
    const v = payerVerdict({ card_match_status: 'on_file', card: EMPLOYEE });
    expect(v.summary).toMatch(/money owed to a person/i);
  });

  it('files it plainly once confirmed', () => {
    const v = payerVerdict({ card_match_status: 'on_file', card: COMPANY, card_confirmed_at: CONFIRMED });
    expect(v.needsDecision).toBe(false);
    expect(v.countsAsExpense).toBe(true);
    expect(v.basis).toBe('company-card');
  });
});

describe('the cases that must not become questions', () => {
  it('says nothing about a cash purchase', () => {
    const v = payerVerdict({ card_match_status: 'not_a_card', payment_method: 'cash' });
    expect(v.needsDecision).toBe(false);
    expect(v.countsAsExpense).toBe(true);
  });

  it('does not accuse anybody when the digits are illegible', () => {
    // "Not on file" and "could not read it" are different claims, and only one of them is about
    // somebody's expense claim being wrong.
    const v = payerVerdict({ card_match_status: 'unknown' });
    expect(v.summary).not.toMatch(/not recognised|NOT on file/i);
    expect(v.summary).toMatch(/not legible/i);
  });

  it('is quiet about a receipt the check never ran on', () => {
    // Every receipt extracted before the matcher existed. Not a clean bill and not an accusation.
    const v = payerVerdict({});
    expect(v.needsDecision).toBe(false);
    expect(v.summary).toMatch(/has not been checked/i);
  });
});

describe('a client’s card', () => {
  it('is never our expense', () => {
    const v = payerVerdict({ card_match_status: 'on_file', card: CLIENT, card_confirmed_at: CONFIRMED });
    expect(v.countsAsExpense).toBe(false);
    expect(v.summary).toMatch(/not our transaction/i);
  });
});

describe('a card on file whose role nobody set', () => {
  it('asks rather than assuming the company paid', () => {
    const v = payerVerdict({
      card_match_status: 'on_file',
      card: { id: 'c9', label: 'Chase ...7788', last4: '7788', role: 'UNKNOWN' },
      card_confirmed_at: CONFIRMED,
    });
    expect(v.needsDecision).toBe(true);
    expect(v.countsAsExpense).toBe(false);
    expect(v.basis).toBe('card-role-unknown');
  });
});
