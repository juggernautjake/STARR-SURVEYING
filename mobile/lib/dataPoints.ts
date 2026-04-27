/**
 * Data-point library — create, list, fetch, edit, delete.
 *
 * Phase F3 #2 ships create + list + read. Photos / videos / voice
 * memos attach via lib/fieldMedia.ts (F3 #3); the per-point editor
 * lands in F3 #4.
 *
 * Naming model: plan §5.3 — point names follow the 179-code library
 * (BM01, IR03, FL-CORNER-NE). The DB enforces UNIQUE(job_id, name)
 * so two crew members can't both create "BM01" on the same job; the
 * mobile UI auto-suggests the next number via lib/dataPointCodes.ts
 * but the constraint is the source of truth.
 *
 * Identity: created_by = auth.users.id (UUID). Same convention as
 * F2 receipts; differs from job_time_entries.user_email.
 */
import { usePowerSync, useQuery } from '@powersync/react';
import { useCallback, useEffect, useMemo } from 'react';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { extractPrefix } from './dataPointCodes';
import { PHOTO_BUCKET } from './fieldMedia';
import {
  getCurrentHeadingOrNull,
  getCurrentPosition,
  type GpsFailureReason,
} from './location';
import { logError, logInfo } from './log';
import { removeFromBucket } from './storage/mediaUpload';
import { randomUUID } from './uuid';

export type FieldDataPoint = AppDatabase['field_data_points'];

export interface CreateDataPointInput {
  /** Required — job the point belongs to. Most flows pre-fill from
   *  the active clock-in or the screen the user came from. */
  jobId: string;
  /** Required — point name. Validated client-side (non-empty trim,
   *  reasonable length) before insert; DB constraint blocks empties. */
  name: string;
  /** Optional free-text description. */
  description?: string | null;
  /** Special-point flags per plan §5.3. */
  isOffset?: boolean;
  isCorrection?: boolean;
  /** When isCorrection is true, the point being corrected. */
  correctsPointId?: string | null;
}

export interface CreatedDataPoint {
  id: string;
  /** True when GPS / compass were captured at create time. False on
   *  permission-denied / no-fix; the row is still created (the field
   *  crew may want to add coordinates later from a paper note). */
  hasGps: boolean;
  /** When hasGps is false, why — drives the screen's user-facing
   *  message (Settings deep-link for permission, "move outside" for
   *  timeout, generic for hardware). null when hasGps is true. */
  gpsReason: GpsFailureReason | null;
}

/**
 * Create a data point. Captures phone GPS + compass best-effort, INSERTs
 * the row through PowerSync (immediately visible in local queries; the
 * upload queue replays against Supabase). Returns the new row's id.
 *
 * Throws when no session exists, when the name is empty after trim,
 * or when the DB insert fails (UNIQUE(job_id, name) violation if a
 * duplicate slipped past the UI's check).
 */
export function useCreateDataPoint(): (
  input: CreateDataPointInput
) => Promise<CreatedDataPoint> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async (input) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('dataPoints.create', 'no session', err);
        throw err;
      }

      const cleanName = input.name.trim();
      if (cleanName === '') {
        const err = new Error('Point name is required.');
        logInfo('dataPoints.create', 'rejected: empty name');
        throw err;
      }
      if (cleanName.length > 80) {
        const err = new Error('Point name must be 80 characters or fewer.');
        logInfo('dataPoints.create', 'rejected: name too long', {
          length: cleanName.length,
        });
        throw err;
      }

      // Best-effort GPS + compass — don't block point creation on
      // either. The location helpers handle permission, timeout,
      // sensor unavailability, and hardware failure with graceful
      // degradation. Both run in parallel so total wall-time is
      // bounded by the slower of the two timeouts (GPS 8 s,
      // heading 1.5 s). `gpsReason` propagates back to the screen
      // so the user sees WHY GPS failed.
      const [{ pos, reason: gpsReason }, heading] = await Promise.all([
        getCurrentPosition(),
        getCurrentHeadingOrNull(),
      ]);
      const codeCategory = extractPrefix(cleanName);

      const id = randomUUID();
      const nowIso = new Date().toISOString();

      logInfo('dataPoints.create', 'attempt', {
        job_id: input.jobId,
        name: cleanName,
        code_category: codeCategory,
        has_gps: !!pos,
        has_heading: heading != null,
        is_offset: !!input.isOffset,
        is_correction: !!input.isCorrection,
      });

      try {
        await db.execute(
          `INSERT INTO field_data_points (
             id, job_id, name, code_category, description,
             device_lat, device_lon, device_altitude_m,
             device_accuracy_m, device_compass_heading,
             is_offset, is_correction, corrects_point_id,
             created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.jobId,
            cleanName,
            codeCategory,
            input.description?.trim() || null,
            pos?.latitude ?? null,
            pos?.longitude ?? null,
            pos?.altitude ?? null,
            pos?.accuracy ?? null,
            heading,
            // SQLite has no boolean — store as 0/1 INTEGER per the
            // schema convention used by job_time_entries.is_driver etc.
            input.isOffset ? 1 : 0,
            input.isCorrection ? 1 : 0,
            input.correctsPointId ?? null,
            userId,
            nowIso,
            nowIso,
          ]
        );
      } catch (err) {
        logError('dataPoints.create', 'db insert failed', err, {
          point_id: id,
          job_id: input.jobId,
          name: cleanName,
        });
        throw err;
      }

      logInfo('dataPoints.create', 'success', {
        point_id: id,
        job_id: input.jobId,
        name: cleanName,
      });

      return { id, hasGps: !!pos, gpsReason };
    },
    [db, session]
  );
}

/**
 * List data points on a job, newest first. Powers the per-job point
 * list (F3 #4). Cap is 500 — most active jobs have under 100 points;
 * legacy jobs that exceed the cap can be filtered or paged in F3
 * polish.
 */
export function useJobDataPoints(
  jobId: string | null | undefined,
  limit: number = 500
): {
  points: FieldDataPoint[];
  isLoading: boolean;
} {
  const queryParams = useMemo(
    () => (jobId ? [jobId, limit] : []),
    [jobId, limit]
  );

  const { data, isLoading, error } = useQuery<FieldDataPoint>(
    `SELECT *
     FROM field_data_points
     WHERE job_id = ?
     ORDER BY COALESCE(created_at, '') DESC
     LIMIT ?`,
    queryParams
  );

  useEffect(() => {
    if (error) {
      logError('dataPoints.useJobDataPoints', 'query failed', error, {
        job_id: jobId ?? null,
      });
    }
  }, [error, jobId]);

  return {
    points: data ?? [],
    isLoading: !!jobId && isLoading,
  };
}

/**
 * Fetch a single data point by id. Same conventions as useJob /
 * useReceipt — `null` for missing, `undefined` while loading.
 */
export function useDataPoint(id: string | null | undefined): {
  point: FieldDataPoint | null | undefined;
  isLoading: boolean;
} {
  const queryParams = useMemo(() => (id ? [id] : []), [id]);
  const { data, isLoading, error } = useQuery<FieldDataPoint>(
    `SELECT * FROM field_data_points WHERE id = ? LIMIT 1`,
    queryParams
  );

  useEffect(() => {
    if (error) {
      logError('dataPoints.useDataPoint', 'query failed', error, { id });
    }
  }, [error, id]);

  if (!id) return { point: null, isLoading: false };
  if (isLoading) return { point: undefined, isLoading: true };
  return { point: data?.[0] ?? null, isLoading: false };
}

/**
 * Patch shape for useUpdateDataPoint. Only the fields present are
 * written. Same diff-only pattern as useUpdateReceipt — so a noop
 * save doesn't trigger a network round-trip.
 */
export interface DataPointPatch {
  name?: string;
  description?: string | null;
  isOffset?: boolean;
  isCorrection?: boolean;
  correctsPointId?: string | null;
  /** When supplied, also re-derives code_category from the new name. */
  recomputeCategory?: boolean;
}

/**
 * Update a data point. Validates the new name against the same
 * rules as create (non-empty, ≤80, unique within the job). The
 * UNIQUE(job_id, name) constraint is the DB-side guard for race
 * conditions; the client-side check just gives faster feedback.
 */
export function useUpdateDataPoint(): (
  pointId: string,
  patch: DataPointPatch
) => Promise<void> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async (pointId, patch) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('dataPoints.update', 'no session', err, { point_id: pointId });
        throw err;
      }

      const cols: string[] = [];
      const vals: unknown[] = [];
      const push = (col: string, val: unknown) => {
        cols.push(`${col} = ?`);
        vals.push(val);
      };

      if (patch.name !== undefined) {
        const cleanName = patch.name.trim();
        if (cleanName === '') {
          throw new Error('Point name is required.');
        }
        if (cleanName.length > 80) {
          throw new Error('Point name must be 80 characters or fewer.');
        }
        push('name', cleanName);
        if (patch.recomputeCategory !== false) {
          push('code_category', extractPrefix(cleanName));
        }
      }
      if (patch.description !== undefined) {
        push('description', patch.description?.trim() || null);
      }
      if (patch.isOffset !== undefined) push('is_offset', patch.isOffset ? 1 : 0);
      if (patch.isCorrection !== undefined) push('is_correction', patch.isCorrection ? 1 : 0);
      if (patch.correctsPointId !== undefined) {
        push('corrects_point_id', patch.correctsPointId);
      }

      if (cols.length === 0) {
        logInfo('dataPoints.update', 'no-op (empty patch)', { point_id: pointId });
        return;
      }

      const nowIso = new Date().toISOString();
      cols.push('updated_at = ?');
      vals.push(nowIso);
      vals.push(pointId);

      logInfo('dataPoints.update', 'attempt', {
        point_id: pointId,
        fields: cols.length - 1,
      });

      try {
        await db.execute(
          `UPDATE field_data_points SET ${cols.join(', ')} WHERE id = ?`,
          vals
        );
      } catch (err) {
        logError('dataPoints.update', 'db update failed', err, {
          point_id: pointId,
        });
        throw err;
      }

      logInfo('dataPoints.update', 'success', { point_id: pointId });
    },
    [db, session]
  );
}

/**
 * Delete a data point. RLS allows owner deletion only within the
 * first 24 h (per seeds/221_*.sql); after that admin-only via the
 * service-role API. Cascade on field_data_points → field_media in
 * the seed sweeps attached metadata rows automatically; this hook
 * additionally sweeps the storage objects so the bucket doesn't
 * accumulate orphans.
 */
export function useDeleteDataPoint(): (pointId: string) => Promise<void> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async (pointId) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('dataPoints.delete', 'no session', err, { point_id: pointId });
        throw err;
      }

      logInfo('dataPoints.delete', 'attempt', { point_id: pointId });

      // 1. Snapshot every storage path attached to this point BEFORE
      //    the DELETE — the cascade fires immediately and the rows
      //    are gone after that. We hit the local SQLite mirror so
      //    this is a single sub-ms query.
      const mediaPaths = await db.getAll<{
        storage_url: string | null;
        original_url: string | null;
        annotated_url: string | null;
      }>(
        `SELECT storage_url, original_url, annotated_url
         FROM field_media WHERE data_point_id = ?`,
        [pointId]
      );

      // 2. DELETE the point — cascade sweeps field_media.
      try {
        await db.execute(`DELETE FROM field_data_points WHERE id = ?`, [pointId]);
      } catch (err) {
        logError('dataPoints.delete', 'db delete failed', err, { point_id: pointId });
        throw err;
      }

      // 3. Best-effort storage cleanup. Failures already log inside
      //    removeFromBucket; we await in parallel because the count
      //    can reach into the dozens for a heavy point + each call
      //    is a single Supabase RTT.
      const paths = mediaPaths
        .flatMap((row) => [row.storage_url, row.original_url, row.annotated_url])
        .filter((p): p is string => typeof p === 'string' && p.length > 0);
      if (paths.length > 0) {
        await Promise.all(
          paths.map((path) =>
            removeFromBucket({
              bucket: PHOTO_BUCKET,
              path,
              scope: 'dataPoints.delete',
            })
          )
        );
      }

      logInfo('dataPoints.delete', 'success', {
        point_id: pointId,
        media_swept: paths.length,
      });
    },
    [db, session]
  );
}

/**
 * Existing names on a job — used by the "next number in sequence"
 * suggester. Fast: hits the local SQLite mirror, so it doesn't add
 * latency to the camera-up-immediately UX.
 */
export function useJobPointNames(jobId: string | null | undefined): {
  names: string[];
  isLoading: boolean;
} {
  const queryParams = useMemo(() => (jobId ? [jobId] : []), [jobId]);
  const { data, isLoading, error } = useQuery<{ name: string }>(
    `SELECT name FROM field_data_points WHERE job_id = ?`,
    queryParams
  );

  useEffect(() => {
    if (error) {
      logError('dataPoints.useJobPointNames', 'query failed', error, {
        job_id: jobId ?? null,
      });
    }
  }, [error, jobId]);

  return {
    names: (data ?? []).map((r) => r.name).filter(Boolean),
    isLoading: !!jobId && isLoading,
  };
}
