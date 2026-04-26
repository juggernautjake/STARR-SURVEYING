/**
 * Generic Supabase Storage signed-URL hook. Resolves a {bucket, path}
 * pair to a signed URL valid for the requested TTL; refreshes on the
 * next render after the path changes.
 *
 * F2 receipts photo previews use this (lib/receipts.ts re-exports a
 * thin wrapper). F3 will use it for data-point photos and F4 for
 * voice-memo + video URLs.
 *
 * Returns null while:
 *   - the path is empty (no row to sign yet)
 *   - the URL is being signed (first render after the path changes)
 *   - the Supabase request errored (logged via logWarn)
 *
 * The 15-minute default TTL is plenty for a single screen view; if
 * the URL expires while the user is staring at the screen the next
 * re-render generates a fresh one.
 */
import { useEffect, useState } from 'react';

import { logWarn } from '../log';
import { supabase } from '../supabase';

const DEFAULT_TTL_SEC = 60 * 15;

export function useSignedUrl(
  bucket: string,
  path: string | null | undefined,
  ttlSec: number = DEFAULT_TTL_SEC
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let mounted = true;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttlSec)
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          logWarn('storage.useSignedUrl', 'signed URL failed', error, {
            bucket,
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
  }, [bucket, path, ttlSec]);

  return url;
}
