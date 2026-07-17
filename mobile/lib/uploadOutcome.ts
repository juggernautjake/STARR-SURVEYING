// mobile/lib/uploadOutcome.ts — the PURE "what happens after an upload finishes" plan. It is the
// counterpart to drainDecision.nextDrainStep (the "what to upload next" brain): once a file's upload
// resolves, this composes the notification (uploadNotify), the local-file retention decision
// (uploadRetention — only on a CONFIRMED success), and whether to auto-advance to the next file
// (uploadMode.shouldAutoAdvance) into a single plan the runtime executes. Together the two functions ARE
// the drain loop's logic; the runtime just does the I/O (fetch, DB write, fire notification, delete file).

import { uploadNotification, type UploadNotification, type UploadNotifyLevel } from './uploadNotify';
import { retentionAfterUpload, type RetentionAction, type RetentionPref } from './uploadRetention';
import { shouldAutoAdvance, type UploadMode } from './uploadMode';

export type UploadResult =
  | { ok: true; name: string; remaining: number } // uploaded + confirmed; `remaining` still queued
  | { ok: false; name: string; canRetry: boolean }; // gave up

/**
 * Classify a Supabase Storage upload result: does the SERVER HAVE THE FILE ('uploaded' → the local copy
 * is safe to delete) or must the attempt be retried ('retry' → the local file MUST be preserved)? This is
 * the single most safety-critical branch in the queue — misjudging it deletes a surveyor's capture. Two
 * rules, each safety-critical in one direction:
 *   • a "duplicate / already exists" error means a PRIOR session's upload landed but we never saw the
 *     response — the server HAS it, so treat it as uploaded (otherwise the row retries forever); and
 *   • ANY OTHER error is transient → 'retry', NEVER 'uploaded' (otherwise the queue deletes a file the
 *     server never received).
 * A missing error message is a clean success. Pure + case-insensitive.
 */
export type UploadDeliveryOutcome = 'uploaded' | 'retry';
export function classifyUploadOutcome(errorMessage: string | null | undefined): UploadDeliveryOutcome {
  if (!errorMessage) return 'uploaded';
  const lower = errorMessage.toLowerCase();
  if (lower.includes('duplicate') || lower.includes('already exists')) return 'uploaded';
  return 'retry';
}

export interface PostUploadPlan {
  /** The local notification to fire (or null at this verbosity). */
  notification: UploadNotification | null;
  /** What to do with the local media — present ONLY on a confirmed success, else null. */
  retention: RetentionAction | null;
  /** Whether the drainer should immediately pull the next file (automatic mode + more work). */
  advance: boolean;
  /** True when this success emptied the queue. */
  queueComplete: boolean;
}

/** Plan the runtime's post-upload steps from the result + the user's settings. Pure + deterministic. */
export function planAfterUpload(
  result: UploadResult,
  opts: {
    mode: UploadMode;
    notifyLevel?: UploadNotifyLevel;
    retentionPref?: RetentionPref;
    savedToCameraRoll?: boolean;
  },
): PostUploadPlan {
  if (result.ok) {
    const queueComplete = result.remaining <= 0;
    return {
      notification: uploadNotification(
        queueComplete ? { kind: 'item-done', name: result.name, remaining: 0 } : { kind: 'item-done', name: result.name, remaining: result.remaining },
        opts.notifyLevel,
      ),
      // The upload is confirmed (result.ok), so retention may act; never before confirmation.
      retention: retentionAfterUpload(opts.retentionPref ?? 'ask', { uploadConfirmed: true, savedToCameraRoll: opts.savedToCameraRoll }),
      // Auto-advance only in automatic mode AND only if there's more to do.
      advance: shouldAutoAdvance(opts.mode) && !queueComplete,
      queueComplete,
    };
  }
  // Failure: notify (always, even in summary mode), no retention (nothing uploaded), don't auto-advance past it.
  return {
    notification: uploadNotification({ kind: 'failed', name: result.name, canRetry: result.canRetry }, opts.notifyLevel),
    retention: null,
    advance: false,
    queueComplete: false,
  };
}
