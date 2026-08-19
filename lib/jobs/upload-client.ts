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

export interface JobUploadStarted {
  file_id: string;
  path: string;
  signed_url: string;
}

export interface JobUploadResult {
  file_id: string;
  storage_path: string;
}

/** PUT with a progress callback. XHR rather than fetch because fetch still cannot report upload
 *  progress — and a 90 MB attachment with no progress bar reads as a frozen page. */
function putWithProgress(url: string, file: File, onPct?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onPct) onPct(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () =>
      (xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Network error during upload'));
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
  onPct?: (pct: number) => void,
): Promise<JobUploadResult> {
  return uploadAttachmentBytes({ job_id: jobId }, file, onPct);
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
  onPct?: (pct: number) => void,
): Promise<JobUploadResult> {
  return uploadAttachmentBytes({ project_id: projectId }, file, onPct);
}

async function uploadAttachmentBytes(
  owner: { job_id?: string; project_id?: string },
  file: File,
  onPct?: (pct: number) => void,
): Promise<JobUploadResult> {
  const init = await fetch('/api/admin/jobs/files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...owner, name: file.name, size_bytes: file.size }),
  });

  if (!init.ok) {
    const body = (await init.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Could not start uploading ${file.name}.`);
  }

  const started = (await init.json()) as JobUploadStarted;
  await putWithProgress(started.signed_url, file, onPct);
  return { file_id: started.file_id, storage_path: started.path };
}
