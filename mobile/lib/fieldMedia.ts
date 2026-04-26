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
  uploadToBucket,
  type ImageSource,
} from './storage/mediaUpload';
import { useSignedUrl } from './storage/useSignedUrl';
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

      // 4. Upload to the photos bucket.
      await uploadToBucket({
        bucket: PHOTO_BUCKET,
        path: storagePath,
        fileUri: picked.uri,
        contentType: picked.contentType,
        scope: 'fieldMedia.attachPhoto',
      });

      // 5. Determine the next position on the point. Cheap because
      //    the local SQLite mirror has every row already; we don't
      //    need a transaction since we're appending, and F3 #3 only
      //    captures one photo per call.
      const positionRow = await db.getOptional<{ next_position: number }>(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
         FROM field_media
         WHERE ${dataPointId ? 'data_point_id = ?' : 'data_point_id IS NULL AND job_id = ?'}`,
        [dataPointId ?? jobId]
      );
      const position = positionRow?.next_position ?? 0;

      // 6. INSERT the row. PowerSync replays against Supabase; the
      //    media is visible in local queries immediately.
      const nowIso = new Date().toISOString();
      try {
        await db.execute(
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
            // Use the same path for thumbnail until F3 polish generates
            // a real (smaller) thumbnail. Storage signed-URLs are the
            // same either way.
            storagePath,
            // Original tier is for high-res WiFi-only sync (plan §5.4)
            // — null until F3 polish wires the dual-tier upload path.
            null,
            // Annotated overlay — populated by F3 #6 photo annotation.
            null,
            'done',
            burstGroupId ?? null,
            position,
            picked.fileSize ?? null,
            pos?.latitude ?? null,
            pos?.longitude ?? null,
            // Compass heading needs expo-sensors' Magnetometer; F3
            // polish item.
            null,
            nowIso,
            nowIso,
            userId,
            nowIso,
          ]
        );
      } catch (err) {
        logError('fieldMedia.attachPhoto', 'db insert failed', err, {
          media_id: mediaId,
          point_id: dataPointId,
          job_id: jobId,
        });
        // Best-effort orphan cleanup so the bucket doesn't accumulate
        // uploaded-but-unrecorded photos.
        await removeFromBucket({
          bucket: PHOTO_BUCKET,
          path: storagePath,
          scope: 'fieldMedia.attachPhoto',
        });
        throw err;
      }

      logInfo('fieldMedia.attachPhoto', 'success', {
        media_id: mediaId,
        point_id: dataPointId,
        position,
        bytes: picked.fileSize ?? null,
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

      // Storage cleanup — sweep both the display tier and (when
      // F3 polish lands the dual upload) the original tier.
      const paths = [media.storage_url, media.original_url, media.annotated_url]
        .filter((p): p is string => typeof p === 'string' && p.length > 0);
      for (const path of paths) {
        await removeFromBucket({
          bucket: PHOTO_BUCKET,
          path,
          scope: 'fieldMedia.delete',
        });
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
  media: Pick<FieldMedia, 'storage_url'> | null | undefined
): string | null {
  return useSignedUrl(PHOTO_BUCKET, media?.storage_url ?? null);
}
