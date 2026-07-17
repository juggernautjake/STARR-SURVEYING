/**
 * Pure model of the QUEUE-WIDE upload mode the owner asked for: "I need to be able
 * to set the upload queue to automatic, or make it where I have to tell it to upload
 * the next thing, or I can just pause all uploads."
 *
 * This is orthogonal to queueOrder's PER-ROW `paused` flag (which skips ONE file):
 * the mode governs the WHOLE drainer.
 *   · automatic — the drainer keeps pulling the next eligible row on its own
 *                 (capture → Send → it just uploads everything, one at a time).
 *   · manual    — the drainer uploads only when the user says "upload next", one row
 *                 per request, then stops — no auto-advance to the following file.
 *   · paused    — nothing uploads at all until the mode changes.
 *
 * Kept Expo-free so the drainer, the queue screen, and the mode toggle all agree on
 * one answer, and so the rules are unit-tested off-device (like queueOrder /
 * uploadStatus / uploadFailureChoices). The runtime persists the chosen mode (a
 * single app setting) and reads it here on every drain decision.
 */

export type UploadMode = 'automatic' | 'manual' | 'paused';

/** New installs default to automatic — the owner's "capture and it just uploads". */
export const DEFAULT_UPLOAD_MODE: UploadMode = 'automatic';

export const UPLOAD_MODES: readonly UploadMode[] = ['automatic', 'manual', 'paused'];

export interface DrainRequest {
  /** True when THIS drain was triggered by the user (tapping "upload next" / "upload
   *  now"), as opposed to an automatic trigger (enqueue, network-online, foreground,
   *  a background task). Only relevant in manual mode. */
  userInitiated?: boolean;
}

/**
 * Should the drainer send ANYTHING right now, given the mode + what triggered it?
 * - automatic: always (any trigger drains).
 * - manual: only a user-initiated request drains — an automatic trigger is a no-op.
 * - paused: never.
 */
export function canDrain(mode: UploadMode, req: DrainRequest = {}): boolean {
  switch (mode) {
    case 'automatic':
      return true;
    case 'manual':
      return req.userInitiated === true;
    case 'paused':
      return false;
  }
}

/**
 * After one upload confirms, should the drainer automatically continue to the next
 * eligible row? Only in automatic mode. In manual mode each row is a separate
 * user-initiated request; in paused mode there is no next.
 */
export function shouldAutoAdvance(mode: UploadMode): boolean {
  return mode === 'automatic';
}

/** All uploads halted queue-wide (distinct from a single row being paused). */
export function isPausedMode(mode: UploadMode): boolean {
  return mode === 'paused';
}

/** Coerce a persisted/unknown value to a valid mode, falling back to the default —
 *  so a corrupt or absent setting never wedges the queue. */
export function normalizeUploadMode(value: unknown): UploadMode {
  return value === 'automatic' || value === 'manual' || value === 'paused'
    ? value
    : DEFAULT_UPLOAD_MODE;
}

const LABELS: Record<UploadMode, string> = {
  automatic: 'Automatic',
  manual: 'Manual',
  paused: 'Paused',
};

const DESCRIPTIONS: Record<UploadMode, string> = {
  automatic: 'Upload everything in the queue, one at a time.',
  manual: 'Upload only when you tap “Upload next”.',
  paused: 'Hold all uploads until you resume.',
};

export function uploadModeLabel(mode: UploadMode): string {
  return LABELS[mode];
}

export function uploadModeDescription(mode: UploadMode): string {
  return DESCRIPTIONS[mode];
}

/** Next mode when the user taps a single cycling toggle: automatic → manual →
 *  paused → automatic. (A segmented control can set a mode directly instead.) */
export function cycleUploadMode(mode: UploadMode): UploadMode {
  const i = UPLOAD_MODES.indexOf(mode);
  return UPLOAD_MODES[(i + 1) % UPLOAD_MODES.length];
}
