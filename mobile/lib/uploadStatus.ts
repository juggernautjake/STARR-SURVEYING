/**
 * Pure display-state derivation for the upload queue screen (C3).
 *
 * The queue screen (`me/uploads.tsx`) has to answer, per row, "what is
 * THIS file doing right now?" — uploading, queued, waiting for Wi-Fi,
 * paused, backing off after a stumble, or given up. That decision is
 * pure: it's a function of the persisted `pending_uploads` row plus a
 * little runtime context (which row is on the wire, the clock, the
 * network). Keeping it Expo-free means we can unit-test the exact rules
 * — the same reason `queueOrder`, `uploadFailureChoices` and `mediaPath`
 * are pure modules the runtime merely renders.
 *
 * The screen imports `deriveUploadState` per row and `summarizeQueue`
 * for the header; neither touches React Native, so both run under vitest.
 */

// Mirror of uploadQueue's MAX_RETRIES — a row at or past it is one the
// queue has permanently given up on (the file + row stay for recovery).
export const MAX_RETRIES = 8;

export type UploadState =
  | 'uploading' // this exact row is on the wire right now
  | 'paused' // the user paused it (C4 `paused` flag)
  | 'wifi-waiting' // require_wifi is set and the device isn't on Wi-Fi
  | 'offline-waiting' // no connectivity at all — waiting for any network
  | 'backoff' // stumbled; waiting for next_attempt_at before retrying
  | 'queued' // eligible, waiting its turn behind other rows
  | 'failed'; // gave up after MAX_RETRIES (recoverable via the screen)

/** The persisted columns this derivation reads. Optional ones (`paused`,
 *  `require_wifi`) may be absent until their schema slice lands — treated
 *  as falsy, never assumed present. Accepts SQLite's 0/1 or a real bool. */
export interface UploadStatusRow {
  id: string;
  retry_count: number;
  next_attempt_at?: number | null;
  require_wifi?: number | boolean | null;
  paused?: number | boolean | null;
}

export interface UploadStatusContext {
  /** Wall clock in ms — passed in so this stays pure/testable. */
  now: number;
  /** The row id `processQueue` is currently sending, if any. */
  activeId?: string | null;
  /** Whether the device is on Wi-Fi right now. */
  onWifi?: boolean;
  /** Whether the device has any usable connectivity right now. */
  online?: boolean;
}

const truthy = (v: number | boolean | null | undefined): boolean =>
  v === true || v === 1;

/**
 * The single source of truth for a row's display state. Precedence runs
 * most-decisive first: a row that's given up is `failed` even if it's
 * technically "next"; a row on the wire is `uploading` even if paused was
 * just tapped; then the blocking conditions (paused → wifi → offline →
 * backoff); otherwise it's simply `queued`.
 */
export function deriveUploadState(
  row: UploadStatusRow,
  ctx: UploadStatusContext,
): UploadState {
  if (row.retry_count >= MAX_RETRIES) return 'failed';
  if (ctx.activeId && ctx.activeId === row.id) return 'uploading';
  if (truthy(row.paused)) return 'paused';
  if (truthy(row.require_wifi) && ctx.onWifi === false) return 'wifi-waiting';
  if (ctx.online === false) return 'offline-waiting';
  if (row.next_attempt_at != null && row.next_attempt_at > ctx.now) {
    return 'backoff';
  }
  return 'queued';
}

/** True while the queue is actively working or about to — i.e. not a
 *  terminal `failed`. Drives "N in flight" style counts + spinners. */
export function isActiveState(state: UploadState): boolean {
  return state !== 'failed';
}

/** A row blocked on something outside the queue's control (a condition the
 *  user or the environment must change), as opposed to just waiting its
 *  turn. Useful for a "waiting on you / your connection" callout. */
export function isBlockedState(state: UploadState): boolean {
  return (
    state === 'paused' ||
    state === 'wifi-waiting' ||
    state === 'offline-waiting'
  );
}

const LABELS: Record<UploadState, string> = {
  uploading: 'Uploading',
  paused: 'Paused',
  'wifi-waiting': 'Waiting for Wi-Fi',
  'offline-waiting': 'Waiting for connection',
  backoff: 'Retrying soon',
  queued: 'Queued',
  failed: 'Failed',
};

/** Human label for a state — the chip text on the queue row. */
export function uploadStateLabel(state: UploadState): string {
  return LABELS[state];
}

/** Whole-numbered seconds until this row's backoff elapses (0 if not in
 *  backoff or already due). Lets the screen show "Retrying in 12s". */
export function backoffSecondsLeft(
  row: UploadStatusRow,
  now: number,
): number {
  if (row.next_attempt_at == null || row.next_attempt_at <= now) return 0;
  return Math.ceil((row.next_attempt_at - now) / 1000);
}

export interface QueueSummary {
  total: number;
  counts: Record<UploadState, number>;
  /** In-flight + waiting (everything that isn't terminal `failed`). */
  active: number;
  /** Rows blocked on the user/connection. */
  blocked: number;
  failed: number;
  /** One-line headline for the screen header, or null when idle+clean. */
  headline: string | null;
}

const emptyCounts = (): Record<UploadState, number> => ({
  uploading: 0,
  paused: 0,
  'wifi-waiting': 0,
  'offline-waiting': 0,
  backoff: 0,
  queued: 0,
  failed: 0,
});

const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Roll every row up into the header summary. The headline names what the
 * user most needs to know, worst-first: failures, then a blocking
 * condition, then plain progress — so the header never buries a stuck
 * file under a cheerful "uploading" count.
 */
export function summarizeQueue(
  rows: UploadStatusRow[],
  ctx: UploadStatusContext,
): QueueSummary {
  const counts = emptyCounts();
  for (const row of rows) counts[deriveUploadState(row, ctx)] += 1;

  const total = rows.length;
  const failed = counts.failed;
  const active = total - failed;
  const blocked =
    counts.paused + counts['wifi-waiting'] + counts['offline-waiting'];

  let headline: string | null = null;
  if (total === 0) {
    headline = null;
  } else if (failed > 0) {
    headline = `${plural(failed, 'file')} failed`;
  } else if (counts['wifi-waiting'] > 0) {
    headline = `${plural(counts['wifi-waiting'], 'file')} waiting for Wi-Fi`;
  } else if (counts['offline-waiting'] > 0) {
    headline = `${plural(counts['offline-waiting'], 'file')} waiting for connection`;
  } else if (counts.paused > 0 && counts.paused === total) {
    headline = 'Uploads paused';
  } else {
    headline = `Uploading ${plural(active, 'file')}`;
  }

  return { total, counts, active, blocked, failed, headline };
}
