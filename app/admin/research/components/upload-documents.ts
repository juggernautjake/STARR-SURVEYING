// app/admin/research/components/upload-documents.ts — Phase N4.
//
// ── ONE UPLOAD SEQUENCE, TWO PLACES THAT NEED IT ────────────────────────────────────────────────
//
// `DocumentUploadPanel` owned the whole three-step upload inline. That was fine while it was the
// only way to add a file. N4 asks for parity — "an upload should land in the same place, be
// viewable the same way, and be distinguishable by `source_type`" — and the Documents page, which
// is where the files actually live, could only say *"upload deeds and plats from the project
// page."* A list you cannot add to, beside a form you cannot see the list from.
//
// Copying the sequence into the second screen is the defect this repo already has a name for: two
// pipelines, which agree on the day they are written and then quietly stop agreeing. The upload
// route sets `source_type: 'user_upload'`, and that single value is what makes an upload
// distinguishable everywhere downstream — `document-rows.ts` reads it for the "Uploaded" pill, the
// documents page filters on it, and the Library counts on it. A second implementation that forgot
// step 3, or posted to a slightly different route, would produce rows that look retrieved.
//
// So the sequence moves here, unchanged, and both callers get the same one.
//
// ── WHAT THE THREE STEPS ARE FOR ────────────────────────────────────────────────────────────────
//
//   1. POST /documents/upload-url — validate, create the DB record, hand back a signed URL
//   2. PUT  <signedUrl>           — the bytes go straight to Supabase Storage
//   3. PATCH /documents?action=confirm_upload — start background processing
//
// Step 2 bypasses the Next.js route body parser on purpose: routing a 40 MB plat through it
// returns 413 Payload Too Large. That is why this is three calls and not one, and it is the first
// thing somebody "simplifying" this would undo.

/** 50 MB. The signed-URL flow removes the route-body limit; this one is the storage bucket's. */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = new Set([
  '.pdf',
  '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp', '.bmp', '.gif', '.heic', '.heif',
  '.docx', '.txt', '.rtf',
]);

export const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/tiff', 'image/webp', 'image/bmp', 'image/gif',
  'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/rtf', 'application/rtf',
]);

/** The `accept` attribute for a file input, derived so it can never drift from the check. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_EXTENSIONS, ...ACCEPTED_MIME_TYPES].join(',');

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Checked before anything is sent. The server validates again — this exists so a person learns
 * that a 60 MB file is too large before waiting for 60 MB to travel.
 */
export function validateFiles(files: File[]): { valid: File[]; errors: string[] } {
  const valid: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const ext = getFileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.has(ext) && !ACCEPTED_MIME_TYPES.has(file.type)) {
      errors.push(`"${file.name}" — unsupported file type (${ext || file.type || 'unknown'})`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(`"${file.name}" — file too large (${formatFileSize(file.size)}, max 50 MB)`);
      continue;
    }
    if (file.size === 0) {
      // A zero-byte file uploads perfectly and then fails to process, which reads as a bug in the
      // pipeline rather than as a bad file.
      errors.push(`"${file.name}" — file is empty`);
      continue;
    }
    valid.push(file);
  }

  return { valid, errors };
}

export interface UploadOutcome {
  /** True if at least one file made it, so the caller knows whether to reload the list. */
  anySuccess: boolean;
  /** One line per file that did not. Empty on complete success. */
  errors: string[];
}

/**
 * Uploads files to a research project. Every failure is per-file: one bad file in a selection of
 * six must not stop the other five, which is why this collects errors rather than throwing.
 *
 * A failed PUT deletes the DB record it just created. Without that, a network drop leaves a row
 * with no bytes behind it — a document that lists, opens, and shows nothing.
 */
export async function uploadDocuments(projectId: string, files: File[]): Promise<UploadOutcome> {
  const errors: string[] = [];
  let anySuccess = false;

  for (const file of files) {
    let docId: string | null = null;
    let signedUrl: string | null = null;
    let storagePath: string | null = null;
    const contentType = file.type || 'application/octet-stream';

    // ── Step 1: request a signed upload URL ─────────────────────────────────────────────────
    try {
      const urlRes = await fetch(`/api/admin/research/${projectId}/documents/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, fileSize: file.size, fileType: file.type }),
      });

      const urlData = await urlRes.json().catch(() => ({ error: 'Invalid server response' }));

      if (!urlRes.ok) {
        errors.push(`"${file.name}": ${urlData.error ?? 'Failed to initialize upload'}`);
        continue;
      }

      // The server recognised this file as already present. Counts as success: the document the
      // person wanted in the project is in the project. Reporting it as an error would send them
      // looking for a problem that does not exist.
      if (urlData.document && !urlData.signedUrl) {
        anySuccess = true;
        continue;
      }

      docId = urlData.docId as string;
      signedUrl = urlData.signedUrl as string;
      storagePath = urlData.storagePath as string;
    } catch {
      errors.push(`"${file.name}": Failed to initialize upload. Check your connection.`);
      continue;
    }

    // ── Step 2: the bytes, straight to storage ──────────────────────────────────────────────
    try {
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': contentType },
      });

      if (!putRes.ok) {
        await fetch(`/api/admin/research/${projectId}/documents?id=${docId}`, { method: 'DELETE' })
          .catch(() => {});
        errors.push(`"${file.name}": File upload failed (${putRes.status}). Please try again.`);
        continue;
      }
    } catch {
      await fetch(`/api/admin/research/${projectId}/documents?id=${docId}`, { method: 'DELETE' })
        .catch(() => {});
      errors.push(`"${file.name}": File upload failed. Check your connection.`);
      continue;
    }

    // ── Step 3: confirm, which starts background processing ─────────────────────────────────
    try {
      await fetch(
        `/api/admin/research/${projectId}/documents?id=${docId}&action=confirm_upload`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath }),
        },
      );
    } catch {
      // Deliberately non-fatal. The bytes are stored and the row exists with
      // `processing_status='pending'`; the Retry button re-triggers processing. Treating this as a
      // failure would delete a document that uploaded perfectly well.
    }

    anySuccess = true;
  }

  return { anySuccess, errors };
}
