// lib/research/stored-file.ts — a `storage_url` is a claim, not a file.
//
// ── TWENTY-TWO ROWS THAT ADVERTISE A FILE THAT WAS NEVER WRITTEN ────────────────────────────────
//
// Measured against the live database, 2026-09-01: **22 of 671 `research_documents` rows have
// `storage_path IS NULL` and `storage_url IS NOT NULL`** — eleven `aerial_photo` and eleven
// `topo_map`, spread across **ten projects**. The inverse never happens (0 rows), which is what
// makes the pattern a pattern rather than noise.
//
// The cause was fixed in the WRITE path on 2026-08-30 and is worth restating, because it explains
// why the column pair is the right thing to read:
//
//     if (uploadError) { console.warn(...); /* Continue — create the DB record */ }
//     const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
//     ...
//     storage_path: uploadError ? null : storagePath,   // honest
//     storage_url:  urlData?.publicUrl || null,         // NOT honest
//
// `getPublicUrl` **builds a string**. It never asks the bucket whether anything is there. So a row
// can carry `storage_path: null` — meaning *not stored* — beside a `storage_url` meaning
// *here it is*, and the URL 400s forever.
//
// ── WHY THIS IS A READ-SIDE FIX AND NOT ONLY A DATA REPAIR ──────────────────────────────────────
//
// The 22 rows are still there, and the planning doc parks an `UPDATE … SET storage_url = NULL` for
// the owner to authorise. That repair is still worth doing — but it is not what makes the app
// correct, for two reasons:
//
//   1. **Nothing on the read side consulted `storage_path` at all.** Measured: every viewer decided
//      "is this viewable" from `storage_url` alone — the artifacts route, `document-rows.ts`,
//      `DocumentUploadPanel`, `ResearchRunPanel`, `SourceDocumentViewer`. So those ten projects each
//      offer artifacts that render as a broken image, which is the same defect shape as "the
//      Document Library rendered seventeen empty boxes" and "0 viewable images on a project holding
//      73 of them".
//   2. A data repair fixes the rows that exist. This fixes the rows that exist **and** any row a
//      path nobody has audited writes tomorrow.
//
// ── THE DANGEROUS CASE IS `undefined`, NOT `null` ───────────────────────────────────────────────
//
// This is the line the whole module turns on.
//
// `storage_path: null` means the column was read and is empty — the file is not there. But
// `storage_path: undefined` means **the query did not select the column**, and those are opposite
// facts wearing the same falsy value. `document-rows.ts` did not select it; neither did several
// other callers.
//
// If absence were treated as "not stored", every document on those screens would vanish the moment
// this shipped — turning a 22-row cosmetic defect into a total blackout, and doing it silently.
// That is precisely the failure this repository has already shipped twice under the heading "0
// viewable images on a project holding 73 of them".
//
// So: **absent means we cannot tell, and we keep today's behaviour.** Only an explicit `null`
// suppresses. `selectsStoragePath` and its test exist to close the gap the other way — every caller
// is required to select the column, so "cannot tell" is a bug in the query rather than a state the
// product lives in.

/** The two columns that together say whether a file exists. Both optional: see the header. */
export interface StoredFileRow {
  /** The bucket key. `null` = not stored. `undefined` = not selected — see the header. */
  storage_path?: string | null;
  /** The public URL, which is BUILT from the path and never verified against the bucket. */
  storage_url?: string | null;
}

/**
 * Whether this row's `storage_url` can be trusted to point at bytes.
 *
 * `false` only when the path was read and is empty. An unselected path returns `true`, because the
 * honest answer to "is there a file" when you did not ask is not "no".
 */
export function hasStoredFile(row: StoredFileRow): boolean {
  if (!row.storage_url) return false;
  // Explicit null → the column was selected and the upload did not land.
  if (row.storage_path === null) return false;
  return true;
}

/**
 * The row's stored-file URL, or `null` when there is nothing behind it.
 *
 * Use this anywhere `row.storage_url` was being read to decide whether something is viewable,
 * downloadable, or countable as an image.
 */
export function storedFileUrl(row: StoredFileRow): string | null {
  return hasStoredFile(row) ? (row.storage_url ?? null) : null;
}

/**
 * Whether a row is one of the 22 — advertising a file it does not have.
 *
 * Separate from `hasStoredFile` on purpose: this one is for saying so out loud. A screen that
 * silently drops a document is a screen where somebody counts eleven aerial photos and sees ten,
 * with nothing to search for. `document.service.ts` already learned this the hard way — its own
 * comment about a document that "became a document with no facts and no explanation" is the same
 * lesson.
 */
export function advertisesMissingFile(row: StoredFileRow): boolean {
  return !!row.storage_url && row.storage_path === null;
}

/**
 * Does this Supabase `select()` list ask for `storage_path`?
 *
 * A caller that omits it gets `undefined`, which this module deliberately treats as "cannot tell" —
 * safe, but it means the check silently does nothing on that screen. The test that walks every
 * research select list is what turns that from a quiet no-op into a failure.
 *
 * Bounded on both sides so that `storage_path_backup` or `old_storage_path` — a column merely
 * CONTAINING the name — cannot satisfy it. A bare `includes()` would accept both, and a substring
 * flaw has been the defect three times in this repository this week.
 *
 * The boundary set includes QUOTES, which the first version omitted and which cost it a false
 * negative straight away: select lists reach this function in two forms, a PostgREST string
 * (`'id, storage_path, storage_url'`) and a TypeScript array of quoted names (`'storage_path',`).
 * In the second the neighbouring characters are apostrophes, so the check reported the column
 * missing from a list that plainly contains it — and a guard that cries wolf about correct code is
 * one somebody switches off.
 */
export function selectsStoragePath(selectList: string): boolean {
  return /(^|[\s,('"`])storage_path([\s,)'"`]|$)/.test(selectList);
}
