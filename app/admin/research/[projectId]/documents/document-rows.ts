// app/admin/research/[projectId]/documents/document-rows.ts — the Document Library's real shape.
//
// ── THE PAGE HAD NEVER WORKED ───────────────────────────────────────────────────────────────────
//
// Found 2026-08-31 by photographing the screen. It rendered **seventeen empty boxes**: the count
// was right, the filters were right, every row was blank.
//
//     const data = (await res.json()) as { documents: ResearchDocument[] };
//
// `ResearchDocument` declared `documentId`, `type`, `instrumentNumber`, `description`, `grantor`,
// `grantee`, `recordedDate`, `pageCount`, `fileFormat`, `sizeBytes`, `purchased`, `source`.
//
// `/api/admin/research/[projectId]/documents` does `select('*')` on `research_documents`, whose
// columns are `id`, `document_type`, `document_label`, `original_filename`, `page_count`,
// `file_size_bytes`, `recorded_date`, `source_type`, `storage_url`, `processing_status`…
//
// **Not one field matched.** Every value was `undefined`, `DOC_TYPE_ICONS[doc.type]` was
// `undefined`, and `key={doc.documentId}` was `undefined` for all seventeen rows at once.
//
// A cast is a claim, not a check. This is the same defect as G4 (a column written under one name
// and read under another), G10 (the owner name collected, saved, displayed and never used) and the
// Survey panel's 29-key contract — and it is the fourth time in this repository that a hand-written
// interface has quietly described an object nobody produces. Nothing errored. `tsc` was happy. The
// page "worked". The symptom was silence, and it took a screenshot to see it.
//
// ── WHY THE SHAPING LIVES HERE AND NOT IN THE COMPONENT ─────────────────────────────────────────
//
// Because it is testable here, and because `documents-contract.test.ts` can then hold every key in
// `DOCUMENT_ROW_COLUMNS` against the table's real column list. A cast inside a `.tsx` is a claim
// nobody can check; a function with a key list beside it is a claim a test can.

/** A row of `research_documents`, by the names the database actually uses. */
export interface DocumentRow {
  id: string;
  document_type?: string | null;
  document_label?: string | null;
  original_filename?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
  page_count?: number | null;
  recorded_date?: string | null;
  recording_info?: unknown;
  source_type?: string | null;
  source_url?: string | null;
  storage_url?: string | null;
  pages_pdf_url?: string | null;
  processing_status?: string | null;
  processing_error?: string | null;
  readability?: string | null;
  created_at?: string | null;
}

/** What the library renders. Derived from a row; nothing here is read off the API directly. */
export interface DocumentCard {
  id: string;
  /** `plat` | `deed` | `easement` | `survey` | `other` — folded from `document_type`. */
  kind: DocumentKind;
  /** The line a person reads first. Never empty — see `titleOf`. */
  title: string;
  /** Instrument number, pulled out of the label when the column does not carry one. */
  instrument: string | null;
  recordedDate: string | null;
  pageCount: number | null;
  sizeBytes: number | null;
  /** `upload` for something a person added, anything else for something the run retrieved. */
  isUpload: boolean;
  sourceLabel: string;
  /** Where the file can be opened, if anywhere. */
  fileUrl: string | null;
  /** Whether it can be shown as an image rather than downloaded. */
  isImage: boolean;
  status: string;
  statusError: string | null;
}

export type DocumentKind = 'plat' | 'deed' | 'easement' | 'survey' | 'other';

const KINDS: DocumentKind[] = ['plat', 'deed', 'easement', 'survey'];

/**
 * `document_type` is free-ish text — `deed`, `plat`, `title_commitment`, `restrictive_covenant`.
 * Anything not one of the four the filter bar offers is `other`, which is why the bar has an
 * "All" and not a fifth chip nobody can name.
 */
export function kindOf(row: DocumentRow): DocumentKind {
  const t = (row.document_type ?? '').toLowerCase();
  for (const k of KINDS) if (t.includes(k)) return k;
  return 'other';
}

/**
 * The title, in the order a person would want it.
 *
 * `document_label` is what the worker writes and reads like a sentence — "EASEMENT — HULL THOMAS D
 * to BARTLETT ELECTRIC COOPERATIVE INC (Instr. 2004045569)". `original_filename` is the fallback
 * (`deed_1945006189`), and the id is the last resort.
 *
 * It NEVER returns an empty string. A blank title is what the broken version rendered seventeen
 * times, and a row with nothing in it is indistinguishable from a rendering bug — which is exactly
 * what it was.
 */
export function titleOf(row: DocumentRow): string {
  const label = (row.document_label ?? '').trim();
  if (label) return label;
  const file = (row.original_filename ?? '').trim();
  if (file) return file;
  return `Document ${row.id.slice(0, 8)}`;
}

/** `(Instr. 2004045569)` out of a label, or the recording info if it carries one. */
export function instrumentOf(row: DocumentRow): string | null {
  const info = row.recording_info as { instrument_number?: string; instrumentNumber?: string } | null;
  const fromInfo = info?.instrument_number ?? info?.instrumentNumber;
  if (fromInfo) return String(fromInfo);
  const m = /Instr\.?\s*#?\s*([\w-]+)/i.exec(row.document_label ?? '');
  return m?.[1] ?? null;
}

const IMAGE_TYPES = ['image/', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'gif', 'bmp', 'heic'];

/** Can this be *shown*, or only downloaded? The owner asked to "view all images". */
export function isImageRow(row: DocumentRow): boolean {
  const t = (row.file_type ?? '').toLowerCase();
  if (!t) return false;
  return IMAGE_TYPES.some((x) => t.includes(x));
}

/** `upload` means a person added it; everything else means the run retrieved it. */
export function sourceLabelOf(row: DocumentRow): string {
  const s = (row.source_type ?? '').toLowerCase();
  if (s === 'user_upload') return 'Uploaded';
  if (!s) return 'Retrieved';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toCard(row: DocumentRow): DocumentCard {
  return {
    id: row.id,
    kind: kindOf(row),
    title: titleOf(row),
    instrument: instrumentOf(row),
    recordedDate: row.recorded_date ?? null,
    pageCount: typeof row.page_count === 'number' ? row.page_count : null,
    sizeBytes: typeof row.file_size_bytes === 'number' ? row.file_size_bytes : null,
    isUpload: (row.source_type ?? '').toLowerCase() === 'user_upload',
    sourceLabel: sourceLabelOf(row),
    // `pages_pdf_url` is the rendered multi-page PDF when one exists; `storage_url` is the original.
    fileUrl: row.pages_pdf_url ?? row.storage_url ?? row.source_url ?? null,
    isImage: isImageRow(row),
    status: row.processing_status ?? 'unknown',
    statusError: row.processing_error ?? null,
  };
}

/** Tolerant of anything: the API has returned a bare array and a wrapper at different times. */
export function toCards(payload: unknown): DocumentCard[] {
  const rows = Array.isArray(payload)
    ? payload
    : ((payload as { documents?: unknown })?.documents ?? []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is DocumentRow => Boolean(r) && typeof r === 'object' && typeof (r as DocumentRow).id === 'string')
    .map(toCard);
}

export function formatBytes(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Every column this module reads, for the contract test.
 *
 * The route does `select('*')`, so there is no select list to compare against — the check is
 * against the TABLE, via the same schema source the rest of the research tests use. Listing them
 * is what turns "the cast is right" from an assertion into a claim a test can refuse.
 */
export const DOCUMENT_ROW_COLUMNS = [
  'id', 'document_type', 'document_label', 'original_filename', 'file_type', 'file_size_bytes',
  'page_count', 'recorded_date', 'recording_info', 'source_type', 'source_url', 'storage_url',
  'pages_pdf_url', 'processing_status', 'processing_error',
] as const;

/**
 * The names the BROKEN version read. Held in a test so the cast cannot come back.
 *
 * Not one of these is a column on `research_documents`, and every one of them rendered as
 * `undefined` for seventeen rows.
 */
export const NEVER_PRODUCED_KEYS = [
  'documentId', 'instrumentNumber', 'pageCount', 'fileFormat', 'sizeBytes', 'recordedDate',
  'purchasedAt', 'purchaseCost', 'localPath', 'thumbnailUrl', 'usedInAnalysis', 'relevanceScore',
] as const;

// ── ONE VOCABULARY FOR `processing_status` ──────────────────────────────────────────────────────
//
// The project page and the Document Library showed the same seventeen documents with different
// words — "Pending" on one screen and "unreadable" on the other. Both read `processing_status`;
// only one of them had a label for the value it got.
//
// `DocumentUploadPanel` had a five-entry map and `|| PROCESSING_STATUS_LABELS.pending` as its
// fallback, so **every status it did not know about reported as "Pending"** — and `unreadable` is
// not in that map. Seventeen documents the pipeline could not read were reported, permanently, as
// waiting to be processed. That is not a cosmetic inconsistency: "pending" means give it a minute,
// and this needed somebody to look at it.
//
// So the map lives here, both screens read it, and the fallback SHOWS THE RAW VALUE rather than
// picking a friendly word at random. An unfamiliar status looking unfamiliar is the honest failure
// mode; an unfamiliar status looking like "Pending" is the one that cost seventeen documents.

export interface StatusLabel {
  label: string;
  /** `neutral` | `working` | `good` | `bad` — the caller maps tone to its own palette. */
  tone: 'neutral' | 'working' | 'good' | 'bad';
}

const STATUS_LABELS: Record<string, StatusLabel> = {
  pending: { label: 'Pending', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'neutral' },
  extracting: { label: 'Extracting…', tone: 'working' },
  extracted: { label: 'Extracted', tone: 'good' },
  analyzing: { label: 'Analyzing…', tone: 'working' },
  analyzed: { label: 'Analyzed', tone: 'good' },
  // The one that was missing, and the reason this map moved.
  unreadable: { label: 'Unreadable', tone: 'bad' },
  failed: { label: 'Failed', tone: 'bad' },
  error: { label: 'Error', tone: 'bad' },
};

/** Never invents a friendlier word than the truth. An unknown status renders as itself. */
export function statusLabel(status: string | null | undefined): StatusLabel {
  const key = (status ?? '').toLowerCase();
  if (!key) return { label: 'Unknown', tone: 'neutral' };
  return STATUS_LABELS[key] ?? { label: key.replace(/_/g, ' '), tone: 'neutral' };
}

/** Every status the map knows, for the test that holds both screens to it. */
export const KNOWN_STATUSES = Object.keys(STATUS_LABELS);
