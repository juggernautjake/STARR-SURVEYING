// worker/src/research/file-document.ts — the one place a research document gets written.
//
// Both persistence paths — `harvest-supabase-sync.ts` and `artifact-uploader.ts` — used to end in a
// bare `.insert(row)`. Neither asked whether the project already held the document, and neither
// stamped the row with the run that produced it. That pair of omissions is the whole reason a
// re-run both duplicated the library AND could not say which run had found what.
//
// This function is the check. It is deliberately the ONLY way a pipeline document is written, so
// that "did we dedupe this?" has one answer instead of two.
//
// ── THE THREE OUTCOMES, AND WHY NONE OF THEM IS A DELETE ───────────────────────────────────────
//
//   MERGED   the project already holds it. No second row. `last_seen_run_id` moves to this run and
//            `run_seen_count` increments, so "run 3 found it again" is recorded as what it is: an
//            observation about the sources, not a new document.
//
//   FLAGGED  it might be a duplicate but the evidence is not conclusive. The row IS written, with
//            `duplicate_of` and a readable `duplicate_reason`. A document is never dropped on a
//            maybe, and a human can un-flag it in one click.
//
//   NEW      nothing matches. Written, stamped with the run and its identity.
//
// There is no fourth outcome where a row is removed. Deleting is the one action that looking again
// cannot undo, and the failure it produces — a document silently absent from the research — is
// invisible by construction.

import type { ProjectLibrary, LibraryCandidate } from './project-library.js';

export interface FileDocumentDb {
  from: (t: string) => {
    insert: (r: unknown) => {
      select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
    };
    update: (r: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> };
  };
}

export type FileOutcome =
  | { outcome: 'merged'; id: string; reason: string }
  | { outcome: 'flagged'; id: string; duplicateOf: string; reason: string }
  | { outcome: 'new'; id: string; reason: string }
  | { outcome: 'error'; error: string; reason: string };

export interface FileDocumentInput {
  /** The row as the caller built it. Identity and run columns are added here, not by the caller. */
  row: Record<string, unknown>;
  /** What the row is, in the terms the library matches on. */
  candidate: LibraryCandidate;
  /** The run doing the filing. Null only when the run record could not be written. */
  runId: string | null;
  /**
   * Called when an insert is rejected, to retry with a narrower row.
   *
   * `artifact-uploader` has a real need for this: it writes `pages_pdf_url` and expanded document
   * types that older databases do not have, and its fallback strips them. Passed in rather than
   * built in, because the fallback is that caller's knowledge of its own columns.
   */
  fallbackRow?: (row: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * File a document, deduplicating against everything the project already holds.
 *
 * Never throws. A bookkeeping failure must not take down a run that has real documents in hand —
 * the same rule the run store follows, and for the same reason: silence is how a feature ends up
 * doing nothing while everybody assumes it works. Failures return `outcome: 'error'` with the
 * message, and callers surface it.
 */
export async function fileResearchDocument(
  db: FileDocumentDb,
  library: ProjectLibrary,
  input: FileDocumentInput,
): Promise<FileOutcome> {
  const verdict = library.classify(input.candidate);

  // ── MERGED ────────────────────────────────────────────────────────────────────────────────────
  if (verdict.kind === 'already-held' || verdict.kind === 'same-bytes') {
    const existingId = verdict.existingId;
    try {
      const { error } = await db.from('research_documents').update({
        last_seen_run_id: input.runId,
        // Read-modify-write would need the current value and a round trip; the count is a display
        // figure, and the write below is one statement. Supabase-js has no atomic increment, so the
        // library's in-memory count is authoritative for this run and the DB catches up.
        run_seen_count: nextSeenCount(library, existingId),
        ...(input.candidate.contentSha256 ? { content_sha256: input.candidate.contentSha256 } : {}),
        ...(verdict.kind === 'already-held' && verdict.identityKey
          ? { identity_key: verdict.identityKey }
          : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', existingId);

      if (error) return { outcome: 'error', error: error.message, reason: verdict.reason };
      return { outcome: 'merged', id: existingId, reason: verdict.reason };
    } catch (err) {
      return {
        outcome: 'error',
        error: err instanceof Error ? err.message : String(err),
        reason: verdict.reason,
      };
    }
  }

  // ── NEW or FLAGGED — both write a row ─────────────────────────────────────────────────────────
  const identity = verdict.kind === 'new' ? verdict.identityKey : verdict.identityKey;
  const isFlagged = verdict.kind === 'possible-duplicate';

  const row: Record<string, unknown> = {
    ...input.row,
    research_run_id: input.runId,
    last_seen_run_id: input.runId,
    run_seen_count: 1,
    // A flagged row keeps its identity OUT of the key column. The unique backstop from seed 623
    // covers live rows only, and a flagged row that carried the same key as its suspected original
    // would collide with it — turning "we are not sure, keep both" into a hard insert failure.
    identity_key: isFlagged ? null : identity,
    content_sha256: input.candidate.contentSha256 ?? null,
    ...(isFlagged
      ? { duplicate_of: verdict.existingId, duplicate_reason: verdict.reason }
      : {}),
  };

  const insert = async (r: Record<string, unknown>) =>
    db.from('research_documents').insert(r).select('id').single();

  try {
    let { data, error } = await insert(row);

    if (error && input.fallbackRow) {
      const retry = input.fallbackRow(row);
      ({ data, error } = await insert(retry));
    }

    if (error || !data) {
      return {
        outcome: 'error',
        error: error?.message ?? 'insert returned no row',
        reason: verdict.reason,
      };
    }

    library.register({
      id: data.id,
      identityKey: isFlagged ? null : identity,
      contentSha256: input.candidate.contentSha256 ?? null,
      documentLabel: (row.document_label as string) ?? null,
      recordingInfo: (row.recording_info as string) ?? null,
      storagePath: (row.storage_path as string) ?? null,
      runId: input.runId,
      runSeenCount: 1,
      ref: {
        county: input.candidate.county,
        instrumentNumber: input.candidate.instrumentNumber,
        recordingDate: input.candidate.recordingDate,
        book: input.candidate.book,
        page: input.candidate.page,
      },
    });

    return isFlagged
      ? { outcome: 'flagged', id: data.id, duplicateOf: verdict.existingId, reason: verdict.reason }
      : { outcome: 'new', id: data.id, reason: verdict.reason };
  } catch (err) {
    return {
      outcome: 'error',
      error: err instanceof Error ? err.message : String(err),
      reason: verdict.reason,
    };
  }
}

function nextSeenCount(library: ProjectLibrary, id: string): number {
  const entry = library.entryById(id);
  const next = (entry?.runSeenCount ?? 1) + 1;
  if (entry) entry.runSeenCount = next;
  return next;
}

/** Running totals for a run's filing, so the run log can say what deduplication actually did. */
export class FilingTally {
  filed = 0;
  merged = 0;
  flagged = 0;
  errors: string[] = [];

  record(outcome: FileOutcome): FileOutcome {
    if (outcome.outcome === 'new') this.filed += 1;
    else if (outcome.outcome === 'merged') this.merged += 1;
    else if (outcome.outcome === 'flagged') this.flagged += 1;
    else this.errors.push(outcome.error);
    return outcome;
  }

  /** The sentence the owner asked for: what was found again, and what was only maybe the same. */
  describe(): string {
    const parts = [`${this.filed} new document(s) filed.`];
    if (this.merged > 0) {
      parts.push(
        `${this.merged} were already held from an earlier run and were recorded as seen again ` +
          `rather than filed twice.`,
      );
    }
    if (this.flagged > 0) {
      parts.push(
        `${this.flagged} may duplicate something already held — filed anyway and flagged, because a ` +
          `document is never dropped on a maybe.`,
      );
    }
    if (this.errors.length > 0) parts.push(this.describeFailures());
    return parts.join(' ');
  }

  /** True when at least one document was captured and then lost. */
  get hasFailures(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Why documents could not be written — B1.
   *
   * This used to read `1 could not be written.` and stop there, which is the same defect as the 22
   * rows that advertised a file nobody wrote: a count with no cause. The reason was never missing.
   * `record()` has been storing the actual error string all along and `describe()` printed only
   * `.length`, so the answer was in hand and discarded one line before it would have been useful.
   *
   * Distinct reasons, not one line per document: a clerk portal that times out fails every document
   * in the batch identically, and fifty copies of one message is how a log stops being read. Counted
   * where they repeat, capped at three, and the remainder is stated rather than silently dropped —
   * "and 12 more" is a different claim from showing twelve and hoping.
   */
  describeFailures(): string {
    const counts = new Map<string, number>();
    for (const raw of this.errors) {
      const msg = (raw ?? '').trim() || 'no reason given';
      counts.set(msg, (counts.get(msg) ?? 0) + 1);
    }

    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const shown = ordered.slice(0, 3).map(([msg, n]) => (n > 1 ? `${msg} (x${n})` : msg));
    const hidden = ordered.length - shown.length;
    if (hidden > 0) shown.push(`and ${hidden} other reason(s)`);

    return (
      `${this.errors.length} could not be written — ${shown.join('; ')}. ` +
      `These documents were retrieved and then lost, so the review is incomplete.`
    );
  }
}
