// __tests__/receipts/capture-queue.test.ts
//
// The rapid-fire queue's logic, tested without a camera.
//
// The judgement being pinned here is the threshold. A missed duplicate costs one extra row in a
// queue somebody is already reviewing. A FALSE duplicate tells a person that two different receipts
// are the same, and the obvious response to that is to delete one — so the tests below care more
// about "two different receipts are not called the same" than about catching every repeat.
import { describe, it, expect } from 'vitest';
import {
  averageHash, hammingDistance, findLikelyDuplicates, missingInformation, describeReview,
  DUPLICATE_BIT_THRESHOLD, type QueuedShot,
} from '@/lib/receipts/capture-queue';

/** An 8×8 frame as 64 grey levels. `pattern` is 64 characters: '#' dark, '.' light. */
const frame = (pattern: string): number[] =>
  pattern.replace(/\s/g, '').split('').map((c) => (c === '#' ? 20 : 235));

const RECEIPT_A = frame(`
  ........
  ..####..
  ..#..#..
  ..####..
  ..#.....
  ..#.....
  ........
  ........
`);

/** The same slip, one shot later: a single cell of noise from the hand moving. */
const RECEIPT_A_AGAIN = frame(`
  ........
  ..####..
  ..#..#..
  ..####..
  ..#..#..
  ..#.....
  ........
  ........
`);

const RECEIPT_B = frame(`
  ########
  #......#
  #.####.#
  #.#..#.#
  #.####.#
  #......#
  ########
  ........
`);

const shot = (id: string, luma: number[], takenAt = 0): QueuedShot => ({
  id, fileName: `${id}.jpg`, hash: averageHash(luma), bytes: 100_000, takenAt,
});

describe('the average hash', () => {
  it('produces sixteen hex characters', () => {
    const h = averageHash(RECEIPT_A);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('refuses a frame that is not 8×8', () => {
    expect(averageHash([1, 2, 3])).toBeNull();
  });

  it('ignores overall brightness', () => {
    // The same receipt in a dark truck cab and on a bright table must hash the same — every bit
    // compares against the picture's OWN mean. A hash that moved with the lighting would report a
    // second photo of the same slip as a different receipt.
    const dim = RECEIPT_A.map((v) => Math.round(v * 0.4));
    expect(averageHash(dim)).toBe(averageHash(RECEIPT_A));
  });

  it('is not a checksum — near-identical frames give near-identical hashes', () => {
    // The whole premise. A cryptographic hash of these two shares nothing.
    const d = hammingDistance(averageHash(RECEIPT_A)!, averageHash(RECEIPT_A_AGAIN)!);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(DUPLICATE_BIT_THRESHOLD);
  });

  it('separates two different receipts by far more than the threshold', () => {
    const d = hammingDistance(averageHash(RECEIPT_A)!, averageHash(RECEIPT_B)!);
    expect(d).toBeGreaterThan(DUPLICATE_BIT_THRESHOLD);
  });
});

describe('finding repeats in the queue', () => {
  it('says nothing when every photo is a different receipt', () => {
    expect(findLikelyDuplicates([shot('a', RECEIPT_A), shot('b', RECEIPT_B)])).toEqual([]);
  });

  it('flags the second shot of the same slip, pointing at the first', () => {
    const pairs = findLikelyDuplicates([shot('a', RECEIPT_A), shot('b', RECEIPT_A_AGAIN)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].id).toBe('b');
    expect(pairs[0].duplicateOfId).toBe('a');
  });

  it('points three shots of one receipt at the original rather than chaining them', () => {
    // A chain would tell somebody who removed the original that the survivors duplicate a photo
    // that is no longer in the queue.
    const pairs = findLikelyDuplicates([
      shot('a', RECEIPT_A), shot('b', RECEIPT_A_AGAIN), shot('c', RECEIPT_A),
    ]);
    expect(pairs.map((p) => p.duplicateOfId)).toEqual(['a', 'a']);
  });

  it('never reports a shot as a duplicate of itself', () => {
    expect(findLikelyDuplicates([shot('a', RECEIPT_A)])).toEqual([]);
  });

  it('skips shots that could not be hashed instead of guessing about them', () => {
    const unhashed: QueuedShot = { id: 'x', fileName: 'x.jpg', hash: null, bytes: 1, takenAt: 0 };
    expect(findLikelyDuplicates([unhashed, shot('a', RECEIPT_A), { ...unhashed, id: 'y' }])).toEqual([]);
  });
});

describe('what the AI still needs asked', () => {
  const done = { extraction_status: 'done' };

  it('asks nothing about a receipt it read completely', () => {
    expect(missingInformation({
      ...done, vendor_name: 'Buc-ee’s', transaction_at: '2026-08-11', total_cents: 4210, category: 'fuel',
    })).toEqual([]);
  });

  it('asks about each field it could not read, as a question a person can answer', () => {
    const asks = missingInformation({ ...done, vendor_name: null, total_cents: null });
    expect(asks.some((a) => /shop or supplier/i.test(a))).toBe(true);
    expect(asks.some((a) => /total/i.test(a))).toBe(true);
    // Phrased for a human holding the paper, not as a column name.
    expect(asks.join(' ')).not.toMatch(/vendor_name|total_cents/);
  });

  it('does not treat a total of zero as missing', () => {
    // A $0.00 receipt is rare and real (a comped meal, a warranty replacement). `!total_cents` would
    // call it illegible and send somebody back to a photo that says exactly what it says.
    const asks = missingInformation({
      ...done, vendor_name: 'Shop', transaction_at: '2026-08-11', total_cents: 0, category: 'supplies',
    });
    expect(asks).toEqual([]);
  });

  it('says one thing, not four, when the photo could not be read at all', () => {
    const asks = missingInformation({ extraction_status: 'failed' });
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatch(/retake/i);
  });

  it('stays quiet while the AI is still reading', () => {
    // "What was the total?" on a receipt that has been queued for eight seconds is a question about
    // nothing, and answering it by hand wastes the extraction that is about to arrive.
    expect(missingInformation({ extraction_status: 'queued', vendor_name: null })).toEqual([]);
    expect(missingInformation({ extraction_status: 'running', total_cents: null })).toEqual([]);
  });
});

describe('the sentence shown above the review grid', () => {
  it('invites more photos when the queue is empty', () => {
    expect(describeReview([], [])).toMatch(/camera stays open/i);
  });

  it('counts a clean queue', () => {
    expect(describeReview([shot('a', RECEIPT_A), shot('b', RECEIPT_B)], [])).toBe('2 photos ready to send.');
  });

  it('never claims anything was removed', () => {
    // Nothing is removed — two $5 coffees on the same day are both real. Saying otherwise would be a
    // claim about an action nobody took.
    const shots = [shot('a', RECEIPT_A), shot('b', RECEIPT_A_AGAIN)];
    const line = describeReview(shots, findLikelyDuplicates(shots));
    expect(line).toMatch(/looks like a repeat/i);
    expect(line).not.toMatch(/removed|deleted|discarded/i);
  });
});
