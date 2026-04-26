/**
 * Field-media library — photo / video / voice attachments to data
 * points (and to jobs directly per plan §5.4 "Job-level photo upload").
 *
 * Phase F3 #3 ships photo capture + list + delete. Video and voice
 * land in F4. Annotation overlay (arrows / circles / text) lands in
 * F3 #6 — for now, annotated_url stays null and the original is
 * always preserved unmodified per plan §5.4.
 *
 * Storage strategy (v1):
 *   - One upload per capture, to the medium-quality tier.
 *     storage_url + thumbnail_url both point at the same path; F3
 *     polish will generate a real thumbnail and add WiFi-only
 *     original-tier sync.
 *   - Path convention: {user_id}/{point_id_or_job_id}-{media_id}.jpg
 *     so the per-user-folder RLS works (leading folder MUST equal
 *     auth.uid()::text on insert per seeds/221_*.sql).
 *
 * Identity: created_by = auth.users.id (UUID), same as F2 receipts +
 * F3 data points. Mobile reads from session.user.id.
 */
import { usePowerSync, useQuery } from '@powersync/react';
import { useCallback, useEffect, useMemo } from 'react';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { getCurrentPositionOrNull } from './location';
import { logError, logInfo } from './log';
import {
  pickAndCompress,
  removeFromBucket,
  type ImageSource,
} from './storage/mediaUpload';
import { useSignedUrl } from './storage/useSignedUrl';
import { saveCopyToDeviceIfEnabled } from './deviceLibrary';
import { enqueueAndAttempt, usePendingUploadLocalUri } from './uploadQueue';
import { randomUUID } from './uuid';

export type FieldMedia = AppDatabase['field_media'];

export type MediaType = 'photo' | 'video' | 'voice';
export type UploadState = 'pending' | 'wifi-waiting' | 'done' | 'failed';

export const PHOTO_BUCKET = 'starr-field-photos';
// Plan §5.4: data-point photos preserve detail for surveying review;
// 2400 px on the long edge is sharper than receipts (1600) without
// pushing typical JPEG file sizes much past 600 KB.
const PHOTO_MAX_DIMENSION_PX = 2400;
const PHOTO_QUALITY = 0.85;

// UUID v4 + v5 + v7 shapes — anything `gen_random_uuid()` produces on
// the server side, plus what `randomUUID()` produces client-side.
// Validating against this before path construction prevents '/' or
// other path-syntax characters from sneaking into a bucket key.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AttachPhotoInput {
  /** Required — job the photo belongs to. */
  jobId: string;
  /** Optional — the data point the photo attaches to. Null = job-
   *  level photo (plan §5.4 "Job-level photo upload" — F3 #5). */
  dataPointId: string | null;
  /** Source — 'camera' opens the OS camera; 'library' opens the picker. */
  source: ImageSource;
  /** Optional — when set, all photos in the same burst share the id
   *  so the admin timeline can group them. F3 polish flips this on
   *  for "burst mode"; F3 #3 leaves it null (one shot per call). */
  burstGroupId?: string | null;
}

export interface AttachedPhoto {
  /** UUID of the inserted field_media row. */
  id: string;
  /** Storage path (relative to the bucket) — useful for previews. */
  storagePath: string;
}

/**
 * Pick + compress + upload a photo, then INSERT a field_media row
 * tied to the given point (or job, for job-level uploads).
 *
 * Returns null when the user cancelled the picker. Throws on
 * permission denial, upload failure, or DB insert failure.
 *
 * The `position` field is auto-assigned: counts existing photos on
 * the point and uses N as the new row's position. F3 polish + the
 * admin gallery use position to render in capture order.
 */
export function useAttachPhoto(): (
  input: AttachPhotoInput
) => Promise<AttachedPhoto | null> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async ({ jobId, dataPointId, source, burstGroupId }) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('fieldMedia.attachPhoto', 'no session', err);
        throw err;
      }

      // Defensive: refuse non-UUID-shaped ids before constructing the
      // storage path. The bucket RLS uses (storage.foldername(name))[1]
      // which splits on '/' — a slash slipping through here would not
      // bypass RLS (the leading folder check still runs against the
      // first segment), but it confuses the failure mode and could
      // bite a future caller. Validate at the source instead.
      if (!UUID_REGEX.test(jobId)) {
        const err = new Error(`Invalid job id: ${jobId}`);
        logError('fieldMedia.attachPhoto', 'invalid job id', err, { job_id: jobId });
        throw err;
      }
      if (dataPointId != null && !UUID_REGEX.test(dataPointId)) {
        const err = new Error(`Invalid data point id: ${dataPointId}`);
        logError('fieldMedia.attachPhoto', 'invalid point id', err, {
          data_point_id: dataPointId,
        });
        throw err;
      }

      logInfo('fieldMedia.attachPhoto', 'attempt', {
        job_id: jobId,
        data_point_id: dataPointId,
        source,
      });

      // 1. Pick + compress via the shared media-upload primitive.
      //    No edit step on data-point photos — the surveyor wants
      //    the full frame preserved (plan §5.4 "store original
      //    locally, upload medium-quality first").
      const picked = await pickAndCompress({
        source,
        scope: 'fieldMedia.attachPhoto',
        maxDimensionPx: PHOTO_MAX_DIMENSION_PX,
        quality: PHOTO_QUALITY,
        allowsEditing: false,
      });
      if (!picked) {
        logInfo('fieldMedia.attachPhoto', 'cancelled');
        return null;
      }

      // 2. Capture phone GPS + compass for the EXIF-equivalent metadata
      //    columns. expo-image-picker's exif option strips this when
      //    set to false (we set false to avoid a slow PHAsset round-
      //    trip), so we re-capture from the location helper. Best-
      //    effort — null on permission denied / no fix.
      const pos = await getCurrentPositionOrNull();

      // 3. Generate IDs + storage path. Path convention is locked by
      //    the storage RLS policy (see seeds/221_*.sql): leading
      //    folder MUST equal auth.uid()::text.
      const mediaId = randomUUID();
      const parentTag = dataPointId ?? `job-${jobId}`;
      const storagePath = `${userId}/${parentTag}-${mediaId}.jpg`;

      // 4. Compute next position + INSERT inside one writeTransaction
      //    so concurrent attaches can't both read the same MAX and
      //    insert at the same position. The local SQLite serialises
      //    transactions so the second caller sees the first's row.
      //    PowerSync's CRUD queue replays the INSERT op server-side.
      //    INSERT runs BEFORE the upload — if the user is offline,
      //    the row still lands in the gallery and the upload queue
      //    drains the photo on next network restore.
      const nowIso = new Date().toISOString();
      try {
        await db.writeTransaction(async (tx) => {
          const positionRow = await tx.get<{ next_position: number }>(
            `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
             FROM field_media
             WHERE ${dataPointId ? 'data_point_id = ?' : 'data_point_id IS NULL AND job_id = ?'}`,
            [dataPointId ?? jobId]
          );
          const position = positionRow?.next_position ?? 0;

          await tx.execute(
            `INSERT INTO field_media (
               id, job_id, data_point_id, media_type,
               storage_url, thumbnail_url, original_url, annotated_url,
               upload_state, burst_group_id, position,
               file_size_bytes,
               device_lat, device_lon, device_compass_heading,
               captured_at, uploaded_at,
               created_by, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              mediaId,
              jobId,
              dataPointId,
              'photo',
              storagePath,
              // Use the same path for thumbnail until F3 polish
              // generates a real (smaller) thumbnail.
              storagePath,
              // Original tier is for high-res WiFi-only sync (plan
              // §5.4) — null until F3 polish wires it.
              null,
              // Annotated overlay — populated by F3 #6.
              null,
              // 'pending' until the upload queue marks it 'done'.
              // Was 'done' eagerly before — that lied to the UI when
              // the synchronous upload failed offline.
              'pending',
              burstGroupId ?? null,
              position,
              picked.fileSize ?? null,
              pos?.latitude ?? null,
              pos?.longitude ?? null,
              // Compass heading needs expo-sensors' Magnetometer; F3 polish.
              null,
              nowIso,
              nowIso,
              userId,
              nowIso,
            ]
          );
        });
      } catch (err) {
        logError('fieldMedia.attachPhoto', 'db insert failed', err, {
          media_id: mediaId,
          point_id: dataPointId,
          job_id: jobId,
        });
        throw err;
      }

      // Enqueue the upload — the queue persists the file to
      // documentDirectory and retries on network restore. The row's
      // upload_state stays 'pending' until the queue flips it to 'done'.
      const enqueueResult = await enqueueAndAttempt(db, {
        parentTable: 'field_media',
        parentId: mediaId,
        bucket: PHOTO_BUCKET,
        storagePath,
        localFileUri: picked.uri,
        contentType: picked.contentType,
        scope: 'fieldMedia.attachPhoto',
      });

      // Best-effort save to the device's Photos app — opt-in via the
      // Me tab. Surveying photos are usually fine to back up, so this
      // is more useful here than for receipts. Fire-and-forget.
      void saveCopyToDeviceIfEnabled(picked.uri, 'fieldMedia.attachPhoto');

      logInfo('fieldMedia.attachPhoto', 'success', {
        media_id: mediaId,
        point_id: dataPointId,
        bytes: picked.fileSize ?? null,
        uploaded_now: enqueueResult.uploadedNow,
      });

      return { id: mediaId, storagePath };
    },
    [db, session]
  );
}

/**
 * List media attached to a data point (or job-level when pointId is
 * null + jobId is set), in capture order. Powers the thumbnail grid
 * on the capture loop and the per-point gallery (F3 #4).
 *
 * Filters by media_type — pass undefined to get all types. F3 #3
 * usually wants 'photo' only.
 */
export function usePointMedia(
  pointId: string | null | undefined,
  mediaType?: MediaType
): {
  media: FieldMedia[];
  isLoading: boolean;
} {
  const queryParams = useMemo(() => {
    if (!pointId) return [];
    return mediaType ? [pointId, mediaType] : [pointId];
  }, [pointId, mediaType]);

  const sql = mediaType
    ? `SELECT * FROM field_media
       WHERE data_point_id = ? AND media_type = ?
       ORDER BY position ASC, COALESCE(captured_at, '') ASC`
    : `SELECT * FROM field_media
       WHERE data_point_id = ?
       ORDER BY position ASC, COALESCE(captured_at, '') ASC`;

  const { data, isLoading, error } = useQuery<FieldMedia>(sql, queryParams);

  useEffect(() => {
    if (error) {
      logError('fieldMedia.usePointMedia', 'query failed', error, {
        point_id: pointId ?? null,
        media_type: mediaType ?? null,
      });
    }
  }, [error, pointId, mediaType]);

  return {
    media: data ?? [],
    isLoading: !!pointId && isLoading,
  };
}

/**
 * List media attached directly to a job (no data point) — F3 #5
 * "Job-level photo upload." Same shape as usePointMedia but the
 * WHERE clause hard-codes `data_point_id IS NULL` so reactive
 * queries don't accidentally surface point-attached photos in the
 * job-level gallery.
 */
export function useJobLevelMedia(
  jobId: string | null | undefined,
  mediaType?: MediaType
): {
  media: FieldMedia[];
  isLoading: boolean;
} {
  const queryParams = useMemo(() => {
    if (!jobId) return [];
    return mediaType ? [jobId, mediaType] : [jobId];
  }, [jobId, mediaType]);

  // ORDER BY created_at — job-level photos don't carry a meaningful
  // `position` (no parent point to enumerate within), so chronological
  // is the natural order.
  const sql = mediaType
    ? `SELECT * FROM field_media
       WHERE job_id = ? AND data_point_id IS NULL AND media_type = ?
       ORDER BY COALESCE(created_at, '') DESC`
    : `SELECT * FROM field_media
       WHERE job_id = ? AND data_point_id IS NULL
       ORDER BY COALESCE(created_at, '') DESC`;

  const { data, isLoading, error } = useQuery<FieldMedia>(sql, queryParams);

  useEffect(() => {
    if (error) {
      logError('fieldMedia.useJobLevelMedia', 'query failed', error, {
        job_id: jobId ?? null,
        media_type: mediaType ?? null,
      });
    }
  }, [error, jobId, mediaType]);

  return {
    media: data ?? [],
    isLoading: !!jobId && isLoading,
  };
}

/**
 * Delete an attached photo. Owner-scoped — RLS allows only the
 * creator to delete (within 24 h per the seed policy). Storage
 * cleanup is best-effort.
 */
export function useDeleteMedia(): (media: FieldMedia) => Promise<void> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async (media) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('fieldMedia.delete', 'no session', err);
        throw err;
      }

      logInfo('fieldMedia.delete', 'attempt', { media_id: media.id });

      try {
        await db.execute(`DELETE FROM field_media WHERE id = ?`, [media.id]);
      } catch (err) {
        logError('fieldMedia.delete', 'db delete failed', err, {
          media_id: media.id,
        });
        throw err;
      }

      // Storage cleanup — sweep display + (when F3 polish lands the
      // dual upload) original + (F3 #6) annotated tiers in parallel.
      // Errors are already logged inside removeFromBucket; parallel
      // is safe.
      const paths = [media.storage_url, media.original_url, media.annotated_url]
        .filter((p): p is string => typeof p === 'string' && p.length > 0);
      if (paths.length > 0) {
        await Promise.all(
          paths.map((path) =>
            removeFromBucket({
              bucket: PHOTO_BUCKET,
              path,
              scope: 'fieldMedia.delete',
            })
          )
        );
      }

      logInfo('fieldMedia.delete', 'success', { media_id: media.id });
    },
    [db, session]
  );
}

/**
 * Resolve a field_media.storage_url (a storage path) to a signed URL.
 * Thin wrapper around the shared useSignedUrl hook so feature screens
 * don't need to know which bucket photos live in.
 */
export function useFieldMediaPhotoUrl(
  media: (Pick<FieldMedia, 'storage_url'> & { id?: string | null }) | null | undefined
): string | null {
  // Local file takes priority while the upload is queued — surveyors
  // can scroll through what they captured before reception returns.
  const pendingLocal = usePendingUploadLocalUri('field_media', media?.id ?? null);
  const signedUrl = useSignedUrl(PHOTO_BUCKET, media?.storage_url ?? null);
  return pendingLocal ?? signedUrl;
}
