// lib/research/research-files.ts — reading a private research file on the SERVER.
//
// A stored link is now the app route (`/api/admin/research/file/...`), which is relative and needs a
// browser session — useless to `fetch()` on the server, and to anything outside the app (the AI
// reading an image by URL). These turn any research-file link, old public form or new route form,
// into a short-lived signed URL. Non-research URLs pass through untouched, so call sites can wrap
// every `fetch(doc.storage_url)` without caring which kind they hold.

import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { researchStorageKey } from './research-file-url';

/** A URL `fetch()` (or an outside service) can read. Research files are signed for `ttlSeconds`. */
export async function fetchableUrl(url: string, ttlSeconds = 600): Promise<string> {
  const key = researchStorageKey(url);
  if (!key) return url;
  const { data, error } = await supabaseAdmin.storage
    .from(RESEARCH_DOCUMENTS_BUCKET)
    .createSignedUrl(key, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error(`could not sign research file ${key}: ${error?.message ?? 'no url'}`);
  return data.signedUrl;
}

/** `fetch()` that also reads private research files. Same signature as fetch for a URL string. */
export async function fetchStoredFile(url: string, init?: RequestInit): Promise<Response> {
  return fetch(await fetchableUrl(url), init);
}
