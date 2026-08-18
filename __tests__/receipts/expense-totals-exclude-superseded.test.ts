// __tests__/receipts/expense-totals-exclude-superseded.test.ts
//
// ── WHY THIS IS A SOURCE SCAN AND NOT A UNIT TEST ────────────────────────────────────────────────
//
// Seed 590 made `receipts` a table where some rows must not be summed: an itemised bill superseded
// by its card slip is the same purchase as the slip, and adding both doubles the meal.
//
// Owner, 2026-08-13: *"so that we don't count the purchase twice."*
//
// That is not a property of any one function — it is a property of every query that adds receipt
// money up, and there are eight of them across finance routes, reports and exports. A unit test can
// prove one of them right. Nothing stops the ninth from being written next month without the filter,
// and it would not fail anything: the total would just be quietly wrong, by exactly the amount of one
// meal, in a number nobody can check by eye.
//
// So this walks the source. Any query selecting a money column from `receipts` must either filter on
// `superseded_by_receipt_id` or be listed below with a reason it does not need to.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'lib', 'worker/src'];

/**
 * Queries that read receipt money and legitimately do NOT filter superseded rows.
 *
 * Each entry is a claim that summing is not what the query does. Adding to this list is allowed;
 * doing it without a reason is what the reason column is for.
 */
const EXEMPT: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'app/api/admin/receipts/route.ts',
    why: 'The bookkeeper queue. Lists rows one by one and must SHOW the superseded bill — its banner is how a person learns the pairing happened. It sums nothing.',
  },
  {
    file: 'app/api/admin/receipts/mine/route.ts',
    why: 'A submitter looking at their own receipts. Hiding the bill they photographed would read as a lost upload.',
  },
  {
    file: 'app/api/admin/receipts/export/route.ts',
    why: 'The accounting CSV deliberately keeps every row and adds a `superseded_by_receipt_id` COLUMN instead, so the accountant can see the pairing rather than wonder where a receipt went.',
  },
  {
    file: 'app/api/admin/receipts/[id]/route.ts',
    why: 'Single receipt by id. There is no total to get wrong.',
  },
  {
    file: 'app/api/admin/receipts/[id]/deep-read/route.ts',
    why:
      'Single receipt by id, read so the AI can re-analyse its photo. It sums nothing, and it must '
      + 'be able to reach a superseded row: the itemised bill of a pair is exactly the one somebody '
      + 'is most likely to want read properly, because it carries the line items the card slip does not.',
  },
  {
    file: 'app/api/admin/team/[email]/today/route.ts',
    why: 'A day view listing what somebody submitted, including the count of photos. Counting the bill is correct there — they did take that photo.',
  },
  {
    file: 'lib/receipts/extract.ts',
    why: 'The extractor itself, which is what WRITES the link. Filtering out superseded rows is done inline on the pairing query for a different reason (no chains).',
  },
  {
    file: 'lib/receipts/pair-sweep.ts',
    why: 'The sweep that writes the links. Its own query filters unpaired rows already.',
  },
  {
    file: 'worker/src/services/receipt-extraction.ts',
    why: 'The worker extractor. Reads one row back to merge its own answer into it.',
  },
  {
    file: 'app/api/admin/receipts/batch-review/route.ts',
    why: 'The phone review screen, fetching the rows you just photographed BY ID. It shows the pairing rather than hiding it — that banner is how the submitter learns both photos were kept.',
  },
  {
    file: 'lib/files/mounts.ts',
    why: 'The virtual filesystem listing receipt PHOTOS as files. `total_cents` is part of the filename, not a figure anybody adds up, and a missing file reads as data loss.',
  },
  {
    file: 'app/api/admin/equipment/promote-from-receipt/route.ts',
    why: 'Promotes one named receipt to a capital asset. Operates on an id, not a sum.',
  },
];

/** Money columns whose presence in a `.select()` means the query can produce a total. */
const MONEY = /\b(total_cents|subtotal_cents|tax_cents|tip_cents|customer_tip_cents|service_charge_cents)\b/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Comments are removed before anything else, and both directions of that matter.
 *
 * A comment can end a chain early — the first draft of this scan cut the `overview` query in half at
 * a semicolon inside the sentence explaining the filter, and reported the filter missing while it sat
 * two lines below. And a comment can end it late, in the worse direction: a line MENTIONING
 * `superseded_by_receipt_id` would satisfy the check on a query that does not filter at all.
 *
 * A scan that reads prose is a scan that can be argued with.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every `.from('receipts')` chain, as the text from `.from(` up to the end of the statement. */
function receiptQueries(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const out: string[] = [];
  const re = /\.from\(\s*['"]receipts['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // A chain ends at the first `;` — long enough to include every filter, short enough not to
    // swallow the next query's.
    const end = src.indexOf(';', m.index);
    out.push(src.slice(m.index, end === -1 ? src.length : end));
  }
  return out;
}

describe('no receipt total counts the same purchase twice', () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = file.split(path.sep).join('/');
      if (EXEMPT.some((e) => e.file === rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes(".from('receipts')")) continue;

      for (const q of receiptQueries(src)) {
        // Only SELECTs that pull money can produce a total. A write cannot — and a write's trailing
        // `.select(…)` is a RETURNING clause naming the row it just changed, not a query over rows.
        if (/\.(update|insert|upsert|delete)\(/.test(q)) continue;
        if (!/\.select\(/.test(q)) continue;
        if (!MONEY.test(q) && !/\.select\(\s*['"]\*['"]\s*\)/.test(q)) continue;
        // BOTH exclusions, because they answer different questions and a query with one and not the
        // other is wrong in a way that looks handled: seed 590 keeps one purchase from being counted
        // twice, seed 591 keeps somebody's own groceries out of the firm's books.
        const missing = [
          /superseded_by_receipt_id/.test(q) ? null : 'superseded_by_receipt_id',
          /expense_nature/.test(q) ? null : 'expense_nature',
        ].filter(Boolean);
        if (missing.length === 0) continue;
        offenders.push(`${rel} [missing ${missing.join(' + ')}]: ${q.slice(0, 100).replace(/\s+/g, ' ')}`);
      }
    }
  }

  it('every query that can sum receipt money excludes superseded rows', () => {
    // If this fails on a query you have just written: either add
    // `.is('superseded_by_receipt_id', null)`, or add the file to EXEMPT with the reason summing is
    // not what it does. Silence is the only wrong answer.
    expect(offenders).toEqual([]);
  });

  it('actually inspects the queries, rather than passing because it found none', () => {
    // The failure mode this whole file exists to prevent, applied to itself: a scan whose regex
    // stops matching reports a clean codebase. There are eight-odd receipt-money queries; if this
    // ever sees fewer than five, the scan is broken, not the code.
    let seen = 0;
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = fs.readFileSync(file, 'utf8');
        if (!src.includes(".from('receipts')")) continue;
        seen += receiptQueries(src).filter((q) => /\.select\(/.test(q) && MONEY.test(q)).length;
      }
    }
    expect(seen).toBeGreaterThanOrEqual(5);
  });

  it('names a reason for every exemption', () => {
    for (const e of EXEMPT) {
      expect(e.why.length, `${e.file} needs a reason`).toBeGreaterThan(40);
    }
  });
});
