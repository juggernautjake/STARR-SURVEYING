// worker/src/infra/receipt-poller.ts — the dedicated AI server draining the receipt queue.
//
// Owner, 2026-08-13: *"The AI analysis should begin immediately on each new captured receipt… and if
// the browser/app is closed, then it should still run in the background on the server or on our
// dedicated AI server, the same one we use for research purposes."*
//
// ── WHY A POLLER AND NOT A PUSH FROM THE UPLOAD ─────────────────────────────────────────────────
//
// The capture page already fires an extraction per receipt the moment its upload lands, and that is
// the fast path — it is the same request cycle, so the answer is usually on the row before the user
// has finished looking at the photo. What it cannot survive is the browser closing between the
// upload and the kick, or a phone dropping off Wi-Fi mid-batch.
//
// The obvious repair is for the upload route to notify this worker instead. That couples every
// upload to this box being reachable: when it is not, each upload pays a timeout, and the capture
// page's whole point is rapid-fire photography. A poller costs nothing when the queue is empty, has
// no failure mode that reaches the person taking photographs, and drains a backlog that arrived by
// ANY route — including receipts inserted by the mobile app, which never had a browser to fire from.
//
// ── OFF UNLESS ASKED FOR ────────────────────────────────────────────────────────────────────────
//
// Two processes draining the same queue is safe — the claim in `receipt-extraction.ts` is a
// compare-and-set and the loser simply moves on — but it is still money being spent unattended, and
// the research poller beside this one sets the precedent: outward-facing scheduled work is a
// deployment decision, not a code one. So `RECEIPT_EXTRACTION_POLLER=1` must be set, and the gate
// says which piece is missing rather than failing quietly.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReceiptPollerGate {
  enabled: boolean;
  reason: string;
}

/**
 * Is this worker allowed to extract receipts on its own?
 *
 * A function, not a boolean, so the boot log can distinguish "nobody asked for this" from "somebody
 * asked and the key is missing" — the second is a misconfiguration that should be heard about, and
 * polling every tick into a guaranteed failure is worse than not polling.
 */
export function receiptPollerEnabled(env: NodeJS.ProcessEnv = process.env): ReceiptPollerGate {
  if (env.RECEIPT_EXTRACTION_POLLER !== '1') {
    return {
      enabled: false,
      reason:
        'RECEIPT_EXTRACTION_POLLER is not set to 1 — this worker will not extract receipts. '
        + 'Queued receipts are still picked up by the capture page and the Vercel cron.',
    };
  }
  if (!env.ANTHROPIC_API_KEY) {
    return {
      enabled: false,
      reason:
        'RECEIPT_EXTRACTION_POLLER=1 but ANTHROPIC_API_KEY is not set — every tick would throw '
        + 'before reading a photo. Refusing to poll rather than logging the same failure forever.',
    };
  }
  return { enabled: true, reason: 'Draining the receipt extraction queue.' };
}

/** How many receipts one tick may extract. Small on purpose: a tick that runs for minutes delays
 *  the shutdown drain, and `startPoller` immediately schedules another tick when one did work, so a
 *  backlog is handled by many short ticks rather than one long one. */
export const RECEIPT_TICK_BATCH = 5;

export interface ReceiptTickDeps {
  /** Injected so a test does not need a database or an API key. */
  process: (batchSize: number) => Promise<Array<{ status: string }>>;
  log?: (msg: string) => void;
}

/**
 * One tick: extract up to `RECEIPT_TICK_BATCH` receipts, and report how many were actually taken.
 *
 * The return value is what drives `startPoller`'s backoff, and it counts rows this tick CLAIMED —
 * not rows that succeeded. A receipt whose photo is unreadable comes back `failed`, which is work
 * done and a reason to look again immediately; treating it as "nothing started" would make a queue
 * full of bad photos back off to a two-minute idle while it still had rows to get through.
 *
 * Never throws. `startPoller` treats a throw as an error tick and backs off hard, which is right for
 * an outage and wrong for one corrupt row — and `processQueuedReceipts` already records per-row
 * failures on the row itself.
 */
export function makeReceiptTick(deps: ReceiptTickDeps): () => Promise<number> {
  const log = deps.log ?? (() => {});
  return async () => {
    try {
      const results = await deps.process(RECEIPT_TICK_BATCH);
      const done = results.filter((r) => r.status === 'done').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      if (results.length > 0) {
        log(`[receipt-poller] ${done} extracted, ${failed} failed of ${results.length} claimed`);
      }
      return results.length;
    } catch (err) {
      log(`[receipt-poller] tick failed: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  };
}

/** Convenience wiring for the real thing: the worker's own extractor over its Supabase client. */
export function makeSupabaseReceiptTick(
  supabase: SupabaseClient,
  log: (msg: string) => void,
): () => Promise<number> {
  return makeReceiptTick({
    log,
    process: async (batchSize) => {
      const { processQueuedReceipts } = await import('../services/receipt-extraction.js');
      return processQueuedReceipts(supabase, { batchSize });
    },
  });
}
