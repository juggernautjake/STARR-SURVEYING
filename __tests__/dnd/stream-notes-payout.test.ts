// __tests__/dnd/stream-notes-payout.test.ts — NeoNuggets → notes actually reaches the sheet.
//
// Owner 2026-07-19: "notes are weird and the conversion isn't working." Root cause: the convert
// route wrote notes onto the LEGACY fixed-key `currency.credits`, but a sheet carrying the
// flexible `currencies` list renders that list INSTEAD (types.ts: "when present, the sheet
// renders this ... instead of `currency`"). So the payout landed in a field nothing displayed.
// These pin the fix on both money models.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readNotes, writeNotes, findNotesCurrency, NOTES_CURRENCY_ID, type Currency } from '@/lib/dnd/currency';
import { nuggetsToNotes, nuggetsRemainder, NUGGETS_PER_NOTE } from '@/lib/dnd/stream-currency';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const coins = (): Currency[] => [
  { id: 'cp', name: 'Copper', amount: 5, rate: 1 },
  { id: 'gp', name: 'Gold', amount: 2, rate: 100 },
];

describe('readNotes — one answer for "how many notes do I have"', () => {
  it('prefers the flexible list when it has a notes currency', () => {
    const list: Currency[] = [...coins(), { id: 'notes', name: 'Notes', amount: 7, rate: 1 }];
    // Legacy says 99, the list says 7 — the list wins, because that is what the sheet renders.
    expect(readNotes(list, 99)).toBe(7);
  });

  it('matches a notes currency by NAME as well as id', () => {
    const list: Currency[] = [...coins(), { id: 'custom-1', name: 'notes', amount: 4, rate: 1 }];
    expect(readNotes(list, 0)).toBe(4);
  });

  it('falls back to legacy credits when there is no flexible list', () => {
    expect(readNotes(undefined, 12)).toBe(12);
  });

  it('falls back to legacy credits when the list has no notes entry', () => {
    expect(readNotes(coins(), 12)).toBe(12);
  });

  it('never reports negative or fractional notes', () => {
    expect(readNotes(undefined, -5)).toBe(0);
    expect(readNotes([{ id: 'notes', name: 'Notes', amount: 3.9, rate: 1 }], 0)).toBe(3);
  });
});

describe('writeNotes — puts money where the sheet reads it', () => {
  it('updates an existing notes currency in place', () => {
    const list: Currency[] = [...coins(), { id: 'notes', name: 'Notes', amount: 1, rate: 1 }];
    const next = writeNotes(list, 9)!;
    expect(findNotesCurrency(next)!.amount).toBe(9);
    expect(next).toHaveLength(list.length); // no duplicate entry
  });

  it('creates the notes currency at base rate when the list lacks one', () => {
    const next = writeNotes(coins(), 5)!;
    const n = findNotesCurrency(next)!;
    expect(n.id).toBe(NOTES_CURRENCY_ID);
    expect(n.amount).toBe(5);
    expect(n.rate).toBe(1); // notes ARE the base currency
  });

  it('leaves the other currencies untouched', () => {
    const next = writeNotes(coins(), 5)!;
    expect(next.find((c) => c.id === 'gp')!.amount).toBe(2);
  });

  it('returns null when the sheet has no flexible list, so the caller writes legacy', () => {
    expect(writeNotes(undefined, 5)).toBeNull();
  });
});

describe('conversion math', () => {
  it('converts at 10,000 NeoNuggets per note', () => {
    expect(NUGGETS_PER_NOTE).toBe(10_000);
    expect(nuggetsToNotes(25_000)).toBe(2);
    expect(nuggetsRemainder(25_000)).toBe(5_000);
  });

  it('refuses to pay out below one whole note', () => {
    expect(nuggetsToNotes(9_999)).toBe(0);
  });
});

describe('the convert route', () => {
  const src = read('app/api/dnd/characters/[id]/stream/convert/route.ts');

  it('writes through the shared notes helpers, not straight to legacy credits', () => {
    expect(src).toContain('writeNotes');
    expect(src).toContain('readNotes');
  });

  it('uses the streamer’s CURRENT stash from the live stream state', () => {
    expect(src).toContain("select('kibbles_earned')");
  });

  it('zeroes the stash after a payout, so nuggets go away until more arrive', () => {
    expect(src).toContain('kibbles_earned: 0');
  });

  it('reports the sub-note remainder rather than silently swallowing it', () => {
    // The whole stash is cashed; the leftover under one note must be surfaced, not vanish.
    expect(src).toContain('spentRemainder');
  });

  it('supports setting an exact note total manually', () => {
    expect(src).toContain('body.setNotes');
    expect(src).toContain("mode: 'set'");
  });

  it('keeps the legacy field in step so nothing reading the old shape goes stale', () => {
    expect(src).toContain('legacy.credits = total');
  });
});

describe('the streamer bar', () => {
  const src = read('app/dnd/_sheet/components/StreamOwnerControls.tsx');

  it('shows held notes via the shared reader, so it cannot disagree with the sheet', () => {
    expect(src).toContain('readNotes(char.currencies, char.currency?.credits)');
  });

  it('offers a manual notes input', () => {
    expect(src).toContain('setNotesManually');
    expect(src).toContain('setNotes:');
  });
});
