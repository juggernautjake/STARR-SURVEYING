// FINANCE_TAX_AND_INTAKE Slice F4 — the bulk queue is actually reachable.
//
// `receipt-batch.ts` is pure and well covered on its own, and that is exactly the shape this repo
// most often ships without a caller. These assertions are about the page: that the queue is wired to
// a real picker, a real button, and the existing per-receipt endpoint.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(process.cwd(), 'app/admin/receipts/new/page.tsx'), 'utf8');

/** Asserted against the RAW source, deliberately — comment-stripping was tried twice and broke both
 *  times, in opposite directions:
 *
 *   * removing block comments first treats the `image/*` in a `//` header comment as an opening
 *     delimiter, and everything up to the next genuine close — including every import — disappears;
 *   * removing `*`-prefixed lines first orphans the `/**` opener of a multi-line JSDoc, whose regex
 *     then swallows the function underneath it.
 *
 *  Both times the checker accused working code, which is the most misleading direction a checker can
 *  fail in. Since the risk of reading the raw file is the opposite one — a mention inside a comment
 *  satisfying a check — every assertion below is written in a CALL shape (`await runBatch(`, a full
 *  statement, an attribute) that prose in this file does not contain. */
const code = src;

describe('bulk capture is reachable from the page', () => {
  it('imports and calls the queue rather than re-implementing it', () => {
    expect(code).toContain("from '@/lib/finance/receipt-batch'");
    expect(code).toContain('await runBatch(');
    expect(code).toContain('buildBatch(batchFiles)');
  });

  it('offers a multi-file picker', () => {
    expect(code).toMatch(/multiple/);
    expect(code).toContain('onPickBulk');
  });

  it('has a button that starts the batch', () => {
    expect(code).toContain('onUploadBatch');
    expect(code).toMatch(/bulkRef\.current\?\.click\(\)/);
  });

  it('reuses the existing per-receipt endpoint', () => {
    // The extraction pipeline is per-receipt and unchanged, so a bulk upload must produce exactly
    // the rows a one-at-a-time upload does. A separate bulk endpoint would be a second path for the
    // worker to disagree with.
    const fn = code.slice(code.indexOf('async function onUploadBatch'));
    const body = fn.slice(0, fn.indexOf('async function onUpload('));
    expect(body).toContain('/api/admin/receipts/upload');
  });
});

describe('the batch keeps its failures on screen', () => {
  it('only navigates away when everything succeeded', () => {
    // Leaving on a partial batch hides exactly the rows that need a person, which is the failure
    // this whole slice exists to prevent.
    expect(code).toMatch(/if \(result\.allSucceeded\) router\.push/);
  });

  it('renders a per-item status list', () => {
    expect(code).toContain('batchSummary(batch)');
    expect(code).toMatch(/batch\.items\.map/);
  });

  it('does not re-run a finished batch', () => {
    // Re-uploading would duplicate every receipt that already landed.
    expect(code).toContain('bulkDone');
  });
});
