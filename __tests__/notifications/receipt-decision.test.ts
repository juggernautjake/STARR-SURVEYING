// __tests__/notifications/receipt-decision.test.ts
//
// The pure receipt-decision notification builder.
//
// ── WHY THIS FILE WAS REWRITTEN (2026-08-12) ─────────────────────────────────────────────────────
//
// Every test here used to pass `submitted_by`, `vendor` and `total`. **No such columns exist on
// `receipts`** — the real ones are `user_id` (an auth.users UUID), `vendor_name` and `total_cents`.
// So the suite was green against a fiction, while both call sites cast their query results to the
// same fictional shape and fed the builder `undefined` for every field. It returned null on the
// missing submitter, `if (notice)` swallowed the null, and **every receipt approval and rejection
// notified nobody, silently, for as long as the feature existed.**
//
// The lesson is in the last test below: a pure builder's tests prove the FUNCTION works. They prove
// nothing about whether the fields it names exist, and a `as Record<string, unknown>` cast at the
// call site is enough to keep the compiler quiet about the gap.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildReceiptDecisionNotification,
  type ReceiptRow,
} from '@/lib/notifications/receipt-decision';

const RECEIPT: ReceiptRow = {
  user_email: 'a@x.com',
  vendor_name: 'Home Depot',
  total_cents: 4250,
};

describe('buildReceiptDecisionNotification', () => {
  it('builds an approval notice with amount + vendor', () => {
    const n = buildReceiptDecisionNotification(RECEIPT, 'approved')!;
    expect(n).toMatchObject({
      user_email: 'a@x.com',
      type: 'approval',
      icon: '✅',
      link: '/admin/receipts',
      source_type: 'receipt_decision',
    });
    expect(n.title).toContain('Approved');
    expect(n.body).toBe('Your $42.50 receipt from Home Depot was approved.');
  });

  it('reads the total as CENTS, which is how the column stores it', () => {
    // The previous version took dollars. Had it ever received a real value it would have announced
    // a $42.50 receipt as "$4250.00" — a 100× error in a message sent to the person who spent it.
    expect(buildReceiptDecisionNotification({ ...RECEIPT, total_cents: 4250 }, 'approved')!.body)
      .toContain('$42.50');
    expect(buildReceiptDecisionNotification({ ...RECEIPT, total_cents: 100 }, 'approved')!.body)
      .toContain('$1.00');
  });

  it('builds a rejection notice with the reason appended', () => {
    const n = buildReceiptDecisionNotification(
      { ...RECEIPT, rejected_reason: 'Missing itemized total' },
      'rejected',
    )!;
    expect(n.icon).toBe('❌');
    expect(n.title).toContain('Rejected');
    expect(n.body).toContain('was rejected.');
    expect(n.body).toContain('Reason: Missing itemized total');
  });

  it('omits the amount and vendor gracefully when missing', () => {
    const n = buildReceiptDecisionNotification(
      { user_email: 'a@x.com', vendor_name: null, total_cents: null },
      'approved',
    )!;
    expect(n.body).toBe('Your receipt was approved.');
  });

  it('coerces a string total to a formatted amount', () => {
    // PostgREST returns NUMERIC as a string in some shapes.
    const n = buildReceiptDecisionNotification(
      { user_email: 'a@x.com', vendor_name: 'Lowe', total_cents: '1990' },
      'approved',
    )!;
    expect(n.body).toContain('$19.90');
  });

  it('returns null when there is nobody to tell', () => {
    expect(buildReceiptDecisionNotification({ ...RECEIPT, user_email: null }, 'approved')).toBeNull();
    expect(buildReceiptDecisionNotification({ ...RECEIPT, user_email: ' ' }, 'rejected')).toBeNull();
  });
});

// ── The guard that would have caught the original bug ────────────────────────────────────────────
//
// A pure builder cannot know whether its fields exist in the database. This checks the one thing the
// unit tests structurally cannot: that the routes feeding it ask the table for columns the table has.
describe('the routes ask for columns that exist', () => {
  const ROOT = path.join(__dirname, '..', '..');
  /** CODE only. The fix for this bug is documented in comments that necessarily NAME the phantom
   *  columns, so an assertion over the raw file matches its own explanation and fails on correct
   *  code. Stripping comments first is the difference between a check and a word search. */
  const read = (p: string) =>
    fs.readFileSync(path.join(ROOT, p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

  /**
   * Columns `receipts` does NOT have, each of which was read in production code until 2026-08-12.
   *
   * Word-boundary regexes, not substrings: `'r.vendor'` as a substring also matches the CORRECT
   * `r.vendor_name`, so the first version of this test failed on the very code that fixes the bug.
   */
  const PHANTOM = [
    /\bsubmitted_by\b/,
    /\bvendor\b(?!_name)/,
    /\btotal\b(?!_cents)/,
  ];

  it('the bulk-approve route selects real receipt columns', () => {
    const src = read('app/api/admin/receipts/bulk-approve/route.ts');
    expect(src, 'the RETURNING clause must name real columns or the UPDATE never runs').toContain('user_id, vendor_name, total_cents');
    expect(src).not.toContain('submitted_by');
  });

  it('the single-receipt route does not read phantom columns', () => {
    const src = read('app/api/admin/receipts/[id]/route.ts');
    expect(src).not.toContain('submitted_by');
    // The cast that hid the original bug from the compiler.
    expect(src, 'do not cast the row to Record<string, unknown> to read fields off it')
      .not.toMatch(/as Record<string, unknown>\)\.(submitted_by|vendor|total)/);
  });

  it('neither route uses the schema words that do not exist', () => {
    for (const file of ['app/api/admin/receipts/bulk-approve/route.ts', 'app/api/admin/receipts/[id]/route.ts']) {
      const src = read(file);
      for (const phantom of PHANTOM) {
        expect(phantom.test(src), `${file} still reads a column matching ${phantom}`).toBe(false);
      }
    }
  });
});
