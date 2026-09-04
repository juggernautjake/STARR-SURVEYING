// worker/src/research/reanalyze-documents.ts — read the documents we already hold.
//
// ── MEASURED AGAINST THE LIVE DATABASE, 2026-09-03 ──────────────────────────────────────────────
//
//   697 documents on file
//    87 with NO extracted text at all — 50 deeds, 26 plats, 9 untyped, 2 easements
//   295 with text and a NULL `extracted_text_method`
//   663 with a NULL `readability`
//
// Every one of those 87 has its page images in storage. They were found, fetched, paid for where
// the county charged, uploaded, and then never read — because analysis happened where a STAGE
// touched a document rather than to every document that got filed. A deed retrieved by a path with
// no analyser attached is a deed nobody ever read.
//
// The owner's words: *"the analysis should run on each document to get a comprehensive idea of each
// one"*. Each one, not each one a stage happened to pass through.
//
// ── WHY THIS IS A SEPARATE PASS AND NOT A FIX INSIDE EACH STAGE ─────────────────────────────────
//
// Because there are several stages and only one database. Adding "and also analyse it" to the clerk
// path, the plat path, the capture path and the user-upload path gives four places to forget. This
// asks the one question that matters — *is there a document on file that we have not read?* — of
// the place that knows: the rows themselves.
//
// It is also what makes a re-run cheap. The pages are already bought and stored, so re-reading them
// costs model time and nothing else.

import { patchDocument, type DocumentPatch, type FileDocumentDb } from './file-document.js';
import { assessOcr, isLandRecordType, normaliseConfidence } from '../infra/ocr-quality.js';

/** A filed document, as much of it as this decision needs. */
export interface FiledDocument {
  id: string;
  document_type: string | null;
  document_label: string | null;
  extracted_text: string | null;
  extracted_text_method: string | null;
  page_count: number | null;
  processing_status: string | null;
  /** `{"pageUrls": [...]}` — despite the name, this is where the page images live (seed 570). */
  ocr_regions: unknown;
}

/** Why a document is or is not worth re-reading. Reported, so a skip is never silent. */
export interface ReanalysisDecision {
  id: string;
  label: string;
  reanalyse: boolean;
  reason: string;
  pageUrls: string[];
}

/** The page image URLs a document carries, or an empty list. */
export function pageUrlsOf(doc: FiledDocument): string[] {
  const raw = doc.ocr_regions;
  const parsed = typeof raw === 'string' ? safeParse(raw) : raw;
  const urls = (parsed as { pageUrls?: unknown } | null)?.pageUrls;
  return Array.isArray(urls) ? urls.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * Should this document be read again?
 *
 * Three answers, and the difference between them is the whole point:
 *
 *   · no pages          — there is nothing to read. Not a failure to analyse; a failure to fetch,
 *                         and re-running the analyser would not fix it.
 *   · already read      — it has text AND a method saying where the text came from. Re-reading is
 *                         money spent to learn what we know.
 *   · text, no method   — 295 rows are in this state. The text might be raw OCR, an AI summary, a
 *                         legal description or a JSON blob; the column has held all four. Re-read,
 *                         because unweighable text is barely better than none.
 */
export function decideReanalysis(doc: FiledDocument): ReanalysisDecision {
  const label = doc.document_label ?? doc.document_type ?? doc.id;
  const pageUrls = pageUrlsOf(doc);

  if (pageUrls.length === 0) {
    return {
      id: doc.id, label, pageUrls, reanalyse: false,
      reason: 'No page images on file, so there is nothing to read. That is a gap in retrieval, '
        + 'not in analysis — re-running the analyser cannot fix it.',
    };
  }

  const text = doc.extracted_text ?? '';
  const quality = assessOcr({
    text,
    pageCount: doc.page_count ?? pageUrls.length,
    method: doc.extracted_text_method,
    isLandRecord: isLandRecordType(doc.document_type),
  });

  if (text.length > 0 && !doc.extracted_text_method) {
    return {
      id: doc.id, label, pageUrls, reanalyse: true,
      reason: 'Has text with no stated origin. `extracted_text` has held raw OCR, an AI summary, a '
        + 'legal description and a JSON blob at different times, so text without a method cannot be '
        + 'weighed. Reading it again gives it one.',
    };
  }

  if (quality.readability === 'unreadable') {
    return {
      id: doc.id, label, pageUrls, reanalyse: true,
      reason: `Nothing usable was extracted (${quality.reason}) and ${pageUrls.length} page image(s) `
        + 'are on file. The pages are already bought and stored, so reading them again costs model '
        + 'time and nothing else.',
    };
  }

  if (quality.readability === 'partial') {
    return {
      id: doc.id, label, pageUrls, reanalyse: true,
      reason: `Only a partial extraction (${quality.charsPerPage} chars per page) against `
        + `${pageUrls.length} page image(s). Quadrant analysis reads a page in pieces and reaches `
        + 'text a whole-page pass misses.',
    };
  }

  return {
    id: doc.id, label, pageUrls, reanalyse: false,
    reason: `Already read: ${quality.charsPerPage} chars per page via `
      + `${doc.extracted_text_method}. Re-reading would spend money to learn what we know.`,
  };
}

/** What a read produced, in the shape the row wants. */
export interface ReadResult {
  text: string;
  method: string;
  /** 0–1, either scale accepted — see `normaliseConfidence`. */
  confidence?: number | null;
  segments?: unknown;
}

export interface ReanalysisReport {
  considered: number;
  reanalysed: number;
  skipped: number;
  failed: number;
  /** Documents not read because the run reached a limit mid-pass. Not failures: the pages are on
   *  file and the next run will read them. Distinct so a ceiling never reads as a broken document. */
  leftUnread: number;
  /** The ids of the left-unread documents, so the caller can mark them queued for the next run. */
  leftUnreadIds: string[];
  /** One line per document, so a run says what it did rather than only how many. */
  lines: string[];
}

/**
 * Read every document on file for a project that has pages we have not read.
 *
 * `read` does the actual work and is injected: this module's job is deciding WHICH documents and
 * writing the answer back, and both of those are testable without a network. A `read` that returns
 * null is a document that could not be read this time — recorded, not fatal.
 *
 * Never throws. A run whose research succeeded is not a failed run because a re-read timed out.
 */
export async function reanalyseFiledDocuments(
  db: FileDocumentDb,
  docs: FiledDocument[],
  read: (doc: FiledDocument, pageUrls: string[]) => Promise<ReadResult | null>,
  log: (line: string) => void = () => {},
  /** Asked before every read. `false` means the run has reached a limit: the document is counted as
   *  left unread and said so. Absent means "read everything" — the pre-2026-09-03 behaviour that
   *  kept a 30-minute run alive for 2 h 46 m after its ceiling. */
  mayContinue: () => boolean = () => true,
  /** Called after a document's text is written, so the caller can summarise it in the same pass —
   *  the owner's "OCR then produce the summary and results … for every single file". */
  onRead: (doc: FiledDocument, result: ReadResult) => Promise<void> = async () => {},
): Promise<ReanalysisReport> {
  const report: ReanalysisReport = { considered: docs.length, reanalysed: 0, skipped: 0, failed: 0, leftUnread: 0, leftUnreadIds: [], lines: [] };

  for (const doc of docs) {
    const decision = decideReanalysis(doc);
    if (decision.reanalyse && !mayContinue()) {
      report.leftUnread++;
      report.leftUnreadIds.push(doc.id);
      const line = `… ${decision.label}: left unread — the run reached a limit you set. The pages are on file.`;
      report.lines.push(line);
      log(line);
      continue;
    }
    if (!decision.reanalyse) {
      report.skipped++;
      const line = `— ${decision.label}: ${decision.reason}`;
      report.lines.push(line);
      log(line);
      continue;
    }

    let result: ReadResult | null = null;
    try {
      result = await read(doc, decision.pageUrls);
    } catch (err) {
      result = null;
      report.lines.push(`✗ ${decision.label}: read threw — ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!result || !result.text.trim()) {
      report.failed++;
      const line = `✗ ${decision.label}: re-read produced no text. The pages remain on file; this is `
        + 'our failure to read them, not a finding about the document.';
      report.lines.push(line);
      log(line);
      continue;
    }

    const quality = assessOcr({
      text: result.text,
      pageCount: doc.page_count ?? decision.pageUrls.length,
      method: result.method,
      isLandRecord: isLandRecordType(doc.document_type),
    });

    const patch: DocumentPatch = {
      extracted_text: result.text.slice(0, 50_000),
      // Never optional beside the text — `patchDocument` refuses the pair without it, and this is
      // the field whose absence made 295 rows unweighable.
      extracted_text_method: result.method,
      ocr_confidence: normaliseConfidence(result.confidence),
      readability: quality.readability,
      readability_reason: quality.reason,
      processing_status: quality.readability === 'unreadable' ? 'unreadable' : 'extracted',
      ocr_segments: result.segments ?? undefined,
    };

    const { patched, error } = await patchDocument(db, doc.id, patch);
    if (!patched) {
      report.failed++;
      const line = `✗ ${decision.label}: read ${result.text.length} chars but could not record them — ${error}`;
      report.lines.push(line);
      log(line);
      continue;
    }

    report.reanalysed++;
    const line = `✓ ${decision.label}: ${result.text.length} chars via ${result.method} `
      + `(${quality.readability}). ${decision.reason}`;
    report.lines.push(line);
    log(line);
    // Summarise in the same pass, from the text just written. Never fatal: the read is recorded
    // whether or not the summary lands.
    try { await onRead(doc, result); } catch { /* onRead logs its own failure */ }
  }

  return report;
}

/** One sentence for the run log. Says what was skipped as well as what was done. */
export function describeReanalysis(r: ReanalysisReport): string {
  if (r.considered === 0) return 'No documents on file to re-read.';
  const bits = [`${r.reanalysed} document(s) read`];
  if (r.skipped > 0) bits.push(`${r.skipped} already had text we can weigh`);
  if (r.failed > 0) bits.push(`${r.failed} could not be read — the pages are still on file`);
  if (r.leftUnread > 0) bits.push(`${r.leftUnread} left unread because the run reached its ceiling`);
  return `[Re-analysis] ${bits.join(', ')}.`;
}
