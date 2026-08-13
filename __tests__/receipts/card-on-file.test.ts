// __tests__/receipts/card-on-file.test.ts
//
// Owner, 2026-08-12: *"if a receipt uses a card that is not on file, it needs to be flagged and show
// that the card number or card name or card name holder is not on file."*
//
// The rule is deliberately a pure function over (what the slip says, what we own) so it can be tested
// without a database and without the model. What is worth pinning is not "does it compare strings" but
// the judgement calls, each of which has a tempting wrong answer:
//
//   * a blurry card number is NOT "not on file" — it is "cannot tell", and conflating them puts a
//     false accusation on somebody's expense claim;
//   * a field the receipt does not print is not evidence AGAINST a match — absence is not disagreement;
//   * a retired card is ours, and saying "unknown card" about it sends the bookkeeper after the wrong
//     question.
import { describe, it, expect } from 'vitest';
import { matchCardOnFile, type CardOnFile } from '@/lib/receipts/card-on-file';
import { EXTRACTION_PROMPT } from '@/worker/src/services/receipt-extraction-core';

const FUEL: CardOnFile = { id: 'c1', last4: '4054', brand: 'visa', label: 'Fuel card', holder_name: 'Jacob Maddux' };
const AMEX: CardOnFile = { id: 'c2', last4: '9001', brand: 'amex', label: 'Amex', holder_name: null };
const OLD: CardOnFile = { id: 'c3', last4: '7777', brand: 'visa', label: 'Old fuel card', holder_name: null, retired_at: '2026-01-01T00:00:00Z' };
const CARDS = [FUEL, AMEX, OLD];

describe('a card we own', () => {
  it('matches on last four', () => {
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '4054' }, CARDS);
    expect(r.status).toBe('on_file');
    expect(r.cardId).toBe('c1');
    expect(r.flag, 'a normal purchase must not raise a flag').toBeNull();
  });

  it('matches when the brand is printed differently', () => {
    // Slips print "VISA", "Visa Credit", "VISA DEBIT" for the same card.
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '4054', card_brand: 'VISA CREDIT' }, CARDS);
    expect(r.status).toBe('on_file');
  });

  it('matches a cardholder written in a different order or with a middle name', () => {
    // "MADDUX/JACOB" and "Jacob R Maddux" are one person; an exact-string rule would flag both.
    for (const holder of ['MADDUX/JACOB', 'Jacob R Maddux', 'JACOB MADDUX']) {
      const r = matchCardOnFile({ payment_method: 'card', payment_last4: '4054', card_holder_name: holder }, CARDS);
      expect(r.status, `"${holder}" should match`).toBe('on_file');
    }
  });

  it('matches when the receipt prints no brand and no name', () => {
    // The common case — most slips carry only the last four. Absence must not count as disagreement.
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '9001' }, CARDS);
    expect(r.status).toBe('on_file');
    expect(r.cardId).toBe('c2');
  });
});

describe('a card we do not own', () => {
  it('is flagged, and the flag names the number', () => {
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '1234' }, CARDS);
    expect(r.status).toBe('not_on_file');
    expect(r.cardId).toBeNull();
    expect(r.flag).toContain('1234');
    expect(r.flag).toMatch(/not on file/i);
  });

  it('names the brand and cardholder when the slip printed them', () => {
    // The owner asked for exactly this: say WHICH detail is unrecognised.
    const r = matchCardOnFile(
      { payment_method: 'card', payment_last4: '1234', card_brand: 'amex', card_holder_name: 'Sam Rivera' },
      CARDS,
    );
    expect(r.flag).toContain('AMEX');
    expect(r.flag).toContain('Sam Rivera');
  });

  it('distinguishes "same last four, different card" from "never seen it"', () => {
    // We own a Visa ending 4054; this slip says Amex ending 4054. That is a different problem from an
    // unknown number, and the bookkeeper's next move differs, so the message differs.
    const r = matchCardOnFile(
      { payment_method: 'card', payment_last4: '4054', card_brand: 'amex' },
      CARDS,
    );
    expect(r.status).toBe('not_on_file');
    expect(r.flag).toMatch(/is on file, but/i);
    expect(r.flag).toContain('amex');
  });

  it('flags a cardholder that shares no name at all with the card on file', () => {
    const r = matchCardOnFile(
      { payment_method: 'card', payment_last4: '4054', card_holder_name: 'Priya Raman' },
      CARDS,
    );
    expect(r.status).toBe('not_on_file');
  });
});

describe('the cases that must NOT be called "not on file"', () => {
  it('an illegible card number is "unknown", not an accusation', () => {
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: null }, CARDS);
    expect(r.status).toBe('unknown');
    expect(r.flag).toMatch(/not legible/i);
    expect(r.flag, 'must not assert the card is unknown').not.toMatch(/NOT on file/);
  });

  it('a partial card number is unknown rather than a false match', () => {
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '40' }, CARDS);
    expect(r.status).toBe('unknown');
  });

  it('cash raises nothing at all', () => {
    // A flag that fires on every cash receipt is one people learn to scroll past — which is how the
    // one real unauthorised charge gets approved with the rest.
    const r = matchCardOnFile({ payment_method: 'cash' }, CARDS);
    expect(r.status).toBe('not_a_card');
    expect(r.flag).toBeNull();
  });

  it('a cheque raises nothing either', () => {
    for (const method of ['check', 'cheque', 'Money Order']) {
      expect(matchCardOnFile({ payment_method: method }, CARDS).status, method).toBe('not_a_card');
    }
  });

  // Changed 2026-08-13. This used to assert `not_a_card`, on the reasoning that a blank receipt has
  // nothing to check. Owner: *"We need to know what card is paying for each receipt unless it is
  // cash or check."* A receipt whose payment line was never read is not a receipt we know was cash —
  // it is one we know nothing about, and filing it as "no card involved" is the one outcome that
  // removes it from the check without anybody deciding to.
  it('a receipt with no payment detail is "unknown", NOT "not a card"', () => {
    const r = matchCardOnFile({}, CARDS);
    expect(r.status).toBe('unknown');
    expect(r.flag).toMatch(/cannot tell whether a card was used/i);
    expect(r.flag, 'must not accuse a card of being unrecognised').not.toMatch(/NOT on file/);
  });

  it('an unrecognised payment method is unknown rather than assumed cash', () => {
    // "debit" is not the literal string 'card' and is not in the cash/cheque list. The old rule
    // answered "not a card" to everything that was not exactly 'card', which is how a debit-card
    // purchase would have left the check silently.
    expect(matchCardOnFile({ payment_method: 'debit' }, CARDS).status).toBe('unknown');
  });

  it('a retired company card is ours, and says so', () => {
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '7777' }, CARDS);
    expect(r.status).toBe('retired');
    expect(r.cardId).toBe('c3');
    expect(r.flag).toMatch(/retired/i);
    expect(r.flag).toContain('Old fuel card');
  });

  it('prefers the active card when an active and a retired one share a last four', () => {
    const dupes = [...CARDS, { id: 'c4', last4: '7777', brand: 'visa', label: 'New fuel card', holder_name: null }];
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '7777' }, dupes);
    expect(r.status).toBe('on_file');
    expect(r.cardId).toBe('c4');
  });
});

describe('with no cards registered at all', () => {
  it('still does not flag cash', () => {
    expect(matchCardOnFile({ payment_method: 'cash' }, []).status).toBe('not_a_card');
  });

  it('flags a card purchase, because nothing is on file to match it', () => {
    // This is the state the firm is in today: `payment_cards` is empty, so every card receipt flags
    // until the cards are registered. That is correct and is the prompt to register them.
    const r = matchCardOnFile({ payment_method: 'card', payment_last4: '4054' }, []);
    expect(r.status).toBe('not_on_file');
  });
});

describe('the extraction prompt accounts for money that is not printed', () => {
  // Owner: "if a receipt has a cost of $85.00, and then the total that is written is $100.00, that
  // probably means that there was a $15 tip, even if the tip is not explicitly added."
  const prompt = EXTRACTION_PROMPT;

  it('states the identity the numbers must satisfy', () => {
    // Seed 590 added `service_charge` to the identity. It has to be a term in its own right: an
    // 18% auto-gratuity folded into either the tax or the tip makes the equation balance while
    // misattributing the money, which is the failure that has no symptom.
    expect(prompt).toMatch(/subtotal \+ tax \+ service_charge \+ tip - discount = total/);
  });

  it('tells the model a service charge is not a tip the customer chose', () => {
    expect(prompt).toMatch(/A SERVICE CHARGE IS NOT A TIP/);
    expect(prompt).toMatch(/service_charge_cents/);
    // Both directions of the mistake, because either one alone reads as a rule about one field.
    expect(prompt).toMatch(/the BUSINESS added/);
    expect(prompt).toMatch(/what the CUSTOMER chose/);
  });

  it('tells the model to infer an unprinted tip, with the owner’s own example', () => {
    expect(prompt).toMatch(/\$85\.00/);
    expect(prompt).toMatch(/\$100\.00/);
    expect(prompt).toMatch(/tip_cents.*1500|1500/);
  });

  it('bounds the inference so a misread does not become a fake tip', () => {
    // Without a plausibility band, any arithmetic gap becomes a "tip" and the flag never fires.
    expect(prompt).toMatch(/10–35%|10-35%/);
  });

  it('forbids inventing a subtotal or tax to force the equation to balance', () => {
    expect(prompt).toMatch(/Never invent a subtotal/i);
  });

  it('still asks for the cardholder name, which the card check needs', () => {
    expect(prompt).toMatch(/card_holder_name/);
  });
});
