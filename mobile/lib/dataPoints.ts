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
import { getCurrentPositionOrNull } from './location';
import { logError, logInfo } from './log';
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

      // Best-effort GPS fix — don't block point creation on it. The
      // location helper handles permission, timeout, and hardware
      // failure with graceful degradation.
      const pos = await getCurrentPositionOrNull();
      const codeCategory = extractPrefix(cleanName);

      const id = randomUUID();
      const nowIso = new Date().toISOString();

      logInfo('dataPoints.create', 'attempt', {
        job_id: input.jobId,
        name: cleanName,
        code_category: codeCategory,
        has_gps: !!pos,
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
            // Compass heading: expo-sensors' Magnetometer ships in F3
            // polish — for F3 #2 we leave this null. Plan §5.3 wants
            // it eventually so the office can render shot direction.
            null,
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

      return { id, hasGps: !!pos };
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
