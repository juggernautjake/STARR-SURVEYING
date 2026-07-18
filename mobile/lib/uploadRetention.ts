// mobile/lib/uploadRetention.ts — the PURE "what happens to the local file after a CONFIRMED upload"
// decision. The owner's flow: "once the media has uploaded, give me an option to delete the media from my
// phone." Today the queue auto-deletes the working copy on success; this models the owner's choice instead
// (keep / delete / ask), and — critically — guarantees a delete NEVER happens before the upload is confirmed
// server-side. Expo-free + deterministic, like the other upload engines; the runtime applies the descriptor.

/** The user's standing preference for local media after a successful upload. */
export type RetentionPref = 'ask' | 'keep' | 'delete';

export interface RetentionAction {
  /** Delete the app's working copy (FileSystem.documentDirectory) now. */
  deleteWorkingCopy: boolean;
  /** Prompt the user to decide (per-file), rather than acting automatically. */
  prompt: boolean;
  /** Offer to also remove the camera-roll asset (a separate, permissioned deletion the user opts into). */
  offerCameraRollDelete: boolean;
}

/**
 * Decide what to do with the local media after a CONFIRMED upload. `uploadConfirmed` MUST be true — if the
 * upload isn't confirmed server-side, nothing is deleted and the user isn't prompted (the captured bytes are
 * never risked). `savedToCameraRoll` gates whether we can even offer to remove the camera-roll copy.
 */
export function retentionAfterUpload(
  pref: RetentionPref,
  opts: { uploadConfirmed: boolean; savedToCameraRoll?: boolean } = { uploadConfirmed: false },
): RetentionAction {
  const none: RetentionAction = { deleteWorkingCopy: false, prompt: false, offerCameraRollDelete: false };
  // Hard guard: never touch local media until the server has the file.
  if (!opts.uploadConfirmed) return none;
  const offerCameraRollDelete = !!opts.savedToCameraRoll;
  switch (pref) {
    case 'delete':
      return { deleteWorkingCopy: true, prompt: false, offerCameraRollDelete };
    case 'keep':
      return none;
    case 'ask':
      return { deleteWorkingCopy: false, prompt: true, offerCameraRollDelete };
    default:
      return none;
  }
}

/** Coerce a persisted/unknown value to a valid preference (default 'ask' — never auto-delete on a bad value). */
export function normalizeRetentionPref(value: unknown): RetentionPref {
  return value === 'keep' || value === 'delete' || value === 'ask' ? value : 'ask';
}

const LABELS: Record<RetentionPref, string> = {
  ask: 'Ask each time',
  keep: 'Keep on phone',
  delete: 'Delete after upload',
};
export function retentionPrefLabel(pref: RetentionPref): string {
  return LABELS[pref];
}
