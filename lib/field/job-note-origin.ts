// lib/field/job-note-origin.ts — where a job note was written, and how to say it.
//
// Owner, 2026-08-16: *"Job note entries should be recorded and should display who posted it to the
// job, from where and the date and time."*
//
// ── WHY THIS NEEDED NO MIGRATION ────────────────────────────────────────────────────────────────
//
// The obvious move is a new `source_surface` column. `fieldbook_notes` already has the mechanism:
// `context_type`, `context_label` and `page_url`, which is exactly what `FieldbookButton` stamps
// when somebody takes a note from a lesson page. Adding a second, parallel way to record the same
// fact is the mistake C44z spent a slice declining to make — and there the "collision" turned out
// to be a migration nobody had run, not a design that needed replacing.
//
// So an origin is `context_type` plus a human label, and the vocabulary lives here rather than as
// string literals scattered across a route, a panel and a mobile app.
//
// ── THE INFERENCE, AND WHY IT IS NOT A GUESS ────────────────────────────────────────────────────
//
// Notes written before today have no `context_type`, and the mobile app does not set one — it syncs
// rows straight into the table. Showing "Unknown" for every note the crew has ever taken would be
// honest and useless.
//
// Two columns already answer the question for those rows, because only one client can produce them:
//
//   * `data_point_id` — a note attached to a survey shot. Only the field app can attach one; the
//     office has no shot to attach to at the moment of writing.
//   * `note_template` — 'offset_shot', 'monument_found', 'hazard'. These are the structured field
//     templates from the mobile plan; nothing in the web app offers them.
//
// That is an inference from *what could have written this row*, not from what seems likely, which
// is why it is safe. Anything left over reports **"Origin not recorded"** rather than being
// assigned a plausible home — a wrong origin on an audit line is worse than an absent one, because
// nobody re-checks a field that looks filled in.

/** The origins this system can actually distinguish. */
export type JobNoteOrigin =
  | 'office_job_page'
  | 'field_app_point'
  | 'field_app'
  | 'fieldbook'
  | 'unknown';

/** `context_type` values written by our own surfaces. Kept as constants so a route and a panel
 *  cannot disagree about the spelling — the failure mode that made `distanceSource` worth a rule. */
export const JOB_NOTE_CONTEXT_OFFICE = 'job_office';
export const JOB_NOTE_CONTEXT_FIELD = 'job_field';

export interface OriginInput {
  context_type?: string | null;
  context_label?: string | null;
  page_url?: string | null;
  data_point_id?: string | null;
  note_template?: string | null;
}

/**
 * Where a note came from.
 *
 * An explicit `context_type` always wins: a row that says where it came from is not second-guessed,
 * even if its other columns would suggest otherwise. The inference is only for rows that never
 * recorded one.
 */
export function jobNoteOrigin(note: OriginInput): JobNoteOrigin {
  const ctx = note.context_type?.trim();
  if (ctx === JOB_NOTE_CONTEXT_OFFICE) return 'office_job_page';
  if (ctx === JOB_NOTE_CONTEXT_FIELD) return 'field_app';
  // A lesson-page note that was later attached to a job, or any other fieldbook context.
  if (ctx) return 'fieldbook';

  // Inference, in order of how much each column narrows it down.
  if (note.data_point_id) return 'field_app_point';
  if (note.note_template) return 'field_app';
  return 'unknown';
}

/** A short phrase for the note card. Sentence case, because it sits in a metadata line. */
export function describeJobNoteOrigin(origin: JobNoteOrigin): string {
  switch (origin) {
    case 'office_job_page': return 'Office — job page';
    case 'field_app_point': return 'Field app — at a survey point';
    case 'field_app':       return 'Field app';
    case 'fieldbook':       return 'Fieldbook';
    // Deliberately not "Unknown": that reads like a failure to look it up, when the truth is that
    // the note predates origin tracking and there is nothing to find.
    case 'unknown':         return 'Origin not recorded';
  }
}

/**
 * Everything the office surface stamps when it creates a note.
 *
 * Built here and applied on the SERVER rather than sent by the browser. Origin is an audit field:
 * a client that asserts its own is a client that can assert somebody else's, and the same reasoning
 * kept `distanceSource` from being taken on trust in C0b1.
 */
export function officeJobNoteContext(jobId: string): {
  context_type: string;
  context_label: string;
  page_url: string;
} {
  return {
    context_type: JOB_NOTE_CONTEXT_OFFICE,
    context_label: 'Job page — Field Work',
    page_url: `/admin/jobs/${jobId}/field`,
  };
}
