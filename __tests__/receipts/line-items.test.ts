// The individual things on a receipt, and who decided what about them.
//
// Owner, 2026-08-17: *"mark each individual item as a business expense or not … removed items should
// not actually be removed, they should just be flagged … The user should have to give a reason."*

import { describe, it, expect } from 'vitest';
import {
  countsAsBusiness, describeLineItemReview, linesPreservedOnReextract, linesToReplaceOnReextract,
  summariseLineItems, validateAmountCents, validateDescription, validateQuantity, validateReason,
  type LineItem,
} from '@/lib/receipts/line-items';

const li = (over: Partial<LineItem> = {}): LineItem => ({
  id: over.id ?? 'x', description: 'Item', amount_cents: 1000, quantity: 1, position: 0,
  source: 'ai', is_business_expense: null, ...over,
});

describe('is_business_expense has THREE states', () => {
  it('NULL follows the receipt, which is the common case', () => {
    // Most receipts are wholly one or the other. Making somebody tick twenty lines to say "yes, all
    // of it" guarantees nobody ticks any.
    expect(countsAsBusiness(li({ is_business_expense: null }), true)).toBe(true);
    expect(countsAsBusiness(li({ is_business_expense: null }), false)).toBe(false);
  });

  it('TRUE and FALSE override the receipt — the mixed-receipt case', () => {
    expect(countsAsBusiness(li({ is_business_expense: true }), false)).toBe(true);
    expect(countsAsBusiness(li({ is_business_expense: false }), true)).toBe(false);
  });

  it('a removed line never counts, whatever it says about itself', () => {
    // Removing it is the decision. It cannot then argue it is a business expense.
    expect(countsAsBusiness(li({ is_business_expense: true, removed_at: '2026-08-17T00:00:00Z' }), true)).toBe(false);
  });
});

describe('summariseLineItems', () => {
  const items = [
    li({ id: 'a', amount_cents: 1000 }),                                   // follows receipt
    li({ id: 'b', amount_cents: 500, is_business_expense: false }),        // personal
    li({ id: 'c', amount_cents: 250, removed_at: '2026-08-17T00:00:00Z', removed_reason: 'not ours' }),
    li({ id: 'd', amount_cents: 700, source: 'user', added_reason: 'missed by the AI' }),
    li({ id: 'e', amount_cents: 300, edited_at: '2026-08-17T00:00:00Z' }),
  ];

  it('splits the money into claimed and not', () => {
    const t = summariseLineItems(items, true);
    expect(t.businessCents).toBe(1000 + 700 + 300);
    // Personal AND removed both land in excluded — a bookkeeper asking "how much are we not
    // claiming" wants one number, not two to add up.
    expect(t.excludedCents).toBe(500 + 250);
  });

  it('counts what a person has done to the list', () => {
    const t = summariseLineItems(items, true);
    expect(t.removed).toBe(1);
    expect(t.userAdded).toBe(1);
    expect(t.edited).toBe(1);
    expect(t.count).toBe(5);
  });

  it('follows the receipt when the receipt is personal', () => {
    const t = summariseLineItems([li({ amount_cents: 1000 })], false);
    expect(t.businessCents).toBe(0);
    expect(t.excludedCents).toBe(1000);
  });

  it('treats a missing amount as zero rather than NaN-ing the total', () => {
    expect(summariseLineItems([li({ amount_cents: null })], true).businessCents).toBe(0);
  });
});

describe('re-extraction must not destroy human decisions', () => {
  // THE FAILURE: extract.ts DELETEs every line for a receipt before inserting the new reading, so a
  // re-run does not double them. With the "re-run the AI" button shipped, that would wipe every
  // business/personal mark, every reason and every hand-added line — hardest on the receipts
  // somebody had corrected most carefully.
  const items = [
    li({ id: 'untouched' }),
    li({ id: 'added', source: 'user', added_reason: 'AI missed it' }),
    li({ id: 'removed', removed_at: '2026-08-17T00:00:00Z', removed_reason: 'personal' }),
    li({ id: 'edited', edited_at: '2026-08-17T00:00:00Z' }),
    li({ id: 'ruled', is_business_expense: false }),
  ];

  it('replaces ONLY the untouched AI transcriptions', () => {
    expect(linesToReplaceOnReextract(items)).toEqual(['untouched']);
  });

  it('keeps every line a person has touched, and says why', () => {
    const kept = linesPreservedOnReextract(items);
    expect(kept.map((k) => k.id).sort()).toEqual(['added', 'edited', 'removed', 'ruled']);
    expect(kept.find((k) => k.id === 'ruled')?.why).toMatch(/not a business expense/);
    expect(kept.find((k) => k.id === 'added')?.why).toMatch(/added by hand/);
  });

  it('an is_business_expense of TRUE is a decision too, not just FALSE', () => {
    // Easy to write the filter as `!li.is_business_expense` and silently wipe every line somebody
    // explicitly confirmed.
    expect(linesToReplaceOnReextract([li({ id: 'yes', is_business_expense: true })])).toEqual([]);
  });

  it('and a receipt nobody has touched is entirely replaceable, so re-running still works', () => {
    expect(linesToReplaceOnReextract([li({ id: '1' }), li({ id: '2' })])).toEqual(['1', '2']);
  });
});

describe('validation', () => {
  it('needs a description', () => {
    expect(validateDescription('Fuel').ok).toBe(true);
    for (const bad of ['', '   ', null, 42]) expect(validateDescription(bad).ok).toBe(false);
  });

  it('refuses a float amount rather than rounding it', () => {
    // 4.99 means dollars. Storing 4 cents turns a $4.99 item into 4¢ — wrong in a way that still
    // looks like a number.
    expect(validateAmountCents(499).ok).toBe(true);
    expect(validateAmountCents(4.99).ok).toBe(false);
  });

  it('allows a negative amount, because a discount or return is a real line', () => {
    expect(validateAmountCents(-500).ok).toBe(true);
  });

  it('allows a fractional quantity but not a negative one', () => {
    expect(validateQuantity(2.5).ok).toBe(true);
    expect(validateQuantity(-1).ok).toBe(false);
  });

  it('demands a reason with actual content', () => {
    // "x" satisfies a not-empty check and explains nothing, and the whole point is that somebody can
    // read it later and understand the decision.
    expect(validateReason('Personal snack, not for the job', 'remove').ok).toBe(true);
    expect(validateReason('x', 'remove').ok).toBe(false);
    expect(validateReason('', 'add').ok).toBe(false);
  });

  it('and names the verb, so the message fits the button that was pressed', () => {
    const r = validateReason('', 'add');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/adding/);
  });
});

describe('describeLineItemReview', () => {
  it('is null when nobody has touched anything', () => {
    // A line that is always present stops being read — same rule as the confidence banner at 100.
    expect(describeLineItemReview(summariseLineItems([li()], true))).toBeNull();
  });

  it('names what was done when something was', () => {
    const t = summariseLineItems([
      li({ id: 'a', source: 'user', added_reason: 'r' }),
      li({ id: 'b', removed_at: 'now', removed_reason: 'r' }),
    ], true);
    const s = describeLineItemReview(t);
    expect(s).toMatch(/1 added by hand/);
    expect(s).toMatch(/1 removed/);
  });
});
