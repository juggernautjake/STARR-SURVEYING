// lib/research/job-documents.ts — which of a job's files are worth handing to a research run.
//
// Owner, 2026-09-20: the research button should inherit "any documents" from the job.
//
// ── "ANY DOCUMENTS" IS NOT "EVERY FILE" ─────────────────────────────────────────────────────────
//
// Measured on this database, 2026-09-21 — 182 job files:
//
//     photos/image/jpeg      70      general/application/pdf   25
//     videos/video/mp4       42      project/image/jpeg        10
//     videos/video/quicktime 14      project/video/quicktime   10
//     general/image/jpeg      4      general/text/csv           2
//
// 147 of 182 are site photographs and video. A run given all of them would read seventy pictures of
// a fence, pay a model to do it, and bury the one deed that mattered. A run given none of them
// would miss the deed entirely.
//
// So the split is by KIND, and the person still decides. This module says what to tick by default
// and why, and the confirm screen shows both the ticked and the unticked with the reason attached.
// Nothing here filters anything out of sight.
//
// ── WHY `section` IS NOT TRUSTED ALONE ──────────────────────────────────────────────────────────
//
// `job_files.section` holds 'photos', 'videos', 'general' and 'project'. It describes the folder
// somebody dropped the file in, not what the file is — and `general` already contains 25 PDFs, 4
// JPEGs and 2 CSVs. A PDF in the photos folder is still a document. So the mime type decides and
// the section only breaks ties.

export interface JobFileForResearch {
  id: string;
  name: string;
  /** `content_type` or `mime_type`, whichever the row has. */
  contentType: string | null;
  section: string | null;
  sizeBytes: number | null;
  /**
   * A signed preview image, when one exists.
   *
   * Owner, 2026-09-21: "There should be a pop up window or something with all of the files showing
   * with large rendered thumbnails and their names, and the user has to select which files he wants
   * to be included in the AI research pipeline and analysis."
   *
   * Null is ordinary rather than exceptional: `thumb_state` can be `pending` (a browser has not
   * generated one yet) or `unsupported` (nothing can). The picker draws a labelled placeholder in
   * both cases — a broken image icon would read as a broken file.
   */
  thumbUrl?: string | null;
  /** The file itself, signed. Used to open it in a new tab from the picker. */
  url?: string | null;
}

export type FileVerdict = 'document' | 'media' | 'other';

export interface OfferedFile extends JobFileForResearch {
  verdict: FileVerdict;
  /** Ticked when the screen opens. */
  suggested: boolean;
  /** Said out loud next to the checkbox. */
  why: string;
}

/** Copying is bounded so one drone video cannot stall the attach. Mirrors the route's own cap. */
export const MAX_ATTACH_BYTES = 40 * 1024 * 1024;

const DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/rtf',
];

const DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'rtf'];

function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name ?? '');
  return m ? m[1]!.toLowerCase() : '';
}

export function classify(file: JobFileForResearch): FileVerdict {
  const mime = (file.contentType ?? '').toLowerCase().trim();
  const ext = extensionOf(file.name);

  if (DOC_MIMES.includes(mime)) return 'document';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'media';
  if (mime.startsWith('image/')) return 'media';

  // No usable mime — 2 rows in this database have an empty one. Fall back to the extension, which
  // is the only other thing the file tells us about itself.
  if (!mime) {
    if (DOC_EXTENSIONS.includes(ext)) return 'document';
    if (['jpg', 'jpeg', 'png', 'heic', 'mp4', 'mov', 'avi', 'm4a', 'wav'].includes(ext)) return 'media';
  }
  return 'other';
}

/**
 * Everything the confirm screen shows, in the order it shows it.
 *
 * Documents first and ticked; media after and unticked. Ordering by usefulness rather than by name
 * because the list can run to a hundred rows, and the two PDFs that matter should not be somewhere
 * in the middle of seventy photographs.
 */
export function offerJobFiles(files: readonly JobFileForResearch[]): OfferedFile[] {
  const offered = files.map((f): OfferedFile => {
    const verdict = classify(f);
    const tooBig = (f.sizeBytes ?? 0) > MAX_ATTACH_BYTES;

    if (tooBig) {
      return {
        ...f, verdict, suggested: false,
        why: `too large to attach (over ${Math.round(MAX_ATTACH_BYTES / 1024 / 1024)}MB)`,
      };
    }
    if (verdict === 'document') {
      return { ...f, verdict, suggested: true, why: 'a document — the run will read this' };
    }
    if (verdict === 'media') {
      return {
        ...f, verdict, suggested: false,
        why: 'site photo or video — tick it only if the run needs to look at it',
      };
    }
    return { ...f, verdict, suggested: false, why: 'unrecognised kind — tick it if it is a document' };
  });

  const rank: Record<FileVerdict, number> = { document: 0, other: 1, media: 2 };
  return offered.sort((a, b) => {
    if (rank[a.verdict] !== rank[b.verdict]) return rank[a.verdict] - rank[b.verdict];
    return a.name.localeCompare(b.name);
  });
}

/** The ids ticked when the screen opens. */
export function suggestedIds(files: readonly JobFileForResearch[]): string[] {
  return offerJobFiles(files).filter((f) => f.suggested).map((f) => f.id);
}

/** "3 documents, 70 photos and videos" — what the screen says above the list. */
export function describeOffer(files: readonly JobFileForResearch[]): string {
  const o = offerJobFiles(files);
  const docs = o.filter((f) => f.verdict === 'document').length;
  const media = o.filter((f) => f.verdict === 'media').length;
  const other = o.filter((f) => f.verdict === 'other').length;

  if (o.length === 0) return 'This job has no files yet.';

  const bits: string[] = [];
  if (docs) bits.push(`${docs} document${docs === 1 ? '' : 's'}`);
  if (media) bits.push(`${media} photo${media === 1 ? '' : 's'} or video${media === 1 ? '' : 's'}`);
  if (other) bits.push(`${other} other file${other === 1 ? '' : 's'}`);
  return bits.join(', ');
}
