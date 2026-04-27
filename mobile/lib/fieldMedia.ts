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
import { getCurrentHeadingOrNull, getCurrentPositionOrNull } from './location';
import { logError, logInfo } from './log';
import {
  pickAndCompress,
  pickVideo,
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
export const VOICE_BUCKET = 'starr-field-voice';
export const VIDEO_BUCKET = 'starr-field-videos';
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
      //    trip), so we re-capture from the location helper. Both are
      //    best-effort (null on denied permission / no fix / sensor
      //    unavailable) and run in parallel so total wall-time is
      //    bounded by the slower of the two timeouts (GPS 8 s,
      //    heading 1.5 s).
      const [pos, heading] = await Promise.all([
        getCurrentPositionOrNull(),
        getCurrentHeadingOrNull(),
      ]);

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
              heading,
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
        has_gps: !!pos,
        has_heading: heading != null,
        uploaded_now: enqueueResult.uploadedNow,
      });

      return { id: mediaId, storagePath };
    },
    [db, session]
  );
}

// ── Voice memo capture ─────────────────────────────────────────────────────

export interface AttachVoiceInput {
  /** Required — job the voice memo belongs to. */
  jobId: string;
  /** Optional — the data point the memo attaches to. Null = job-
   *  level voice memo (free-floating notes about the day). */
  dataPointId: string | null;
  /** file:// URI of the captured M4A. Comes from
   *  lib/voiceRecorder.ts stopRecording().uri. */
  uri: string;
  /** Recorded duration in milliseconds (from stopRecording().durationMs). */
  durationMs: number;
  /** File size in bytes (may be null if FS info wasn't available). */
  fileSize: number | null;
}

export interface AttachedVoice {
  /** UUID of the inserted field_media row. */
  id: string;
  /** Storage path (relative to the bucket). */
  storagePath: string;
}

/**
 * Insert a voice-memo `field_media` row + enqueue the upload. Mirror
 * of `useAttachPhoto` for `media_type='voice'`. Uses the same
 * offline-first contract: row INSERT first → enqueue upload, so the
 * memo is visible in the gallery the moment it's captured even when
 * the device has no reception.
 *
 * Per the user's resilience requirement — "save voice recordings to
 * the app and the data also need to be able to be saved to the phone
 * storage as well." The local file is persisted to documentDirectory
 * by enqueueAndAttempt (survives app kills). Optional MediaLibrary
 * backup via lib/deviceLibrary.ts is fired-forget when the user has
 * opted in on the Me tab.
 */
export function useAttachVoice(): (
  input: AttachVoiceInput
) => Promise<AttachedVoice | null> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async ({ jobId, dataPointId, uri, durationMs, fileSize }) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('fieldMedia.attachVoice', 'no session', err);
        throw err;
      }

      if (!UUID_REGEX.test(jobId)) {
        const err = new Error(`Invalid job id: ${jobId}`);
        logError('fieldMedia.attachVoice', 'invalid job id', err, {
          job_id: jobId,
        });
        throw err;
      }
      if (dataPointId != null && !UUID_REGEX.test(dataPointId)) {
        const err = new Error(`Invalid data point id: ${dataPointId}`);
        logError('fieldMedia.attachVoice', 'invalid point id', err, {
          data_point_id: dataPointId,
        });
        throw err;
      }

      logInfo('fieldMedia.attachVoice', 'attempt', {
        job_id: jobId,
        data_point_id: dataPointId,
        duration_ms: durationMs,
        file_size: fileSize,
      });

      // Best-effort GPS for the EXIF-equivalent metadata. Same as
      // photo capture; null on permission denied / no fix.
      const pos = await getCurrentPositionOrNull();

      const mediaId = randomUUID();
      const parentTag = dataPointId ?? `job-${jobId}`;
      const storagePath = `${userId}/${parentTag}-${mediaId}.m4a`;
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
               duration_seconds, file_size_bytes,
               device_lat, device_lon, device_compass_heading,
               captured_at, uploaded_at,
               created_by, created_at,
               transcription_status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              mediaId,
              jobId,
              dataPointId,
              'voice',
              storagePath,
              null, // no thumbnail tier for audio
              null, // no original (voice is single-tier)
              null, // no annotation overlay
              'pending',
              null, // no burst grouping for voice
              position,
              Math.round(durationMs / 1000),
              fileSize,
              pos?.latitude ?? null,
              pos?.longitude ?? null,
              null, // compass heading — irrelevant for audio
              nowIso,
              nowIso,
              userId,
              nowIso,
              // Mark queued so the worker (worker/src/services/
              // voice-transcription.ts) picks it up after upload
              // completes.
              'queued',
            ]
          );
        });
      } catch (err) {
        logError('fieldMedia.attachVoice', 'db insert failed', err, {
          media_id: mediaId,
          point_id: dataPointId,
          job_id: jobId,
        });
        throw err;
      }

      // Enqueue upload. Same retry / persistence behaviour as photos
      // — file copied to documentDirectory, retried on backoff, marks
      // upload_state='done' on success.
      const enqueueResult = await enqueueAndAttempt(db, {
        parentTable: 'field_media',
        parentId: mediaId,
        bucket: VOICE_BUCKET,
        storagePath,
        localFileUri: uri,
        contentType: 'audio/mp4',
        scope: 'fieldMedia.attachVoice',
      });

      // Phone-storage backup (opt-in). MediaLibrary on iOS will save
      // M4A to the user's Files app under the Starr Field album when
      // available; on Android it goes to /Music or /Documents.
      // Best-effort fire-and-forget; failures log but don't block.
      void saveCopyToDeviceIfEnabled(uri, 'fieldMedia.attachVoice');

      logInfo('fieldMedia.attachVoice', 'success', {
        media_id: mediaId,
        point_id: dataPointId,
        duration_ms: durationMs,
        uploaded_now: enqueueResult.uploadedNow,
      });

      return { id: mediaId, storagePath };
    },
    [db, session]
  );
}

// ── Video capture ──────────────────────────────────────────────────────────

export interface AttachVideoInput {
  /** Required — job the video belongs to. */
  jobId: string;
  /** Optional — the data point the video attaches to. Null = job-
   *  level video (free-floating site walkthroughs etc.). */
  dataPointId: string | null;
  /** Source — 'camera' opens the OS recorder; 'library' opens the picker. */
  source: ImageSource;
}

export interface AttachedVideo {
  /** UUID of the inserted field_media row. */
  id: string;
  /** Storage path (relative to the bucket). */
  storagePath: string;
}

/**
 * Insert a video `field_media` row + enqueue the upload. Mirror of
 * `useAttachPhoto` / `useAttachVoice` for `media_type='video'`. The
 * OS provides the recording UI (no in-app capture screen for v1) —
 * `expo-image-picker.launchCameraAsync` with the Videos media type
 * caps duration at 5 minutes per plan §5.4.
 *
 * Per the user's resilience requirement — "save images and videos
 * and voice recordings to the app and the data also need to be able
 * to be saved to the phone storage as well." The captured file is
 * persisted to documentDirectory by `enqueueAndAttempt` (survives
 * app kills) AND a fire-and-forget MediaLibrary backup runs when
 * the user has opted in on the Me tab.
 *
 * Note: video lands as a single-tier upload — `original_url` /
 * `thumbnail_url` / `annotated_url` stay null in v1. F4 polish layers
 * on a server-side thumbnail extraction (FFmpeg via worker) and a
 * WiFi-only original-quality re-upload tier.
 */
export function useAttachVideo(): (
  input: AttachVideoInput
) => Promise<AttachedVideo | null> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async ({ jobId, dataPointId, source }) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('fieldMedia.attachVideo', 'no session', err);
        throw err;
      }

      if (!UUID_REGEX.test(jobId)) {
        const err = new Error(`Invalid job id: ${jobId}`);
        logError('fieldMedia.attachVideo', 'invalid job id', err, {
          job_id: jobId,
        });
        throw err;
      }
      if (dataPointId != null && !UUID_REGEX.test(dataPointId)) {
        const err = new Error(`Invalid data point id: ${dataPointId}`);
        logError('fieldMedia.attachVideo', 'invalid point id', err, {
          data_point_id: dataPointId,
        });
        throw err;
      }

      logInfo('fieldMedia.attachVideo', 'attempt', {
        job_id: jobId,
        data_point_id: dataPointId,
        source,
      });

      const picked = await pickVideo({
        source,
        scope: 'fieldMedia.attachVideo',
      });
      if (!picked) {
        logInfo('fieldMedia.attachVideo', 'cancelled');
        return null;
      }

      // Best-effort GPS + compass metadata. Same pattern as photo
      // capture — both queries run in parallel and degrade to null
      // independently.
      const [pos, heading] = await Promise.all([
        getCurrentPositionOrNull(),
        getCurrentHeadingOrNull(),
      ]);

      const mediaId = randomUUID();
      const parentTag = dataPointId ?? `job-${jobId}`;
      // Preserve the file extension from the picker's content type so
      // downstream players can probe correctly. iOS = mp4, older
      // Android may give us 3gp / mov.
      const ext = inferVideoExtension(picked.uri, picked.contentType);
      const storagePath = `${userId}/${parentTag}-${mediaId}${ext}`;
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
               duration_seconds, file_size_bytes,
               device_lat, device_lon, device_compass_heading,
               captured_at, uploaded_at,
               created_by, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              mediaId,
              jobId,
              dataPointId,
              'video',
              storagePath,
              null, // server-side thumbnail extraction in F4 polish
              null, // WiFi-only original-quality tier in F4 polish
              null, // no annotation overlay for video
              'pending',
              null,
              position,
              picked.durationSeconds ?? null,
              picked.fileSize ?? null,
              pos?.latitude ?? null,
              pos?.longitude ?? null,
              heading,
              nowIso,
              nowIso,
              userId,
              nowIso,
            ]
          );
        });
      } catch (err) {
        logError('fieldMedia.attachVideo', 'db insert failed', err, {
          media_id: mediaId,
          point_id: dataPointId,
          job_id: jobId,
        });
        throw err;
      }

      const enqueueResult = await enqueueAndAttempt(db, {
        parentTable: 'field_media',
        parentId: mediaId,
        bucket: VIDEO_BUCKET,
        storagePath,
        localFileUri: picked.uri,
        contentType: picked.contentType,
        scope: 'fieldMedia.attachVideo',
      });

      // MediaLibrary backup — for video the asset goes to the user's
      // Camera Roll on iOS / DCIM on Android. Best-effort.
      void saveCopyToDeviceIfEnabled(picked.uri, 'fieldMedia.attachVideo');

      logInfo('fieldMedia.attachVideo', 'success', {
        media_id: mediaId,
        point_id: dataPointId,
        duration_seconds: picked.durationSeconds ?? null,
        file_size: picked.fileSize ?? null,
        has_gps: !!pos,
        has_heading: heading != null,
        uploaded_now: enqueueResult.uploadedNow,
      });

      return { id: mediaId, storagePath };
    },
    [db, session]
  );
}

/**
 * Lightweight extension probe — picker uri + mime fallback.
 * Defaults to .mp4 because that's what the Supabase video bucket
 * accepts and what most native players prefer. Older Android
 * devices that hand us a .3gp get re-tagged to .mp4 (the bytes are
 * compatible enough for the v1 admin <video> player).
 */
function inferVideoExtension(uri: string, mime: string): string {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith('.mp4')) return '.mp4';
  if (lowerUri.endsWith('.mov')) return '.mov';
  if (lowerUri.endsWith('.m4v')) return '.m4v';
  if (mime === 'video/quicktime') return '.mov';
  return '.mp4';
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

// ── Annotation save ───────────────────────────────────────────────────────

/**
 * Persist a JSON annotation document onto a `field_media` row.
 * Original `storage_url` / `original_url` stay untouched per plan
 * §5.4 — the overlay is rendered LIVE from `annotations` JSON on
 * both mobile + admin, no flattened PNG re-upload.
 *
 * Idempotent — re-saving the same payload is harmless. Mobile
 * RLS allows owner UPDATE on the row (creator only).
 */
export function useUpdateMediaAnnotations(): (
  mediaId: string,
  annotationsJson: string | null
) => Promise<void> {
  const db = usePowerSync();

  return useCallback(
    async (mediaId, annotationsJson) => {
      try {
        await db.execute(
          `UPDATE field_media
              SET annotations = ?
            WHERE id = ?`,
          [annotationsJson, mediaId]
        );
        logInfo('fieldMedia.updateAnnotations', 'saved', {
          media_id: mediaId,
          length: annotationsJson?.length ?? 0,
        });
      } catch (err) {
        logError(
          'fieldMedia.updateAnnotations',
          'save failed',
          err,
          { media_id: mediaId }
        );
        throw err;
      }
    },
    [db]
  );
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

/**
 * Resolve a field_media.storage_url (video) to a signed URL on the
 * starr-field-videos bucket. Same pending-local fallback as the
 * photo resolver so a freshly-captured video plays back instantly
 * — even before the bytes have synced — by reading the queued
 * file from `FileSystem.documentDirectory`.
 */
export function useFieldMediaVideoUrl(
  media: (Pick<FieldMedia, 'storage_url'> & { id?: string | null }) | null | undefined
): string | null {
  const pendingLocal = usePendingUploadLocalUri('field_media', media?.id ?? null);
  const signedUrl = useSignedUrl(VIDEO_BUCKET, media?.storage_url ?? null);
  return pendingLocal ?? signedUrl;
}
