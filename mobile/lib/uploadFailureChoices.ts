// mobile/lib/uploadFailureChoices.ts — the PURE decision logic for "an upload failed, what now?" (Area C5).
//
// Kept free of PowerSync/Expo/FileSystem imports so it's unit-testable off-device and the queue screen,
// the failure notification action, and any future automation all agree on ONE mapping from the user's
// three choices to the row mutation that implements each. The user's requirement, verbatim:
//   (a) save the media locally and forget it  → drop from the queue, but KEEP the local file
//   (b) retry immediately                     → clear the failure + attempt now
//   (c) wait for better reception             → keep it queued, retry only on a good (Wi-Fi) connection
//
// Crucially (a) is NOT `discardUpload` (which deletes the local file) — "save locally and forget" must
// leave the bytes on disk so the surveyor can recover them later. That distinction lives here so a caller
// can't accidentally delete work the user asked to keep.
import type { PendingUploadRow } from './queueOrder';

/** The canonical set of failure choices — the SINGLE source of truth. `FailureChoice` is derived from it,
 *  so the union and this array can never drift; anything iterating "every choice" (e.g. the safety sweep
 *  that proves no choice deletes the captured file) reads this and is exhaustive by construction. Adding a
 *  choice here forces a `resolveFailureChoice` switch case (TS exhaustiveness) AND extends that sweep. */
export const ALL_FAILURE_CHOICES = ['save_local_forget', 'retry_now', 'wait_reception'] as const;
export type FailureChoice = (typeof ALL_FAILURE_CHOICES)[number];

export interface FailureChoiceOption {
  choice: FailureChoice;
  label: string;
  description: string;
  /** The default action offered — matches the existing backoff/wifi-waiting behavior. */
  isDefault?: boolean;
}

/**
 * A pure description of the DB/file mutation a choice implies. The mobile layer executes it (UPDATE or
 * DELETE on pending_uploads, delete-or-keep the local file, optionally kick a drain) — this module never
 * touches the device, so it can be exhaustively unit-tested.
 */
export interface FailureResolution {
  choice: FailureChoice;
  /** Delete the pending_uploads row (drop it from the queue). */
  removeRow: boolean;
  /** Column assignments to persist when the row is kept (removeRow === false). */
  set?: Partial<Pick<PendingUploadRow, 'retry_count' | 'next_attempt_at' | 'require_wifi'>> & { last_error?: null };
  /** Whether the local captured file should be deleted. FALSE for "save locally and forget" — the whole
   *  point is to keep the bytes — and false for the retry paths (they still need the file). */
  deleteLocalFile: boolean;
  /** Attempt a drain right away (instant feedback) rather than waiting for the next network-restore tick. */
  kickDrain: boolean;
}

const truthy = (v: unknown): boolean => v === true || v === 1;

/** Has the queue given up on this row (so the user must decide)? True at/over the retry cap. */
export function needsFailureDecision(row: PendingUploadRow, maxRetries: number): boolean {
  return (row.retry_count ?? 0) >= maxRetries;
}

/** The three choices to present for a failed upload, with the "wait for better reception" default flagged. */
export function failureChoices(row: PendingUploadRow): FailureChoiceOption[] {
  const onWifiAlready = truthy(row.require_wifi);
  return [
    {
      choice: 'retry_now',
      label: 'Retry now',
      description: 'Attempt the upload again right away.',
    },
    {
      choice: 'wait_reception',
      label: 'Wait for better reception',
      description: onWifiAlready
        ? 'Keep it queued — it will upload when a Wi-Fi connection returns.'
        : 'Keep it queued and only upload once a strong (Wi-Fi) connection is available.',
      isDefault: true,
    },
    {
      choice: 'save_local_forget',
      label: 'Save on device & forget',
      description: 'Remove it from the upload queue but keep the file on this device so you can recover it later.',
    },
  ];
}

/**
 * Resolve a chosen action into the pure mutation the mobile layer should apply. `now` is passed in (no
 * Date.now() here) so the result is deterministic and testable.
 */
export function resolveFailureChoice(
  row: PendingUploadRow,
  choice: FailureChoice,
  now: number,
): FailureResolution {
  switch (choice) {
    case 'save_local_forget':
      // Drop it from the queue, but KEEP the file — the surveyor asked to keep their work, not discard it.
      return { choice, removeRow: true, deleteLocalFile: false, kickDrain: false };
    case 'retry_now':
      // Clear the failure state so the drainer treats it as fresh, and attempt immediately.
      return { choice, removeRow: false, set: { retry_count: 0, last_error: null, next_attempt_at: now }, deleteLocalFile: false, kickDrain: true };
    case 'wait_reception':
      // Re-queue (not permanently failed) and gate on Wi-Fi so it only retries on a good connection — the
      // network-restore drain picks it up when reception improves; we don't kick one now.
      return { choice, removeRow: false, set: { retry_count: 0, last_error: null, next_attempt_at: now, require_wifi: 1 }, deleteLocalFile: false, kickDrain: false };
  }
}
