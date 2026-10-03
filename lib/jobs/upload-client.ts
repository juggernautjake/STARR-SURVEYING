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

import { explainPutFailure } from '@/lib/storage/uploads';
import { UploadError, asStep, contentTypeForAnyFile } from '@/lib/files/upload-resilience';

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

/** Re-exported: the refusal a person reads is the same one on every upload surface, and it lives
 *  with the cap it talks about. See `lib/storage/uploads.ts`. */
export { explainPutFailure };

/** PUT with a progress callback. XHR rather than fetch because fetch still cannot report upload
 *  progress — and a 300 MB attachment with no progress bar reads as a frozen page. */
export function putWithProgress(url: string, file: File, onProgress?: (p: UploadProgress) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    // ── AN EXPLICIT CONTENT TYPE (2026-08-19) ───────────────────────────────────────────────────
    //
    // Letting the browser derive this from `File.type` is fine until it is empty — which some
    // Android camera apps do for their own recordings. The video bucket has a MIME allowlist, so an
    // empty type is rejected with a message about MIME types that means nothing to somebody holding
    // a phone. `contentTypeFor` falls back to the extension and the upload simply works.
    // 2026-10-01: from the extension for every kind of file, not only video — a `.csv` picked on
    // Android arrives with no type at all, and storage then serves it back as a download blob.
    xhr.setRequestHeader('Content-Type', contentTypeForAnyFile(file.name, file.type));
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
        : reject(new UploadError(explainPutFailure(xhr.status, xhr.responseText, file), {
          status: xhr.status, phase: 'send', responseText: xhr.responseText,
        })));
    // Status 0: no answer at all. On Android this is ALSO what a file that changed after it was
    // picked looks like (net::ERR_UPLOAD_FILE_CHANGED) — `classifyUploadFailure` words it for both,
    // and the dialog copies small files into memory first so it cannot happen to them.
    xhr.onerror = () => reject(new UploadError('The connection dropped while sending the file.', { status: 0, phase: 'send' }));
    xhr.onabort = () => reject(new UploadError('Upload cancelled.', { status: 0, phase: 'send', kind: 'refused' }));
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
  const init = await asStep('start', () => fetch('/api/admin/jobs/files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The type from the extension when Android gave none: the server picks the bucket (and the
    // video cap) from it, so an untyped .mp4 must still say it is a video.
    body: JSON.stringify({ ...owner, name: file.name, size_bytes: file.size, mime_type: contentTypeForAnyFile(file.name, file.type) }),
  }));

  if (!init.ok) throw await startFailure(init, file.name);

  const started = (await init.json()) as JobUploadStarted;
  await putWithProgress(started.signed_url, file, onProgress);
  return { file_id: started.file_id, storage_path: started.path, storage_bucket: started.bucket };
}

/**
 * The error for a refused JSON step, with its status kept so the caller can tell "signed out" from
 * "try again". Reads the body as text first: a platform 413 or a proxy's error page is not JSON,
 * and `res.json()` throwing on it used to turn a clear refusal into "did not reach the server".
 */
export async function startFailure(res: Response, fileName: string, phase: 'start' | 'save' = 'start'): Promise<UploadError> {
  const text = await res.text().catch(() => '');
  let serverMessage: string | undefined;
  try { serverMessage = (JSON.parse(text) as { error?: string }).error ?? undefined; } catch { /* not JSON */ }
  const fallback = phase === 'start' ? `Could not start uploading ${fileName}.` : `The file went up, but ${fileName} could not be saved to the folder.`;
  return new UploadError(serverMessage ?? fallback, { status: res.status, phase, serverMessage, responseText: text });
}
