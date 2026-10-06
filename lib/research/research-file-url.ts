// lib/research/research-file-url.ts — research files are private; this is how a link to one looks.
//
// Until 2026-10-06 the `research-documents` bucket was PUBLIC: every deed, plat and capture was at
// a permanent, unauthenticated Supabase URL, and that URL was stored on the row
// (`research_documents.storage_url`, `pages_pdf_url`, inside `ocr_regions`). The bucket is private
// now. A stored link is the app's own route instead —
//
//   /api/admin/research/file/<storage key>
//
// — which checks the session and redirects to a short-lived signed URL. It works anywhere a URL did
// (img, iframe, PDF viewer, download link) for a signed-in person, and nowhere for anybody else.
//
// Both forms are understood here, because rows written before the switch and a worker that has not
// been redeployed can still produce the old public form; seeds/669 rewrites them on the way in.
//
// Pure: no Supabase client, safe in the browser. The server half (signing, fetching) is
// `research-files.ts`.

export const RESEARCH_FILE_ROUTE = '/api/admin/research/file/';
const PUBLIC_MARKER = '/storage/v1/object/public/research-documents/';
const SIGNED_MARKER = '/storage/v1/object/sign/research-documents/';

/** The storage key a research-file link points at, or null when it is not a research file. */
export function researchStorageKey(url: string | null | undefined): string | null {
  if (!url) return null;
  let rest: string | null = null;
  for (const marker of [RESEARCH_FILE_ROUTE, PUBLIC_MARKER, SIGNED_MARKER]) {
    const i = url.indexOf(marker);
    if (i >= 0) { rest = url.slice(i + marker.length); break; }
  }
  if (rest === null) return null;
  rest = rest.split(/[?#]/)[0];
  const key = rest.split('/').map((seg) => {
    try { return decodeURIComponent(seg); } catch { return seg; }
  }).join('/');
  // Never a path that climbs out of the bucket.
  if (!key || key.split('/').some((s) => s === '..')) return null;
  return key;
}

/** The app route for a storage key. */
export function researchFileRoute(key: string, opts: { download?: boolean } = {}): string {
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `${RESEARCH_FILE_ROUTE}${path}${opts.download ? '?download=1' : ''}`;
}

/** Any research-file link → the app route; anything else unchanged. */
export function toResearchFileRoute(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  const key = researchStorageKey(url);
  return key ? researchFileRoute(key) : url;
}
