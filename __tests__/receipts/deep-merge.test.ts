// Stitching band transcripts, and finding what disagrees.
//
// Owner, 2026-08-18: *"then it should tie all of the info together … For any discrepancies, then we
// can have warnings and stuff to let the reviewer know that there is a discrepancy."*

import { describe, it, expect } from 'vitest';
import {
  assembleTranscript, checkDateSanity, checkLineItemSum, compareReadings,
  normaliseForMatch, sortDiscrepancies, summariseDiscrepancies,
} from '@/lib/receipts/deep-merge';

describe('assembleTranscript', () => {
  it('drops the overlap instead of duplicating it', () => {
    // Bands overlap by design so no line is cut out of both. Concatenating naively doubles those
    // lines — and a doubled line item is a wrong subtotal.
    const out = assembleTranscript([
      { index: 0, lines: ['SONIC DRIVE-IN', '423 Live Oak St', 'Marlin TX 76661'] },
      { index: 1, lines: ['423 Live Oak St', 'Marlin TX 76661', 'Drive Thru', '1 Amer Dog Cmb 7.39'] },
    ]);
    expect(out).toEqual([
      'SONIC DRIVE-IN', '423 Live Oak St', 'Marlin TX 76661', 'Drive Thru', '1 Amer Dog Cmb 7.39',
    ]);
  });

  it('matches through the small transcription differences between two passes', () => {
    // The same line read twice rarely comes back byte-identical. Comparing on a normalised form is
    // what lets the splice find the seam at all.
    const out = assembleTranscript([
      { index: 0, lines: ['TOTAL  DUE', 'Subtotal:  19.38'] },
      { index: 1, lines: ['Total Due', 'subtotal: 19.38', 'Tax 1.60'] },
    ]);
    expect(out).toEqual(['TOTAL  DUE', 'Subtotal:  19.38', 'Tax 1.60']);
  });

  it('prefers the LONGEST overlap, so a repeated short line cannot splice at the wrong place', () => {
    // 'Med Coke' appears twice. Anchoring on the first match would delete everything between the two
    // occurrences — a silent hole in the middle of the itemised lines.
    const out = assembleTranscript([
      { index: 0, lines: ['Med Coke', '1 Amer Dog Cmb', 'Med Tots', 'Med Coke', 'Tax 1.60'] },
      { index: 1, lines: ['Med Coke', 'Tax 1.60', 'Total Due 20.98'] },
    ]);
    expect(out).toContain('1 Amer Dog Cmb');
    expect(out).toContain('Med Tots');
    expect(out[out.length - 1]).toBe('Total Due 20.98');
    expect(out.filter((l) => l === 'Tax 1.60')).toHaveLength(1);
  });

  it('will not let a run of dashes anchor a splice', () => {
    // A rule of dashes normalises to nothing and therefore matches anything. Allowing it to anchor
    // would let two unrelated bands appear to overlap.
    const out = assembleTranscript([
      { index: 0, lines: ['ITEM ONE', '--------'] },
      { index: 1, lines: ['--------', 'ITEM TWO'] },
    ]);
    expect(out).toContain('ITEM ONE');
    expect(out).toContain('ITEM TWO');
  });

  it('handles bands that do not overlap at all', () => {
    const out = assembleTranscript([
      { index: 0, lines: ['A', 'B'] },
      { index: 1, lines: ['C', 'D'] },
    ]);
    expect(out).toEqual(['A', 'B', 'C', 'D']);
  });

  it('sorts by band index rather than trusting the array order', () => {
    const out = assembleTranscript([
      { index: 1, lines: ['second'] },
      { index: 0, lines: ['first'] },
    ]);
    expect(out).toEqual(['first', 'second']);
  });

  it('drops blank lines and survives an empty band', () => {
    expect(assembleTranscript([
      { index: 0, lines: ['A', '', '   '] },
      { index: 1, lines: [] },
    ])).toEqual(['A']);
    expect(assembleTranscript([])).toEqual([]);
  });
});

describe('normaliseForMatch', () => {
  it('flattens the characters OCR habitually swaps', () => {
    expect(normaliseForMatch('TOTAL  DUE:')).toBe(normaliseForMatch('total due'));
    expect(normaliseForMatch('|tem')).toBe(normaliseForMatch('Item'));
  });

  it('keeps digits and decimal points, which are the point', () => {
    // Flattening 19.38 to 1938 would make two different amounts compare equal.
    expect(normaliseForMatch('Subtotal: 19.38')).toBe('subtotal 19.38');
  });
});

describe('compareReadings', () => {
  it('reports a disagreement between two passes over the total', () => {
    const d = compareReadings('total_cents', [
      { source: 'whole receipt', value: 2098 },
      { source: 'totals block, enlarged', value: 2090 },
    ]);
    expect(d).not.toBeNull();
    expect(d!.severity).toBe('high');
    expect(d!.message).toMatch(/\$20\.98/);
    expect(d!.message).toMatch(/\$20\.90/);
  });

  it('says nothing when the passes agree', () => {
    expect(compareReadings('total_cents', [
      { source: 'a', value: 2098 },
      { source: 'b', value: 2098 },
    ])).toBeNull();
  });

  it('an omitted figure raises NO alarm — the fix for the change-vs-total false positive', () => {
    // Live run against the real Sonic receipt, 2026-08-18: the close-up crop of the bottom contained
    // both "Total Due: 20.98" and "Change: $0.02", and the region reader returned 2 cents as the
    // total. That produced a HIGH-severity "the total does not agree" warning on a receipt whose
    // total was read perfectly — the worst kind of false alarm, because a few of those teach the
    // bookkeeper to skip the warnings that matter.
    //
    // Fixed in the region prompt, which now has a `change_cents` slot to put it in and is told to
    // omit the total rather than promote the nearest number to it. This pins the other half: an
    // omission must stay silent.
    expect(compareReadings('total_cents', [
      { source: 'whole receipt', value: 2098 },
      { source: 'totals, enlarged', value: undefined },
    ])).toBeNull();
  });

  it('treats silence as agreement, not as conflict', () => {
    // Most passes are deliberately narrow. "The totals reader did not report a vendor name" is not a
    // disagreement, and counting it as one would bury the real ones.
    expect(compareReadings('vendor_name', [
      { source: 'header band', value: 'Sonic Drive-In' },
      { source: 'totals block', value: null },
    ])).toBeNull();
  });

  it('ignores formatting differences in text fields', () => {
    expect(compareReadings('vendor_name', [
      { source: 'a', value: 'SONIC DRIVE-IN' },
      { source: 'b', value: 'Sonic Drive In' },
    ])).toBeNull();
  });

  it('ranks money above everything else, because money is what it costs', () => {
    const money = compareReadings('total_cents', [
      { source: 'a', value: 100 }, { source: 'b', value: 200 }]);
    const last4 = compareReadings('payment_last4', [
      { source: 'a', value: '4824' }, { source: 'b', value: '4321' }]);
    const name = compareReadings('vendor_name', [
      { source: 'a', value: 'Sonic' }, { source: 'b', value: 'Sonic Drive-In Inc' }]);
    expect(money!.severity).toBe('high');
    expect(last4!.severity).toBe('medium');
    expect(name!.severity).toBe('low');
  });
});

describe('checkLineItemSum', () => {
  it('catches a MISSED item, which the subtotal+tax identity cannot', () => {
    // The parts can balance perfectly while an item is absent, because the subtotal was read off the
    // paper rather than summed. This is the only check that can see a dropped line.
    const d = checkLineItemSum(
      [{ amount_cents: 739 }, { amount_cents: 1199 }],
      { subtotal_cents: 1938 + 500 },
    );
    expect(d).not.toBeNull();
    expect(d!.message).toMatch(/short/);
    expect(d!.message).toMatch(/missed/);
  });

  it('catches an item read TWICE, and says so in the other direction', () => {
    const d = checkLineItemSum(
      [{ amount_cents: 739 }, { amount_cents: 739 }, { amount_cents: 1199 }],
      { subtotal_cents: 1938 },
    );
    expect(d!.message).toMatch(/over/);
    expect(d!.message).toMatch(/twice/);
  });

  it('is silent on the real Sonic receipt, where the items do sum', () => {
    // 7.39 + 11.99 = 19.38, the printed subtotal.
    expect(checkLineItemSum(
      [{ amount_cents: 739 }, { amount_cents: 1199 }],
      { subtotal_cents: 1938 },
    )).toBeNull();
  });

  it('tolerates a couple of cents, and does not tolerate a couple of dollars', () => {
    expect(checkLineItemSum([{ amount_cents: 1000 }], { subtotal_cents: 1002 })).toBeNull();
    expect(checkLineItemSum([{ amount_cents: 1000 }], { subtotal_cents: 1200 })).not.toBeNull();
  });

  it('says nothing when there is nothing to compare', () => {
    expect(checkLineItemSum([], { subtotal_cents: 1000 })).toBeNull();
    expect(checkLineItemSum([{ amount_cents: 100 }], { subtotal_cents: null })).toBeNull();
    expect(checkLineItemSum([{ amount_cents: null }], { subtotal_cents: 100 })).toBeNull();
  });
});

describe('checkDateSanity', () => {
  const now = new Date('2026-08-18T12:00:00Z');

  it('flags a date in the future', () => {
    const d = checkDateSanity('2027-03-01', now);
    expect(d!.code).toBe('date_in_future');
    expect(d!.severity).toBe('high');
  });

  it('flags the 2016/2026 case this repo has already been bitten by', () => {
    // A dropped stroke turns 2026 into 2016 and the result still looks like a well-formed date.
    const d = checkDateSanity('2016-08-12', now);
    expect(d!.code).toBe('date_very_old');
  });

  it('is quiet about an ordinary recent receipt', () => {
    expect(checkDateSanity('2026-08-14', now)).toBeNull();
    expect(checkDateSanity(null, now)).toBeNull();
  });

  it('flags a value that is not a date at all', () => {
    expect(checkDateSanity('8/2/206', now)!.code).toBe('date_unparseable');
  });
});

describe('presentation', () => {
  it('puts what costs money first', () => {
    const sorted = sortDiscrepancies([
      { code: 'a', severity: 'low', message: 'l', field: 'x' },
      { code: 'b', severity: 'high', message: 'h', field: 'y' },
      { code: 'c', severity: 'medium', message: 'm', field: 'z' },
    ]);
    expect(sorted.map((d) => d.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('has nothing to say about a clean receipt', () => {
    // A banner that is always there stops being read — the same rule as the confidence panel at 100.
    expect(summariseDiscrepancies([])).toBeNull();
  });

  it('leads with the count that matters, and gets the grammar right', () => {
    expect(summariseDiscrepancies([
      { code: 'a', severity: 'high', message: '' },
      { code: 'b', severity: 'low', message: '' },
    ])).toBe('One thing on this receipt does not agree — check it against the photo.');
  });
});
