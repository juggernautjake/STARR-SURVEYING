/**
 * Receipt retention sweep — closes the Batch CC v2 polish item:
 * *"Worker retention sweep CLI (purges rows past IRS retention
 * threshold)."*
 *
 * Hard-deletes soft-deleted receipts (`deleted_at IS NOT NULL`)
 * that are past the IRS statute-of-limitations window. Soft-delete
 * itself was the Batch CC compliance fix; this service is the
 * other half — without it, `receipts.deleted_at` accumulates
 * forever and the audit-trail-as-product story turns into a
 * storage-cost-as-problem story.
 *
 * Two retention buckets, both env / CLI-overridable:
 *   - `'rejected'` — receipts that never went into accounting.
 *     Default 90 days from `deleted_at` before hard-purge.
 *     (Per the Batch QQ part-1 plan-doc entry: *"90 d for never-
 *     approved rejections."*)
 *   - everything else (`'pending' | 'approved' | 'exported'`) —
 *     conservative IRS substantial-under-reporting window.
 *     Default 7 years from `deleted_at` before hard-purge.
 *     Operator may tighten to 3 years for clean-return shops.
 *
 * The sweep is **dry-run by default** — the per-row purge only
 * happens when the caller passes `dryRun: false`. CLI mirrors
 * this with an explicit `--execute` flag (no accidental mass
 * deletes from cron). The cron entry should run dry-run nightly +
 * a Sunday-night `--execute` once human-reviewed.
 *
 * Storage cleanup: each purged row's `photo_url` is removed from
 * the `starr-field-receipts` bucket BEFORE the database row is
 * deleted. If storage delete fails for any reason, we leave the
 * database row alone — better an orphan database row than an
 * orphan blob (the row's worth a few bytes; an unreachable photo
 * is the harder-to-fix mess).
 *
 * Per-batch cap (default 100) so a sudden backlog doesn't spike
 * Postgres / Storage IO. Cron loops naturally drain the rest on
 * subsequent nights.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const RECEIPTS_BUCKET = 'starr-field-receipts';

/** Days to retain soft-deleted `status='rejected'` receipts. */
const DEFAULT_REJECTED_RETENTION_DAYS = 90;

/** Days to retain every other soft-deleted receipt. 7 years
 *  (365 × 7 + 2 leap days) is the IRS substantial-under-reporting
 *  window — conservative default. */
const DEFAULT_STANDARD_RETENTION_DAYS = 7 * 365 + 2;

/** Per-sweep upper bound on rows hard-deleted in one call. */
const DEFAULT_BATCH_LIMIT = 100;

interface SweepRow {
  id: string;
  user_id: string | null;
  status: string | null;
  photo_url: string | null;
  deleted_at: string;
  deletion_reason: string | null;
}

export interface RetentionSweepOptions {
  /** When false, log what would be purged but don't touch anything. */
  dryRun: boolean;
  /** Per-call cap. Defaults to 100. */
  batchLimit?: number;
  /** Override 90-day default for rejected receipts. */
  rejectedRetentionDays?: number;
  /** Override 7-year default for everything else. */
  standardRetentionDays?: number;
}

export interface RetentionSweepResult {
  scanned: number;
  purged: number;
  storageOnlySkips: number;
  errors: string[];
  buckets: {
    rejected: { eligible: number; purged: number };
    standard: { eligible: number; purged: number };
  };
}

/**
 * Run one retention sweep batch. Idempotent — re-running with the
 * same options is safe (no rows means no work).
 */
export async function processRetentionSweep(
  supabase: SupabaseClient,
  opts: RetentionSweepOptions
): Promise<RetentionSweepResult> {
  const limit = opts.batchLimit ?? DEFAULT_BATCH_LIMIT;
  const rejectedDays =
    opts.rejectedRetentionDays ?? DEFAULT_REJECTED_RETENTION_DAYS;
  const standardDays =
    opts.standardRetentionDays ?? DEFAULT_STANDARD_RETENTION_DAYS;

  const now = Date.now();
  const rejectedThreshold = new Date(
    now - rejectedDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const standardThreshold = new Date(
    now - standardDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Pull candidates in a single query — `deleted_at < standardThreshold`
  // is the broadest cut. We split into rejected / standard buckets
  // in-memory below since the per-bucket date math differs.
  // Order by `deleted_at` ASC so the oldest rows go first; if the
  // batch limit caps us, we drain the oldest backlog before the
  // newer one.
  const { data, error } = await supabase
    .from('receipts')
    .select('id, user_id, status, photo_url, deleted_at, deletion_reason')
    .not('deleted_at', 'is', null)
    .lte('deleted_at', rejectedThreshold)
    .order('deleted_at', { ascending: true })
    .limit(limit * 4); // Read more than we'll act on so the bucket split has room.

  if (error) {
    return {
      scanned: 0,
      purged: 0,
      storageOnlySkips: 0,
      errors: [`select failed: ${error.message}`],
      buckets: {
        rejected: { eligible: 0, purged: 0 },
        standard: { eligible: 0, purged: 0 },
      },
    };
  }

  const rows = (data ?? []) as SweepRow[];
  const result: RetentionSweepResult = {
    scanned: rows.length,
    purged: 0,
    storageOnlySkips: 0,
    errors: [],
    buckets: {
      rejected: { eligible: 0, purged: 0 },
      standard: { eligible: 0, purged: 0 },
    },
  };

  // Bucket-classify every candidate. Rejected rows pass at the
  // earlier threshold; everything else has to wait for the longer
  // window.
  type Bucket = 'rejected' | 'standard';
  const eligible: Array<{ row: SweepRow; bucket: Bucket }> = [];
  for (const row of rows) {
    if (row.status === 'rejected') {
      // Already past rejectedThreshold by construction of the SQL.
      result.buckets.rejected.eligible += 1;
      eligible.push({ row, bucket: 'rejected' });
    } else if (row.deleted_at <= standardThreshold) {
      result.buckets.standard.eligible += 1;
      eligible.push({ row, bucket: 'standard' });
    }
  }

  const toPurge = eligible.slice(0, limit);

  if (opts.dryRun) {
    return result;
  }

  // Execute purge: storage first, then row.
  for (const { row, bucket } of toPurge) {
    try {
      if (row.photo_url) {
        const { error: storageErr } = await supabase.storage
          .from(RECEIPTS_BUCKET)
          .remove([row.photo_url]);
        if (storageErr) {
          // Don't delete the row — leaves us a chance to retry the
          // storage delete later without losing the lookup.
          result.errors.push(
            `storage purge failed (id=${row.id}, path=${row.photo_url}): ${storageErr.message}`
          );
          result.storageOnlySkips += 1;
          continue;
        }
      }

      const { error: dbErr } = await supabase
        .from('receipts')
        .delete()
        .eq('id', row.id)
        .not('deleted_at', 'is', null); // Race guard — refuse if someone un-deleted.
      if (dbErr) {
        result.errors.push(
          `db delete failed (id=${row.id}): ${dbErr.message}`
        );
        continue;
      }

      result.purged += 1;
      result.buckets[bucket].purged += 1;
    } catch (err) {
      result.errors.push(
        `unexpected error (id=${row.id}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return result;
}
