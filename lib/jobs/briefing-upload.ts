// lib/jobs/briefing-upload.ts — the browser half of the direct-to-storage upload. Slice B3 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// ── WHY XMLHttpRequest IN 2026 ──────────────────────────────────────────────────────────────────
//
// `fetch` still cannot report upload progress. It reports *download* progress through a response
// stream, and there is no equivalent for the request body in any shipping browser. For a 4 KB form
// that does not matter; for a 150 MB screen recording a progress bar is the difference between
// waiting and reloading the page halfway through — and reloading halfway through is how a briefing
// ends up with a `job_files` row pointing at bytes that never landed.
//
// So this one upload uses XHR. Everything else in the product should keep using `fetch`.
//
// ── THE ORDER MATTERS ───────────────────────────────────────────────────────────────────────────
//
// 1. ask our API for a signed URL   — it decides whether the file is allowed, and names the object
// 2. PUT the bytes straight to Supabase — our API never sees them (Vercel's 4.5 MB body cap, D1)
// 3. tell our API it is done        — which verifies the object EXISTS before registering it
//
// Step 3's verification is why a failure at step 2 leaves nothing behind: there is no row until
// storage confirms the bytes. The old shape — register first, upload second — produces a briefing
// item that renders as a broken player, and a broken player reads as a bug in the video rather than
// as an upload somebody needs to retry.

export interface UploadProgress {
  /** 0–1. Reaches 1 when the bytes are in storage, NOT when the item is registered — the last step
   *  is a small JSON call and a bar that sticks at 99% while it runs looks stalled. */
  fraction: number;
  loadedBytes: number;
  totalBytes: number;
}

export interface BriefingUploadInput {
  jobId: string;
  briefingId: string;
  kind: 'video' | 'photo' | 'file';
  blob: Blob;
  fileName: string;
  durationSeconds?: number;
  description?: string;
  onProgress?: (p: UploadProgress) => void;
  /** Lets the caller cancel. An aborted upload rejects with `UploadAborted` and, per the order
   *  above, leaves no row behind. */
  signal?: AbortSignal;
}

export interface BriefingUploadResult {
  item: { id: string; kind: string; job_file_id: string | null; duration_seconds: number | null };
  jobFile: { id: string; file_name: string; storage_path: string; file_size_bytes: number | null };
}

export class UploadAborted extends Error {
  constructor() { super('The upload was cancelled.'); this.name = 'UploadAborted'; }
}

/** Put a recording, photo or file on a briefing. Throws with a sentence a person can act on. */
export async function uploadBriefingItem(input: BriefingUploadInput): Promise<BriefingUploadResult> {
  const { jobId, briefingId, kind, blob, fileName, signal } = input;
  const base = `/api/admin/jobs/${encodeURIComponent(jobId)}/briefings/${encodeURIComponent(briefingId)}`;

  // 1 — permission and a place to put it.
  const urlRes = await fetch(`${base}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, fileName, sizeBytes: blob.size }),
    signal,
  });
  const urlJson = (await urlRes.json().catch(() => ({}))) as
    { uploadUrl?: string; token?: string; bucket?: string; path?: string; error?: string };
  if (!urlRes.ok || !urlJson.uploadUrl || !urlJson.path) {
    throw new Error(urlJson.error || `Could not start the upload (HTTP ${urlRes.status}).`);
  }

  // 2 — the bytes, with progress.
  await putWithProgress(urlJson.uploadUrl, blob, input.onProgress, signal);

  // 3 — register it. Only now does anything exist in the database.
  const doneRes = await fetch(`${base}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      path: urlJson.path,
      fileName,
      contentType: blob.type || null,
      sizeBytes: blob.size,
      durationSeconds: input.durationSeconds,
      description: input.description,
    }),
    signal,
  });
  const doneJson = (await doneRes.json().catch(() => ({}))) as BriefingUploadResult & { error?: string };
  if (!doneRes.ok) {
    throw new Error(
      doneJson.error
      || `The file uploaded but could not be added to the briefing (HTTP ${doneRes.status}). Try adding it again.`,
    );
  }
  return doneJson;
}

/**
 * PUT a blob to a signed Supabase upload URL, reporting progress.
 *
 * `x-upsert: true` is deliberately NOT sent. Every object key carries a uuid (`briefingObjectPath`),
 * so a collision means something has gone wrong with the key rather than that somebody meant to
 * replace a file — and silently overwriting a 120 MB recording is not a recoverable mistake.
 */
function putWithProgress(
  url: string,
  blob: Blob,
  onProgress: ((p: UploadProgress) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new UploadAborted()); return; }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    if (blob.type) xhr.setRequestHeader('Content-Type', blob.type);

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.upload.onprogress = (ev) => {
      if (!onProgress) return;
      // `lengthComputable` is false on some proxies. Falling back to the blob size is right here —
      // we always know it, unlike a stream of unknown length.
      const total = ev.lengthComputable ? ev.total : blob.size;
      onProgress({
        fraction: total > 0 ? Math.min(1, ev.loaded / total) : 0,
        loadedBytes: ev.loaded,
        totalBytes: total,
      });
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ fraction: 1, loadedBytes: blob.size, totalBytes: blob.size });
        resolve();
        return;
      }
      // Storage's own refusals, translated. A raw 413 body is XML nobody reads.
      if (xhr.status === 413) {
        reject(new Error('Storage refused the file as too large. Record it in shorter parts.'));
      } else if (xhr.status === 400 && /expired|jwt/i.test(xhr.responseText || '')) {
        reject(new Error('The upload window expired before the file finished. Try again — it will start over with a fresh one.'));
      } else {
        reject(new Error(`The upload failed (HTTP ${xhr.status}). Nothing was saved, so you can try again.`));
      }
    };
    xhr.onerror = () => { cleanup(); reject(new Error('The connection dropped during the upload. Nothing was saved — try again.')); };
    xhr.onabort = () => { cleanup(); reject(new UploadAborted()); };
    xhr.send(blob);
  });
}
