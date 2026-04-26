/**
 * Receipts library — capture, upload, list, edit.
 *
 * Phase F2 #2 ships the capture path:
 *   1. captureAndCreateReceipt() picks an image (camera or library),
 *      writes it to Supabase Storage at `{user_id}/{receipt_id}.jpg`,
 *      and INSERTs a 'pending' receipts row pre-linked to whatever
 *      job_time_entry the user is currently clocked into.
 *   2. useReceipts() lists the user's receipts in reverse-chrono order
 *      for the Money tab.
 *   3. useReceipt(id) fetches a single row for the detail / edit screen.
 *   4. useReceiptPhotoUrl(receipt) resolves the storage path into a
 *      signed URL (15-minute expiry; refreshes on the next render).
 *
 * AI extraction (F2 #5/#6) happens server-side after capture. Mobile
 * marks the receipt with `extraction_status='queued'` at insert time
 * and shows an "AI working…" badge until the worker writes back.
 *
 * Identity: receipts.user_id is auth.users.id (UUID), per plan §5.10.
 * This differs from job_time_entries.user_email — the receipts table
 * is greenfield, so it follows the plan convention rather than the
 * legacy email-keyed shape.
 */
import { usePowerSync, useQuery } from '@powersync/react';
import { useCallback, useEffect, useMemo } from 'react';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { logError, logInfo } from './log';
import {
  pickAndCompress,
  removeFromBucket,
} from './storage/mediaUpload';
import { useSignedUrl } from './storage/useSignedUrl';
import { supabase } from './supabase';
import { saveCopyToDeviceIfEnabled } from './deviceLibrary';
import { enqueueAndAttempt, usePendingUploadLocalUri } from './uploadQueue';
import { randomUUID } from './uuid';

export type Receipt = AppDatabase['receipts'];
export type ReceiptLineItem = AppDatabase['receipt_line_items'];

/** Mirrors the receipts.status check constraint in seeds/220_*.sql. */
export type ReceiptStatus = 'pending' | 'approved' | 'rejected' | 'exported';

/** Mirrors the receipts.extraction_status check constraint. */
export type ExtractionStatus = 'queued' | 'running' | 'done' | 'failed';

/** Plan §5.11.2 category enumeration. */
export type ReceiptCategory =
  | 'fuel'
  | 'meals'
  | 'supplies'
  | 'equipment'
  | 'tolls'
  | 'parking'
  | 'lodging'
  | 'professional_services'
  | 'office_supplies'
  | 'client_entertainment'
  | 'other';

export const RECEIPT_CATEGORIES: ReadonlyArray<ReceiptCategory> = [
  'fuel',
  'meals',
  'supplies',
  'equipment',
  'tolls',
  'parking',
  'lodging',
  'professional_services',
  'office_supplies',
  'client_entertainment',
  'other',
];

const STORAGE_BUCKET = 'starr-field-receipts';

export interface CaptureOptions {
  /** Source — 'camera' opens the OS camera; 'library' opens the picker. */
  source: 'camera' | 'library';
  /** Optional pre-fill for the job association — caller passes the
   *  active clock-in's job_id when one exists. */
  jobId?: string | null;
  /** Optional pre-fill for the time-entry link. */
  jobTimeEntryId?: string | null;
}

export interface CapturedReceipt {
  /** UUID of the inserted receipts row. */
  id: string;
  /** Storage path (relative to the bucket) — useful for previews. */
  storagePath: string;
}

/**
 * Pick an image (camera OR library), downscale + JPEG-compress it,
 * upload to Supabase Storage, and INSERT a pending receipts row.
 *
 * Returns null if the user cancelled the picker. Throws on permission
 * denial, upload failure, or DB insert failure.
 */
export function useCaptureReceipt(): (
  opts: CaptureOptions
) => Promise<CapturedReceipt | null> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async ({ source, jobId, jobTimeEntryId }) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('receipts.capture', 'no session', err);
        throw err;
      }

      logInfo('receipts.capture', 'attempt', { source, job_id: jobId });

      // 1. Pick + compress via the shared media-upload primitive.
      //    Receipts get the OS editor (square-up the page); 1600px is
      //    the receipt-text legibility default.
      const picked = await pickAndCompress({
        source,
        scope: 'receipts.capture',
        maxDimensionPx: 1600,
        allowsEditing: true,
      });
      if (!picked) {
        logInfo('receipts.capture', 'cancelled');
        return null;
      }

      // 2. Generate IDs + storage path. Path convention is locked by
      //    the storage RLS policy (see seeds/220_*.sql): the leading
      //    folder MUST equal auth.uid()::text.
      const receiptId = randomUUID();
      const storagePath = `${userId}/${receiptId}.jpg`;

      // 3. INSERT the pending row FIRST (before upload). PowerSync's
      //    CRUD queue replays the UPSERT against Supabase. We do this
      //    before the upload because the row is the source-of-truth:
      //    if the user is offline at capture time, we still want
      //    their receipt visible in the local list. The photo lands
      //    via the upload queue on next network restore.
      const nowIso = new Date().toISOString();
      try {
        await db.execute(
          `INSERT INTO receipts (
             id, user_id, job_id, job_time_entry_id,
             photo_url, status, extraction_status,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            receiptId,
            userId,
            jobId ?? null,
            jobTimeEntryId ?? null,
            storagePath,
            'pending',
            'queued',
            nowIso,
            nowIso,
          ]
        );
      } catch (err) {
        logError('receipts.capture', 'db insert failed', err, {
          receipt_id: receiptId,
        });
        throw err;
      }

      // 4. Enqueue the photo upload. enqueueAndAttempt copies the
      //    compressed file to documentDirectory (persistent through
      //    app kills + reboots) and tries the upload synchronously.
      //    On failure the row stays in pending_uploads and the queue
      //    drains it on next network restore.
      const enqueueResult = await enqueueAndAttempt(db, {
        parentTable: 'receipts',
        parentId: receiptId,
        bucket: STORAGE_BUCKET,
        storagePath,
        localFileUri: picked.uri,
        contentType: picked.contentType,
        scope: 'receipts.capture',
      });

      // 5. Best-effort save to the device's Photos app — only if the
      //    user opted in via the Me tab. Off by default for privacy
      //    (receipts have card numbers). Fire-and-forget; failures
      //    log but don't disrupt the capture flow.
      void saveCopyToDeviceIfEnabled(picked.uri, 'receipts.capture');

      logInfo('receipts.capture', 'success', {
        receipt_id: receiptId,
        job_id: jobId,
        bytes: picked.fileSize ?? null,
        uploaded_now: enqueueResult.uploadedNow,
      });

      return { id: receiptId, storagePath };
    },
    [db, session]
  );
}

/**
 * Reverse-chrono list of the current user's receipts. Powers the Money
 * tab. Returns an empty list when no session is present (sign-out race).
 */
export function useReceipts(limit: number = 100): {
  receipts: Receipt[];
  isLoading: boolean;
} {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const queryParams = useMemo(
    () => (userId ? [userId, limit] : []),
    [userId, limit]
  );

  const { data, isLoading, error } = useQuery<Receipt>(
    `SELECT *
     FROM receipts
     WHERE user_id = ?
     ORDER BY COALESCE(created_at, '') DESC
     LIMIT ?`,
    queryParams
  );

  useEffect(() => {
    if (error) logError('receipts.useReceipts', 'query failed', error);
  }, [error]);

  return {
    receipts: data ?? [],
    isLoading: !!userId && isLoading,
  };
}

export interface JobReceiptRollup {
  /** Total cents across non-rejected receipts for this job. */
  totalCents: number;
  /** Count of non-rejected receipts. */
  count: number;
  /** Cents broken out by category, sorted descending by amount. */
  byCategory: Array<{ category: ReceiptCategory | 'uncategorized'; cents: number; count: number }>;
  /** Most recent receipt timestamp on this job, ISO string or null. */
  lastReceiptAt: string | null;
}

/**
 * Per-job receipt rollup for the mobile job detail screen. Sums every
 * non-rejected receipt for the given job (across all users — the crew
 * sees the whole job's expenses, not just their own). Excludes the
 * 'rejected' status because those are explicitly NOT booked.
 *
 * Returns a stable empty rollup until the query lands so the UI can
 * render the placeholder block without flicker.
 */
export function useJobReceiptRollup(jobId: string | null | undefined): {
  rollup: JobReceiptRollup;
  isLoading: boolean;
} {
  const queryParams = useMemo(() => (jobId ? [jobId] : []), [jobId]);

  const { data, isLoading, error } = useQuery<{
    category: string | null;
    total_cents: number | null;
    created_at: string | null;
  }>(
    `SELECT category, total_cents, created_at
     FROM receipts
     WHERE job_id = ?
       AND COALESCE(status, 'pending') != 'rejected'`,
    queryParams
  );

  useEffect(() => {
    if (error) {
      logError('receipts.useJobReceiptRollup', 'query failed', error, { job_id: jobId });
    }
  }, [error, jobId]);

  const rollup = useMemo<JobReceiptRollup>(() => {
    if (!jobId || !data || data.length === 0) {
      return { totalCents: 0, count: 0, byCategory: [], lastReceiptAt: null };
    }
    let totalCents = 0;
    let lastReceiptAt: string | null = null;
    const buckets = new Map<string, { cents: number; count: number }>();
    for (const row of data) {
      const cents = row.total_cents ?? 0;
      totalCents += cents;
      const key = row.category ?? 'uncategorized';
      const bucket = buckets.get(key) ?? { cents: 0, count: 0 };
      bucket.cents += cents;
      bucket.count += 1;
      buckets.set(key, bucket);
      if (row.created_at && (!lastReceiptAt || row.created_at > lastReceiptAt)) {
        lastReceiptAt = row.created_at;
      }
    }
    const byCategory = Array.from(buckets.entries())
      .map(([category, b]) => ({
        category: category as ReceiptCategory | 'uncategorized',
        cents: b.cents,
        count: b.count,
      }))
      .sort((a, b) => b.cents - a.cents);
    return { totalCents, count: data.length, byCategory, lastReceiptAt };
  }, [data, jobId]);

  return { rollup, isLoading: !!jobId && isLoading };
}

/**
 * Single-row fetch for the detail / edit screen. Returns `null` when
 * the row genuinely doesn't exist; `undefined` while the first query
 * is in flight (matches the convention from useJob).
 */
export function useReceipt(id: string | null | undefined): {
  receipt: Receipt | null | undefined;
  isLoading: boolean;
} {
  const queryParams = useMemo(() => (id ? [id] : []), [id]);
  const { data, isLoading, error } = useQuery<Receipt>(
    `SELECT * FROM receipts WHERE id = ? LIMIT 1`,
    queryParams
  );

  useEffect(() => {
    if (error) logError('receipts.useReceipt', 'query failed', error, { id });
  }, [error, id]);

  if (!id) return { receipt: null, isLoading: false };
  if (isLoading) return { receipt: undefined, isLoading: true };
  return { receipt: data?.[0] ?? null, isLoading: false };
}

/**
 * Update a receipts row. Caller passes a partial — only the fields
 * present are written. category_source is automatically set to 'user'
 * when the caller updates the category (so the bookkeeper UI can
 * distinguish AI-suggested from user-confirmed).
 *
 * Server-side RLS rejects updates to approved/exported receipts; the
 * mobile client also disables the form for those statuses, but the
 * server is the authority.
 */
export interface ReceiptPatch {
  vendor_name?: string | null;
  vendor_address?: string | null;
  transaction_at?: string | null;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  tip_cents?: number | null;
  total_cents?: number | null;
  payment_method?: string | null;
  payment_last4?: string | null;
  category?: ReceiptCategory | null;
  tax_deductible_flag?: 'full' | 'partial_50' | 'none' | 'review' | null;
  notes?: string | null;
  job_id?: string | null;
  job_time_entry_id?: string | null;
}

export function useUpdateReceipt(): (
  id: string,
  patch: ReceiptPatch
) => Promise<void> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async (id, patch) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('receipts.update', 'no session', err, { receipt_id: id });
        throw err;
      }

      // Build an UPDATE that touches only the fields present in patch.
      // SQLite can't take a JSONB-style "merge" — we have to expand it.
      const cols: string[] = [];
      const vals: unknown[] = [];
      const push = (col: string, val: unknown) => {
        cols.push(`${col} = ?`);
        vals.push(val);
      };

      if ('vendor_name' in patch) push('vendor_name', patch.vendor_name);
      if ('vendor_address' in patch) push('vendor_address', patch.vendor_address);
      if ('transaction_at' in patch) push('transaction_at', patch.transaction_at);
      if ('subtotal_cents' in patch) push('subtotal_cents', patch.subtotal_cents);
      if ('tax_cents' in patch) push('tax_cents', patch.tax_cents);
      if ('tip_cents' in patch) push('tip_cents', patch.tip_cents);
      if ('total_cents' in patch) push('total_cents', patch.total_cents);
      if ('payment_method' in patch) push('payment_method', patch.payment_method);
      if ('payment_last4' in patch) push('payment_last4', patch.payment_last4);
      if ('category' in patch) {
        push('category', patch.category);
        // User-edited category overrides any AI suggestion.
        push('category_source', 'user');
      }
      if ('tax_deductible_flag' in patch) {
        push('tax_deductible_flag', patch.tax_deductible_flag);
      }
      if ('notes' in patch) push('notes', patch.notes);
      if ('job_id' in patch) push('job_id', patch.job_id);
      if ('job_time_entry_id' in patch) push('job_time_entry_id', patch.job_time_entry_id);

      if (cols.length === 0) {
        logInfo('receipts.update', 'no-op (empty patch)', { receipt_id: id });
        return;
      }

      const nowIso = new Date().toISOString();
      cols.push('updated_at = ?');
      vals.push(nowIso);
      vals.push(id);

      logInfo('receipts.update', 'attempt', {
        receipt_id: id,
        fields: cols.length - 1,
      });

      try {
        await db.execute(
          `UPDATE receipts SET ${cols.join(', ')} WHERE id = ?`,
          vals
        );
        logInfo('receipts.update', 'success', { receipt_id: id });
      } catch (err) {
        logError('receipts.update', 'db update failed', err, {
          receipt_id: id,
        });
        throw err;
      }
    },
    [db, session]
  );
}

/**
 * Delete a receipt. Soft delete is NOT used — receipts.status='rejected'
 * is the soft state for "user wants to undo this capture without losing
 * the audit trail." Hard delete is reserved for clear-mistakes (e.g.
 * accidental capture of an unrelated photo) and only allowed while the
 * receipt is still 'pending' or 'rejected'. The IRS retention archival
 * job (§5.11.9) is the only path that touches approved receipts.
 *
 * Best-effort storage cleanup runs after the DB delete so the photo
 * doesn't dangle in the bucket.
 */
export function useDeleteReceipt(): (receipt: Receipt) => Promise<void> {
  const db = usePowerSync();
  const { session } = useAuth();

  return useCallback(
    async (receipt) => {
      const userId = session?.user.id;
      if (!userId) {
        const err = new Error('Not signed in.');
        logError('receipts.delete', 'no session', err, { receipt_id: receipt.id });
        throw err;
      }
      if (receipt.status === 'approved' || receipt.status === 'exported') {
        const err = new Error('Cannot delete an approved or exported receipt.');
        logInfo('receipts.delete', 'rejected: status locked', {
          receipt_id: receipt.id,
          status: receipt.status,
        });
        throw err;
      }

      logInfo('receipts.delete', 'attempt', { receipt_id: receipt.id });

      try {
        await db.execute(`DELETE FROM receipts WHERE id = ?`, [receipt.id]);
        logInfo('receipts.delete', 'success', { receipt_id: receipt.id });
      } catch (err) {
        logError('receipts.delete', 'db delete failed', err, {
          receipt_id: receipt.id,
        });
        throw err;
      }

      // Storage cleanup is best-effort — the row deletion is the
      // authoritative action. A dangling photo will be cleaned up by
      // the IRS archival job.
      if (receipt.photo_url) {
        await removeFromBucket({
          bucket: STORAGE_BUCKET,
          path: receipt.photo_url,
          scope: 'receipts.delete',
        });
      }
    },
    [db, session]
  );
}

/**
 * Re-queue a failed receipt for AI extraction. The worker's --watch
 * loop (or the on-demand admin endpoint) will pick the row up on the
 * next poll cycle (~30 s by default).
 *
 * Implementation note: this used to call the worker's
 * /starr-field/receipts/extract endpoint with a bundled
 * EXPO_PUBLIC_WORKER_API_KEY bearer token. That key would have been
 * shipped inside the JS bundle, letting anyone with the IPA/APK
 * trigger Vision spend on arbitrary rows. Per the F2 audit we now
 * flip extraction_status directly via the user's Supabase session,
 * which is RLS-scoped to their own receipts. The worker poll picks
 * up the requeue.
 *
 * Returns true when the row transitioned from 'failed' → 'queued',
 * false when the row was already in another state (already queued,
 * running, or done — caller alerts).
 */
export async function retryReceiptExtraction(receiptId: string): Promise<boolean> {
  logInfo('receipts.retryExtraction', 'attempt', { receipt_id: receiptId });

  // Only flip when currently 'failed' so we don't trample an in-flight
  // extraction. The .eq filter combined with .select makes this an
  // atomic "claim if eligible" operation.
  const { data, error } = await supabase
    .from('receipts')
    .update({
      extraction_status: 'queued',
      extraction_started_at: null,
      extraction_completed_at: null,
      extraction_error: null,
    })
    .eq('id', receiptId)
    .eq('extraction_status', 'failed')
    .select('id');

  if (error) {
    logError('receipts.retryExtraction', 'requeue failed', error, {
      receipt_id: receiptId,
    });
    throw new Error(error.message);
  }

  const flipped = Array.isArray(data) && data.length > 0;
  logInfo('receipts.retryExtraction', flipped ? 'requeued' : 'no-op (already queued/running)', {
    receipt_id: receiptId,
  });
  return flipped;
}

/**
 * Resolve a receipts.photo_url (a storage path) to a signed URL. The
 * URL is valid for 15 minutes; if it expires while the user is staring
 * at the screen, the next render generates a fresh one.
 *
 * Returns null while the URL is being signed OR when the receipt has
 * no photo_url (shouldn't happen — the column is NOT NULL — but
 * defensive).
 */
export function useReceiptPhotoUrl(
  receipt: (Pick<Receipt, 'photo_url'> & { id?: string | null }) | null | undefined
): string | null {
  // If the upload is still queued (offline / retrying), show the
  // local file so the user sees their snap immediately. The signed
  // URL takes over once the queue marks the upload done.
  const pendingLocal = usePendingUploadLocalUri('receipts', receipt?.id ?? null);
  const signedUrl = useSignedUrl(STORAGE_BUCKET, receipt?.photo_url ?? null);
  return pendingLocal ?? signedUrl;
}
