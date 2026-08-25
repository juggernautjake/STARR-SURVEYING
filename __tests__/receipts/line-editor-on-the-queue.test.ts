// __tests__/receipts/line-editor-on-the-queue.test.ts — P2.2a, and the two decisions inside it.
//
// The editor was never missing. `ReceiptLineItems` has done per-line business/personal marking,
// soft deletes with a reason, and hand-added lines since 2026-08-17 — mounted in ONE place, the
// slideshow. The approval queue rendered the same lines as a read-only table, so an approver who
// spotted a mis-read line had to open the receipt full-screen to fix it. P2.2a is the same swap the
// slideshow already made, on the screen where the decision is actually taken.
//
// Two things about that mounting are easy to undo by accident, so they are pinned here.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const QUEUE = fs.readFileSync(path.join(process.cwd(), 'app/admin/receipts/_tabs/QueueTab.tsx'), 'utf8');

/** Source with comments removed. Every assertion below is about CODE. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the approval queue edits the lines it is judging', () => {
  it('mounts the editor, not a read-only table', () => {
    const c = code(QUEUE);
    expect(c).toMatch(/import \{ ReceiptLineItems \} from '\.\.\/ReceiptLineItems';/);
    expect(c).toMatch(/<ReceiptLineItems\s/);
  });

  it('and does NOT hide it when the receipt has no lines', () => {
    // The old table was gated on `row.line_items.length > 0`, which is right for a table and wrong
    // for an editor. "The AI missed the items entirely" is the exact case the owner asked to be able
    // to repair by hand — *"we need to be able to add items too, just in case they do not show up
    // properly on the receipt, or the AI hallucinates"* — and an editor that hides itself when the
    // list is empty cannot be typed into. `ReceiptLineItems` draws its own empty state saying so.
    const c = code(QUEUE);
    expect(c).not.toMatch(/row\.line_items\.length\s*>\s*0/);
  });

  it('still says which number the Approve button acts on', () => {
    // The editor prints totals of its own — "counted as business", "not claimed" — a few lines above
    // Approve. That puts more than one number on the screen, and P2.2c is the open item that will
    // give approved-vs-deductible a single definition. Until then the screen has to answer the
    // question it now raises, or it repeats the `effectiveHours` defect: four files summing raw
    // hours while a fifth summed the approver's adjustment, disagreeing across the very decision
    // that created them.
    expect(QUEUE).toMatch(/what gets approved/i);
  });
});
