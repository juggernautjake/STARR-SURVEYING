/**
 * Job + point file attachments — F5 generic file capture.
 *
 * Per the user's requirement: "make sure we can upload audio and
 * videos and pictures and files to job or specific points in a job."
 * field_media handles photo/voice/video; this module is the catch-
 * all for everything else surveyors need to attach (PDFs, CSVs,
 * Trimble JobXML exports, scope-of-work amendments, third-party
 * survey records, scanned plans, etc.).
 *
 * Pipeline:
 *
 *   1. ensureFilePermission() — expo-document-picker is permission-
 *      free on most platforms; this is reserved for future iCloud /
 *      Google-Drive provider hand-offs.
 *   2. pickAndAttachFile(...) — opens DocumentPicker, INSERTs a
 *      job_files row with upload_state='pending', and enqueues the
 *      bytes through the existing lib/uploadQueue.ts so offline
 *      captures persist + retry on reception restore.
 *   3. List + delete via reactive PowerSync queries.
 *
 * Storage path convention mirrors field_media:
 *   {user_id}/{point_id_or_job_id}-{file_id}-{sanitised_name}
 * The leading folder MUST equal auth.uid()::text per the storage
 * RLS policy in seeds/226.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useCallback, useEffect, useMemo } from 'react';
import { usePowerSync, useQuery } from '@powersync/react';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { logError, logInfo, logWarn } from './log';
import { enqueueAndAttempt } from './uploadQueue';
import { randomUUID } from './uuid';

export type JobFile = AppDatabase['job_files'];

export const FILES_BUCKET = 'starr-field-files';

/** Per the seeds/226 file_size_limit on the bucket. */
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Read hooks ──────────────────────────────────────────────────────────────

/**
 * Reactive list of files attached to a data point. Used by the
 * point detail screen + admin viewer.
 */
export function usePointFiles(
  pointId: string | null | undefined
): { files: JobFile[]; isLoading: boolean } {
  const queryParams = useMemo(() => (pointId ? [pointId] : []), [pointId]);
  const { data, isLoading, error } = useQuery<JobFile>(
    `SELECT * FROM job_files
      WHERE data_point_id = ?
      ORDER BY COALESCE(created_at, '') DESC`,
    queryParams
  );
  useEffect(() => {
    if (error) {
      logError('jobFiles.usePointFiles', 'query failed', error, {
        point_id: pointId ?? null,
      });
    }
  }, [error, pointId]);
  return { files: data ?? [], isLoading: !!pointId && isLoading };
}

/** Job-level files (no point attached). */
export function useJobLevelFiles(
  jobId: string | null | undefined
): { files: JobFile[]; isLoading: boolean } {
  const queryParams = useMemo(() => (jobId ? [jobId] : []), [jobId]);
  const { data, isLoading, error } = useQuery<JobFile>(
    `SELECT * FROM job_files
      WHERE job_id = ?
        AND data_point_id IS NULL
      ORDER BY COALESCE(created_at, '') DESC`,
    queryParams
  );
  useEffect(() => {
    if (error) {
      logError('jobFiles.useJobLevelFiles', 'query failed', error, {
        job_id: jobId ?? null,
      });
    }
  }, [error, jobId]);
  return { files: data ?? [], isLoading: !!jobId && isLoading };
}

// ── Capture ─────────────────────────────────────────────────────────────────

export interface PickAndAttachInput {
  /** Required — every file belongs to a job. */
  jobId: string;
  /** Optional — null = job-level file. */
  dataPointId: string | null;
  /** Optional human-friendly description (free text). */
  description?: string | null;
}

export interface AttachedFile {
  id: string;
  storagePath: string;
}

/** Sanitize a user-typed filename for a storage path. Strips path
 *  separators, collapses whitespace, caps length. */
function sanitiseName(raw: string): string {
  const cleaned = raw
    .replace(/[/\\]+/g, '_')
    .replace(/[^A-Za-z0-9._\- ]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return cleaned || 'file';
}

/** Best-effort extension probe — picker uri + mime fallback. */
function inferExtension(uri: string, mime: string | null): string {
  const lower = uri.toLowerCase();
  const m = lower.match(/\.([a-z0-9]{1,8})(?:$|[?#])/);
  if (m) return `.${m[1]}`;
  if (mime) {
    const map: Record<string, string> = {
      'application/pdf': '.pdf',
      'text/csv': '.csv',
      'text/plain': '.txt',
      'application/zip': '.zip',
      'application/json': '.json',
      'application/xml': '.xml',
      'image/png': '.png',
      'image/jpeg': '.jpg',
    };
    if (map[mime]) return map[mime];
  }
  return '';
}

/**
 * Open the OS document picker, INSERT a job_files row, then enqueue
 * the upload. Mirrors useAttachPhoto / useAttachVoice exactly so the
 * offline-first contract is identical: row visible in the gallery
 * the moment it's captured, bytes upload when reception returns.
 *
 * Throws when:
 *   - the user isn't signed in
 *   - jobId / dataPointId aren't valid UUIDs
 *   - the file exceeds MAX_FILE_BYTES (100 MB bucket cap)
 *   - the picker / DB insert fails (caller surfaces to the UI)
 *
 * Returns null when the user cancels the picker.
 */
export function usePickAndAttachFile(): (
  input: PickAndAttachInput
) => Promise<AttachedFile | null> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async ({ jobId, dataPointId, description }) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('jobFiles.attach', 'no session', err);
        throw err;
      }
      if (!UUID_REGEX.test(jobId)) {
        const err = new Error(`Invalid job id: ${jobId}`);
        logError('jobFiles.attach', 'invalid job id', err, { job_id: jobId });
        throw err;
      }
      if (dataPointId != null && !UUID_REGEX.test(dataPointId)) {
        const err = new Error(`Invalid data point id: ${dataPointId}`);
        logError('jobFiles.attach', 'invalid point id', err, {
          data_point_id: dataPointId,
        });
        throw err;
      }

      logInfo('jobFiles.attach', 'attempt', {
        job_id: jobId,
        data_point_id: dataPointId,
      });

      // expo-document-picker doesn't require a runtime permission on
      // iOS/Android (the OS picker handles its own access). copyToCache
      // = true ensures the URI we hand to the upload queue is readable
      // — some Android providers return content:// URIs that vanish
      // outside the picker's lifecycle.
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        logInfo('jobFiles.attach', 'cancelled');
        return null;
      }
      const asset = result.assets?.[0];
      if (!asset) {
        logWarn('jobFiles.attach', 'picker returned no asset');
        return null;
      }

      // File-size guard. The bucket cap is 100 MB; the upload would
      // 4xx anyway, but failing fast saves bandwidth + gives the user
      // a clear "this file is too large" message.
      let fileSize = asset.size ?? null;
      if (fileSize == null) {
        try {
          const info = await FileSystem.getInfoAsync(asset.uri);
          if (info.exists && 'size' in info) fileSize = info.size;
        } catch (err) {
          logWarn('jobFiles.attach', 'size probe failed', err);
        }
      }
      if (fileSize != null && fileSize > MAX_FILE_BYTES) {
        const err = new Error(
          `File too large (${Math.round(fileSize / (1024 * 1024))} MB > 100 MB cap).`
        );
        logWarn('jobFiles.attach', 'over size cap', err, {
          file_size: fileSize,
        });
        throw err;
      }

      const fileId = randomUUID();
      const parentTag = dataPointId ?? `job-${jobId}`;
      const sanitised = sanitiseName(asset.name ?? 'file');
      const ext = inferExtension(asset.uri, asset.mimeType ?? null);
      const baseName = sanitised.replace(/\.[A-Za-z0-9]{1,8}$/, '');
      const storagePath = `${userId}/${parentTag}-${fileId}-${baseName}${ext}`;
      const nowIso = new Date().toISOString();

      try {
        await db.execute(
          `INSERT INTO job_files (
             id, job_id, data_point_id, name, description,
             storage_path, content_type, file_size_bytes,
             upload_state, created_by, created_at, updated_at,
             client_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fileId,
            jobId,
            dataPointId,
            asset.name ?? sanitised,
            description ?? null,
            storagePath,
            asset.mimeType ?? null,
            fileSize ?? null,
            'pending',
            userId,
            nowIso,
            nowIso,
            fileId, // client_id
          ]
        );
      } catch (err) {
        logError('jobFiles.attach', 'db insert failed', err, {
          file_id: fileId,
          job_id: jobId,
          point_id: dataPointId,
        });
        throw err;
      }

      const enqueueResult = await enqueueAndAttempt(db, {
        parentTable: 'job_files',
        parentId: fileId,
        bucket: FILES_BUCKET,
        storagePath,
        localFileUri: asset.uri,
        contentType: asset.mimeType ?? 'application/octet-stream',
        scope: 'jobFiles.attach',
      });

      logInfo('jobFiles.attach', 'success', {
        file_id: fileId,
        job_id: jobId,
        point_id: dataPointId,
        bytes: fileSize ?? null,
        uploaded_now: enqueueResult.uploadedNow,
      });

      return { id: fileId, storagePath };
    },
    [db, session]
  );
}

/**
 * Hard-delete an attached file. Owner-scoped — RLS allows only the
 * creator. Storage cleanup is best-effort. If the file is pinned,
 * the local copy + pinned_files row are also dropped so we don't
 * leak disk after the parent row is gone.
 */
export function useDeleteJobFile(): (file: JobFile) => Promise<void> {
  const db = usePowerSync();

  return useCallback(
    async (file) => {
      try {
        // Drop pin first — the localOnly row + the FS file. We do
        // this BEFORE deleting the parent row so the pinned_files
        // FK reference is consistent if anything in here throws.
        const pinned = await db.get<{ local_uri: string }>(
          `SELECT local_uri FROM pinned_files WHERE job_file_id = ?`,
          [file.id]
        );
        if (pinned) {
          await db.execute(
            `DELETE FROM pinned_files WHERE job_file_id = ?`,
            [file.id]
          );
          if (pinned.local_uri) {
            try {
              await FileSystem.deleteAsync(pinned.local_uri, {
                idempotent: true,
              });
            } catch (fsErr) {
              logWarn('jobFiles.delete', 'pinned unlink failed', fsErr, {
                file_id: file.id,
              });
            }
          }
        }

        await db.execute(`DELETE FROM job_files WHERE id = ?`, [file.id]);
        logInfo('jobFiles.delete', 'deleted', {
          file_id: file.id,
          had_pin: !!pinned,
        });
      } catch (err) {
        logError('jobFiles.delete', 'failed', err, { file_id: file.id });
        throw err;
      }
    },
    [db]
  );
}
