// lib/files/fetch-file.ts — read a file's bytes in the browser for a preview (2026-10-01).
//
// THE BUG THIS EXISTS FOR: the viewer's link to a job file is a Supabase signed URL on another
// origin (*.supabase.co). Storage answers CORS with `Access-Control-Allow-Origin: *` and no
// Allow-Credentials, and a browser refuses to combine a wildcard origin with a credentialed request.
// So every preview that fetched with `credentials: 'include'` — TRV, spreadsheets, plain text, and
// CAD's "Open in Starr CAD" hand-off — failed before it reached storage, as "Failed to fetch".
//
// A signed URL carries its own token; it needs no cookies. Our own routes do. So: cookies for
// same-origin URLs only, never for anything else.

/** The credentials mode for fetching `url` from a page on `origin`.
 *
 *  'same-origin', not 'include', for our own routes (2026-10-06): a route like
 *  /api/admin/research/file/... answers with a 302 to a signed storage URL, and 'include' carries the
 *  credentials across that redirect — straight into the wildcard-CORS refusal described above.
 *  'same-origin' sends the session to our route and drops it at the hop to storage, which is what
 *  `lib/files/download.ts` has always done. */
export function credentialsFor(url: string, origin: string): RequestCredentials {
  try {
    return new URL(url, origin).origin === origin ? 'same-origin' : 'omit';
  } catch {
    return 'omit';
  }
}

/** Fetch a file for a preview. Errors read as a sentence a person can act on, not "Failed to fetch". */
export async function fetchFileForPreview(url: string, opts: { maxBytes?: number } = {}): Promise<ArrayBuffer> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  let res: Response;
  try {
    res = await fetch(url, { credentials: credentialsFor(url, origin) });
  } catch {
    throw new Error('the file could not be reached — check the connection and try again');
  }
  if (res.status === 400 || res.status === 403) throw new Error('the link to this file has expired — close the viewer and open the file again');
  if (res.status === 404) throw new Error('this file is missing from storage');
  if (!res.ok) throw new Error(`the server answered HTTP ${res.status}`);
  const tooBig = 'this file is too large to preview — save it to open it';
  const declared = Number(res.headers.get('content-length'));
  if (opts.maxBytes && declared > opts.maxBytes) throw new Error(tooBig);
  const buf = await res.arrayBuffer();
  if (opts.maxBytes && buf.byteLength > opts.maxBytes) throw new Error(tooBig);
  return buf;
}
