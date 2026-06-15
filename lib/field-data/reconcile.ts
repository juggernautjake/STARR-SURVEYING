// lib/field-data/reconcile.ts
//
// mobile-and-customer-query-gap Slice D1 — late-bind orphan field_media
// rows to the right field_data_point when a TRV import (or manual "+"
// Point capture in the office) creates the matching point.
//
// Two distinct binding strategies:
//
//   STRATEGY 1 — direct id match. The mobile capture flow already
//   writes `data_point_id` when the matching point existed at capture
//   time. These rows need NO reconcile; they're already bound. The
//   reconcile helper just walks past them.
//
//   STRATEGY 2 — name match. When the surveyor captured a photo
//   BEFORE the matching point existed (mobile was offline, the point
//   hadn't round-tripped to web yet), the row landed with
//   `data_point_id = NULL` but with `point_name` set to the 179-code
//   tag the surveyor typed (e.g. 'BM-01'). The reconcile helper
//   UPDATEs every such row whose `(job_id, point_name)` matches a
//   newly-created point.
//
// Strategy 3 (manual reconcile UI) deferred until real-world usage
// shows orphan rows that don't match by either id or name.
//
// Pure helper — takes a Supabase client + an array of newly-created
// point references, returns counts. Source-locked at
// `__tests__/field-data/reconcile.test.ts`.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Reference to a newly-created field_data_points row. The reconcile
 *  helper needs only these two fields to do its work. */
export interface NewPointRef {
  /** UUID of the just-created field_data_points row. */
  id: string;
  /** Human-readable point name (matches `field_data_points.name`),
   *  e.g. 'BM-01' or 'IR-NE-CORNER'. */
  name: string;
}

export interface ReconcileResult {
  /** Total orphan media rows updated. */
  attached: number;
  /** Per-point breakdown so the caller (TRV import handler) can
   *  surface "found 3 photos for BM-01" toasts. Keyed by point id. */
  attachedByPointId: Record<string, number>;
  /** Soft failures — pre-existing orphans whose `point_name` didn't
   *  match anything in `points`. Useful for the office to know how
   *  many photos still need manual assignment. */
  unmatchedOrphans: number;
}

/** For each `(job_id, point.name)`, UPDATE field_media SET
 *  data_point_id = point.id WHERE data_point_id IS NULL AND
 *  point_name = point.name. Runs one UPDATE per point so a Supabase
 *  RLS policy that checks point ownership can apply per-row. The
 *  point count on a TRV import is typically 10-200; the per-point
 *  cost is small and the parallelism gain isn't worth the lost
 *  per-row RLS hooks. */
export async function reconcileOrphanFieldMedia(
  client: Pick<SupabaseClient, 'from'>,
  args: { jobId: string; points: NewPointRef[] },
): Promise<ReconcileResult> {
  const { jobId, points } = args;
  const attachedByPointId: Record<string, number> = {};

  if (points.length === 0) {
    return {
      attached: 0,
      attachedByPointId,
      unmatchedOrphans: await countRemainingOrphans(client, jobId),
    };
  }

  let attached = 0;
  for (const point of points) {
    if (!point.name) continue;
    try {
      const { data, error } = await client
        .from('field_media')
        .update({ data_point_id: point.id })
        .eq('job_id', jobId)
        .eq('point_name', point.name)
        .is('data_point_id', null)
        .select('id');
      if (error) {
        console.error(
          `[field-data.reconcile] update failed for ${point.name}:`,
          error,
        );
        continue;
      }
      const count = Array.isArray(data) ? data.length : 0;
      if (count > 0) {
        attached += count;
        attachedByPointId[point.id] = count;
      }
    } catch (err) {
      // Never throw — partial reconciliation is better than rolling
      // back the entire import path for one bad row.
      console.error(
        `[field-data.reconcile] update threw for ${point.name}:`,
        err,
      );
    }
  }

  return {
    attached,
    attachedByPointId,
    unmatchedOrphans: await countRemainingOrphans(client, jobId),
  };
}

/** Sidecar query — how many orphan media rows still need attention
 *  after the reconcile pass. The office uses this for the "reconcile
 *  media" affordance on the job detail page. */
async function countRemainingOrphans(
  client: Pick<SupabaseClient, 'from'>,
  jobId: string,
): Promise<number> {
  try {
    const { count, error } = await client
      .from('field_media')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .is('data_point_id', null);
    if (error || typeof count !== 'number') return 0;
    return count;
  } catch {
    return 0;
  }
}
