// __tests__/receipts/worker-receipt-poller.test.ts
//
// Owner, 2026-08-13: *"if the browser/app is closed, then it should still run in the background on
// the server or on our dedicated AI server, the same one we use for research purposes."*
//
// The capture page fires an extraction as each upload lands, and that is the fast path — but it dies
// with the tab. This is the loop on the research droplet that does not care whether a browser is
// open, and it is what covers receipts inserted by the mobile app, which never had one.
//
// It reuses `startPoller`, the research queue's driver, so overlap protection, throw-safety and
// idle backoff are not reimplemented here. What IS this module's own is the gate and the tick, and
// each has a way of being quietly wrong that these tests pin.

import { describe, it, expect, vi } from 'vitest';
import {
  receiptPollerEnabled,
  makeReceiptTick,
  RECEIPT_TICK_BATCH,
} from '@/worker/src/infra/receipt-poller';

describe('the gate', () => {
  it('is off unless somebody asked for it', () => {
    // Money spent unattended is a deployment decision, not a code one — the same rule the research
    // poller beside it follows.
    const gate = receiptPollerEnabled({} as unknown as NodeJS.ProcessEnv);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toMatch(/RECEIPT_EXTRACTION_POLLER/);
  });

  it('refuses when asked for but unable, and says which piece is missing', () => {
    // "Nobody asked" and "asked, and the key is absent" are different problems. Polling every tick
    // into a guaranteed throw is worse than not polling: it is noise that hides its own cause.
    const gate = receiptPollerEnabled({ RECEIPT_EXTRACTION_POLLER: '1' } as unknown as NodeJS.ProcessEnv);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('runs when it is switched on and able', () => {
    const gate = receiptPollerEnabled({
      RECEIPT_EXTRACTION_POLLER: '1', ANTHROPIC_API_KEY: 'sk-test',
    } as unknown as NodeJS.ProcessEnv);
    expect(gate.enabled).toBe(true);
  });

  it('says plainly that receipts are still handled when it is off', () => {
    // The reason line is read by somebody wondering why the box is idle. "Not polling" alone would
    // send them looking for a backlog that the capture page and the cron are already draining.
    const gate = receiptPollerEnabled({} as unknown as NodeJS.ProcessEnv);
    expect(gate.reason).toMatch(/capture page and the Vercel cron/i);
  });
});

describe('one tick', () => {
  it('reports rows CLAIMED, not rows that succeeded', () => {
    // This number drives `startPoller`'s backoff. Counting only successes would make a queue full of
    // unreadable photos look empty, and the poller would back off to its idle interval while it
    // still had rows to work through — the exact stall this loop exists to prevent.
    const tick = makeReceiptTick({
      process: async () => [{ status: 'done' }, { status: 'failed' }, { status: 'failed' }],
    });
    return expect(tick()).resolves.toBe(3);
  });

  it('returns 0 on an empty queue so the poller backs off', async () => {
    const tick = makeReceiptTick({ process: async () => [] });
    await expect(tick()).resolves.toBe(0);
  });

  it('never throws — a bad row must not kill the loop', async () => {
    // `startPoller` treats a throw as an error tick and backs off hard. Correct for an outage,
    // wrong for one corrupt receipt, and per-row failures are already recorded on the row.
    const log = vi.fn();
    const tick = makeReceiptTick({ process: async () => { throw new Error('boom'); }, log });
    await expect(tick()).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('takes a small bite, so a backlog is many short ticks rather than one long one', () => {
    // A tick that runs for minutes delays the shutdown drain, and the poller schedules another
    // immediately whenever one did work — so small batches cost nothing and stop better.
    expect(RECEIPT_TICK_BATCH).toBeGreaterThan(0);
    expect(RECEIPT_TICK_BATCH).toBeLessThanOrEqual(10);
  });

  it('passes the batch size through to the extractor', async () => {
    const seen: number[] = [];
    const tick = makeReceiptTick({ process: async (n) => { seen.push(n); return []; } });
    await tick();
    expect(seen).toEqual([RECEIPT_TICK_BATCH]);
  });
});
