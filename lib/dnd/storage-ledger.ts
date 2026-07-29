// lib/dnd/storage-ledger.ts — the I/O half of the storage quota (P2-7, audit F-6).
//
// `storage-quota.ts` holds the arithmetic and is pure. This holds the three database operations, kept apart
// for the same reason the rate limiter splits `decide` from `checkRateLimit`: the part that must be right
// should not need a database to assert.
//
// FAIL OPEN, deliberately, and consistently with `rate-limit.ts`. If the ledger table is missing (seed 459
// not applied) or the query errors, uploads are ALLOWED. A quota is a cost control; a broken cost control
// that blocks every upload is a worse outcome than a brief window with no ceiling. The authorization gates
// fail closed and are separate from this on purpose.
import { supabaseAdmin } from '@/lib/supabase';
import { quotaState, wouldExceedQuota, quotaMessage, type QuotaState } from './storage-quota';

/** Total bytes this account has stored. 0 when unknown — see the fail-open note above. */
export async function usedStorage(userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;
  try {
    const { data } = await supabaseAdmin
      .from('dnd_storage_objects')
      .select('bytes')
      .eq('user_id', userId);
    return ((data ?? []) as { bytes: number }[]).reduce((sum, r) => sum + (Number(r.bytes) || 0), 0);
  } catch {
    return 0;
  }
}

/** The account's quota position, for a meter. */
export async function storageState(userId: string | null | undefined): Promise<QuotaState> {
  return quotaState(await usedStorage(userId));
}

/**
 * May this upload proceed? Returns a refusal MESSAGE, or null to continue.
 *
 * A message rather than a boolean so every route reports the same thing, and so the call site reads as a
 * guard clause — the shape `enforceRateLimit` settled on in P2-1b for the same reason.
 */
export async function checkStorageQuota(
  userId: string | null | undefined,
  incomingBytes: number,
): Promise<string | null> {
  if (!userId) return null;
  const used = await usedStorage(userId);
  return wouldExceedQuota(used, incomingBytes) ? quotaMessage(used) : null;
}

/**
 * Record an uploaded object.
 *
 * Upserts on `object_path` so a retried upload of the same storage key updates one row instead of
 * double-counting bytes that exist once — which would leak quota nothing could ever free, since the release
 * path deletes by path.
 *
 * Never throws: a ledger write failing must not fail the upload the user just completed successfully. The
 * cost of a missed row is a slightly under-counted quota; the cost of throwing here is a file in the bucket
 * and an error on screen.
 */
export async function recordStorage(input: {
  userId: string | null | undefined;
  bucket: string;
  objectPath: string;
  bytes: number;
  kind?: string;
}): Promise<void> {
  if (!input.userId || !input.objectPath) return;
  try {
    await supabaseAdmin.from('dnd_storage_objects').upsert(
      {
        user_id: input.userId,
        bucket: input.bucket,
        object_path: input.objectPath,
        bytes: Math.max(0, Math.round(input.bytes) || 0),
        kind: input.kind ?? null,
      },
      { onConflict: 'object_path' },
    );
  } catch {
    /* see the doc comment: never fail a completed upload over bookkeeping */
  }
}

/**
 * Free an object's bytes when it is deleted.
 *
 * The half that makes the quota survivable. Without it the number only ever rises, and every active account
 * is eventually locked out permanently — a failure that looks fine for months and then affects everyone at
 * once. Accepts several paths because a delete often removes a set.
 */
export async function releaseStorage(objectPaths: string[]): Promise<void> {
  const paths = (objectPaths ?? []).filter(Boolean);
  if (!paths.length) return;
  try {
    await supabaseAdmin.from('dnd_storage_objects').delete().in('object_path', paths);
  } catch {
    /* best effort, same reasoning as recordStorage */
  }
}

/**
 * The storage key inside a bucket, derived from a public URL.
 *
 * Upload routes hold the key when they write, but DELETE handlers usually hold only the stored URL — so
 * releasing bytes means recovering the key from it. Returns null when the URL is not from this bucket,
 * rather than guessing.
 */
export function objectPathFromUrl(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const idx = (url ?? '').indexOf(marker);
  return idx >= 0 ? url.slice(idx + marker.length) : null;
}
