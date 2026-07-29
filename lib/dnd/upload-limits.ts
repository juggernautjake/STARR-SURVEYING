// lib/dnd/upload-limits.ts — every /dnd upload ceiling, in one place (P1-6, audit F-6).
//
// The finding said "six ceilings across eight routes". Live it is **seven distinct values across twelve
// routes**, each written as its own `const MAX_BYTES = N * 1024 * 1024` with its own comment (or none). Two
// of the twelve are routes this very audit added, which is the point: the duplication was still growing
// while the finding sat open.
//
// WHAT THIS DELIBERATELY DOES NOT DO: unify the values. The slice says "keep the per-route values, stop
// duplicating them", and that is right — an avatar and a battle map have genuinely different budgets, and
// flattening them to one number would either make avatars absurdly permissive or break map uploads. What
// was wrong was that the same number appeared in several files with nothing connecting them, so "raise the
// character-file limit" meant grepping and hoping.
//
// So these are named by PURPOSE, not by size. `AVATAR` is 5 MB because that is what a profile picture
// should cost, not because 5 is a nice number — and if it changes, it changes here, once, for everything
// that shares the reason.

const MB = 1024 * 1024;

/**
 * Upload ceilings in BYTES, keyed by what is being uploaded.
 *
 * Values match what each route enforced before this module existed — this was a consolidation, not a
 * re-tuning, and changing a limit while moving it would have made the diff impossible to review.
 */
export const UPLOAD_LIMITS = {
  /** Profile pictures. Small on purpose: they render at ~40px. */
  AVATAR: 5 * MB,
  /** Character portraits and gallery images, homebrew artwork, chat images. */
  IMAGE: 8 * MB,
  /** Source documents the AI reads (homebrew PDF/text ingest). Bounded by what a model can consume. */
  DOCUMENT: 10 * MB,
  /** Handouts and session media — maps a DM shares mid-session, so a little larger than a portrait. */
  HANDOUT: 12 * MB,
  /** General campaign media. */
  MEDIA: 15 * MB,
  /** Soundboard audio. Larger than images because even short ambience loops are heavy. */
  AUDIO: 20 * MB,
  /** Battle maps, character imports and arbitrary character file attachments — the big ones. */
  LARGE_FILE: 25 * MB,
} as const;

export type UploadLimitKey = keyof typeof UPLOAD_LIMITS;

/** "25 MB" — for the error message a user actually reads. Whole numbers, since every limit is one. */
export function formatLimit(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}

/**
 * The standard too-large message — "Image must be 8 MB or smaller."
 *
 * The /dnd routes already AGREED on this wording, so the helper keeps it verbatim; what they did wrong was
 * hard-code the number a second time, in prose. Every route had the limit written twice — once as
 * arithmetic and once as English — so moving the constant here without this would have left twelve error
 * messages free to start lying the first time a limit changed. That second copy is the one that would have
 * gone stale silently, because no test reads an error string.
 */
export function tooLargeMessage(bytes: number, what = 'File'): string {
  return `${what} must be ${formatLimit(bytes)} or smaller.`;
}
