// lib/research/attach-uploaded-documents.ts — G1: the survey you uploaded now reaches the run.
//
// ── THE GAP ─────────────────────────────────────────────────────────────────────────────────────
//
// The owner asked to "upload images and files to start the run so that it has as much info to go off
// of before the run begins". There is a whole STAGE for it — Upload sits immediately before Research
// in the workflow, and `UploadStagePanel` is the last thing an operator touches before the pipeline
// starts. It looks exactly like giving the run information.
//
// It did not. Uploaded files land in `research_documents` with `source_type: 'user_upload'`, and
// neither this route nor the worker ever read them back. The worker's `userFiles` path — which
// parses attachments, runs them through `processUserFiles`, and merges them into `documents` right
// before Stage 3 AI Extraction — was only ever fed from the request body, and nothing populated it.
//
// So an operator could upload the client's survey, watch it appear on the project, start the run,
// and have the run never see it. Nothing failed. The file was genuinely stored; it was simply not
// research.
//
// ── WHY A CAP, AND WHY SILENCE IS NOT AN OPTION ─────────────────────────────────────────────────
//
// These files are base64-encoded into the worker request, so the whole payload sits in memory at
// both ends. A project with forty scanned plats cannot ship them all inline.
//
// The important part is that hitting the cap must be SAID. A run that quietly attached six of a
// project's twenty documents would be the same defect one layer along: the operator would believe
// the run had read everything they gave it. So the result reports what was skipped and why, and the
// caller puts that in the run log.

/** A row from `research_documents`, narrowed to what this needs. */
export interface UploadedDocumentRow {
  id?: string;
  original_filename?: string | null;
  file_type?: string | null;
  storage_url?: string | null;
  file_size_bytes?: number | null;
  document_label?: string | null;
}

/** The shape the worker parses (`UserFile` in worker/src/types). */
export interface AttachedFile {
  filename: string;
  mimeType: string;
  data: string;
  size: number;
  description?: string;
}

export interface AttachResult {
  files: AttachedFile[];
  /** Sentences for the run log. Empty when everything the project holds was attached. */
  notes: string[];
}

/**
 * Total inline attachment budget for a run, in bytes.
 *
 * Smaller than the 500 MB in `lib/storage/uploads.ts`, and deliberately: that number governs a
 * streamed upload into a bucket, this one governs a JSON request body.
 */
export const MAX_ATTACHED_BYTES = 20 * 1024 * 1024;

/** Per file, so one large scan cannot consume the whole budget. */
export const MAX_ATTACHED_FILE_BYTES = 8 * 1024 * 1024;

function mimeFor(row: UploadedDocumentRow): string {
  const t = (row.file_type ?? '').toLowerCase();
  if (t.includes('pdf')) return 'application/pdf';
  if (t.includes('png')) return 'image/png';
  if (t.includes('jpg') || t.includes('jpeg')) return 'image/jpeg';
  if (t.includes('tif')) return 'image/tiff';
  if (t.includes('/')) return t;
  return 'application/octet-stream';
}

/**
 * Choose which of a project's uploaded documents travel with the run.
 *
 * Pure — it does no fetching, so the ordering and the budget arithmetic are testable without a
 * network. `fetchBytes` does the download, and a file that cannot be fetched is reported rather than
 * silently dropped.
 *
 * Smallest first. With a budget, that attaches the most DOCUMENTS rather than the most bytes, and a
 * run is better served by six deeds than by one enormous scan.
 */
export async function attachUploadedDocuments(
  rows: UploadedDocumentRow[],
  fetchBytes: (url: string) => Promise<Buffer | null>,
): Promise<AttachResult> {
  const notes: string[] = [];
  const files: AttachedFile[] = [];

  const usable = rows.filter((r) => (r.storage_url ?? '').trim().length > 0);
  const missing = rows.length - usable.length;
  if (missing > 0) {
    notes.push(
      `${missing} uploaded document(s) have no stored file, so they could not be given to the run.`,
    );
  }

  const ordered = [...usable].sort((a, b) => (a.file_size_bytes ?? 0) - (b.file_size_bytes ?? 0));

  let used = 0;
  let skippedForSize = 0;
  let skippedForBudget = 0;
  let failed = 0;

  for (const row of ordered) {
    const declared = row.file_size_bytes ?? 0;
    if (declared > MAX_ATTACHED_FILE_BYTES) { skippedForSize += 1; continue; }
    if (declared > 0 && used + declared > MAX_ATTACHED_BYTES) { skippedForBudget += 1; continue; }

    let bytes: Buffer | null = null;
    try {
      bytes = await fetchBytes(row.storage_url as string);
    } catch {
      bytes = null;
    }
    if (!bytes || bytes.length === 0) { failed += 1; continue; }

    // Re-checked against the REAL length: `file_size_bytes` is a recorded number and can be wrong or
    // absent, and trusting it would let the budget be exceeded by exactly the rows that lied.
    if (bytes.length > MAX_ATTACHED_FILE_BYTES) { skippedForSize += 1; continue; }
    if (used + bytes.length > MAX_ATTACHED_BYTES) { skippedForBudget += 1; continue; }

    used += bytes.length;
    files.push({
      filename: row.original_filename?.trim() || row.document_label?.trim() || `document-${row.id ?? files.length + 1}`,
      mimeType: mimeFor(row),
      data: bytes.toString('base64'),
      size: bytes.length,
      description: 'Uploaded to this project before the run',
    });
  }

  if (skippedForSize > 0) {
    notes.push(
      `${skippedForSize} uploaded document(s) were too large to travel with the run and were not ` +
        `read by it. They remain on the project.`,
    );
  }
  if (skippedForBudget > 0) {
    notes.push(
      `${skippedForBudget} uploaded document(s) did not fit in this run's attachment budget and ` +
        `were not read by it.`,
    );
  }
  if (failed > 0) {
    notes.push(`${failed} uploaded document(s) could not be downloaded and were not given to the run.`);
  }

  return { files, notes };
}
