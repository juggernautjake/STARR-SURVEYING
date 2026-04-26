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
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { usePowerSync, useQuery } from '@powersync/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from './auth';
import type { AppDatabase } from './db/schema';
import { logError, logInfo, logWarn } from './log';
import { supabase } from './supabase';
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
// Plan §5.11.1: receipt photos are visual records, not high-res art.
// 1600px on the long edge gets you a sharp, readable receipt that's
// ~200 KB JPEG — fast to upload over LTE, cheap to send to Vision.
const MAX_DIMENSION_PX = 1600;
const JPEG_QUALITY = 0.85;

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

      // 1. Permission + picker. expo-image-picker prompts the user the
      //    first time; subsequent calls are no-ops if granted.
      const picker = await pickImage(source);
      if (!picker) {
        logInfo('receipts.capture', 'cancelled');
        return null;
      }

      // 2. Downscale + JPEG-compress so we don't shove a 12 MB HEIC
      //    over LTE. Vision sees a 200 KB JPEG fine.
      const compressed = await compressForUpload(picker.uri);

      // 3. Generate IDs + storage path. Path convention is locked by
      //    the storage RLS policy (see seeds/220_*.sql): the leading
      //    folder MUST equal auth.uid()::text.
      const receiptId = randomUUID();
      const storagePath = `${userId}/${receiptId}.jpg`;

      // 4. Upload. Supabase Storage's upload accepts an ArrayBuffer
      //    via fetch-then-arrayBuffer; React Native FormData has been
      //    flaky historically. expo-file-system's URI is a file://
      //    path that fetch() resolves locally.
      try {
        await uploadJpeg(storagePath, compressed.uri);
      } catch (err) {
        logError('receipts.capture', 'upload failed', err, {
          receipt_id: receiptId,
          storage_path: storagePath,
        });
        throw err;
      }

      // 5. INSERT the pending row. PowerSync's CRUD queue replays the
      //    UPSERT against Supabase. extraction_status='queued' tells
      //    the worker to pick it up.
      const nowIso = new Date().toISOString();
      try {
        await db.execute(
          `INSERT INTO receipts (
             id, user_id, job_id, job_time_entry_id,
             photo_url, status, extraction_status,
             client_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            receiptId,
            userId,
            jobId ?? null,
            jobTimeEntryId ?? null,
            storagePath,
            'pending',
            'queued',
            receiptId,
            nowIso,
            nowIso,
          ]
        );
      } catch (err) {
        logError('receipts.capture', 'db insert failed', err, {
          receipt_id: receiptId,
        });
        // Best-effort: try to clean up the orphaned storage object so
        // we don't accumulate uploaded-but-unrecorded receipts. Failure
        // here is non-fatal — the IRS retention archival job will
        // catch orphans.
        try {
          await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        } catch (cleanupErr) {
          logWarn('receipts.capture', 'orphan cleanup failed', cleanupErr, {
            storage_path: storagePath,
          });
        }
        throw err;
      }

      logInfo('receipts.capture', 'success', {
        receipt_id: receiptId,
        job_id: jobId,
        bytes: compressed.fileSize ?? null,
      });

      return { id: receiptId, storagePath };
    },
    [db, session]
  );
}

async function pickImage(
  source: 'camera' | 'library'
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const err = new Error('Camera permission denied.');
      logWarn('receipts.pickImage', 'camera permission denied', err, {
        can_ask_again: perm.canAskAgain,
      });
      throw err;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // The OS picker's editor lets the user square-up the receipt;
      // good enough for v1. Edge-detection / deskew (plan §5.11.1
      // step 3) ships post-MVP.
      allowsEditing: true,
      quality: 1,
      exif: false,
    });
    return result.canceled ? null : result.assets[0] ?? null;
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    const err = new Error('Photo library permission denied.');
    logWarn('receipts.pickImage', 'library permission denied', err);
    throw err;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 1,
    exif: false,
  });
  return result.canceled ? null : result.assets[0] ?? null;
}

interface CompressedImage {
  uri: string;
  /** Reported by FileSystem after compression — useful for the upload
   *  log so we can correlate phone-side bytes with server-side cost. */
  fileSize?: number;
}

async function compressForUpload(sourceUri: string): Promise<CompressedImage> {
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: MAX_DIMENSION_PX } }],
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  // Sniff the size for telemetry. FileSystem.getInfoAsync returns
  // { size } on iOS/Android for local file:// URIs.
  let fileSize: number | undefined;
  try {
    const info = await FileSystem.getInfoAsync(result.uri, { size: true });
    if (info.exists && 'size' in info) fileSize = info.size;
  } catch {
    // Non-fatal — telemetry only.
  }

  return { uri: result.uri, fileSize };
}

async function uploadJpeg(storagePath: string, fileUri: string): Promise<void> {
  // RN's fetch can read file:// URIs into a Blob; that blob round-trips
  // through ArrayBuffer for the Supabase JS client. FormData with a
  // file:// uri also works on RN, but the ArrayBuffer path keeps the
  // upload deterministic and matches how Vision will eventually receive
  // the bytes.
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;
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
 * Resolve a receipts.photo_url (a storage path) to a signed URL. The
 * URL is valid for 15 minutes; if it expires while the user is staring
 * at the screen, the next render generates a fresh one.
 *
 * Returns null while the URL is being signed OR when the receipt has
 * no photo_url (shouldn't happen — the column is NOT NULL — but
 * defensive).
 */
export function useReceiptPhotoUrl(
  receipt: Pick<Receipt, 'photo_url'> | null | undefined
): string | null {
  const path = receipt?.photo_url ?? null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let mounted = true;
    supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 15)
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          logWarn('receipts.useReceiptPhotoUrl', 'signed URL failed', error, {
            path,
          });
          setUrl(null);
          return;
        }
        setUrl(data?.signedUrl ?? null);
      });
    return () => {
      mounted = false;
    };
  }, [path]);

  return url;
}
