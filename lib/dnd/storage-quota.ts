// lib/dnd/storage-quota.ts — a ceiling on total stored bytes per account (P2-7, audit F-6).
//
// The per-upload limits from P1-6 cap how big ONE file can be. Nothing capped how many, so a single account
// could fill the media bucket 25 MB at a time and the only symptom would be the storage bill. F-6's second
// half.
//
// WHY A LEDGER RATHER THAN SUMMING THE EXISTING TABLES. Neither `dnd_media` nor `dnd_character_uploads`
// records a byte count, and they are not the only things that write to the bucket — avatars, homebrew art
// and soundboard audio all land elsewhere or nowhere. Summing what those tables happen to know would
// undercount by design and drift further with every new upload surface. One append-only ledger, written by
// every upload route, is the only version that can be right.
//
// THE HARD PART IS RELEASE, NOT RESERVE. A quota that only counts upward is a quota that eventually locks
// every active user out permanently, and it looks fine for months first. Deleting a file MUST free its
// bytes, which is why `releaseStorage` exists alongside `recordStorage` and why the delete paths matter as
// much as the upload paths.

/** One byte count, in one place, named. */
const MB = 1024 * 1024;

/**
 * Total stored bytes allowed per account.
 *
 * 500 MB is set against the per-file limits it sits above: 20 battle maps at the 25 MB `LARGE_FILE` ceiling,
 * or hundreds of character portraits. A table that has been running for a year is nowhere near it; a script
 * looping uploads reaches it in minutes. That gap is the entire point — like the rate limiter, this is a
 * cost and abuse control, not a usage policy, and if a real campaign ever trips it the number is wrong
 * rather than the campaign.
 */
export const STORAGE_QUOTA_BYTES = 500 * MB;

/** Warn the owner while there is still room to act, rather than only at the wall. */
export const STORAGE_WARN_FRACTION = 0.8;

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  /** True once the account is past `STORAGE_WARN_FRACTION` — for a meter, not a refusal. */
  warn: boolean;
}

export function quotaState(used: number): QuotaState {
  const safeUsed = Math.max(0, Number.isFinite(used) ? used : 0);
  return {
    used: safeUsed,
    limit: STORAGE_QUOTA_BYTES,
    remaining: Math.max(0, STORAGE_QUOTA_BYTES - safeUsed),
    warn: safeUsed >= STORAGE_QUOTA_BYTES * STORAGE_WARN_FRACTION,
  };
}

/**
 * Would this upload fit?
 *
 * Takes the INCOMING size as well as the current usage, so the refusal happens before the bytes are stored
 * rather than after — checking only `used >= limit` would let every account overshoot by one file, which at
 * a 25 MB per-file ceiling is not a rounding error.
 */
export function wouldExceedQuota(used: number, incoming: number): boolean {
  return Math.max(0, used) + Math.max(0, incoming) > STORAGE_QUOTA_BYTES;
}

/** "1.2 GB" / "340 MB" / "812 KB" — for a message a person reads. */
export function formatBytes(bytes: number): string {
  const n = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (n >= 1024 * MB) return `${(n / (1024 * MB)).toFixed(1)} GB`;
  if (n >= MB) return `${Math.round(n / MB)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}

/**
 * The refusal message. Says what is used, what the limit is, and — the part that makes it actionable —
 * that deleting frees space, because a quota with no stated remedy reads as a dead end.
 */
export function quotaMessage(used: number): string {
  return `You have used ${formatBytes(used)} of your ${formatBytes(STORAGE_QUOTA_BYTES)} upload allowance. `
    + 'Delete some images or files to free up space.';
}
