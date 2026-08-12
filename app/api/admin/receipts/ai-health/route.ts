// app/api/admin/receipts/ai-health/route.ts — "is the receipt AI actually running?"
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
//
// Owner, 2026-08-12: *"Whenever I upload a receipt, it shows that it is Waiting on the bookkeeper. I
// think it is not actually reviewing the receipts."* He was right, and the reason nobody could tell is
// that **every path fails silently when the deployment cannot run the AI**:
//
//   * `extractReceipt` THROWS when `ANTHROPIC_API_KEY` is unset — and it throws *before* claiming the
//     row, so the receipt is left `queued` with no `extraction_error` on it. Nothing on the row says
//     anything went wrong.
//   * The capture page fires that request as `void fetch(...).catch(() => {})`, so the resulting 500
//     is swallowed by design (the cron is meant to be the safety net).
//   * The cron sweep returns `200 {skipped: true}` when the key is missing, because a missing key is a
//     deployment fact rather than a runtime fault — reasonable in isolation, and it means the safety
//     net is silent too.
//
// Three defensible local decisions that add up to a system which cannot tell you it is switched off.
// Ten receipts sat `queued` for a day while the queue cheerfully rendered "AI working…".
//
// ── WHAT THIS REPORTS, AND WHY EACH FIELD IS HERE ────────────────────────────────────────────────
//
// It answers the question in the product instead of requiring a look at the Vercel dashboard, and it
// distinguishes the two failures that look identical from the outside:
//
//   * **key missing** → nothing was ever attempted; rows stay `queued` with no error.
//   * **key present but rejected** (revoked, out of credit, wrong project) → the call IS made, the API
//     answers with an error, and `markFailed` records it as `extraction_status = 'failed'` with the
//     message. So a billing problem shows up as FAILED rows, never as queued ones.
//
// That distinction is the diagnostic: a pile of `queued` means the trigger never fired; a pile of
// `failed` means it fired and the API said no.
//
// Only presence is reported, never the key itself.
import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { VISION_MODEL } from '@/worker/src/services/receipt-extraction-core';

/** A receipt still queued after this long was not picked up by anything. The capture page kicks
 *  immediately and the cron runs hourly, so ten minutes is comfortably past "just uploaded" while
 *  still catching a broken deployment on the same day rather than the next. */
const STUCK_AFTER_MINUTES = 10;

export interface ReceiptAiHealth {
  /** Can this deployment call the model at all? */
  canRun: boolean;
  /** Presence only — never the value. */
  apiKeyPresent: boolean;
  /** The hourly sweep needs this too; without it the safety net 500s. */
  cronSecretPresent: boolean;
  queued: number;
  /** Queued longer than STUCK_AFTER_MINUTES — the number that means "nothing is running". */
  stuck: number;
  /** Minutes since the oldest queued receipt arrived, or null when none are waiting. */
  oldestQueuedMinutes: number | null;
  /** Extraction ran and the model (or the fetch) said no. A credit problem lands here, not in `stuck`. */
  failed: number;
  /** The most recent failure message, so a billing or key error is readable without opening a row. */
  lastError: string | null;
  /** One sentence for a banner. Null when there is nothing to say. */
  message: string | null;
  /**
   * Only set when called with `?probe=1`: the result of actually calling the model with a one-token
   * request. `null` means no probe was run.
   *
   * Presence is not the same as working, and the difference is invisible from the outside: a revoked
   * key, a key from the wrong workspace and a key with no credit are all "present". This is the only
   * check that distinguishes them, which is why it exists — but it costs a fraction of a cent and a
   * round trip, so it is opt-in rather than running on every page load.
   */
  probe: { ok: boolean; status: number; error: string | null } | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Bookkeeper-level information: it names failure messages that can include vendor detail.
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKeyPresent = Boolean(process.env.ANTHROPIC_API_KEY);
  const cronSecretPresent = Boolean(process.env.CRON_SECRET);
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000).toISOString();

  const [queuedRes, stuckRes, failedRes, lastErrRes] = await Promise.all([
    supabaseAdmin.from('receipts').select('id', { count: 'exact', head: true })
      .eq('extraction_status', 'queued').is('deleted_at', null),
    supabaseAdmin.from('receipts').select('created_at')
      .eq('extraction_status', 'queued').is('deleted_at', null)
      .lt('created_at', cutoff).order('created_at', { ascending: true }),
    supabaseAdmin.from('receipts').select('id', { count: 'exact', head: true })
      .eq('extraction_status', 'failed').is('deleted_at', null),
    supabaseAdmin.from('receipts').select('extraction_error')
      .eq('extraction_status', 'failed').is('deleted_at', null)
      .not('extraction_error', 'is', null)
      .order('updated_at', { ascending: false }).limit(1),
  ]);

  const stuckRows = stuckRes.data ?? [];
  const oldest = stuckRows[0]?.created_at as string | undefined;
  const oldestQueuedMinutes = oldest
    ? Math.floor((Date.now() - new Date(oldest).getTime()) / 60_000)
    : null;

  const queued = queuedRes.count ?? 0;
  const failed = failedRes.count ?? 0;
  const lastError = (lastErrRes.data?.[0]?.extraction_error as string | undefined) ?? null;

  // Ordered by what the reader should do about it, not by severity in the abstract.
  let message: string | null = null;
  if (!apiKeyPresent) {
    message =
      'The receipt AI is switched off on this deployment: ANTHROPIC_API_KEY is not set. '
      + 'Receipts are still being saved with their photos — nothing is lost — but nothing is reading '
      + 'them. Set the key in the Vercel project settings and redeploy; the hourly sweep will then '
      + 'pick up everything waiting.';
  } else if (stuckRows.length > 0) {
    message =
      `${stuckRows.length} receipt${stuckRows.length === 1 ? ' has' : 's have'} been waiting more than `
      + `${STUCK_AFTER_MINUTES} minutes without being read. The key is present, so the extraction is `
      + 'not being triggered — check that the hourly cron is running on this deployment. "Run AI" on a '
      + 'row will read it now.';
  } else if (failed > 0 && lastError) {
    message = `${failed} receipt${failed === 1 ? '' : 's'} failed to extract. Most recent reason: ${lastError}`;
  }

  // The live probe. Deliberately the cheapest possible call — one token, no image — because its only
  // job is to make the API answer "I accept this key" or say why not.
  let probe: ReceiptAiHealth['probe'] = null;
  if (new URL(req.url).searchParams.get('probe') === '1' && apiKeyPresent) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: VISION_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      });
      // A 400 for max_tokens/stop reasons still proves the key was ACCEPTED; only auth and billing
      // statuses mean the key itself is the problem. Reporting the raw status lets a reader tell
      // 401 (revoked) from 429 (rate limited) from 400 (fine, just a tiny request).
      const text = r.ok ? null : (await r.text().catch(() => '')).slice(0, 300);
      probe = { ok: r.ok || r.status === 400, status: r.status, error: text };
    } catch (e) {
      probe = { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const body: ReceiptAiHealth = {
    canRun: apiKeyPresent,
    apiKeyPresent,
    cronSecretPresent,
    queued,
    stuck: stuckRows.length,
    oldestQueuedMinutes,
    failed,
    lastError,
    message,
    probe,
  };
  return NextResponse.json(body);
}, { routeName: 'receipts/ai-health' });
