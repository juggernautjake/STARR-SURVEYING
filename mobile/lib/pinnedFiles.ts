/**
 * Pin job_files for offline access.
 *
 * Closes the F5 deferral *"Pin-to-device for offline access — files
 * are kept on disk through the queue's `documentDirectory` copy
 * until upload succeeds, then deleted. Persistent pin (re-download
 * for re-read offline) is F5 polish."*
 *
 * UX shape:
 *   - On the per-point detail screen, every file row has a 📍 toggle.
 *   - Tap-pin → fetch the bytes via signed URL → write to a stable
 *     per-file path under documentDirectory/pinned/ → INSERT a
 *     pinned_files row.
 *   - Tap-unpin → DELETE the pinned_files row + best-effort FS
 *     unlink. Frees storage; the parent job_files row is untouched.
 *   - Tap the file body → open. Pinned reads use the local file
 *     directly (instant, no network). Unpinned reads sign a URL
 *     and pipe through expo-sharing so the OS picks the renderer
 *     (Quick Look on iOS, the system intent on Android).
 *
 * Lifecycle invariants:
 *   - One pinned_files row per job_file_id (enforced by SELECT
 *     before INSERT in pinFile()). Re-pinning a stale path
 *     overwrites the local file + bumps pinned_at.
 *   - Deleting the parent job_files row via useDeleteJobFile() also
 *     drops the pin (handled in jobFiles.ts).
 *   - Storage budget visible via usePinnedStorageStats() so the
 *     user can spot a runaway pin set on the Me tab.
 *
 * Logging:
 *   - Every pin / unpin / open emits a structured log line so an
 *     ops query can answer "is anyone actually using this?" and
 *     "which files fail to fetch?".
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';

import { FILES_BUCKET, type JobFile } from './jobFiles';
import { logError, logInfo, logWarn } from './log';
import { isOnlineNow } from './networkState';
import { supabase } from './supabase';

/** Subdirectory under documentDirectory for pinned files. Created
 *  lazily on the first pin so a fresh install with no pins never
 *  needs to call FileSystem.makeDirectoryAsync. */
const PINNED_DIR = 'pinned';

/** Signed-URL TTL for the pin-time fetch. The URL only needs to
 *  outlast a single fetch — once the bytes are local, the URL
 *  goes away. 5 min is generous against a slow LTE pull. */
const PIN_FETCH_TTL_SEC = 60 * 5;

interface PinnedRow {
  job_file_id: string;
  local_uri: string;
  file_size_bytes: number | null;
  pinned_at: string;
}

/** Stable per-file path. Keyed by job_files.id so re-pinning is
 *  idempotent (same path) — the second pin overwrites the first
 *  without leaking old bytes. */
function pinnedPathFor(jobFileId: string, name: string | null): string {
  // Preserve the file extension so the OS picks the right renderer
  // when shareAsync hands it off. Strip any path-syntax characters
  // that could escape the pinned dir.
  const ext = (name?.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '').replace(
    /[^.A-Za-z0-9]/g,
    ''
  );
  return `${FileSystem.documentDirectory}${PINNED_DIR}/${jobFileId}${ext}`;
}

async function ensurePinnedDir(): Promise<void> {
  const dir = `${FileSystem.documentDirectory}${PINNED_DIR}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/** Reactive: is this file pinned right now? Drives the 📍 badge
 *  + the "Pin / Unpin" button label. Returns false while the
 *  query is loading. */
export function useIsPinned(jobFileId: string | null | undefined): boolean {
  const params = useMemo(
    () => (jobFileId ? [jobFileId] : []),
    [jobFileId]
  );
  const { data } = useQuery<{ count: number }>(
    `SELECT COUNT(*) AS count FROM pinned_files WHERE job_file_id = ?`,
    params
  );
  if (!jobFileId) return false;
  return (data?.[0]?.count ?? 0) > 0;
}

/** Reactive aggregate for the Me-tab Storage panel. */
export function usePinnedStorageStats(): {
  count: number;
  totalBytes: number;
} {
  const { data } = useQuery<{ count: number; bytes: number }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(file_size_bytes), 0) AS bytes
     FROM pinned_files`
  );
  return {
    count: data?.[0]?.count ?? 0,
    totalBytes: data?.[0]?.bytes ?? 0,
  };
}

/** Reactive list of pinned rows joined to their parent job_files.
 *  Powers the optional Me-tab "Pinned files" panel where the user
 *  can review + bulk-unpin. */
export function usePinnedFilesWithMeta(): {
  rows: Array<PinnedRow & { name: string | null; content_type: string | null }>;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<
    PinnedRow & { name: string | null; content_type: string | null }
  >(
    `SELECT pf.job_file_id, pf.local_uri, pf.file_size_bytes, pf.pinned_at,
            jf.name, jf.content_type
       FROM pinned_files pf
       LEFT JOIN job_files jf ON jf.id = pf.job_file_id
      ORDER BY pf.pinned_at DESC`
  );
  return { rows: data ?? [], isLoading };
}

/**
 * Pin a job_files row to the device. Resolves a signed URL,
 * downloads the bytes to documentDirectory/pinned/<id>.<ext>, and
 * INSERTs a pinned_files row.
 *
 * Throws on:
 *   - offline (we need network to fetch the bytes — mention this
 *     in the alert so users know to re-pin when reception returns)
 *   - signed-URL failure (bucket misconfig, RLS deny)
 *   - HTTP failure on the actual fetch (TTL expired, server 5xx)
 *   - filesystem failure (storage full)
 */
export function usePinFile(): (file: JobFile) => Promise<void> {
  const db = usePowerSync();
  return useCallback(
    async (file) => {
      if (!file.id || !file.storage_path) {
        const err = new Error('Cannot pin a file with no storage path.');
        logError('pinnedFiles.pin', 'missing path', err, { file_id: file.id });
        throw err;
      }
      if (file.upload_state !== 'done') {
        // Pinning a not-yet-uploaded row is technically possible (the
        // upload queue's local copy could be hard-linked here), but
        // the simple+correct version waits for the upload to settle
        // first. Surveyors who pin before upload completes get the
        // same offline-read access naturally — until the upload
        // succeeds the queue's copy is on disk anyway.
        const err = new Error(
          'Wait for the upload to finish before pinning.'
        );
        logWarn('pinnedFiles.pin', 'not done yet', err, {
          file_id: file.id,
          state: file.upload_state ?? null,
        });
        throw err;
      }
      if (!isOnlineNow()) {
        const err = new Error(
          'No reception. Pin this file when you have signal — the bytes need to download once.'
        );
        logInfo('pinnedFiles.pin', 'offline', { file_id: file.id });
        throw err;
      }

      logInfo('pinnedFiles.pin', 'attempt', {
        file_id: file.id,
        bytes: file.file_size_bytes ?? null,
      });

      const { data, error } = await supabase.storage
        .from(FILES_BUCKET)
        .createSignedUrl(file.storage_path, PIN_FETCH_TTL_SEC);
      if (error || !data?.signedUrl) {
        logError('pinnedFiles.pin', 'sign failed', error ?? null, {
          file_id: file.id,
          storage_path: file.storage_path,
        });
        throw new Error(error?.message ?? 'Could not sign download URL.');
      }

      await ensurePinnedDir();
      const localPath = pinnedPathFor(file.id, file.name ?? null);

      // Download via FileSystem so the bytes are streamed to disk
      // rather than buffered in JS memory. A 50 MB plat would OOM
      // a fetch().arrayBuffer() approach; downloadAsync is the
      // production-safe path.
      try {
        const { uri, status } = await FileSystem.downloadAsync(
          data.signedUrl,
          localPath
        );
        if (status >= 400) {
          throw new Error(`Download HTTP ${status}`);
        }
        // Best-effort byte count from FS so the Me-tab summary
        // stays correct even when file_size_bytes was null on the
        // parent row (legacy uploads). FS truth wins.
        const info = await FileSystem.getInfoAsync(uri, { size: true });
        const bytes =
          info.exists && info.size != null ? info.size : file.file_size_bytes;

        // Idempotent INSERT — overwrite an existing row for this
        // file id so re-pinning a renamed file doesn't leak two
        // rows. SQLite has no UPSERT here without an explicit
        // PRIMARY KEY on job_file_id, so do it as a transaction.
        const nowIso = new Date().toISOString();
        await db.writeTransaction(async (tx) => {
          await tx.execute(
            `DELETE FROM pinned_files WHERE job_file_id = ?`,
            [file.id]
          );
          await tx.execute(
            `INSERT INTO pinned_files (
               job_file_id, local_uri, file_size_bytes, pinned_at
             ) VALUES (?, ?, ?, ?)`,
            [file.id, uri, bytes ?? null, nowIso]
          );
        });

        logInfo('pinnedFiles.pin', 'success', {
          file_id: file.id,
          bytes: bytes ?? null,
        });
      } catch (err) {
        // Try to clean up a half-written file so we don't leak
        // disk on a fetch failure. Best-effort.
        try {
          await FileSystem.deleteAsync(localPath, { idempotent: true });
        } catch {
          /* ignore — we're already in the error path */
        }
        logError('pinnedFiles.pin', 'download failed', err, {
          file_id: file.id,
        });
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    [db]
  );
}

/** Drop the pin + delete the local file. The parent job_files row
 *  is untouched. */
export function useUnpinFile(): (jobFileId: string) => Promise<void> {
  const db = usePowerSync();
  return useCallback(
    async (jobFileId) => {
      // Read the local path BEFORE the DELETE so we can unlink
      // afterwards even when PowerSync's reactive query has
      // already fired.
      const row = await db.get<{ local_uri: string }>(
        `SELECT local_uri FROM pinned_files WHERE job_file_id = ?`,
        [jobFileId]
      );
      await db.execute(
        `DELETE FROM pinned_files WHERE job_file_id = ?`,
        [jobFileId]
      );
      if (row?.local_uri) {
        try {
          await FileSystem.deleteAsync(row.local_uri, { idempotent: true });
        } catch (err) {
          // FS unlink failures are not user-facing — the row is
          // gone, the file will get cleaned up on next OS sweep.
          // Log a warn breadcrumb so a leaked dir is visible.
          logWarn('pinnedFiles.unpin', 'unlink failed', err, {
            file_id: jobFileId,
          });
        }
      }
      logInfo('pinnedFiles.unpin', 'success', { file_id: jobFileId });
    },
    [db]
  );
}

/**
 * Open a file via expo-sharing's "open in…" dialog.
 *   - Pinned: shareAsync on the local URI. Instant + offline-safe.
 *   - Not pinned: sign URL + downloadAsync to cacheDirectory + share.
 *     The cached copy is OS-cleaned on its own schedule; this is the
 *     "pay once to look at it" path.
 *
 * Throws on:
 *   - sharing not available on this device
 *   - offline + not pinned (no way to fetch the bytes)
 *   - signed URL / fetch failure
 */
export function useOpenJobFile(): (file: JobFile) => Promise<void> {
  const db = usePowerSync();
  return useCallback(
    async (file) => {
      if (!file.id || !file.storage_path) {
        throw new Error('File is missing a storage path.');
      }

      logInfo('pinnedFiles.open', 'attempt', {
        file_id: file.id,
        upload_state: file.upload_state ?? null,
      });

      // Prefer the local pinned copy.
      const pinned = await db.get<{ local_uri: string }>(
        `SELECT local_uri FROM pinned_files WHERE job_file_id = ?`,
        [file.id]
      );
      let openUri = pinned?.local_uri ?? null;

      if (!openUri) {
        if (!isOnlineNow()) {
          const err = new Error(
            'No reception, and this file isn’t pinned. Pin it next time you have signal.'
          );
          logInfo('pinnedFiles.open', 'offline + not pinned', {
            file_id: file.id,
          });
          throw err;
        }
        const { data, error } = await supabase.storage
          .from(FILES_BUCKET)
          .createSignedUrl(file.storage_path, PIN_FETCH_TTL_SEC);
        if (error || !data?.signedUrl) {
          logError('pinnedFiles.open', 'sign failed', error ?? null, {
            file_id: file.id,
          });
          throw new Error(error?.message ?? 'Could not sign download URL.');
        }
        // Stream into cacheDirectory — OS-managed; we don't track
        // it. If the user opens twice we'll re-download; that's a
        // fine UX for one-shot reads.
        const cachePath = `${FileSystem.cacheDirectory}open-${file.id}-${Date.now()}`;
        const { uri, status } = await FileSystem.downloadAsync(
          data.signedUrl,
          cachePath
        );
        if (status >= 400) {
          logError(
            'pinnedFiles.open',
            'fetch failed',
            new Error(`HTTP ${status}`),
            { file_id: file.id }
          );
          throw new Error(`Download failed (HTTP ${status})`);
        }
        openUri = uri;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error(
          'This device can’t open files via the share sheet.'
        );
      }
      await Sharing.shareAsync(openUri, {
        UTI: file.content_type ?? undefined,
        mimeType: file.content_type ?? undefined,
        dialogTitle: file.name ?? 'File',
      });
      logInfo('pinnedFiles.open', 'success', {
        file_id: file.id,
        from_pin: pinned != null,
      });
    },
    [db]
  );
}

/** Hook used by `useEffect` cleanup paths. Drops the pin row + file
 *  when the parent job_files row is being deleted. Safe to call
 *  even when nothing was pinned — DELETE is a no-op. */
export function useDropPinForFile(): (jobFileId: string) => Promise<void> {
  return useUnpinFile();
}

/** Initial-mount cleanup: any pinned_files row whose local_uri is
 *  no longer on disk (user deleted via Files app, or the OS reaped
 *  the dir during a low-storage event) is reaped here. Called once
 *  at app startup from _layout.tsx. */
export function reconcilePinnedFiles(
  db: ReturnType<typeof usePowerSync>
): Promise<void> {
  return (async () => {
    try {
      const rows = await db.getAll<{ job_file_id: string; local_uri: string }>(
        `SELECT job_file_id, local_uri FROM pinned_files`
      );
      let dropped = 0;
      for (const row of rows) {
        const info = await FileSystem.getInfoAsync(row.local_uri);
        if (!info.exists) {
          await db.execute(
            `DELETE FROM pinned_files WHERE job_file_id = ?`,
            [row.job_file_id]
          );
          dropped += 1;
        }
      }
      if (dropped > 0) {
        logInfo('pinnedFiles.reconcile', 'dropped stale rows', { dropped });
      }
    } catch (err) {
      logWarn('pinnedFiles.reconcile', 'reconcile failed', err);
    }
  })();
}

/** Convenience hook: wires `reconcilePinnedFiles` to mount-once
 *  semantics so callers can drop one line into the root layout
 *  without managing the effect themselves. */
export function usePinnedFilesReconciler(): void {
  const db = usePowerSync();
  useEffect(() => {
    void reconcilePinnedFiles(db);
  }, [db]);
}
