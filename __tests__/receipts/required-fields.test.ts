// What a person must tell us before a receipt is accepted.
//
// Owner, 2026-08-18: *"For each receipt, before it can be submitted, please make it so that the user
// has to put in the date, business name, and total amount before being able to submit it."*

import { describe, it, expect } from 'vitest';
import {
  checkDeclaration, declarationBriefing, describeMissing, parseTotalToCents,
  resolveDeclaration, todayIso,
} from '@/lib/receipts/required-fields';

const NOW = new Date('2026-08-18T12:00:00Z');
const good = {
  date: '2026-08-17',
  vendor: "Guy's Quick Stop",
  total: '27.89',
  category: 'meals',
  nature: 'business',
  payment: 'card',
};

describe('parseTotalToCents', () => {
  it('takes the shapes a person actually types', () => {
    expect(parseTotalToCents('27.89')).toBe(2789);
    expect(parseTotalToCents('$27.89')).toBe(2789);
    expect(parseTotalToCents(' 27 ')).toBe(2700);
    expect(parseTotalToCents('1,204.50')).toBe(120450);
  });

  it('refuses a half-typed amount rather than guessing', () => {
    // "12." must not be stored as twelve dollars while somebody is still typing the cents.
    expect(parseTotalToCents('12.')).toBe('invalid');
    expect(parseTotalToCents('abc')).toBe('invalid');
    expect(parseTotalToCents('27.891')).toBe('invalid');
  });

  it('allows a negative, because a refund is a real receipt', () => {
    expect(parseTotalToCents('-12.50')).toBe(-1250);
  });

  it('distinguishes empty from invalid', () => {
    // They get different messages: one says "you have not filled this in", the other says "that is
    // not a number". Collapsing them tells somebody they typed a bad value into a box they never
    // touched.
    expect(parseTotalToCents('')).toBe('empty');
    expect(parseTotalToCents(null)).toBe('empty');
  });
});

describe('checkDeclaration — the happy path', () => {
  it('accepts a filled-in receipt and hands back clean values', () => {
    const c = checkDeclaration(good, NOW);
    expect(c.ok).toBe(true);
    expect(c.value).toEqual({
      dateIso: '2026-08-17',
      vendorName: "Guy's Quick Stop",
      totalCents: 2789,
      category: 'meals',
      nature: 'business',
      payment: 'card',
    });
  });

  it('accepts today', () => {
    expect(checkDeclaration({ ...good, date: todayIso(NOW) }, NOW).ok).toBe(true);
  });

  it('tidies the business name without changing it', () => {
    expect(checkDeclaration({ ...good, vendor: '  Guy’s   Quick  Stop ' }, NOW).value?.vendorName)
      .toBe('Guy’s Quick Stop');
  });
});

describe('checkDeclaration — what it refuses', () => {
  it('will not submit with any required field blank', () => {
    expect(checkDeclaration({ ...good, date: '' }, NOW).missing).toEqual(['date']);
    expect(checkDeclaration({ ...good, vendor: '' }, NOW).missing).toEqual(['vendor']);
    expect(checkDeclaration({ ...good, total: '' }, NOW).missing).toEqual(['total']);
    expect(checkDeclaration({ ...good, category: '' }, NOW).missing).toEqual(['category']);
    expect(checkDeclaration({ ...good, nature: '' }, NOW).missing).toEqual(['nature']);
    expect(checkDeclaration({ ...good, payment: '' }, NOW).missing).toEqual(['payment']);
    expect(checkDeclaration({}, NOW).missing)
      .toEqual(['date', 'vendor', 'total', 'category', 'nature', 'payment']);
  });

  it('rejects a date in the future — the commonest typo in this box', () => {
    // A wrong year, or a day picked from the wrong month, lands the expense in a period nobody has
    // reconciled yet, where nobody is looking for it.
    const c = checkDeclaration({ ...good, date: '2026-08-19' }, NOW);
    expect(c.ok).toBe(false);
    expect(c.errors.date).toMatch(/cannot be from tomorrow/);
  });

  it('rejects a date absurdly far back, which is a mistyped year', () => {
    expect(checkDeclaration({ ...good, date: '2016-08-17' }, NOW).errors.date).toMatch(/check the year/);
  });

  it('rejects a one-character business name', () => {
    // It satisfies "not empty" and identifies nothing. The point of the field is that somebody can
    // read it back later and know where the money went.
    expect(checkDeclaration({ ...good, vendor: 'x' }, NOW).errors.vendor).toMatch(/not a single letter/);
  });

  it('rejects a zero total', () => {
    expect(checkDeclaration({ ...good, total: '0' }, NOW).errors.total).toMatch(/not a receipt/);
    expect(checkDeclaration({ ...good, total: '0.00' }, NOW).errors.total).toBeDefined();
  });

  it('rejects a total that is not a number, and says how to type one', () => {
    expect(checkDeclaration({ ...good, total: 'about thirty' }, NOW).errors.total).toMatch(/like 27\.89/);
  });

  it('never returns a value when it is not ok', () => {
    // The caller must not be able to read a half-validated declaration and store it.
    expect(checkDeclaration({ ...good, total: '' }, NOW).value).toBeUndefined();
  });
});

describe('describeMissing', () => {
  it('says nothing when the queue is ready', () => {
    expect(describeMissing([checkDeclaration(good, NOW)])).toBeNull();
    expect(describeMissing([])).toBeNull();
  });

  it('names the one field a single receipt is missing', () => {
    expect(describeMissing([checkDeclaration({ ...good, total: '' }, NOW)]))
      .toBe('One receipt still needs its total.');
  });

  it('lists the fields in reading order and counts the receipts', () => {
    const checks = [
      checkDeclaration({ ...good, total: '' }, NOW),
      checkDeclaration({ ...good, date: '', vendor: '' }, NOW),
    ];
    expect(describeMissing(checks)).toBe('2 receipts still need their date, business name and total.');
  });

  it('counts a receipt with a BAD value, not just a blank one', () => {
    // A future date is not "missing", and a submit button that says everything is fine while
    // refusing to submit is the worst of both.
    // …and says CHECK rather than STILL NEEDS. A filled-but-invalid date described as missing
    // sends somebody hunting for an empty box that does not exist — caught in the browser.
    expect(describeMissing([checkDeclaration({ ...good, date: '2027-01-01' }, NOW)]))
      .toBe('One receipt needs attention — check the date.');
  });
});

describe('resolveDeclaration — set once for a stack, override per receipt', () => {
  const shared = { category: 'fuel', nature: 'business', payment: 'card' };

  it('lets one answer satisfy a whole stack for the shareable three', () => {
    // A fortnight of fuel receipts is twenty times fuel, business, same card. Demanding twenty
    // identical answers is how a required field becomes something people click through without
    // reading — which produces confidently wrong data, strictly worse than honest uncertainty.
    const r = resolveDeclaration({ date: '2026-08-17', vendor: 'CEFCO', total: '9.03' }, shared);
    expect(checkDeclaration(r, NOW).ok).toBe(true);
    expect(checkDeclaration(r, NOW).value?.category).toBe('fuel');
  });

  it('lets a single receipt override the stack', () => {
    const r = resolveDeclaration(
      { date: '2026-08-17', vendor: 'Sonic', total: '20.98', category: 'meals' },
      shared,
    );
    expect(checkDeclaration(r, NOW).value?.category).toBe('meals');
    expect(checkDeclaration(r, NOW).value?.payment).toBe('card'); // still inherited
  });

  it('NEVER lets the date, business or total fall back to the stack', () => {
    // The whole point of the feature. Inheriting a total would file twenty receipts under one
    // amount, which is precisely the failure these fields exist to prevent.
    const r = resolveDeclaration({}, {
      ...shared, date: '2026-08-17', vendor: 'CEFCO', total: '9.03',
    });
    expect(r.date).toBe('');
    expect(r.vendor).toBe('');
    expect(r.total).toBe('');
    expect(checkDeclaration(r, NOW).missing).toEqual(['date', 'vendor', 'total']);
  });
});

describe('the new mandatory fields', () => {
  it('refuses a category the rest of the system does not know', () => {
    // A value outside the closed set is a silent hole in every report that groups by it.
    expect(checkDeclaration({ ...good, category: 'snacks' }, NOW).errors.category)
      .toMatch(/one of the listed categories/);
  });

  it('refuses a nature or payment method outside the set', () => {
    expect(checkDeclaration({ ...good, nature: 'maybe' }, NOW).errors.nature).toBeDefined();
    expect(checkDeclaration({ ...good, payment: 'crypto' }, NOW).errors.payment).toBeDefined();
  });

  it('accepts personal, cash and every listed category', () => {
    expect(checkDeclaration({ ...good, nature: 'personal', payment: 'cash' }, NOW).ok).toBe(true);
    for (const c of ['fuel', 'lodging', 'professional_services', 'other']) {
      expect(checkDeclaration({ ...good, category: c }, NOW).ok, c).toBe(true);
    }
  });
});

describe('declarationBriefing', () => {
  it('tells the reader these were typed into required boxes, not guessed', () => {
    const b = declarationBriefing({ dateIso: '2026-08-17', vendorName: "Guy's", totalCents: 2789, category: 'meals' as const, nature: 'business' as const, payment: 'card' as const })!;
    expect(b).toMatch(/\$27\.89/);
    expect(b).toMatch(/required boxes/);
    expect(b).toMatch(/strongest evidence/);
  });

  it('says to prefer the declaration over an unreadable figure', () => {
    // The McDonald's case: subtotal, tax and total all came back null while somebody had written the
    // total down. Empty is the worst outcome — the number was available and the receipt still
    // reached the books blank.
    const b = declarationBriefing({ dateIso: '2026-08-17', vendorName: 'x', totalCents: 1, category: 'other' as const, nature: 'business' as const, payment: 'card' as const })!;
    expect(b).toMatch(/PREFER THE DECLARATION/);
    expect(b).toMatch(/Do not return null/);
  });

  it('still forbids overwriting print it can plainly read', () => {
    const b = declarationBriefing({ dateIso: '2026-08-17', vendorName: 'x', totalCents: 1, category: 'other' as const, nature: 'business' as const, payment: 'card' as const })!;
    expect(b).toMatch(/keep what is printed/);
    expect(b).toMatch(/typo in a required box/);
  });

  it('warns against bending the subtotal to reach the declared total', () => {
    // Otherwise a declared total silently rewrites the printed parts to reconcile with it, and the
    // disagreement that should have been flagged disappears.
    expect(declarationBriefing({ dateIso: '2026-08-17', vendorName: 'x', totalCents: 1, category: 'other' as const, nature: 'business' as const, payment: 'card' as const })!)
      .toMatch(/not something to fix by arithmetic/);
  });

  it('tells the reader NOT to hunt for a card number on a cash receipt', () => {
    // The last four is the field the reader misreads most — measured, it read the auth number 540431
    // as last-four 0431 on a receipt whose card was 5054. Knowing a receipt was cash stops that hunt
    // before it starts, which is most of the value of asking how it was paid for.
    const cash = declarationBriefing({
      dateIso: '2026-08-17', vendorName: 'x', totalCents: 1,
      category: 'meals', nature: 'business', payment: 'cash',
    })!;
    expect(cash).toMatch(/Do NOT report a card last four/);

    const card = declarationBriefing({
      dateIso: '2026-08-17', vendorName: 'x', totalCents: 1,
      category: 'meals', nature: 'business', payment: 'card',
    })!;
    expect(card).toMatch(/card last four is expected/);
  });

  it('defers to the person on category and business/personal', () => {
    // They know what they bought and who it was for; the reader is inferring both from a photograph.
    const b = declarationBriefing({
      dateIso: '2026-08-17', vendorName: 'x', totalCents: 1,
      category: 'meals', nature: 'personal', payment: 'card',
    })!;
    expect(b).toMatch(/Use theirs/);
    expect(b).toMatch(/business or personal: personal/);
  });

  it('is null when nothing was declared', () => {
    expect(declarationBriefing(null)).toBeNull();
  });
});
