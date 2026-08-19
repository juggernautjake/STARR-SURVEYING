// What the person who was standing there told us.
//
// Owner, 2026-08-18: *"If the user puts down the total and location and job number and all that,
// then the AI should track that and use it in the summary if it is correct."*

import { describe, it, expect } from 'vitest';
import {
  checkNoteAgainstReading, noteBriefingFor, parseNoteHints,
} from '@/lib/receipts/user-notes';

describe('parseNoteHints — money', () => {
  it('finds a total written with a currency symbol', () => {
    expect(parseNoteHints('paid $27.89 at Guys').totalCents).toBe(2789);
  });

  it('finds one written as bare decimals', () => {
    expect(parseNoteHints('total 27.89').totalCents).toBe(2789);
  });

  it('handles thousands separators', () => {
    expect(parseNoteHints('$1,204.50 for the plotter').totalCents).toBe(120450);
  });

  it('does NOT treat a bare integer as money', () => {
    // "24 pack of water" contains a 24. Reading that as $24.00 would manufacture a disagreement on a
    // note that said nothing about money — the fastest way to make people stop writing notes.
    const h = parseNoteHints('24 pack of water and 3 bags of ice');
    expect(h.totalCents).toBeNull();
    expect(h.allAmountsCents).toEqual([]);
  });

  it('keeps every figure, largest first, so a note with a tip still resolves', () => {
    const h = parseNoteHints('$85.00 food, $100.00 with tip');
    expect(h.allAmountsCents).toEqual([10000, 8500]);
    expect(h.totalCents).toBe(10000);
  });
});

describe('parseNoteHints — job numbers', () => {
  it('reads the ways a person actually writes one', () => {
    for (const s of ['job 2451', 'Job #2451', 'job no. 2451', 'JOB: 2451']) {
      expect(parseNoteHints(s).jobNumber, s).toBe('2451');
    }
  });

  it('does not invent one from an unrelated number', () => {
    // "fuel for 2 trucks" names no job, and a picker that guessed would file the receipt against
    // job 2.
    expect(parseNoteHints('fuel for 2 trucks').jobNumber).toBeNull();
    expect(parseNoteHints('lunch with the client').jobNumber).toBeNull();
  });
});

describe('parseNoteHints — dates', () => {
  it('reads ISO and US forms, and treats a two-digit year as 20xx', () => {
    expect(parseNoteHints('on 2026-08-12').dateIso).toBe('2026-08-12');
    expect(parseNoteHints('8/12/26').dateIso).toBe('2026-08-12');
    expect(parseNoteHints('8-12-2026').dateIso).toBe('2026-08-12');
  });

  it('rejects something that is not a date', () => {
    expect(parseNoteHints('13/45/99').dateIso).toBeNull();
  });
});

describe('parseNoteHints — shape', () => {
  it('marks an ordinary prose note as free text, and still keeps its words', () => {
    const h = parseNoteHints('fuel for the Henry survey truck');
    expect(h.isFreeTextOnly).toBe(true);
    expect(h.placeTerms).toContain('Henry');
  });

  it('is empty and safe for a missing note', () => {
    for (const n of [null, undefined, '', '   ']) {
      const h = parseNoteHints(n);
      expect(h.totalCents).toBeNull();
      expect(h.jobNumber).toBeNull();
      expect(h.placeTerms).toEqual([]);
    }
  });
});

describe('checkNoteAgainstReading', () => {
  it('confirms a total the reading agrees with', () => {
    const { discrepancies, confirmations } = checkNoteAgainstReading(
      parseNoteHints('paid $27.89'),
      { total_cents: 2789 },
    );
    expect(discrepancies).toHaveLength(0);
    expect(confirmations[0]).toMatch(/matches the \$27\.89 you noted/);
  });

  it('flags the Guy\'s Quick Stop case, which nothing else could settle', () => {
    // The real failure, 2026-08-18. The receipt prints $27.89; the reader returns $27.69 at two
    // bands and at five, because the photo is 480×640. And the arithmetic cannot arbitrate —
    // 25.62 + 2.07 = 27.69 balances exactly as well as 25.82 + 2.07 = 27.89. A person who wrote the
    // total down is the only source that can settle it.
    const { discrepancies } = checkNoteAgainstReading(
      parseNoteHints('Guys quick stop $27.89'),
      { total_cents: 2769 },
    );
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0].severity).toBe('high');
    expect(discrepancies[0].message).toMatch(/\$27\.89/);
    expect(discrepancies[0].message).toMatch(/\$27\.69/);
    expect(discrepancies[0].readings).toEqual([
      { source: 'your note', value: '$27.89' },
      { source: 'read from the photo', value: '$27.69' },
    ]);
  });

  it('does not cry conflict when the note listed several figures and one matches', () => {
    // "$85.00 food, $100.00 with tip" against a reading of 8500 is agreement, not disagreement.
    const { discrepancies, confirmations } = checkNoteAgainstReading(
      parseNoteHints('$85.00 food, $100.00 with tip'),
      { total_cents: 8500 },
    );
    expect(discrepancies).toHaveLength(0);
    expect(confirmations[0]).toMatch(/one of the figures you noted/);
  });

  it('says nothing when the note carries no figure', () => {
    const { discrepancies, confirmations } = checkNoteAgainstReading(
      parseNoteHints('fuel for the truck'),
      { total_cents: 2789 },
    );
    expect(discrepancies).toHaveLength(0);
    expect(confirmations).toHaveLength(0);
  });

  it('checks the date too, at a lower severity than money', () => {
    const { discrepancies } = checkNoteAgainstReading(
      parseNoteHints('8/12/26'),
      { transaction_at: '2026-08-22T10:00:00Z' },
    );
    expect(discrepancies[0].severity).toBe('medium');
    expect(discrepancies[0].field).toBe('transaction_at');
  });

  it('corroborates the vendor when a word in the note appears in it', () => {
    const { confirmations } = checkNoteAgainstReading(
      parseNoteHints('lunch at Sonic'),
      { vendor_name: 'Sonic Drive-In' },
    );
    expect(confirmations.some((c) => /Sonic/.test(c))).toBe(true);
  });

  it('never mutates the reading — a note is evidence, not an override', () => {
    // A mistyped total silently becoming the books is the one outcome that must be impossible.
    const reading = { total_cents: 2769 };
    checkNoteAgainstReading(parseNoteHints('$27.89'), reading);
    expect(reading.total_cents).toBe(2769);
  });
});

describe('noteBriefingFor', () => {
  it('tells the model what a note IS, not just what it says', () => {
    const brief = noteBriefingFor('Guys $27.89 job 2451', parseNoteHints('Guys $27.89 job 2451'))!;
    expect(brief).toMatch(/holding the paper/);
    expect(brief).toMatch(/NOT automatically right/);
    expect(brief).toMatch(/\$27\.89/);
    expect(brief).toMatch(/job 2451/);
  });

  it('tells it to put what checks out in the summary — the owner\'s actual ask', () => {
    expect(noteBriefingFor('x $10.00', parseNoteHints('x $10.00'))!).toMatch(/ai_summary/);
  });

  it('separates ILLEGIBLE from CONTRADICTED, which is the distinction that matters', () => {
    // Measured on the McDonald's receipt, 2026-08-18: the totals block is faint enough that the
    // reader returned null for subtotal, tax AND total — while the submitter's note said "29.29
    // total". The first version of this briefing forbade copying a figure the receipt "does not
    // support", which the model correctly read as covering an unreadable field, so it returned
    // nothing at all. Empty is the worst of the three outcomes: the number was available and the
    // receipt still reached the books blank.
    const brief = noteBriefingFor('total 29.29', parseNoteHints('total 29.29'))!;
    expect(brief).toMatch(/ILLEGIBLE IS NOT THE SAME AS CONTRADICTED/);
    expect(brief).toMatch(/USE THE NOTE/);
    expect(brief).toMatch(/Returning null when somebody has written the number down/);
    // …and still refuses to overwrite print it CAN read.
    expect(brief).toMatch(/does not get to overwrite legible print/);
  });

  it('is null when there is no note, so nothing is added to the prompt', () => {
    expect(noteBriefingFor('', parseNoteHints(''))).toBeNull();
    expect(noteBriefingFor(null, parseNoteHints(null))).toBeNull();
  });
});
