/**
 * Offline-first upload queue.
 *
 * The capture flows (receipts photo, data-point photo, future video /
 * voice) write a compressed file to FileSystem.documentDirectory and
 * INSERT a row into the local-only `pending_uploads` table via
 * enqueueAndAttempt(). The queue then drains:
 *
 *   - immediately, when the device is online — typical happy path
 *   - on the next network restore, when the capture happened offline
 *   - on app launch, when the user re-opens the app after a long
 *     offline session
 *
 * The compressed file lives in documentDirectory (not cacheDirectory)
 * so it survives app kills + reboots. On successful upload the file
 * is deleted; on permanent failure (>= MAX_RETRIES) the row stays in
 * the queue for ops triage and the file stays on disk so the user
 * can re-attempt manually from a future "stuck uploads" surface
 * (F3 polish).
 *
 * Per-table success contract: when an upload succeeds, the queue
 * flips the parent row's `upload_state` to 'done'. We do this here
 * (not in the capture hook) so a retry from a previous session can
 * complete the lifecycle even after the originating screen unmounted.
 */
import * as FileSystem from 'expo-file-system';
import { useEffect, useState } from 'react';
import { usePowerSync, useQuery } from '@powersync/react';
import type { AbstractPowerSyncDatabase } from '@powersync/react-native';

import { logError, logInfo, logWarn } from './log';
import { isOnWifiNow, isOnlineNow, subscribeToOnline } from './networkState';
import { supabase } from './supabase';
import { randomUUID } from './uuid';

/** Subdirectory under documentDirectory for queued uploads. Created
 *  lazily on first enqueue. */
const PENDING_DIR = 'pending-uploads';
/** Cap retries — past this we leave the row queued but stop poking
 *  it on every network event. The user can re-attempt manually. */
const MAX_RETRIES = 8;
/** Backoff in ms — doubles per attempt up to ~5 min. The first
 *  retry fires ~5s after the initial failure; the 8th would fire
 *  ~10 min later if the queue ever got there. */
const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000];

type ParentTable = 'receipts' | 'field_media' | 'job_files';

export interface EnqueueOptions {
  parentTable: ParentTable;
  parentId: string;
  bucket: string;
  storagePath: string;
  /** file:// URI to the compressed source. enqueueAndAttempt() copies
   *  it into documentDirectory before queueing — caller can delete
   *  the original (e.g. expo-image-manipulator's cache output). */
  localFileUri: string;
  contentType: string;
  /** Logging scope, e.g. 'receipts.capture'. */
  scope: string;
  /** Wi-Fi-only flag (Batch KK). When true, the drainer skips
   *  this row whenever the device is on cellular — protects the
   *  surveyor's data plan against large original-tier video
   *  uploads. The synchronous attempt at the end of
   *  `enqueueAndAttempt` also short-circuits to "deferred" in
   *  that case so the surveyor doesn't pay for it on capture. */
  requireWifi?: boolean;
}

export interface EnqueueResult {
  /** UUID of the pending_uploads row. */
  pendingId: string;
  /** True when the synchronous upload attempt succeeded. False
   *  when the row is queued for retry. */
  uploadedNow: boolean;
}

/**
 * Persist the file to documentDirectory, INSERT a pending_uploads
 * row, then attempt the upload synchronously. On failure the row
 * stays queued and processQueue() retries on next network restore.
 *
 * Rationale: most captures happen online so the synchronous attempt
 * gives the happy-path latency we'd see without the queue. The
 * queue is the safety net, not the primary path.
 */
export async function enqueueAndAttempt(
  db: AbstractPowerSyncDatabase,
  opts: EnqueueOptions
): Promise<EnqueueResult> {
  const pendingId = randomUUID();
  const persistedUri = await persistFile(opts.localFileUri, pendingId, opts.scope);
  const nowIso = new Date().toISOString();

  await db.execute(
    `INSERT INTO pending_uploads (
       id, parent_table, parent_id, bucket, storage_path,
       local_uri, content_type, retry_count, last_error,
       next_attempt_at, require_wifi, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pendingId,
      opts.parentTable,
      opts.parentId,
      opts.bucket,
      opts.storagePath,
      persistedUri,
      opts.contentType,
      0,
      null,
      Date.now(),
      opts.requireWifi ? 1 : 0,
      nowIso,
    ]
  );

  logInfo('uploadQueue.enqueue', 'queued', {
    pending_id: pendingId,
    parent_table: opts.parentTable,
    parent_id: opts.parentId,
    bucket: opts.bucket,
    require_wifi: !!opts.requireWifi,
  });

  // Try once synchronously. If we're offline, this will fail —
  // processQueue() will retry on network restore.
  if (!isOnlineNow()) {
    logInfo('uploadQueue.enqueue', 'offline — deferred', {
      pending_id: pendingId,
    });
    return { pendingId, uploadedNow: false };
  }
  // Wi-Fi-only rows skip the synchronous attempt unless we're on
  // Wi-Fi — otherwise the surveyor would pay for the cellular
  // upload anyway. The drainer picks this up on the next
  // network-type transition.
  if (opts.requireWifi && !isOnWifiNow()) {
    logInfo('uploadQueue.enqueue', 'cellular — deferred (wifi-only)', {
      pending_id: pendingId,
    });
    // Flip the parent row's upload_state to 'wifi-waiting' so the
    // mobile UI surfaces the right badge instead of "Uploading…"
    // forever. We only do this for field_media (the only table
    // that uses require_wifi today); the parent's state column is
    // identical for receipts but they never set the flag.
    if (opts.parentTable === 'field_media') {
      try {
        await db.execute(
          `UPDATE field_media SET upload_state = 'wifi-waiting' WHERE id = ?`,
          [opts.parentId]
        );
      } catch (err) {
        logWarn('uploadQueue.enqueue', 'wifi-waiting flip failed', err, {
          parent_id: opts.parentId,
        });
      }
    }
    return { pendingId, uploadedNow: false };
  }

  const ok = await tryOne(db, {
    pendingId,
    parentTable: opts.parentTable,
    parentId: opts.parentId,
    bucket: opts.bucket,
    storagePath: opts.storagePath,
    localUri: persistedUri,
    contentType: opts.contentType,
    retryCount: 0,
  });
  return { pendingId, uploadedNow: ok };
}

interface QueueRow {
  id: string;
  parent_table: ParentTable;
  parent_id: string;
  bucket: string;
  storage_path: string;
  local_uri: string;
  content_type: string;
  retry_count: number;
  last_error: string | null;
  next_attempt_at: number | null;
  created_at: string | null;
}

/**
 * Drain every queued row whose next_attempt_at has elapsed. Caller
 * is the UploadQueueProvider — fires on app launch + network restore.
 *
 * Returns counts so the provider can log a summary breadcrumb.
 */
export async function processQueue(
  db: AbstractPowerSyncDatabase
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  if (!isOnlineNow()) {
    return { attempted: 0, succeeded: 0, failed: 0 };
  }
  // Wi-Fi-only rows (Batch KK) are excluded from the SELECT when
  // the device is on cellular. The same query runs again on the
  // next network-type transition (the upload queue subscribes
  // to subscribeToOnline, which fires on every NetInfo change),
  // so a Wi-Fi tether picks them up automatically.
  const onWifi = isOnWifiNow();
  const now = Date.now();
  const rows = await db.getAll<QueueRow>(
    onWifi
      ? `SELECT * FROM pending_uploads
           WHERE retry_count < ?
             AND COALESCE(next_attempt_at, 0) <= ?
           ORDER BY COALESCE(next_attempt_at, 0) ASC
           LIMIT 25`
      : `SELECT * FROM pending_uploads
           WHERE retry_count < ?
             AND COALESCE(next_attempt_at, 0) <= ?
             AND COALESCE(require_wifi, 0) = 0
           ORDER BY COALESCE(next_attempt_at, 0) ASC
           LIMIT 25`,
    [MAX_RETRIES, now]
  );

  if (rows.length === 0) return { attempted: 0, succeeded: 0, failed: 0 };

  logInfo('uploadQueue.process', 'draining', { count: rows.length });

  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const ok = await tryOne(db, {
      pendingId: row.id,
      parentTable: row.parent_table,
      parentId: row.parent_id,
      bucket: row.bucket,
      storagePath: row.storage_path,
      localUri: row.local_uri,
      contentType: row.content_type,
      retryCount: row.retry_count,
    });
    if (ok) succeeded += 1;
    else failed += 1;

    // If the network dropped mid-batch, bail — pending rows stay
    // queued and the next online transition picks them up.
    if (!isOnlineNow()) {
      logInfo('uploadQueue.process', 'network dropped mid-batch', {
        processed: succeeded + failed,
        remaining: rows.length - succeeded - failed,
      });
      break;
    }
  }

  logInfo('uploadQueue.process', 'drained', {
    attempted: succeeded + failed,
    succeeded,
    failed,
  });
  return { attempted: succeeded + failed, succeeded, failed };
}

interface TryOneArgs {
  pendingId: string;
  parentTable: ParentTable;
  parentId: string;
  bucket: string;
  storagePath: string;
  localUri: string;
  contentType: string;
  retryCount: number;
}

async function tryOne(
  db: AbstractPowerSyncDatabase,
  args: TryOneArgs
): Promise<boolean> {
  // Read the file fresh on every attempt — handles the case where
  // a previous attempt succeeded server-side but DB cleanup raced.
  let arrayBuffer: ArrayBuffer;
  try {
    const response = await fetch(args.localUri);
    const blob = await response.blob();
    arrayBuffer = await blob.arrayBuffer();
  } catch (err) {
    // Local file missing — give up: the bytes are gone, no retry
    // will succeed. Mark as failed-permanent and let ops triage.
    await markPermanentFailure(
      db,
      args.pendingId,
      `local file unreachable: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }

  const { error } = await supabase.storage
    .from(args.bucket)
    .upload(args.storagePath, arrayBuffer, {
      contentType: args.contentType,
      upsert: false,
    });

  if (error) {
    // Distinguish dupe vs transient: if the server already has the
    // object (e.g. a prior session's upload succeeded but we never
    // got the response back), Supabase returns "Duplicate" — that's
    // a happy-path success for us.
    const lower = error.message.toLowerCase();
    const alreadyUploaded =
      lower.includes('duplicate') || lower.includes('already exists');
    if (alreadyUploaded) {
      logInfo('uploadQueue.tryOne', 'already uploaded — treating as success', {
        pending_id: args.pendingId,
        storage_path: args.storagePath,
      });
      await markSuccess(db, args);
      return true;
    }
    await markRetry(db, args, error.message);
    return false;
  }

  await markSuccess(db, args);
  return true;
}

async function markSuccess(
  db: AbstractPowerSyncDatabase,
  args: TryOneArgs
): Promise<void> {
  // Flip the parent row's upload_state to 'done' so the UI hides
  // the "syncing" badge. receipts has no upload_state column today
  // (the upload tier was implicit before this queue) — we skip the
  // parent update for receipts and rely on photo_url being non-null.
  // field_media has upload_state per F3 #1.
  if (args.parentTable === 'field_media') {
    try {
      await db.execute(
        `UPDATE field_media SET upload_state = 'done' WHERE id = ?`,
        [args.parentId]
      );
    } catch (err) {
      logWarn('uploadQueue.markSuccess', 'parent flip failed', err, {
        parent_table: args.parentTable,
        parent_id: args.parentId,
      });
    }
  } else if (args.parentTable === 'job_files') {
    // job_files (F5) carries the same upload_state column convention.
    try {
      await db.execute(
        `UPDATE job_files SET upload_state = 'done', uploaded_at = ? WHERE id = ?`,
        [new Date().toISOString(), args.parentId]
      );
    } catch (err) {
      logWarn('uploadQueue.markSuccess', 'parent flip failed', err, {
        parent_table: args.parentTable,
        parent_id: args.parentId,
      });
    }
  }

  // Delete the queue row + the local file. Both are best-effort —
  // an orphan local file is harmless (FileSystem.documentDirectory
  // is per-app and survives only until app uninstall).
  try {
    await db.execute(`DELETE FROM pending_uploads WHERE id = ?`, [args.pendingId]);
  } catch (err) {
    logWarn('uploadQueue.markSuccess', 'queue row delete failed', err, {
      pending_id: args.pendingId,
    });
  }
  try {
    await FileSystem.deleteAsync(args.localUri, { idempotent: true });
  } catch (err) {
    logWarn('uploadQueue.markSuccess', 'local file delete failed', err, {
      pending_id: args.pendingId,
      local_uri: args.localUri,
    });
  }

  logInfo('uploadQueue.tryOne', 'uploaded', {
    pending_id: args.pendingId,
    parent_table: args.parentTable,
    parent_id: args.parentId,
    storage_path: args.storagePath,
  });
}

async function markRetry(
  db: AbstractPowerSyncDatabase,
  args: TryOneArgs,
  errorMessage: string
): Promise<void> {
  const nextRetry = args.retryCount + 1;
  const backoff = BACKOFF_MS[Math.min(args.retryCount, BACKOFF_MS.length - 1)];
  const nextAttemptAt = Date.now() + backoff;

  // Field_media rows show a 'failed' badge on the thumbnail when the
  // queue gives up. While retrying, the badge stays 'pending' /
  // 'wifi-waiting' (set by the capture hook) so the user knows it's
  // still in progress.
  if (nextRetry >= MAX_RETRIES && args.parentTable === 'field_media') {
    try {
      await db.execute(
        `UPDATE field_media SET upload_state = 'failed' WHERE id = ?`,
        [args.parentId]
      );
    } catch (err) {
      logWarn('uploadQueue.markRetry', 'parent fail-flip failed', err, {
        parent_id: args.parentId,
      });
    }
  } else if (nextRetry >= MAX_RETRIES && args.parentTable === 'job_files') {
    try {
      await db.execute(
        `UPDATE job_files SET upload_state = 'failed' WHERE id = ?`,
        [args.parentId]
      );
    } catch (err) {
      logWarn('uploadQueue.markRetry', 'parent fail-flip failed', err, {
        parent_id: args.parentId,
      });
    }
  }

  try {
    await db.execute(
      `UPDATE pending_uploads
       SET retry_count = ?, last_error = ?, next_attempt_at = ?
       WHERE id = ?`,
      [nextRetry, errorMessage.slice(0, 500), nextAttemptAt, args.pendingId]
    );
  } catch (err) {
    logError('uploadQueue.markRetry', 'queue row update failed', err, {
      pending_id: args.pendingId,
    });
  }

  logWarn('uploadQueue.tryOne', 'upload failed — will retry', undefined, {
    pending_id: args.pendingId,
    parent_table: args.parentTable,
    parent_id: args.parentId,
    retry: nextRetry,
    next_attempt_in_ms: backoff,
    error: errorMessage.slice(0, 200),
  });
}

async function markPermanentFailure(
  db: AbstractPowerSyncDatabase,
  pendingId: string,
  errorMessage: string
): Promise<void> {
  // Set retry_count to MAX_RETRIES so processQueue stops picking it
  // up. Keep the row for ops triage; the local file is gone.
  try {
    await db.execute(
      `UPDATE pending_uploads SET retry_count = ?, last_error = ? WHERE id = ?`,
      [MAX_RETRIES, errorMessage.slice(0, 500), pendingId]
    );
  } catch (err) {
    logError('uploadQueue.markPermanentFailure', 'queue row update failed', err, {
      pending_id: pendingId,
    });
  }
  logError('uploadQueue.tryOne', 'permanent failure', new Error(errorMessage), {
    pending_id: pendingId,
  });
}

/**
 * Copy a file from any caller-owned location into our durable
 * documentDirectory. Returns the new file:// URI.
 */
async function persistFile(
  sourceUri: string,
  pendingId: string,
  scope: string
): Promise<string> {
  const dir = `${FileSystem.documentDirectory}${PENDING_DIR}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch((err) => {
    // Already exists is fine; anything else is real.
    if (
      err instanceof Error &&
      /exists|already/i.test(err.message)
    ) {
      return;
    }
    throw err;
  });

  // Preserve the source extension when known so the OS associates
  // the right MIME type for re-reads.
  const ext = guessExtension(sourceUri);
  const dest = `${dir}${pendingId}${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  logInfo(scope, 'persisted to documentDirectory', { dest });
  return dest;
}

function guessExtension(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '.jpg';
  if (lower.endsWith('.png')) return '.png';
  if (lower.endsWith('.heic')) return '.heic';
  if (lower.endsWith('.webp')) return '.webp';
  if (lower.endsWith('.mp4')) return '.mp4';
  if (lower.endsWith('.mov')) return '.mov';
  if (lower.endsWith('.m4a')) return '.m4a';
  if (lower.endsWith('.mp3')) return '.mp3';
  return '';
}

/**
 * Reactive hook — does this parent row still have a pending upload?
 * Returns the local file URI when one is queued (so the photo-URL
 * hook can show the local copy until the remote lands), null when
 * there's no pending row OR the queue gave up (permanent failure).
 *
 * Used by useReceiptPhotoUrl + useFieldMediaPhotoUrl to render the
 * captured photo immediately — surveyors don't have to wait for the
 * upload to land before reviewing what they snapped.
 */
export function usePendingUploadLocalUri(
  parentTable: ParentTable,
  parentId: string | null | undefined
): string | null {
  const { data } = useQuery<{ local_uri: string }>(
    `SELECT local_uri FROM pending_uploads
     WHERE parent_table = ? AND parent_id = ? AND retry_count < ?
     LIMIT 1`,
    parentId ? [parentTable, parentId, MAX_RETRIES] : []
  );
  return data?.[0]?.local_uri ?? null;
}

/**
 * Reactive hook for the UI badge: returns the count of currently-
 * queued uploads (excluding the permanent-failure rows). Money +
 * Capture screens display this so the user knows their work is
 * in flight even when they tap Done and dismiss.
 */
export function useUploadQueueStatus(): {
  pendingCount: number;
  failedCount: number;
} {
  const { data: pendingRows } = useQuery<{ count: number }>(
    `SELECT COUNT(*) AS count FROM pending_uploads WHERE retry_count < ?`,
    [MAX_RETRIES]
  );
  const { data: failedRows } = useQuery<{ count: number }>(
    `SELECT COUNT(*) AS count FROM pending_uploads WHERE retry_count >= ?`,
    [MAX_RETRIES]
  );
  return {
    pendingCount: pendingRows?.[0]?.count ?? 0,
    failedCount: failedRows?.[0]?.count ?? 0,
  };
}

// ── Stuck-uploads triage surface ────────────────────────────────────────────
//
// The Me-tab "Uploads" section drills into a list of every queued or
// failed upload so the user can see — and recover — work that didn't
// land. Resilience contract per the user's requirement: data captured
// offline must NEVER be silently lost. When the queue gives up after
// MAX_RETRIES, the local file stays on disk + the row stays in the
// queue table; this surface is how the user finds them.

export interface StuckUploadRow {
  id: string;
  parent_table: ParentTable;
  parent_id: string;
  bucket: string;
  storage_path: string;
  local_uri: string;
  content_type: string | null;
  retry_count: number;
  last_error: string | null;
  next_attempt_at: number | null;
  created_at: string | null;
}

/**
 * Reactive list of every queued upload (in-flight + failed), newest
 * first. Drives the Me → Uploads drilldown.
 *
 * `kind` filter:
 *   - 'all'      — both in-flight and failed
 *   - 'pending'  — retry_count < MAX_RETRIES (still trying)
 *   - 'failed'   — retry_count >= MAX_RETRIES (gave up)
 */
export function useStuckUploads(
  kind: 'all' | 'pending' | 'failed' = 'all'
): StuckUploadRow[] {
  const where =
    kind === 'pending'
      ? `WHERE retry_count < ${MAX_RETRIES}`
      : kind === 'failed'
        ? `WHERE retry_count >= ${MAX_RETRIES}`
        : '';

  const { data } = useQuery<StuckUploadRow>(
    `SELECT id, parent_table, parent_id, bucket, storage_path, local_uri,
            content_type, retry_count, last_error, next_attempt_at, created_at
       FROM pending_uploads
       ${where}
       ORDER BY COALESCE(created_at, '') DESC`
  );

  return data ?? [];
}

/**
 * Reset a row's retry counter so processQueue picks it back up on
 * the next drain. The Me-tab "Try again" button calls this; the user
 * does NOT have to wait for the periodic 60s drain — we kick a drain
 * immediately after the reset for instant feedback.
 *
 * Idempotent — re-clicking is safe.
 */
export async function retryUpload(
  db: AbstractPowerSyncDatabase,
  pendingId: string
): Promise<void> {
  try {
    await db.execute(
      `UPDATE pending_uploads
          SET retry_count = 0,
              last_error = NULL,
              next_attempt_at = ?
        WHERE id = ?`,
      [Date.now(), pendingId]
    );
    logInfo('uploadQueue.retry', 'reset for retry', {
      pending_id: pendingId,
    });
    // Kick a drain so the user sees movement now instead of in 60 s.
    void processQueue(db).catch((err) => {
      logWarn('uploadQueue.retry', 'kick-drain failed', err, {
        pending_id: pendingId,
      });
    });
  } catch (err) {
    logError('uploadQueue.retry', 'reset failed', err, {
      pending_id: pendingId,
    });
    throw err;
  }
}

/**
 * Discard a queued upload. Deletes the queue row, the local file,
 * and (when applicable) flips the parent row's upload_state to
 * 'failed' so the gallery doesn't keep showing a "syncing" badge.
 *
 * Used when the user has decided the captured asset is no longer
 * worth retrying (e.g. they've manually re-shot it, or the bytes
 * are corrupt). Destructive — caller MUST confirm via Alert.alert
 * before invoking.
 */
export async function discardUpload(
  db: AbstractPowerSyncDatabase,
  pendingId: string
): Promise<void> {
  // Look up the row first so we know the parent + local file path.
  let row: StuckUploadRow | null = null;
  try {
    row = await db.getOptional<StuckUploadRow>(
      `SELECT id, parent_table, parent_id, bucket, storage_path, local_uri,
              content_type, retry_count, last_error, next_attempt_at, created_at
         FROM pending_uploads
        WHERE id = ?`,
      [pendingId]
    );
  } catch (err) {
    logWarn('uploadQueue.discard', 'lookup failed', err, {
      pending_id: pendingId,
    });
  }

  // Best-effort: flip parent's upload_state for field_media so the
  // gallery thumb shows a 'failed' badge instead of pretending it's
  // still pending.
  if (row?.parent_table === 'field_media') {
    try {
      await db.execute(
        `UPDATE field_media SET upload_state = 'failed' WHERE id = ?`,
        [row.parent_id]
      );
    } catch (err) {
      logWarn('uploadQueue.discard', 'parent fail-flip failed', err, {
        pending_id: pendingId,
      });
    }
  } else if (row?.parent_table === 'job_files') {
    try {
      await db.execute(
        `UPDATE job_files SET upload_state = 'failed' WHERE id = ?`,
        [row.parent_id]
      );
    } catch (err) {
      logWarn('uploadQueue.discard', 'parent fail-flip failed', err, {
        pending_id: pendingId,
      });
    }
  }

  try {
    await db.execute(`DELETE FROM pending_uploads WHERE id = ?`, [pendingId]);
  } catch (err) {
    logError('uploadQueue.discard', 'queue row delete failed', err, {
      pending_id: pendingId,
    });
    throw err;
  }

  if (row?.local_uri) {
    try {
      await FileSystem.deleteAsync(row.local_uri, { idempotent: true });
    } catch (err) {
      // Already gone, or filesystem permission glitch — log + continue.
      // The DB row is the source of truth; an orphan file is fine.
      logWarn('uploadQueue.discard', 'local file delete failed', err, {
        pending_id: pendingId,
        local_uri: row.local_uri,
      });
    }
  }

  logInfo('uploadQueue.discard', 'discarded', {
    pending_id: pendingId,
    parent_table: row?.parent_table ?? 'unknown',
    parent_id: row?.parent_id ?? null,
    retry_count: row?.retry_count ?? null,
  });
}

/**
 * Provider-level mount hook. Wires:
 *   - Initial drain on mount (covers app launch after offline period)
 *   - Drain on every online transition
 *   - Periodic drain every PROCESS_INTERVAL_MS while online (catches
 *     transient errors that didn't trip the network listener — e.g.
 *     a partial Supabase outage where NetInfo says "online")
 *
 * Mount once in app/_layout.tsx after the DatabaseProvider so
 * usePowerSync resolves.
 */
const PROCESS_INTERVAL_MS = 60_000;

export function useUploadQueueDrainer(): void {
  const db = usePowerSync();
  const [, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;

    const drainOnce = async () => {
      try {
        await processQueue(db);
        if (mounted) setTick((n) => n + 1);
      } catch (err) {
        logError('uploadQueue.drain', 'unexpected failure', err);
      }
    };

    // Initial drain — covers "app just launched, offline session
    // captured 5 photos."
    void drainOnce();

    // Network restore — covers "we were offline, just got LTE."
    const unsub = subscribeToOnline((online) => {
      if (online) void drainOnce();
    });

    // Periodic — covers "Supabase had a partial outage, NetInfo
    // didn't notice."
    const interval = setInterval(() => void drainOnce(), PROCESS_INTERVAL_MS);

    return () => {
      mounted = false;
      unsub();
      clearInterval(interval);
    };
  }, [db]);
}
