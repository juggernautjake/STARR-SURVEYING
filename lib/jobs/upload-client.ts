// lib/jobs/upload-client.ts — put a job attachment's bytes in storage, from the browser.
//
// The three-step the File Explorer already uses: ask the server for a signed URL, PUT the bytes
// STRAIGHT to storage, then create the row. The bytes never pass through the API, which is the only
// reason a 90 MB drawing is possible — and the reason this replaced
// `FileReader.readAsDataURL`, which put the whole file in a Postgres text column as base64 and left
// it invisible to the File Explorer. `lib/jobs/file-storage.ts` has the full account.
//
// Browser-only (XHR, File). The pure decisions it depends on are tested next door; what is left
// here is the network, which is why this module is deliberately thin.

import { contentTypeFor } from './file-storage';

export interface JobUploadStarted {
  file_id: string;
  path: string;
  signed_url: string;
  bucket: string;
}

export interface JobUploadResult {
  file_id: string;
  storage_path: string;
  /** Which bucket the bytes went to. The row must record it, or the download looks in the wrong
   *  place — video lives in `starr-field-videos`, everything else in `starr-field-files`. */
  storage_bucket: string;
}

/**
 * How far along one file is.
 *
 * Bytes as well as a percentage, because on a 300 MB phone video a percentage alone is not enough
 * to tell a slow upload from a stalled one — "142 MB of 310 MB" moving is information, "46%" that
 * has not changed in a minute is not.
 */
export interface UploadProgress {
  pct: number;
  loaded: number;
  total: number;
}

/**
 * Turn storage's refusal into something the person holding the phone can act on.
 *
 * ── THE FAILURE THIS NAMES (2026-08-22) ─────────────────────────────────────────────────────────
 *
 * There is exactly one way a correctly-sized upload still dies at 100%: the app's cap
 * (`NEXT_PUBLIC_MAX_UPLOAD_BYTES`) is set HIGHER than the Supabase project ceiling, so the server
 * signs the URL, the client sends every byte, and storage refuses the object at the very end. That
 * is the 375 MB video of 2026-08-19, and the reason `scripts/check-upload-ceiling.mjs` exists.
 *
 * Supabase answers that case with `413` in a JSON `statusCode` — inside an HTTP **400** — and the
 * message "The object exceeded the maximum allowed size". Reporting it as `Upload failed (400)`
 * sent the last investigation looking at the route, which was fine, instead of at the ceiling,
 * which was not. So it is named here, with the number that would have to change.
 */
export function explainPutFailure(status: number, responseText: string, file: { name: string; size: number }): string {
  const body = (responseText ?? '').toLowerCase();
  const tooBig =
    status === 413
    || body.includes('exceeded the maximum allowed size')
    || body.includes('payload too large')
    || body.includes('"statuscode":"413"');

  if (tooBig) {
    const mb = Math.round(file.size / 1024 / 1024);
    return (
      `Storage refused ${file.name} (${mb} MB) as too large, after the whole file had been sent. `
      + 'This app is configured to allow more than the Supabase project actually accepts. '
      + 'Raise Storage → Settings → Upload file size limit, then run '
      + '`node scripts/check-upload-ceiling.mjs` and set NEXT_PUBLIC_MAX_UPLOAD_BYTES to what it proves.'
    );
  }

  if (status === 0) {
    return 'The connection dropped during the upload. Large files need the transfer to hold for its whole duration — try again with a stronger signal.';
  }
  if (status === 401 || status === 403) {
    return 'The upload link expired before the file finished sending. Try again — a fresh link is issued each time.';
  }
  return `Upload failed (${status}).`;
}

/** PUT with a progress callback. XHR rather than fetch because fetch still cannot report upload
 *  progress — and a 300 MB attachment with no progress bar reads as a frozen page. */
function putWithProgress(url: string, file: File, onProgress?: (p: UploadProgress) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    // ── AN EXPLICIT CONTENT TYPE (2026-08-19) ───────────────────────────────────────────────────
    //
    // Letting the browser derive this from `File.type` is fine until it is empty — which some
    // Android camera apps do for their own recordings. The video bucket has a MIME allowlist, so an
    // empty type is rejected with a message about MIME types that means nothing to somebody holding
    // a phone. `contentTypeFor` falls back to the extension and the upload simply works.
    xhr.setRequestHeader('Content-Type', contentTypeFor(file.name, file.type));
    xhr.upload.onprogress = (ev) => {
      if (!onProgress) return;
      // `lengthComputable` is false on some proxies. Falling back to the File's own size keeps the
      // bar moving rather than freezing at 0% for the whole transfer.
      const total = ev.lengthComputable ? ev.total : file.size;
      const loaded = Math.min(ev.loaded, total);
      onProgress({ pct: total > 0 ? Math.round((loaded / total) * 100) : 0, loaded, total });
    };
    // The bytes are all sent before the server answers; a 300 MB video then sits at 100% while
    // storage commits it. Reported so the caller can say "finishing" rather than appear stuck.
    xhr.upload.onload = () => onProgress?.({ pct: 100, loaded: file.size, total: file.size });
    xhr.onload = () =>
      (xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(explainPutFailure(xhr.status, xhr.responseText, file))));
    xhr.onerror = () => reject(new Error('Network error during upload. Check your connection and try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    // NO `xhr.timeout` is set, deliberately. A 500 MB video over a field connection can legitimately
    // take the better part of an hour, and any fixed deadline would kill exactly the uploads this
    // whole path exists to make possible. A genuinely dead connection surfaces through `onerror`.
    // (An `ontimeout` handler without a `timeout` value is dead code — it never fires.)
    xhr.send(file);
  });
}

/**
 * Upload one file's bytes for a job, and return what the row needs to point at them.
 *
 * Throws with the SERVER's message where there is one — it knows why it refused (the job is gone,
 * the file is over the bucket cap) and a message written on the client would be a guess.
 */
export async function uploadJobFileBytes(
  jobId: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<JobUploadResult> {
  return uploadAttachmentBytes({ job_id: jobId }, file, onProgress);
}

/**
 * The same upload, for a document that belongs to the PROJECT rather than to one job — the signed
 * contract, the title commitment, the deed the whole tract was quoted from (2026-08-19).
 *
 * One function for both owners rather than two near-copies: the three-step and its failure handling
 * are the part that is easy to get subtly different, and a project upload that retried differently
 * from a job upload would be a bug nobody could see.
 */
export async function uploadProjectFileBytes(
  projectId: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<JobUploadResult> {
  return uploadAttachmentBytes({ project_id: projectId }, file, onProgress);
}

async function uploadAttachmentBytes(
  owner: { job_id?: string; project_id?: string },
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<JobUploadResult> {
  const init = await fetch('/api/admin/jobs/files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...owner, name: file.name, size_bytes: file.size, mime_type: file.type }),
  });

  if (!init.ok) {
    const body = (await init.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Could not start uploading ${file.name}.`);
  }

  const started = (await init.json()) as JobUploadStarted;
  await putWithProgress(started.signed_url, file, onProgress);
  return { file_id: started.file_id, storage_path: started.path, storage_bucket: started.bucket };
}
