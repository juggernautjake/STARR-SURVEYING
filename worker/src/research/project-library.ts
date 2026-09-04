// worker/src/research/project-library.ts — what this project already holds, before we file anything.
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────
//
// `document-identity.ts` is a careful cross-vendor identity model and it has exactly one caller:
// `POST /research/purchase`, seeded from the CURRENT run's free harvest. It has never seen what a
// previous run already holds, and it has never touched the code that writes rows.
//
// So both persistence paths end in a bare insert with no check of any kind:
//
//     harvest-supabase-sync.ts   .from('research_documents').insert(row)
//     artifact-uploader.ts       resilientInsertDocument() → .insert(row)
//
// Measured in production on 2026-09-01: 25 duplicate groups by label and recording reference, and
// 19 groups of rows pointing at the same `storage_path` with 53 redundant rows between them. Every
// pair is a document a second run found again and filed twice.
//
// ── WHAT "ALREADY HELD" MEANS HERE, AND WHY IT DIFFERS FROM THE PURCHASE RULE ───────────────────
//
// The purchase path fails toward SPENDING: when identity is uncertain, buy, because a false match
// silently omits a document we do not have. That rule is right and it does not change.
//
// This path fails toward KEEPING. When identity is uncertain we still write the row — a document is
// never dropped on a maybe — and we record what it might duplicate and why. The library view shows
// one row per document; the flagged near-miss is one click away and can be un-marked.
//
// Both rules are the same underlying principle applied to different irreversibilities. Not buying
// is unrecoverable and invisible. Not writing a row is unrecoverable and invisible. Buying twice
// costs a few dollars, and writing a flagged row costs a click.
//
// ── AND WHY LEGACY ROWS GET AN IDENTITY DERIVED ON LOAD ─────────────────────────────────────────
//
// The 593 live documents that predate this module have no `identity_key`; the column did not exist
// when they were written. If the library only recognised rows that carry one, the FIRST re-run
// after this ships would duplicate every one of them — the exact failure this exists to prevent,
// delayed by one run and therefore far harder to notice.
//
// So identity is reconstructed on load from what those rows do carry: the instrument number inside
// `recording_info` or `harvest_metadata`, and `recorded_date`. Reconstruction that fails yields
// null, which can never match anything, which means the document is filed again rather than
// silently merged into something it might not be.

import { createHash } from 'node:crypto';
import {
  DocumentIndex,
  compareDocuments,
  identityKey,
  normaliseCounty,
  type DocumentRef,
  type SourceCost,
} from './document-identity.js';

/** SHA-256 of a document's bytes, as lowercase hex.
 *
 *  Catches the duplicate a citation cannot: the same page image arriving from two vendors that
 *  number it differently, and — 19 of the 53 duplicate groups measured — the same screenshot
 *  re-taken on every run of the same project. */
export function contentHash(bytes: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(bytes as never).digest('hex');
}

/** A row already in the library. */
export interface LibraryEntry {
  id: string;
  identityKey: string | null;
  contentSha256: string | null;
  documentLabel: string | null;
  recordingInfo: string | null;
  storagePath: string | null;
  runId: string | null;
  runSeenCount: number;
  /** Reconstructed reference, used for near-miss comparison against candidates. */
  ref: DocumentRef;
}

/** A document we are about to file. */
export interface LibraryCandidate {
  county: string;
  instrumentNumber?: string;
  recordingDate?: string;
  book?: string;
  page?: string;
  documentLabel?: string;
  recordingInfo?: string;
  /** Hex SHA-256 of the bytes, when they are in hand. */
  contentSha256?: string;
  storagePath?: string;
  vendor?: string;
  cost?: SourceCost;
}

export type LibraryVerdict =
  /** Nothing in the library matches. Write it. */
  | { kind: 'new'; identityKey: string | null; reason: string }
  /** The same document, already held. Do NOT write a second row — record that this run saw it. */
  | { kind: 'already-held'; existingId: string; identityKey: string | null; reason: string }
  /** Byte-identical to something we hold. Strongest possible evidence. */
  | { kind: 'same-bytes'; existingId: string; reason: string }
  /** Might be the same. Write it, and say what it might duplicate. */
  | { kind: 'possible-duplicate'; existingId: string; identityKey: string | null; reason: string };

/** Pull the instrument number out of the text a legacy row carries.
 *
 *  `artifact-uploader` writes `recording_info` as `Instrument No. 2004032468`, and labels arrive as
 *  `DEED — DUBEC BETTY to HULL THOMAS D (Instr. 2004032468)`. Both forms are real and both appear in
 *  production data, so both are read. */
export function instrumentFromText(...texts: Array<string | null | undefined>): string | undefined {
  for (const t of texts) {
    if (!t) continue;
    const m = /(?:instrument|instr\.?|inst\.?)\s*(?:no\.?|#)?\s*([A-Z0-9][A-Z0-9-]{2,})/i.exec(t);
    if (m) return m[1];
  }
  return undefined;
}

/** Rebuild a reference for a row that predates `identity_key`. */
export function refFromRow(row: Record<string, unknown>, county: string): DocumentRef {
  const meta = (row.harvest_metadata as Record<string, unknown> | null) ?? {};
  const instrument =
    (typeof meta.instrumentNumber === 'string' && meta.instrumentNumber) ||
    instrumentFromText(row.recording_info as string, row.document_label as string, row.original_filename as string);
  const date =
    (typeof meta.recordingDate === 'string' && meta.recordingDate) ||
    (typeof row.recorded_date === 'string' ? row.recorded_date : undefined);
  return {
    county,
    instrumentNumber: instrument || undefined,
    recordingDate: date || undefined,
    vendor: typeof meta.source === 'string' ? meta.source : undefined,
  };
}

/** The minimal Supabase surface this module uses. Declared rather than `any` so a new query has to
 *  be written down before it can be made. */
export interface LibraryDb {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: unknown) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export interface LibrarySummary {
  /** Live rows loaded. */
  loaded: number;
  /** How many of those carried a usable identity key. */
  identified: number;
  /** How many had an identity reconstructed from legacy text rather than a stored key. */
  reconstructed: number;
  /** How many could not be identified at all and therefore cannot prevent a duplicate. */
  unidentifiable: number;
}

/**
 * Everything a project already holds, and the question "have we got this one?".
 *
 * Loaded once at the start of a run and updated in memory as the run files documents, so the same
 * instrument arriving twice WITHIN a run is caught too — which matters, because a run's own phases
 * overlap by design and the enrichment loop re-visits instruments deliberately.
 */
export class ProjectLibrary {
  private byIdentity = new Map<string, LibraryEntry>();
  private byContent = new Map<string, LibraryEntry>();
  /**
   * By storage path — the single highest-yield duplicate check in this codebase.
   *
   * `artifact-uploader` builds its storage path deterministically from
   * `${projectId}/artifacts/${category}/${filename}` and uploads with `upsert: true`. So a re-run
   * overwrites the same object and then inserts a SECOND row pointing at it. That is not a theory:
   * 53 of the 78 duplicate rows measured in production on 2026-09-01 were exactly this, and none of
   * them carried an instrument number or a recording date that any citation-based check could have
   * matched on.
   */
  private byStoragePath = new Map<string, LibraryEntry>();
  private entries: LibraryEntry[] = [];
  private summary: LibrarySummary = { loaded: 0, identified: 0, reconstructed: 0, unidentifiable: 0 };

  constructor(public readonly projectId: string, public readonly county: string) {}

  /** Read the project's live documents. Duplicates and superseded rows are excluded from matching
   *  by the query, not by a filter afterwards — a row already marked as a duplicate must not be able
   *  to absorb a new document into itself. */
  static async load(db: LibraryDb | null, projectId: string, county: string): Promise<ProjectLibrary> {
    const lib = new ProjectLibrary(projectId, county);
    if (!db) return lib;

    try {
      const { data, error } = await db
        .from('research_documents')
        .select(
          'id, identity_key, content_sha256, document_label, recording_info, original_filename, ' +
          'recorded_date, storage_path, research_run_id, run_seen_count, harvest_metadata, duplicate_of',
        )
        .eq('research_project_id', projectId);
      // ── EVERY ROW, INCLUDING THE ONES THE APP HAS MARKED AS DUPLICATES ───────────────────────
      //
      // This used to load only rows with `duplicate_of` null. The review page's duplicate merge
      // marks the older copies of a document as duplicates of a canonical row — and once it had,
      // the library could no longer see them, so the next run found nothing held and filed the
      // document again, and the page merged again. Plat 1982002520 was on file four times by run
      // 6 (2026-09-04), every copy but the newest marked a duplicate. A marked copy is still
      // evidence that the project holds the document; a match on it merges onto the canonical.

      if (error) {
        console.warn(`[library] ${projectId}: could not read the project library — ${error.message}`);
        return lib;
      }

      for (const row of data ?? []) lib.adopt(row);
    } catch (err) {
      console.warn(
        `[library] ${projectId}: could not read the project library — ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return lib;
  }

  private adopt(row: Record<string, unknown>): void {
    const stored = typeof row.identity_key === 'string' && row.identity_key ? row.identity_key : null;
    const ref = refFromRow(row, this.county);
    const derived = stored ?? identityKey(ref);

    const canonical = typeof row.duplicate_of === 'string' && row.duplicate_of ? row.duplicate_of : row.id;
    const entry: LibraryEntry = {
      // A copy the app marked as a duplicate answers for its canonical row: merges land there.
      id: String(canonical),
      identityKey: derived,
      contentSha256: typeof row.content_sha256 === 'string' ? row.content_sha256 : null,
      documentLabel: (row.document_label as string) ?? null,
      recordingInfo: (row.recording_info as string) ?? null,
      storagePath: (row.storage_path as string) ?? null,
      runId: (row.research_run_id as string) ?? null,
      runSeenCount: Number(row.run_seen_count ?? 1),
      ref,
    };

    this.entries.push(entry);
    this.summary.loaded += 1;
    if (derived) {
      this.summary.identified += 1;
      if (!stored) this.summary.reconstructed += 1;
      // First writer wins. The oldest row is the one other tables already reference
      // (extracted_data_points.document_id, annotations), so keeping it is also the choice that
      // breaks nothing downstream.
      if (!this.byIdentity.has(derived)) this.byIdentity.set(derived, entry);
    } else {
      this.summary.unidentifiable += 1;
    }
    if (entry.contentSha256 && !this.byContent.has(entry.contentSha256)) {
      this.byContent.set(entry.contentSha256, entry);
    }
    // Only a path that names a FILE. `artifact-uploader` writes a directory prefix
    // (`${projectId}/artifacts/${category}/`) on some rows, and every document in a category shares
    // it — matching on that would merge unrelated documents, which is the one failure this whole
    // module is built to avoid.
    if (entry.storagePath && !entry.storagePath.endsWith('/') && !this.byStoragePath.has(entry.storagePath)) {
      this.byStoragePath.set(entry.storagePath, entry);
    }
  }

  /** Record a row this run just wrote, so the rest of the run can see it. */
  register(entry: Omit<LibraryEntry, 'ref'> & { ref?: DocumentRef }): void {
    const full: LibraryEntry = { ...entry, ref: entry.ref ?? { county: this.county } };
    this.entries.push(full);
    if (full.identityKey && !this.byIdentity.has(full.identityKey)) this.byIdentity.set(full.identityKey, full);
    if (full.contentSha256 && !this.byContent.has(full.contentSha256)) this.byContent.set(full.contentSha256, full);
    if (full.storagePath && !full.storagePath.endsWith('/') && !this.byStoragePath.has(full.storagePath)) {
      this.byStoragePath.set(full.storagePath, full);
    }
  }

  /**
   * Have we got this one?
   *
   * Checks run strongest-evidence-first, and each verdict carries a sentence explaining itself —
   * the owner asked for "a very clear and detailed check", and a duplicate that cannot say why it
   * was called a duplicate is not reviewable.
   */
  classify(candidate: LibraryCandidate): LibraryVerdict {
    // 1. Identical bytes. Nothing beats this, and it needs no citation to work — which is exactly
    //    why it catches the re-taken screenshots that carry no instrument number at all.
    if (candidate.contentSha256) {
      const same = this.byContent.get(candidate.contentSha256);
      if (same) {
        return {
          kind: 'same-bytes',
          existingId: same.id,
          reason:
            `Byte-for-byte identical to a document this project already holds ` +
            `(${same.documentLabel ?? same.id}). Same SHA-256, so it is the same file whatever the ` +
            `two sources call it.`,
        };
      }
    }

    // 1b. Same stored object. The uploader overwrites in place (`upsert: true`) and then inserts a
    //     second row pointing at the same object — 53 of the 78 duplicates measured in production.
    //     A directory prefix is never a match: every document in a category shares one.
    if (candidate.storagePath && !candidate.storagePath.endsWith('/')) {
      const samePath = this.byStoragePath.get(candidate.storagePath);
      if (samePath) {
        return {
          kind: 'same-bytes',
          existingId: samePath.id,
          reason:
            `Writes to the same stored object as a document this project already holds ` +
            `(${candidate.storagePath}). The uploader overwrites in place, so a second row here would ` +
            `be two records of one file.`,
        };
      }
    }

    const ref: DocumentRef = {
      county: candidate.county || this.county,
      instrumentNumber:
        candidate.instrumentNumber ??
        instrumentFromText(candidate.recordingInfo, candidate.documentLabel),
      recordingDate: candidate.recordingDate,
      book: candidate.book,
      page: candidate.page,
      vendor: candidate.vendor,
    };
    const key = identityKey(ref);

    // 2. Same citation. The cross-vendor identity model's own answer.
    if (key) {
      const held = this.byIdentity.get(key);
      if (held) {
        return {
          kind: 'already-held',
          existingId: held.id,
          identityKey: key,
          reason:
            `Already held — same county, instrument and recording date (${key}). This run found it ` +
            `again, which is an observation about the sources, not a new document.`,
        };
      }
    }

    // 3. A near miss worth flagging. We still write it: a document is never dropped on a maybe.
    //
    // ONLY for a candidate that carries something to compare. `compareDocuments` answers
    // `uncertain` whenever ONE side cannot be keyed — a rule written for the purchase path, where
    // "uncertain" correctly means "buy it". In THIS path "uncertain" became `possible-duplicate`,
    // so every aerial, GIS screenshot and capture (none of which has an instrument number) was
    // flagged as a possible duplicate of the project's first identified deed, written with
    // `duplicate_of` set, hidden from the run view, excluded from the next run's library, and
    // filed and flagged again on every run after. Found by the 2026-09-03 platform audit (CS-1).
    // A candidate with no identifier at all is what branch 4 below is for.
    const comparable = Boolean(ref.instrumentNumber || (ref.book && ref.page));
    for (const held of comparable ? this.entries : []) {
      if (!held.identityKey && !held.ref.instrumentNumber) continue;
      const verdict = compareDocuments(ref, held.ref);
      if (verdict.kind === 'uncertain') {
        return {
          kind: 'possible-duplicate',
          existingId: held.id,
          identityKey: key,
          reason:
            `Possibly the same document as "${held.documentLabel ?? held.id}", but not certainly: ` +
            `${verdict.reason} Filed anyway and flagged — a document is never dropped on a maybe.`,
        };
      }
    }

    return {
      kind: 'new',
      identityKey: key,
      reason: key
        ? `Not held — no document in this project matches ${key}.`
        : `Not held, and not identifiable (no readable recording date, or neither an instrument ` +
          `number nor a book/page). Filed as new: an unidentifiable document must never be merged ` +
          `into something it might not be.`,
    };
  }

  /** The index the purchase path consults, seeded from the WHOLE project rather than from this
   *  run's free harvest alone.
   *
   *  This is what stops a re-run paying a second time for a document run 1 already bought. The
   *  purchase path's own asymmetry is unchanged — an uncertain match still buys. */
  toDocumentIndex(cost: SourceCost = 'free'): DocumentIndex {
    const index = new DocumentIndex();
    for (const e of this.entries) {
      if (!e.identityKey) continue;
      index.register(e.ref, cost);
    }
    return index;
  }

  get stats(): LibrarySummary { return { ...this.summary }; }
  get size(): number { return this.entries.length; }

  /** The live entry for a row id, or undefined.
   *
   *  Returns the entry itself and not a copy: the caller increments `runSeenCount` on it so the
   *  rest of the run sees the updated figure. Supabase-js has no atomic increment, so the in-memory
   *  count is what keeps a document found three times in one run from being recorded as found
   *  twice, three separate times. */
  entryById(id: string): LibraryEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** A sentence a run can put in its log and its report. */
  describe(): string {
    const s = this.summary;
    const parts = [
      `Project library: ${s.loaded} document(s) already held, ${s.identified} of them identifiable.`,
    ];
    if (s.reconstructed > 0) {
      parts.push(
        `${s.reconstructed} had their identity reconstructed from the recording reference because ` +
          `they predate identity tracking.`,
      );
    }
    if (s.unidentifiable > 0) {
      parts.push(
        `${s.unidentifiable} could not be identified at all and so cannot prevent a duplicate — ` +
          `anything matching them will be filed again.`,
      );
    }
    return parts.join(' ');
  }
}

/** Normalise a county name the same way identity does, exported so callers do not re-implement it. */
export { normaliseCounty };
