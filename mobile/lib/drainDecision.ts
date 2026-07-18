// mobile/lib/drainDecision.ts — the PURE "what does the drainer do next?" decision for the upload queue.
// It composes the three existing engines — the queue-wide mode (uploadMode), the strict one-at-a-time
// ordering (queueOrder), and the network/Wi-Fi/backoff eligibility (queueOrder.QueueEnv) — into the single
// next-action the runtime drain loop needs. Keeping it pure means the drain loop is trivial (call this, act
// on the result, repeat) and the whole decision is testable off-device, like the other upload engines.

import { canDrain, isPausedMode, type UploadMode } from './uploadMode';
import { nextUpload, type PendingUploadRow, type QueueEnv } from './queueOrder';

export type DrainStep =
  | { action: 'upload'; row: PendingUploadRow } // send this row now (strict one-at-a-time)
  | { action: 'paused' } // the whole queue is paused (mode = paused)
  | { action: 'blocked'; reason: string } // can't proceed right now, but there's work (manual/Wi-Fi/backoff)
  | { action: 'idle' }; // nothing left to upload

export interface DrainInput {
  mode: UploadMode;
  rows: PendingUploadRow[];
  env: QueueEnv;
  /** True when THIS drain was triggered by the user (tapping "upload next"), not an automatic trigger. */
  userInitiated?: boolean;
}

/**
 * Decide the drainer's next action. Order of checks mirrors the priority the owner described:
 * paused-all stops everything; manual mode only proceeds on a user tap; otherwise upload the single
 * front-of-queue eligible row; if none is eligible, distinguish "still have work but it's blocked"
 * (Wi-Fi/backoff/paused rows) from "truly done".
 */
export function nextDrainStep(input: DrainInput): DrainStep {
  if (isPausedMode(input.mode)) return { action: 'paused' };
  if (!canDrain(input.mode, { userInitiated: input.userInitiated })) {
    return { action: 'blocked', reason: 'Manual mode — waiting for you to start the next upload.' };
  }
  const row = nextUpload(input.rows, input.env);
  if (row) return { action: 'upload', row };
  // Nothing eligible right now: is there work that's merely blocked, or is the queue actually empty?
  const pendingLeft = input.rows.some((r) => (r.retry_count ?? 0) < input.env.maxRetries);
  return pendingLeft
    ? { action: 'blocked', reason: 'Waiting — Wi-Fi, a retry backoff, or a paused item.' }
    : { action: 'idle' };
}
