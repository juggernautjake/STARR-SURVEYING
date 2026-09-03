// worker/src/research/file-generic-document.ts — B2: the other forty counties file as they go too.
//
// ── THE GAP ─────────────────────────────────────────────────────────────────────────────────────
//
// The owner's requirement was explicit:
//
//   "Make sure the system/worker knows to check each document found to see if it is a duplicate or
//    not… it should immediately be formatted and uploaded to the research platform and made
//    available to view. I don't want the research worker to compile the files/documents all slowly
//    over time and then upload them in a big group."
//
// `documents-are-filed-immediately.test.ts` guards exactly that — for Bell, whose orchestrator calls
// the incremental uploader at seven sites. The GENERIC pipeline, which serves every other routed
// county, did the opposite, and nothing said so: it accumulated documents in an array, and when the
// run ended the caller DELETED the project's previous `property_search` rows and bulk-inserted.
//
// Two defects in one, and the second is the worse:
//
//   1. Batching. Nothing was viewable until the run finished — the thing the owner asked us to stop.
//   2. A delete. Every re-run threw away what the previous run had found, which is the exact
//      opposite of the supersede-not-delete rule the cross-run library was built on. A run that
//      crashed after the delete left the project with FEWER documents than before it started.
//
// ── WHY THE ROW SHAPE LIVES HERE ────────────────────────────────────────────────────────────────
//
// Two paths need it now: the incremental filing below, and the end-of-run sweep that catches
// anything the incremental path could not write. Two copies of a row shape is how a column comes to
// be added to one and not the other, so there is one.

import type { DocumentResult } from '../types/index.js';
import { resilientInsertDocument } from '../services/artifact-uploader.js';
import { getSupabase } from '../services/pipeline.js';

/** Maximum characters stored in `extracted_text`. Mirrors the limit index.ts has always used. */
const MAX_EXTRACTED_TEXT_LENGTH = 50_000;

/** Canonical document types used by `research_documents` (matches the UI's icon keys). */
export function normaliseDocumentType(rawType: string | null | undefined): string {
  if (!rawType) return 'other';
  const lower = rawType.toLowerCase();
  if (/warranty deed|general warranty|deed of trust|trustee.*deed|deed/i.test(lower)) return 'deed';
  if (/subdivision plat|plat/i.test(lower)) return lower.includes('subdivision') ? 'subdivision_plat' : 'plat';
  if (/survey/i.test(lower)) return 'survey';
  if (/legal desc/i.test(lower)) return 'legal_description';
  if (/easement/i.test(lower)) return 'easement';
  if (/covenant|restriction/i.test(lower)) return 'restrictive_covenant';
  if (/field note/i.test(lower)) return 'field_notes';
  if (/metes|bounds/i.test(lower)) return 'metes_and_bounds';
  if (/appraisal|assessment|cad record/i.test(lower)) return 'appraisal_record';
  if (/county record/i.test(lower)) return 'county_record';
  if (/title commitment/i.test(lower)) return 'title_commitment';
  if (/aerial|satellite/i.test(lower)) return 'aerial_photo';
  if (/topo|topographic/i.test(lower)) return 'topo_map';
  if (/utility/i.test(lower)) return 'utility_map';
  return 'other';
}

/**
 * The identity of a document WITHIN one run, for "have I already filed this one?".
 *
 * Deliberately not the cross-run identity — `fileResearchDocument` owns that, and it is the richer
 * question involving SHA-256 and recording details. This is the narrow one: the same
 * `DocumentResult` must not be written by the incremental path and then again by the sweep.
 */
export function runScopedKey(doc: DocumentResult): string {
  const ref = doc.ref;
  return [
    ref?.instrumentNumber ?? '',
    ref?.volume ?? '',
    ref?.page ?? '',
    ref?.url ?? '',
    ref?.documentType ?? '',
    ref?.recordingDate ?? '',
  ].join('|');
}

/** The `research_documents` row for a generic-pipeline document. One definition, two callers. */
export function genericDocumentRow(
  projectId: string,
  doc: DocumentResult,
  now: string,
): Record<string, unknown> {
  const ref = doc.ref;
  const instr = ref?.instrumentNumber;
  const volPage = ref?.volume && ref?.page ? `Vol. ${ref.volume}, Pg. ${ref.page}` : null;
  const recordingInfo = [
    instr ? `Instrument No. ${instr}` : null,
    volPage,
  ].filter(Boolean).join(' — ') || null;

  const pageCount = (doc.pages?.length ?? doc.pageScreenshots?.length) || null;
  const rawText = doc.ocrText ?? doc.textContent ?? null;
  const extractedText = rawText ? rawText.slice(0, MAX_EXTRACTED_TEXT_LENGTH) : null;

  const grantorStr = ref?.grantors?.length ? ref.grantors.slice(0, 2).join(', ') : null;
  const granteeStr = ref?.grantees?.length ? ref.grantees.slice(0, 2).join(', ') : null;
  const partyStr = grantorStr && granteeStr
    ? ` — ${grantorStr} to ${granteeStr}`
    : (grantorStr ? ` — ${grantorStr}` : '');
  const instrStr = instr ? ` (Instr. ${instr})` : '';
  const docLabel = `${ref?.documentType || 'Document'}${partyStr}${instrStr}`;

  return {
    research_project_id: projectId,
    source_type: 'property_search',
    original_filename: docLabel,
    file_type: doc.imageFormat ?? 'pdf',
    document_type: normaliseDocumentType(ref?.documentType),
    document_label: ref?.documentType || 'Document',
    recording_info: recordingInfo,
    recorded_date: ref?.recordingDate ?? null,
    extracted_text: extractedText,
    processing_status: 'analyzed',
    page_count: pageCount ?? null,
    source_url: ref?.url ?? null,
    ocr_confidence: doc.extractedData?.confidence ?? null,
    created_at: now,
    updated_at: now,
  };
}

/** What the incremental path has already written, per project, so the sweep does not repeat it. */
const filedThisRun = new Map<string, Set<string>>();

export function beginGenericFiling(projectId: string): void {
  filedThisRun.set(projectId, new Set());
}

export function endGenericFiling(projectId: string): void {
  filedThisRun.delete(projectId);
}

export function alreadyFiledThisRun(projectId: string, doc: DocumentResult): boolean {
  return filedThisRun.get(projectId)?.has(runScopedKey(doc)) ?? false;
}

/**
 * File one document the moment the pipeline finds it.
 *
 * Goes through `resilientInsertDocument`, and that is what makes this a duplicate CHECK rather than
 * just an insert: it consults the run's filing context, runs the cross-run identity comparison,
 * records the outcome on the tally, and reports failure instead of throwing. Writing the row
 * directly here would have satisfied "immediately" while quietly dropping the deduplication the
 * owner asked for in the same sentence.
 *
 * Never throws. A document that cannot be filed is counted and explained by the tally (B1); it must
 * not stop a run that is otherwise finding things.
 */
/** Returns the row id it wrote or merged into, so a later stage can patch it. Returns null when
 *  nothing was filed — a user upload, an already-filed key, no database, or a failure.
 *
 *  It returned `void` and threw the id away, which is why nothing downstream could record what it
 *  later learned about the document. */
export async function fileGenericDocumentNow(
  projectId: string,
  doc: DocumentResult,
): Promise<string | null> {
  // A user upload already has a row from Stage 1. Filing it again would duplicate it.
  if (doc.fromUserUpload) return null;

  const key = runScopedKey(doc);
  const seen = filedThisRun.get(projectId);
  if (seen?.has(key)) return null;

  try {
    const supabase = await getSupabase();
    if (!supabase) return null;

    const row = genericDocumentRow(projectId, doc, new Date().toISOString());
    const { error, id } = await resilientInsertDocument(supabase as never, projectId, row);

    if (error) {
      console.warn(`[GenericFiling] ${projectId}: could not file a document — ${error}`);
      return null;
    }
    seen?.add(key);
    // The id travels back on the document object so Stage 3 can patch the row it wrote without
    // threading a map through six call sites.
    if (id) doc.documentRowId = id;
    return id ?? null;
  } catch (err) {
    console.warn(
      `[GenericFiling] ${projectId}: filing threw —`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
