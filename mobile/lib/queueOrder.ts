// mobile/lib/queueOrder.ts — the PURE ordering + eligibility logic for the field upload queue.
//
// Kept free of PowerSync/Expo imports so it's unit-testable off-device and the drainer, the queue
// screen, and any priority/pause controls all agree on ONE answer to "what uploads next, and in what
// order?". The user's requirements map directly onto it:
//   · strict one-at-a-time  → nextUpload() returns exactly ONE row; the drainer uploads it, confirms the
//                             DB row, then asks again.
//   · pause an upload        → `paused` row is never eligible.
//   · upload this one first  → give it the lowest `queue_position` (prioritize()).
//   · reorder the queue      → set `queue_position` across rows.
// Wi-Fi gating + backoff (next_attempt_at) + max-retries are honored here too, matching the existing SQL.

export interface PendingUploadRow {
  id: string;
  retry_count?: number | null;
  next_attempt_at?: number | null;
  require_wifi?: number | boolean | null;
  /** Manually paused by the user — skipped until resumed. */
  paused?: number | boolean | null;
  /** Lower = uploaded sooner. Defaults to created order (FIFO) when unset. */
  queue_position?: number | null;
  created_at?: string | number | null;
}

export interface QueueEnv {
  onWifi: boolean;
  now: number;
  maxRetries: number;
}

const truthy = (v: unknown): boolean => v === true || v === 1;

/** The effective sort key for a row: its explicit queue_position, else its creation time (FIFO). */
export function effectivePosition(row: PendingUploadRow): number {
  if (typeof row.queue_position === 'number') return row.queue_position;
  const c = row.created_at;
  if (typeof c === 'number') return c;
  const t = c == null ? NaN : Date.parse(String(c));
  return Number.isFinite(t) ? t : 0;
}

/** Is this row eligible to upload right now? (Not paused/maxed-out/backing-off, and Wi-Fi rule met.) */
export function isEligible(row: PendingUploadRow, env: QueueEnv): boolean {
  if ((row.retry_count ?? 0) >= env.maxRetries) return false; // permanently failed
  if (truthy(row.paused)) return false;                        // user paused it
  if ((row.next_attempt_at ?? 0) > env.now) return false;      // still backing off
  if (!env.onWifi && truthy(row.require_wifi)) return false;   // Wi-Fi-only on cellular
  return true;
}

/** Eligible rows in the exact order they should be attempted (position asc, id tiebreak). */
export function orderedQueue(rows: PendingUploadRow[], env: QueueEnv): PendingUploadRow[] {
  return rows
    .filter((r) => isEligible(r, env))
    .sort((a, b) => effectivePosition(a) - effectivePosition(b) || a.id.localeCompare(b.id));
}

/** The single next upload to attempt — strict one-at-a-time — or null when nothing is eligible. */
export function nextUpload(rows: PendingUploadRow[], env: QueueEnv): PendingUploadRow | null {
  const q = orderedQueue(rows, env);
  return q.length ? q[0] : null;
}

/** Compute the `queue_position` that moves `targetId` to the FRONT of the current queue ("upload this
 *  one first"). Returns min(existing positions) − 1 so it sorts ahead without renumbering everything. */
export function prioritizePosition(rows: PendingUploadRow[]): number {
  if (!rows.length) return 0;
  return Math.min(...rows.map(effectivePosition)) - 1;
}

/** Given the user's desired ORDER of ids, produce the { id → queue_position } assignments to persist so
 *  the queue drains in that order (0,1,2,…). Ids not listed keep their relative order after the listed. */
export function reorderPositions(orderedIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  orderedIds.forEach((id, i) => { out[id] = i; });
  return out;
}
