// lib/voice/attachments.ts — turning stored file paths into links a browser can follow.
//
// In lib/ rather than in the route for the reason recorded in lib/voice/slug.ts: a Next route file may
// export ONLY its handlers and segment config, and `npm run build` fails on anything else with a type
// error `npm run dev` never surfaces. This is the third time that rule has bitten in this build, which
// is why it now has a note in three files.
//
// ── WHY SIGNING EXISTS AT ALL ───────────────────────────────────────────────────────────────────
//
// The uploads bucket is PRIVATE. A stored `storage_path` is not something a browser can fetch, so it
// has to be exchanged for a short-lived signed URL behind a session check. A public bucket would make
// this module unnecessary and make every client's unreleased script readable by anyone who guessed a
// path — which, for an advertising client under embargo, is the exact thing their legal team asks
// about.

import { supabaseAdmin } from '@/lib/supabase';

export const UPLOADS_BUCKET = 'voice-uploads';

/** Long enough to click and download; short enough that a URL pasted into a chat is not a lasting
 *  leak. Thirty minutes also comfortably outlives a slow download on a bad connection. */
export const SIGNED_URL_SECONDS = 60 * 30;

export interface StoredAttachment {
  name?: string;
  storage_path?: string;
  size_bytes?: number;
  mime_type?: string | null;
}

export interface SignedAttachment extends StoredAttachment {
  /** Null when the file could not be signed — deleted from the bucket, or storage unreachable. */
  url: string | null;
}

/**
 * Exchanges storage paths for time-limited URLs.
 *
 * Failures are per-file and non-fatal. One unreadable attachment must not stop Andrew reading the
 * inquiry it belongs to — a null `url` renders as "unavailable" beside the filename, which is both
 * honest and recoverable, whereas throwing would 500 the whole page over a missing file.
 */
export async function signAttachments(attachments: StoredAttachment[]): Promise<SignedAttachment[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  return Promise.all(
    attachments.map(async (file) => {
      if (!file?.storage_path) return { ...file, url: null };
      try {
        const { data } = await supabaseAdmin.storage
          .from(UPLOADS_BUCKET)
          .createSignedUrl(file.storage_path, SIGNED_URL_SECONDS);
        return { ...file, url: data?.signedUrl ?? null };
      } catch {
        return { ...file, url: null };
      }
    }),
  );
}

/** Human-readable file size. */
export function formatBytes(n: number | undefined): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
