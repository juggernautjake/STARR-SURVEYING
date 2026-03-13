import { createClient } from '@supabase/supabase-js';

// Use || fallbacks so createClient doesn't throw during Next.js build-time
// module evaluation when env vars are absent. At runtime the real env vars
// are always required — any Supabase call with placeholder credentials will
// fail loudly at the network level rather than crashing at module load.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
);
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key',
);

// ── Storage Bucket Utilities ─────────────────────────────────────────────────

// The research-documents bucket name (must match seeds/102_storage_buckets.sql).
export const RESEARCH_DOCUMENTS_BUCKET = 'research-documents';

// In-memory set of bucket names that have been verified to exist in this
// process lifetime.  Avoids redundant Supabase calls on every upload.
const _verifiedBuckets = new Set<string>();

/**
 * Ensures the given Supabase Storage bucket exists, creating it if it does not.
 *
 * Idempotent: after the first successful check or creation the result is cached
 * in-memory so subsequent calls in the same process are free.  Should be
 * called before any storage .upload() to give a clear error path when the
 * bucket has not been provisioned yet (e.g. the seeds/102_storage_buckets.sql
 * migration has not been run against the Supabase project).
 *
 * @param bucketName  Supabase Storage bucket identifier (default: RESEARCH_DOCUMENTS_BUCKET)
 * @param options     Optional bucket creation settings
 */
export async function ensureStorageBucket(
  bucketName: string = RESEARCH_DOCUMENTS_BUCKET,
  options: { public?: boolean; fileSizeLimit?: number } = {},
): Promise<void> {
  if (_verifiedBuckets.has(bucketName)) return;

  try {
    const { error: getError } = await supabaseAdmin.storage.getBucket(bucketName);

    if (!getError) {
      // Bucket already exists.
      _verifiedBuckets.add(bucketName);
      return;
    }

    // Only attempt creation when the bucket is genuinely absent.
    const isNotFound =
      getError.message?.includes('does not exist') ||
      getError.message?.includes('not found') ||
      getError.message?.includes('The resource was not found');

    if (!isNotFound) {
      // Some other error (permissions, network, etc.) — log and move on.
      console.warn(`[Storage] Cannot verify bucket "${bucketName}":`, getError.message);
      return;
    }

    const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
      // Default to public so that getPublicUrl() values work directly in <img> tags
      // and PDF viewers. Write access is still restricted via RLS policies.
      public: options.public ?? true,
      fileSizeLimit: options.fileSizeLimit ?? 52428800, // default 50 MB
    });

    if (createError) {
      // "already exists" can happen in a race; treat it as success.
      if (createError.message?.toLowerCase().includes('already exists')) {
        _verifiedBuckets.add(bucketName);
        return;
      }
      console.error(`[Storage] Failed to create bucket "${bucketName}":`, createError.message);
      return;
    }

    console.info(`[Storage] Created bucket "${bucketName}" (migration not yet applied).`);
    _verifiedBuckets.add(bucketName);
  } catch (err) {
    // Non-fatal — uploads may still succeed if the bucket exists.
    console.warn(`[Storage] ensureStorageBucket("${bucketName}") threw:`, err);
  }
}
